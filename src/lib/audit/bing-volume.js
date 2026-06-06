'use strict';
// §3 — Bing Webmaster GetKeywordStats: free keyword search-volume for ARBITRARY keywords (works cold at mint-time).
// Returns a monthly-volume proxy (avg of recent weekly impression points) or null. Needs BING_WEBMASTER_KEY;
// without it (the current £0 config) every call no-ops and the keyword block ships volume-less, exactly as today.
// One call per keyword, cached per (keyword,country) in Neon like the SERP cache. Fail-open on no key / 429 / empty.
const https = require('https');
let _cache = null; try { _cache = require('../../skills/S008-personalisation-engine/lib/http.js'); } catch (_e) {}

const _mem = new Map();
const COUNTRY = { UK: 'gb', GB: 'gb', US: 'us', USA: 'us', AE: 'ae', UAE: 'ae', SA: 'sa', QA: 'qa', FR: 'fr', DE: 'de', ES: 'es', IT: 'it' };
const LANG = { gb: 'en-GB', us: 'en-US', ae: 'en-AE', sa: 'en-SA', qa: 'en-QA', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT' };

function _key(env) { env = env || process.env; return env.BING_WEBMASTER_KEY || env.BING_API_KEY || env.BING_KEY || ''; }

function _get(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs || 12000 }, (res) => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { if (res.statusCode !== 200) return resolve(null); try { resolve(JSON.parse(b)); } catch (_e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// keywordVolume(keyword, country, env) → integer monthly-volume proxy | null
async function keywordVolume(keyword, country = 'UK', env = process.env) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return null;
  const key = _key(env); if (!key) return null;
  const cc = COUNTRY[String(country).toUpperCase()] || 'gb';
  const ck = 'bingvol|' + cc + '|' + kw;
  if (_mem.has(ck)) return _mem.get(ck);
  // Neon cache (shared across audits in the same country)
  if (_cache && _cache.getCached) { try { const c = _cache.getCached({ domain: ck, scanner: 'bing_kw_v1', max_age_seconds: 30 * 86400 }); if (c && c.payload && c.payload.volume != null) { _mem.set(ck, c.payload.volume); return c.payload.volume; } } catch (_e) {} }

  const url = 'https://ssl.bing.com/webmaster/api.svc/json/GetKeywordStats?q=' + encodeURIComponent(kw) +
    '&country=' + encodeURIComponent(cc) + '&language=' + encodeURIComponent(LANG[cc] || 'en-GB') + '&apikey=' + encodeURIComponent(key);
  const j = await _get(url);
  // Response shape: { d: [ { Query, Date, Broad, Phrase, ... } , ... ] }  (weekly points, oldest→newest)
  let vol = null;
  const rows = (j && (j.d || j.D)) || null;
  if (Array.isArray(rows) && rows.length) {
    const recent = rows.slice(-8);                                  // last ~8 weekly points
    const vals = recent.map(r => Number(r && (r.Broad != null ? r.Broad : r.Phrase))).filter(n => Number.isFinite(n) && n >= 0);
    if (vals.length) vol = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);   // avg weekly ≈ monthly impression proxy
  }
  _mem.set(ck, vol);
  if (vol != null && _cache && _cache.writeCache) { try { _cache.writeCache({ domain: ck, scanner: 'bing_kw_v1', payload: { volume: vol }, ttl_seconds: 30 * 86400 }); } catch (_e) {} }
  return vol;
}

function enabled(env) { return !!_key(env); }

module.exports = { keywordVolume, enabled };
