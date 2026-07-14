'use strict';
/**
 * THE CORPUS WAS TRUNCATED AT 4,000 CHARACTERS, AND WE MADE FALSE ACCUSATIONS AGAINST LAW FIRMS.
 *
 * site-scan.js fed the compliance scanner `htmlToText(body).slice(0, 4000)`. Four thousand characters is roughly
 * the first 600 words of a page - the hero and the opening paragraph. EVERY footer disclosure lives after that:
 *
 *     the SRA authorisation statement, the company number, the registered office, the VAT number,
 *     the privacy-policy link, the complaints procedure.
 *
 * Those are EXACTLY the facts our ABSENCE rules look for. The scanner could not see them, concluded they were
 * missing, and we told law firms they were in breach of the SRA Code, the Legal Services Act, and Companies Act
 * s.82 - for facts that were sitting in their own footer.
 *
 * MEASURED, not assumed. On russell-cooke.co.uk the SRA statement appears at character 11,080. We cut at 4,000.
 * Three of eight footer facts were PRESENT ON THE PAGE and INVISIBLE to the scanner.
 *
 * Two changes, and they must BOTH hold:
 *   1. the cap is now 200,000 chars (still a cap - an unbounded corpus is a memory and LLM-cost risk);
 *   2. if we DID have to truncate, an "it is missing" claim is no longer one we are entitled to make, so the
 *      classifier demotes it to NEEDS_REVIEW. Silence is free. A false accusation against a law firm is not.
 */
const A = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fs = require('fs');
const ft = require(path.join(ROOT, 'src/lib/audit/finding-trust.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('THE CAP IS NOT 4,000. The footer must be readable.', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/audit/site-scan.js'), 'utf8');
  A.ok(!/htmlToText\(b\)\.slice\(0, 4000\)/.test(src),
    'the corpus is truncated at 4,000 chars again - every footer disclosure is invisible and every absence finding '
    + 'about one is a FALSE ACCUSATION against a law firm');
  A.ok(/CORPUS_MAX_CHARS \|\| 200000/.test(src), 'the cap must be 200,000 chars (still a cap, but past the footer)');
  A.ok(/corpus_truncated/.test(src), 'site-scan must EMIT whether it had to truncate');
});

t('AN ABSENCE CANNOT CONFIRM ON A TRUNCATED CORPUS', () => {
  const absence = {
    fact: 'The firm does not state its SRA authorisation', bucket: 'compliance',
    framework_short: 'UK_LEGAL_SERVICES_2007', citation: 'UK_LEGAL_SERVICES_2007',
    rule_type: 'require', checked_urls: ['https://x/'],
  };
  const full = ft.classifyAll([absence], { corpus_adequate: true, jurisdictions: ['UK'] })[0];
  A.strictEqual(full.state, 'CONFIRMED', 'on a FULL corpus, an evidenced absence still ships');

  const cut = ft.classifyAll([absence], { corpus_adequate: true, jurisdictions: ['UK'], corpus_truncated: true })[0];
  A.strictEqual(cut.state, 'NEEDS_REVIEW',
    'the thing may be in the part we did not read - we are not entitled to call it missing');
  A.ok(cut.signals.includes('corpus_truncated'), 'and the reason must be recorded on the finding');
});

t('A BROWSER OBSERVATION IS UNAFFECTED BY TRUNCATION (it did not come from the text)', () => {
  const obs = {
    fact: 'Third-party tracking requests fire before consent', bucket: 'compliance',
    framework_short: 'UK_PECR', citation: 'UK_PECR', evidence: 'https://x/',
    adjudication: 'observed_fact', absence_evidence: { state: 'observed_in_browser' },
  };
  const cut = ft.classifyAll([obs], { jurisdictions: ['UK'], corpus_truncated: true })[0];
  A.strictEqual(cut.kind, 'observed');
  A.strictEqual(cut.state, 'CONFIRMED',
    'the PECR breach is proved by the network requests, not by the page text - truncation is irrelevant to it');
});

