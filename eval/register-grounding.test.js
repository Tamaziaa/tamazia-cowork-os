'use strict';
// Phase 2.2 register grounding — additive + fail-open. Proves: CQC is available with NO key; keyed registers appear
// only when their key is set; grounding merges additively (never clears a corpus-set established_in); a network
// failure yields {} (fail-open). Uses an injected probe — no live network.
const assert = require('assert');
const rg = require('../src/lib/compliance/register-grounding.js');
// CQC needs no key -> always available; keyed registers gated on env
assert(rg.availableRegisters({}).includes('CQC'), 'CQC available with no key');
assert(!rg.availableRegisters({}).includes('CH'), 'Companies House hidden without its key');
assert(rg.availableRegisters({ COMPANIES_HOUSE_KEY: 'x' }).includes('CH'), 'Companies House appears with a free key');
// fail-open: probe returns null (network down) -> {}
(async () => {
  const down = await rg.groundEstablishment({ name: 'Acme Care Ltd', sector: 'healthcare', env: {}, probe: async () => null });
  assert.deepStrictEqual(down, {}, 'network failure => empty grounding (fail-open)');
  // CQC hit (no key) -> UK established grounded
  const hit = await rg.groundEstablishment({ name: 'Acme Care Ltd', sector: 'healthcare', env: {}, probe: async () => ({ status: 200, json: [{ locationId: '1-123', name: 'Acme Care Ltd' }] }) });
  assert(hit.UK && hit.UK.established_in === true && hit.UK.source === 'CQC', 'CQC hit grounds UK establishment with no key');
  // sector gating: SRA not queried for a healthcare firm (no false law-firm grounding)
  const sic = await rg.groundEstablishment({ name: 'X', sector: 'healthcare', env: { SRA_API_KEY: 'k' }, probe: async () => ({ status: 200, json: [{ id: 1 }] }) });
  assert(sic.UK && sic.UK.source === 'CQC', 'healthcare firm grounded by CQC, not SRA');
  // additive merge: corpus already set established_in -> grounding never clears it
  const merged = rg.mergeGrounding({ UK: { established_in: true, serves_customers_in: true } }, {});
  assert(merged.UK.established_in === true && merged.UK.serves_customers_in === true, 'merge is additive, clears nothing');
  const merged2 = rg.mergeGrounding({ UK: { established_in: false } }, { UK: { established_in: true, source: 'CQC' } });
  assert(merged2.UK.established_in === true && merged2.UK.established_source === 'CQC', 'grounding can upgrade false->true');
  console.log('register-grounding OK: CQC keyless, keyed-registers gated, sector-gated, fail-open, additive merge.');
})();
