# Phase 5 · foolproof plan
## Single-detector + pre-bundled rule packs for audit accuracy at scale

This plan replaces the current architecture (categorical resolver → applicability gate → remaps → drops) with a single forward-only detector that runs pre-bundled rule packs. The result is fewer moving parts, native multi-jurisdiction support, no silent drops, and a coverage matrix that is checkable in one pass.

---

## 1 · What is wrong with the current architecture

The current engine has four moving parts that talk to each other through a leaky interface:

1. The scraper emits "pointers" (with hardcoded UK_* framework codes from the legacy era OR with neutral categories from the new era).
2. The worker has an applicability gate that drops anything not in the routed list.
3. A categorical resolver tries to remap categories to country-correct framework codes.
4. A text scrubber strips UK regulator names from non-UK audits at render time.

This produces five real, observable problems:

- **Silent drops.** Findings that genuinely apply get dropped if their category is not in the per-jurisdiction map. Telemetry shows "category_not_applicable" but the audit just shows fewer findings.
- **Stale stored frameworks.** audit_pages.applicable_frameworks gets out of date as the router evolves; we now ignore the stored value and recompute, but that means the build script's intent (e.g. scope-out a specific code) is lost.
- **Sector signals are runnable on the wrong sector.** detectLegal runs on every law-firm audit but the SRA-number regex still matches strings like "the SRA Code" in unrelated copy.
- **Multi-jurisdiction is fragmented.** A London + Dubai + Singapore firm gets ONE country's findings, not all three.
- **Adding a new framework is three to five file edits.** New code: category catalog + jurisdiction router + worker WORKER_CATEGORY_MAP + sector library + finding-meta + fine-ranges.

The architecture also makes gap-finding hard. We have to scan five files and read three indirections to know whether a rule actually fires.

---

## 2 · The new architecture (one detector, rule packs, native multi-country)

### Two-line summary

One rule = one self-contained object. Rule packs are pre-bundled per (sector, country). The detector runs every rule in the resolved pack against the scraped intel. That's it.

### Stage 1 · classify entity

```js
function classifyEntity(intel, lead) {
  return {
    sector: 'law-firms',                       // best pick
    sector_confidence: 0.92,
    countries: ['UK', 'AE', 'SG'],             // every country the firm operates in
    country_confidence: { UK: 0.95, AE: 0.88, SG: 0.71 },
    primary_country: 'UK',                     // for cosmetic labels
    cities_detected: { UK: ['London'], AE: ['Dubai'], SG: ['Singapore'] },
    multi_jurisdiction: true,
    schema_types: ['LegalService'],
    languages_detected: ['en', 'ar']
  };
}
```

The classifier already exists (`country-resolver.js` + `sector-resolver.js`) but currently returns ONE country. Phase 5 extends it to return EVERY country with confidence ≥ 0.5. Cities are detected to scope city-level rules (Trakheesi is Dubai-only, RERA is Dubai-only, etc.).

### Stage 2 · resolve applicable rule pack

```js
function resolveRulePack({ sector, countries, cities }) {
  const pack = new Set();
  // Universal rules ALWAYS apply (Google EEAT, WCAG, AI Act when applicable)
  for (const rule of RULE_PACKS['UNIVERSAL']) pack.add(rule);
  // Per country: baseline + sector overlay + city overlay
  for (const country of countries) {
    for (const rule of (RULE_PACKS[`${country}::BASELINE`] || [])) pack.add(rule);
    for (const rule of (RULE_PACKS[`${country}::${sector}`] || [])) pack.add(rule);
    for (const city of (cities[country] || [])) {
      for (const rule of (RULE_PACKS[`${country}::${city}`] || [])) pack.add(rule);
    }
  }
  return [...pack];
}
```

Rule packs are static, declarative, pre-bundled. Adding a new framework = one line in one pack.

### Stage 3 · run detector

```js
function runDetector(rules, intel) {
  const findings = [];
  for (const rule of rules) {
    let result;
    try { result = rule.trigger(intel); } catch (e) { telemetry.error(rule.id, e); continue; }
    if (!result) continue;            // rule passed cleanly
    if (result.deferred) continue;    // rule wants more data (e.g. revenue lookup)
    findings.push({
      rule_id: rule.id,
      framework_short: rule.framework_short,
      regulator: rule.regulator,
      regulator_localized: rule.regulator_localized,
      jurisdiction: rule.jurisdiction,
      severity: rule.severity,
      where: result.where,            // populated by trigger from intel
      evidence: rule.evidence(result),
      fix: rule.fix,
      uplift: rule.uplift,
      fine_label: rule.fine_label,
      fine_high: rule.fine_high,
      clause: rule.clause,
      framework_url: rule.framework_url
    });
  }
  return findings;
}
```

