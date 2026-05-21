# PHASE 5 · AUDIT MICRO-SITE LUXURY BUILD
**Owner: Claude. Effort: 10 working days. Spend: £0 (Cloudflare free tier).**

Build the hosted audit micro-site at `tamazia.co.uk/audit/{slug}/{hash}` with cinematic luxury feel that makes prospects say "this brand looks too big". 180-day persistence. No password. QR codes. Engagement tracking. PDF export. Calendly embedded. Sectioned for navigation.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 4
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 5
```

---

### Task 5.1.1: Astro dynamic route scaffold

Files: src/pages/audit/[slug]/[hash].astro
Owner: Claude
Prerequisite: Phase 4 complete
Estimated time: 60 minutes

Verification:
```
test -f src/pages/audit/[slug]/[hash].astro && \
curl -s -o /dev/null -w "%{http_code}" https://tamazia.co.uk/audit/test-firm/abc12345 | grep -q "200"
```

Expected output:
Test route returns 200.

Description:
Create Astro dynamic route with [slug] and [hash] params. getStaticPaths returns from proposals table or empty if no pre-built pages exist. On-demand rendering via Cloudflare Pages Functions for new audits. 8-char hash format validated. 180-day expiry checked via expires_at column. Returns 410 Gone with "Contact us to reactivate" page if expired.

Failure mode: Astro static routing requires all paths known. Resolution: Use Pages Functions for fully dynamic, or trigger build per new audit.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.1.2: 8-char hash generator

Files: src/lib/audit/hash.ts
Owner: Claude
Prerequisite: 5.1.1
Estimated time: 15 minutes

Verification:
```
# Generate 10000 hashes, verify all unique and 8 chars
node -e "
const h = require('./src/lib/audit/hash.ts');
const hashes = new Set();
for (let i = 0; i < 10000; i++) hashes.add(h.generate());
if (hashes.size === 10000 && [...hashes][0].length === 8) process.exit(0);
process.exit(1);
"
```

Expected output:
10000 unique 8-char hashes.

Description:
Base62 hash, 8 chars = 218 trillion combinations. Crypto.randomBytes for entropy. URL-safe (alphanumeric only).

Failure mode: Collision in production. Resolution: Check uniqueness in DB before insert, retry if collision.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.1.3: 180-day expiry mechanism

Files: src/pages/audit/[slug]/[hash].astro (expiry check), proposals.expires_at column
Owner: Claude
Prerequisite: 5.1.1, 5.1.2
Estimated time: 20 minutes

Verification:
```
# Create test proposal with expires_at = yesterday, verify 410
psql "$NEON_URL" -c "INSERT INTO proposals (slug, hash, expires_at, audit_data) VALUES ('expired-test', 'expir001', CURRENT_DATE - 1, '{}'::jsonb)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://tamazia.co.uk/audit/expired-test/expir001)
psql "$NEON_URL" -c "DELETE FROM proposals WHERE slug = 'expired-test'"
test "$STATUS" = "410"
```

Expected output:
Expired audit returns 410 Gone.

Description:
proposals table:
```sql
CREATE TABLE proposals (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) NOT NULL,
  hash CHAR(8) NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  audit_data JSONB NOT NULL,
  personalisation_pointers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '180 days'),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(slug, hash)
);
```

Page checks expires_at. If past, render 410 with "Contact us to reactivate" message + Aman's email.

Failure mode: User shares link with prospect after expiry. Resolution: Reactivation flow auto-generates new hash, original link still 410.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.2.1: Luxury design tokens

Files: src/styles/audit/tokens.css
Owner: Claude
Prerequisite: 5.1.1
Estimated time: 30 minutes

Verification:
```
grep -q "color-navy-deep: #0B1A2E" src/styles/audit/tokens.css && \
grep -q "color-gold-accent: #C9A961" src/styles/audit/tokens.css && \
grep -q "font-serif: 'Cormorant Garamond'" src/styles/audit/tokens.css && \
grep -q "font-sans: 'Inter'" src/styles/audit/tokens.css
```

Expected output:
Design tokens defined.

Description:
CSS custom properties:
```css
:root {
  --color-navy-deep: #0B1A2E;
  --color-gold-accent: #C9A961;
  --color-white: #FFFFFF;
  --color-warm-grey: #F5F1EA;
  --color-charcoal: #1F2937;
  
  --font-serif: 'Cormorant Garamond', serif;
  --font-sans: 'Inter', -apple-system, sans-serif;
  
  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 32px;
  --space-lg: 64px;
  --space-xl: 128px;
  
  --transition-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --transition-fast: 200ms;
  --transition-medium: 400ms;
  --transition-slow: 800ms;
  
  --shadow-luxury: 0 24px 80px rgba(11, 26, 46, 0.12);
  --shadow-hover: 0 32px 100px rgba(11, 26, 46, 0.18);
}
```

Inspirations: Hermès Finance, EQT Capital, Bridgewater Associates private client.

Failure mode: Fonts don't load. Resolution: Self-host Cormorant + Inter from Google Fonts, preload.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.2.2: Hero section with cinematic motion

Files: src/components/audit/Hero.astro
Owner: Claude
Prerequisite: 5.2.1
Estimated time: 90 minutes

Verification:
```
test -f src/components/audit/Hero.astro && \
grep -q "animated-grain" src/components/audit/Hero.astro
```

Expected output:
Hero component exists with animation references.

Description:
Full-viewport hero. Background: subtle animated film grain (SVG noise filter at 0.04 opacity, animated via CSS keyframes). Slow zoom (1.0 → 1.05 over 20s) on background image (warm-toned, photography not stock).

Foreground: client name in Cormorant Garamond 96px on desktop, 48px mobile. Below: "Regulatory Signal Scan, prepared {date}, by Aman Pareek, International Business Lawyer." Below: validity countdown ("Valid until {date+180}").

Scroll cue: gold animated chevron pulsing.

Performance budget: must render LCP <1.5s. Background image is 100KB AVIF, preloaded.

Failure mode: Grain animation janky on low-end. Resolution: prefers-reduced-motion media query disables motion.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.2.3: Section transitions on scroll

Files: src/scripts/audit/scroll-reveal.js
Owner: Claude
Prerequisite: 5.2.2
Estimated time: 45 minutes

Verification:
```
test -f src/scripts/audit/scroll-reveal.js && \
grep -q "IntersectionObserver" src/scripts/audit/scroll-reveal.js
```

Expected output:
Scroll reveal script uses IntersectionObserver.

Description:
On scroll into viewport, section fades up (opacity 0→1, translateY 40px→0) over 800ms cubic-bezier. Staggered: header 0ms, content 100ms, CTA 200ms.

IntersectionObserver with rootMargin -10% (trigger early). Once triggered, stays revealed (no re-hide on scroll up).

Performance: passive event listeners, no jank.

Failure mode: All sections reveal at once on page load. Resolution: Check IntersectionObserver threshold = 0.1 not 0.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.2.4: Mobile responsive verified

Files: All audit components
Owner: Claude
Prerequisite: 5.2.2, 5.2.3
Estimated time: 60 minutes

Verification:
```
# Playwright test on mobile viewport
npx playwright test tests/audit-mobile.spec.ts
```

Expected output:
Mobile tests pass.

Description:
Test viewport 375×667 (iPhone SE) and 414×896 (iPhone Pro Max):
- All text legible (min 16px body)
- All CTAs tappable (min 44px target)
- Hero scales gracefully
- Tables convert to cards (horizontal scroll for current-vs-after)
- Animations respect prefers-reduced-motion
- Touch interactions feel native (no 300ms tap delay)

Failure mode: Specific component breaks at narrow viewport. Resolution: Fix per-component CSS Grid/Flex.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.1: Section 1 - Cover

Files: src/components/audit/sections/Cover.astro
Owner: Claude
Prerequisite: 5.2.2
Estimated time: 30 minutes

Verification:
```
test -f src/components/audit/sections/Cover.astro && \
grep -q "{firm}" src/components/audit/sections/Cover.astro
```

Expected output:
Component exists with firm placeholder.

Description:
Client logo (if available in research dossier, else firm wordmark in Cormorant), prepared by date, validity countdown, Tamazia logo bottom right.

Failure mode: Client logo low resolution. Resolution: Use wordmark fallback.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.2: Section 2 - Three Findings (above-fold hook)

Files: src/components/audit/sections/ThreeFindings.astro
Owner: Claude
Prerequisite: 5.3.1
Estimated time: 60 minutes

Verification:
```
test -f src/components/audit/sections/ThreeFindings.astro
```

Expected output:
Component exists.

Description:
"{Firm}, three specific findings from this scan."
Three cards. Each card:
- Number (01, 02, 03 in Cormorant)
- Finding headline (10-15 words, specific)
- Finding detail (30-50 words)
- £-value impact estimate
- "See section: [link]" anchor to relevant section below

Cards staggered reveal on scroll. Background subtle gradient navy → warm-grey.

Failure mode: Three findings repetitive. Resolution: Compose with diversity prompt (e.g., one compliance, one SEO, one conversion).

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.3: Section 3 - Current vs After Tamazia table

Files: src/components/audit/sections/CurrentVsAfter.astro
Owner: Claude
Prerequisite: 5.3.2
Estimated time: 90 minutes

Verification:
```
test -f src/components/audit/sections/CurrentVsAfter.astro && \
grep -q "Mobile PageSpeed" src/components/audit/sections/CurrentVsAfter.astro
```

Expected output:
Component exists with metrics referenced.

Description:
Two-column table. Left: "Current state of {firm}". Right: "After Tamazia (12 months)". 10 rows:
1. Mobile PageSpeed: {current} → {projected}
2. Pages indexed by Google: {current} → {projected}
3. Branded search visibility: {current}% → {projected}%
4. Compliance flags surfaced: {current} P1 → 0 P1
5. Featured snippets owned: {current} → {projected}
6. Local pack appearances: {current}% → {projected}%
7. Avg session duration: {current} → {projected}
8. Conversion rate (calc): {current}% → {projected}%
9. Monthly organic traffic: {current} → {projected}
10. Estimated monthly value: £{current} → £{projected}

Animated reveal per row (100ms stagger). Gold arrows between columns. Mobile: rows stack vertically with "Now" and "After" labels.

This is the critical visual that converts. Must hit hard.

Failure mode: Numbers feel padded/unrealistic. Resolution: Calibrate projections against actual client outcomes (CG Oncology benchmarks), use 12-month conservative estimate.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.4: Section 4 - Compliance signal inventory

Files: src/components/audit/sections/ComplianceInventory.astro
Owner: Claude
Prerequisite: 5.3.3
Estimated time: 60 minutes

Verification:
```
test -f src/components/audit/sections/ComplianceInventory.astro
```

Expected output:
Component exists.

Description:
Header: "{N} regulatory signals identified for review."
Below: grid of signal cards. Each card:
- Severity dot (red P0, amber P1, blue P2)
- Signal headline (e.g., "Cookie banner does not allow equal-prominence rejection")
- Regulation cited (e.g., "ICO Guidance on PECR Regulation 6, December 2023 update")
- Recent enforcement example (e.g., "British Airways £20M fine, similar pattern")
- Tamazia fix in 1 line ("Configure consent solution to give Reject equal prominence to Accept")

Filter pills above: All | P0 | P1 | P2 | By Regulator (FCA / SRA / ICO / etc.)

Footer: full disclaimer + "Generated using framework version {v} reviewed by Aman Pareek, International Business Lawyer, {date}".

Failure mode: Too many signals overwhelms. Resolution: Show top 10 by severity, "See all {N}" expand.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.5: Section 5 - SEO opportunity sizing

Files: src/components/audit/sections/SEOOpportunity.astro
Owner: Claude
Prerequisite: 5.3.4
Estimated time: 60 minutes

Verification:
```
test -f src/components/audit/sections/SEOOpportunity.astro
```

Expected output:
Component exists.

Description:
Header: "Three keyword gaps representing £{total}/month in untapped opportunity."

Three opportunity cards, each with calculation:
- Keyword (e.g., "{city} hotel near {landmark}")
- Search volume per month
- Estimated CTR for top-3 position (25%)
- Estimated conversion rate at your tier
- Average deal value
- Math shown: 1200 × 0.25 × 0.04 × £180 = £2,160/month untapped

Below: bar chart visualising your domain vs top 3 competitors on these keywords.

Failure mode: Calculation feels manipulative. Resolution: Show conservative + aggressive estimates as range.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.6: Section 6 - Competitive benchmark

Files: src/components/audit/sections/CompetitiveBenchmark.astro
Owner: Claude
Prerequisite: 5.3.5
Estimated time: 90 minutes

Verification:
```
test -f src/components/audit/sections/CompetitiveBenchmark.astro
```

Expected output:
Component exists.

Description:
"{Firm} benchmarked against 3 closest peers."

Three competitor cards horizontal. Each:
- Competitor name + domain
- 10 metric comparisons (radar chart)
- "Where you beat them" (1 line)
- "Where they beat you" (1 line)
- Specific tactic they use you don't (1 sentence)

Below: side-by-side data table for the geek view.

Failure mode: Competitor name choice controversial. Resolution: Aman approves competitor list per audit before deploy.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.7: Section 7 - Sector case study

Files: src/components/audit/sections/CaseStudy.astro
Owner: Claude
Prerequisite: 5.3.6
Estimated time: 60 minutes

Verification:
```
test -f src/components/audit/sections/CaseStudy.astro
```

Expected output:
Component exists.

Description:
"Tamazia in action: {sector relevant case}."
Single case study, sector-matched. For healthcare → CG Oncology. For hotels → hotel client when available. For law → law firm client when available.

Structure: Client background (50 words), challenge (50 words), Tamazia approach (60 words), results in 3 numbers, timeline (90 days), client quote with permission.

Image: client logo + result chart.

Failure mode: Case study sector mismatch (e.g., hotel audit shows oncology case study). Resolution: Per-sector case study mapping, fallback to closest if exact not available.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.8: Section 8 - Investment tiers

Files: src/components/audit/sections/Investment.astro
Owner: Claude
Prerequisite: 5.3.7
Estimated time: 90 minutes

Verification:
```
test -f src/components/audit/sections/Investment.astro
```

Expected output:
Component exists.

Description:
"Investment in {Firm}'s next 12 months."

Three pricing tiers visible (Tamazia's actual structure):
- Foundation: £4,500 setup + £3,000/month retainer
- Growth: £4,500 setup + £4,500/month for 3 months, then £3,000 retainer
- Bespoke: from £15,000 per engagement

Toggle: Monthly | Project basis | Annual prepay (-10%)

Each tier card lists 8-12 included items. CTA per tier: "Discuss [tier]" → opens Calendly section.

FAQ accordion below: 6 common questions answered.

Failure mode: Pricing visibility kills high-touch sales. Resolution: Pricing is differentiator from agencies that hide it. Aman's call.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.9: Section 9 - Calendly embedded

Files: src/components/audit/sections/Schedule.astro
Owner: Claude
Prerequisite: 0.1.5
Estimated time: 30 minutes

Verification:
```
test -f src/components/audit/sections/Schedule.astro && \
grep -q "cal.com" src/components/audit/sections/Schedule.astro
```

Expected output:
Component embeds Cal.com.

Description:
"Next 30 minutes."
Cal.com inline widget on left (60% width desktop, full mobile). Right column: QR code linking to same Cal.com booking page (for prospects on desktop who want to book from phone).

Prefill: lead.first_name, lead.firm, lead.sector, audit_hash as UTM.

Below: Aman's brief credibility line: "30 minutes. Specific. No pitch deck."

Failure mode: Cal.com widget slow to load. Resolution: Async load, show skeleton, fallback button "Book a Call" → direct URL.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.3.10: Section 10 - About this scan + disclaimer

Files: src/components/audit/sections/AboutScan.astro
Owner: Claude
Prerequisite: 2.5.4
Estimated time: 30 minutes

Verification:
```
test -f src/components/audit/sections/AboutScan.astro && \
grep -q "not legal advice" src/components/audit/sections/AboutScan.astro
```

Expected output:
Component has disclaimer.

Description:
Collapsible "About this scan" panel + permanent footer disclaimer. Pulls from framework_versions for current version + review date. Includes Tamazia full corporate footer (registered office, company number, ICO, EU rep if EU recipient, T&Cs and Privacy links).

Failure mode: Disclaimer reads as legal cover-our-ass and undermines confidence. Resolution: Frame as transparency ("We tell you exactly what this scan is and isn't.")

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.4.1: QR codes per section

Files: src/lib/audit/qr-generator.ts
Owner: Claude
Prerequisite: 5.3.10
Estimated time: 30 minutes

Verification:
```
node -e "
const qr = require('./src/lib/audit/qr-generator.ts');
const png = qr.generate('https://tamazia.co.uk/audit/test/abc12345#findings');
if (png.length > 1000) process.exit(0);
process.exit(1);
"
```

Expected output:
QR PNG generated.

Description:
qrcode npm package, server-side generation. Each section has anchor (#findings, #comparison, #compliance, #seo, #competitive, #case, #investment, #book, #about). QR for each is a link to that anchor.

PDF export shows QR per section. Master QR (homepage) at PDF bottom.

Failure mode: QR too small to scan. Resolution: 200×200px minimum in PDF.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.4.2: Sticky header navigation

Files: src/components/audit/StickyHeader.astro
Owner: Claude
Prerequisite: 5.3.10
Estimated time: 45 minutes

Verification:
```
test -f src/components/audit/StickyHeader.astro
```

Expected output:
Component exists.

Description:
Top of page: thin gold-accented bar. Tabs: Findings | Comparison | Compliance | SEO | Investment | Book Call. Each scrolls smoothly to anchor.

On scroll past hero, sticks to top.

Mobile: collapses to hamburger.

Click any tab: logs nav_event to engagement tracker.

Failure mode: Tabs overflow on tablet. Resolution: Horizontal scroll on overflow.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.5.1: Engagement tracker skill (S019)

Files: ~/code/tamazia-cowork-skills/S019-engagement-tracker/, src/pages/api/track.ts
Owner: Claude
Prerequisite: 5.3.10
Estimated time: 60 minutes

Verification:
```
# Send tracking event, verify logged
curl -s -X POST https://tamazia.co.uk/api/track \
  -d '{"hash":"abc12345","event":"page_view","section":null}' \
  -H "Content-Type: application/json"
