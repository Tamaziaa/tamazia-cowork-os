# Phases 7 → 10 · Master plan
**Authored 20 May 2026 · Original spec (May 17) + current priorities overlay**

---

## 1. Source of truth

This plan merges:
- The original phase specs in `TAMAZIA-EXECUTION-PHASE-{7,8,9,10}.md` (authored 17 May 2026 by Aman with Claude)
- The Phase 7.0–7.4 audit-Worker iterations already shipped (live on `audit.tamazia.co.uk`)
- Aman's current priority stack (LexQuity $1M pre-seed → LexQuity demo → King's accelerator → Tamazia international UK/EU/USA/ME repositioning)

Where the May-17 spec and current priorities conflict, current priorities win. Where they're complementary, both ship.

## 2. What's already done (rolls into Phase 7 closure)

- **Audit engine** (`src/skills/S008-personalisation-engine/`) with 10-scanner orchestration, sector-aware rules, 232 active rules across 96 frameworks
- **Cloudflare Worker `audit-worker.js`** v13 serving 7 live audits on `audit.tamazia.co.uk` (UK law / US healthcare / FR ecommerce / UK ecommerce / UK insurance / UK hospitality / UK healthcare)
- **Phase 6.0–7.4 deliverables**: real Tamazia pricing scraped + 4 finalised cold-email touches + 14-category reply classifier + alias delivery + Pass/Needs work/Fail bands + same-error dedupe + real `tamazia.co.uk` URLs only
- **Original Phase 7 = NOT YET DONE** — 50-API lead sourcing engine. That's the bulk of Phase 7 work that still needs to ship

## 3. Operating contract for Phases 7-10

| Rule | Policy |
|---|---|
| Quality gate | A phase is closed when (a) every task in this plan ships, (b) the post-execution 50-gap audit closes, (c) live verification passes |
| Gap audit cadence | 50 gaps surfaced at phase start (scope-shaping list), 50 gaps surfaced at phase end (delta from execution). Both lists fixed before phase closes |
| Blocker policy | When I hit a blocker requiring Aman (API key, subscription, DNS), I (a) try the best free/zero-friction workaround, (b) if no workaround, queue + continue with everything else, (c) consolidate blocker queue at phase end |
| Spend ceiling | £0 default. Anything £3–5 requires explicit Aman approval. NeverBounce £15-20/mo is pre-approved per original Phase 7 spec |
| Output ownership | Everything ships to `/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/` workspace. Worker deploys land in Cloudflare. Database changes land in Neon |
| Compliance posture | Every scraper respects platform ToS + robots.txt. No password-grade actions on Aman's behalf |

---

## PHASE 7 (FINAL) · Lead Sourcing Engine + Audit Worker close-out

**Status:** Audit Worker arc DONE (Phases 7.0–7.4 shipped). Lead sourcing arc PENDING.
**Effort:** 6 working days (original spec was 10, but audit Worker already absorbed 3 days of orchestration scaffolding). **Spend:** £15-20/mo NeverBounce (pre-approved). **Owner:** Claude builds, Aman provides API keys.

### 7.A · Sourcing API integrations (10 sources)

| Source | Effort | Aman action | Workaround if blocked |
|---|---|---|---|
| Companies House UK | 30 min | Free key at developer.company-information.service.gov.uk | No alternative for UK reg data; queue if blocked |
| OpenCorporates | 30 min | Free key, 500 req/mo | Use SEC EDGAR for US, Companies House for UK, skip emerging |
| SEC EDGAR US | 30 min | No key needed | N/A |
| Hunter.io | 20 min | Free, 25 searches + 50 verifications/mo | Fall back to Snov for email finder; combined quota |
| Snov.io | 20 min | Free, 50 credits/mo | Pair with Hunter to spread load |
| Apollo.io | 30 min | Free, 50 credits/mo | Already in Cowork plugin (apollo:enrich-lead) |
| Common Room | already connected | None | N/A — plugin live |
| Google Places | 30 min | Free, $200/mo Google Cloud credit | Use OSM Overpass as free fallback |
| Yelp Fusion | 20 min | Free key, 5000 req/day | Skip if not approved; Google Places covers most |
| OSM Overpass | 30 min | No key | N/A — public OSM |

