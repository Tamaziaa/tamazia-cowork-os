# Phase 5 · sniper-edit roadmap
## Three phases, gates per step, no rewrite

Aman, you confirmed:
- Build on the existing engine. No rewrite.
- Three phases at 100% quality.
- Country tags per finding (not stacked / tabbed sections).
- Scraper must not hallucinate. Use cross-prompt engineering and step-by-step verification.
- P0 cap 50% per pack.
- Rollback safety always.

This document is the foolproof execution plan, surgical edits only, with gates at every step.

---

## 1 · Why this is possible without a rewrite

Your existing engine already has 80% of the architecture I would build from scratch. Specifically:

| What's already there | What needs surgical extension |
|---|---|
| `resolveCountry()` returns single best country | extend to return countries[] with confidence ≥ 0.5 |
| `routeJurisdictions()` returns one framework list | extend to take countries[] (already accepts country) and union |
| `applyApplicabilityGate()` validates per audit | extend to tag each kept finding with its country |
| Scraper emits structured pointers with location + evidence | add an evidence-verification step that proves the snippet was scraped |
| Sector-signal libraries already exist per sector | port to a single "detector registry" file that the worker reads |
| Worker enrichment + render already separates data from view | add country tag to the finding card chip |
| Telemetry recorder already logs drops + remaps | extend to log confidence + cross-prompt verification results |

Every change below is a sniper edit on a file that exists, not a new file from scratch. The biggest single edit is around 200 lines. Most are 5-30 lines.

---

## 2 · The three phases (overview)

| Phase | Goal | Files touched | Est. effort | Deploy after gate |
|---|---|---|---|---|
| **5·A** | Multi-country detection · country tags per finding · union rule pack | `country-resolver.js`, `website-intel.js`, `jurisdiction-router.js`, `audit-page-worker.js` (worker chip), 2 new test files | 1-2 days | Yes |
| **5·B** | Hallucination-proof scraper · cross-prompt + step-by-step verification · evidence cross-check | `website-intel.js`, `sector-signal-libraries.js`, `schema-validator.js`, new `evidence-verifier.js` + 1 test file | 1-2 days | Yes |
| **5·C** | 17 gap-detectors (UAE city scope, AI vocab, WCAG per-page, Saudi SDAIA, India TRAI/CERT-In/NPCI/PMLA, HK SFC, US TCPA/BIPA/COPPA/HIPAA/NYDFS, EU DORA/PSD2/AML6/CSRD/SFDR/NIS2, FR/DE specialisation, PDF body, subdomain sitemap, SPA internal pages, scope-out list) | mostly `sector-signal-libraries.js`, `category-catalog.js`, `website-intel.js`, `audit-page-worker.js` (where each fires) + 1 test per detector | 3-4 days | Yes |

**Total ≈ 5 to 8 working days.** Vastly less than a rewrite. Each phase is independently deployable. Rollback is `git revert + redeploy`, never more complex than one commit.

---

## 3 · Phase 5·A · multi-country detection + country tags per finding

### Goal

A firm operating in UK + UAE + Singapore (e.g. Rajah & Tann Asia or Al Tamimi) gets findings from all three jurisdictions' frameworks in ONE audit. Every finding card carries a country tag (🇬🇧 UK · 🇦🇪 UAE · 🇸🇬 SG) so the reader knows which jurisdiction triggered it.

### Sniper edits

**Edit A1 · `src/lib/classify/country-resolver.js`** (currently returns top country only; extends to return all countries above threshold).

```js
// At end of resolveCountry(), already builds `countries` (top + within 80% of top score).
// Change the threshold so any country with confidence >= 0.5 is included, not just within 80%.
const allHighConfidence = ranked.filter(r => {
  const conf = Math.min(1, Math.max(0, (r.score / 10) * 0.5 + ((r.score - 0) / 8) * 0.5));
  return conf >= 0.5;
});
return {
  country: top.country,
  countries: allHighConfidence.map(r => r.country),  // ← multi-country
  primary_country: top.country,
  confidence: Number(confidence.toFixed(2)),
  confidence_per_country: Object.fromEntries(allHighConfidence.map(r => [r.country, Number(((r.score / 10) * 0.5 + ((r.score) / 8) * 0.5).toFixed(2))])),
  signals: top.signals,
  full_scores: ranked.slice(0, 6)
};
```

**Edit A2 · `src/lib/compliance/jurisdiction-router.js`** (one extra function on top of `routeJurisdictions`).