sleep 1
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM audit_events WHERE hash='abc12345' AND event='page_view' AND created_at > NOW() - INTERVAL '1 minute'" | grep -q "^1$"
```

Expected output:
Event logged within seconds.

Description:
Cloudflare Pages Function endpoint /api/track. Receives event POST, validates hash exists in proposals, inserts into audit_events.

Client-side script (lazy-loaded after first scroll):
- Page view (on load)
- Section dwell (Intersection Observer, log seconds per section)
- Scroll depth (max % reached)
- CTA clicks
- PDF download
- Return visits (cookie-based)
- Calendly opened
- Calendly booked (webhook)

All events: timestamp, hash, lead_id, event_type, metadata JSON.

Failure mode: User has tracking blocker. Resolution: Track from server side where possible (page render = view), client-side only enhances.

Status: [ ] TODO

---

### Task 5.5.2: High-intent trigger to Slack

Files: n8n W7 update, S019 integration
Owner: Claude
Prerequisite: 5.5.1
Estimated time: 30 minutes

Verification:
```
# Simulate 3-minute pricing dwell event, verify Slack notification
curl -s -X POST https://tamazia.co.uk/api/track \
  -d '{"hash":"abc12345","event":"section_dwell","section":"investment","duration_sec":180}'
sleep 2
test -f confirmations/high-intent-alert-tested.txt
```

Expected output:
Slack notification fires on high-intent signal.

Description:
S019 evaluates each event for high-intent signals:
- Pricing section dwell >2 min
- Multiple returns (3+ visits)
- PDF download
- Calendly opened without booking

On trigger: Slack notification to #tamazia-pipeline with lead context + suggested action ("Reach out within 30 min", "Send personal note", etc.).

Failure mode: False positives (bot/crawler dwell). Resolution: Bot detection (no scroll, perfect timing, suspicious User-Agent) excludes.

Status: [ ] TODO

---

### Task 5.6.1: PDF export via Playwright

Files: src/pages/api/audit/[hash]/pdf.ts, src/lib/pdf-renderer.ts
Owner: Claude
Prerequisite: 2.5.5, 5.3.10, 5.4.1
Estimated time: 90 minutes

Verification:
```
# Generate PDF, verify exists and >50KB
curl -s -o /tmp/test-audit.pdf https://tamazia.co.uk/api/audit/abc12345/pdf
test $(wc -c < /tmp/test-audit.pdf) -gt 50000
```

Expected output:
PDF generated and downloaded.

Description:
Cloudflare Pages Function spawns Playwright (or remote Playwright service if Pages constraints). Loads audit page with print-specific CSS. Generates PDF. Returns to client.

Print CSS: removes animations, optimises layout for paper, adds page numbers, QR codes per section visible, master QR at bottom.

PDF stored in Cloudflare R2 with 180-day TTL.

Failure mode: Playwright not available in Pages Functions. Resolution: Use n8n on Pikapod (where Playwright is installed) as PDF service, Pages Function proxies.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.7.1: Audit page builder skill (S025)

Files: ~/code/tamazia-cowork-skills/S025-audit-page-builder/
Owner: Claude
Prerequisite: All 5.x.x tasks
Estimated time: 60 minutes

Verification:
```
# Trigger build for a test lead, verify deployed page
node $HOME/code/tamazia-cowork-skills/S025-audit-page-builder/test/build.js | \
  jq -e '.url and .deployed' > /dev/null