### 7.B · Orchestration + verification

- **S028 Sourcing orchestrator skill**: rotates 10 sources by sector + jurisdiction × time of day, deduplicates by domain + name, writes to `leads` table with `source` audit trail
- **W12 Daily sourcing cron**: 100 verified leads/day across 10 sectors × 5 jurisdictions
- **S029 Find-every-email skill**: cascades Hunter → Snov → Apollo → guess-and-verify, NeverBounce as final SMTP confirm
- **S030 3-stage verification**: pattern match → SMTP probe → NeverBounce
- **S031 LinkedIn profile finder**: Google site-search `linkedin.com/in/` + sector keywords + name + company → ranked candidates
- **S032 Instagram handle finder**: same pattern for IG, lower priority

### 7.C · Surfacing + reporting

- **Unified tracking schema** in Neon (`leads`, `lead_sources`, `verification_log`)
- **Cowork artifact**: lead pipeline dashboard (live KPIs)
- **Slack daily digest at 07:30** (new leads, verified count, sector mix, jurisdiction mix)

### 7.D · Audit Worker close-out (Phase 7.0–7.4 roll-up)

- All 7 live audit URLs already verified
- Document the Worker arc as "Phase 7 conversion artefact" — the proof that delivered leads convert through the audit funnel
- Add scheduled refresh task: re-scan all live leads weekly so the audit pages stay current

### 7.E · LexQuity overlay

- Surface arbitration practitioners (ICC / LCIA / SIAC / DIAC) as a **separate `lead_audience` tag** inside the sourcing engine
- These leads route to a different cadence (relationship-first, not cold-pitch) — flagged for Aman's personal action

### Phase 7 gap-audit checkpoints

- **Pre-execution 50 gaps**: API quota exhaustion plans · cross-source dedupe · GDPR-compliant sourcing of contact data · jurisdiction handling for UAE/Middle East leads · sector taxonomy mapping · LinkedIn finder false positives · Instagram handle ambiguity · email-pattern misses on generic domains · NeverBounce false negatives on disposable domains · Cowork artifact data refresh latency · Slack digest deliverability · Schema drift between sourcing and audit · etc.
- **Post-execution 50 gaps**: surfaced after the build runs end-to-end on real data

---

## PHASE 8 · Ad Intelligence Scrapers + International Market Intel

**Effort:** 5 working days. **Spend:** £0. **Owner:** Claude.

### 8.A · Ad library scrapers (original spec)

| Platform | Approach | Workaround if blocked |
|---|---|---|
| Meta Ad Library | Free public API + page scraper | Use playwright headless if API quota hit |
| Google Ads Transparency Center | adstransparency.google.com scrape | No API — accept slower scrape cadence |
| LinkedIn Ad Library | linkedin.com/ad-library scrape | Throttled scrape; use Common Room if it surfaces ads |
| TikTok Creative Center | library.tiktok.com scrape | Headless browser fallback |
| X / Twitter Ads Transparency | ads.x.com/transparency scrape | Manual export accepted if scrape blocked |
| Snapchat, Pinterest, Reddit | Public ad library scrape | Snapchat is most restrictive — skip if blocked |
| SimilarAds + AdLibrary aggregators | Direct scrape | These already aggregate, useful redundancy |

### 8.B · Storage + aggregation

- **Schema**: `ad_observations` table with (platform, advertiser_domain, advertiser_id, ad_text, landing_url, country, observed_at, fingerprint_hash)
- **W14 Daily aggregation cron**: dedupes by `fingerprint_hash`, attaches to `leads.ad_intel` JSONB column
- **Cross-platform priority boosting**: a lead running ads on ≥3 platforms gets a `+15` priority score (signals active commercial intent)

### 8.C · Pointer integration

- Feed ad-intel into the existing audit Worker pointer pipeline so the audit page surfaces "your competitors are running ads on X / Y / Z" as a conversion driver
- Use existing `ad_intel` bucket on the 10-bucket audit scoreboard — currently empty for most leads

### 8.D · International overlay (current priority)