```js
// Add a multi-country router that unions the per-country routes.
function routeJurisdictionsMulti({ countries = [], sector = 'professional-services' }) {
  const out = new Set();
  for (const c of countries) {
    for (const f of routeJurisdictions({ country: c, sector })) out.add(f);
  }
  return [...out];
}
module.exports.routeJurisdictionsMulti = routeJurisdictionsMulti;
```

**Edit A3 · `src/lib/enrich/website-intel.js`** (pass countries through; tag findings).

```js
// After resolveCountry returns `countryRes`:
intel.countries = countryRes.countries;                    // ← already exists, just keep
intel.primary_country = countryRes.country;
// During applicability gate, attach .jurisdictions[] to each finding listing the countries it applies to
const allFrameworks = routeJurisdictionsMulti({ countries: intel.countries, sector: intel.sector });
const applicableSet = new Set(allFrameworks);
// For each kept pointer, compute which countries it applies to (lookup which country's pack the framework belongs to)
for (const p of filtered) {
  p.jurisdictions = countries.filter(c => routeJurisdictions({ country: c, sector: intel.sector }).includes(p.framework));
}
```

**Edit A4 · `cloudflare/audit-page-worker.js`** (add country chip on each finding card + recompute frameworks across all countries).

```js
// In routeFrameworksWorker(country, sector), accept either string or array:
function routeFrameworksWorker(countryOrList, sector) {
  const countries = Array.isArray(countryOrList) ? countryOrList : [countryOrList];
  const merged = new Set();
  for (const c of countries) { /* existing logic per country */ }
  return [...merged];
}

// In findingRow(), add a country tag chip:
const tagChip = (f.jurisdictions && f.jurisdictions.length)
  ? `<span style="display:inline-block;font-size:0.6rem;font-weight:700;padding:2px 7px;border-radius:3px;background:#3D0E0E;color:#C8A664;letter-spacing:0.04em">${f.jurisdictions.map(c=>esc(c)).join(' · ')}</span>`
  : '';
```

**New file A5 · `outputs/test-phase5A-multicountry.mjs`** (8-12 assertions).

```js
// Fixture: a fake "Al Tamimi" with country=UAE + UK presence (mention "London office")
// Assert: countries[] includes UK and AE
// Assert: applicable_frameworks union includes UAE_PDPL AND UK_GDPR_A13
// Assert: rendered HTML contains "UK · AE" tags on the privacy finding card
```

### Gate A → only deploy when ALL pass

1. Unit: `resolveCountry` returns countries[] with confidence ≥ 0.5 (4 fixtures: single-country, dual-country, tri-country, ambiguous)
2. Unit: `routeJurisdictionsMulti` produces correct union for 6 fixture pairs
3. Integration: render audit for a tri-country fixture, verify country-tag chip on every finding
4. Regression: all 9 existing test suites still green
5. Live smoke: re-render Al Tamimi (UAE + DIFC), check both UAE_PDPL and DIFC-related frameworks fire

---

## 4 · Phase 5·B · hallucination-proof scraper

### Goal

Every finding the scraper emits must be tied to an EVIDENCE STRING that actually appears in the scraped HTML, OR a STRUCTURAL FACT that can be re-derived from the scrape (e.g., "no meta description tag" can be verified by re-parsing the head). Anti-hallucination logic uses cross-prompt engineering (multiple independent methods cross-checking the same signal) and step-by-step verification (extract → verify in raw HTML → re-derive → emit only if all steps agree).

### The cross-prompt + step-by-step pattern, applied

For every detector, three independent confirmations must agree before a finding fires:

| Method | Example for `privacy_notice_missing` |
|---|---|
| **Method 1 · path-based** | `/privacy`, `/privacy-policy`, `/privacy-notice` NOT in `intel.pages_fetched` |
| **Method 2 · multilingual phrase scan** | `hasPrivacyNotice(fullText)` returns false in all 8 languages |
| **Method 3 · structural form proximity** | every form on the site has no nearby link to a privacy doc (within 200 chars of the form tag) |

The detector emits only when ALL THREE agree on "missing". The finding's evidence is the actual scraped snippet from the form area, not a hand-written sentence.

### Sniper edits

**New file B1 · `src/lib/engine/evidence-verifier.js`** (the core anti-hallucination utility).

