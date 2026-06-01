// HTTP fetcher with scanner_cache integration + polite UA + retry/backoff
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

// Realistic desktop Chrome so UA-sniffing sites serve real HTML.
// Backtest-proven: pwc.co.uk + premierinn.com return 403/timeout to a bot UA but 200 to this profile.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// Anti-bot challenge signatures (Cloudflare Under-Attack/Turnstile, Akamai, PerimeterX, DataDome, Incapsula).
// A challenged page is HTTP 403/503 with a tiny JS-only body; it must NOT be treated as real content.
const CHALLENGE_HARD_RX = /cf-browser-verification|challenge-platform|_cf_chl_|__cf_chl|px-captcha|datadome|imperva|_incapsula_|distil_r_captcha|hcaptcha\.com\/captcha/i; // unambiguous WAF markers
const CHALLENGE_SOFT_RX = /just a moment\.\.\.|enable javascript and cookies|attention required|access denied|please enable (?:js|javascript|cookies)|verifying you are human|checking your browser|are you a robot/i;
function detectChallenge(status, body) {
  const b = String(body || '');
  if (CHALLENGE_HARD_RX.test(b)) return true;                       // any size: these strings only appear on challenge pages
  if (b.length < 20000 && CHALLENGE_SOFT_RX.test(b)) return true;   // a real article using these words is far larger
  if ((status === 403 || status === 503) && b.length < 1500) return true; // tiny forbidden body = block
  return false;
}
const RETRYABLE = new Set([403, 408, 425, 429, 500, 502, 503, 520, 522, 524]);

async function fetchWithRetry(url, opts = {}) {
  const max = (opts.retries === undefined ? 2 : opts.retries);
  const timeout = opts.timeout || 15000;
  let lastErr = null, last = null;
  for (let i = 0; i <= max; i++) {
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      // 2nd attempt onward: present as a Google referral (some WAFs gate on navigation context).
      const profile = i === 0 ? BROWSER_HEADERS : { ...BROWSER_HEADERS, 'Sec-Fetch-Site': 'cross-site', 'Referer': 'https://www.google.com/' };
      const res = await fetch(url, { redirect: 'follow', ...opts, headers: { ...profile, ...(opts.headers || {}) }, signal: ctl.signal });
      clearTimeout(timer);
      const ms = Date.now() - t0;
      const body = opts.binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      const challenge = !opts.binary && detectChallenge(res.status, body);
      last = { ok: (res.ok && !challenge), status: res.status, body, headers: Object.fromEntries(res.headers.entries()), fetch_ms: ms, challenge };
      if ((RETRYABLE.has(res.status) || challenge) && i < max) { await new Promise(r => setTimeout(r, 500 * (i + 1))); continue; }
      return last;
    } catch (e) {
      lastErr = e.message || String(e);
      if (i < max) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  if (last) return last;
  return { ok: false, status: 0, body: '', headers: {}, fetch_ms: 0, error: lastErr };
}

// Cache helpers
function getCached({ domain, scanner, max_age_seconds }) {
  const sql = `SELECT id, payload, scanned_at, EXTRACT(EPOCH FROM (NOW() - scanned_at))::int AS age
               FROM scanner_cache WHERE domain='${domain.replace(/'/g, "''")}' AND scanner='${scanner.replace(/'/g, "''")}'
               ORDER BY scanned_at DESC LIMIT 1`;
  const raw = pg(sql);
  if (!raw) return null;
  const [id, payload, scanned_at, age] = raw.split('\t');
  const cap = (max_age_seconds === undefined || max_age_seconds === null) ? 86400 : max_age_seconds;
  if (cap <= 0 || Number(age) > cap) return null;
  try { return { id: Number(id), scanned_at, age: Number(age), payload: JSON.parse(payload) }; } catch (_e) { return null; }
}

function writeCache({ domain, scanner, payload, fetch_ms, http_status, error, ttl_seconds }) {
  const dom = String(domain || '').toLowerCase().replace(/'/g, "''");
  const sc  = String(scanner).replace(/'/g, "''");
  const blob = JSON.stringify(payload || {}).replace(/'/g, "''");
  const err = error ? `'${String(error).replace(/'/g, "''").slice(0, 400)}'` : 'NULL';
  pg(`INSERT INTO scanner_cache (workspace_id, domain, scanner, payload, ttl_seconds, fetch_ms, http_status, error) VALUES (1, '${dom}', '${sc}', '${blob}', ${ttl_seconds || 86400}, ${fetch_ms || 0}, ${http_status || 0}, ${err})`);
}

module.exports = { fetchWithRetry, getCached, writeCache, UA, BROWSER_HEADERS, detectChallenge };
