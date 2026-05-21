# PR · Phase 6.5 audit micro-site v7 (solicitor-grade audit renderer)

**Target repo:** github.com/Tamaziaa/tamazia-website
**Branch:** `audit-microsite-v7-engine`
**Authored:** 2026-05-19 in COWORK-OS-EXECUTION
**Supersedes:** PR-phase-5-audit-microsite.md (v6)

## What this PR ships

Phase 6.5 turns the audit page from a 10-section static layout into a data-driven, solicitor-grade
audit renderer. The Astro page now reads a richer JSON payload (10 buckets, 27 sectors, 47 frameworks,
~26 pointers per scan) directly from `audit_pages.payload_json` in Neon and renders it with:

1. A scored dashboard (overall score + 10 bucket scores)
2. P0/P1/P2 findings grouped by bucket, each with: framework citation, evidence URL, "How Tamazia fixes this" deep-link, investment tier, and timeline
3. A 12-week intervention timeline assembled from the per-pointer `tamazia.timeline_sprint` field
4. A side-by-side "Before vs After Tamazia" matrix derived from the bucket scores
5. CTA flow that books a call with the relevant tier pre-selected

## Engine output contract (NEW)

The `audit_pages.payload_json` shape after Phase 6.5 has two new top-level keys: `pointers[]` (richer) and `scan_meta`.

```json
{
  "scan_meta": {
    "scan_id": 17,
    "domain": "weightmans.com",
    "sector": "law-firms",
    "country": "UK",
    "framework_version": "1.0.0",
    "frameworks_routed": ["UK_GDPR_A13", "UK_PECR", "UK_ICO_COOKIES", "UK_SRA_COC"],
    "buckets_active": 8,
    "rules_evaluated": 38,
    "specificity_score": 0.86,
    "pointer_count": 16,
    "pointer_count_p0": 3,
    "pointer_count_p1": 4,
    "pointer_count_p2": 9,
    "generated_at": "2026-05-19T13:42:00Z",
    "total_latency_ms": 5549,
    "buckets": {
      "compliance":    { "n": 4, "mean_score": 0.93 },
      "seo":           { "n": 1, "mean_score": 0.83 },
      "technical_seo": { "n": 1, "mean_score": 0.90 },
      "content_depth": { "n": 3, "mean_score": 0.82 },
      "security":      { "n": 3, "mean_score": 0.76 },
      "accessibility": { "n": 1, "mean_score": 0.83 },
      "ad_intel":      { "n": 2, "mean_score": 0.83 },
      "public_records":{ "n": 1, "mean_score": 0.95 }
    }
  },
  "pointers": [
    {
      "bucket": "compliance",
      "severity": "P0",
      "fact": "UK_GDPR_A13 A13.1.f miss on https://weightmans.com/privacy: International transfer disclosure not detected.",
      "recommendation": "Add an international-transfer section to the privacy notice naming SCCs and the recipient country.",
      "evidence_url": "https://weightmans.com/privacy",
      "citation": "UK_GDPR_A13 A13.1.f",
      "quality": 0.95,
      "tamazia": {
        "fix_anchor":      "https://tamazia.co.uk/services/regulatory-compliance#gdpr",
        "bucket_anchor":   "https://tamazia.co.uk/audit#how-we-fix-compliance",
        "tier":            "Authority",
        "tier_anchor":     "https://tamazia.co.uk/investment#authority",
        "tier_price_gbp":  3500,
        "timeline_weeks":  "Week 1-2",
        "timeline_sprint": "Compliance Pass",
        "cta_book_call":   "https://tamazia.co.uk/contact#book"
      }
    }
  ]
}
```

The complete TypeScript interface is included as `src/types/AuditPayload.ts` later in this PR.

## Sections to ship (10 → still 10, but data-driven)

