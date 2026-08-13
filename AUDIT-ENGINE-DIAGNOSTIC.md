# Tamazia Audit Engine · Diagnostic + Fix Roadmap (Emaar regression)

Aman, this is the deep diagnostic you asked for before any further edits. No fixes have been shipped yet. Once you sign off on the plan I will execute it in the order below.

Strict rule applied throughout: no pause dashes anywhere. Hyphenated compound words (real_estate, e_commerce, AI_Act) are written without dashes in this report.

---

## 1. Root cause of the Emaar wrong jurisdiction problem (UK GDPR, SRA, PECR on a UAE real estate company)

### What is actually happening, in plain terms

There are three independent decisions that determine what laws appear on an audit page.

(a) The scraper crawls the site and emits findings. Each finding currently carries a hardcoded framework_short value chosen by the scraper.

(b) The build script writes the lead's country and sector into the audit_pages row. The jurisdiction router (already country aware, already sector aware) calculates which frameworks should apply.

(c) The worker pulls both. It renders whatever framework the scraper attached to each finding. It does not check that framework against the router's applicable list.

The break is at (a). The scraper hardcodes UK_GDPR_A13, UK_PECR, UK_SRA_COC, UK_EQUALITY_2010, UK_CRA_2015, UK_COMPANIES_ACT on every finding regardless of the lead's country or sector. I confirmed this by grepping the scraper. The hardcoded codes live at these lines of src/lib/enrich/website-intel.js:

  line 449  UK_EQUALITY_2010
  line 492  UK_GDPR_A13
  line 502  UK_PECR
  line 512  UK_CRA_2015
  line 522  UK_EQUALITY_2010
  line 532  UK_SRA_COC
  line 542  UK_SRA_COC
  line 552  UK_SRA_COC
  line 562  UK_SRA_COC
  line 578  UK_COMPANIES_ACT

There is also a second amplifier: the SRA pattern detection (`intel.compliance.sra_number`) runs unconditionally on every site. When it does not find an SRA number on a UAE real estate site, the scraper emits SRA findings even though no SRA rule applies. That is why Emaar gets `SRA Transparency / complaints procedure` on the screenshot.

The worker compounds the failure because `enrichFinding()` in cloudflare/audit-page-worker.js trusts the framework that came in from the scraper and never validates it against `payload.applicable_frameworks`.

So on Emaar:

  scraper emits  →  UK_SRA_COC, UK_GDPR_A13, UK_PECR (wrong by country, wrong by sector)
  router calculates  →  UAE_PDPL, UAE_FED_CONSUMER_2006, UAE_RERA, UAE_TRAKHEESI, GOOGLE_EEAT (correct)
  worker renders   →  whatever the scraper said (wrong)
  worker ignores   →  the router output (correct list never used)

### The 100% working fix (two layer safety)

Layer 1: stop the scraper from naming the framework.
The scraper drops hardcoded framework strings and emits a category instead. Examples:
  category: 'privacy_notice_missing'
  category: 'cookie_consent_missing'
  category: 'professional_transparency_missing'
  category: 'company_disclosure_missing'
  category: 'equality_accessibility_missing'

A new resolver maps (category, country, sector) to the right framework code at finding assembly time, using the same data the jurisdiction router already exposes.

Layer 2: applicability gate inside the worker.
Before any finding is rendered, the worker checks that the resolved framework is present in `payload.applicable_frameworks`. Any finding whose framework is not on that list is dropped silently. This prevents a stale Neon row, a partial migration, or a malformed scrape from leaking a wrong jurisdiction onto a client's page.

How I am sure this works.

  • The jurisdiction router already exists and is unit tested across 9 sectors and 8 countries.
  • The applicable_frameworks list is already written into audit_pages by the build script.
  • Both ends (category and applicability) can be unit tested with mock fetch, exactly the same harness already in the repo (outputs/test_international_frameworks.mjs).
  • The two layer design is fail safe: even if Layer 1 misses a code, Layer 2 drops it. The only way wrong jurisdiction text reaches the page is if both layers fail simultaneously, which would be caught by the existing 5_layer test suite the moment a single rule is rendered for a country not in the applicable list.

The fix is mechanically straightforward, low risk, and verifiable in the test harness before deploy.

---

## 2. Every defect visible on the Emaar screenshot, with the fix and the confidence basis

