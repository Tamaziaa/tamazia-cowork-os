'use strict';
/**
 * PROHIBITION CALIBRATION. A prohibit rule fires when the firm MAKES the forbidden claim — never when it
 * DENIES making it.
 *
 * Six prohibitions sat in the catalogue with NO PATTERN and could never fire. Three were P0, including
 * UK_BOTOX_FILLERS_U18 — administering botulinum toxin or fillers to an under-18 for cosmetic purposes is a
 * CRIMINAL OFFENCE in England. They are now patterned. But a naive pattern fires on a clinic whose policy page
 * says "we do NOT treat under-18s" — every forbidden word is present. Accusing a COMPLIANT clinic of a criminal
 * offence, because it published its compliance, is not an acceptable failure mode.
 *
 * The negation guard lives in corpus-index.js (ONE door: every prohibit rule inherits it; no rule reimplements
 * it in its own regex). This test proves it, and proves each pattern still catches the real violation.
 */
const A = require('assert');
const { isNegated } = require('../src/skills/S008-personalisation-engine/scanners/corpus-index.js');
const N = process.env.NEON_URL || process.env.DATABASE_URL;
if (!N) { console.log('ok - skipped (no NEON_URL; a missing DB is NOT a calibrated catalogue)'); process.exit(0); }

const q = async (sql) => {
  const u = new URL(N);
  const res = await fetch(`https://${u.hostname}/sql`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': N }, body: JSON.stringify({ query: sql }) });
  const j = await res.json();
  if (j.message) throw new Error(j.message);
  return j.rows || [];
};

// VIOLATION (must fire)  vs  COMPLIANCE STATEMENT (must NOT fire — same words, negated)
const CASES = {
  UK_BOTOX_FILLERS_U18_PROHIBITION: {
    violation: 'Lip filler from age 16 with parental consent. Teenagers welcome.',
    compliant: 'We do not offer dermal filler to under-18s. All patients must be aged 18 years and over.' },
  UK_HMR_2012_POM_PUBLIC_AD: {
    violation: 'Botox from £199 per area. Book now for our special offer.',
    compliant: 'We offer anti-wrinkle injections. Prescription-only medicines are not advertised to the public.' },
  US_FTC_FAKE_REVIEWS_PROHIBITED: {
    violation: 'We buy 5-star reviews to boost your rating. Incentivised reviews available.',
    compliant: 'All our reviews are genuine. We never buy fake reviews or offer incentivised reviews.' },
  US_FTC_REVIEWS_RULE_001: {
    violation: 'Leave us a 5-star review and get a £10 discount on your next visit!',
    compliant: 'We welcome honest feedback. We do not offer a discount for a review.' },
  UK_TENANT_FEES_2019_001: {
    violation: 'Tenant admin fee of £250 payable on application. Referencing fees charged to tenants.',
    compliant: 'Under the Tenant Fees Act 2019 we do not charge tenants any admin fee or referencing fee.' },
  US_FTC_AI_CLAIMS_001: {
    violation: 'Our AI widget makes any website fully WCAG compliant.',
    compliant: 'Our tool helps improve accessibility. No automated tool can guarantee WCAG compliance.' },
};

// mirrors the engine: a match inside a NEGATED sentence is not a claim.
const fires = (rx, sentence) => rx.test(sentence) && !isNegated(sentence);

(async () => {
  let bad = 0;
  const t = async (n, fn) => { try { await fn(); console.log('ok ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };

  const rows = await q("select rule_id, severity, coalesce(regex_pattern,'') regex_pattern from compliance_rules where active and rule_type='prohibit'");
  const byId = Object.fromEntries(rows.map((r) => [r.rule_id, r]));

  await t('the six formerly-INERT prohibitions all carry a pattern now (3 of them are P0)', () => {
    const missing = Object.keys(CASES).filter((k) => !byId[k] || !byId[k].regex_pattern.trim());
    A.deepStrictEqual(missing, [], 'still inert, can never fire: ' + missing.join(', '));
  });

  await t('each pattern CATCHES the real violation', () => {
    const blind = [];
    for (const [id, c] of Object.entries(CASES)) {
      const r = byId[id]; if (!r) continue;
      if (!fires(new RegExp(r.regex_pattern, 'i'), c.violation)) blind.push(id + ' [' + r.severity + ']');
    }
    A.deepStrictEqual(blind, [], 'these prohibitions do NOT fire on their own violation: ' + blind.join(', '));
  });

  await t('THE POLARITY TRAP: no pattern fires on a COMPLIANCE STATEMENT', () => {
    const falseAccusations = [];
    for (const [id, c] of Object.entries(CASES)) {
      const r = byId[id]; if (!r) continue;
      if (fires(new RegExp(r.regex_pattern, 'i'), c.compliant)) falseAccusations.push(id + ' [' + r.severity + '] on: "' + c.compliant + '"');
    }
    A.deepStrictEqual(falseAccusations, [],
      'A COMPLIANT firm was accused because it PUBLISHED its compliance:\n  ' + falseAccusations.join('\n  ') +
      '\nUK_BOTOX_FILLERS_U18 is a CRIMINAL OFFENCE. This must never fire on "we do not treat under-18s".');
  });

  await t('the negation guard itself is calibrated (it must not swallow a real claim)', () => {
    A.ok(isNegated('We do not offer filler to under-18s'), 'a plain negation was not recognised');
    A.ok(isNegated('All patients must be aged 18 years and over'), 'an age-floor statement was not recognised');
    A.ok(!isNegated('Lip filler from age 16 with parental consent'), 'THE GUARD SWALLOWED A REAL VIOLATION');
    A.ok(!isNegated('Botox from £199 per area'), 'THE GUARD SWALLOWED A REAL VIOLATION');
  });

  if (bad) { console.error('\n' + bad + ' failing'); process.exit(1); }
  console.log('\nprohibition-calibration: all green');
})();
