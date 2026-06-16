'use strict';
// Reoon email verifier · PAID FALLBACK (D3.1). Slots in AFTER the free-first MX/SMTP/Hunter path,
// invoked ONLY when the free verdict is still 'unknown'/empty — to kill bounces and unjam qualification.
//
// FAIL-OPEN BY DESIGN: REOON_KEY is not set yet (the founder adds it later). With no key this module is a
// pure no-op — verifyEmail() returns { status: 'skipped' } and the caller keeps the free verdict unchanged.
// It NEVER throws (network error / timeout / bad JSON / non-200 all resolve to a benign 'error'/'unknown'
// verdict) so it can be merged and shipped now with zero behaviour change until the key lands.
//
// Reoon Single Verification API (https://reoon.com/email-verifier):
//   GET https://emailverifier.reoon.com/api/v1/verify?email=<email>&key=<KEY>&mode=power
//   -> JSON { status, is_safe_to_send, is_disposable, is_role_account, is_catch_all, ... }
//   `status` ∈ safe | valid | invalid | disabled | disposable | spamtrap | catch_all | role_account
//            | inbox_full | unknown   (Reoon REFUNDS the credit for 'unknown', so we do NOT cost-log it).
//
// VERDICT MAPPING (house rules — catch-all is risky, do-NOT-send):
//   safe / valid                          -> 'valid'    -> deliverability 'verified'   (send-ready)
//   catch_all                             -> 'risky'    -> deliverability 'deliverable' (DO-NOT-SEND, catch-all)
//   invalid / disposable / disabled /
//     spamtrap / inbox_full               -> 'invalid'  -> deliverability 'bad'
//   unknown / empty / role-without-status -> 'unknown'  -> deliverability 'unverified'  (no verdict; refunded)
// The returned verdict vocabulary (valid/risky/invalid/unknown) is exactly what free-verify.js emits and what
// verify-status.js (deliverabilityOf) understands, so the verdict flows through the existing pipeline unchanged.

let _ledger = {}; try { _ledger = require('../cost-ledger.js'); } catch (_) { _ledger = {}; }
const logUsage = _ledger.logUsage || (async () => {});

const ENDPOINT = process.env.REOON_ENDPOINT || 'https://emailverifier.reoon.com/api/v1/verify';
// 'power' = real-time deep check (SMTP + catch-all + role/disposable). 'quick' is the cheaper syntax/MX-only mode.
const MODE = process.env.REOON_MODE || 'power';
// Per-verification credit cost (USD). Reoon's published rate is well under a cent; overridable per plan.
const UNIT_USD = Number(process.env.REOON_UNIT_USD || 0.0008);
const TIMEOUT_MS = Number(process.env.REOON_TIMEOUT_MS || 15000);
const RETRIES = Math.max(0, Number(process.env.REOON_RETRIES || 1)); // total attempts = RETRIES + 1

const SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normalise Reoon's `status` (or derived signals) to our 4-verdict vocabulary.
// Returns { status, deliverability } where deliverability mirrors verify-status.js deliverabilityOf().
function mapVerdict(data) {
  data = data || {};
  const s = String(data.status || '').trim().toLowerCase();

  // Hard negatives first (a confirmed-bad signal must never be read as deliverable).
  if (data.is_disposable === true) return { status: 'invalid', deliverability: 'bad' };
  if (/^(invalid|disabled|disposable|spamtrap|spam_trap|inbox_full|undeliverable|unverifiable_email)$/.test(s)) {
    return { status: 'invalid', deliverability: 'bad' };
  }
  // Catch-all = risky per house rule (do-NOT-send). Honour an explicit flag too.
  if (s === 'catch_all' || s === 'catchall' || s === 'accept_all' || data.is_catch_all === true) {
    return { status: 'risky', deliverability: 'deliverable' };
  }
  // Safe / valid -> send-ready. is_safe_to_send is Reoon's top-line boolean.
  if (s === 'safe' || s === 'valid' || s === 'deliverable' || data.is_safe_to_send === true) {
    return { status: 'valid', deliverability: 'verified' };
  }
  // unknown / role_account-without-a-deliverability-verdict / empty -> no verdict (Reoon refunds 'unknown').
  return { status: 'unknown', deliverability: 'unverified' };
}