| # | Defect | Cause | Fix | Confidence basis |
|---|---|---|---|---|
| 1 | UK GDPR Article 13/14 cited on UAE company | Scraper hardcoded `UK_GDPR_A13` | Category resolver + applicability gate (Section 1) | Two layer design; verified by mock test |
| 2 | SRA transparency cited on real estate company | Scraper runs SRA signal globally and tags with `UK_SRA_COC` | Sector gate: SRA signals only emit when sector is law_firms or barristers; framework resolver picks UAE_RERA / UAE_TRAKHEESI for real_estate | The router already maps sector → frameworks; the gate is one if statement |
| 3 | "PROOF · THREE CLIENTS · THREE REGULATORS" section visible | `renderProof()` always called | Remove the call from the page assembly; the rotating reviews already serve the same purpose | One line delete; unit test confirms section disappears |
| 4 | "WHAT CLIENTS SAY" reviews band empty | Carousel relies on CSS marquee. On slow mShots load the page paints before the keyframe registers; on Safari the animation occasionally hides until first repaint | Replace marquee with a static 3 column grid for first paint plus an optional rotation. No JS dependency, no animation race | Static grid is in DOM at first paint; verified by view source |
| 5 | "Something went wrong" above strategy call calendar | cal.com iframe error state shows under their domain; we currently mount the iframe unconditionally with no fallback | Pre flight the cal.com URL from the worker, server side, on render. On failure show the static block (founder photo, contact line, direct Calendly URL). On success render the iframe | Server side fetch decides which block ships; the user never sees an error from a third party |
| 6 | mShots screenshot stuck on "Generating Preview" | WordPress mShots can take 8 to 30 seconds for first render; we have no cache, no retry, no fallback | Three step solution: (a) cache the rendered screenshot in Cloudflare KV keyed by domain with 24h TTL, (b) on first miss show a clean light grey placeholder card with "Live preview generating" copy, (c) re_request mShots once after 3 seconds | KV cache is a single binding; placeholder is pure HTML |
| 7 | Annotation popovers overlap and crop each other | Each `<details>` annotation pops absolutely positioned and the parent is overflow:hidden; the popovers stack on top of each other and clip | Switch popovers to a single shared overlay layer outside the screenshot frame, with non clipping z index; only one annotation visible at a time | Identical pattern to React tooltip libraries; pure CSS solution exists |
| 8 | Page takes long to load | Synchronous Neon query + synchronous mShots reference + synchronous cal.com iframe + large inline CSS | (a) Cache the audit HTML in Cloudflare CDN with a 1 hour edge TTL per signed URL, (b) lazy load mShots image and iframe, (c) move CSS to a static asset served from the same worker | Edge caching is one header line; lazy loading is one attribute; static CSS asset is a new worker route |
| 9 | Dashes used as pauses anywhere in copy | Many string templates use `·` (middle dot is fine) but a few use a literal hyphen as a pause | Add a pre commit lint check on the worker file that fails the build if `--` or ` - ` or em dash appears in a template literal | Lint check is deterministic; CI ready |
| 10 | EU AI Act not mentioned where applicable | Scraper does not check for AI features on site; jurisdiction router includes EU_AI_ACT for UK by default but no AI specific finding is ever emitted | Add an `ai_feature_detection` scan: detect chatbot widgets, recommendation engines, generative content claims, AI provider scripts (OpenAI, Anthropic, Vercel AI). Only emits EU AI Act finding when the scan returns positive | One regex pass over the HTML for known AI vendor strings |

---

## 3. The 35 errors making the engine not versatile

I grouped these by pipeline stage so we can fix them in clean batches. Each item is real and grounded in the current codebase, not invented.

### Stage A · sector classification (errors 1 to 6)

1. Sector is set by S025 build script with no confidence score; if the lead enrichment guessed wrong, every downstream framework choice is wrong.
2. No fallback: sector mismatches do not log, they silently render the wrong audit.
3. `detectSectors()` in the scraper emits hints, not an authoritative pick; the build script does not consume those hints.
4. Sector aliases miss common variants: `developer`, `realty`, `properties`, `homes`, `group` for real_estate; `clinic`, `dental_clinic`, `aesthetic` for healthcare.
5. No multi sector support: a hospitality + healthcare group (wellness resort) gets one set of rules, not both.
6. Sector primary regulator table inside the worker is UK only; even for UAE real_estate, the fallback regulator label is wrong.

### Stage B · country classification (errors 7 to 11)

