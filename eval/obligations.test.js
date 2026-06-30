#!/usr/bin/env node
'use strict';
// eval/obligations.test.js — the universal-obligation layer is internally consistent (offline, CI). Exit 1 on failure.
const { OBLIGATIONS, obligationFrameworks, TRIGGER_PREDICATES } = require('../src/lib/compliance/registry/obligations.js');
const { extractProducers } = require('./predicate-gate.js');
const { PREDICATE_IDS } = require('../src/lib/compliance/registry/predicates.js');
let fail=0; const F=(c,m)=>{ if(!c){fail++;console.log('FAIL '+m);} else console.log('PASS '+m); };
// 1) every obligation trigger predicate is PRODUCIBLE (deterministic detection grounded, not an orphan)
const producible = new Set([...extractProducers(), ...PREDICATE_IDS, 'public_facing_website','always']);
for (const p of TRIGGER_PREDICATES) F(producible.has(p), 'trigger predicate producible: '+p);
// 2) layering resolves per jurisdiction with no cross-bleed
const uk = obligationFrameworks(['GB']); const us = obligationFrameworks(['US']); const ae = obligationFrameworks(['MENA-AE']);
F(uk.privacy_notice && uk.privacy_notice.frameworks.includes('UK_GDPR_A13'), 'UK privacy -> UK_GDPR_A13');
F(uk.cookie_consent && uk.cookie_consent.frameworks.includes('UK_PECR'), 'UK cookies -> UK_PECR');
F(us.privacy_notice && us.privacy_notice.frameworks.includes('US_CCPA') && !us.privacy_notice.frameworks.includes('UK_GDPR_A13'), 'US privacy -> US_CCPA, NOT UK_GDPR');
F(!us.cookie_consent, 'US has no universal cookie-consent obligation (correct)');
F(ae.privacy_notice && ae.privacy_notice.frameworks.includes('UAE_PDPL'), 'UAE privacy -> UAE_PDPL');
F(us.ai_transparency && us.ai_transparency.frameworks.includes('US_COLORADO_AI_ACT'), 'US AI -> Colorado AI Act');
// 3) the EU AI Act is marked pending
const eu = obligationFrameworks(['EU']); F(eu.ai_transparency && eu.ai_transparency.status && /pending/.test(eu.ai_transparency.status.EU||''), 'EU AI Act flagged pending (2026-08-02)');
// 4) every concept has evidence + at least one jurisdiction + a regulator
for (const [c,o] of Object.entries(OBLIGATIONS)) F(o.evidence && Object.keys(o.jurisdictions).length>0 && o.regulators, 'concept well-formed: '+c);
console.log(fail?`\n${fail} obligation test(s) FAILED.`:'\nall universal-obligation layer tests pass.'); process.exit(fail?1:0);