// Whether a verdict is "settled" (Reoon charged for it). 'unknown' is refunded, so it is NOT cost-logged.
const isBilled = (status) => status === 'valid' || status === 'risky' || status === 'invalid';

async function _getJSON(url, timeoutMs) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { httpError: r.status };
    return await r.json();
  } catch (e) {
    return { netError: (e && e.message) || 'fetch_failed' };
  }
}

/**
 * Verify one email via Reoon. Paid fallback — call ONLY when the free verdict is unknown/empty.
 * Fail-open + never throws.
 * @param {string} email
 * @param {object} [env]  defaults to process.env (so it can be unit-tested with an injected env)
 * @param {object} [opts] {fetchImpl} optional fetch override for tests
 * @returns {Promise<{status:'skipped'|'valid'|'risky'|'invalid'|'unknown'|'error', deliverability?:string, raw?:any, cost:number, source:'reoon'}>}
 *   status 'skipped' => no REOON_KEY (no-op, caller keeps the free verdict).
 *   status 'error'   => transport/parse failure (treated as no-verdict by the caller; free verdict kept).
 */
async function verifyEmail(email, env = process.env, opts = {}) {
  env = env || {};
  const key = (env.REOON_KEY || env.REOON_API_KEY || '').trim();
  // FAIL-OPEN: no key -> no-op. This is what makes the integration safe to merge before the key exists.
  if (!key) return { status: 'skipped', source: 'reoon', cost: 0 };

  const e = String(email || '').trim().toLowerCase();
  if (!e || !SYNTAX.test(e)) return { status: 'invalid', deliverability: 'bad', source: 'reoon', cost: 0, raw: { reason: 'bad_syntax' } };

  const fetchJSON = opts.fetchImpl || _getJSON;
  const url = `${ENDPOINT}?email=${encodeURIComponent(e)}&key=${encodeURIComponent(key)}&mode=${encodeURIComponent(MODE)}`;

  let data = null, lastErr = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      data = await fetchJSON(url, TIMEOUT_MS);
    } catch (_e) {                       // belt-and-braces: fetchJSON already swallows, but never let a custom impl throw
      data = { netError: 'threw' };
    }
    if (data && !data.netError && data.httpError == null) break; // got a usable body
    lastErr = (data && (data.netError || ('http_' + data.httpError))) || 'no_response';
    if (attempt < RETRIES) { await new Promise(r => setTimeout(r, 400 * (attempt + 1))); } // small linear backoff
  }

  // Transport/parse failure across all attempts -> benign 'error' (caller keeps the free verdict; nothing charged).
  if (!data || data.netError || data.httpError != null) {
    return { status: 'error', source: 'reoon', cost: 0, raw: { error: lastErr } };
  }

  const { status, deliverability } = mapVerdict(data);
  const cost = isBilled(status) ? UNIT_USD : 0; // 'unknown' is refunded by Reoon -> 0
  if (cost > 0) {
    // Mirror the cost-ledger pattern (apify/client.js): one HTTP insert, never throws.
    try { await logUsage('reoon', cost, { email: e, status, reoon_status: String(data.status || '') }); } catch (_) {}
  }
  return { status, deliverability, raw: data, cost, source: 'reoon' };
}

module.exports = { verifyEmail, mapVerdict, isBilled };

if (require.main === module) {
  // Smoke test: with no REOON_KEY this prints 'skipped' for every input (the no-op proof).
  (async () => {
    const list = process.argv.slice(2);
    const tests = list.length ? list : ['alice@example.com', 'info@example.org'];
    for (const em of tests) {
      const r = await verifyEmail(em);
      console.log(`${em.padEnd(34)} -> status=${r.status} deliverability=${r.deliverability || '-'} cost=$${r.cost}`);
    }
  })();
}
