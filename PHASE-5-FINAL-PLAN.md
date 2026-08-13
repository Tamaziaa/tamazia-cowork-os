# Phase 5 · final plan
## 10 conceptual phases · merged into 2 implementation phases · gates throughout

Aman, you were right to push back. The earlier drafts were architecture porn. This document starts from the goal of the audit, derives the logic the engine must follow, lays out the 10 conceptual phases needed to make it perfect, and then collapses them into two implementation phases. Phase 1 contains everything that ships v24; Phase 2 is the broader-coverage residual.

---

## 0 · What the audit engine is actually for

The personalised audit at `/audit/{slug}/{hash}` is the Touch-1 conversion asset for cold outbound. A regulated-sector founder receives an email signed by Aman, clicks one link, sees an audit of THEIR site that says, in effect:

> "I am Aman, LLM in business law from King's College London, founder of Tamazia. I scanned your site. These are the regulators that apply to your business in the jurisdictions you actually operate in. Here are the specific gaps I found, with the verbatim evidence pulled from your pages. Here is the exact £ exposure for each. Here is what Tamazia does to fix it. Here is my calendar."

The audit page is not a compliance tool. It is a sales asset that converts senior regulated-sector decision-makers (legal partners, finance MDs, real-estate executives) into discovery calls with the founder. Conversion depends on three things:

1. **No errors a peer would catch.** A barrister reading the audit must not find a misquoted regulator, a wrong jurisdiction, or a hallucinated finding. One error voids the trust.
2. **Sector + jurisdiction mastery.** The reader must see the engine knows their world. Emaar must see UAE RERA + Trakheesi, not UK SRA. A Saudi bank must see SAMA, not FCA.
3. **A clean route to the call.** The page is the founder talking. The CTA at the end opens his calendar.

Every failure we have shipped (Emaar SRA leak, "0 gaps across 1 frameworks", reviews loading after scroll, missing red-cross column, wrong offer copy) sits on top of one of those three failure modes. We need an engine whose architecture makes those failures structurally impossible.

---

## 1 · The logic the engine must follow (one diagram)

```
LEAD RECORD (lead_id, company, domain, country hint, sector hint)
    │
    ▼  STEP 1 · SCRAPE the actual website
        sitemap-first · parallel · browser headers · SPA fallback · multi-page
        evidence captured: raw HTML per path + entity index + per-page DOM facts
    │
    ▼  STEP 2 · CLASSIFY
        sector (single canonical, confidence ≥ 0.5)
        countries[] (ALL countries with confidence ≥ 0.5, ordered by score)
        cities per country (Dubai vs Abu Dhabi, NY vs IL, Mumbai vs Delhi)
        languages detected on the actual pages
    │
    ▼  STEP 3 · ROUTE
        applicable_frameworks = UNIVERSAL ∪ ⋃(country_baseline + sector_overlay + city_overlay)
        every country with conf ≥ 0.5 contributes its full pack
        applicable_jurisdictions[] tagged per framework so findings know which country they apply to
    │
    ▼  STEP 4 · DETECT (run every applicable rule)
        per rule: trigger(intel) returns {found, snippet, url, structural_fact} OR null
        rule emits finding ONLY when:
            - found = true (signal genuinely missing or present-and-wrong)
            - snippet appears verbatim in scraped HTML (structural facts OK without snippet)
            - URL was actually crawled
            - cross-method confidence ≥ 0.67 for signals that have multiple methods
    │
    ▼  STEP 5 · ENRICH
        regulator name (English + localised in country's primary language)
        regulator URL · clause · concrete £ fine label · severity
        country tag chip (UK · UAE · SG) per finding
    │
    ▼  STEP 6 · GATE (the hallucination + correctness firewall)
        validate schema · re-verify evidence · cap P0 at 50% per pack
        drop any finding whose framework is not in applicable_frameworks
        rewrite any UK-flavoured copy that leaked through (defence in depth)
    │
    ▼  STEP 7 · ASSEMBLE
        bundle near-duplicates (same finding on 5 pages → one card listing 5)
        sort by severity × £ exposure
        pick top 3 for the priority section
    │
    ▼  STEP 8 · RENDER
        offer bar · header · TL;DR · homepage screenshot with markers
        services dashboard (what we always maintain + taking it further)
        priority three · framework status · finding cards with country tags
        AI Entity Index (capped at 70/100) · reviews · pricing tiers · calendar
    │
    ▼  STEP 9 · CACHE + DELIVER
        KV cache namespaced by engine version (audit:v24:slug:hash)
        edge cache 1h s-maxage · telemetry headers
    │
    ▼  STEP 10 · LOG
        page_view event · per-rule fire events · drop/remap/verify counts
        audit_events table is the audit trail for every render
```