| # | Section | Source | Component |
|---|---|---|---|
| 1 | Cover (firm name, scan timestamp, sector, jurisdiction, score, framework version) | `scan_meta` | `AuditCover.astro` |
| 2 | **NEW** Overall score + 10 bucket scores radar | `scan_meta.buckets` | `BucketRadar.astro` |
| 3 | Top 3 P0 findings (above-fold hook) | `pointers.filter(p=>p.severity==='P0').slice(0,3)` | `TopFindings.astro` |
| 4 | Findings by bucket, drill-down | `pointers` grouped by `bucket` | `FindingsList.astro` |
| 5 | Current vs After Tamazia matrix (10 rows = 10 buckets) | computed from `scan_meta.buckets` | `CurrentVsAfter.astro` |
| 6 | Compliance signal inventory (rules evaluated, hits, misses by framework) | `pointers.filter(p=>p.bucket==='compliance')` + `scan_meta.frameworks_routed` | `ComplianceInventory.astro` |
| 7 | SEO opportunity sizing (computed from SEO + technical_seo + content_depth) | derived | `SEOOpportunity.astro` |
| 8 | 12-week intervention timeline (assembled from `pointer.tamazia.timeline_*`) | derived | `InterventionTimeline.astro` |
| 9 | Investment tier recommendation (counts P0 findings → suggests Foundation/Authority/Dominator) | derived | `InvestmentTiers.astro` |
| 10 | About this scan + Phase 2 disclaimer | `scan_meta.framework_version` + `payload_json.rules` | `Disclaimer.astro` (existing) |

## How the renderer reads from Neon

Existing `functions/api/audit.js` already returns `audit_pages.payload_json` by `(slug, hash)`. No changes needed there for v7.

Update `src/pages/audit/[slug]/[hash].astro` to:

```typescript
---
// Cloudflare Pages route
import { getAuditPage } from '../../../../functions/lib/audit-page-loader';
import AuditCover from '../../../components/AuditCover.astro';
import BucketRadar from '../../../components/BucketRadar.astro';
import TopFindings from '../../../components/TopFindings.astro';
import FindingsList from '../../../components/FindingsList.astro';
import CurrentVsAfter from '../../../components/CurrentVsAfter.astro';
import ComplianceInventory from '../../../components/ComplianceInventory.astro';
import SEOOpportunity from '../../../components/SEOOpportunity.astro';
import InterventionTimeline from '../../../components/InterventionTimeline.astro';
import InvestmentTiers from '../../../components/InvestmentTiers.astro';
import Disclaimer from '../../../components/Disclaimer.astro';
import StickyTOC from '../../../components/StickyTOC.astro';
import type { AuditPayload } from '../../../types/AuditPayload';

const { slug, hash } = Astro.params;
const page = await getAuditPage(slug as string, hash as string);
if (!page || page.expires_at < new Date().toISOString()) return Astro.redirect('/expired');

const payload: AuditPayload = page.payload_json;
const meta = payload.scan_meta;
const pointers = payload.pointers || [];
const byBucket = Object.fromEntries(['compliance','seo','technical_seo','content_depth','security','accessibility','tls_dns','website','public_records','ad_intel'].map(b => [b, pointers.filter(p => p.bucket === b)]));

// Fire an "open" event to S019
---
<html lang="en">
<head>
  <title>{page.company} · Regulatory Signal Scan</title>
  <meta name="robots" content="noindex"><!-- audit pages are not indexed -->
  <!-- Phase 5 design tokens already in global.css -->
  <link rel="preconnect" href="https://fonts.gstatic.com">
</head>
<body class="audit-page">
  <StickyTOC sections={[
    { id: 'cover', label: 'Cover' },
    { id: 'scores', label: 'Scores' },
    { id: 'top-findings', label: 'Top 3 issues' },
    { id: 'findings', label: 'All findings' },
    { id: 'before-after', label: 'Before vs after' },
    { id: 'compliance', label: 'Compliance inventory' },
    { id: 'seo', label: 'SEO opportunity' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'investment', label: 'Investment' },
    { id: 'disclaimer', label: 'About' }
  ]} />
  <AuditCover meta={meta} />
  <BucketRadar buckets={meta.buckets} score={meta.specificity_score} />
  <TopFindings pointers={pointers.filter(p => p.severity === 'P0').slice(0, 3)} />
  <FindingsList groups={byBucket} />
  <CurrentVsAfter buckets={meta.buckets} />
  <ComplianceInventory pointers={byBucket.compliance} frameworksRouted={meta.frameworks_routed} />
  <SEOOpportunity pointers={[...byBucket.seo, ...byBucket.technical_seo, ...byBucket.content_depth]} />
  <InterventionTimeline pointers={pointers} />
  <InvestmentTiers pointers={pointers} />
  <Disclaimer frameworkVersion={meta.framework_version} />
  <script src="/audit-tracking.js" defer></script>
</body>
</html>
```

