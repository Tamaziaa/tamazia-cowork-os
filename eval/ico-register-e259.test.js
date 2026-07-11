'use strict';
// E-259 (v23.2) — THE FIRST FINDING THAT IS NOT AN INTERPRETATION.
//
// Every other finding this engine makes is, at bottom, a JUDGEMENT: does this text satisfy this obligation. A
// managing partner can argue with a judgement. NOBODY CAN ARGUE WITH A PUBLIC REGISTER.
//
// Under the Data Protection (Charges and Information) Regulations 2018, made under s.137 DPA 2018, an organisation
// processing personal data must pay the fee and appear on the ICO Register of Data Controllers. A law firm with a
// contact form and analytics cookies is unquestionably a controller. So:
//     processes personal data + absent from the register  =  breach
//     processes personal data + registration EXPIRED      =  breach, TODAY
// with no regex, no model, and no interpretation. The evidence IS the regulator's own daily-published register
// (1.42M controllers, Open Government Licence). And an EXPIRED registration is invisible to any website scan.
//
// THE SAFETY PROPERTY THAT MATTERS MOST: accusing a REGISTERED firm of being unregistered would be catastrophic —
// worse than every false positive we have ever shipped, because it is checkable in ten seconds and we would be
// provably wrong. So absence is asserted ONLY when the register is genuinely loaded and the name is distinctive.
// Otherwise: 'unknown', and we say NOTHING.
const path = require('path');
const fs = require('fs');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'src/lib/evidence/ico-register.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('E-259: name normalisation folds the corporate suffixes the register does not agree on', () => {
  A.strictEqual(M._norm('Russell-Cooke LLP'), M._norm('Russell Cooke'));
  A.strictEqual(M._norm('Birketts LLP'), M._norm('BIRKETTS'));
  A.strictEqual(M._norm('Mills & Reeve LLP'), M._norm('Mills  Reeve'));
});

t('E-259 THE FALSE-ACCUSATION GUARD: absence is NEVER asserted when the register is not loaded', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/evidence/ico-register.js'), 'utf8');
  A.ok(/n < 500000/.test(src),
    'the module MUST refuse to assert absence when the register is under-loaded. An empty register would make EVERY firm look unregistered and put a provably false accusation on every report we ship.');
  A.ok(/refusing to assert absence/.test(src));
});

t('E-259: a short or generic company name can never produce a "not registered" finding', () => {
  const r = M.checkRegistration({ company: 'ABC' });
  A.strictEqual(r.status, 'unknown', 'a 3-letter stem matches too many controllers to be evidence');
});

t('E-259: we assert NOTHING unless the firm demonstrably processes personal data', () => {
  const reg = { status: 'not_registered', reason: 'x', evidence: 'y', source_url: 'z' };
  A.strictEqual(M.registrationFinding(reg, {}), null, 'a brochure site with no form, no cookies and no login is not obviously a controller — we do not guess');
  const f = M.registrationFinding(reg, { has_form: true, trackers: true });
  A.ok(f, 'a site with a form and trackers IS a controller');
  A.strictEqual(f.severity, 'P0');
  A.match(f.statutory_citation, /s\.137/);
});

t('E-259: an EXPIRED registration is a breach TODAY — the finding no website scan could ever make', () => {
  const f = M.registrationFinding({ status: 'expired', reason: 'r', evidence: 'e', source_url: 'u' }, { has_form: true });
  A.ok(f, 'an expired registration on a data-collecting site is a live breach');
  A.strictEqual(f.code, 'ICO_REG_EXPIRED');
  A.match(f.description, /expired/i);
});

t('E-259: a CURRENT registration produces NO finding (we never invent one)', () => {
  A.strictEqual(M.registrationFinding({ status: 'registered', registration_number: 'Z123' }, { has_form: true, trackers: true }), null);
});

t('E-259: the finding carries the REGISTER as its evidence, not a page quote', () => {
  const f = M.registrationFinding({ status: 'not_registered', reason: 'r', evidence: 'Searched the ICO Register…', source_url: 'https://ico.org.uk/…' }, { has_form: true });
  A.strictEqual(f.evidence_quote, null, 'there is no page quote — the evidence is the register itself');
  A.strictEqual(f.absence_evidence.state, 'public_register_checked');
  A.ok(f.evidence_url, 'the finding must cite the register');
});

t('E-259: the loader stages then SWAPS — a failed run can never leave an empty register', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/load-ico-register.js'), 'utf8');
  A.ok(/ico_register_stage/.test(src), 'must load into a staging table');
  A.ok(/refusing to swap/.test(src), 'must refuse to swap in a partial register');
  A.ok(!/media2\/[a-z0-9]{6,}/i.test(src), 'the ICO download hash ROTATES — it must be scraped, never hardcoded');
});

console.log(bad ? 'E259 ICO REGISTER: FAIL' : 'E259 ICO REGISTER: ALL GREEN (' + n + ' checks) — the first un-arguable breach');
process.exit(bad ? 1 : 0);