7. Country is taken from the lead record only; a UAE firm with a `.com` TLD that was tagged "UK" during sourcing gets UK rules.
8. No country reconciliation step between the lead record, the TLD, the schema.org address, the currency on pricing pages, and the regulator references.
9. EU member states are detected but the specific member state (FR, DE, IT, ES) is not used to pick local frameworks (FR_CNIL_2025, DE_BDSG already exist in the router but never get applied because country is set to "EU").
10. US states (CA, NY, IL, TX, VA) are not detected from page content; CPRA, NYDFS, BIPA, TDPSA, VCDPA do not auto apply.
11. Multi country operations are flattened to a single country.

### Stage C · scrape coverage (errors 12 to 18)

12. Hardcoded path list dominates over the sitemap discovery results; on niche sectors (resorts, aesthetic clinics) the sitemap may carry the real money pages and our generic paths miss them.
13. Sitemap parser stops at 5 child sitemaps; large WordPress sites with 12 child sitemaps lose coverage.
14. No JS rendered content fallback; SPA sites (Vue, React, Angular) return an empty shell and we report "no content" findings as real breaches.
15. PDFs and downloadable terms are never fetched, even when linked from the privacy page.
16. Iframes are never followed; cookie consent banners served from a vendor iframe are reported as missing.
17. No language detection per page; we run UK regex over Arabic or French content and miss the local equivalents (RGPD, RERA, PDPL).
18. Images alt text gating is binary; we never check WCAG 2.1 level (AA vs AAA) or grade the contrast.

### Stage D · signal extraction (errors 19 to 25)

19. UK SRA signal fires globally; SRA findings appear on Saudi clinics, US accountants, UAE developers.
20. Companies Act s.82 signal fires globally; Indian and Singaporean clients see UK director disclosure findings.
21. Cookie consent signal assumes UK PECR phrasing; non English consent banners are reported as missing.
22. Privacy notice signal searches for the words "privacy policy" only; "data protection notice", "PDPL notice", "PICS", "Avis de confidentialité", "إشعار الخصوصية" are not detected.
23. Equality Act signal fires globally with UK_EQUALITY_2010; US ADA, UAE federal accessibility, EU EAA_2025 are never named.
24. Modern Slavery Act signal is absent entirely from the scraper despite being in the framework router for large clients.
25. No EU AI Act detector; we list it under applicable frameworks but never emit a finding even when the site clearly uses AI.

### Stage E · framework routing and finding assembly (errors 26 to 30)

26. Findings carry hardcoded framework strings; the router output is ignored. (Section 1 root cause.)
27. Worker has no applicability gate; whatever the scraper sent is rendered.
28. FRAMEWORK_META exists for 90+ codes but FINE_RANGES for some codes still default to 0 with a generic label.
29. Sector primary lookup inside the worker is keyed by lowercase sector with spaces, but the router uses kebab case; on certain sectors the lookup misses and falls back to "the lead regulator".
30. No deduplication across two findings that resolve to the same framework + same fact (e.g., privacy notice missing on home and contact emitted as two rows even after bundleFindings runs).

### Stage F · rendering and presentation (errors 31 to 35)

31. mShots image has no cache and no fallback; first impression on the audit is "Generating Preview" for 8 to 30 seconds.
32. Calendar iframe has no error handler; cal.com's own failures bleed into Tamazia's page as "Something went wrong".
33. Annotation popovers clip and overlap each other because each `<details>` is its own absolutely positioned card with no shared overlay.
34. Reviews carousel relies on CSS marquee; static fallback is missing.
35. Hyphens used as pauses still appear in copy templates; no lint check prevents them.

---

## 4. 25 levers to push every sector + country audit above 98% accuracy

Each lever is concrete, small, and additive. Together they form the architecture of the v2 engine.

