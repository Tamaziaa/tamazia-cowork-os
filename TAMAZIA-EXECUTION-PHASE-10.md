# PHASE 10 · SECTOR INTELLIGENCE + 500-TITLE MATRIX
**Owner: Claude. Effort: 8 working days. Spend: £0.**

Build the deep sector intelligence backbone: 20 sectors × 50 sources = 1000 sources curated and refreshed quarterly. 500 firm types catalogued, top 200 selected with reasoning. Continuous regulator + news monitoring. Site change detection per tracked lead.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 9
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 10
```

---

### Task 10.1.1: 500-title catalogue with scoring

Files: docs/500-title-catalogue.xlsx (Aman-editable), src/data/firm-types.json (machine-readable)
Owner: Claude
Prerequisite: Phase 9 complete
Estimated time: 4 hours

Verification:
```
test -f docs/500-title-catalogue.xlsx && \
jq -e 'length == 500' src/data/firm-types.json && \
jq -e '[.[] | select(.selected_top_200 == true)] | length == 200' src/data/firm-types.json
```

Expected output:
500 entries, 200 marked selected.

Description:
Comprehensive 500 firm types across 10 industry families (50 each). Each entry:
- name (e.g., "Magic Circle Law Firm")
- family (Hospitality, Healthcare, Legal, FS, Real Estate, Professional Services, E-commerce, Education, Wellness, Personal Brand)
- subtype tags
- scoring (marketing_spend_tolerance, decision_maker_accessibility, regulatory_complexity, online_presence_dependency, premium_pricing_tolerance, geographic_volume) each 0-5
- composite_score (sum of 6 factors, max 30)
- selected_top_200 boolean
- selection_reasoning
- target_seniority
- common_pain_points (3-5)
- typical_deal_value_range

Aman reviews Excel, edits selections, approves.

Failure mode: Catalogue too generic. Resolution: Bias toward firm types Tamazia has won before (CG Oncology lookalikes, hotel clients).

Status: [ ] TODO

---

### Task 10.1.2: 200-city × 5-jurisdiction matrix

Files: src/data/target-cities.json
Owner: Claude
Prerequisite: 10.1.1
Estimated time: 2 hours

Verification:
```
jq -e 'length == 200' src/data/target-cities.json && \
jq -e '[.[] | .jurisdiction] | unique | length == 5' src/data/target-cities.json
```

Expected output:
200 cities across 5 jurisdictions.

Description:
JSON structure per city:
```json
{
  "city": "London",
  "country_code": "GB",
  "jurisdiction": "UK",
  "population": 9000000,
  "business_density": "high",
  "language": "en-GB",
  "timezone": "Europe/London",
  "regulatory_regime": "UK GDPR + PECR + sector regulators",
  "key_sectors": ["legal", "fs", "hospitality"],
  "currency": "GBP"
}
```

Distribution:
- UK: 40 cities (London regions + major UK cities)
- EU: 60 cities (top business hubs)
- USA: 50 cities (major MSAs)
- Middle East: 25 cities (UAE focus + Saudi + Qatar)
- Asia: 25 cities (Singapore + Hong Kong + Japan + Korea + India deferred)

Status: [ ] TODO

---

### Task 10.1.3: Firm type × city sourcing cells

Files: migrations/2026-05-23-sourcing-cells.sql
Owner: Claude
Prerequisite: 10.1.1, 10.1.2
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sourcing_cells" | xargs -I {} test {} -ge 40000
```

Expected output:
200 firm types × 200 cities = 40,000 cells.

Description:
Table:
```sql
CREATE TABLE sourcing_cells (
  id SERIAL PRIMARY KEY,
  firm_type VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  jurisdiction VARCHAR(50) NOT NULL,
  last_queried_at TIMESTAMPTZ,
  results_count INTEGER NOT NULL DEFAULT 0,
  last_lead_added_at TIMESTAMPTZ,
  next_query_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  UNIQUE(firm_type, city)
);
```

Populate Cartesian product of 200 selected firm types × 200 cities = 40,000 rows. Phase 7 sourcing-orchestrator picks unvisited cells.

Failure mode: Some combinations make no sense (e.g., ski resort in Singapore). Resolution: Add valid_combinations filter, exclude obvious nonsense.

Status: [ ] TODO

---

### Task 10.2.1: 20-sector × 50-source intelligence base

Files: src/data/sector-sources.json, migrations/sector-sources-table.sql
Owner: Claude
Prerequisite: 10.1.3
Estimated time: 6 hours (the bulk of this phase)

Verification:
```
jq -e 'length == 1000' src/data/sector-sources.json && \
jq -e '[.[] | .sector] | unique | length == 20' src/data/sector-sources.json
```

Expected output:
1000 sources across 20 sectors.

Description:
20 sectors × 50 sources each = 1000 curated sources.