```js
// Verifies a finding's evidence string. Three checks:
//   1. EXISTS_IN_HTML: the snippet quoted in evidence must appear verbatim
//      in at least one scraped page's HTML (or be a structural negative fact).
//   2. URL_CRAWLED: the `where` URL must be in intel.pages_fetched.
//   3. CONFIDENCE_GTE_THRESHOLD: rule's cross-method confidence ≥ 0.7.
function verifyFinding(finding, intel) {
  const errors = [];
  // 1. URL existence
  const path = (finding.where || '').match(/https?:\/\/[^\/]+(\/[^\s]*)/);
  if (path && !intel.pages_fetched.includes(path[1])) {
    errors.push(`URL not crawled: ${path[1]}`);
  }
  // 2. Evidence quote existence (when finding includes a `quoted_snippet` field)
  if (finding.quoted_snippet) {
    const allHtml = Object.values(intel.pages_fetched_html || {}).join(' ');
    if (!allHtml.includes(finding.quoted_snippet)) {
      errors.push(`quoted_snippet not in any scraped page`);
    }
  }
  // 3. Structural fact verifiable
  if (finding.structural_fact) {
    const verified = verifyStructuralFact(finding.structural_fact, intel);
    if (!verified) errors.push(`structural_fact failed re-derivation`);
  }
  return { ok: errors.length === 0, errors };
}
```

**Edit B2 · `src/lib/enrich/website-intel.js`** (add `pages_fetched_html` map; wire the verifier into the post-scrape pass).

```js
// Currently stores intel.pages_fetched (paths only) — also store intel.pages_fetched_html (path → HTML)
intel.pages_fetched_html = intel.pages_fetched_html || {};
// In the fetch loop, after a successful fetch:
intel.pages_fetched_html[p] = html;

// After all findings are emitted and gated, run the verifier:
const { verifyFinding } = require('../engine/evidence-verifier');
const verified = [];
for (const f of intel.pointers) {
  const v = verifyFinding(f, intel);
  if (v.ok) verified.push(f);
  else telemetry.drop(f, 'evidence_verification_failed: ' + v.errors.join('; '));
}
intel.pointers = verified;
```

**Edit B3 · `src/lib/enrich/sector-signal-libraries.js`** (every detector also returns the matched snippet + URL it came from).

```js
// Refactor each detector return shape from { found, language } to:
//   { found, snippet, url, line_no }
function hasPrivacyNoticeDeep(intel) {
  for (const [path, html] of Object.entries(intel.pages_fetched_html || {})) {
    for (const lang of Object.keys(PRIVACY)) {
      for (const re of PRIVACY[lang]) {
        const m = html.match(re);
        if (m) return {
          found: true,
          snippet: m[0],
          url: `https://${intel.domain}${path}`,
          line_no: html.slice(0, m.index).split('\n').length,
          method: 'phrase',
          language: lang
        };
      }
    }
  }
  return { found: false };
}
```

**Edit B4 · `src/lib/enrich/website-intel.js`** (cross-method confidence gate).

```js
// For every signal-based finding, run all available detectors and only emit if at least 2 agree:
function multiMethodConfirm(checks) {
  const confirmed = checks.filter(c => c.method && c.found === false);  // "missing" detectors
  return {
    confidence: confirmed.length / checks.length,
    agreed: confirmed.length >= 2
  };
}

