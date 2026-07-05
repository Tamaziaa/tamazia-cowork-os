'use strict';
// Phase 4.1.2 — adversarial / red-team fixtures. Locks the engine against its classic false-attach traps.
// DB-backed catalogue; skips without NEON_URL.
const assert = require('assert');
if (!process.env.NEON_URL) { console.log('NEON unavailable — red-team fixtures skipped.'); process.exit(0); }
const { connect, loadCatalogue } = require('../src/lib/compliance/connect.js');
const { buildSignals } = require('../src/lib/compliance/signals.js');
const cat = loadCatalogue();
const fw = (jur, sec, corpus) => connect({ catalogue: cat, jurisdictions: jur, sector: sec, signals: buildSignals({ jurisdictions: jur, sector: sec, corpusText: corpus }), text: corpus }).frameworks;
let fail = 0; const chk = (n, ok) => { if (!ok) { console.error('  FAIL ' + n); fail++; } };

// 1. INCIDENTAL FOREIGN KEYWORD — a US firm that merely name-drops France gets no French/German/EU law.
const t1 = fw(['US'], 'tech', 'US company in California. We once toured an office in France for a conference. Privacy policy.');
chk('incidental France mention -> no FR/DE/EU law', !t1.some(f => f.startsWith('FR_') || f.startsWith('DE_') || f === 'EU_GDPR'));

// 2. DIFC vs MAINLAND — establishment, not mention, decides the free-zone regime.
const difc = fw(['AE'], 'finance', 'Our firm is registered in the DIFC, licensed by the DFSA. Dubai International Financial Centre. Privacy policy.');
chk('DIFC-registered -> DIFC_DPL attaches', difc.includes('DIFC_DPL'));
const mainland = fw(['AE'], 'professional-services', 'We help you set up a company in the DIFC. Based in mainland Dubai. Privacy policy.');
chk('mainland firm selling DIFC setup -> NO DIFC_DPL', !mainland.includes('DIFC_DPL'));
chk('mainland UAE firm -> UAE_PDPL', mainland.includes('UAE_PDPL'));

// 3. INCIDENTAL US MENTION — a UK retailer that loves American culture gets no US privacy law.
const t3 = fw(['GB'], 'retail', 'UK shop. We love American culture and sell British goods. Privacy policy.');
chk('incidental US mention (UK firm) -> no US_ law', !t3.some(f => f.startsWith('US_')));

// 4. NODE-EXCLUSION TRAP — barristers get BSB, never SRA (solicitors' regulator).
const bar = fw(['GB'], 'barristers', 'London chambers, our barristers, direct access, KC and junior counsel.');
chk('barristers -> UK_BSB', bar.includes('UK_BSB'));
chk('barristers -> NO UK_SRA_*', !bar.some(f => f.startsWith('UK_SRA')));

// 5. EMPTY / ROBUSTNESS — no jurisdiction, no sector => no attachment, no crash.
let crashed = false; try { const e = fw([], '', ''); chk('empty input -> no frameworks', e.length === 0); } catch (_) { crashed = true; }
chk('empty input does not crash', !crashed);

if (fail) { console.error('\n' + fail + ' red-team fixture(s) FAILED.'); process.exit(1); }
console.log('red-team OK: incidental-keyword, DIFC-vs-mainland, node-exclusion, robustness traps all held.');
