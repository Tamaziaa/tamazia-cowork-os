'use strict';
// P3.1/3.2b/3.2c/3.2d/3.3/3.4/3.5 multi-sample GEO probe on the shared free-LLM fallback chain (Groq->NIM->Gemini),
// so it never dies on one provider's rate limit. Asks the buyer query N times -> share-of-voice (how often YOU
// appear), repeatability (how many of N runs named the firm), top-3 leaders. Adds a Gemini Google-grounded layer
// (real cited sources) when that free quota is available, and checks whether your domain is among them.
//
// STABILITY (2026-06-07): the SoV signal used to swing 0<->100 between mints because it took 2 noisy samples at
// temperature 0.5 and reported a single fraction. Now:
//   - >=5 samples (GEO_PROBE_SAMPLES, default 5), temperature 0 + fixed seed where the provider supports it
//   - per-provider cited-fraction, SoV = median across providers (integer, clamped 0-100)
//   - 7-day per-domain file cache ON BY DEFAULT at .cache/geo (override GEO_CACHE_DIR, disable with GEO_CACHE_DIR='', bypass once with GEO_FORCE=1)
//   - total deadline (GEO_PROBE_DEADLINE_MS, default 60s) so a rate-limited provider can never hang the mint
const { askLLM, askGeminiGrounded } = require('./llm.js');
const AGG = /(yell|yelp|tripadvisor|trustpilot|clutch|glassdoor|indeed|linkedin|facebook|instagram|wikipedia|gov\.|\.gov|reddit|quora|legal500|chambers|google|bing|youtube)/i;
function _parseNames(text) {
  return String(text || '').split(/[\n,;]+/).map(s => s.replace(/^\s*\d+[).\s]*/, '').replace(/^[-*\s]+/, '').replace(/\*\*/g, '').trim())
    .filter(x => x && x.length > 1 && x.length < 60 && !/^(here|the|top|firms?|providers?|sure|certainly|some|popular|based|when|for|in|i\b)/i.test(x) && !AGG.test(x));
}
function _norm(s) { return String(s || '').toLowerCase().replace(/\b(llp|ltd|limited|inc|plc|& co|and co|solicitors|law firm|associates|group)\b/g, '').replace(/[^a-z0-9]/g, '').trim(); }
function _median(arr) { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function _clamp01_100(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function _cacheFile(env, domain, query) {
  const dir = env.GEO_CACHE_DIR || '.cache/geo'; if (env.GEO_CACHE_DIR === '') return null;
  const crypto = require('crypto');
  const key = _norm(domain) + '-' + crypto.createHash('sha1').update(String(query || '')).digest('hex').slice(0, 10);
  return require('path').join(dir, key + '.json');
}
function _cacheRead(env, domain, query) {
  try {
    if (env.GEO_FORCE === '1') return null;
    const f = _cacheFile(env, domain, query); if (!f) return null;
    const fs = require('fs'); if (!fs.existsSync(f)) return null;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const ttlDays = parseFloat(env.GEO_CACHE_TTL_DAYS || '7');
    if (!j._cached_at || (Date.now() - j._cached_at) > ttlDays * 86400000) return null;
    return j;
  } catch (_e) { return null; }
}
function _cacheWrite(env, domain, query, result) {
  try {
    const f = _cacheFile(env, domain, query); if (!f) return;
    const fs = require('fs'); fs.mkdirSync(require('path').dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(Object.assign({ _cached_at: Date.now() }, result)));
  } catch (_e) {}
}

async function geoProbe({ query, company, domain, env = process.env, samples = null } = {}) {
  if (!query) return { ok: false, reason: 'no_query' };
  const N_TARGET = Math.max(1, samples || parseInt(env.GEO_PROBE_SAMPLES || '5', 10));
  const DEADLINE = Date.now() + parseInt(env.GEO_PROBE_DEADLINE_MS || '60000', 10);
  const cached = _cacheRead(env, domain, query);
  if (cached) return Object.assign({ from_cache: true }, cached);
  const prompt = 'A buyer asks for the best providers for "' + query + '". List the top 6 specific firms or providers by name. Reply as a plain comma-separated list of names only.';
  const runs = []; // [{ names: [...], provider }]
  const opts = { temperature: 0, seed: 42, maxTokens: 220 };
  for (let i = 0; i < N_TARGET && Date.now() < DEADLINE; i++) {
    const r = await askLLM(prompt, opts, env);
    const names = _parseNames(r.text);
    if (names.length) runs.push({ names, provider: r.provider || 'unknown' });
  }
  // B3 resilience: if every sample came back empty (transient provider rate-limit), retry one more round
  // within the deadline, so a recoverable blip doesn't zero the whole GEO section.
  if (!runs.length) {
    for (let i = 0; i < N_TARGET && Date.now() < DEADLINE; i++) {
      const r = await askLLM(prompt, opts, env);
      const names = _parseNames(r.text);
      if (names.length) runs.push({ names, provider: r.provider || 'unknown' });
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
  const provider = runs.length ? runs[0].provider : null;
  const firmKey = _norm(company);
  const _hit = (r) => r.names.some(n => firmKey && firmKey.length >= 6 && _norm(n).includes(firmKey));
  const firmAppears = runs.filter(_hit).length;
  // SoV = median of per-provider cited fractions (single-provider chains degrade to the plain fraction)
  const byProvider = {};
  runs.forEach(r => { (byProvider[r.provider] = byProvider[r.provider] || []).push(_hit(r) ? 1 : 0); });
  const fractions = Object.values(byProvider).map(hits => 100 * hits.reduce((a, b) => a + b, 0) / hits.length);
  const sov = runs.length ? _clamp01_100(_median(fractions)) : null;
  const providers_used = Object.keys(byProvider);
  const freq = {};
  runs.forEach(r => { const seen = new Set(); r.names.forEach(n => { const k = _norm(n); if (!k || (firmKey && (k.includes(firmKey) || firmKey.includes(k)))) return; if (seen.has(k)) return; seen.add(k); freq[k] = freq[k] || { name: n, count: 0 }; freq[k].count++; }); });
  const ranked = Object.values(freq).sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, 3).map(c => ({ name: c.name, in_runs: c.count, of: N }));
  // repeatability = how many of the N runs named the firm (the render's "named X of N runs" line)
  const repeatability = firmAppears;
  const competitor_consistency = ranked.length ? Math.round(100 * ranked[0].count / N) : 0;
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
  const result = { ok: true, provider, providers_used, samples: N, firm_appears: firmAppears, share_of_voice: sov, repeatability, competitor_consistency, top_competitors: top, grounded, finding };
  _cacheWrite(env, domain, query, result);
  return result;
}
module.exports = { geoProbe };
