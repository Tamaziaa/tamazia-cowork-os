'use strict';
// Phase 2.7.8 — EAA accessibility statement: single-regex -> 5-element checklist (EN 301 549), no finding-loss.
// Element 1 is a superset of the OLD check regex, so old-miss => new-miss. Elements 2-5 add the required statement
// content (conformance / limitations / feedback / enforcement). Pure regex-level superset + localisation proof.
const assert = require('assert');
const OLD = /(accessibility statement|accessibility policy|WCAG 2\.[01]|EN 301 549|accessible design)/i;
const EL1 = /(accessibility statement|accessibility policy|WCAG 2\.[01]|EN 301 549|accessible design|accessibility commitment|our commitment to accessibility)/i;
const EL = {
  conf: /(WCAG 2\.[01]|level (double-)?a{1,3}\b|AA (conforman|complian)|partially conformant|fully conformant|conformance (status|level)|EN 301 549)/i,
  lim: /(non-accessible|not (yet )?accessible|known (limitation|issue)|exemption|disproportionate burden|limitations of (this|our) (site|website))/i,
  fb: /(accessibility (feedback|contact|team|email)|report (an )?(accessibility )?(issue|barrier|problem)|contact us.{0,40}accessib|feedback.{0,30}accessib|accessib.{0,30}(contact|email|feedback))/i,
  enf: /(enforcement procedure|complain.{0,30}accessib|accessib.{0,30}complain|equality (and )?human rights commission|EHRC|escalat|ombudsman|not satisfied.{0,40}(response|reply))/i,
};
// superset: OLD match => EL1 match (so anywhere OLD passed, element 1 passes -> old-miss implies new-miss)
const probes = ['We publish an accessibility statement.', 'Our accessibility policy follows WCAG 2.1 AA.', 'EN 301 549 compliant.', 'accessible design throughout.', 'nothing here', 'WCAG 2.0 partially conformant'];
for (const p of probes) if (OLD.test(p)) assert(EL1.test(p), 'element 1 must subsume OLD check for: ' + p);
// full compliant statement -> new hit (all 5)
const full = 'Accessibility statement: this site is partially conformant with WCAG 2.1 AA (EN 301 549). Known limitations: some PDFs are non-accessible. For accessibility feedback contact accessibility@firm.com to report an issue. If not satisfied you may escalate to the Equality and Human Rights Commission enforcement procedure.';
assert(EL1.test(full) && EL.conf.test(full) && EL.lim.test(full) && EL.fb.test(full) && EL.enf.test(full), 'fully-compliant statement passes all 5 elements');
// a bare statement (old PASS) now correctly flags missing elements (correctness gain)
const bare = 'We have an accessibility statement.';
assert(OLD.test(bare) && !(EL.conf.test(bare) && EL.lim.test(bare) && EL.fb.test(bare) && EL.enf.test(bare)), 'bare statement now flags missing required elements');
console.log('EAA statement superset OK: no old-miss lost; full statement passes; bare statement now flags missing elements.');