Every box above is a gate. If a gate fails, the failure is logged with enough context to fix it without guessing.

---

## 2 · The 10 conceptual phases that get us there

Each phase is a single coherent piece of work. Implementing all ten gives an engine that hits the three success criteria above. The merger into 2 implementation phases happens in Section 3.

### Phase Ⓐ · Multi-country detection

Extend `resolveCountry()` to return `countries[]` (every country with confidence ≥ 0.5), not just the top. Add `cities_per_country` extraction (Dubai vs Abu Dhabi, NY vs IL). Add `routeJurisdictionsMulti({countries[], sector})` to the router that unions the per-country packs.

**Why this is foundational.** Without it the engine cannot serve multi-jurisdiction firms correctly. Al Tamimi (UAE + UK) and Rajah & Tann Asia (SG + multi) get one country's rules and look provincial.

### Phase Ⓑ · Cross-prompt anti-hallucination

Every detector returns `{found, snippet, url, structural_fact, methods[]}`. The schema validator enforces it. An evidence-verifier post-step re-checks every finding's snippet exists in scraped HTML and the URL was actually crawled. Signal-based detectors require ≥ 2 of 3 independent methods (path / multilingual phrase / structural HTML parse) to agree before firing.

**Why this is foundational.** Without it the engine occasionally invents findings that the reader can disprove in five seconds, killing trust.

### Phase Ⓒ · City-aware detection

Extract cities from scraped intel (address, page text, schema.org). Scope city-specific rules: Trakheesi (Dubai only), BIPA (Illinois only), NYDFS (NY only), state RERA (Maharashtra / Karnataka / etc.). Currently a UAE firm in Abu Dhabi gets a Trakheesi finding it never had to comply with.

### Phase Ⓓ · Sector detector hardening

Every detector in `sector-signal-libraries.js` returns the new structured shape `{found, snippet, url}`. No detector emits without evidence. Sector gates strict: an SRA detector never runs on a non-law-firm even if the sector is mistakenly "professional-services".

### Phase Ⓔ · Country tag rendering on findings

Every finding card carries `jurisdictions[]` derived from which country packs the framework belongs to. The card renders a small chip showing `UK · UAE` etc. so the reader sees which jurisdictions triggered the rule. The dashboard count uses `framework !== GOOGLE_EEAT` and never says "0 gaps across 1 frameworks".

### Phase Ⓕ · Pipeline gates + telemetry

Implement the seven gates from Section 1 as code-level assertions, each with its own telemetry event. Drops, remaps, verifications, fallbacks all log to `audit_events` with `engine_version: v24`. Telemetry headers on the worker response (`x-tamazia-*`) extended with `rule_fire_count`, `verified_count`, `dropped_count`.

### Phase Ⓖ · Gap detectors batch A (high-impact, UK/UAE-first)

Six immediate-impact additions:

- UAE city-Trakheesi scoping (Dubai only).
- Modern Slavery threshold to £36M with Companies House public-API turnover lookup.
- AI Act vocabulary expanded ("credit scoring", "underwriting model", "automated decisioning", "risk model", "algorithmic pricing").
- WCAG contrast grader runs across every fetched page (not just homepage), reports worst grade.
- FR_CNIL_2025 and DE_BDSG member-state specialisation rendering (regulator name swaps from "EU DPA" to "CNIL" / "BfDI").
- Per-row scope-out list respected by the worker recompute (S025 can suppress a rule with a stored override).

### Phase Ⓗ · Gap detectors batch B (broader sector coverage)

Five additions to close the matrix's metadata-only frameworks:

- Saudi SDAIA AI Ethics scanner (Saudi-specific AI use override).
- India TRAI commercial-comms scanner (consent + DND register).
- India CERT-In direction scanner (incident reporting + log-retention).
- India NPCI UPI scanner (fintech: payment-system disclosures).
- India PMLA AML scanner (finance: politically-exposed-persons + suspicious-transaction).
- HK SFC Conduct CE No categories (finance: per-licence-type disclosure).

### Phase Ⓘ · Gap detectors batch C (US + EU advanced)

Eleven additions, the rest of the matrix:

