# PHASE 6 · 50-POINTER PERSONALISATION + FREE LLM STACK
**Owner: Claude. Effort: 7 working days. Spend: £0-15/month (DeepSeek overflow cap if approved).**

Build the engine that makes every audit feel hand-crafted: 50 specific, verifiable pointers per lead across 5 buckets. Wire the free LLM stack (Cloudflare Workers AI primary, Groq fast classification, Gemini Flash overflow). Ensure links in cold emails don't trigger spam filters.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 5
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 6
```

---

### Task 6.1.1: Personalisation pointers schema

Files: migrations/2026-05-20-personalisation-pointers.sql
Owner: Claude
Prerequisite: Phase 5 complete
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='personalisation_pointers'" | grep -q "personalisation_pointers"
```

Expected output:
Column exists on leads table.

Description:
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalisation_pointers JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalisation_quality_score FLOAT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalisation_generated_at TIMESTAMPTZ;

CREATE INDEX idx_leads_pers_quality ON leads(personalisation_quality_score) 
  WHERE personalisation_quality_score >= 0.7;
```

JSONB structure:
```json
{
  "bucket_website": [10 pointers],
  "bucket_compliance": [10 pointers],
  "bucket_seo": [10 pointers],
  "bucket_ad_intel": [10 pointers],
  "bucket_public_records": [10 pointers],
  "total_count": 50,
  "specificity_score": 0.0-1.0,
  "generated_at": "ISO timestamp",
  "model_used": "cloudflare-llama-3.1-8b"
}
```

Status: [ ] TODO

---

### Task 6.1.2: Cloudflare Workers AI integration

Files: src/lib/llm/cloudflare-ai.ts, n8n credential setup
Owner: Claude
Prerequisite: 0.1.6
Estimated time: 30 minutes

Verification:
```
node -e "
const cf = require('./src/lib/llm/cloudflare-ai.ts');
cf.generate({model: '@cf/meta/llama-3.1-8b-instruct', prompt: 'Say hello in 5 words'}).then(r => {
  if (r.length > 0 && r.length < 100) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Returns generation within 5 seconds.

Description:
Wrapper around Cloudflare Workers AI REST API. Functions:
- generate(opts) → text completion
- generateJSON(opts) → structured JSON response  
- embed(text) → embedding vector

Models supported: @cf/meta/llama-3.1-8b-instruct, @cf/meta/llama-3.3-70b-instruct, @cf/mistral/mistral-7b-instruct, @cf/microsoft/phi-2.

Tracks neuron usage in `llm_usage` table (Phase 13 reporting).

Failure mode: Quota exhausted mid-day. Resolution: Fallback to Gemini Flash automatic, alert Telegram.

Status: [ ] TODO

---

### Task 6.1.3: Groq integration

Files: src/lib/llm/groq.ts
Owner: Claude
Prerequisite: 0.1.7
Estimated time: 20 minutes

Verification:
```
node -e "
const g = require('./src/lib/llm/groq.ts');
g.generate({model: 'llama-3.1-70b-versatile', prompt: 'Hello in 5 words'}).then(r => {
  if (r.length > 0) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Groq returns generation within 2 seconds (fast).

Description:
Wrapper around Groq's OpenAI-compatible API. Used primarily for reply intent classification (needs to be fast). 30 req/min rate limit, 14400/day, free.

Failure mode: Rate limit hit. Resolution: Falls back to Cloudflare or Gemini.

Status: [ ] TODO

---

### Task 6.1.4: Gemini Flash integration

Files: src/lib/llm/gemini.ts
Owner: Claude
Prerequisite: 0.1.8
Estimated time: 20 minutes

Verification:
```
node -e "
const g = require('./src/lib/llm/gemini.ts');
g.generate({model: 'gemini-2.0-flash-exp', prompt: 'Hello in 5 words'}).then(r => {
  if (r.length > 0) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Gemini responds.

Description:
Wrapper around Google AI Studio. 1500 req/day free. 1M context window useful for long inputs (contracts, full website content for personalisation).

Failure mode: Geographic restriction. Resolution: Aman uses Workspace account.

Status: [ ] TODO

---

### Task 6.1.5: LLM router (smart routing across providers)

Files: src/lib/llm/router.ts
Owner: Claude
Prerequisite: 6.1.2, 6.1.3, 6.1.4
Estimated time: 45 minutes

Verification:
```
node -e "
const r = require('./src/lib/llm/router.ts');
// Test routing logic
const choice1 = r.pickProvider({task: 'classify_reply', urgency: 'high'});
const choice2 = r.pickProvider({task: 'personalisation_bulk', urgency: 'low'});
const choice3 = r.pickProvider({task: 'legal_threat_check', urgency: 'critical'});
// Expect: classify→groq, bulk→cloudflare, legal→claude
if (choice1 === 'groq' && choice2 === 'cloudflare' && choice3 === 'claude-haiku') process.exit(0);
process.exit(1);
"
```

Expected output:
Router picks correct provider per task type.

Description:
Routing logic:
- task=classify_reply (frequent, fast needed): Groq Llama 3.1 70B
- task=personalisation_bulk: Cloudflare Workers AI Llama 3.1 8B
- task=personalisation_quality: Cloudflare Llama 3.3 70B (better quality)
- task=long_context (>32k tokens): Gemini 2.0 Flash (1M context)
- task=legal_threat / hostile_check: Claude Haiku (paid, highest stakes)
- task=contract_review: Claude Haiku
- Fallbacks: if primary fails or quota hit, route to secondary

Tracks per-call: provider, model, latency, tokens used, cost (where paid).

Failure mode: All providers down. Resolution: Telegram P0 alert, queue task for retry.

Status: [ ] TODO

---

### Task 6.2.1: Personalisation engine skill (S008)

Files: ~/code/tamazia-cowork-skills/S008-personalisation-engine/
Owner: Claude
Prerequisite: 6.1.5
Estimated time: 90 minutes

Verification:
```
# Run for test lead, verify 50 specific pointers
node $HOME/code/tamazia-cowork-skills/S008-personalisation-engine/test/generate.js | \
  jq -e '.pointers_total == 50 and .specificity_score >= 0.7' > /dev/null
```

Expected output:
50 pointers generated with quality score ≥0.7.

Description:
Skill calls 5 sub-engines in parallel:
- bucket_website (calls S004 research-digest extract)
- bucket_compliance (calls S015 check-compliance + S018 regulatory-citation)
- bucket_seo (calls S003 audit)
- bucket_ad_intel (calls S033 ad-intelligence-scraper)
- bucket_public_records (calls Companies House, news APIs)

Each sub-engine: prompt LLM (Cloudflare Workers AI primary) with bucket-specific prompt + raw data. Returns 10 structured pointers. Joins into 50-pointer JSON.

Then quality scoring: each pointer must contain at least one of {named person, specific URL, specific number, specific date, specific regulation}. Score = % of pointers passing. Reject + retry if score <0.7.

Stored on lead.personalisation_pointers.

Failure mode: One bucket returns generic pointers. Resolution: Per-bucket quality check, retry just that bucket.

Status: [ ] TODO

---

### Task 6.2.2: Pointer quality scoring rubric

Files: src/lib/personalisation/quality-rubric.ts
Owner: Claude
Prerequisite: 6.2.1
Estimated time: 30 minutes

Verification:
```
node -e "
const q = require('./src/lib/personalisation/quality-rubric.ts');
const generic = q.score('Your website needs work');
const specific = q.score('Your homepage at smithlaw.co.uk loads in 4.8s on mobile, top-3 competitor litigationexperts.co.uk loads in 1.2s');
if (specific > 0.8 && generic < 0.3) process.exit(0);
process.exit(1);
"
```

Expected output:
Specific pointer scores high, generic scores low.

Description:
Rubric checks (regex + classifier):
- Contains named entity (person, company, place)? +0.2
- Contains specific URL? +0.2
- Contains specific number with unit? +0.2
- Contains specific date or regulation? +0.2
- Contains comparative claim (vs competitor)? +0.2

Generic adjectives ("good", "modern", "needs improvement", "could be better") penalised.

Failure mode: Rubric too strict, rejects valid pointers. Resolution: Calibrate against 50 hand-curated pointers from Aman.

Status: [ ] TODO

---

### Task 6.2.3: Bucket A - Website signals sub-engine

Files: src/lib/personalisation/buckets/website-signals.ts
Owner: Claude
Prerequisite: 6.2.1
Estimated time: 60 minutes

Verification:
```
node -e "
const w = require('./src/lib/personalisation/buckets/website-signals.ts');
w.extract('https://tamazia.co.uk').then(p => {
  if (p.length === 10 && p.every(x => x.length > 10)) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
10 website-signal pointers extracted.

Description:
For target domain, extracts 10 specific facts:
1. Services listed (e.g., "You offer SEO, compliance, conversion optimisation")
2. Team size from /about (e.g., "Your team is 8 specialists per /about")
3. Locations and offices
4. Awards in last 3 years
5. USP statements pulled verbatim
6. Tech stack (Wappalyzer)
7. Blog cadence (weekly/monthly/quarterly)
8. Social proof type used (testimonials/case studies/logos)
9. CTA gradient assessment
10. Footer trust elements

Scrapes /, /about, /services, /team, /contact. Parses with cheerio.

Failure mode: Site uses JS-rendered content. Resolution: Use Playwright for JS-heavy sites.

Status: [ ] TODO

---

### Task 6.2.4: Bucket B - Compliance signals sub-engine

Files: src/lib/personalisation/buckets/compliance-signals.ts
Owner: Claude
Prerequisite: 6.2.3, 2.6.4
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S008-personalisation-engine/test/bucket-compliance.js | \
  jq -e '.pointers | length == 10'
```

Expected output:
10 compliance pointers extracted.

Description:
Calls S015 check-compliance. Maps top 10 flags to pointer format:
- Cookie consent compliance vs ICO TCF v2
- Privacy policy Article 13/14 completeness
- T&Cs hosted location
- ICO registration check (public lookup)
- Accessibility WCAG basics (axe-core scan)
- DPA visibility
- Retention policy
- Third-party processor list
- Data subject rights handling
- Sector regulator-specific (FCA/SRA/CQC/etc.)

Each pointer cites specific regulation + suggests fix.

Failure mode: Site has full compliance, only 3-4 signals found. Resolution: Cite positive signals too ("Your privacy policy correctly cites Article 27 representative").

Status: [ ] TODO

---

### Task 6.2.5: Bucket C - SEO audit sub-engine

Files: src/lib/personalisation/buckets/seo-audit.ts
Owner: Claude
Prerequisite: 6.2.3, S003 (existing audit)
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S008-personalisation-engine/test/bucket-seo.js | \
  jq -e '.pointers | length == 10'
```

Expected output:
10 SEO pointers.

Description:
Calls S003 audit. Extracts 10 specific:
1. Core Web Vitals (LCP, CLS, FID per page)
2. Schema markup completeness
3. Keyword ranking top 5 (via Search Console or Ubersuggest free)
4. Backlink quality distribution
5. Internal linking depth (orphan pages flagged)
6. Content freshness (last updated dates)
7. Featured snippet coverage
8. AI search citations (test ChatGPT/Perplexity/Claude.ai/Gemini for "{firm} {service}")
9. Competitive keyword gap (top 3 keywords competitor owns you don't)
10. Long-tail capture analysis

Failure mode: AI search citation check API-less. Resolution: Use direct API calls (Perplexity API free), or skip if unavailable.

Status: [ ] TODO

---

### Task 6.2.6: Bucket D - Ad and marketing intelligence sub-engine

Files: src/lib/personalisation/buckets/ad-intel.ts
Owner: Claude
Prerequisite: Phase 8 dependency (S033 ad-intelligence-scraper)
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S008-personalisation-engine/test/bucket-ad-intel.js | \
  jq -e '.pointers | length >= 5'
```

Expected output:
At least 5 ad intel pointers (some leads have less ad activity).

Description:
Calls S033 ad-intelligence-scraper for target company. Extracts:
1. Active Meta ads (creative, copy, targeting, dates)
2. Google Ads Transparency presence
3. LinkedIn Ads visible
4. TikTok Creative Center presence
5. Retargeting pixels installed (BuiltWith)
6. Conversion tracking setup
7. GA4 vs legacy detection
8. Marketing automation tool detected
9. CRM detected
10. Email service provider detected

For companies with no detected ad activity, pointers are absence-based ("Your competitors run Meta ads, you don't").

Failure mode: Site without ads + competitors also without. Resolution: Default to "untapped opportunity" framing.

Status: [ ] TODO

---

### Task 6.2.7: Bucket E - Public records sub-engine

Files: src/lib/personalisation/buckets/public-records.ts
Owner: Claude
Prerequisite: Phase 7 dependency (Companies House API)
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S008-personalisation-engine/test/bucket-public.js | \
  jq -e '.pointers | length == 10'
```

Expected output:
10 public records pointers.

Description:
Extracts:
1. Companies House filing trajectory
2. Revenue trend (where filed)
3. Headcount growth (LinkedIn employees count over time)
4. Recent leadership changes
5. M&A history
6. Press mentions last 90 days
7. Awards last 12 months
8. Partnership announcements
9. Regulator news mentions specific to sector
10. Sector trend impact

Uses Companies House API, LinkedIn employees scrape, Google News, sector trade publications.

Failure mode: Private company minimal public footprint. Resolution: Fall back to sector context ("Companies your size in your sector typically...").

Status: [ ] TODO

---

### Task 6.3.1: Pre-generate audits before W2 morning cron

Files: n8n W9 expansion (research dossier + personalisation)
Owner: Claude
Prerequisite: 6.2.1
Estimated time: 30 minutes

Verification:
```
# 23:00 cron should pre-generate top 100 leads' personalisation
# Verify next morning: 80% have personalisation_pointers populated
psql "$NEON_URL" -tA -c "
  SELECT 
    100.0 * COUNT(*) FILTER (WHERE personalisation_pointers IS NOT NULL) / COUNT(*)
  FROM (SELECT * FROM leads WHERE status='pending' AND next_touch_date = CURRENT_DATE ORDER BY priority_score DESC LIMIT 100) sub
" | awk '{print $1+0}' | xargs -I {} test {} -ge 80
```

Expected output:
≥80% of top-100 leads ready by morning cron.

Description:
W9 expanded:
- 22:00 cron: identify top 100 leads scheduled for tomorrow morning (priority_score order)
- For each: call S008 personalisation-engine
- Store result on lead.personalisation_pointers
- Track success rate, retry failures

W2 at 08:30 reads pre-populated pointers, uses for hyper-personalisation. Fast send.

Failure mode: Some leads fail (API timeouts, etc.). Resolution: Retry once at 04:00, then accept lower personalisation level for those.

Status: [ ] TODO

---

### Task 6.4.1: Send link without spam triggers verification

Files: tests/spam-trigger-check.sh
Owner: Claude
Prerequisite: 3.3.3, 6.3.1
Estimated time: 30 minutes

Verification:
```
bash tests/spam-trigger-check.sh
```

Expected output:
10 test compositions all pass mail-tester score ≥9 even with audit link included.

Description:
For each sector × variant combination including audit URL in body:
1. Compose test email with link inserted mid-body (not P.S.)
2. Send to mail-tester address
3. Wait 30 sec
4. Scrape score, must be ≥9/10
5. If <9, identify which header/content drops score, iterate copy

Critical: tamazia.co.uk reputation must remain high (already established via warmup), link is plain-text URL not button, no shortener, only 1 link per email.

Failure mode: Link triggers any score drop. Resolution: Test variations (with/without UTM, different anchor placement), use the highest-scoring.

Status: [ ] TODO

---

### Task 6.5.1: Quality scoring loop and improvement

Files: scripts/personalisation-quality-review.sh
Owner: Claude
Prerequisite: 6.2.2
Estimated time: 30 minutes

Verification:
```
# Weekly review script
bash scripts/personalisation-quality-review.sh
# Should output report
test -f reports/personalisation-quality-$(date +%Y-%m-%d).md
```

Expected output:
Weekly quality report exists.

Description:
Weekly cron:
- Aggregate quality scores by bucket across last 7 days
- Identify buckets/sectors with degrading quality
- Sample 20 pointers from low-scoring bucket
- Generate prompt-tuning suggestions for that bucket
- Aman reviews report, approves prompt updates

Failure mode: Quality stays high but engagement low (good pointers, wrong angle). Resolution: Cross-reference with audit engagement (S019) to verify pointers actually drive intent.

Status: [ ] TODO

---

### Task 6.6.1: Phase 6 sign-off

Files: confirmations/phase-6-complete.txt
Owner: Both
Prerequisite: All 6.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 6
```

Status: [ ] TODO

---

## PHASE 6 EXIT GATE

```bash
bash scripts/verify-phase.sh 6
```

Returns exit 0 only when:
- Personalisation pointers schema added to leads table
- Cloudflare Workers AI + Groq + Gemini Flash wrappers tested
- LLM router with smart provider selection working
- S008 personalisation-engine generates 50 specific pointers per test lead
- Quality rubric scoring properly differentiates generic vs specific
- All 5 buckets (website/compliance/seo/ad-intel/public-records) operational
- Pre-generation cron populates 80% of next-day leads
- Send-link spam-trigger test passes (mail-tester ≥9/10 with link)
- Quality scoring loop runs weekly

Phase 7 locked until this passes.

End of Phase 6.
