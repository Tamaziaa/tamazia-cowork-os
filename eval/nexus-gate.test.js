'use strict';
// Phase 2.2 — establishment-nexus GATE A (fail-open). An establishment-ONLY framework (required_nexus=['established_in'])
// must NOT attach to a firm established in a DIFFERENT family, but MUST stay for a firm established in-jurisdiction, and
// MUST stay when there is no establishment evidence at all (fail-open). DB-backed catalogue; skips without NEON_URL.
const { execFileSync } = require('child_process'); const path = require('path');
if (!process.env.NEON_URL) { console.log('NEON unavailable — nexus-gate test skipped.'); process.exit(0); }
const { connect, loadCatalogue } = require('../src/lib/compliance/connect.js');
const { buildSignals } = require('../src/lib/compliance/signals.js');
const cat = loadCatalogue();
let fail = 0; const chk = (n, ok) => { if (!ok) { console.error('  FAIL ' + n); fail++; } };
function fws(jur, sec, corpus) {
  const sg = buildSignals({ jurisdictions: jur, sector: sec, corpusText: corpus });
  return connect({ catalogue: cat, jurisdictions: jur, sector: sec, signals: sg, text: corpus }).frameworks;
}
// A) US-incorporated law firm serving UK -> established in US, not UK -> UK_SRA_* (estab-only) must NOT attach
const a = fws(['GB','US'], 'legal', 'Smith & Co LLC, incorporated in Delaware, registered in New York. We also serve clients in the United Kingdom. We process personal data; privacy policy.');
chk('US-incorporated firm serving UK: no UK_SRA_* (established elsewhere)', !a.some(f => f.startsWith('UK_SRA')));
chk('US-incorporated firm serving UK: no UK_COMPANIES_ACT', !a.includes('UK_COMPANIES_ACT'));
// B) UK-registered law firm -> established in UK -> UK_SRA_* MUST stay
const b = fws(['GB'], 'legal', 'Smith & Co Solicitors, a limited company registered in England, Companies House number 09876543; our London office provides conveyancing and legal advice. We process personal data; privacy policy.');
chk('UK-registered solicitors keep UK_SRA_TRANSPARENCY', b.includes('UK_SRA_TRANSPARENCY'));
// C) fail-open: thin UK firm, no establishment evidence -> establishment-only stays (never punished)
const c = fws(['GB'], 'legal', 'Our solicitors provide legal advice. We process personal data; privacy policy.');
chk('fail-open: thin UK solicitors still get UK_SRA_TRANSPARENCY', c.includes('UK_SRA_TRANSPARENCY'));
if (fail) { console.error('\n' + fail + ' nexus-gate assertion(s) FAILED.'); process.exit(1); }
console.log('nexus-gate OK: established-elsewhere removes estab-only; in-jurisdiction + no-evidence keep it.');
