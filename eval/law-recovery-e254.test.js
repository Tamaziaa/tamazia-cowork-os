'use strict';
// E-254 (v23.0) — THE LOST LAW. It was never lost. It was never CONNECTED.
//
// Three law assets sat in Neon and NOT ONE reached an audit:
//   * compliance_laws: 79 laws with a written website_obligation and detection_rules = [], linked to ZERO rules,
//     referenced by ZERO engine files. Among them: the Electronic Commerce (EC Directive) Regulations 2002 (which
//     oblige EVERY UK site to publish trading name, geographic address, email, company number and, for a regulated
//     profession, its regulator and authorisation number), the Legal Services Act 2007 (reserved-activity
//     authorisation, a CORE law-firm statute), Germany's Impressumspflicht and France's mentions légales.
//   * framework_candidates: 151 laws DISCOVERED by the self-learning loop, every one still status='candidate'.
//   * statute_chunks: 908 statute chunks. statute-rag.js reads them. No mint calls it.
//
// AND THE GATE THAT HID THEM: UNIVERSAL_FW is derived from BASELINE_BY_FAMILY alone, and fwSectorOK() DROPS any
// framework with an empty sector_relevance unless it is in UNIVERSAL_FW. So a law binding every commercial website
// that is not listed in the baseline is SILENTLY REMOVED FROM EVERY AUDIT.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require('assert');
const C = require(path.join(ROOT, 'src/lib/compliance/connect.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('E-254: the E-Commerce Regs 2002 are in the UK baseline — they bind EVERY UK commercial website', () => {
  A.ok(C.BASELINE_BY_FAMILY.UK.established.includes('UK_ECOMMERCE_2002'),
    'UK_ECOMMERCE_2002 must be a UK baseline law or fwSectorOK silently drops it from every audit');
  A.ok(C.UNIVERSAL_FW.has('UK_ECOMMERCE_2002'), 'and therefore it must be in UNIVERSAL_FW');
});

t('E-254: Germany and France have a working baseline (they had none)', () => {
  A.ok(C.BASELINE_BY_FAMILY.DE && C.BASELINE_BY_FAMILY.DE.established.includes('DE_IMPRESSUM'),
    'Germany: the Impressumspflicht is the most-breached law on any German site');
  A.ok(C.BASELINE_BY_FAMILY.FR && C.BASELINE_BY_FAMILY.FR.established.includes('FR_LCEN'),
    'France: mentions légales under LCEN art.6-III');
  A.ok(C.UNIVERSAL_FW.has('DE_IMPRESSUM') && C.UNIVERSAL_FW.has('FR_LCEN'));
});

t('E-254 THE INVARIANT: every baseline law is universal, so it can never be dropped by the sector gate', () => {
  for (const [fam, v] of Object.entries(C.BASELINE_BY_FAMILY)) {
    for (const fw of [...v.established, ...v.serves]) {
      A.ok(C.UNIVERSAL_FW.has(fw), fam + ' baseline law ' + fw + ' is NOT in UNIVERSAL_FW — fwSectorOK will silently drop it');
    }
  }
});

t('E-254: a UK law firm attaches BOTH the E-Commerce Regs and the Legal Services Act', () => {
  if (!process.env.NEON_URL) { console.log('   (skipped: no NEON_URL in this environment)'); return; }
  const cat = C.loadCatalogue();
  const r = C.connect({ catalogue: cat, jurisdictions: ['UK'], sector: 'law-firms', signals: {}, text: 'Authorised and regulated by the Solicitors Regulation Authority' });
  const fw = r.frameworks.map((f) => (typeof f === 'object' ? f.framework_short : f));
  A.ok(fw.includes('UK_ECOMMERCE_2002'), 'the E-Commerce Regs must attach to a UK law firm. Got: ' + fw.join(','));
  A.ok(fw.includes('UK_LEGAL_SERVICES_2007'), 'the Legal Services Act must attach to a law firm. Got: ' + fw.join(','));
});

console.log(bad ? 'E254 LAW RECOVERY: FAIL' : 'E254 LAW RECOVERY: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
