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

const UA = 'Mozilla/5.0 (compatible; TamaziaAuditBot/1.0; +https://tamazia.co.uk/audit-bot)';

async function fetchWithRetry(url, opts = {}) {
  const max = opts.retries || 2;
  const timeout = opts.timeout || 15000;
  let lastErr = null;
  for (let i = 0; i <= max; i++) {
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: ctl.signal });
      clearTimeout(timer);
      const ms = Date.now() - t0;
      const body = opts.binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      return { ok: res.ok, status: res.status, body, headers: Object.fromEntries(res.headers.entries()), fetch_ms: ms };
    } catch (e) {
      lastErr = e.message || String(e);
      if (i < max) await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
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

module.exports = { fetchWithRetry, getCached, writeCache, UA };
