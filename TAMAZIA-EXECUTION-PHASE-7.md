# PHASE 7 · LEAD SOURCING 50-API ENGINE
**Owner: Claude builds, Aman provides API keys for free tier accounts. Effort: 10 working days. Spend: £15-20/month NeverBounce.**

Source 100 verified leads per day across 10 sectors and 5 jurisdictions. Each lead enriched with email + LinkedIn ID + Instagram ID. Three-stage verification. Unified tracking via Neon DB primary + Cowork artifact view.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 6
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 7
```

---

### Task 7.1.1: Companies House UK API integration

Files: src/lib/sourcing/companies-house.ts, .env (CH_API_KEY)
Owner: Both (Aman generates key, Claude integrates)
Prerequisite: Phase 6 complete
Estimated time: 30 minutes

Verification:
```
node -e "
const ch = require('./src/lib/sourcing/companies-house.ts');
ch.searchByKeyword('legal').then(r => {
  if (r.length > 0) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Search returns results.

Description:
Aman: Register at developer.company-information.service.gov.uk, free API key.
Claude: Wrapper functions:
- searchByKeyword(keyword, sic_code?)
- searchByLocation(city, sic_code?)
- getCompanyOfficers(company_number) (PSC, directors)
- getCompanyFilings(company_number) (revenue trends if filed)

Rate limit: 600/5min. Caches results 30 days.

Failure mode: API rate limit. Resolution: Spread across morning hours, cache aggressively.

Status: [ ] TODO

---

### Task 7.1.2: OpenCorporates API integration

Files: src/lib/sourcing/opencorporates.ts
Owner: Both
Prerequisite: 7.1.1
Estimated time: 30 minutes

Verification:
```
node -e "
const oc = require('./src/lib/sourcing/opencorporates.ts');
oc.search({company_name: 'Test', jurisdiction: 'us'}).then(r => process.exit(r.length >= 0 ? 0 : 1));
"
```

Expected output:
Search returns (possibly empty) array.

Description:
Aman: Free API key from opencorporates.com. 500 requests/month free tier.
Claude: Global registry coverage. Used for US, AU, NZ, IN (deferred), CA, BR, MX, EU countries not covered by single registry.

Failure mode: Free quota exhausted. Resolution: Use only when other APIs don't cover jurisdiction.

Status: [ ] TODO

---

### Task 7.1.3: SEC EDGAR US integration

Files: src/lib/sourcing/sec-edgar.ts
Owner: Claude
Prerequisite: 7.1.1
Estimated time: 30 minutes

Verification:
```
node -e "
const sec = require('./src/lib/sourcing/sec-edgar.ts');
sec.searchByName('Apple').then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
SEC EDGAR returns results.

Description:
No API key needed. Free unlimited.
- searchByName(name)
- getFilings(cik)
- getOfficers(cik)

Used for US public companies. Useful for personal brand sector (executives mentioned in proxy filings).

Failure mode: Robots.txt limits. Resolution: Honor crawl-delay, user-agent identifies Tamazia.

Status: [ ] TODO

---

### Task 7.1.4: Hunter.io free tier

Files: src/lib/sourcing/hunter.ts, .env (HUNTER_KEY)
Owner: Both
Prerequisite: 7.1.1
Estimated time: 20 minutes

Verification:
```
node -e "
const h = require('./src/lib/sourcing/hunter.ts');
h.checkAccount().then(r => {
  if (r.requests_available >= 0) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Account check returns available requests.

Description:
Aman: Hunter.io free account, 25 searches + 50 verifications/month.
Claude:
- domainSearch(domain) → email format + verified contacts
- emailFinder({first_name, last_name, domain}) → most likely email
- emailVerifier(email) → deliverability check

Used by find-every-email (S029).

Failure mode: Free quota exhausted by 15th of month. Resolution: Combine with Snov.io and others to spread load.

Status: [ ] TODO

---

### Task 7.1.5: Snov.io free tier

Files: src/lib/sourcing/snov.ts, .env (SNOV_USER_ID, SNOV_SECRET)
Owner: Both
Prerequisite: 7.1.4
Estimated time: 20 minutes

Verification:
```
node -e "
const s = require('./src/lib/sourcing/snov.ts');
s.checkBalance().then(r => process.exit(r >= 0 ? 0 : 1));
"
```

Expected output:
Credits balance returned.

Description:
Aman: Snov.io free, 50 credits/month.
Claude: domain-search, email-finder, email-verifier wrappers.

Status: [ ] TODO

---

### Task 7.1.6: Apollo.io free tier

Files: src/lib/sourcing/apollo.ts, .env (APOLLO_KEY)
Owner: Both
Prerequisite: 7.1.5
Estimated time: 30 minutes

Verification:
```
node -e "
const a = require('./src/lib/sourcing/apollo.ts');
a.searchPeople({title: 'CEO', company_size: '11-50', location: 'London'}).then(r => process.exit(r.length >= 0 ? 0 : 1));
"
```

Expected output:
Search returns array.

Description:
Aman: Apollo free tier, 50 credits/month.
Claude: company-search, people-search, get-person wrappers.

Failure mode: Apollo free is restrictive. Resolution: Combine with Common Room (plugin already in Cowork session).

Status: [ ] TODO

---

### Task 7.1.7: Common Room MCP integration

Files: n8n credentials, integration via plugin_common-room
Owner: Aman authenticates
Prerequisite: Phase 0 complete
Estimated time: 15 minutes

Verification:
```
# Common Room plugin authenticated and returns data
# Manual: Aman authenticates via Cowork OAuth flow
test -f confirmations/common-room-authenticated.txt
```

Expected output:
Common Room plugin authenticated.

Description:
Aman runs Cowork command "authenticate Common Room". OAuth flow. After auth, Common Room signals available via plugin (account research, contact research, intent signals).

Skill S028 (sourcing orchestrator) uses Common Room as primary source for "warm" leads (companies with detected intent signals).

Failure mode: Common Room account not configured. Resolution: Sign up at commonroom.io free tier.

Status: [ ] TODO

---

### Task 7.1.8: Google Places API

Files: src/lib/sourcing/google-places.ts, .env (GOOGLE_PLACES_KEY)
Owner: Both
Prerequisite: 7.1.6
Estimated time: 20 minutes

Verification:
```
node -e "
const g = require('./src/lib/sourcing/google-places.ts');
g.nearbySearch({type: 'lodging', location: '51.5074,-0.1278', radius: 5000}).then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
London hotels returned.

Description:
Aman: Google Cloud console, enable Places API, generate key. $200 free credit/month.
Claude: nearbySearch, textSearch, placeDetails wrappers. Used for: hotels, clinics, law firms, real estate, all location-based.

Failure mode: $200 credit exhausted at scale. Resolution: Cache 30 days, free tier covers ~5000 searches/month.

Status: [ ] TODO

---

### Task 7.1.9: Yelp Fusion API

Files: src/lib/sourcing/yelp.ts, .env (YELP_KEY)
Owner: Both
Prerequisite: 7.1.8
Estimated time: 20 minutes

Verification:
```
node -e "
const y = require('./src/lib/sourcing/yelp.ts');
y.search({term: 'spa', location: 'New York'}).then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
Returns results.

Description:
Aman: Yelp Fusion API free, 5000 requests/day.
Claude: search + business-details wrappers. Primary for US/Canada hospitality/wellness/restaurants.

Status: [ ] TODO

---

### Task 7.1.10: OpenStreetMap Overpass

Files: src/lib/sourcing/overpass.ts
Owner: Claude
Prerequisite: 7.1.8
Estimated time: 30 minutes

Verification:
```
node -e "
const o = require('./src/lib/sourcing/overpass.ts');
o.query({amenity: 'doctors', bbox: '51.5,-0.2,51.6,-0.1'}).then(r => process.exit(r.length > 0 ? 0 : 1));
"
```

Expected output:
Doctor offices in London returned.

Description:
No key needed. Free unlimited (rate limits via fair use). Coverage: 50+ POI categories. Used for international markets where Google Places too restrictive.

Failure mode: Overpass server overloaded. Resolution: Retry with exponential backoff, alternate to mirror servers.

Status: [ ] TODO

---

### Task 7.2.1: Sourcing orchestrator skill (S028)

Files: ~/code/tamazia-cowork-skills/S028-sourcing-orchestrator/
Owner: Claude
Prerequisite: 7.1.1 through 7.1.10
Estimated time: 90 minutes

Verification:
```
# Trigger sourcing for one (sector, city) cell, verify ≥5 leads found
node $HOME/code/tamazia-cowork-skills/S028-sourcing-orchestrator/test/source.js \
  --sector hospitality --city London | \
  jq -e '.leads_inserted >= 5' > /dev/null
```

Expected output:
At least 5 leads sourced per cell.

Description:
S028 orchestrates:
1. Read (sector, city, jurisdiction) cell from sourcing_schedule
2. Call relevant APIs in parallel based on sector:
   - Companies House for SIC code (UK) or OpenCorporates (international)
   - Google Places for location-based sectors (hotels, clinics, etc.)
   - Common Room for intent-signal companies
   - LinkedIn search (via free public results) for sector matches
3. Aggregate results, deduplicate by domain
4. For each candidate company: call S029 find-every-email
5. Score via 6-factor (sector fit, size fit, decision-maker accessibility, regulatory complexity, premium pricing tolerance, geographic proximity)
6. Insert top scored into leads with status='pending', sourcing_channel populated

Failure mode: Cell has no leads (rare sector + small city). Resolution: Expand radius, fall back to country-level.

Status: [ ] TODO

---

### Task 7.2.2: Daily sourcing cron (W12)

Files: n8n W12 workflow
Owner: Claude
Prerequisite: 7.2.1
Estimated time: 30 minutes

Verification:
```
# Trigger W12 manually, verify ~100 leads added
psql "$NEON_URL" -tA -c "DELETE FROM leads WHERE sourcing_channel IS NOT NULL AND status='pending' AND created_at > NOW() - INTERVAL '1 hour'"
# Run W12
sleep 600  # 10 min for full cycle
COUNT=$(psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM leads WHERE status='pending' AND created_at > NOW() - INTERVAL '1 hour'")
test "$COUNT" -ge 80 && test "$COUNT" -le 120
```

Expected output:
~100 leads sourced (±20% acceptable).

Description:
W12 daily 05:00 cron:
1. Read today's sourcing_schedule (10 sectors × 1 jurisdiction)
2. For each cell, call S028
3. Aggregate, dedupe, score
4. Insert top 100 across all cells

Status: [ ] TODO

---

### Task 7.2.3: Sourcing rotation schedule

Files: migrations/2026-05-21-sourcing-schedule.sql
Owner: Claude
Prerequisite: 7.2.1
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sourcing_schedule WHERE day_of_week IS NOT NULL" | xargs -I {} test {} -ge 50
```

Expected output:
Schedule populated for 7-day cycle.

Description:
Schema:
```sql
CREATE TABLE sourcing_schedule (
  id SERIAL PRIMARY KEY,
  day_of_week INTEGER NOT NULL,  -- 0=Sunday, 6=Saturday
  sector VARCHAR(50) NOT NULL,
  jurisdiction VARCHAR(50) NOT NULL,
  cities TEXT[] NOT NULL,
  target_leads INTEGER NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(day_of_week, sector, jurisdiction)
);
```

Seed with rotation:
- Mon: Hospitality + Healthcare (UK + EU + US)
- Tue: Legal + Financial Services (UK + EU + UAE)
- Wed: Real Estate + Professional Services (UK + EU + US)
- Thu: E-commerce + Wellness (UK + EU + US)
- Fri: Education + Personal Brand (UK + UAE)
- Sat/Sun: Backfill missed cells

Each day yields 10 sectors × 1 jurisdiction × 10 leads = 100 leads.

Failure mode: Some cells consistently empty. Resolution: Cell-tracking, escalate empty cells, replace with adjacent sector.

Status: [ ] TODO

---

### Task 7.3.1: Find-every-email skill (S029)

Files: ~/code/tamazia-cowork-skills/S029-find-every-email/
Owner: Claude
Prerequisite: 7.1.4, 7.1.5, 7.1.6
Estimated time: 90 minutes

Verification:
```
# Test against company with public team page
node $HOME/code/tamazia-cowork-skills/S029-find-every-email/test/find.js \
  --domain tamazia.co.uk | \
  jq -e '.verified_contacts | length >= 1'
```

Expected output:
At least 1 verified contact per known-public company.

Description:
For target domain:
1. Scrape /team /about /leadership /contact (cheerio)
2. Extract names, titles, social profiles
3. Hunter.io domain-search returns format + known emails
4. Apollo by domain returns up to N people
5. LinkedIn employees scrape (Google site:linkedin.com "{company}")
6. Crunchbase team list (free tier)
7. Companies House PSC (UK companies)
8. SEC EDGAR officers (US public companies)
9. For each unique name discovered, generate 6 candidate email formats: {first}@, {first}.{last}@, {first_initial}{last}@, {first}{last}@, {first}_{last}@, {last}@
10. SMTP-verify each candidate (Stage 1, own server)
11. Cross-verify with Hunter + Mailboxlayer (Stage 2)
12. Score by seniority (CEO/Founder/MD = 10, VP/Director = 7, Manager = 4, IC = 2)
13. Return top 5-20 verified contacts

Failure mode: Company has no public team. Resolution: Return at least catchall (info@, hello@, contact@) for outreach, mark seniority unknown.

Status: [ ] TODO

---

### Task 7.3.2: 3-stage email verification (S030)

Files: ~/code/tamazia-cowork-skills/S030-email-verifier-3-stage/, .env (NEVERBOUNCE_KEY)
Owner: Both (Aman activates NeverBounce, Claude integrates)
Prerequisite: 7.3.1, your W9.10.3 approval for NeverBounce
Estimated time: 60 minutes

Verification:
```
# Test 10 emails, verify all stages run
node $HOME/code/tamazia-cowork-skills/S030-email-verifier-3-stage/test/verify.js | \
  jq -e '.stage_1_ran and .stage_2_ran'
```

Expected output:
Both free stages run, NeverBounce only on top-tier.

Description:
- Stage 1 (free, own SMTP probe): Connect to recipient's MX server, RCPT TO check, no actual send. ~70% accuracy. Catches dead inboxes.
- Stage 2 (free, Hunter + Mailboxlayer cross-reference): Lookup if email verified by either service. ~85% accuracy.
- Stage 3 (paid £15-20/month, NeverBounce): Only for leads with priority_score ≥ top-decile. ~95% accuracy. Catches catchalls and edge cases.

Per send, S030 returns:
- valid: bool
- confidence: 0-1
- risk_factors: [role-based, catchall, disposable, etc.]
- stages_used: [1, 2, 3?]

Failure mode: NeverBounce credits exhausted. Resolution: Alert Aman to top up, fall back to Stage 1+2 for non-top-tier.

Status: [ ] TODO

---

### Task 7.4.1: LinkedIn profile finder (S031)

Files: ~/code/tamazia-cowork-skills/S031-linkedin-profile-finder/
Owner: Claude
Prerequisite: 7.3.1
Estimated time: 45 minutes

Verification:
```
# Test against known person
node $HOME/code/tamazia-cowork-skills/S031-linkedin-profile-finder/test/find.js \
  --first_name Satya --last_name Nadella --company Microsoft | \
  jq -e '.linkedin_url | contains("satyanadella")'
```

Expected output:
Finds Satya Nadella's LinkedIn.

Description:
Google search: `site:linkedin.com/in "{first_name} {last_name}" "{company}"`. Parses top result. Validates URL format (linkedin.com/in/...). Returns profile URL or null.

Does NOT scrape LinkedIn directly (ToS violation). Only uses public Google index.

Failure mode: Multiple matches. Resolution: Prefer match with company name in headline. Confidence score based on match strength.

Status: [ ] TODO

---

### Task 7.4.2: Instagram handle finder (S032)

Files: ~/code/tamazia-cowork-skills/S032-instagram-handle-finder/
Owner: Claude
Prerequisite: 7.3.1
Estimated time: 30 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S032-instagram-handle-finder/test/find.js \
  --company Nike | \
  jq -e '.instagram_handle == "nike"'
```

Expected output:
Returns "nike" for Nike Inc.

Description:
Strategies:
1. Brand: Try `instagram.com/{company-name-lowercase}` direct check
2. Founder personal brand: Google search `site:instagram.com "{founder name}"`
3. Fallback: company website footer for IG link

Validates handle exists (Instagram public profile detection without auth).

Failure mode: No public Instagram presence. Resolution: Return null, lead.instagram_handle = NULL flagged for manual.

Status: [ ] TODO

---

### Task 7.5.1: Unified tracking schema

Files: migrations/2026-05-21-leads-enrichment.sql
Owner: Claude
Prerequisite: 7.4.1, 7.4.2
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name IN ('linkedin_url','instagram_handle','priority_score','sourcing_channel','sourcing_api')" | wc -l | grep -q "5"
```

Expected output:
All 5 columns exist.

Description:
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 0;
-- sourcing_channel and sourcing_api added in Phase 3 task 3.6.1
CREATE INDEX idx_leads_priority ON leads(priority_score DESC);
CREATE UNIQUE INDEX idx_leads_unique_domain_email ON leads(domain, email) WHERE email IS NOT NULL;
```

Failure mode: Existing duplicates fail unique constraint. Resolution: Run dedup query first, mark older as superseded.

Status: [ ] TODO

---

### Task 7.6.1: Cowork artifact lead pipeline dashboard

Files: tamazia-pipeline-tracker.html (Cowork artifact)
Owner: Claude
Prerequisite: 7.5.1
Estimated time: 60 minutes

Verification:
```
# Cowork creates artifact, Aman opens, verifies dashboard renders
mcp__cowork__list_artifacts | jq -e '.[] | select(.title == "tamazia-pipeline-tracker") | .id'
```

Expected output:
Artifact exists in Cowork.

Description:
HTML artifact via mcp__cowork__create_artifact.

Displays live pipeline:
- Top: Total leads by status (pending/contacted/engaged/replied/call_booked/client/lost) with progress bar
- Filter: by sector, jurisdiction, sourcing_channel, priority_score range
- Table: top 50 pending leads sorted by priority_score with sector, location, contact, score, status
- Click row: expand to show research dossier + personalisation pointers + outreach drafts

Pulls live via window.cowork.callMcpTool for Neon queries (read-only).

Refresh button at top.

Failure mode: Artifact slow to load with 1000s of leads. Resolution: Paginate, load top 50 first.

Status: [ ] TODO

---

### Task 7.6.2: Slack daily digest 07:30

Files: n8n W13 daily-digest workflow
Owner: Claude
Prerequisite: 7.6.1
Estimated time: 30 minutes

Verification:
```
# Trigger manually, verify Slack message
curl -s -X POST "$N8N_URL/webhook-test/daily-digest" -d '{"manual":true}'
sleep 5
test -f confirmations/daily-digest-tested.txt
```

Expected output:
Slack digest posted to #aman-cos.

Description:
W13 daily 07:30:
- Overnight new leads count by sector
- Yesterday's: sends, opens, replies (categorised), audits delivered, bookings
- Top 5 priority leads ready for today's send
- Any alias health alerts
- Calendar: today's scheduled calls

Markdown formatted, posted to Slack #aman-cos. Parallel Telegram digest.

Failure mode: Digest too long for Slack. Resolution: Use Slack threading, summary message + thread details.

Status: [ ] TODO

---

### Task 7.7.1: Phase 7 sign-off

Files: confirmations/phase-7-complete.txt
Owner: Both
Prerequisite: All 7.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 7
```

Status: [ ] TODO

---

## PHASE 7 EXIT GATE

```bash
bash scripts/verify-phase.sh 7
```

Returns exit 0 only when:
- 10 priority APIs integrated (Companies House, OpenCorporates, SEC, Hunter, Snov, Apollo, Common Room, Google Places, Yelp, OSM)
- S028 sourcing-orchestrator produces leads per cell
- W12 daily cron sources 100 leads (±20%)
- Sourcing rotation schedule live
- S029 find-every-email returns 5-20 contacts per public company
- S030 3-stage verification operational, bounce rate target <2%
- S031 LinkedIn finder + S032 Instagram finder running per lead
- Leads table has linkedin_url, instagram_handle, priority_score, sourcing_channel
- Cowork artifact pipeline dashboard live
- Slack daily digest 07:30 firing

Phase 8 locked until this passes.

End of Phase 7.