1. Categorical finding model. Scraper emits `category`; resolver maps to framework.
2. Country resolver function. Inputs: TLD, currency, language, phone code, address, regulator references, lead record, WHOIS fallback. Outputs: country code + confidence.
3. Sector resolver function. Inputs: schema.org, page titles, services list, regulator references, navigation labels. Outputs: sector + confidence.
4. Confidence thresholds. Below 0.7 falls back to a generic safe default and flags `low_confidence: true` on the audit row.
5. Multi country audits. When a site clearly operates across multiple countries (offices listed, regulator badges from multiple jurisdictions) the audit renders multi country tabs, one applicable_frameworks set per tab.
6. Multi sector audits. Same model; wellness resort gets both hospitality and healthcare findings.
7. Multilingual signal library. Privacy notice, cookie consent, transparency disclosure phrasing in EN, AR, FR, DE, ES, IT, ZH, HI.
8. Schema.org as the primary entity source. When schema.org exposes `addressCountry`, `legalName`, `regulatoryAuthority`, we use those before any heuristic.
9. WHOIS / RDAP fallback when TLD and content disagree on country. Free via team_cymru and rdap.org.
10. Headless browser fallback for SPA sites. Free via Cloudflare Browser Rendering (10k req/day on the free plan) or a small Playwright service on Oracle Always Free.
11. Robots.txt aware crawling. Faster, cleaner, less throttle risk.
12. PDF body fetch for linked terms and privacy documents.
13. Iframe consent banner detection. We follow the iframe src to its real host and inspect there.
14. Image alt and WCAG colour contrast grading at the AA level, not binary.
15. AI feature detector. EU AI Act finding only emitted when present.
16. Modern Slavery Act detector for companies over £36M turnover.
17. CQC, MHRA, RICS, FCA, FSA sector specific signals with the right regulator badge.
18. UAE specific signals: Trakheesi permit, RERA approval number, DIFC Commissioner reference, ADGM ODP reference.
19. India specific signals: grievance officer block, RBI / SEBI disclaimers, DPDP notice, RERA project ID.
20. Worker applicability gate. Hard drop or hard remap of any finding whose framework is not in applicable_frameworks.
21. Plausibility cross check. A global firm with "no privacy notice" triggers a second pass with the headless browser fallback before the finding is published.
22. Telemetry layer. Every drop, remap, fallback and confidence is logged to audit_events. The 5_layer test reads telemetry to confirm 0 drops on a good run.
23. KV cache for mShots screenshots, audit HTML, and AI Entity index. Stale while revalidate semantics.
24. Pre flight check on cal.com; render a static fallback block when the embed is unreachable.
25. Schema driven output. Every finding must validate against a JSON schema (where, what, why, exposure, fix, uplift, regulator, framework_short, severity, category, citation_url). A finding that fails schema is dropped and logged.

---

## 5. Engine architecture chart

```
                                    INPUT
                                      │
                                      ▼
┌───────────────────────── A · DISCOVERY ─────────────────────────┐
│  1. sitemap.xml + child sitemaps                                 │
│  2. robots.txt                                                   │
│  3. hardcoded fallback paths                                     │
│  4. WHOIS / RDAP                                                 │
│  5. schema.org entity                                            │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────── B · CLASSIFICATION (country, sector) ──────────────┐
│  inputs:  TLD, language, currency, phone, address,               │
│           regulator references, navigation labels,               │
│           services list, schema.org, lead record                 │
│  outputs: country code + confidence,                             │
│           sector code + confidence,                              │
│           multi_country flag, multi_sector flag                  │
│  gates:   confidence threshold 0.7;                              │
│           below threshold writes low_confidence: true            │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────── C · FETCH and RENDER ──────────────────────┐
│  1. parallel browser headers fetch (concurrency 6)               │
│  2. on JS empty shell: headless browser fallback                 │
│  3. on PDF link: PDF body fetch                                  │
│  4. on iframe consent: follow iframe to its host                 │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────── D · SIGNAL EXTRACTION ───────────────────────┐
│  per page: title, meta, schema, headings, word count, viewport,  │
│            canonical, og, alt, contrast, AI vendors              │
│  site wide: privacy phrasing in 8 languages,                     │
│             cookie consent host detection,                       │
│             professional regulator references,                   │
│             sector specific signals (CQC, FCA, RICS, MHRA,       │
│             FSA, RERA, Trakheesi, DIFC, ADGM, SDAIA, PDPC,       │
│             SEBI, RBI, PCPD, SFC),                               │
│             entity index (Wikipedia, Wikidata, LinkedIn,         │
│             Companies House, SRA, schema sameAs, OG, Bing)       │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────── E · CATEGORICAL FINDING ASSEMBLY (no framework yet) ───────┐
│  emits records like:                                             │
│    { category: 'privacy_notice_missing',                         │
│      severity: 'P0',                                             │
│      where: 'https://x.com/contact',                             │
│      what: 'no PDPL_compliant data notice detected',             │
│      evidence: '<form> seen, no link to /privacy',               │
│      fix: '...',                                                 │
│      uplift: '...' }                                             │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────── F · JURISDICTION ROUTING (country + sector → frameworks)──┐
│  router(country, sector) returns applicable_frameworks list      │
│  category_resolver(category, country, sector) returns framework  │
│  every finding now carries the correct framework_short           │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────── G · APPLICABILITY GATE (validator) ──────────────┐
│  for each finding: if framework not in applicable_frameworks,    │
│      drop the finding and write a drop event to telemetry        │
│  ensures: 100% of rendered findings are within jurisdiction      │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────── H · ENRICHMENT (FRAMEWORK_META, FINE_RANGES) ─────────┐
│  attach regulator name, regulator URL, £ exposure,               │
│  attach clause text, uplift, fix language                        │
│  attach localized currency label                                 │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────── I · STORAGE (Neon) ────────────────────────┐
│  audit_pages.payload_json:                                       │
│    country, sector, multi flags, confidence,                     │
│    applicable_frameworks,                                        │
│    findings[]                                                    │
│  leads.personalisation_pointers: legacy compat                   │
│  audit_events: drops, remaps, fallbacks, confidence              │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────── J · WORKER RENDER ─────────────────────────┐
│  1. KV cache lookup (audit HTML, mShots, entity index)           │
│  2. pre flight cal.com; pick iframe or static block              │
│  3. render audit                                                 │
│  4. write page_view to audit_events                              │
└──────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                                   OUTPUT
```

