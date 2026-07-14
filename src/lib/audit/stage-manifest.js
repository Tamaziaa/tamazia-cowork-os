'use strict';
// THE PIPELINE CONTRACT — "did every stage of this audit actually run?"
//
// THE DISEASE THIS CURES, stated plainly:
//   The audit orchestrator loads 31 of its modules through `require(path.resolve(ROOT, ...))`, a DYNAMIC require
//   that NO static analysis tool can follow: not CodeQL, not madge, not a semantic code-search MCP. And 50 call
//   sites across build.js and compliance.js are wrapped in `catch (_e) {}`.
//
//   Together, those two facts mean A STAGE CAN FAIL COMPLETELY AND THE AUDIT STILL SHIPS AS "VERIFIED".
//   It is not a hypothetical. It is the history of this engine:
//     * statute-rag.js was built, required, and NEVER CALLED by a mint for months. Nobody could tell.
//     * The cookie collector returned null for two engine versions because `require('playwright')` failed. Silent.
//     * The breach adjudicator threw a ReferenceError for two versions ("cc is not defined"). Silent. It ran, did
//       nothing, and the audit reported success.
//   Every one of those was invisible from the outside. "Did a model actually read these breaches" and "did we
//   actually look at the cookies" were UNANSWERABLE questions about a legal document we were sending to law firms.
//
// THE CONTRACT:
//   Every stage that contributes EVIDENCE to a legal claim must declare itself here. It records ran / skipped /
//   failed, with a reason. The manifest ships on the payload. A stage that was EXPECTED and did not run makes the
//   audit INCOMPLETE, and an incomplete audit cannot be presented as verified.
//
//   This is deliberately the opposite of fail-open. Failing open on a bug is how you ship nothing and call it
//   resilience.

const EXPECTED = [
  // stage key            what it contributes                                    required for a sendable audit?
  ['crawl',               'the pages every finding is evidenced against',        true],
  ['firm_identity',       'the name, company number and registered office',      true],
  ['jurisdiction',        'which laws attach, and on what evidence',             true],
  ['compliance_scan',     'the findings themselves',                             true],
  ['breach_adjudication', 'an LLM reading every text-derived breach',            true],
  ['llm_verify',          'the cross-verification of the attached law',          true],
  ['cookie_evidence',     'the browser observation behind any PECR claim',       false],
  ['ico_register',        'the public-register check',                           false],
  ['statute_rag',         'grounding the claims in the actual words of the law', false],
  ['psi',                 'the live PageSpeed measurement',                      false],
  ['geo_probe',           'the AI share-of-voice measurement',                   false],
];

function newManifest() {
  const m = { stages: {}, started_at: new Date().toISOString() };
  for (const [k] of EXPECTED) m.stages[k] = { state: 'not_reached', reason: null, ms: null };
  return m;
}

/** Record that a stage RAN and produced something. */
function ran(m, key, detail) {
  if (!m || !m.stages[key]) return;
  m.stages[key] = { state: 'ran', reason: null, ms: (detail && detail.ms) || null, detail: (detail && detail.note) || null };
}
/** Record that a stage was DELIBERATELY skipped (not applicable to this firm). This is a legitimate outcome. */
function skipped(m, key, why) {
  if (!m || !m.stages[key]) return;
  m.stages[key] = { state: 'skipped', reason: String(why || 'not applicable'), ms: null };
}
/** Record that a stage FAILED. THE WHOLE POINT: a failure is now a FACT ON THE PAYLOAD, not a swallowed exception. */
function failed(m, key, err) {
  if (!m || !m.stages[key]) return;
  m.stages[key] = { state: 'failed', reason: String((err && err.message) || err || 'unknown').slice(0, 200), ms: null };
}

/**
 * seal(m) -> { complete, sendable, missing_required[], failed[], summary }
 * `sendable` is the gate: an audit missing a REQUIRED stage is not a compliance report, it is a draft.
 */
function seal(m) {
  if (!m) return { complete: false, sendable: false, missing_required: ['manifest_absent'], failed: [], summary: 'no manifest' };
  const missing = [];
  const broke = [];
  for (const [key, , required] of EXPECTED) {
    const st = (m.stages[key] || {}).state;
    if (st === 'failed') broke.push(key);
    if (required && st !== 'ran' && st !== 'skipped') missing.push(key);
    if (required && st === 'failed') missing.push(key);
  }
  const uniq = Array.from(new Set(missing));
  m.sealed_at = new Date().toISOString();
  m.complete = uniq.length === 0;
  m.sendable = m.complete;
  m.missing_required = uniq;
  m.failed = broke;
  m.summary = m.complete
    ? 'every required stage ran'
    : ('INCOMPLETE: ' + uniq.join(', ') + ' did not run. This audit is a draft, not a compliance report.');
  return m;
}

module.exports = { newManifest, ran, skipped, failed, seal, EXPECTED };
