'use strict';
// eval/element-checklist-candidates.test.js
// OFFLINE PROOF for the two AUTHOR-ONLY element_checklist candidate rules in
// db/candidates/element-checklist-rules.json (Branch 8 prep, V1 defect C10).
// Runs each candidate through the REAL ruleCheck() element_checklist branch against
// synthetic corpora. Proves, per element: zero false-present, zero false-absent,
// and exact per-element localisation (missing_elements is EXACTLY the removed label).
// Nothing here touches the DB or the live catalogue — pure in-process verification.

let ruleCheck;
try { ({ ruleCheck } = require('../src/skills/S008-personalisation-engine/scanners/compliance.js')); }
catch (e) { console.error('CANNOT LOAD ruleCheck: ' + e.message); process.exit(1); }

const fs = require('fs');
const path = require('path');
const CAND = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'candidates', 'element-checklist-rules.json'), 'utf8'));
const byRuleId = {};
for (const r of CAND.rules) byRuleId[r.rule_id] = r;

let fail = 0, pass = 0;
function ok(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.error(`  FAIL ${name}: got ${g} want ${w}`); fail++; }
  else { console.log(`  PASS ${name}`); pass++; }
}
// eq helper for arrays regardless of order
const sorted = (a) => (a || []).slice().sort();

// ---------------------------------------------------------------------------
// A COMPLETE privacy notice that satisfies EACH of the 8 UK GDPR Article 13 elements.
// Each sentence is tagged with the element it proves, so we can surgically remove one.
// ---------------------------------------------------------------------------
const A13_SENTENCES = {
  "the identity and contact details of the controller (Art 13(1)(a))":
    "Acme Ltd is the data controller of your personal information; our registered office is 1 High Street, London, and you can contact us at info@acme.example.",
  "the contact details of the DPO where one is appointed (Art 13(1)(b))":
    "We have appointed a Data Protection Officer who can be reached at dpo@acme.example for any privacy queries.",
  "the purposes of the processing (Art 13(1)(c))":
    "The purposes of the processing are to fulfil your order and to provide customer support; we use your data in order to deliver the service you requested.",
  "the lawful basis for the processing (Art 13(1)(c))":
    "Our lawful basis for processing is the performance of a contract with you, and in some cases your consent or our legitimate interests.",
  "the recipients or categories of recipients (Art 13(1)(e))":
    "We share your data with our payment processor and delivery partners; the categories of recipient include IT service providers acting as processors.",
  "international transfers and safeguards (Art 13(1)(f))":
    "Where we transfer your personal data outside the UK we rely on standard contractual clauses and appropriate safeguards to protect it.",
  "the retention period or criteria (Art 13(2)(a))":
    "Our retention policy sets out how long we keep your data: we retain personal information for a period of six years where necessary to meet legal obligations.",
  "the data-subject rights including the right to complain to the ICO (Art 13(2)(b),(d))":
    "You have rights including the right to access, rectification and erasure of your data, and the right to complain to the ICO (Information Commissioner's Office)."
};
const A13_LABELS = Object.keys(A13_SENTENCES);
const A13_FULL_BODY = A13_LABELS.map(l => A13_SENTENCES[l]).join(' ');
const a13Corpus = (body) => [{ url: 'https://acme.example/privacy-policy', body }];

// DECOY sentences: superficially related wording that must NOT match the element pattern
// (proves no false-present / over-match). One decoy per element.
const A13_DECOYS = {
  "the identity and contact details of the controller (Art 13(1)(a))":
    "Our air-conditioning units include a temperature control panel for your comfort.",
  "the contact details of the DPO where one is appointed (Art 13(1)(b))":
    "The DPOX2000 industrial pump is our best-selling product this quarter.",
  "the purposes of the processing (Art 13(1)(c))":
    "Our food processing plant operates to the highest hygiene standards.",
  "the lawful basis for the processing (Art 13(1)(c))":
    "Please read the rules of the game before you begin playing.",
  "the recipients or categories of recipients (Art 13(1)(e))":
    "Award recipients will be announced at the annual gala dinner.",
  "international transfers and safeguards (Art 13(1)(f))":
    "Bank transfer is available at checkout alongside card payment.",
  "the retention period or criteria (Art 13(2)(a))":
    "Water retention in plants is affected by soil quality.",
  "the data-subject rights including the right to complain to the ICO (Art 13(2)(b),(d))":
    "The icon set was redesigned to improve visual clarity."
};

// ---------------------------------------------------------------------------
// TEST 1 — A13: known-complete policy -> hit, no missing elements.
// ---------------------------------------------------------------------------
console.log('\n== UK_GDPR_A13 / A13_ELEMENTS ==');
const A13 = byRuleId['A13_ELEMENTS'];
if (!A13) { console.error('A13_ELEMENTS candidate missing'); process.exit(1); }
{
  const res = ruleCheck(A13, a13Corpus(A13_FULL_BODY), null, null);
  ok('complete policy -> status hit', res.status, 'hit');
  ok('complete policy -> zero missing elements', sorted(res.missing_elements || []), []);
  ok('complete policy -> all 8 present', sorted(res.present_elements), sorted(A13_LABELS));
}

