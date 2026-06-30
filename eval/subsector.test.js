#!/usr/bin/env node
'use strict';
// eval/subsector.test.js — proves the sub-sector tree classifies firms to the RIGHT node and does NOT confuse siblings
// (the V1 D13 fix: IVF != GP, wealth != insurer, ortho != cosmetic). Exit 1 on failure.
const { resolveSubSector } = require('../src/lib/compliance/registry/sector.js');
const sub = (sec,corpus)=>{ const r=resolveSubSector(sec,corpus); return r?r.parent+'/'+r.sub:'(none)'; };
const cases = [
  ['IVF clinic','healthcare','our ivf and fertility treatments help you conceive','healthcare/fertility-ivf'],
  ['GP surgery','healthcare','private gp, our doctors offer family medicine','healthcare/general-practice'],
  ['wealth manager','financial','discretionary portfolio management and wealth management','finance/wealth-management'],
  ['insurer (not wealth)','financial','car and home insurance, we underwrite cover','finance/insurance'],
  ['orthodontist','dental','orthodontist providing braces and invisalign','dental/orthodontics'],
  ['botox clinic','aesthetics','we offer botox and dermal filler injectables','aesthetics/injectables'],
  ['letting agent','realestate','letting agent, tenancy and landlord services','real-estate/lettings'],
  ['restaurant','fb','our restaurant menu and dining experience','hospitality/restaurant'],
  ['barristers','legal','our barristers chambers, direct access','law-firms/barristers'],
];
let fail=0;
for(const [name,sec,corpus,want] of cases){ const got=sub(sec,corpus); if(got!==want){fail++;console.log(`FAIL ${name}: got ${got}, want ${want}`);} else console.log('PASS '+name+' -> '+got); }
// negative: a pure wealth manager must NOT resolve to insurance (the ABI-on-bank class)
const w=resolveSubSector('financial','wealth management and portfolio advice, fca regulated');
if(w&&w.sub==='insurance'){fail++;console.log('FAIL wealth manager wrongly resolved to insurance');} else console.log('PASS wealth manager not mis-tagged insurance');
console.log(fail?`\n${fail} sub-sector test(s) failed.`:'\nall sub-sector tree tests pass.'); process.exit(fail?1:0);
