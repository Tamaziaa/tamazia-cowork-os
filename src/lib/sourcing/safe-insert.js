// Shared unique-violation guard for the lead INSERT paths (flag-3).
//
// A partial unique index `idx_leads_domain_active_unique` on leads(lower(domain)) WHERE
// status<>'duplicate' AND domain<>'' closes the SELECT-then-INSERT TOCTOU: two writers can both pass the
// "does this domain exist?" check, then both INSERT. With the index live, the second INSERT raises a
// Postgres unique_violation (SQLSTATE 23505). That is a BENIGN outcome here — it means "another writer just
// inserted this domain" — so it must be treated as "already exists / skip", never as a crash and never as a
// silent hard-error that hides real failures.
//
// Two helpers because the three callers use two different DB transports:
//   - classifyHttpInsert(res): for the Neon HTTP /sql path (source-leads.js `q()`), whose error body carries
//     the SQLSTATE in res.code (and we also sniff res.error as a fallback).
//   - isUniqueViolationError(err): for the pg8000-shim path (S028 run.js / bulk-sourcer.js `pg()`), whose
//     execFileSync failure surfaces the SQLSTATE in err.stderr as `'C': '23505'`.
//
// Both are fail-safe: they only ever return a classification; they never throw.

const UNIQUE_VIOLATION = '23505';

// True if a thrown error (execFileSync from the pg8000 shim, or any Error) represents SQLSTATE 23505.
// pg8000 prints `DatabaseError: {... 'C': '23505' ...}` to stderr; libpq-style clients print "SQLSTATE 23505"
// or "duplicate key value violates unique constraint". We match any of those shapes.
function isUniqueViolationError(err) {
  if (!err) return false;
  const txt = String((err && err.stderr) || (err && err.message) || err || '');
  if (!txt) return false;
  return txt.includes(UNIQUE_VIOLATION) || /duplicate key value violates unique constraint/i.test(txt);
}

// Classify a Neon HTTP /sql result object `{ ok, code, error }` for an INSERT.
// Returns one of: 'inserted' | 'duplicate' | 'error'.
//   ok                              -> 'inserted'
//   !ok and SQLSTATE/code == 23505  -> 'duplicate'   (benign skip; the row already exists)
//   !ok otherwise                   -> 'error'        (a real failure the caller should surface)
function classifyHttpInsert(res) {
  if (res && res.ok) return 'inserted';
  const code = (res && res.code) || '';
  const errTxt = String((res && res.error) || '');
  if (code === UNIQUE_VIOLATION || errTxt.includes(UNIQUE_VIOLATION) || /duplicate key value violates unique constraint/i.test(errTxt)) return 'duplicate';
  return 'error';
}

module.exports = { isUniqueViolationError, classifyHttpInsert, UNIQUE_VIOLATION };
