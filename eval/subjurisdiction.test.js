'use strict';
// Phase 1.4.8-1.4.13 — local / sub-national resolvers (offline). Verifies real data: UK devolved nations, Gulf emirate
// health authorities, US state privacy thresholds vs targeting-only laws, the shared admin-hierarchy resolver.
const assert = require('assert');
const S = require('../src/lib/compliance/registry/subjurisdiction.js');
let fail = 0; const chk = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { console.error('  FAIL ' + n + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); fail++; } };
// UK devolved nation from postcode
chk('EH1->Scotland', S.ukNation('EH1 2AB'), 'Scotland');
chk('G1->Scotland',  S.ukNation('G1 1AA'), 'Scotland');
chk('BT1->NI',       S.ukNation('BT1 1AA'), 'NI');
chk('CF10->Wales',   S.ukNation('CF10 1AA'), 'Wales');
chk('SW1A->England', S.ukNation('SW1A 1AA'), 'England');
chk('M1->England',   S.ukNation('M1 1AA'), 'England');
chk('junk->null',    S.ukNation('not a postcode'), null);
// Gulf emirate health authority
chk('dubai->DHA',       S.uaeHealthAuthority('a Dubai healthcare clinic'), 'DHA');
chk('abu dhabi->DOH',   S.uaeHealthAuthority('hospital in Abu Dhabi'), 'DOH');
chk('sharjah->MOHAP',   S.uaeHealthAuthority('Sharjah medical centre'), 'MOHAP');
chk('generic->MOHAP',   S.uaeHealthAuthority('a UAE clinic'), 'MOHAP');
// US state: threshold vs targeting (the MHMDA/TDPSA nuance)
chk('CA type', S.US_STATE_PRIVACY.CA.type, 'threshold');
chk('CA revenue', S.US_STATE_PRIVACY.CA.revenue_usd, 25000000);
chk('TX targeting-no-threshold', S.US_STATE_PRIVACY.TX.type, 'targeting');
chk('WA targeting-no-threshold', S.US_STATE_PRIVACY.WA.type, 'targeting');
if (S.US_STATE_PRIVACY.TX.revenue_usd) { console.error('  FAIL: TDPSA must have NO revenue threshold'); fail++; }
// EU member-state derogations
chk('DE consent age 16', S.EU_MEMBER_DEROGATIONS.DE.consent_age, 16);
chk('FR consent age 15', S.EU_MEMBER_DEROGATIONS.FR.consent_age, 15);
// shared admin-hierarchy resolver
chk('UK addr', S.resolveAdminHierarchy('Registered office: 10 High St, Edinburgh EH1 2AB').subdivision, 'Scotland');
chk('US addr', S.resolveAdminHierarchy('123 Main St, Los Angeles, CA 90210').subdivision, 'CA');
chk('AE addr', S.resolveAdminHierarchy('Our clinic in Dubai Healthcare City').country, 'AE');
// count of enacted US state laws modelled (sanity)
if (Object.keys(S.US_STATE_PRIVACY).length < 15) { console.error('  FAIL: too few US state laws'); fail++; }
if (fail) { console.error('\n' + fail + ' subjurisdiction assertion(s) FAILED.'); process.exit(1); }
console.log('subjurisdiction OK: UK nations, Gulf emirate authorities, ' + Object.keys(S.US_STATE_PRIVACY).length + ' US state laws (threshold vs targeting), EU derogations, admin-hierarchy resolver.');