- US TCPA (cold-call + SMS consent).
- US CAN-SPAM (commercial email opt-out).
- US BIPA (Illinois biometric).
- US COPPA (under-13 protections, education sector).
- US HIPAA (PHI handling, healthcare).
- US NYDFS 23 NYCRR 500 (NY finance cyber).
- EU DORA (finance digital operational resilience).
- EU PSD2 (payment services).
- EU AML6 (anti-money-laundering directive 6).
- EU CSRD (sustainability reporting).
- EU SFDR (sustainable finance disclosure).
- EU NIS2 (network + information systems security).

### Phase Ⓙ · Backtest + production sign-off

100-fixture backtest: 10 leads per sector × 10 sectors, sampled from Neon. Render each through the new engine. Manual top-3 precision check: did the engine pick the right three priorities? Target ≥ 90% precision. Edge-case fixes round. Final rollback drill (deploy old, then redeploy new, confirm both work). Engine version flipped to v24 on live worker.

---

## 3 · The 10 conceptual phases merged into 2 implementation phases

You asked for Phase 1 to contain everything possible. Here is the cut.

### Implementation Phase 1 · v24 ship

Bundles conceptual phases Ⓐ + Ⓑ + Ⓒ + Ⓓ + Ⓔ + Ⓕ + Ⓖ + Ⓗ. Roughly 5 working days of focused work.

**Why these eight go together.** They are the architectural backbone (Ⓐ-Ⓔ) + the production-grade pipeline (Ⓕ) + the high-impact gap detectors (Ⓖ-Ⓗ). At the end of Phase 1 the engine:

- Serves multi-country firms correctly with country tags.
- Never hallucinates a finding (cross-prompt + evidence verifier).
- Scopes city-specific rules correctly (Trakheesi Dubai-only etc.).
- Has six immediate-impact detectors that close the most visible gaps.
- Has Saudi / India / HK scanners that close the metadata-only frameworks in those jurisdictions.
- Has the 7-gate pipeline with full telemetry.

Phase 1 alone makes the engine v24-grade. Phase 2 is residual coverage for jurisdictions where we currently have zero clients but will have soon (US states + EU advanced finance).

#### Phase 1 file-by-file diff

| File | Edit | Conceptual phase |
|---|---|---|
| `src/lib/classify/country-resolver.js` | extend to return `countries[]` + `cities_per_country` | Ⓐ + Ⓒ |
| `src/lib/compliance/jurisdiction-router.js` | add `routeJurisdictionsMulti` + per-rule `scope` field (city + revenue) | Ⓐ + Ⓒ |
| `src/lib/enrich/website-intel.js` | pass countries[] through · attach `jurisdictions[]` to findings · evidence-verifier + cross-method confirmation · WCAG per-page · cities extraction · S025 scope-out list | Ⓐ + Ⓑ + Ⓓ + Ⓔ + Ⓕ + Ⓖ |
| `src/lib/enrich/sector-signal-libraries.js` | refactor every detector to return `{found, snippet, url}` · add Saudi SDAIA · India TRAI/CERT-In/NPCI/PMLA · HK SFC | Ⓑ + Ⓓ + Ⓗ |
| `src/lib/enrich/multilingual-signals.js` | expose `findFirst` returning snippet not just boolean | Ⓑ |
| `src/lib/enrich/ai-act-classifier.js` | expand HIGH_RISK_CONTEXT vocabulary | Ⓖ |
| `src/lib/enrich/modern-slavery-detector.js` | threshold to £36M · Companies House public-API turnover lookup | Ⓖ |
| `src/lib/enrich/wcag-contrast-grader.js` | accept multiple HTMLs, return worst-page grade | Ⓖ |
| `src/lib/schema/finding-schema.js` | require `jurisdictions[]` · optional `quoted_snippet` / `structural_fact` / `methods[]` / `verification_confidence` | Ⓑ + Ⓕ |
| `src/lib/compliance/category-catalog.js` | add SDAIA / TRAI / CERT-In / NPCI / PMLA / SFC Conduct categories with country gates · FR/DE specialisation overrides | Ⓗ + Ⓖ |
| `src/lib/compliance/regulator-names-localized.js` | add CNIL / BfDI / SDAIA / TRAI / SFC Conduct / RBI Conduct localised names | Ⓖ + Ⓗ |
| `cloudflare/audit-page-worker.js` | accept countries[] via payload · render country-tag chip per finding · KV cache namespace by engine version · expose telemetry headers · 50% P0 cap enforcement at render · per-row scope-out list | Ⓔ + Ⓕ + Ⓖ |
| `scripts/rollback-audit-worker.sh` | one-line revert to previous worker source | Ⓕ |
| `outputs/test-phase5-1-v24.mjs` | 60-80 assertion test suite covering Ⓐ through Ⓗ | gate |

