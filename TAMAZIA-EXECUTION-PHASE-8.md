# PHASE 8 · AD INTELLIGENCE SCRAPERS
**Owner: Claude. Effort: 5 working days. Spend: £0.**

Build the killer-edge for B2B sourcing: companies actively running paid ads = companies with marketing budget = qualified buyers. Scrape 10 ad libraries daily, cross-reference, feed into personalisation as the most specific pointers Tamazia can offer.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 7
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 8
```

---

### Task 8.1.1: Meta Ad Library scraper

Files: src/lib/ad-intel/meta.ts
Owner: Claude
Prerequisite: Phase 7 complete
Estimated time: 60 minutes

Verification:
```
node -e "
const m = require('./src/lib/ad-intel/meta.ts');
m.search({country: 'GB', q: 'hotel'}).then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
Meta Ad Library returns UK hotel advertisers.

Description:
Meta Ad Library has a public Graph API endpoint (graph.facebook.com/v18.0/ads_archive). No auth needed for political ads, requires auth for commercial ads but graphAPI alternative path or public search URL works.

Wrapper:
- search(country, q) → list of advertisers
- getCreatives(page_id) → ad creative + copy + dates active
- getTargeting(ad_id) → audience info where visible

Stores results in ad_intelligence table.

Failure mode: Meta changes API structure. Resolution: Browser-based scrape fallback with Playwright.

Status: [ ] TODO

---

### Task 8.1.2: Google Ads Transparency Center

Files: src/lib/ad-intel/google-ads-transparency.ts
Owner: Claude
Prerequisite: 8.1.1
Estimated time: 45 minutes

Verification:
```
node -e "
const g = require('./src/lib/ad-intel/google-ads-transparency.ts');
g.searchAdvertisers({country: 'GB', industry: 'hospitality'}).then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
UK hospitality advertisers found.

Description:
Google Ads Transparency Center (adstransparency.google.com) is fully public. No API. Scrape via Playwright. Search by country + industry vertical. Returns advertiser names + ad formats served + dates.

Failure mode: Cloudflare bot protection. Resolution: Playwright with realistic User-Agent + cookies + delays.

Status: [ ] TODO

---

### Task 8.1.3: LinkedIn Ad Library

Files: src/lib/ad-intel/linkedin.ts
Owner: Claude
Prerequisite: 8.1.2
Estimated time: 45 minutes

Verification:
```
node -e "
const l = require('./src/lib/ad-intel/linkedin.ts');
l.search({company_size: '51-200', industry: 'legal'}).then(r => process.exit(r.length >= 0 ? 0 : 1));
"
```

Expected output:
Search returns array.

Description:
LinkedIn Ad Library is public per company. Scrape company-specific URLs via Playwright. Format: linkedin.com/company/{company}/posts/?feedView=ads.

For each tracked lead's company: check if running ads. Returns ad creative + dates active.

Failure mode: LinkedIn rate-limits. Resolution: Distribute requests across day, max 50 companies/day.

Status: [ ] TODO

---

### Task 8.1.4: TikTok Creative Center

Files: src/lib/ad-intel/tiktok.ts
Owner: Claude
Prerequisite: 8.1.3
Estimated time: 30 minutes

Verification:
```
node -e "
const t = require('./src/lib/ad-intel/tiktok.ts');
t.topAdsByIndustry('beauty').then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
TikTok beauty advertisers returned.

Description:
TikTok Creative Center (ads.tiktok.com/creative_radar_creative_center) public, no auth. Scrape top performing ads by industry.

Status: [ ] TODO

---

### Task 8.1.5: X/Twitter Ads Transparency

Files: src/lib/ad-intel/x-ads.ts
Owner: Claude
Prerequisite: 8.1.4
Estimated time: 30 minutes

Verification:
```
node -e "
const x = require('./src/lib/ad-intel/x-ads.ts');
x.search({country: 'GB'}).then(r => process.exit(r.length >= 0 ? 0 : 1));
"
```

Expected output:
Search returns.

Description:
X/Twitter Ads Transparency (ads.twitter.com/transparency) public. Scrape advertisers by country.

Status: [ ] TODO

---

### Task 8.1.6: Snapchat, Pinterest, Reddit ad libraries

Files: src/lib/ad-intel/snapchat.ts, pinterest.ts, reddit.ts
Owner: Claude
Prerequisite: 8.1.5
Estimated time: 60 minutes

Verification:
```
test -f src/lib/ad-intel/snapchat.ts && \
test -f src/lib/ad-intel/pinterest.ts && \
test -f src/lib/ad-intel/reddit.ts
```

Expected output:
All 3 wrappers exist.

Description:
Similar pattern for 3 smaller ad libraries. Less critical (less B2B usage) but valuable for personal-brand, e-com, wellness sectors.

Status: [ ] TODO

---

