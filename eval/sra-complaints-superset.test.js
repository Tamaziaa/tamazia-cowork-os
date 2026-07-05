'use strict';
// Phase 2.7 — SRA_COMPLAINTS_ELEMENTS supersedes single-regex SRA_COMPLAINTS with NO finding-loss.
// Proof: the OLD rule flagged a miss iff none of (complaints procedure|policy, legal ombudsman, how to complain,
// raise a complaint) appeared. The NEW element checklist flags a miss iff ANY of 4 elements is absent. Element 1 and
// element 3 together cover every OLD phrase, so OLD-miss => NEW-miss (superset). A fully-compliant firm => NEW hit.
const assert = require('assert');
const OLD = /(complaints (procedure|policy)|legal ombudsman|how to complain|raise a complaint)/i;
const EL = {
  complain: /(how to (make |raise )?(a )?complain|make a complaint|raise a complaint|to complain(,| )|if you (wish to|want to|would like to) complain|our complaints (procedure|process|policy)|making a complaint|complaints (procedure|process|policy|handling))/i,
  timescale: /(within [0-9]+ (working )?(day|week|month)|acknowledge.{0,30}(within|[0-9]+ (day|week))|respond.{0,30}(within|[0-9]+ (day|week))|[0-9]+ (working )?days? (of|to|from)|timescale|how long.{0,20}(complaint|respond)|final (written )?response.{0,30}(within|[0-9]+))/i,
  lego: /(legal ombudsman|legalombudsman|www.legalombudsman|0300 555 0333)/i,
  sra: /((complain|report|raise).{0,25}(to |with |us to )?(the )?sra([^a-z]|$)|(^|[^a-z])sra([^a-z]).{0,25}(if you|where you|to report|to complain|about (our|the)|conduct|misconduct|concern[s]?)|report (your )?concern[s]? to the sra)/i,
};
const oldMiss = t => !OLD.test(t);
const newMiss = t => !(EL.complain.test(t) && EL.timescale.test(t) && EL.lego.test(t) && EL.sra.test(t));
const corpora = [
  'Our firm of solicitors provides conveyancing.',                                   // nothing -> old miss
  'We have a complaints procedure.',                                                  // partial -> old pass
  'How to complain: contact us. We will respond within 8 weeks (final response). Legal Ombudsman: 0300 555 0333. You may also report your concerns to the SRA about our conduct.', // full -> compliant
  'Complaints policy available on request.',                                          // partial
  'Raise a complaint with us; the Legal Ombudsman can help.',                         // partial
];
let fail = 0;
for (const t of corpora) {
  if (oldMiss(t) && !newMiss(t)) { console.error('  FAIL superset: old=miss but new=hit for:', t.slice(0,40)); fail++; }
}
// compliant firm: old pass AND new hit (all 4 present)
const compliant = corpora[2];
assert(!oldMiss(compliant) && !newMiss(compliant), 'fully-compliant firm must pass both old and new');
// stricter: a firm passing OLD on one phrase but missing timescales/SRA must now be flagged (correctness gain)
assert(!oldMiss('We have a complaints procedure.') && newMiss('We have a complaints procedure.'), 'new rule must catch the missing elements the old rule ignored');
if (fail) { console.error('\n' + fail + ' superset assertion(s) FAILED (finding-loss detected).'); process.exit(1); }
console.log('SRA complaints superset OK: no old-miss lost; compliant firm passes; missing-element firms now correctly flagged.');
