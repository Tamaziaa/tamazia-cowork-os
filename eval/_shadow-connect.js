'use strict';
// Deterministic shadow matrix over connect()'s decision space: every canonical sector x jurisdiction-combo x corpus
// archetype. Emits a stable sorted snapshot of attached frameworks per cell. Used to prove a refactor changes NOTHING.
const crypto = require('crypto');
const { connect, loadCatalogue } = require('../src/lib/compliance/connect.js');
const { buildSignals } = require('../src/lib/compliance/signals.js');
const { CANONICAL_SECTORS } = require('../src/lib/compliance/registry/sector.js');
const cat = loadCatalogue();
const JURS = [['GB'], ['US'], ['GB','US'], ['AE'], ['GB','AE'], ['SA'], ['QA'], ['BH'], ['FR']];
const CORPORA = {
  empty: '',
  privacy: 'We collect personal data via forms and use cookies; privacy policy. Contact us.',
  payments: 'Book online and pay. Checkout, subscription plan, prices from £99 per month. We process personal data; cookies.',
  ai: 'Our AI system uses a machine learning model and chatbot for automated decision-making. We process personal data.',
  estab_uk: 'A limited company registered in England, Companies House number 09876543; our London office. We process personal data.',
  estab_us: 'Smith LLC, incorporated in Delaware, EIN registered. We also serve clients in the UK. We process personal data.',
};
const rows = [];
for (const sec of [...CANONICAL_SECTORS].sort()) {
  for (const jur of JURS) {
    for (const ck of Object.keys(CORPORA)) {
      const corpus = CORPORA[ck];
      const sg = buildSignals({ jurisdictions: jur, sector: sec, corpusText: corpus });
      let fws = [];
      try { fws = connect({ catalogue: cat, jurisdictions: jur, sector: sec, signals: sg, text: corpus }).frameworks; }
      catch (e) { fws = ['THROW:' + (e.guardrail || e.message)]; }
      rows.push(`${sec}|${jur.join('+')}|${ck}=>${fws.slice().sort().join(',')}`);
    }
  }
}
rows.sort();
const body = rows.join('\n');
const hash = crypto.createHash('sha256').update(body).digest('hex');
module.exports = { body, hash, cells: rows.length };
if (require.main === module) {
  const fs = require('fs');
  const out = process.argv[2] || '/tmp/shadow_baseline.txt';
  fs.writeFileSync(out, body);
  console.log(`cells=${rows.length} sha256=${hash}`);
}
