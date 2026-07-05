'use strict';
// Phase 1.4.2-1.4.6 — typed nexus detection (GDPR Art 3 / EDPB Guidelines 3/2018). Offline: buildSignals().nexus.
// Locks the worked examples: mere mention != nexus; combination-of-factors = serves; establishment is distinct.
const { buildSignals } = require('../src/lib/compliance/signals.js');
const nx = (jur, corpus) => buildSignals({ jurisdictions: jur, corpusText: corpus }).nexus || {};
let fail = 0; const chk = (n, got, want) => { if (got !== want) { console.error('  FAIL ' + n + ': got ' + got + ' want ' + want); fail++; } };
// 1. US firm that merely MENTIONS the EU (English only, $ prices, no shipping/ccTLD) -> EU serves NOT held
let n = nx(['US','EU'], 'US-based consultancy. Prices in $. We occasionally advise clients based in Europe.');
chk('weak-mention EU serves=false', (n.EU||{}).serves_customers_in, false);
chk('weak-mention EU established=false', (n.EU||{}).established_in, false);
// 2. US e-commerce genuinely TARGETING the EU (EUR + ships to Germany + .de) -> EU serves held
n = nx(['US','EU'], 'Shop online. Prices shown in €. We ship to Germany, France and across the EU. Visit shop.de today.');
chk('targeting EU serves=true', (n.EU||{}).serves_customers_in, true);
// 3. UK-incorporated entity -> UK established held
n = nx(['UK'], 'Acme Advisory Ltd, a limited company registered in England, Companies House number 09876543. Our London office.');
chk('UK established=true', (n.UK||{}).established_in, true);
// 4. Local firm with analytics but NO EU targeting -> EU processes NOT held (tracking alone insufficient)
n = nx(['US','EU'], 'US clinic. We use Google Analytics and cookies. Prices in $. English only.');
chk('analytics-only EU processes=false', (n.EU||{}).processes_residents_of, false);
// 5. UK firm genuinely serving UK (£ + +44 + ships UK) -> UK serves held
n = nx(['UK'], 'We ship across the UK. Prices in £ (GBP). Call us on +44 20 7000 0000. UK-wide clients.');
chk('UK serves=true', (n.UK||{}).serves_customers_in, true);
// 6. tracking + real EU targeting -> EU processes held
n = nx(['EU'], 'Prices in €. We serve customers across the EU. We use cookies and remarketing pixels. shop.de');
chk('tracking+targeting EU processes=true', (n.EU||{}).processes_residents_of, true);
if (fail) { console.error('\n' + fail + ' nexus-signal assertion(s) FAILED.'); process.exit(1); }
console.log('nexus-signal detection OK: mention!=nexus, combination=serves, establishment distinct, tracking+nexus=processes.');