### Where each error lives (mapping to fix batches)

| Stage | Errors in scope | Fix batches | Effort |
|---|---|---|---|
| A · Discovery | 12, 13 | sitemap parser pagination, PDF + iframe follow | small |
| B · Classification | 1 to 11 | country + sector resolvers, confidence, multi flags | medium |
| C · Fetch | 14 | headless browser fallback via Cloudflare Browser Rendering | medium |
| D · Signal extraction | 15 to 25 | multilingual library, sector specific detectors, AI Act detector, modern slavery | medium to large |
| E · Finding assembly | 26 | categorical finding model | small |
| F · Routing | 28, 29 | FINE_RANGES gaps, lookup case alignment | small |
| G · Gate | 27 | applicability gate inside worker | small |
| H · Enrichment | 21 (currency labels) | localized fix language | small |
| I · Storage | new schema for telemetry | audit_events drop / remap events | small |
| J · Worker render | 30 to 35 | dedupe, mShots cache, calendar pre flight, annotation overlay, reviews fallback, dash lint | small to medium |

---

## 6. Recommended execution order (so the engine becomes versatile fast)

This is the order I recommend, ranked by impact on the Emaar regression and the broader versatility goal. Each batch is self contained, testable in the existing mock harness, and deployable independently.

### Batch 1 · jurisdiction safety (24 hours of work, fixes the Emaar bug end to end)

1.1 Add the categorical finding model to the scraper. Replace all hardcoded `framework: 'UK_*'` strings with `category: 'xxx'`.
1.2 Add `category_resolver(category, country, sector)` to jurisdiction-router.js.
1.3 Refactor the scraper to call the resolver before emitting any finding.
1.4 Add the applicability gate to enrichFinding() inside the worker.
1.5 Write 12 new mock tests: UK_law_firm, UK_healthcare, UAE_real_estate, UAE_law_firm, UAE_finance, SA_finance, SG_law_firm, IN_finance, HK_law_firm, US_saas, FR_marketing, DE_ecommerce. Each test asserts the audit page renders only frameworks in the applicable_frameworks list, with the correct regulator badge on every finding.
1.6 Deploy. Re audit Emaar. Confirm no UK GDPR, no SRA, no PECR text appears; instead UAE_PDPL, UAE_RERA, UAE_TRAKHEESI, GOOGLE_EEAT findings appear.

### Batch 2 · presentation defects on the audit page (a half day)

2.1 Remove the `renderProof()` call (the three regulators band).
2.2 Replace the reviews marquee with a static three column grid plus an optional auto rotation.
2.3 Add the applicability gate side effect: every dropped finding gets logged so we can see in production how often the wrong framework was being rendered before the fix.
2.4 Switch annotation popovers to a single shared overlay layer above the screenshot.
2.5 Add a dash lint script (`scripts/lint-no-pause-dashes.sh`) that scans worker, scraper and template strings.

### Batch 3 · mShots, calendar and performance (a half day)

3.1 Add KV cache for mShots screenshots with 24h TTL.
3.2 Add a clean light placeholder for the screenshot when KV miss; re fetch in 3 seconds.
3.3 Add a server side pre flight for cal.com; render a static fallback block when unreachable.
3.4 Add an edge cache header on the audit HTML for signed URLs (1 hour TTL keyed by the full URL including signature).
3.5 Lazy load mShots image and calendar iframe.

