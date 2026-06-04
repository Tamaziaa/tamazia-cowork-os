'use strict';
// P3.1/3.2b/3.2c/3.2d/3.3/3.4/3.5 multi-sample GEO probe on the shared free-LLM fallback chain (Groq->NIM->Gemini),
// so it never dies on one provider's rate limit. Asks the buyer query N times -> share-of-voice (how often YOU
// appear), repeatability (which rivals come up every time), top-3 leaders. Adds a Gemini Google-grounded layer
// (real cited sources) when that free quota is available, and checks whether your domain is among them.
const { askLLM, askGeminiGrounded } = require('./llm.js');
const AGG = /(yell|yelp|tripadvisor|trustpilot|clutch|glassdoor|indeed|linkedin|facebook|instagram|wikipedia|gov\.|\.gov|reddit|quora|legal500|chambers|google|bing|youtube)/i;
function _parseNames(text) {
  return String(text || '').split(/[\n,;]+/).map(s => s.replace(/^\s*\d+[).\s]*/, '').replace(/^[-*\s]+/, '').replace(/\*\*/g, '').trim())
    .filter(x => x && x.length > 1 && x.length < 60 && !/^(here|the|top|firms?|providers?|sure|certainly|some|popular|based|when|for|in|i\b)/i.test(x) && !AGG.test(x));
}
function _norm(s) { return String(s || '').toLowerCase().replace(/\b(llp|ltd|limited|inc|plc|& co|and co|solicitors|law firm|associates|group)\b/g, '').replace(/[^a-z0-9]/g, '').trim(); }

async function geoProbe({ query, company, domain, env = process.env, samples = 2 } = {}) {
  if (!query) return { ok: false, reason: 'no_query' };
  const prompt = 'A buyer asks for the best providers for "' + query + '". List the top 6 specific firms or providers by name. Reply as a plain comma-separated list of names only.';
  const runs = []; let provider = null;
  for (let i = 0; i < samples; i++) {
    const r = await askLLM(prompt, { temperature: 0.5, maxTokens: 220 }, env);
    provider = provider || r.provider;
    const names = _parseNames(r.text);
    if (names.length) runs.push(names);
  }
  // B3 resilience: if every sample came back empty (transient provider rate-limit), retry one more round
  // before giving up, so a recoverable blip doesn't zero the whole GEO section.
  if (!runs.length) {
    for (let i = 0; i < samples; i++) {
      const r = await askLLM(prompt, { temperature: 0.5, maxTokens: 220 }, env);
      provider = provider || r.provider;
      const names = _parseNames(r.text);
      if (names.length) runs.push(names);
    }
  }
  // P3.2b/3.2c: real Google-grounded citation layer (graceful — null when Gemini quota exhausted)
  let grounded = null;
  try {
    const g = await askGeminiGrounded('Who are the best providers for "' + query + '"? Name specific firms.', env);
    if (g && g.sources && g.sources.length) {
      const dom = String(domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*/, '').toLowerCase();
      const cited = g.sources.map(s => { try { return new URL(s.uri).hostname.replace(/^www\./, ''); } catch (_e) { return ''; } }).filter(Boolean);
      grounded = { sources: g.sources.slice(0, 8), source_domains: cited.slice(0, 8), you_cited: dom ? cited.some(h => h.includes(dom) || dom.includes(h)) : null };
    }
  } catch (_e) {}
  if (!runs.length && !grounded) return { ok: false, reason: 'all_providers_unavailable' };
  const N = runs.length || 1;
  const firmKey = _norm(company);
  const firmAppears = runs.filter(r => r.some(n => firmKey && (_norm(n).includes(firmKey) || firmKey.includes(_norm(n))))).length;
  const freq = {};
  runs.forEach(r => { const seen = new Set(); r.forEach(n => { const k = _norm(n); if (!k || (firmKey && (k.includes(firmKey) || firmKey.includes(k)))) return; if (seen.has(k)) return; seen.add(k); freq[k] = freq[k] || { name: n, count: 0 }; freq[k].count++; }); });
  const ranked = Object.values(freq).sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, 3).map(c => ({ name: c.name, in_runs: c.count, of: N }));
  const sov = runs.length ? Math.round(100 * firmAppears / N) : null;
  const repeatability = ranked.length ? Math.round(100 * ranked[0].count / N) : 0;
  let finding = null;
  if (runs.length && firmAppears < N) {
    finding = {
      bucket: 'ai_visibility', severity: firmAppears === 0 ? 'P1' : 'P2', rule_type: 'observed', kind: 'observed',
      citation: 'AI share of voice', framework_short: 'GEO', citation_url: '',
      metric: { label: 'AI share of voice', you: sov, scale: 100, samples: N, competitors: top },
      fact: 'Asked "' + query + '" ' + N + ' time' + (N === 1 ? '' : 's') + ', an AI engine named you in ' + firmAppears + ' of ' + N + ' answer' + (N === 1 ? '' : 's') + (top.length ? '; it named ' + top.map(c => c.name + ' (' + c.in_runs + '/' + N + ')').join(', ') : '') + '.',
      layman_explanation: 'AI answers vary run to run, so we asked ' + N + ' time' + (N === 1 ? '' : 's') + ' (via ' + (provider || 'a free AI model') + '). ' + (firmAppears === 0 ? 'You were never named' : 'You appeared only ' + firmAppears + ' of ' + N + ' times') + ', while ' + (top[0] ? top[0].name + ' appeared ' + top[0].in_runs + ' of ' + N : 'your competitors appeared') + '. The firms named every time are the ones AI now treats as the default answer for your buyers, compounding while you are absent.' + (grounded && grounded.you_cited === false ? ' Google’s own grounded answer for this query cited ' + grounded.source_domains.slice(0, 3).join(', ') + ' and not you.' : ''),
      tamazia_fix_short: 'Tamazia builds the entity, content and authority signals that get you named consistently when buyers ask AI for a provider like you.',
      evidence_quote: 'you ' + firmAppears + '/' + N + ' vs ' + (top[0] ? top[0].name + ' ' + top[0].in_runs + '/' + N : 'competitors') + (grounded ? ' · grounded sources: ' + grounded.source_domains.slice(0, 3).join(', ') : ''),
      evidence: 'multi-sample AI probe (' + N + ' runs · ' + (provider || 'free LLM') + ')' + (grounded ? ' + Gemini Google-grounded citations' : ''), fine_low_gbp: null, fine_high_gbp: null,
    };
  }
  return { ok: true, provider, samples: N, firm_appears: firmAppears, share_of_voice: sov, repeatability, top_competitors: top, grounded, finding };
}
module.exports = { geoProbe };