// Privacy notice missing - require 2-of-3 methods to agree
const checks = [
  pathCheck_privacy(intel),
  phraseCheck_privacy(intel),
  structuralCheck_privacy(intel)
];
const v = multiMethodConfirm(checks);
if (v.agreed && v.confidence >= 0.67) point(ptr, { ... }); // 2 of 3
```

**New file B5 · `outputs/test-phase5B-hallucination-proof.mjs`** (10 assertions).

Tests:
1. Insert a synthetic finding with a quoted snippet that doesn't appear in any scraped page → drop event logged
2. Insert a finding referencing a URL not in pages_fetched → drop event logged
3. Privacy detector with only 1 of 3 methods agreeing → no finding
4. Privacy detector with 2 of 3 methods agreeing → finding emitted, confidence 0.67
5. SRA number detector returns { found, snippet, url, line_no } shape
6. Re-derivation of "no meta description" verifies absence (`<head>` parse confirms no description tag)
7. Telemetry: dropped findings logged with `evidence_verification_failed`
8. Telemetry: surviving findings have `verification_confidence` field
9. End-to-end: render Al Tamimi audit, assert every visible finding has a verified quoted_snippet OR a structural_fact
10. End-to-end: 0 hallucinated findings (synthetic injection)

### Gate B → only deploy when ALL pass

1. All 10 B5 assertions
2. Regression: all 9 existing test suites still green
3. Live smoke: re-render 5 fixtures (Streathers, Emaar, Al Tamimi, Saudi, KWM HK), every visible finding's evidence string verifiably present in scraped HTML
4. Telemetry inspection: drop reason `evidence_verification_failed` count must be < 5% of total findings (otherwise rules are too strict and we cut too much)

---

## 5 · Phase 5·C · 17 gap-detectors

### Goal

Close the 17 mechanism errors and coverage holes from the coverage matrix. Each is a single new file (or a single regex addition to an existing file) + 1 unit test.

### The 17 sniper additions, each as a one-file edit

| # | Gap | File touched | Edit size |
|---|---|---|---|
| C1 | City-level Trakheesi scope (Dubai only) | `sector-signal-libraries.js` + `category-catalog.js` | ~15 lines |
| C2 | Modern Slavery threshold → £36M + Companies House lookup | `modern-slavery-detector.js` | ~30 lines |
| C3 | AI Act vocabulary expansion | `ai-act-classifier.js` (HIGH_RISK_CONTEXT regex) | ~10 lines |
| C4 | WCAG grader across every fetched page (not just homepage) | `website-intel.js` (run gradeHtml over each page, take worst) | ~10 lines |
| C5 | Saudi SDAIA AI scanner | new `sector-signal-libraries.js` block | ~25 lines |
| C6 | India TRAI scanner (commercial-comms consent) | `sector-signal-libraries.js` | ~20 lines |
| C7 | India CERT-In direction scanner | `sector-signal-libraries.js` | ~20 lines |
| C8 | India NPCI UPI scanner (fintech) | `sector-signal-libraries.js` | ~20 lines |
| C9 | India PMLA AML scanner (finance) | `sector-signal-libraries.js` | ~20 lines |
| C10 | HK SFC Conduct CE No categories | `sector-signal-libraries.js` (FINANCE map) | ~10 lines |
| C11 | US TCPA / CAN-SPAM scanner | new `sector-signal-libraries.js` block | ~30 lines |
| C12 | US BIPA biometric scanner (Illinois only, city-gated) | `sector-signal-libraries.js` | ~25 lines |
| C13 | US COPPA scanner (education sector) | `sector-signal-libraries.js` | ~20 lines |
| C14 | US HIPAA scanner (healthcare) | `sector-signal-libraries.js` | ~25 lines |
| C15 | US NYDFS Cyber 23 NYCRR 500 (finance, NY only) | `sector-signal-libraries.js` | ~20 lines |
| C16 | EU DORA + PSD2 + AML6 + CSRD + SFDR + NIS2 scanners | new `sector-signal-libraries.js` block | ~60 lines (6 detectors) |
| C17 | PDF body scanner + subdomain sitemap + SPA-shell for internal pages + scope-out list | `website-intel.js` | ~80 lines combined |

### Sample C-edit: Trakheesi Dubai-only

```js
// In sector-signal-libraries.js detectRealEstate, before emitting Trakheesi finding:
function detectRealEstate(fullText, sector, cityHints) {
  if (sector !== 'real-estate') return {};
  const signals = runDetectors(REAL_ESTATE, fullText);
  // Phase 5·C1: Trakheesi is Dubai-only. Only flag if Dubai in cityHints.
  if (signals.trakheesi_permit && !cityHints.includes('Dubai')) {
    delete signals.trakheesi_permit;
  }
  return signals;
}
```

And in the scraper:

```js
// Compute cityHints from intel address fields + page mentions
const cityHints = extractCities(intel, fullTextEnriched);
// Pass into the detector
const signals = detectRealEstate(fullTextEnriched, sector, cityHints);
// When emitting marketing_permit_disclosure_missing, ONLY for Dubai
if (intel.country === 'AE' && cityHints.includes('Dubai') && !signals.trakheesi_permit) {
  point(ptr, { category: 'marketing_permit_disclosure_missing', ... });
}
```

### Gate C → only deploy when ALL pass

1. Per-detector unit test (17 new tests)
2. Coverage matrix re-run: every (country, sector) cell now has ≥ 5 rules where applicable
3. Hallucination-proof verification passes for every new detector (Phase B still green)
4. Country-tag chip renders correctly across the new detectors
5. Regression: all suites green
6. Live smoke: 5 fresh audits across UAE, Saudi, India, US-NY-finance, EU-DE-fintech show the new detectors firing where applicable

---

## 6 · Gates BETWEEN phases (rollback-safe)

### Before Phase A merges

- [ ] Unit tests green (4 fixtures for resolveCountry, 6 for routeMulti)
- [ ] Integration test green (1 fixture for tri-country tag chip render)
- [ ] All 9 existing suites green
- [ ] Live smoke on Al Tamimi: country tags visible, both UAE and UK frameworks fire
- [ ] Telemetry sample: `confidence_per_country` populated in audit_events
- [ ] **Rollback file ready** at `cloudflare/audit-page-worker.v23-phase4.js` (current version, copy)

### Before Phase B merges

- [ ] Unit tests green (10 hallucination tests)
- [ ] Drop rate `evidence_verification_failed` < 5% of all findings across 7-fixture backtest
- [ ] Live smoke: re-render 5 fixtures, every finding's evidence verifiably present in scraped HTML
- [ ] Cross-method confidence ≥ 0.67 on every surviving finding
- [ ] All 9 existing suites still green (no regression)
- [ ] **Rollback file ready** at `src/lib/enrich/website-intel.v5A.js`

### Before Phase C merges (per detector, not the whole phase)

- [ ] One unit test per new detector, green
- [ ] Coverage matrix shows no cell drops below 5 rules
- [ ] Hallucination-proof gate still 100% pass (Phase B contract holds)
- [ ] Country-tag chip works for the new detectors
- [ ] **17 atomic commits, each independently revertable** (so if one detector misbehaves we revert one commit, not the whole phase)

### Cross-phase final gates

- [ ] All four phase test suites + new Phase 5 suites green: 9 + 3 = 12 suites, target 300+ assertions
- [ ] 100-fixture backtest (sample 10 leads per sector x 10 sectors): top-3 precision ≥ 90%
- [ ] 0 P0 findings hallucinated across the backtest
- [ ] P0 distribution: no rule pack > 50% P0 (the cap you confirmed)
- [ ] Live worker headers include `x-tamazia-engine: v24-phase5`
- [ ] Live audit on every active lead in Neon scans clean (no SRA leak on non-UK, no Trakheesi on non-Dubai UAE, etc.)

---

## 7 · Cross-prompt engineering pattern (the anti-hallucination spec)

Detail of what "cross-prompt engineering" means in this engine:

### Pattern · multi-method confirmation

```
For every signal-based finding (privacy, cookies, SRA, RERA, etc.):
  1. Run METHOD_1 (regex on body text)
  2. Run METHOD_2 (structural HTML parse for related element)
  3. Run METHOD_3 (path-based check — is /privacy in pages_fetched?)
  4. Compute agreement = count(methods that agree on "missing") / total methods
  5. Emit finding ONLY when agreement >= 0.67 (2 of 3)
  6. Store all 3 method results in the finding's `methods` field for audit