```

Expected output:
Build script returns deployed URL.

Description:
Skill S025 orchestrates:
1. Reads lead.research_dossier + lead.personalisation_pointers + audit JSON
2. Builds proposal JSON structure for the page
3. Inserts into proposals table
4. Commits to GitHub repo (triggers Astro rebuild)
5. Waits for Cloudflare deploy completion (~45 sec)
6. Returns final URL

Idempotent: re-running for same lead updates existing audit, increments version.

Failure mode: Deploy fails mid-flight. Resolution: GitHub Actions logs surfaced, retry once, escalate if persists.

Status: [ ] TODO

---

### Task 5.8.1: Re-engagement triggers

Files: n8n W7b workflow
Owner: Claude
Prerequisite: 5.5.1
Estimated time: 45 minutes

Verification:
```
# Verify all 4 triggers configured
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/W7b" | \
  jq -e '.nodes | length >= 4'
```

Expected output:
W7b workflow has 4+ trigger nodes.

Description:
W7b daily cron checks every audit delivered in last 90 days:
- No open after 5 days → send "did the link work?" check-in
- Open without book after 7 days → "anything I can clarify?" follow-up
- Pricing dwell >2 min → immediate Slack alert + suggested personal note
- Multiple returns 3+ → mark HIGH_INTENT, daily digest priority

Each follow-up respects hard stop (no follow-up if lead.replied = TRUE).

Failure mode: Spam if all 4 fire for same lead. Resolution: One re-engagement per lead per week max.

Status: [ ] TODO

---

### Task 5.9.1: Proposal versioning skill (S027)

Files: ~/code/tamazia-cowork-skills/S027-proposal-versioning/
Owner: Claude
Prerequisite: 5.7.1, 5.3.10
Estimated time: 30 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S027-proposal-versioning/SKILL.md
```

