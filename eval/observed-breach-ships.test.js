'use strict';
/**
 * A BROWSER OBSERVATION IS NOT A MISSING DOCUMENT.
 *
 * The live audit went out with 16 binding frameworks and ZERO compliance findings, while this sat in needs_review:
 *
 *     "Third-party tracking requests fire on page load, before any consent is given"
 *
 * That is the PECR breach. Up to GBP 17.5m under the Data (Use and Access) Act 2025. Near-universal on law-firm
 * sites. It is the entire product, and it was being withheld.
 *
 * WHY: _kindOf() mapped EVERY compliance finding to 'absence'. An absence confirms only on a verbatim quote or
 * checked_urls, because "a required disclosure is missing" is a claim about something we could NOT find, and that
 * needs proof we actually looked. But a browser observation is not an absence — it is something we WATCHED HAPPEN,
 * carrying the strongest evidence we ever produce: the network requests themselves. It has no quote and no
 * checked_urls, because those are artefacts of reading a document, and it did not come from a document.
 *
 * So every browser-observed compliance breach was STRUCTURALLY INCAPABLE of shipping. The engine already knew —
 * the finding carries absence_evidence.state = 'observed_in_browser' and adjudication = 'observed_fact'. It had
 * been adjudicated. Nobody asked it.
 */
const A = require('assert');
const path = require('path');
const ft = require(path.resolve(__dirname, '..', 'src/lib/audit/finding-trust.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };
const ctx = { corpus_adequate: true, jurisdictions: ['UK'] };
const cls = (f) => ft.classifyAll([f], ctx)[0];

// The REAL PECR finding, copied from the live russell-cooke payload.
const PECR = {
  fact: 'Third-party tracking requests fire on page load, before any consent is given',
  bucket: 'compliance', framework_short: 'UK_PECR', citation: 'UK_PECR', rule_type: 'prohibit',
  evidence: 'https://russell-cooke.co.uk/', page: 'https://russell-cooke.co.uk/',
  severity: 'P1', adjudicated: true, adjudication: 'observed_fact',
  absence_evidence: { state: 'observed_in_browser', requirement: 'no non-essential tracking before consent' },
  citation_url: 'https://www.legislation.gov.uk/uksi/2003/2426/regulation/6',
  checked_urls: null, evidence_quote: null,
};

t('THE PECR BREACH SHIPS: a browser-observed pre-consent tracker is CONFIRMED', () => {
  const c = cls(PECR);
  A.strictEqual(c.kind, 'observed', 'a fact we watched happen is not an absence');
  A.strictEqual(c.state, 'CONFIRMED',
    'the near-universal PECR breach was withheld from every audit. It is the product.');
});

t('any of the three observation stamps is enough', () => {
  A.strictEqual(cls({ ...PECR, adjudication: null }).state, 'CONFIRMED', 'absence_evidence.state alone');
  A.strictEqual(cls({ ...PECR, absence_evidence: null }).state, 'CONFIRMED', 'adjudication=observed_fact alone');
  A.strictEqual(cls({ ...PECR, adjudication: null, absence_evidence: null, observed: true }).state, 'CONFIRMED', 'observed:true alone');
});

t('a GENUINE absence still needs proof we looked (no regression)', () => {
  const missingDoc = {
    fact: 'No cookie policy could be found', bucket: 'compliance', framework_short: 'UK_PECR',
    citation: 'UK_PECR', rule_type: 'require', checked_urls: null, evidence_quote: null,
  };
  A.strictEqual(cls(missingDoc).kind, 'absence');
  A.strictEqual(cls(missingDoc).state, 'NEEDS_REVIEW',
    'an unevidenced "it is missing" must STILL be held back — we have not proved we looked');
  A.strictEqual(cls({ ...missingDoc, checked_urls: ['https://x/privacy'] }).state, 'CONFIRMED',
    'once we show the pages we inspected, the absence confirms');
});

t('an observation from an ARCHIVE snapshot is NEVER a current breach', () => {
  // No browser watched anything. The trackers we would report may have been removed months ago. Confirming this
  // would accuse a firm of a breach it may have already fixed.
  const c = ft.classifyAll([PECR], { ...ctx, via_archive: true })[0];
  A.strictEqual(c.kind, 'observed');
  A.strictEqual(c.state, 'NEEDS_REVIEW', 'a pre-consent tracker read off a Wayback snapshot must NOT confirm');
  A.ok(c.signals.includes('archive_snapshot'));
});

t('a finding the evidence gate demoted is never re-confirmed here', () => {
  A.strictEqual(cls({ ...PECR, gate_reason: 'corpus_inadequate' }).state, 'NEEDS_REVIEW',
    'the scanner evidence gate is authoritative');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