For each sector, 5 sources per category:
1. Regulators and official bodies
2. Trade bodies and associations
3. Academic journals
4. Industry reports (Statista, IBIS, Mintel)
5. Podcasts and conferences
6. Leading agency case studies
7. LinkedIn thought leaders
8. Newsletters
9. Forums and communities
10. Public client interviews

Each source entry:
```json
{
  "sector": "hospitality",
  "category": "regulators",
  "name": "UK Competition and Markets Authority",
  "url": "https://gov.uk/cma",
  "rss_feed": "...",
  "freshness_score": 8,
  "last_accessed": null
}
```

Stored in sector_sources table for quarterly refresh.

Failure mode: Sources change URLs over time. Resolution: Quarterly verification cron, mark dead links, replace.

Status: [ ] TODO

---

### Task 10.2.2: Sector pitch library v2

Files: migrations/2026-05-23-sector-pitches-v2.sql
Owner: Claude
Prerequisite: 10.2.1
Estimated time: 4 hours

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sector_pitches" | xargs -I {} test {} -eq 20 && \
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sector_pitches WHERE personal_brand_crosssell IS NOT NULL AND permission_variant IS NOT NULL AND value_variant IS NOT NULL AND curiosity_variant IS NOT NULL" | xargs -I {} test {} -eq 20
```

Expected output:
20 sectors with all variants populated.

Description:
Sector pitch library expanded from 10 to 20 sectors, with 9 fields per sector:
1. ICP definition (company size, role, jurisdiction profile)
2. Regulatory hook (named framework, recent enforcement, specific pain)
3. Pain stat (quantified, sourced)
4. Pricing tier reference
5. 3 subject line options (A/B tested)
6. Body template touch 0
7. Personal brand cross-sell block
8. Permission framing variant (full body)
9. Value-first variant (full body)

Plus tone notes per sector (legal=formal, hospitality=warm, etc.).

Status: [ ] TODO

---

### Task 10.3.1: Regulator watch skill (S036)

Files: ~/code/tamazia-cowork-skills/S036-regulator-watch/
Owner: Claude
Prerequisite: 10.2.1
Estimated time: 60 minutes

Verification:
```
# Run scan, verify regulator events table populated
bash $HOME/code/tamazia-cowork-skills/S036-regulator-watch/scripts/scan.sh
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM regulator_events WHERE detected_at > NOW() - INTERVAL '1 hour'" | xargs -I {} test {} -ge 0
```

Expected output:
Regulator events table populated.

Description:
Daily 06:00 cron monitors:
- ICO RSS (ico.org.uk/about-the-ico/news-and-events/feed)
- FCA news (fca.org.uk/news-and-publications/rss)
- SRA RSS (sra.org.uk)
- CQC enforcement (cqc.org.uk)
- MHRA RSS
- EU EDPB RSS (edpb.europa.eu)
- US FTC RSS
- UAE PDPL bulletin (manual scrape, no RSS)

For each new event:
1. Parse title + summary + URL + date
2. Tag by sector relevance (ICO = all sectors, FCA = financial, etc.)
3. Sentiment: enforcement (high impact) vs guidance (medium) vs consultation (low)
4. Insert into regulator_events table
5. If high-impact: trigger contextualised outreach hook (e.g., "ICO just fined Y for X, reach out to firms exposed to X")

Failure mode: RSS format changes. Resolution: Multi-parser fallback, alert on parse failure.

Status: [ ] TODO

---

### Task 10.3.2: Industry news ingester skill (S053)

Files: ~/code/tamazia-cowork-skills/S053-industry-news-ingester/
Owner: Claude
Prerequisite: 10.2.1
Estimated time: 60 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S053-industry-news-ingester/scripts/ingest.sh
psql "$NEON_URL" -tA -c "SELECT COUNT(DISTINCT sector) FROM industry_news WHERE published_at > NOW() - INTERVAL '24 hours'" | xargs -I {} test {} -ge 5
```

Expected output:
News ingested for at least 5 sectors.

Description:
Daily 06:00 cron pulls:
- NewsAPI free tier (100/day) for top stories per sector
- Google News RSS per sector keyword
- Sector publication RSS feeds (Skift for hospitality, Law360 for legal, etc.)

Filters relevance via keyword + classifier. Tags by sub-topic. Stores in industry_news table. Feeds into sector intelligence base.

Refreshes sector pitch library quarterly with current data (pain stats, recent events to reference).

Failure mode: NewsAPI quota hit by 9am. Resolution: Spread across sectors, cache aggressively.

Status: [ ] TODO

---

### Task 10.4.1: Company news monitor skill (S034)