t('build.js PASSES the flag through (a flag nobody reads is not a guard)', () => {
  const b = fs.readFileSync(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'), 'utf8');
  A.ok(/corpus_truncated:\s*!!\(scan/.test(b), 'build.js must pass signals.corpus_truncated into classifyAll');
});


t('THE REAL #1 BUG: the SRA-number regex missed the phrasing firms actually use', () => {
  // birketts.co.uk displays, verbatim: "SRA Registration No: 441849". A perfect, compliant disclosure.
  // The old pattern was /(?:SRA|BSB|CLC)\s*(?:no|number|ref)?\.?\s*:?\s*\d{4,7}/i - it allows "SRA No: 441849"
  // but NOT "SRA Registration No: 441849", because the word "Registration" is not in the optional group. So we
  // told a top-100 UK law firm it was in P0 breach of the Legal Services Act, for a number printed in its footer.
  // 5 of 12 real-world phrasings failed. The pattern lives in the CATALOGUE (compliance_rules.regex_elements),
  // which is why this test asserts on the pattern's BEHAVIOUR, not on a source file.
  const RX = /(?:(?:SRA|BSB|CLC)\b(?:[\s,:()\-]*(?:registration|registered|authorisation|authorization|regulation|reg|no|number|nos|ref|reference|id)\b\.?)*[\s,:()\-]*(\d{5,7})\b|regulated by the (?:Solicitors Regulation Authority|Bar Standards Board)[^0-9]{0,40}(\d{5,7})\b)/i;
  const MUST_MATCH = [
    'SRA Registration No: 441849', 'SRA registration number 441849', 'SRA number 441849',
    'SRA No. 441849', 'SRA ID 441849', 'SRA ref: 441849', 'SRA 441849',
    'SRA authorisation number: 441849', 'SRA Reg No 441849',
    'regulated by the Solicitors Regulation Authority under number 441849',
  ];
  const MUST_NOT_MATCH = [   // matching these would HIDE a real breach or invent a number from a YEAR
    'SRA rules 2019', 'SRA Transparency Rules 2018', 'SRA Standards and Regulations 2019',
    'the SRA fined a firm in 2024', 'SRA Code of Conduct 2011', 'we follow SRA guidance',
  ];
  for (const s of MUST_MATCH) A.ok(RX.test(s), 'a REAL disclosure must not be read as a breach: ' + s);
  for (const s of MUST_NOT_MATCH) A.ok(!RX.test(s), 'a year is not a registration number: ' + s);
});

t('COVERAGE INTERLOCK: one page is a glance, not a search', () => {
  const absence = {
    fact: 'The firm does not state its SRA authorisation', bucket: 'compliance',
    framework_short: 'UK_LEGAL_SERVICES_2007', citation: 'UK_LEGAL_SERVICES_2007',
    rule_type: 'require', checked_urls: ['https://birketts.co.uk/'],
  };
  // birketts 403s every sub-page. We got ONE page. Their /legal page - where the authorisation statement lives -
  // we never read. Accusing them of omitting it is not a finding, it is a guess with a P0 on it.
  A.strictEqual(ft.classifyAll([absence], { corpus_adequate: true, jurisdictions: ['UK'], pages_fetched: 1 })[0].state,
    'NEEDS_REVIEW', 'one page is not a search');
  A.strictEqual(ft.classifyAll([absence], { corpus_adequate: true, jurisdictions: ['UK'], pages_fetched: 3 })[0].state,
    'CONFIRMED', 'three pages or more and the claim stands');
  // and the PECR breach is UNAFFECTED - it is proved by network requests, not by how much of the site we read.
  const obs = { fact: 'trackers fire pre-consent', bucket: 'compliance', citation: 'UK_PECR',
    evidence: 'https://x/', adjudication: 'observed_fact' };
  A.strictEqual(ft.classifyAll([obs], { jurisdictions: ['UK'], pages_fetched: 1 })[0].state, 'CONFIRMED',
    'a browser observation does not depend on crawl breadth');
});

t('build.js passes pages_fetched through (a guard nobody feeds is not a guard)', () => {
  const b = fs.readFileSync(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'), 'utf8');
  A.ok(/pages_fetched:/.test(b), 'build.js must pass pages_fetched into classifyAll');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