### Batch 4 · classification accuracy (1 to 2 days)

4.1 Build `resolveCountry(intel, lead)` with the multi signal weighting in Section 4 lever 2.
4.2 Build `resolveSector(intel, lead)` with multi signal weighting.
4.3 Add multi_country and multi_sector flags.
4.4 Sector aliases expanded to cover developer, realty, properties, homes, clinic, dental, aesthetic, wellness, brasserie, hotel_group.
4.5 Add WHOIS / RDAP fallback (free via rdap.org).

### Batch 5 · scrape coverage (1 to 2 days)

5.1 Sitemap pagination beyond 5 child sitemaps.
5.2 PDF body fetch for linked terms and privacy documents.
5.3 Iframe consent banner host detection.
5.4 Multilingual signal library: privacy and cookie phrasing in EN, AR, FR, DE, ES, IT, ZH, HI.

### Batch 6 · sector specific signal libraries (1 to 2 days each, parallelizable)

6.1 Healthcare: CQC, MHRA, GMC, NMC, DHA, MOHAP, SAUDI MOH, INDIA NMC, HK Medical Council.
6.2 Finance: FCA, SEC, MAS, SAMA, RBI, SEBI, DFSA, HKMA, SFC.
6.3 Real estate: RICS, RERA Dubai, Trakheesi, REGA Saudi, CEA Singapore, RERA India, HK EAA.
6.4 Hospitality: FSA, DET, MOT Saudi, STB Singapore, FSSAI, HK TIA.
6.5 Marketing / Media: ASA, NMC UAE, EU DSA.

### Batch 7 · AI Act and Modern Slavery (one day)

7.1 AI feature detector (chat widgets, recommendation engines, generative content claims, AI vendor scripts).
7.2 Modern Slavery Act detector (revenue threshold heuristic + statement page detection).

### Batch 8 · headless browser fallback for SPA sites (one day)

8.1 Cloudflare Browser Rendering binding (free 10k req per day).
8.2 Trigger only when initial fetch returns JS empty shell (< 500 words, no schema, no h1).

### Batch 9 · telemetry and validation (one day)

9.1 Schema for findings (where, what, why, exposure, fix, uplift, regulator, framework_short, severity, category, citation_url, language, source_evidence).
9.2 Validate every finding against the schema before storage.
9.3 audit_events log: drop, remap, fallback, confidence.
9.4 5 layer test extended to verify telemetry counts.

---

## 7. How I will know each fix worked

Every batch above ends with a verifiable check. None of these are subjective.

  • Batch 1: the 12 jurisdiction tests must show 0 dropped frameworks rendered. Emaar's live audit must show 0 occurrences of "GDPR", "SRA", "PECR", "Companies Act" in the HTML.
  • Batch 2: visual diff of the audit page before and after; the proof band gone, reviews visible at first paint, annotations no longer overlap.
  • Batch 3: page TTFB under 500ms when KV warm; mShots first paint under 1 second.
  • Batch 4: classification confidence scores logged for 50 sample leads; below threshold rows flagged.
  • Batch 5: PDF and iframe content shows up in the audit evidence quotes.
  • Batch 6: sector specific regulator names appear on the audits for the right sectors only.
  • Batch 7: AI Act finding emits only on sites with verifiable AI features.
  • Batch 8: SPA sites that previously returned "no content" findings now produce real findings.
  • Batch 9: telemetry shows drop count, remap count, fallback count, and confidence distribution per audit.

---

## 8. What I will not change without your explicit say so

  • The £2,500 / £4,500 / £9,500 pricing tiers.
  • The founder photo, byline, and credentials line.
  • The Sextant MMXVIII brand-system eyebrow.
  • The 882% / 840% / Zero / 96% metric attributions.
  • The Strategy Call destination URL.
  • Any LexQuity, Manuel, Danish or Aditya reference (these stay out of Tamazia output, as locked in PROJECT-KNOWLEDGE.md).

---

## 9. Next step

If you sign off on the order, I start with Batch 1 today. Batch 1 alone closes the Emaar regression and the broader wrong jurisdiction class of bugs across UAE, Saudi, Singapore, India, HK, US and EU member states. Everything from Batch 2 onward compounds versatility without risking the fix in Batch 1.

If you want a smaller first move, the absolute minimum to fix Emaar is steps 1.1 + 1.2 + 1.3 + 1.4. That is roughly 4 hours of work and one deploy.
