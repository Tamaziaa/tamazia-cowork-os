'use strict';
// Grounding + invariants for the sector framework-intelligence overlay (registry/framework-intel.js).
const assert = require('assert');
const { INTEL, BINDING, frameworkIntel, bindingStatus, isVoluntary, ALL_INTEL_CODES } = require('../src/lib/compliance/registry/framework-intel.js');
const BINDING_VALUES = new Set(Object.values(BINDING));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
let fail = 0; const bad = m => { console.error('  FAIL: ' + m); fail++; };

// 1. Structural completeness — every record fully typed (V1 B6/C10: a duty with an evidence type, not a blob)
for (const code of ALL_INTEL_CODES) {
  const r = INTEL[code];
  if (!r.regulator) bad(code + ' missing regulator');
  if (!r.instrument) bad(code + ' missing instrument (statutory basis)');
  if (!BINDING_VALUES.has(r.binding)) bad(code + ' invalid binding "' + r.binding + '"');
  if (!r.trigger || typeof r.trigger !== 'string') bad(code + ' missing trigger predicate');
  if (!Array.isArray(r.evidence) || r.evidence.length === 0) bad(code + ' missing typed evidence');
  if (!r.detect) bad(code + ' missing deterministic detect signal');
  if (!r.jurisdiction) bad(code + ' missing jurisdiction');
  if (!ISO.test(r.updated || '')) bad(code + ' invalid/absent updated date');
}
// 2. Binding-status invariant (V1 B7): the ABI trade-body code is the canonical VOLUNTARY case and must be labelled so
if (bindingStatus('UK_ABI') !== BINDING.VOLUNTARY) bad('UK_ABI must be VOLUNTARY (V1 B7)');
if (!isVoluntary('UK_ABI')) bad('isVoluntary(UK_ABI) must be true');
if (isVoluntary('UK_SRA_TRANSPARENCY')) bad('SRA Transparency is statutory_code, not voluntary');
// 3. The completed Middle East layer: all 5 PDPLs are statute, correct jurisdiction
for (const [code, j] of [['BAHRAIN_PDPL','BH'],['OMAN_PDPL','OM'],['EGYPT_PDPL','EG'],['JORDAN_PDPL','JO'],['ISRAEL_PPL','IL']]) {
  if (!INTEL[code]) bad(code + ' absent from intel');
  else { if (INTEL[code].binding !== BINDING.STATUTE) bad(code + ' should be statute'); if (INTEL[code].jurisdiction !== j) bad(code + ' jurisdiction should be ' + j); }
}
// 4. Helper contract
if (frameworkIntel('NOPE') !== null) bad('frameworkIntel(unknown) must be null');
if (bindingStatus('UK_MHRA') !== BINDING.STATUTE) bad('MHRA POM ban is statute');

if (fail) { console.error('\n' + fail + ' framework-intel invariant(s) FAILED.'); process.exit(1); }
console.log('all framework-intel invariants pass (' + ALL_INTEL_CODES.length + ' records: typed evidence, valid binding, ME layer, helpers).');