Expected output:
Skill exists.

Description:
S027 triggered when S035 (site-change-detector, Phase 10) detects a tracked lead's site changed materially.

Action:
1. Re-run audit for the domain
2. Compare to previous audit (delta analysis)
3. Generate new audit hash + URL
4. Email lead: "Updated scan available for {Firm} reflecting recent changes to {domain}."
5. Original hash remains accessible (versioning), shows "Updated version available" banner

Failure mode: Cosmetic changes trigger unnecessary regenerations. Resolution: Change threshold (5%+ DOM diff) before regenerate.

Status: [ ] TODO

---

### Task 5.10.1: Performance budget enforcement

Files: tests/audit-performance.spec.ts, .github/workflows/visual-regression.yml
Owner: Claude
Prerequisite: 5.2.4
Estimated time: 30 minutes

Verification:
```
npx playwright test tests/audit-performance.spec.ts
```

Expected output:
LCP <1.5s, CLS <0.05 on test audit page.

Description:
Playwright performance test runs on each commit. Audit page measured:
- LCP (Largest Contentful Paint) < 1.5s mobile
- CLS (Cumulative Layout Shift) < 0.05
- TTI (Time to Interactive) < 3s mobile
- Total page weight < 500KB

Hard fail in CI if any breaches. Must outperform prospect's own site.

