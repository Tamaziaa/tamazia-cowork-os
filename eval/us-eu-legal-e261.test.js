'use strict';
// E-261 (v23.3) — THE US AND EU LAW-FIRM WEBSITE REGIMES. They were never written.
//
// "we had a lot of resources, check the full repo, there must be laws"
// There ARE: 132 US rules and 112 EU rules. But they are HIPAA (36), FTC, TCPA, BIPA, CPRA, GLBA, COPPA —
// healthcare, consumer, privacy and finance. US HEALTHCARE is 38 rules and genuinely strong.
// US LEGAL was 5 rules and EU LEGAL was 2, because nobody ever wrote the LAW-FIRM WEBSITE regime:
//   US  — ABA Model Rules 7.1-7.3: no false or misleading communication; no unsubstantiated superlatives; no
//         guarantee of outcome; past-results disclaimer; no implied specialisation without a NAMED certifying body;
//         at least one responsible lawyer/firm and an office address. Adopted in substance by every state bar.
//   EU  — Services Directive 2006/123 Art.22 and E-Commerce Directive 2000/31 Art.5, BOTH of which carry a specific
//         limb for REGULATED PROFESSIONS: the professional body, the professional title, the Member State that
//         granted it, and a reference to the applicable professional rules.
const path = require('path');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
const C = require(path.join(ROOT, 'src/lib/compliance/connect.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('E-261: the EU instruments are in the EU baseline (or fwSectorOK silently drops them — the E-254 bug)', () => {
  A.ok(C.BASELINE_BY_FAMILY.EU.established.includes('EU_SERVICES_DIRECTIVE'),
    'Services Directive Art.22 binds EVERY EU provider and carries NO sector tag. Without a baseline entry it is dropped from every audit — exactly how the E-Commerce Regs 2002 stayed hidden for months.');
  A.ok(C.BASELINE_BY_FAMILY.EU.established.includes('EU_ECD_ART5'));
  A.ok(C.UNIVERSAL_FW.has('EU_SERVICES_DIRECTIVE') && C.UNIVERSAL_FW.has('EU_ECD_ART5'));
});

t('E-261 THE INVARIANT holds: every baseline law is universal', () => {
  for (const [fam, v] of Object.entries(C.BASELINE_BY_FAMILY)) {
    for (const fw of [...v.established, ...v.serves]) {
      A.ok(C.UNIVERSAL_FW.has(fw), fam + ' baseline law ' + fw + ' is not in UNIVERSAL_FW — fwSectorOK will silently drop it');
    }
  }
});

if (!process.env.NEON_URL) { console.log('   (live attachment checks skipped: no NEON_URL)'); }
else {
  const cat = C.loadCatalogue();
  const fwOf = (jurs, sector, text) => C.connect({ catalogue: cat, jurisdictions: jurs, sector, signals: {}, text })
    .frameworks.map((f) => (typeof f === 'object' ? f.framework_short : f));

  t('E-261: a US law firm attaches the ABA Model Rules', () => {
    const fw = fwOf(['US'], 'law-firms', 'Attorneys at Law. 100 Main Street, Austin, TX 78701');
    A.ok(fw.includes('US_ABA_MODEL_RULES'), 'the ABA Model Rules ARE the US law-firm website regime. Got: ' + fw.join(','));
    A.ok(fw.includes('US_ABA_SPECIALIST'));
  });

  t('E-261: an EU law firm attaches the Services Directive and the ECD', () => {
    const fw = fwOf(['DE', 'EU'], 'law-firms', 'Rechtsanwaltskammer Berlin. Kanzlei GmbH. HRB 12345.');
    A.ok(fw.includes('EU_SERVICES_DIRECTIVE'), 'Art.22 binds every EU lawyer. Got: ' + fw.join(','));
    A.ok(fw.includes('EU_ECD_ART5'));
  });

  t('E-261 NO LEAKAGE: a UK firm gets NEITHER the ABA rules NOR the EU instruments', () => {
    const fw = fwOf(['UK'], 'law-firms', 'Authorised and regulated by the Solicitors Regulation Authority');
    A.ok(!fw.includes('US_ABA_MODEL_RULES'), 'the ABA does not regulate an English solicitor');
    A.ok(!fw.includes('EU_SERVICES_DIRECTIVE'), 'post-Brexit the Services Directive does not bind a UK-only firm');
  });
}

console.log(bad ? 'E261 US/EU LEGAL: FAIL' : 'E261 US/EU LEGAL: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