```

### Pattern · step-by-step verification

```
For every finding before persistence:
  Step 1. Extract the quoted snippet OR structural fact the rule cited
  Step 2. Verify the snippet appears verbatim in intel.pages_fetched_html
  Step 3. Verify the URL in `where` is in intel.pages_fetched
  Step 4. If structural fact, re-derive by re-parsing the HTML element
  Step 5. Drop finding if any of steps 1-4 fail
```

### Pattern · contradiction surfacing

```
After all detectors run:
  - Look for pairs of findings that contradict (e.g. "privacy notice missing" AND "privacy notice thin")
  - Resolve by keeping the higher-severity finding (P0 over P1)
  - Log contradiction event to audit_events for review
```

### Pattern · structural-fact preference

```
A "structural fact" (e.g. "no <meta name=viewport> tag in <head>") is preferred over
a phrase-match (e.g. "the word 'viewport' is missing from body text").
Structural facts are re-derivable and never hallucinate.
Phrase matches need cross-method confirmation per above.
```

---

## 8 · Full pipeline with gates (the production-grade view)

```
                              SOURCING (S060)
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │ GATE 0 · lead quality │
                          │ - domain reachable    │
                          │ - sector classifiable │
                          │ - country resolvable  │
                          └───────────┬───────────┘
                                      ▼
                       SCRAPE (website-intel.js)
                                      │
                                      ▼
                    ┌──────────────────────────────────┐
                    │ GATE 1 · scrape coverage         │
                    │ - >= 5 pages fetched OR          │
                    │ - SPA fallback succeeded OR      │
                    │ - site-unreachable marker emitted│
                    └────────────────┬─────────────────┘
                                     ▼
                  CLASSIFY (sector + countries[])
                                     │
                                     ▼
                  ┌──────────────────────────────────┐
                  │ GATE 2 · classification confidence│
                  │ - sector_confidence >= 0.5       │
                  │ - >=1 country with conf >= 0.5   │
                  │ - flag multi_jurisdiction        │
                  └────────────────┬─────────────────┘
                                   ▼
              ROUTE (jurisdiction-router · multi-country union)
                                   │
                                   ▼
                  DETECTORS (sector-signal libraries × N rules)
                                   │
                                   ▼
                  ┌──────────────────────────────────┐
                  │ GATE 3 · hallucination check     │
                  │ - every finding has verified     │
                  │   evidence (snippet OR structural│
                  │   fact re-derived)               │
                  │ - cross-method confidence >= 0.67│
                  └────────────────┬─────────────────┘
                                   ▼
                  CATEGORICAL RESOLUTION + APPLICABILITY GATE
                                   │
                                   ▼
                  ┌──────────────────────────────────┐
                  │ GATE 4 · validity check          │
                  │ - schema validation passes       │
                  │ - jurisdictions[] populated      │
                  │ - country tag present per row    │
                  └────────────────┬─────────────────┘
                                   ▼
                       STORAGE (Neon audit_pages)
                                   │
                                   ▼
                  ┌──────────────────────────────────┐
                  │ GATE 5 · storage integrity       │
                  │ - applicable_frameworks not stale│
                  │   (computed at render)           │
                  │ - finding count > 0              │
                  └────────────────┬─────────────────┘
                                   ▼
                       WORKER RENDER (audit-page-worker)
                                   │
                                   ▼
                  ┌──────────────────────────────────┐
                  │ GATE 6 · render-time invariants  │
                  │ - no UK strings on non-UK audit  │
                  │ - country tags rendered          │
                  │ - P0 cap <= 50% per pack         │
                  │ - AI score capped at 70          │
                  └────────────────┬─────────────────┘
                                   ▼
                        DELIVER + LOG audit_event
                                   │
                                   ▼
                  ┌──────────────────────────────────┐
                  │ GATE 7 · post-deliver telemetry  │
                  │ - page_view logged               │
                  │ - drop/remap/verify events logged│
                  │ - rule fire rate within bounds   │
                  └──────────────────────────────────┘
