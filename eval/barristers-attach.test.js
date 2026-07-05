'use strict';
// Domain-correctness guard: barristers/chambers are a DISTINCT regulated node (BSB), NOT a child of solicitors (SRA).
// connect() must attach UK_BSB (+ universal law) to a chambers firm and NEVER leak any UK_SRA_* framework onto it.
// Locks the connect.js SECTOR_PARENTS fix (barristers no longer bridged to law-firms). Fixture catalogue = no live DB.
const assert = require('assert');
const { connect } = require('../src/lib/compliance/connect.js');
const cat = {
  frameworks: [
    { framework_short: 'UK_BSB', jurisdiction: 'UK' },
    { framework_short: 'UK_SRA_COC', jurisdiction: 'UK' },
    { framework_short: 'UK_SRA_TRANSPARENCY', jurisdiction: 'UK' },
    { framework_short: 'UK_EQUALITY_2010', jurisdiction: 'UK' },
    { framework_short: 'UK_GDPR_A13', jurisdiction: 'UK' },
  ],
  rules: [
    { framework_short: 'UK_BSB', rule_id: 'C1.1', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: ['barristers'], severity: 'P2' },
    { framework_short: 'UK_SRA_COC', rule_id: 'S1', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: ['law-firms'], severity: 'P2' },
    { framework_short: 'UK_SRA_TRANSPARENCY', rule_id: 'S2', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: ['law-firms'], severity: 'P2' },
    { framework_short: 'UK_EQUALITY_2010', rule_id: 'E1', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: [], severity: 'P2' },
    { framework_short: 'UK_GDPR_A13', rule_id: 'G1', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: [], severity: 'P1' },
  ],
};
const text = 'Chambers. Our barristers accept direct access and public access instructions.';
const r = connect({ catalogue: cat, jurisdictions: ['UK'], sector: 'barristers', signals: {}, text });
assert(r.frameworks.includes('UK_BSB'), 'UK_BSB must attach to a barristers firm');
assert(!r.frameworks.some(f => f.startsWith('UK_SRA')), 'no UK_SRA_* may leak onto a barristers firm');
// converse: a solicitors firm still gets SRA and not BSB
const r2 = connect({ catalogue: cat, jurisdictions: ['UK'], sector: 'law-firms', signals: {}, text: 'Solicitors. Conveyancing and probate. Legal advice.' });
assert(r2.frameworks.some(f => f.startsWith('UK_SRA')), 'solicitors firm must still get UK_SRA_*');
assert(!r2.frameworks.includes('UK_BSB'), 'UK_BSB must not leak onto a solicitors firm');
console.log('barristers attachment OK: chambers->BSB (no SRA), solicitors->SRA (no BSB).');
