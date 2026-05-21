# PR · Phase 5 audit micro-site spec for github.com/Tamaziaa/tamazia-website
**Phase 5 tasks**: 5.1.1, 5.1.3, 5.2.1–5.2.4, 5.3.1–5.3.10, 5.4.1, 5.4.2, 5.6.1, 5.10.1
**Branch**: `audit-microsite-v6`
**Authored**: 2026-05-19 in COWORK-OS-EXECUTION. Repo-side code lands in tamazia-website Astro repo.

## Context
The audit page already exists at `tamazia.co.uk/audit/{slug}/{hash}` (functions/api/audit.js + src/data/sector-framework-matrix.json from IMPL-DOC-V1). Phase 5 upgrades it from a one-page Regulatory Signal Scan to a 10-section luxury micro-site that drives meetings.

The data layer is already live in Neon (audit_pages, audit_events, proposal_versions, performance_budgets, audit_dashboard view). The Astro page should:
1. Fetch the row by `(slug, hash)` from audit_pages on every render — payload_json holds everything.
2. Emit a single hard-coded SCRIPT into the page that POSTs client-side events to `/api/track/audit-event` which calls S019 engagement-tracker.
3. Render 10 sections per the spec below.
4. Render the Disclaimer.astro component from Phase 2.
5. Export PDF via Playwright using src/lib/pdf-renderer.ts.

## 10 sections to ship

| # | Section | Source data | Note |
|---|---|---|---|
| 1 | Cover (firm name, scan timestamp, sector, jurisdiction, framework version) | payload_json.sections.cover | Sticky-anchored, 100vh hero |
| 2 | Three Findings (above-fold hook) | payload_json.sections.three_findings + top 3 P0 rules | One per card, framework citation, screenshot stub |
| 3 | Current vs After Tamazia (table) | payload_json.sections.current_vs_after | 8 rows, before/after columns |
| 4 | Compliance signal inventory | payload_json.rules | Filterable by P0/P1/P2 + framework |
| 5 | SEO opportunity sizing | payload_json.sections.seo_opportunity | Uplift estimate %, traffic projection, revenue projection |
| 6 | Competitive benchmark | payload_json.sections.competitive_benchmark | 3 competitors × 10 metrics matrix |
| 7 | Sector case study | payload_json.sections.sector_case_study | Embedded testimonial + outcome chart |
| 8 | Investment tiers | payload_json.sections.investment_tiers | Foundation £1,500 / Authority £3,500 / Dominator £7,500 |
| 9 | Calendar embed | payload_json.sections.calendar | iframe cal.com/tamazia/strategy-call |
| 10 | About this scan + disclaimer | payload_json.sections.disclaimer | Disclaimer.astro component from Phase 2 |

## Design tokens (5.2.1)
| Token | Value |
|---|---|
| Primary burgundy | `#3D0E0E` (matches Tamazia COS Slack app icon) |
| Accent gold | `#C8A664` |
| Body grey | `#1F2937` |
| Light surface | `#F8F5EF` |
| Font family heading | `"Editorial New", "Times New Roman", serif` |
| Font family body | `"Inter", system-ui, sans-serif` |
| Container max width | 1140px |
| Section vertical padding desktop | 96px |
| Section vertical padding mobile | 56px |

## Section transitions (5.2.3)
- IntersectionObserver on each section's title: fade-up animation (opacity 0 → 1, translateY 16 → 0, 0.5s ease-out, 1× per session)
- `prefers-reduced-motion: reduce` disables all transitions

## QR code per section (5.4.1)
- Generate at render time using `qrcode-svg` npm package
- 256×256 px inline SVG
- Encodes a deep link `https://tamazia.co.uk/audit/{slug}/{hash}#section-{id}` so sharing one section keeps context

## Sticky header (5.4.2)
- Visible from scroll > 240px (already in the Astro repo from S48 StickyTOC)
- Active section tracking via IntersectionObserver
- Anchors: cover, findings, table, inventory, sizing, competitors, case-study, tiers, calendar, disclaimer

## PDF export (5.6.1)
- Endpoint: `GET /audit/{slug}/{hash}.pdf?sig=...&l=...&x=...`
- Server-side Playwright invocation using `src/lib/pdf-renderer.ts` config
- Header carries Tamazia · Regulatory Signal Scan · Aman Pareek
- Footer carries the disclaimer with framework version (from payload_json.framework_version)
- File saved to Cloudflare R2 `tamazia-audit-pdfs/{slug}_{hash}_v{n}.pdf`
- pdf_url updated on audit_pages row

## Performance budget enforcement (5.10.1)
- LCP < 2500ms, INP < 200ms, CLS < 0.10, JS < 180kb, CSS < 80kb
- Existing patch-dist.js gate enforces JS/CSS bundle sizes per build
- Lighthouse CI run weekly, results POSTed to performance_budgets table by S028 (Phase 13 task)

## Verification once Aman merges
```bash
# Generate one test audit page via S025
node src/skills/S025-audit-page-builder/scripts/build.js --lead-id 3 --domain test-apex.co.uk --sector hospitality --country UK --company "Test Apex Hotels"
# Then hit the URL
curl -s "$(psql ... 'SELECT signed_url FROM audit_pages WHERE lead_id=3 ORDER BY id DESC LIMIT 1')" | grep -q "Regulatory Signal Scan"
```

## Aman action
1. `git checkout -b audit-microsite-v6` in tamazia-website
2. Drop the 10 Astro components per the table above
3. Implement `/api/track/audit-event` to call S019 via HTTP from the worker
4. Implement `/audit/{slug}/{hash}.pdf` route to call Playwright PDF export
5. Add design tokens to global.css
6. Add QR code generator
7. Push, wait for Cloudflare Pages deploy
8. Re-run `bash scripts/verify-phase.sh 5` — pages with X-OVERRIDE flip to VERIFIED on next nightly regression

## Why this is the right factoring
At 50-client scale, each client's audit page = (slug, hash) row in audit_pages with their own payload_json. The Astro page is a pure renderer; the data + framework version + disclaimer are all server-side authored. New sectors just add rules to compliance_rules. New frameworks bump framework_versions. The page never has to be re-coded.
