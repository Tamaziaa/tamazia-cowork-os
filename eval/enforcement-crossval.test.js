'use strict';
// Phase 3.4.3 — enforcement cross-validation of sector tags (SOFT flags, never auto-drop).
const assert = require('assert');
const cv = require('../src/lib/audit/enforcement-crossval.js');
// injected determinism: framework with enforcement in {tech} claiming {tech,finance} -> flag finance only.
const claimed = { EU_AI_ACT: new Set(['tech','finance']), UK_SRA_TRANSPARENCY: new Set(['law-firms']), NEW_LAW: new Set(['x','y']) };
const enforced = { EU_AI_ACT: new Set(['tech']), UK_SRA_TRANSPARENCY: new Set(['law-firms']) }; // NEW_LAW has no enforcement
const flags = cv.crossValidate(claimed, enforced);
assert(flags.some(f => f.framework === 'EU_AI_ACT' && f.sector === 'finance'), 'unsupported claimed sector flagged');
assert(!flags.some(f => f.framework === 'EU_AI_ACT' && f.sector === 'tech'), 'enforcement-supported sector not flagged');
assert(!flags.some(f => f.framework === 'UK_SRA_TRANSPARENCY'), 'well-supported framework not flagged');
assert(!flags.some(f => f.framework === 'NEW_LAW'), 'framework with no enforcement history is skipped (no false signal)');
assert(flags.every(f => f.reason === 'claimed_sector_no_enforcement_support'), 'soft reason recorded');
// live DB smoke: bounded + well-supported pairs excluded
if (process.env.NEON_URL) {
  const live = cv.run();
  assert(Array.isArray(live) && live.length < 400, 'live flag list is bounded');
  assert(!live.some(f => f.framework === 'UK_SRA_TRANSPARENCY' && f.sector === 'law-firms'), 'SRA/law-firms enforcement-supported, not flagged');
  assert(!live.some(f => f.framework === 'UK_GDPR_A13' && f.sector === 'healthcare'), 'GDPR/healthcare enforcement-supported, not flagged');
}
console.log('enforcement-crossval OK: soft flags for unsupported sector claims, supported pairs + no-history frameworks excluded.');
