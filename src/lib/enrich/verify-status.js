'use strict';
// SINGLE shared email-verification status mapping (A4c). Two vocabularies feed this:
//  - free-verify.js / stored verify_status: valid | risky | invalid | unknown (catch-all already folded
//    into 'risky' pre-storage), plus legacy booster rows: deliverable | ok | accept(ed)
//  - Apify michael.g/email-verifier-validator: good | risky | bad
// verified == deliverable & safe. Catch-all / risky / unknown are explicitly EXCLUDED.
// NOTE on 'accept': in THIS stack the canonical verifier maps accept_all -> 'risky' before storage
// (free-verify.js L121), so a bare stored 'accept' means SMTP-accepted (deliverable), NOT catch-all;
// the catch-all spellings (accept_all / accept-all / catch_all / catchall) are matched by RISKY_RE.
//
// ── verify_status overloaded → deliverability split (refactor 2026-06-15) ──────────────────────────
// HISTORY: `leads.verify_status` carried TWO unrelated meanings: (a) WORKFLOW state written at insert by
// serp-engine.js ('pending' for organic_top100, 'approved' for sponsored) and (b) a DELIVERABILITY VERDICT
// written later by the verifiers (good/valid/risky/bad/invalid/unknown/catch_all/...). That dual meaning is
// fragile: a reader asking "is this email deliverable?" had to know that 'pending'/'approved' are NOT verdicts.
// FIX (additive, backward-compatible): a dedicated `leads.deliverability` column is the unambiguous verdict.
// `deliverabilityOf(lead)` is the SINGLE source of truth — it PREFERS `lead.deliverability` and FALLS BACK to
// parsing `lead.verify_status` (so it is correct BEFORE and AFTER the backfill, and for rows that only ever
// had verify_status). Workflow values ('pending'/'approved'/'' ) are NOT verdicts → they map to 'unverified'.
// Pure + deterministic.

const VERIFIED_RE = /^(good|valid|deliverable|ok|accept(ed)?|role_valid)$/i;
const RISKY_RE    = /^(risky|bad|invalid|catch[\s_-]?all|unknown|accept[\s_-]?all)$/i;

// WORKFLOW states that historically shared the verify_status column. These are NOT deliverability verdicts —
// they describe where a lead sits in the pipeline, not whether its email is reachable. Treated as "no verdict".
const WORKFLOW_RE = /^(pending|approved|new|queued)$/i;

// Confirmed-undeliverable verdicts (hard negatives — a reader may ONLY ever demote on these).
const CONFIRMED_BAD_RE = /^(invalid|bad|undeliverable|no_mx|nxdomain|disposable|invalid_syntax)$/i;

// isVerifiedStatus(s): true only for a deliverable & safe verdict. Unchanged behaviour, kept for back-compat;
// it now consults the shared helper so there is one definition of "verified".
const isVerifiedStatus = (s) => deliverabilityOf({ verify_status: s }) === 'verified';

// deliverabilityOf(lead): the SINGLE source of truth for a lead's deliverability verdict.
// Returns one of: 'verified' | 'deliverable' | 'bad' | 'unverified'.
//   verified    = SMTP/verifier confirmed reachable & safe (good/valid/ok/accept/role_valid; or email_verified=true)
//   deliverable = reachable-shaped but not hard-confirmed (catch-all / accept-all / risky)
//   bad         = confirmed undeliverable (invalid/bad/no_mx/nxdomain/disposable/...)
//   unverified  = no verdict yet (workflow value 'pending'/'approved', NULL/'', or 'unknown')
// Prefers lead.deliverability; falls back to parsing lead.verify_status. Works before AND after the backfill.
function deliverabilityOf(lead) {
  lead = lead || {};
  // Prefer the dedicated deliverability column when populated; otherwise fall back to verify_status.
  const raw = String((lead.deliverability != null && String(lead.deliverability).trim() !== '')
    ? lead.deliverability
    : (lead.verify_status == null ? '' : lead.verify_status)).trim();

  // A confirmed-bad verdict wins outright (never let a stale email_verified flag override a hard negative).
  if (CONFIRMED_BAD_RE.test(raw)) return 'bad';

  // A SMTP/verifier "verified" verdict, OR a positive email_verified flag (when not contradicted above).
  if (VERIFIED_RE.test(raw) && !RISKY_RE.test(raw)) return 'verified';
  const flag = lead.email_verified;
  if (flag === true || /^(t|true|1|yes)$/i.test(String(flag == null ? '' : flag).trim())) return 'verified';

  // Reachable-shaped but soft: catch-all / accept-all / risky.
  if (/^(risky|catch[\s_-]?all|accept[\s_-]?all)$/i.test(raw)) return 'deliverable';

  // Everything else (workflow state, NULL/'', 'unknown') = no verdict yet.
  return 'unverified';
}

// Convenience predicates built on the one helper (so callers don't re-implement the vocabulary).
const isDeliverable    = (lead) => { const d = deliverabilityOf(lead); return d === 'verified' || d === 'deliverable'; };
const isConfirmedBad   = (lead) => deliverabilityOf(lead) === 'bad';
const isWorkflowStatus = (s) => WORKFLOW_RE.test(String(s == null ? '' : s).trim());

module.exports = {
  isVerifiedStatus, deliverabilityOf, isDeliverable, isConfirmedBad, isWorkflowStatus,
  VERIFIED_RE, RISKY_RE, WORKFLOW_RE, CONFIRMED_BAD_RE,
};