Approximate diff size: 1500 lines added, 400 lines deleted, across 13 files + 1 new file.

#### Phase 1 gates (everything must pass before deploy)

| Gate | What it proves |
|---|---|
| G1.1 | All 9 existing test suites still green (no regression) |
| G1.2 | `test-phase5-1-v24.mjs` green (60-80 assertions across Ⓐ-Ⓗ) |
| G1.3 | Tri-country fixture (UK + UAE + SG) renders with country tags on every finding |
| G1.4 | Hallucination-injection fixture: synthetic finding with fake snippet is dropped with telemetry event |
| G1.5 | Trakheesi appears on a Dubai-real-estate fixture but NOT on an Abu Dhabi fixture |
| G1.6 | UK fixture with £150M revenue triggers Modern Slavery finding; £8M fixture does not |
| G1.7 | AI Act fixture with "underwriting model" phrase fires high-risk classifier |
| G1.8 | WCAG grader returns worst-page grade across 5-page fixture, not just homepage |
| G1.9 | Saudi finance fixture fires SDAIA + SAMA + CMA_KSA findings |
| G1.10 | India fintech fixture fires DPDP + RBI + SEBI + NPCI + PMLA + CERT-In findings |
| G1.11 | HK finance fixture fires HKMA + SFC Conduct findings |
| G1.12 | Pipeline telemetry: every audit logs ≥ 1 page_view event with engine_version=v24 |
| G1.13 | Telemetry headers on live worker include `x-tamazia-engine: v24-phase5-1`, `x-tamazia-rule-fire-count`, `x-tamazia-verified-count` |
| G1.14 | Rollback drill: deploy v23 source via `rollback-audit-worker.sh`, hit URL, confirm 200, redeploy v24, confirm 200 |
| G1.15 | Live smoke on Streathers / Al Tamimi / Emaar / Saudi CMA / KWM HK / Razorpay / Streathers / Greystar / Loaf: every finding's evidence verifiably scraped, no UK leak on non-UK, country tags visible |
| G1.16 | P0 distribution check: no rule pack exceeds 50% P0 across the backtest |

Phase 1 ships when 16 of 16 gates pass.

### Implementation Phase 2 · v25 ship (residual coverage)

Bundles conceptual phases Ⓘ + Ⓙ. Roughly 3 working days.

**Why these are residual.** Phase Ⓘ is US state-specific + EU advanced finance frameworks. We have zero current clients in NY finance, Illinois biometric, EU sustainability-reporting bands. We will when Tamazia opens those geographies. Until then, the metadata is encoded but the detectors don't fire. Phase 2 closes that systematically, then Phase Ⓙ is the 100-fixture backtest + sign-off.

#### Phase 2 file-by-file diff

| File | Edit | Conceptual phase |
|---|---|---|
| `src/lib/enrich/sector-signal-libraries.js` | add US TCPA / CAN-SPAM / BIPA / COPPA / HIPAA / NYDFS detectors | Ⓘ |
| `src/lib/enrich/sector-signal-libraries.js` | add EU DORA / PSD2 / AML6 / CSRD / SFDR / NIS2 detectors | Ⓘ |
| `src/lib/compliance/category-catalog.js` | new categories for US-state + EU-advanced findings | Ⓘ |
| `src/lib/enrich/website-intel.js` | PDF body scanner · subdomain sitemap discovery · SPA fallback for internal pages | Ⓘ |
| `outputs/backtest-100-fixtures.mjs` | render 100 sampled audits from Neon · manual top-3 precision check · edge-case fixes | Ⓙ |
| `cloudflare/audit-page-worker.js` | engine version flip to v25 | Ⓙ |

Approximate diff size: 600 lines added, 50 lines deleted, across 4 files + 1 new test file.

#### Phase 2 gates

| Gate | What it proves |
|---|---|
| G2.1 | Phase 1 gates still all green (no regression) |
| G2.2 | US-state fixtures fire correctly (NY finance triggers NYDFS, IL retail triggers BIPA, healthcare triggers HIPAA, education triggers COPPA) |
| G2.3 | EU advanced fixtures fire correctly (German finance triggers BaFin + DORA, French ecommerce triggers CNIL + DSA + CSRD where applicable) |
| G2.4 | 100-fixture backtest top-3 precision ≥ 90% (manual review) |
| G2.5 | Edge cases: empty scrape, single-page site, WAF-blocked site, JS-only SPA, multilingual site all render correctly |
| G2.6 | Engine version flipped to v25 on live worker, all current audit URLs still 200 |

