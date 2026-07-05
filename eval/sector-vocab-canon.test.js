'use strict';
// BUG-FIX regression (audit P1): compliance_rules.sector_relevance uses non-canonical vocab (legal/wealth/health/
// solicitors/conveyancing...). connect must canonicalise rule tags so those rules are not silently skipped for a
// canonically-normalised firm. Fixture proves a 'legal'-only-tagged rule reaches a law-firms firm.
const assert = require('assert');
const { connect } = require('../src/lib/compliance/connect.js');
const cat = {
  frameworks: [{ framework_short: 'UK_X', jurisdiction: 'UK' }],
  rules: [
    { framework_short: 'UK_X', rule_id: 'R_LEGAL', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: ['legal','solicitors','conveyancing'], severity: 'P2' },
    { framework_short: 'UK_X', rule_id: 'R_WEALTH', rule_type: 'must_appear', trigger_pattern: null, sector_relevance: ['wealth','financial-services'], severity: 'P2' },
  ],
};
// law-firms firm -> the 'legal'-tagged rule must be connected (was skipped before the fix)
const r1 = connect({ catalogue: cat, jurisdictions: ['GB'], sector: 'law-firms', signals: {}, text: 'solicitors' });
assert(r1.rules.some(r => r.rule_id === 'R_LEGAL'), "'legal'-tagged rule must reach a law-firms firm");
assert(!r1.rules.some(r => r.rule_id === 'R_WEALTH'), "'wealth'-tagged rule must NOT reach a law-firms firm");
// finance firm -> the 'wealth'/'financial-services'-tagged rule must be connected
const r2 = connect({ catalogue: cat, jurisdictions: ['GB'], sector: 'finance', signals: {}, text: 'wealth management' });
assert(r2.rules.some(r => r.rule_id === 'R_WEALTH'), "'wealth'/'financial-services'-tagged rule must reach a finance firm");
assert(!r2.rules.some(r => r.rule_id === 'R_LEGAL'), "'legal'-tagged rule must NOT reach a finance firm");
console.log('sector-vocab canon OK: non-canonical rule tags now match the canonical firm sector; no cross-sector leak.');