Files: ~/code/tamazia-cowork-skills/S034-company-news-monitor/
Owner: Claude
Prerequisite: 10.3.2
Estimated time: 45 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S034-company-news-monitor/scripts/scan.sh
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM company_news WHERE detected_at > NOW() - INTERVAL '1 hour'"
```

Expected output:
Company news scans run.

Description:
Hourly cron monitors news for each tracked lead's company. Uses Google News API + Common Room signals.

Sentiment tags:
- Positive: funding, awards, expansion, new hire (key role)
- Neutral: leadership change, partnership announcement
- Negative: lawsuit, breach, layoffs, regulator action

For negative events: P0 alert to Aman, pause sequence (don't send tone-deaf outreach during their crisis).
For positive events: contextualise next touch (e.g., "Congratulations on the Series B, this is great timing for...").

Failure mode: False positives (e.g., another company with same name). Resolution: Match by domain not just name.

Status: [ ] TODO

---

### Task 10.5.1: Site change detector skill (S035)

Files: ~/code/tamazia-cowork-skills/S035-site-change-detector/
Owner: Claude
Prerequisite: Phase 5 (proposal-versioning S027)
Estimated time: 60 minutes

Verification:
```
# Trigger scan, verify site_changes table updated
bash $HOME/code/tamazia-cowork-skills/S035-site-change-detector/scripts/scan.sh
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM site_snapshots WHERE captured_at > NOW() - INTERVAL '24 hours'" | xargs -I {} test {} -ge 1
```

Expected output:
Site snapshots captured.

Description:
Weekly cron per tracked lead's domain:
1. Headless browser screenshot of homepage + key inner pages
2. DOM hash per page
3. Compare to last snapshot (snapshots table)
4. If hash differs >5% diff: mark site_changes table entry
5. Trigger S027 proposal-versioning to refresh audit if differences material

Failure mode: Site has dynamic content that changes every load. Resolution: Hash normalised DOM (strip timestamps, random IDs, ads).

Status: [ ] TODO

---

### Task 10.5.2: Brand mention monitor skill (S054)

Files: ~/code/tamazia-cowork-skills/S054-brand-mention-monitor/
Owner: Claude
Prerequisite: 10.4.1
Estimated time: 45 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S054-brand-mention-monitor/scripts/check.sh
test -f reports/brand-mentions-$(date +%Y-%m-%d).md
```

Expected output:
Daily report exists.

Description:
Hourly monitoring of "Tamazia", "Aman Pareek", "tamazia.co.uk" across:
- Google Alerts (free)
- Talkwalker Alerts (free)
- Mention free tier
- Reddit search
- Twitter/X search

Each mention: sentiment tag, source URL, reach estimate. Negative high-reach mentions: P0 Telegram alert. All mentions logged for monthly review.

Status: [ ] TODO

---

### Task 10.5.3: Review monitor skill (S055)

Files: ~/code/tamazia-cowork-skills/S055-review-monitor/
Owner: Claude
Prerequisite: 10.5.2
Estimated time: 45 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S055-review-monitor/scripts/check.sh
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM tamazia_reviews"
```

Expected output:
Tamazia reviews table accessible.

Description:
Daily check for new Tamazia reviews on:
- Trustpilot
- Google Business
- Clutch
- LinkedIn recommendations
- Manual: Slack channel for case study quotes from clients

New review:
- Sentiment + score logged
- If negative (≤3 stars): P0 alert, draft response template for Aman approval (response SLA per platform)
- If positive (≥4 stars): mark for case study consideration, request testimonial permission

Failure mode: No reviews yet (early stage). Resolution: Monitor still runs, returns 0, no false-positive alerts.

Status: [ ] TODO

---

### Task 10.6.1: Sector trend impact tagging

Files: src/lib/sector/trend-impact.ts
Owner: Claude
Prerequisite: 10.3.1, 10.3.2
Estimated time: 30 minutes

Verification:
```
node -e "
const t = require('./src/lib/sector/trend-impact.ts');
t.analyseImpact({sector: 'legal', recent_events: ['SRA enforcement against Firm X']}).then(r => {
  if (r.impact_level !== undefined) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Trend impact analysed.

Description:
Cross-references regulator events + industry news per sector. Identifies trends with high outreach utility (e.g., "ICO enforcement up 40% in healthcare in 2026 = good time to lead with compliance angle for clinics").

Used by sector pitch refresh and compose-body for current relevance.

Status: [ ] TODO

---

### Task 10.7.1: Phase 10 sign-off

Files: confirmations/phase-10-complete.txt
Owner: Both
Prerequisite: All 10.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 10
```

Status: [ ] TODO

---

## PHASE 10 EXIT GATE

```bash
bash scripts/verify-phase.sh 10
```

Returns exit 0 only when:
- 500-title catalogue published, top 200 selected with reasoning
- 200-city matrix populated across 5 jurisdictions
- 40,000 sourcing cells created
- 1000 sector sources curated (20 × 50)
- Sector pitch library v2 with all 9 fields × 20 sectors
- Regulator watch live monitoring 8+ regulators
- Industry news ingester running daily
- Company news monitor hourly per tracked lead
- Site change detector weekly per tracked lead
- Brand mention monitor + review monitor operational
- Sector trend impact tagging functional

Phase 11 locked until this passes.

End of Phase 10.