```

---

## 9 · Rollback safety (always-on)

Every phase deploys with this checklist completed:

- The previous worker source is committed as `cloudflare/audit-page-worker.v23-phase4.js` (rollback file).
- A one-line script `scripts/rollback-audit-worker.sh` re-substitutes secrets into the rollback file and re-uploads.
- The rollback path is tested before the new version goes live (deploy rollback file, hit the URL, confirm 200, then redeploy new).
- audit_events records `engine_version` per page_view so we can see exactly when traffic started using the new engine.
- KV cache is namespaced by engine version (`audit:v24:slug:hash` vs `audit:v23:slug:hash`) so flipping versions invalidates the relevant entries automatically.

---

## 10 · The eight decisions you confirmed

1. City-level scoping per rule. ✓ Sniper edits in Phase 5·C1 (Trakheesi Dubai-only), 5·C12 (BIPA Illinois-only), 5·C15 (NYDFS NY-only).
2. EU rollup with member-state specialisation when present. ✓ FR_CNIL_2025 / DE_BDSG land in Phase 5·C16 with country-specific overlays.
3. Modern Slavery threshold £36M + Companies House lookup. ✓ Phase 5·C2.
4. AI Act high-risk vocabulary broader. ✓ Phase 5·C3.
5. Country tags per finding. ✓ Phase 5·A4 (chip in finding card).
6. P0 cap 50% per pack. ✓ Gate C7 (cross-phase final gate).
7. Backtest 100 fixtures. ✓ Gate (cross-phase final), seeded from current Neon leads.
8. Rollback safety always. ✓ Section 9.

---

## 11 · Decision

Sign off and I begin Phase 5·A this hour, build → test → deploy → verify, then immediately Phase 5·B same rigour, then 5·C in 17 atomic commits. Estimated 5-8 working days for the whole thing.

The total cost in production downtime is **zero** because every phase is independently revertable in under 60 seconds.
