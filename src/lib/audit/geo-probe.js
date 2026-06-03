'use strict';
// P3.1/P3.3/P3.4/P3.5 multi-sample GEO probe. Asks a free LLM the real buyer question N times and aggregates:
// repeatability (do the same firms come up every time?), share-of-voice (how often the firm itself appears),
// and the entrenched leaders. This is the "we asked an AI engine 5 times for a provider like you; you were named
// 0 times, these 3 firms every time" insight. Free (Groq primary, NIM fallback), no quota dependency on Gemini.
const https = require('https');
const AGG = /(yell|yelp|tripadvisor|trustpilot|clutch|glassdoor|indeed|linkedin|facebook|instagram|wikipedia|gov\.|\.gov|reddit|quora|legal500|chambers|google|bing)/i;

function _llm({ key, url, model, prompt, temperature }) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: 300 });
    const u = new URL(url);
    const req = https.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, timeout: 12000 }, (r) => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const j = JSON.parse(b); resolve((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''); } catch (_e) { resolve(''); } });
    });
    req.on('error', () => resolve('')); req.on('timeout', () => { req.destroy(); resolve(''); });
    req.write(body); req.end();
  });
}
function _parseNames(text) {
  return String(text || '').split(/[\n,;]+/).map(s => s.replace(/^\s*\d+[).\s]*/, '').replace(/^[-*\s]+/, '').replace(/\*\*/g, '').trim())
    .filter(x => x && x.length > 1 && x.length < 60 && !/^(here|the|top|firms?|providers?|sure|certainly|some|popular|based|when|for|in)\b/i.test(x) && !AGG.test(x));
}
function _norm(s) { return String(s || '').toLowerCase().replace(/\b(llp|ltd|limited|inc|plc|& co|and co|solicitors|law firm|associates|group)\b/g, '').replace(/[^a-z0-9]/g, '').trim(); }

async function geoProbe({ query, company, env = process.env, samples = 3 } = {}) {
  if (!query) return { ok: false, reason: 'no_query' };
  const groq = env.GROQ_API_KEY, nim = env.NIM_API_KEY;
  const cfg = groq ? { key: groq, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' }
    : nim ? { key: nim, url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.3-70b-instruct' } : null;
  if (!cfg) return { ok: false, reason: 'no_llm_key' };
  const prompt = 'A buyer asks for the best providers for "' + query + '". List the top 6 specific firms or providers by name. Reply as a plain comma-separated list of names only.';
  const runs = [];
  for (let i = 0; i < samples; i++) {
    let names = _parseNames(await _llm({ ...cfg, prompt, temperature: 0.5 })); // temp>0 so samples vary, exposing (in)stability
    if (!names.length) names = _parseNames(await _llm({ ...cfg, prompt, temperature: 0.4 })); // one retry on an empty/refused run
    if (names.length) runs.push(names);
  }
  if (!runs.length) return { ok: false, reason: 'no_runs' };
  const N = runs.length;
  const firmKey = _norm(company);
  const firmAppears = runs.filter(r => r.some(n => firmKey && (_norm(n).includes(firmKey) || firmKey.includes(_norm(n))))).length;
  // competitor frequency across runs
  const freq = {};
  runs.forEach(r => { const seen = new Set(); r.forEach(n => { const k = _norm(n); if (!k || (firmKey && (k.includes(firmKey) || firmKey.includes(k)))) return; if (seen.has(k)) return; seen.add(k); freq[k] = freq[k] || { name: n, count: 0 }; freq[k].count++; }); });
  const ranked = Object.values(freq).sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, 3).map(c => ({ name: c.name, in_runs: c.count, of: N }));
  const sov = Math.round(100 * firmAppears / N);                 // share of voice: how often YOU appear
  const repeatability = ranked.length ? Math.round(100 * ranked[0].count / N) : 0; // how entrenched the top rival is
  let finding = null;
  if (firmAppears < N) {
    finding = {
      bucket: 'ai_visibility', severity: firmAppears === 0 ? 'P1' : 'P2', rule_type: 'observed', kind: 'observed',
      citation: 'AI share of voice', framework_short: 'GEO', citation_url: '',
      metric: { label: 'AI share of voice', you: sov, scale: 100, samples: N, competitors: top },
      fact: 'Asked "' + query + '" ' + N + ' time' + (N === 1 ? '' : 's') + ', an AI engine named you in ' + firmAppears + ' of ' + N + ' answer' + (N === 1 ? '' : 's') + (top.length ? '; it named ' + top.map(c => c.name + ' (' + c.in_runs + '/' + N + ')').join(', ') : '') + '.',
      layman_explanation: 'AI answers vary run to run, so we asked ' + N + ' time' + (N === 1 ? '' : 's') + '. ' + (firmAppears === 0 ? 'You were never named' : 'You appeared only ' + firmAppears + ' of ' + N + ' times') + ', while ' + (top[0] ? top[0].name + ' appeared ' + top[0].in_runs + ' of ' + N : 'your competitors appeared') + '. The firms named every time are the ones AI now treats as the default answer for your buyers, and that is compounding while you are absent.',
      tamazia_fix_short: 'Tamazia builds the entity, content and authority signals that get you named consistently when buyers ask AI for a provider like you.',
      evidence_quote: 'you ' + firmAppears + '/' + N + ' vs ' + (top[0] ? top[0].name + ' ' + top[0].in_runs + '/' + N : 'competitors'),
      evidence: 'multi-sample AI probe (' + N + ' runs)', fine_low_gbp: null, fine_high_gbp: null,
    };
  }
  return { ok: true, samples: N, firm_appears: firmAppears, share_of_voice: sov, repeatability, top_competitors: top, finding };
}
module.exports = { geoProbe };
