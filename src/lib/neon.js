// Hardened Neon access for engine scripts. Resolves the connection string from any accepted
// env name, retries transient failures with backoff, and NEVER throws (returns {ok,rows,error}).
// Use this for new DB code so a blip or misconfig degrades instead of crashing the cycle.
const { execFileSync } = require('child_process');
const path = require('path');
const PSQL = path.resolve(__dirname, '..', '..', 'scripts', 'psql');

function conn() {
  return process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL || null;
}
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} }

// Run a SQL statement. Returns { ok, rows, error }. rows = array of column-arrays (psql -tA).
function query(sql, opts = {}) {
  const url = conn();
  if (!url) return { ok: false, rows: [], error: 'neon_unconfigured' };
  const retries = opts.retries == null ? 2 : opts.retries;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const out = execFileSync(PSQL, [url, '-tA', '-c', sql], { encoding: 'utf8', timeout: opts.timeoutMs || 30000 }).toString();
      const trimmed = out.replace(/\n$/, '');
      const rows = trimmed === '' ? [] : trimmed.split('\n').map(l => l.split('\t'));
      return { ok: true, rows, error: null };
    } catch (e) {
      lastErr = e;
      const msg = (e && (e.stderr ? e.stderr.toString() : e.message)) || '';
      // Don't retry deterministic SQL errors (syntax/undefined column/constraint) — only transient ones
      if (/syntax error|does not exist|duplicate key|violates|already exists|invalid input/i.test(msg)) break;
      if (attempt < retries) sleepSync(opts.backoffMs ? opts.backoffMs * (attempt + 1) : 250 * (attempt + 1));
    }
  }
  const error = (lastErr && (lastErr.stderr ? lastErr.stderr.toString().trim() : lastErr.message)) || 'query_failed';
  console.error('[neon] query failed (fail-open):', error.slice(0, 200));
  return { ok: false, rows: [], error };
}

// One-shot health probe. { ok, tables } — never throws.
function selfTest() {
  const r = query("select count(*)::int from information_schema.tables where table_schema='public'");
  return { ok: r.ok, tables: r.ok ? Number(r.rows[0][0]) : null, error: r.error };
}

module.exports = { query, selfTest, conn };