- For each Tamazia international target market (UK / EU / USA / Middle East), build a **regional ad-intel digest** — surface what competing law firms / clinics / hotels / restaurants are running in each market so Tamazia outreach can reference real competitor ads
- LexQuity competitor intel: the arbitration legaltech market is small (Kira / RAVN / Disco / Kleros). Build a passive monitor that pings Slack when one of them changes website or posts on LinkedIn

### Phase 8 gap-audit checkpoints

- **Pre 50**: scraper rate-limit handling · ToS compliance per platform · ad-text deduplication across regional variants · landing-URL canonicalisation · advertiser-ID consistency across platforms · GDPR for EU advertisers · headless-browser fingerprinting risk · cron-runner cold-start latency · ad_observations schema migration · pointer-pipeline integration · etc.
- **Post 50**: surfaced after the build runs

---

## PHASE 9 · Multi-Channel Outreach + LexQuity Investor Pipeline

**Effort:** 8 working days. **Spend:** £0–79/mo (only if LinkedIn Sales Navigator trial is approved by Aman). **Owner:** Claude.

### 9.A · LinkedIn drafter v2 hardening (original)

- **S006 upgrade**: pull recent posts from the contact's LinkedIn → personalise the opener with a reference to their most recent post or article
- **Mutual connection leverage**: when a Tamazia client / LexQuity co-founder / accelerator alum is in the prospect's network, surface that as warm-intro language
- **Recent post engagement comment**: separate skill drafts thoughtful comments on prospect posts so the relationship pre-warms before a DM
- **Voice note script generator**: 30-second script for LinkedIn voice notes (legal-deliverable risk pre-checked)

### 9.B · Instagram DM (original)

- **S-ig-dm**: DM drafter targeting hospitality, real estate, healthcare verticals where IG is the buyer channel
- **S058 Multi-stakeholder thread**: when a deal has multiple decision-makers (GC + CMO + CEO), build a coordinated outreach thread across all three with consistent narrative

### 9.C · Slack + Cal.com flow (original)

- Each new lead drops into Slack with 3-channel drafts ready (email + LinkedIn + IG)
- **Cal.com webhook**: when a prospect books, pull their info → trigger pre-call brief
- **W16 Pre-call brief**: 1-page brief with company news, recent ads, audit findings, mutual connections, suggested opener
- **Post-call outcome capture**: Slack form → updates `lead_status` field
- **Google Calendar sync**: native calendar gets the booking with brief attached

### 9.D · Sales Navigator trial decision

- Original Phase 9 included a £79/mo Sales Nav trial decision. Recommendation: **defer until Phase 9 outreach has shipped 50+ touches without Sales Nav**, then revisit
- Workaround: Common Room + LinkedIn standard search + Tamazia's existing engagement-based filtering handle 80% of what Sales Nav offers

### 9.E · LexQuity investor outreach overlay (current priority)

- Build a **separate `lexquity_investor_pipeline` track** inside the same outreach engine
- Targets: pre-seed legaltech VCs (e.g. Earlybird, MMC Ventures, Episode 1, Seedcamp) + sovereign wealth fund allocators with legaltech mandates + UHNW family offices with arbitration-adjacent portfolios
- Cadence: relationship-first, not cold-pitch. Drafts are warm intros where possible, founder-to-founder language, no Tamazia case studies
- Output: separate Slack channel + separate Cal.com event type ("LexQuity investor briefing · 30 min")

### 9.F · Accelerator overlay

- King's accelerator decision is pending. Phase 9 lays the **pipeline scaffold** so the day the decision comes through, outreach to the cohort + mentors can launch within 24 hours
- Pre-build: cohort directory (when published), mentor contact map, accelerator-relevant pitch variants

### Phase 9 gap-audit checkpoints

- **Pre 50**: LinkedIn ToS limits on automation · Instagram DM rate limits · multi-stakeholder thread coordination · Cal.com webhook reliability · Slack notification noise · pre-call brief latency · post-call data capture friction · Google Calendar sync conflicts · investor outreach NDA boundaries · arbitration practitioner relationship sensitivity · etc.
- **Post 50**: surfaced after the build runs

---

## PHASE 10 · Sector Intelligence + 500-Title Matrix + International Tamazia

**Effort:** 8 working days. **Spend:** £0. **Owner:** Claude.

### 10.A · 500-title catalogue with scoring (original)

