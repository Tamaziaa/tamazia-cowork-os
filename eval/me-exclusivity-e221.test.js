'use strict';
// E-221 (v22.5.1) — FREE-ZONE EXCLUSIVITY + DIFC-Courts guard. A UAE firm carries exactly ONE ME data regime:
// DIFC/ADGM establishment DISPLACES federal PDPL; 'DIFC Courts' advocacy is not establishment. Root cause of
// the fichtelegal V02_multiple_me_data_regimes x10 quarantine class on 11 Jul.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { connect, loadCatalogue } = require(path.join(ROOT, 'src/lib/compliance/connect.js'));

let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };
const cat = loadCatalogue();
if (!(cat.frameworks || []).length) { console.log('me-exclusivity: no catalogue (no DB) — skipping live assertions, structural pass'); process.exit(0); }
const fw = (text, sector) => connect({
  catalogue: cat, jurisdictions: ['AE'], sector: sector || 'law-firms',
  signals: { nexus: { AE: { established_in: 'registered_country:AE', source: 'company_registration' } } }, text,
}).frameworks;

t('DIFC-established firm -> DIFC_DPL displaces UAE_PDPL (never a stack)', () => {
  const f = fw('Our firm is registered in the DIFC, licensed by the DFSA. Dubai International Financial Centre. Privacy policy and personal data notice.');
  if (!f.includes('DIFC_DPL')) throw new Error('DIFC_DPL missing: ' + f.join(','));
  if (f.includes('UAE_PDPL')) throw new Error('UAE_PDPL stacked with DIFC_DPL');
});
t('mainland Dubai firm -> UAE_PDPL only, no free-zone regime', () => {
  const f = fw('We are a law firm based in mainland Dubai, United Arab Emirates. Privacy policy and personal data notice.');
  if (!f.includes('UAE_PDPL')) throw new Error('UAE_PDPL missing: ' + f.join(','));
  if (f.includes('DIFC_DPL') || f.includes('ADGM_DPR')) throw new Error('free-zone regime leaked: ' + f.join(','));
});
t('DIFC COURTS advocacy (registered before the court) is NOT DIFC establishment', () => {
  const f = fw('Our litigators are registered with the DIFC Courts and appear regularly before the DIFC Courts. Based in Dubai. Privacy policy and personal data notice.');
  if (f.includes('DIFC_DPL')) throw new Error('DIFC_DPL attached on court-advocacy text');
  if (!f.includes('UAE_PDPL')) throw new Error('UAE_PDPL missing: ' + f.join(','));
});
t('at most ONE of UAE_PDPL/DIFC_DPL/ADGM_DPR in every ME connect result', () => {
  const texts = [
    'Registered in the DIFC, regulated by the DFSA. Gate Village. Privacy policy.',
    'ADGM-registered entity, licensed by the FSRA, Al Maryah Island. Privacy policy.',
    'Dubai based consultancy. Privacy policy and data protection notice.',
  ];
  for (const tx of texts) {
    const f = fw(tx, 'finance');
    const me = f.filter((x) => ['UAE_PDPL', 'DIFC_DPL', 'ADGM_DPR'].includes(x));
    if (me.length > 1) throw new Error('ME stack on "' + tx.slice(0, 40) + '": ' + me.join(','));
  }
});
console.log(bad ? 'E221 ME EXCLUSIVITY: FAIL' : 'E221 ME EXCLUSIVITY: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
