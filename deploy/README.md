# Phase 6.5 deploy bundle · tamazia-website Astro repo

## What's in this directory

```
deploy/astro/
├── pages/audit/[slug]/[hash].astro     # the page route
├── components/
│   ├── AuditCover.astro                # 100vh hero + score ring
│   ├── BucketRadar.astro               # 10-axis radar chart (current vs after)
│   ├── TopFindings.astro               # 3-P0 above-fold cards
│   ├── FindingsList.astro              # drill-down by bucket
│   ├── CurrentVsAfter.astro            # the killer side-by-side table
│   ├── ComplianceInventory.astro       # framework-by-framework breakdown
│   ├── SEOOpportunity.astro            # uplift sizing
│   ├── InterventionTimeline.astro      # 12-week Gantt
│   ├── InvestmentTiers.astro           # the recommendation that converts
│   ├── Disclaimer.astro                # Phase 2 disclaimer (re-implemented)
│   └── StickyTOC.astro                 # sticky table of contents
├── types/AuditPayload.ts               # canonical type for audit_pages.payload_json
├── styles/audit.css                    # design tokens + reduced-motion
└── audit-tracking.js                   # client telemetry → S019
```

## Where each file lands in the tamazia-website repo

| Source path (this bundle) | Target path (tamazia-website) |
|---|---|
| `pages/audit/[slug]/[hash].astro` | `src/pages/audit/[slug]/[hash].astro` |
| `components/*.astro` | `src/components/*.astro` |
| `types/AuditPayload.ts` | `src/types/AuditPayload.ts` |
| `styles/audit.css` | `public/styles/audit.css` |
| `audit-tracking.js` | `public/audit-tracking.js` |

## Backend contract

The page calls `GET /api/audit?slug=...&hash=...` which already exists in `functions/api/audit.js` from Phase 5. It should return the row from Neon's `audit_pages` table, including the `payload_json` field. The new payload shape is documented in `src/types/AuditPayload.ts` and produced by S008 (engine output now includes `scan_meta` and richer `pointers[]` with the `tamazia.{}` link block per finding).

If `functions/api/audit.js` currently returns only the legacy shape, point 1 of the deploy is to update it to return the full `payload_json` plus `expires_at`, `company`, `share_card_url`. No new SQL needed — the columns are already there.

## Telemetry endpoint

`/api/track/audit-event` is already wired to S019 (Phase 5). No change needed.

## Verification

After deploy, hit any live audit page:
```bash
curl -s "https://tamazia.co.uk/audit/monzo-bank/p0PcIg4T?l=14&x=1794769887&sig=f6f58fd20a74b5d3e4f5ed9390d3f677" \
  | grep -E "BucketRadar|TopFindings|InterventionTimeline"
```
You should see all three component class names in the rendered HTML.

## GitHub push gate

Claude cannot push to `github.com/Tamaziaa/tamazia-website` without GitHub MCP authenticated.

To unblock:
1. In the Claude desktop app, type `/mcp` and follow the prompt to authenticate the GitHub MCP server with your Tamaziaa GitHub account.
2. Tell Claude to "push the deploy bundle to tamazia-website on a new branch and open a PR."
3. Claude will create branch `audit-microsite-v7-engine`, commit the bundle, and open the PR.
4. Cloudflare Pages auto-deploys on merge.

Alternatively, if you prefer to drag-drop:
1. Clone the repo locally.
2. Copy each file from this bundle into its target path above.
3. Run `git commit -am "phase 6.5 audit micro-site v7"` and `git push`.
4. Cloudflare Pages picks it up.

## What this unlocks

Every cold email Tamazia sends now includes a live `https://tamazia.co.uk/audit/{slug}/{hash}?...` URL that renders this micro-site. On click:
- 10-dimension radar chart shows their site's audit score vs the projected after-Tamazia state
- Three P0 findings hook the reader above the fold with framework citation (e.g. `UK_GDPR_A13 A13.2.d`) and a deep-link to the relevant Tamazia service page
- A 12-week intervention timeline shows exactly what the engagement covers
- Investment-tier recommendation (Foundation £1,500 / Authority £3,500 / Dominator £7,500) pre-selects based on P0 count, with a call-booking link

Engagement telemetry feeds back to Neon so Tamazia gets a Slack ping when a high-intent prospect opens the cal.com tier card.