- Categories: legal practice areas, healthcare specialties, hospitality types, real-estate verticals, financial-services product lines, education levels, restaurant types, etc.
- Each title scored on (a) commercial intent · (b) regulatory complexity · (c) Tamazia delivery fit · (d) competitive density
- Drives the sourcing engine's keyword pipeline + the audit Worker's framework selection

### 10.B · 200-city × 5-jurisdiction matrix (original)

- 200 cities × 5 jurisdictions (UK / EU / USA / UAE / Singapore) → 1,000 cells
- Each cell: top-3 sectors, top-3 regulators, market-size signal, sector-pitch variant
- Drives the sourcing engine's geographic rotation

### 10.C · Firm-type × city sourcing cells (original)

- Cross-tabulate firm types (e.g. "boutique law firm 5-15 partners") × city (e.g. London / Manchester / Edinburgh / Dubai / NYC)
- Each cell predicts daily lead volume + cadence

### 10.D · 20-sector × 50-source intelligence base (original)

- For each of 20 sectors, build a 50-source intelligence brief covering regulators, trade press, industry analysts, conferences, networking groups
- Surfaces in every audit + outreach + pre-call brief

### 10.E · Sector pitch library v2 (original)

- Per-sector pitch variants for cold email + LinkedIn + IG + audit landing
- Already partially built in Phase 6 (4 finalised cold-email touches per sector × jurisdiction). Extend to all 20 sectors

### 10.F · Monitoring skills (original)

| Skill | Purpose |
|---|---|
| S036 Regulator watch | Pings Slack when a regulator (ICO / FCA / CMA / SRA / MHRA / etc.) publishes a sweep, enforcement, or new guidance |
| S053 Industry news ingester | Daily digest of sector trade press |
| S034 Company news monitor | Per-lead news monitor — pings Slack when a target company is in the news |
| S035 Site change detector | Watches target sites for content changes (signals re-pitch opportunity) |
| S054 Brand mention monitor | Tamazia + LexQuity + Aman + Manuel mentions across web + social |
| S055 Review monitor | Tamazia client reviews + sentiment |

### 10.G · Sector trend impact tagging (original)

- Cross-reference 10.F outputs with the lead pipeline so every lead carries a "current sector heat" signal
- A finance lead during an FCA enforcement week is hotter than the same lead in a quiet week

### 10.H · International Tamazia repositioning (current priority)

- For UK / EU / USA / Middle East, build a **regional positioning brief** covering:
  - Top 5 competitor agencies per region
  - Top 10 regulator focus areas per region
  - Top 20 sector-jurisdiction pairs ranked by Tamazia delivery fit
  - Regional pricing benchmarks (verified, not assumed)
  - Local case-study patterns that resonate (Dubai Holding for ME, Nasdaq for USA, EU GDPR enforcement examples for EU, SRA Transparency Rules for UK)
- This feeds into the website, the audit Worker copy, the cold-email templates, the LinkedIn drafter, and Aman's spoken positioning

### 10.I · LexQuity market overlay (current priority)

- Map the international arbitration legaltech market:
  - Top 10 institutions (ICC, LCIA, SIAC, DIAC, HKIAC, VIAC, SCC, SCAI, KCAB, JCAA)
  - Top 50 arbitrators by appointment volume
  - Top 100 firms (Big Law + boutique arbitration practices)
  - Existing tools in the space (Disco / Relativity / Kira / RAVN / Jus Mundi)
  - Pricing benchmarks, distribution patterns, regulatory considerations per jurisdiction
- This drives LexQuity GTM after the demo ships + the pre-seed deck

### Phase 10 gap-audit checkpoints

- **Pre 50**: title-catalogue overlap with existing skills · city × jurisdiction matrix sparsity · regulator-watch false positives · news-ingester signal-to-noise · site-change-detector noise on dynamic sites · sector-trend tagging lag · international competitive intel freshness · LexQuity market mapping confidentiality · arbitration relationship sensitivity · etc.
- **Post 50**: surfaced after the build runs

---

## 4. Cross-phase dependencies + sequencing

```
[Phase 7 sourcing] feeds [Phase 8 ad-intel] feeds [Phase 9 outreach] feeds [Phase 10 sector-intel]
       ↑                       ↑                          ↑                       ↓
       └─── audit Worker (DONE) ──── pre-call briefs ─── trend tagging ──────────┘
```