## Critical visual upgrades (this is the "audit-makes-them-book" part)

### `BucketRadar.astro` — the chart that closes the deal

A radar chart with 10 axes (one per bucket). Each axis has two plotted points:
- The prospect's **current** score (a red dot at, say, 0.65)
- The Tamazia **post-engagement target** (a gold dot at 0.92)

Render with `chart.js` Radar config. No animation on first paint (we don't want to wait), 600ms ease on user interaction. Mobile-first; below 768px collapse to a list of bars.

### `TopFindings.astro` — 3 card layout

Each card:
- Burgundy header strip with severity pill (P0 = burgundy bg + gold text)
- Bucket + framework citation
- One-sentence fact (truncated to 140 chars max)
- "Evidence" link → opens `evidence_url` in new tab
- Right-aligned "How Tamazia fixes this →" link to `pointer.tamazia.fix_anchor`
- Below the fold: timeline pill "Week 1-2 · Compliance Pass" + tier pill "Authority · £3,500"

### `CurrentVsAfter.astro` — the killer table

```
Bucket                | Current score | After 90 days with Tamazia | Δ
Compliance            |  0.42         | 0.95                       | +0.53
SEO                   |  0.60         | 0.92                       | +0.32
Technical SEO         |  0.55         | 0.94                       | +0.39
Content depth         |  0.50         | 0.90                       | +0.40
Security              |  0.30         | 0.96                       | +0.66
Accessibility         |  0.70         | 0.94                       | +0.24
TLS / DNS             |  0.85         | 1.00                       | +0.15
Website architecture  |  0.65         | 0.92                       | +0.27
Public records        |  0.90         | 0.98                       | +0.08
Ad intel              |  0.75         | 0.95                       | +0.20
```

The "after" column is deterministic: cap = min(1.0, current + 0.45) for buckets with < 0.5 starting score; current + 0.25 otherwise. Tamazia delivers this in 12 weeks per the timeline section.

### `InterventionTimeline.astro` — the closer

Vertical 12-week Gantt. Rows = sprints (Compliance Pass, Core SEO, Architecture, Tracking & Attribution, etc.). Each row marks the weeks it occupies. Tooltip on hover shows the pointers in that sprint with their P0/P1/P2 pills.

The sprint→weeks mapping is already in `tamazia-link-router.js` and ships in `pointer.tamazia.timeline_sprint`.

### `InvestmentTiers.astro` — the recommendation that converts

Logic:
- P0 count ≥ 5 → recommend Dominator (£7,500)
- P0 count 2-4 → recommend Authority (£3,500)
- P0 count 0-1 → recommend Foundation (£1,500)

Render the recommended tier with a 2× larger card and a gold border. The other two render as smaller plain cards. Each card has a "Book a discovery call (this tier)" button → `pointer.tamazia.cta_book_call` with `?tier=authority` query string so cal.com loads the right product.

## Design system additions

Add to `src/styles/global.css`:

```css
:root {
  --tamazia-burgundy: #3D0E0E;
  --tamazia-gold: #C8A664;
  --tamazia-body: #1F2937;
  --tamazia-surface: #F8F5EF;
  --severity-p0-bg: #3D0E0E; --severity-p0-text: #C8A664;
  --severity-p1-bg: #C8A664; --severity-p1-text: #3D0E0E;
  --severity-p2-bg: #1F2937; --severity-p2-text: #F8F5EF;
  --score-good: #2E7D32;  /* green ≥ 0.85 */
  --score-warn: #C8A664;  /* gold 0.65-0.85 */
  --score-bad:  #B91C1C;  /* red < 0.65 */
}
```

## Tracking events to wire (S019 from Phase 5 already handles these)

Send to `/api/track/audit-event` (existing endpoint, calls S019 `ingest()`):

| Event | When | Severity |
|---|---|---|
| `open` | page mount | normal |
| `scroll_depth` (25/50/75/100) | IntersectionObserver | normal |
| `section_dwell` | leaving section after ≥ 3s | normal |
| `top_finding_click` | clicking a TopFindings card | **high-intent** |
| `tamazia_fix_click` | clicking "How Tamazia fixes this →" | **high-intent** |
| `tier_click_dominator` | clicking Dominator tier | **high-intent** |
| `tier_click_authority` | clicking Authority tier | **high-intent** |
| `cal_iframe_open` | embedding cal.com iframe | **high-intent** (existing) |
| `pdf_download` | clicking the PDF button | **high-intent** (existing) |

High-intent events trigger the Slack alert to `#all-tamazia` via S019 (already deployed).

## TypeScript types (drop into `src/types/AuditPayload.ts`)

```typescript
export type Severity = 'P0' | 'P1' | 'P2';
export type Bucket = 'compliance' | 'seo' | 'technical_seo' | 'content_depth'
                   | 'security' | 'accessibility' | 'tls_dns'
                   | 'website' | 'public_records' | 'ad_intel';

export interface TamaziaLinkBlock {
  fix_anchor: string;
  bucket_anchor: string;
  tier: 'Foundation' | 'Authority' | 'Dominator';
  tier_anchor: string;
  tier_price_gbp: number;
  timeline_weeks: string;
  timeline_sprint: string;
  cta_book_call: string;
}

export interface Pointer {
  bucket: Bucket;
  severity: Severity;
  fact: string;
  recommendation: string;
  evidence_url: string;
  citation?: string;
  quality?: number;
  tamazia?: TamaziaLinkBlock;
}

export interface BucketSummary { n: number; mean_score: number; }

export interface ScanMeta {
  scan_id: number;
  domain: string;
  sector: string;
  country: string;
  framework_version: string;
  frameworks_routed: string[];
  buckets_active: number;
  rules_evaluated: number;
  specificity_score: number;
  pointer_count: number;
  pointer_count_p0: number;
  pointer_count_p1: number;
  pointer_count_p2: number;
  generated_at: string;
  total_latency_ms: number;
  buckets: Record<Bucket, BucketSummary>;
}

export interface AuditPayload {
  scan_meta: ScanMeta;
  pointers: Pointer[];
  rules?: any[];                  // Phase 2 backwards compat (rules baked into payload)
  framework_version?: string;     // Phase 2 backwards compat
  disclaimer?: string;            // Phase 2 backwards compat
}
```

## Verification once Aman merges

```bash
# 1. Pick the most recent live audit_pages row
LATEST_AUDIT_HASH=$(psql $NEON_URL -tA -c "SELECT hash FROM audit_pages ORDER BY id DESC LIMIT 1")
LATEST_AUDIT_SLUG=$(psql $NEON_URL -tA -c "SELECT slug FROM audit_pages ORDER BY id DESC LIMIT 1")

# 2. Verify the page renders v7 markup
curl -s "https://tamazia.co.uk/audit/$LATEST_AUDIT_SLUG/$LATEST_AUDIT_HASH" | grep -q "BucketRadar" && echo "v7 rendered"

# 3. Verify event ingestion works against S019
curl -s -X POST "https://tamazia.co.uk/api/track/audit-event" -d "{\"hash\":\"$LATEST_AUDIT_HASH\",\"event_type\":\"open\"}" | grep -q "ok"

# 4. Check Cloudflare Pages build log for any TS errors
```

## Aman action

This PR doc is the binding contract. The git side will be opened against the
github.com/Tamaziaa/tamazia-website repo on branch `audit-microsite-v7-engine`.
After merge, Cloudflare Pages will auto-deploy and every audit page generated by
S008 will render in the new format.
