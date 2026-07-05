'use strict';
// Invariants for the nexus SSOT (registry/nexus.js). Pure/offline.
const assert = require('assert');
const { NEXUS_TYPES, EDPB_SIGNALS, requiredNexusFor, nexusHolds, CATEGORIES } = require('../src/lib/compliance/registry/nexus.js');
let fail = 0; const bad = m => { console.error('  FAIL: ' + m); fail++; };
// 1. exactly the three GDPR Art 3 relations
assert.deepEqual(NEXUS_TYPES, ['established_in','serves_customers_in','processes_residents_of']);
// 2. every relation has EDPB positive signals + negative guards (combination-of-factors, negatives excluded)
for (const t of NEXUS_TYPES){ const s=EDPB_SIGNALS[t]; if(!s||!s.positive||!s.positive.length) bad(t+' missing positive signals'); if(!s.negative_guards||!s.negative_guards.length) bad(t+' missing negative guards'); }
if (EDPB_SIGNALS.serves_customers_in.min_factors < 2) bad('serves_customers_in must require >=2 factors');
if (!EDPB_SIGNALS.processes_residents_of.requires_also) bad('processes_residents_of must require a co-nexus (tracking alone insufficient)');
// 3. category defaults: privacy = all three; establishment = established_in only; consumer = serves only
assert.deepEqual(requiredNexusFor('privacy').any_of, NEXUS_TYPES, 'privacy = all three');
assert.deepEqual(requiredNexusFor('establishment').any_of, ['established_in'], 'establishment-only');
assert.deepEqual(requiredNexusFor('free_zone').any_of, ['established_in'], 'free-zone = established only (DIFC/ADGM mutually exclusive)');
assert.deepEqual(requiredNexusFor('consumer').any_of, ['serves_customers_in'], 'consumer = serves');
assert.deepEqual(requiredNexusFor('unknown_cat').any_of, NEXUS_TYPES, 'unknown fails toward the privacy baseline (fail-safe)');
// 4. nexusHolds any_of logic (the worked examples from the bibles)
// US firm merely mentioning EU clients: no serves nexus -> GDPR (privacy, any_of all three) does NOT hold
assert.equal(nexusHolds(requiredNexusFor('privacy'), { established_in:false, serves_customers_in:false, processes_residents_of:false }), false, 'US firm, no EU nexus -> GDPR not held');
// US e-commerce serving EU: serves true -> privacy holds
assert.equal(nexusHolds(requiredNexusFor('privacy'), { serves_customers_in:true }), true, 'serves EU -> GDPR held');
// Companies Act (establishment-only): a served-but-not-established firm -> does NOT hold
assert.equal(nexusHolds(requiredNexusFor('establishment'), { established_in:false, serves_customers_in:true }), false, 'served-not-established -> Companies Act not held');
assert.equal(nexusHolds(requiredNexusFor('establishment'), { established_in:true }), true, 'established -> Companies Act held');
// 5. malformed inputs are safe
assert.equal(nexusHolds(null, {}), false); assert.equal(nexusHolds(requiredNexusFor('privacy'), null), false);
if (fail){ console.error('\n'+fail+' nexus invariant(s) FAILED.'); process.exit(1); }
console.log('all nexus SSOT invariants pass ('+NEXUS_TYPES.length+' typed relations, '+CATEGORIES.length+' category defaults, EDPB signal lists, any_of match, fail-safe defaults).');