Each rule is self-contained. No external lookups. No remaps. No drops by jurisdiction (because if the rule isn't in the pack it never ran).

### Stage 4 · render

The worker receives `Finding[]` from the detector and renders. No more `enrichFinding` fallbacks, no `WORKER_CATEGORY_MAP`, no text scrubber. The findings ARE the audit.

### The rule shape (single source of truth)

```js
const RULE_UK_GDPR_A13_PRIVACY = {
  id: 'UK_PRIVACY_NOTICE_GDPR_A13',
  framework_short: 'UK_GDPR_A13',
  regulator: 'ICO',
  regulator_localized: { en: 'ICO' },
  regulator_url: 'https://ico.org.uk/...',
  jurisdiction: 'UK',
  severity: 'P0',
  clause: 'Art. 13/14 — information to be provided where personal data is collected',
  fine_label: 'Up to £17.5M or 4% global turnover (ICO maximum)',
  fine_high: 17500000,
  trigger: (intel) => {
    if (intel.compliance.has_privacy) return null;  // pass
    return {
      where: `Site-wide · checked /, /privacy, /privacy-policy, /privacy-notice at https://${intel.domain}/`
    };
  },
  evidence: (result) => `No privacy policy or notice detected. UK GDPR Art. 13/14 makes specific information mandatory at point of data collection (forms, enquiries, analytics cookies). The ICO has fined British Airways £20M and DPP Law £60k specifically for Article 13/14 failures.`,
  fix: 'Publish a UK GDPR Art. 13/14 compliant privacy notice covering lawful basis, retention, processors, transfers, data subject rights and the ICO complaint route. Tamazia drafts to ICO standard.',
  uplift: 'Removes a direct ICO enforcement trigger. Lifts the trust-signal score in AI search.'
};
```

One file per rule. Rule packs are arrays of rule references.

---

## 3 · Migration path (no audit page goes dark for one minute)

We do not delete the current engine. We run them side by side until parity is proven, then flip.

### Step A · scaffold the new engine alongside

```
src/lib/engine/
├── rules/
│   ├── universal/
│   │   ├── seo-meta-description.js
│   │   ├── seo-structured-data.js
│   │   ├── seo-mobile-viewport.js
│   │   ├── ...
│   ├── uk/
│   │   ├── baseline-gdpr-a13.js
│   │   ├── baseline-pecr.js
│   │   ├── baseline-companies-act.js
│   │   ├── law-firms-sra-transparency.js
│   │   ├── law-firms-sra-complaints.js
│   │   ├── healthcare-cqc.js
│   │   ├── real-estate-rics.js
│   │   ├── ...
│   ├── ae/
│   │   ├── baseline-pdpl.js
│   │   ├── real-estate-rera.js
│   │   ├── real-estate-trakheesi-dubai.js  (city-gated)
│   │   ├── ...
│   ├── sa/, sg/, in/, hk/, fr/, de/, eu/, us/
├── packs.js              (declarative rule-pack assembly)
├── classify-entity.js    (extension of current resolvers, multi-country)
├── resolve-pack.js
├── run-detector.js
└── index.js              (single export: runAudit(intel, lead))
```

### Step B · build the rule packs FROM the current engine

Every existing finding the current engine emits gets ported one-for-one to a rule. This guarantees behaviour parity. The script:

```
node scripts/port-current-engine-to-rules.js > src/lib/engine/rules-ported.json
```

For each category in the current catalog + each (country, sector) in the router → emit a Rule object with the same severity, framework, evidence template, fix and fine. Output to a JSON the codegen converts to actual rule files.

### Step C · dual-run parity test

```js
// outputs/test-engine-parity.mjs
for (const fixture of FIXTURES) {
  const old = oldEngine.runAudit(fixture);
  const neu = newEngine.runAudit(fixture);
  assert.deepEqual(neu.findings.sort(), old.findings.sort(), `${fixture.slug} parity`);
}
```

Until parity is 100% across the existing 7-fixture backtest, the worker keeps using the old engine. Once parity holds, the worker flips to the new engine behind a feature flag (cookie + query string toggle for live testing).

### Step D · cut over

After two days of parity in production (read-only shadow run logging differences), the old engine is deleted in one PR. Worker imports only the new engine. CI runs only the new engine's tests.

---

## 4 · How we find gaps (the 10-point audit methodology)

After the rule packs exist, we audit them programmatically. Every check below produces a pass / fail report.

| # | Check | What it catches |
|---|---|---|
| 1 | **Coverage matrix** | for every (country, sector) pair, count rules in pack. Cells under 5 rules → flagged as "thin pack, write more rules". |
| 2 | **Trigger runnability** | every rule has a `trigger(intel)` function. Static fixture run: rule must produce a deterministic boolean / object output, never undefined or NaN. |
| 3 | **Conflict scan** | detect rules where two rules target the same intel signal (e.g. seo_meta_description + seo_meta_description_thin). Mark as intentional cascade or fix. |
| 4 | **Multi-jurisdiction run** | classify a fake firm with `countries: ['UK', 'AE', 'SG']`, run detector, assert each country's baseline rules fired. |
| 5 | **Severity calibration** | per pack, distribution of P0 / P1 / P2 must include at least 2 of each severity level (otherwise a pack reads as "all critical" or "all standard"). |
| 6 | **Evidence completeness** | every rule's evidence template must include WHERE (URL or path), WHAT (the missing element), WHY (the regulator clause). String length 80-400 chars. |
| 7 | **Fix completeness** | every rule's fix must be actionable: name the document to publish, the page to edit, or the script to ship. Length 60-280 chars. |
| 8 | **Localisation completeness** | every rule's regulator has a localized name in the country's primary language (Arabic for UAE/SA, Chinese for HK/SG, Hindi for IN, French/German/Italian/Spanish for EU member states). |
| 9 | **Telemetry attachment** | every rule emission logs `{ rule_id, audit_id, sector, country, fired_at }` to `audit_events`. We can then compute fire rate per rule across all audits and identify dead rules (never fire) or noisy rules (fire on 100% of audits). |
| 10 | **Backtest against 100 real URLs** | render audits for 100 real client URLs (sample 10 per sector × 10 sectors), manually verify each audit's top 3 findings are correct. Compute precision: (correct top-3) / (total top-3). Target ≥ 90%. |

This is a one-time setup. After that, every new rule we add must pass checks 2-8 before merge. Check 1 (coverage) is a continuous report. Check 10 (backtest) reruns weekly.

---

## 5 · The execution plan (concrete, ordered, sized)

### Phase 5·1 · scaffold + universal pack (1-2 days)

- Create `src/lib/engine/` directory tree.
- Write the 13 universal rule files (SEO + entity + WCAG). Port from current `analyzePage` checks.
- Write `classify-entity.js` v2 that returns multi-country with confidence.
- Write `resolve-pack.js` that walks countries × sector × city.
- Write `run-detector.js` with try/catch per rule + telemetry.
- Write `index.js` exporting `runAudit(intel, lead)`.
- Write 20 unit tests for the universal pack.

### Phase 5·2 · country baseline packs (2-3 days)

- UK baseline (8 rules: UK_GDPR_A13, UK_PECR, UK_ICO_COOKIES, UK_DPA_2018, UK_DMCC_2024, UK_COMPANIES_ACT, UK_EQUALITY_2010, UK_MODERN_SLAVERY revenue-gated).
- EU baseline (5 rules: EU_GDPR, EU_EPRIVACY, EU_AI_ACT, EU_DSA for ecommerce, EU_EAA_2025 for accessibility).
- US baseline (4 rules: US_FTC, US_CPRA, US_TCPA, US_CAN_SPAM).
- AE / SA / SG / IN / HK baseline packs.
- Per pack: 8-12 unit tests + multi-jurisdiction integration test.

### Phase 5·3 · sector packs (2-3 days each, parallelisable across sectors)

- Law-firms × {UK, SG, IN, HK} = 4 packs.
- Healthcare × {UK, AE, SA, SG, IN, HK} = 6 packs.
- Finance × {UK, AE, SA, SG, IN, HK, EU} = 7 packs.
- Real-estate × {UK, AE, SA, SG, IN, HK} = 6 packs.
- Hospitality × {UK, AE, SA, SG, IN, HK} = 6 packs.
- Ecommerce × {UK, US, EU, AE, SA, SG, IN, HK} = 8 packs.
- Plus city-specific overlays (Dubai for Trakheesi, Mumbai/Delhi for state-RERA, NY/CA/IL for state-specific US laws).
- Per pack: 5-10 unit tests + sector backtest fixture.

### Phase 5·4 · gap detectors that the current engine doesn't have (3-4 days)

Add the 17 mechanism errors from the coverage matrix:
- UAE city-level Trakheesi scoping.
- Modern Slavery threshold lowered to £36M.
- AI Act high-risk vocabulary expansion.
- WCAG grader across every fetched page.
- Saudi SDAIA AI scanner.
- India TRAI / CERT-In / NPCI / PMLA scanners.
- HK SFC Conduct categories.
- US TCPA / BIPA / COPPA / HIPAA / NYDFS scanners.
- EU DORA / PSD2 / AML6 / CSRD / SFDR / NIS2 scanners.
- FR_CNIL_2025 + DE_BDSG member-state specialisation.
- PDF body scanner.
- Subdomain sitemap discovery.
- SPA shell fallback for internal pages.

### Phase 5·5 · parity dual-run (1 day)

- Build `test-engine-parity.mjs`.
- Run against existing 7-fixture backtest.
- Tweak rules until parity is 100%.

### Phase 5·6 · feature flag cutover (half day)

- Add `?engine=v5` URL param to worker.
- Add cookie toggle.
- Internal smoke test on Streathers, Emaar, Al Tamimi, Saudi CMA, SG Rajah & Tann, IN Razorpay, HK KWM.
- Live shadow run for 48 hours logging diffs to audit_events.

### Phase 5·7 · full cut (half day)

- Delete old engine code.
- Worker imports only `runAudit` from new engine.
- Backtest re-baselined on the new outputs.
- All four phase test suites updated to the new engine's contract.

**Total estimated effort: 10 to 14 working days. Single phase.** Vastly cleaner repo at the end; faster to add new frameworks for years to come.

---

## 6 · Pre-flight checklist before any Phase 5 work begins

Before I write a single rule file, you sign off on these eight decisions:

1. **City-level rule scoping confirmed**: Trakheesi is Dubai-only, RERA is Dubai-only, state RERA in India is state-specific, BIPA is Illinois-only, etc. Confirm scope per rule when I scaffold them.
2. **EU rollup logic**: a French firm gets EU_GDPR + EU_EPRIVACY + EU_AI_ACT + EU_DSA AT MINIMUM. Plus French-specific overlays (FR_CNIL_2025 if applicable). Confirm or specify member-state vs EU baseline.
3. **Modern Slavery threshold**: I'm proposing £36M turnover with Companies House lookup. Confirm the threshold and whether Companies House lookup is acceptable (it is a free public API).
4. **AI Act high-risk vocabulary**: should "credit scoring", "risk model", "underwriting model", "automated decisioning" all flag as high-risk-candidate? Or only the explicit Annex III phrases?
5. **Multi-jurisdiction render format on the audit page**: stacked sections (UK section above UAE section above SG section), tabs, or unified single-section with country tags per finding?
6. **Severity policy**: "no pack should be all-P0" — agreed cap of max 50% of a pack at P0? Or remove the rule?
7. **Backtest sample size for cutover**: I'm proposing 100 real-client URLs. Do you have a 100-lead list I can pull from Neon, or should I scrape 100 fresh leads first?
8. **Sunset of the legacy engine**: do you want to keep it as `engine_v1` for 30 days (rollback safety) or delete it the day after parity holds?

---

## 7 · Why this plan is foolproof

- **One detector, one path through.** Bugs have one place to hide.
- **Rule packs are declarative.** Adding a framework is a one-line additive change with a single unit test. No 5-file edits.
- **Multi-jurisdiction is native.** Union of country packs. Zero special-case logic.
- **No silent drops.** If a rule is not in the pack, it never ran. If it is in the pack, it runs and either fires or passes.
- **Parity proven before cutover.** Old engine remains canonical until the new one matches on every fixture.
- **Gap audit is mechanical.** Ten programmatic checks across every rule. Continuous coverage report.
- **Adding a new country or sector is one rule file × N frameworks.** No router edits, no resolver edits, no worker edits.

---

## 8 · Decision

I am not building anything until you sign off on Section 6's eight decisions. Once you confirm, I begin Phase 5·1 in the same rigour as Phases 1 to 4: build → rigorous test → deploy → live verify per phase. Each phase has its own bug-test before moving on.

If you want a smaller first move (proof point before committing 10-14 days), Phase 5·1 alone (scaffold + universal pack + classify-entity v2) takes one to two days and gives you the new engine's foundation, with the rest delivered as packs that slot into the architecture.

Tell me your call.