Phase 2 ships when 6 of 6 gates pass.

---

## 4 · How each phase prevents the three failure modes

| Failure mode the engine must never hit | Phase 1 prevention | Phase 2 prevention |
|---|---|---|
| Wrong jurisdiction (Emaar SRA) | Ⓐ multi-country + Ⓔ country tags + worker recompute + gate G1.15 | (already covered) |
| Wrong sector (real estate gets law firm rules) | Ⓒ city-aware + Ⓓ sector detector hardening + gate G1.5 | (already covered) |
| Hallucinated finding | Ⓑ cross-prompt + evidence verifier + gate G1.4 | reinforced by larger backtest |
| Empty audit ("0 gaps across 1 frameworks") | Ⓔ dashboard count uses framework !== GOOGLE_EEAT + Ⓖ-Ⓗ broader detectors fire on more gaps | Ⓘ adds even more rules per sector × country |
| Sounds AI-generated | none (all human-authored copy in worker is jurisdiction-correct after Phase 1) | (already covered) |
| Wrong £ amounts | Ⓖ Companies House lookup for revenue · localised fines in catalog | (already covered) |
| Reviews / proof don't load | already fixed in user-feedback round 2 | (verified by Phase 2 backtest) |
| Calendar doesn't load | already fixed in Phase 1.5 (JS-injected with fallback) | (verified by Phase 2 backtest) |
| Embarrassing typos / dashes / generic copy | dash lint script in Phase 1 G1.15 | (verified by Phase 2 backtest) |

---

## 5 · Per-step pipeline gates (the operational view, restated tighter)

```
STEP 1 SCRAPE        → GATE A · ≥ 5 pages OR SPA-rendered OR site-unreachable marker
STEP 2 CLASSIFY      → GATE B · sector_confidence ≥ 0.5 AND ≥1 country at conf ≥ 0.5
STEP 3 ROUTE         → GATE C · applicable_frameworks recomputed at render (never trust stored)
STEP 4 DETECT        → GATE D · every finding has {snippet OR structural_fact, url} verified
STEP 5 ENRICH        → GATE E · regulator name + localised + URL + fine + clause populated
STEP 6 GATE          → GATE F · schema validation passes · applicability re-check passes
STEP 7 ASSEMBLE      → GATE G · top-3 picked by severity × fine · bundle dedupe happened
STEP 8 RENDER        → GATE H · no UK strings on non-UK · country tags present · P0 ≤ 50%
STEP 9 CACHE+DELIVER → GATE I · KV namespace = engine_version · edge cache headers set
STEP 10 LOG          → GATE J · page_view + drop/remap/verify events written to audit_events
```

Ten gates, one per step. Every gate is testable. The Phase 1 test suite asserts every gate at least once.

---

## 6 · Why I have confidence this time

1. **I started from the goal, not the code.** Section 0 articulates what the audit is for. Sections 1-5 derive from that.
2. **Two implementation phases, not five.** Smaller surface area, fewer cutovers, faster to ship.
3. **Phase 1 is exhaustive.** Multi-country, anti-hallucination, city-aware, sector hardening, country tags, pipeline gates, telemetry, six high-impact gap detectors, six Saudi/India/HK detectors. Everything that makes the engine production-grade.
4. **Phase 2 is honest residual.** US-state + EU-advanced are deferred because we have zero current clients there. Honest scoping beats false urgency.
5. **Every phase has gates.** 16 in Phase 1, 6 in Phase 2. No "ship and hope".
6. **Rollback is one command.** `bash scripts/rollback-audit-worker.sh` redeploys v23. KV cache namespaces by version so flipping is instant.
7. **The diff per file is bounded.** Largest single file change ≈ 400 lines (website-intel.js). Everything else 50-200. I can hold the whole change in my head.

---

## 7 · The decision

Read this. If you agree:

- **Today**: I start Phase 1 in the order Ⓐ → Ⓑ → Ⓒ → Ⓓ → Ⓔ → Ⓕ → Ⓖ → Ⓗ. After each conceptual phase its sub-tests run; after all eight, the unified Phase 1 suite runs.
- **End of Phase 1**: deploy v24, validate live across 9 known fixtures + Phase 1 gates, mark Phase 1 complete.
- **Phase 2**: start immediately after, 3 days, same rigour. Final 100-fixture backtest signs off the engine.

If anything in Section 2 or Section 3 should NOT be in Phase 1, tell me and I move it to Phase 2. Otherwise the next message I send is "Phase 1·Ⓐ starting".
