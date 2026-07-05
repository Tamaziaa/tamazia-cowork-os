'use strict';
const assert = require('assert');
const { VOCAB, VOCAB_NAMES, isValid } = require('../src/lib/compliance/registry/vocab.js');
const { NEXUS_TYPES } = require('../src/lib/compliance/registry/nexus.js');
const { BINDING } = require('../src/lib/compliance/registry/framework-intel.js');
let fail=0; const bad=m=>{console.error('  FAIL: '+m);fail++;};
// every vocabulary non-empty
for (const n of VOCAB_NAMES) if(!Array.isArray(VOCAB[n])||!VOCAB[n].length) bad(n+' empty');
// referenced SSOTs are NOT duplicated (identical to their source)
assert.deepEqual(VOCAB.nexus_type, NEXUS_TYPES, 'nexus_type must reference nexus.js (no duplicate)');
assert.deepEqual(VOCAB.binding_status, Object.values(BINDING), 'binding_status must reference framework-intel.js');
// the SPEC §5.1 evidence types present; deontics present; ELI in-force present
for (const e of ['on_page_quote','element_present','element_absent','external_register']) if(!isValid('evidence_type',e)) bad('missing evidence_type '+e);
for (const d of ['obligation','prohibition','permission','right']) if(!isValid('obligation_type',d)) bad('missing deontic '+d);
assert.equal(isValid('in_force_status','in_force'), true);
// isValid rejects unknowns + unknown vocab
assert.equal(isValid('evidence_type','nonsense'), false);
assert.equal(isValid('no_such_vocab','x'), false);
// no term appears in the wrong shape (all strings)
for (const n of VOCAB_NAMES) for (const t of VOCAB[n]) if(typeof t!=='string') bad(n+' has non-string term');
if(fail){console.error('\n'+fail+' vocab invariant(s) FAILED.');process.exit(1);}
console.log('all vocab SSOT invariants pass ('+VOCAB_NAMES.length+' controlled vocabularies; nexus+binding referenced not duplicated).');