### Task 8.1.7: SimilarAds.com and AdLibrary.io aggregators

Files: src/lib/ad-intel/aggregators.ts
Owner: Claude
Prerequisite: 8.1.6
Estimated time: 30 minutes

Verification:
```
node -e "
const a = require('./src/lib/ad-intel/aggregators.ts');
a.searchAcrossPlatforms({domain: 'nike.com'}).then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
Aggregated results across platforms.

Description:
Optional fallback when individual platform scrapers fail. Pulls from third-party aggregators.

Status: [ ] TODO

---

### Task 8.2.1: Ad intelligence storage schema

Files: migrations/2026-05-22-ad-intel.sql
Owner: Claude
Prerequisite: 8.1.7
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'ad_intelligence'" | grep -q "^1$"
```

Expected output:
Table exists.

Description:
```sql
CREATE TABLE ad_intelligence (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  platform VARCHAR(30) NOT NULL,
  advertiser_name VARCHAR(255),
  advertiser_id VARCHAR(255),
  ad_creative_text TEXT,
  ad_creative_url VARCHAR(500),
  ad_format VARCHAR(50),
  date_started DATE,
  date_ended DATE,
  countries TEXT[],
  estimated_spend_range VARCHAR(50),
  raw_data JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_intel_lead ON ad_intelligence(lead_id);
CREATE INDEX idx_ad_intel_platform ON ad_intelligence(platform);
```

Status: [ ] TODO

---

### Task 8.2.2: Daily aggregation cron (W14)

Files: n8n W14 ad-intel-aggregator
Owner: Claude
Prerequisite: 8.2.1
Estimated time: 45 minutes

Verification:
```
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/W14" | jq -e '.active'
```

Expected output:
Workflow active.

Description:
W14 daily 04:00 cron:
1. Read today's sourcing sectors
2. For each sector, query all 10 ad platforms
3. Extract company names + ad data
4. Cross-reference: companies appearing on multiple platforms get priority boost
5. Update lead.ad_intel_score (0-10 based on platforms × creative volume × freshness)
6. Insert/update rows in ad_intelligence table

Failure mode: One platform scrape times out. Resolution: Continue with others, log failure, retry that platform later.

Status: [ ] TODO

---

### Task 8.2.3: Cross-platform priority boosting

Files: src/lib/ad-intel/cross-platform-scorer.ts
Owner: Claude
Prerequisite: 8.2.2
Estimated time: 30 minutes

Verification:
```
# Companies running ads on 3+ platforms should score higher
psql "$NEON_URL" -tA -c "
  SELECT l.priority_score
  FROM leads l
  WHERE l.id IN (
    SELECT lead_id FROM ad_intelligence GROUP BY lead_id HAVING COUNT(DISTINCT platform) >= 3
  )
  ORDER BY l.priority_score DESC LIMIT 5
" | head -1
```

Expected output:
Multi-platform advertisers have high priority scores.

Description:
Companies with active ads on 3+ platforms = serious marketing budget. Auto-boost priority_score by +20 per platform beyond first.

Status: [ ] TODO

---

### Task 8.3.1: Personalisation pointer integration

Files: src/lib/personalisation/buckets/ad-intel.ts integrated with S008
Owner: Claude
Prerequisite: 6.2.6, 8.2.2
Estimated time: 30 minutes

Verification:
```
# Lead with ad intelligence: personalisation bucket D should have specific ad references
psql "$NEON_URL" -tA -c "
  SELECT personalisation_pointers->'bucket_ad_intel' 
  FROM leads 
  WHERE id = (SELECT lead_id FROM ad_intelligence LIMIT 1)
" | jq -e 'length > 0 and (.[0] | contains(\"ad\") or contains(\"campaign\"))'
```

Expected output:
Bucket D pointers reference specific ad data.

Description:
Bucket D in S008 personalisation-engine reads from ad_intelligence table. Generates pointers like:
- "Your Meta ad campaign 'X' has been live for 47 days"
- "You're running 3 Google Search ads targeting '{keyword}' in London"
- "Your LinkedIn ad creative emphasises {theme} (active since {date})"

Concrete, specific, impossible to dismiss as template.

Status: [ ] TODO

---

### Task 8.4.1: Phase 8 sign-off

Files: confirmations/phase-8-complete.txt
Owner: Both
Prerequisite: All 8.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 8
```

Status: [ ] TODO

---

## PHASE 8 EXIT GATE

```bash
bash scripts/verify-phase.sh 8
```

Returns exit 0 only when:
- All 10 ad library scrapers operational (Meta, Google, LinkedIn, TikTok, X, Snapchat, Pinterest, Reddit, 2 aggregators)
- ad_intelligence table schema in place
- W14 daily cron aggregates across platforms
- Cross-platform priority boosting working
- Personalisation Bucket D integrates ad-specific pointers

Phase 9 locked until this passes.

End of Phase 8.