Failure mode: Hero image weight blocks LCP. Resolution: AVIF format, blur placeholder, eager preload.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 5.11.1: Phase 5 sign-off

Files: confirmations/phase-5-complete.txt
Owner: Both
Prerequisite: All 5.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 5
```

Status: [ ] TODO

---

## PHASE 5 EXIT GATE

```bash
bash scripts/verify-phase.sh 5
```

Returns exit 0 only when:
- Astro dynamic route /audit/{slug}/{hash} live, 200 on test
- 8-char hash unguessable (218T combos)
- 180-day expiry returns 410 Gone with reactivate flow
- Luxury design tokens defined (navy + gold + Cormorant + Inter)
- Hero with cinematic motion (animated grain, slow zoom)
- Section transitions on scroll (fade-up staggered)
- Mobile responsive verified at 375px and 414px
- All 10 sections built (Cover through About)
- QR codes generated per section + master
- Sticky header navigation
- Engagement tracker logging 8 event types
- High-intent triggers to Slack on pricing dwell + returns
- PDF export via Playwright with QR codes
- Audit page builder skill orchestrates end-to-end
- Re-engagement triggers (4 types)
- Proposal versioning on site change
- Performance budget enforced in CI (LCP <1.5s)

Phase 6 locked until this passes.

End of Phase 5.