- Phase 7 must ship sourcing before Phase 8 has lead-domains to enrich with ad-intel
- Phase 8 ad-intel feeds Phase 9 pre-call briefs (the brief includes competitor ads)
- Phase 10 sector-intel runs in parallel from Phase 7 onwards (independent track) but informs Phase 9 outreach copy

## 5. Blockers I expect, with workarounds

| Blocker | Likely cause | Workaround |
|---|---|---|
| Companies House API key | Aman registration required | Queue + continue with SEC EDGAR + OSM Overpass |
| Hunter / Snov / Apollo keys | Aman registration required | Use email-pattern guess + SMTP probe via NeverBounce alone |
| Google Places / Yelp keys | Aman registration required | OSM Overpass is sufficient for 80% of geo data |
| Meta Ad Library token | Public access has rate limits | Headless browser fallback with rotating proxies (compliant scrape cadence) |
| LinkedIn rate limits | Hard cap | Common Room + manual rotation across 5 Tamazia LinkedIn profiles (already in place) |
| Cal.com webhook config | Aman dashboard action | Built skill works on cron-pull as backup |
| NeverBounce £15-20/mo | Pre-approved per original Phase 7 spec | None needed |
| LinkedIn Sales Navigator £79/mo | Aman decision (Phase 9.D) | Defer; original spec already plans deferral |

## 6. What I deliver per phase

1. **Pre-phase artefact** — 50-gap audit list before any building starts
2. **Phase build** — all tasks in this plan, with verification commands per task
3. **Live verification** — every deliverable tested against real data
4. **Post-phase artefact** — 50-gap audit list after build completes, with all 50 fixed before phase closes
5. **Phase close-out doc** — `docs/PHASE-N-CLOSEOUT.md` listing what shipped, what's blocked on Aman, what's queued
6. **Blocker queue** — consolidated list of Aman actions needed, with exact steps per blocker

## 7. Estimated calendar

| Phase | Build effort | Gap-fix effort | Total | Spend |
|---|---|---|---|---|
| 7 (lead sourcing only — audit Worker already done) | 6 days | 2 days | **8 days** | £15-20/mo NeverBounce |
| 8 (ad intel) | 5 days | 2 days | **7 days** | £0 |
| 9 (outreach) | 8 days | 3 days | **11 days** | £0 (£79/mo SN deferred) |
| 10 (sector intel) | 8 days | 3 days | **11 days** | £0 |
| **Total** | **27 build days** | **10 gap-fix days** | **37 working days** | **~£60-80** |

Calendar feasibility: 37 working days at 1 phase-day per actual day = ~8 calendar weeks if execution is uninterrupted.

## 8. What I need from Aman before "go"

If the answer below is "yes" I proceed without further interruption:

- API key registration as I hit each blocker (I'll surface them one by one inside each phase, with exact registration URLs + 30-second instructions)
- NeverBounce £15-20/mo subscription confirmation (pre-approved per original spec)
- A final yes/no on LinkedIn Sales Navigator trial when I reach Phase 9.D (deferred recommendation)
- Periodic reviews when I surface a blocker queue at phase close (acknowledgement to keep moving)

## 9. Exit criteria — what "Phase 10 done" looks like

- Lead sourcing engine producing 100 verified leads/day across 10 sectors × 5 jurisdictions
- Audit Worker live for every lead within 6 hours of sourcing
- Ad-intel feeding pre-call briefs for every prospect with active campaigns
- Multi-channel outreach (email + LinkedIn + IG) running with 3-channel drafts per lead
- Cal.com bookings flowing into Slack with pre-call briefs attached
- Sector intelligence monitoring 20 sectors × 50 sources × 5 jurisdictions
- 500-title catalogue + 200-city × 5-jurisdiction matrix populated
- LexQuity investor pipeline live with separate cadence
- International Tamazia repositioning brief shipped for UK / EU / USA / ME
- Every Phase 6.0–7.4 audit-Worker deliverable preserved + re-verified
- 200 post-execution gaps surfaced across the four phases and all 200 fixed

When all that ships and verifies live, Phase 10 is closed and the engine is operating end-to-end.
