'use strict';
// eval/rulecheck-detection.test.js — proves the Batch 2 detection-metadata correctness fix at the engine level.
// The engine recognises rule_type 'prohibit' (compliance.js) and INVERTS unrecognised spellings into the must_appear
// default. This test pins both: the fixed 'prohibit' rules flag banned content (and clear when absent), and demonstrates
// the inversion the old 'prohibited' spelling caused — so a regression can never silently reintroduce it.
let ruleCheck;
try { ({ ruleCheck } = require('../src/skills/S008-personalisation-engine/scanners/compliance.js')); }
catch (e) { console.error('CANNOT LOAD ruleCheck: ' + e.message); process.exit(1); }

const BANNED = [{ url:'https://clinic.example/', body:'Get Botox and botulinum toxin treatments here, only GBP 99.' }];
const CLEAN  = [{ url:'https://clinic.example/', body:'We offer skincare consultations and dermatology advice.' }];
const base = { id:1, rule_id:'UK_HMR_2012', framework_short:'UK_HMR_2012_POM_PUBLIC_AD', severity:'P0', regex_pattern:'botox|botulinum toxin' };
const r = (t) => Object.assign({}, base, { rule_type:t });

let fail=0; const ok=(name,got,want)=>{ if(got!==want){ console.error(`  FAIL ${name}: got '${got}' want '${want}'`); fail++; } else console.log(`  PASS ${name} -> ${got}`); };

console.log('FIXED behaviour (rule_type=prohibit):');
ok('prohibit + banned content PRESENT  = breach', ruleCheck(r('prohibit'), BANNED, null, null).status, 'miss');
ok('prohibit + banned content ABSENT   = clean ', ruleCheck(r('prohibit'), CLEAN,  null, null).status, 'no_prohibited_pattern');

console.log('BUG it corrects (old spelling rule_type=prohibited falls to must_appear default — INVERTED):');
ok('prohibited(old) + PRESENT wrongly cleared', ruleCheck(r('prohibited'), BANNED, null, null).status, 'hit');
ok('prohibited(old) + ABSENT  wrongly flagged', ruleCheck(r('prohibited'), CLEAN,  null, null).status, 'miss');

console.log('must_appear sanity (disclosure rule):');
const m = Object.assign({}, base, { rule_type:'must_appear', regex_pattern:'privacy policy' });
ok('must_appear + present = hit ', ruleCheck(m, [{url:'https://x/',body:'see our privacy policy'}], null, null).status, 'hit');
ok('must_appear + absent  = miss', ruleCheck(m, [{url:'https://x/',body:'nothing here'}], null, null).status, 'miss');

if (fail) { console.error(`\n${fail} detection assertion(s) FAILED.`); process.exit(1); }
console.log('\nall detection-correctness assertions pass (prohibit flags banned content; old inversion pinned out).');