// TEST 2 — A13: remove EACH element -> miss, missing === exactly that one label (localisation).
for (const label of A13_LABELS) {
  const body = A13_LABELS.filter(l => l !== label).map(l => A13_SENTENCES[l]).join(' ');
  const res = ruleCheck(A13, a13Corpus(body), null, null);
  ok(`remove [${label}] -> status miss`, res.status, 'miss');
  ok(`remove [${label}] -> missing is EXACTLY that one label`, sorted(res.missing_elements), [label]);
}

// TEST 3 — A13: per-element decoy corpus (only the decoy, nothing else) -> that element must be ABSENT
// (no false-present). Every OTHER element is also absent, but we assert specifically the target is missing.
for (const label of A13_LABELS) {
  const res = ruleCheck(A13, a13Corpus(A13_DECOYS[label]), null, null);
  ok(`decoy for [${label}] -> element NOT falsely present`, (res.present_elements || []).includes(label), false);
}

// ---------------------------------------------------------------------------
// SRA — complete complaints info that satisfies each of the 4 elements.
// ---------------------------------------------------------------------------
console.log('\n== UK_SRA_TRANSPARENCY / SRA_COMPLAINTS_ELEMENTS ==');
const SRA = byRuleId['SRA_COMPLAINTS_ELEMENTS'];
if (!SRA) { console.error('SRA_COMPLAINTS_ELEMENTS candidate missing'); process.exit(1); }

const SRA_TRIGGER = "Acme Legal LLP is a firm of solicitors regulated by the Solicitors Regulation Authority.";
const SRA_SENTENCES = {
  "how to make a complaint":
    "If you wish to complain about our service, our complaints procedure explains how to make a complaint in writing to the client care partner.",
  "the complaint handling timescales":
    "We will acknowledge your complaint within 5 working days and send a final written response within 8 weeks.",
  "signposting to the Legal Ombudsman":
    "If you are not satisfied you may refer your complaint to the Legal Ombudsman.",
  "the right to complain to the SRA":
    "You also have the right to report your concerns to the SRA where you believe there has been misconduct."
};
const SRA_LABELS = Object.keys(SRA_SENTENCES);
const SRA_FULL = SRA_TRIGGER + ' ' + SRA_LABELS.map(l => SRA_SENTENCES[l]).join(' ');
const sraCorpus = (body) => [{ url: 'https://acme-legal.example/complaints', body }];

const SRA_DECOYS = {
  "how to make a complaint":
    "Customers often complain that the weather in Manchester is unpredictable.",
  "the complaint handling timescales":
    "Our office is open Monday to Friday from 9am to 5pm.",
  "signposting to the Legal Ombudsman":
    "The Parliamentary Ombudsman handles complaints about government departments.",
  "the right to complain to the SRA":
    "The SRAM memory module was upgraded in the latest server refresh."
};

// TEST 4 — SRA: trigger absent (non-legal corpus) -> trigger_absent, no false breach.
{
  const nonLegal = [{ url: 'https://bakery.example/', body: 'We bake fresh sourdough bread and pastries every morning for our customers.' }];
  const res = ruleCheck(SRA, nonLegal, null, null);
  ok('non-legal corpus (no trigger) -> status trigger_absent', res.status, 'trigger_absent');
}

// TEST 5 — SRA: legal corpus with FULL complaints info -> hit, no missing.
{
  const res = ruleCheck(SRA, sraCorpus(SRA_FULL), null, null);
  ok('legal + full complaints -> status hit', res.status, 'hit');
  ok('legal + full complaints -> zero missing', sorted(res.missing_elements || []), []);
  ok('legal + full complaints -> all 4 present', sorted(res.present_elements), sorted(SRA_LABELS));
}

// TEST 6 — SRA: trigger present, remove EACH element -> miss, missing === exactly that one label.
for (const label of SRA_LABELS) {
  const body = SRA_TRIGGER + ' ' + SRA_LABELS.filter(l => l !== label).map(l => SRA_SENTENCES[l]).join(' ');
  const res = ruleCheck(SRA, sraCorpus(body), null, null);
  ok(`SRA remove [${label}] -> status miss`, res.status, 'miss');
  ok(`SRA remove [${label}] -> missing is EXACTLY that one label`, sorted(res.missing_elements), [label]);
}

// TEST 7 — SRA: trigger present + per-element decoy only -> that element NOT falsely present.
for (const label of SRA_LABELS) {
  const res = ruleCheck(SRA, sraCorpus(SRA_TRIGGER + ' ' + SRA_DECOYS[label]), null, null);
  ok(`SRA decoy for [${label}] -> element NOT falsely present`, (res.present_elements || []).includes(label), false);
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail) { console.error('ELEMENT-CHECKLIST CANDIDATE PROOF FAILED.'); process.exit(1); }
console.log('All element-checklist candidate assertions pass: zero false-present, zero false-absent, exact per-element localisation.');
