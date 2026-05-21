# PHASE 3 · COMPOSE BODY HARDENING + REPLY INTENT CLASSIFIER
**Owner: Claude. Effort: 6 working days. Spend: £0 (free LLMs).**

Fix all 50 compose-body gaps from v1 analysis, build the 13-category reply intent classifier with auto-drafted responses across 130 sector-category combinations, harden hard-stop-on-reply at three workflow layers, build template variant tracking for continuous A/B improvement.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 2
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 3
```

---

### Task 3.1.1: Template variant tracker table and skill

Files: migrations/2026-05-18-template-variants.sql, ~/code/tamazia-cowork-skills/S014-template-variant-tracker/
Owner: Claude
Prerequisite: Phase 2 complete
Estimated time: 45 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM template_variants" | xargs -I {} test {} -ge 3 && \
test -f $HOME/code/tamazia-cowork-skills/S014-template-variant-tracker/SKILL.md
```

Expected output:
template_variants table seeded with at least 3 variants per sector + touch combo. Skill file exists.

Description:
Schema:
```sql
CREATE TABLE template_variants (
  id SERIAL PRIMARY KEY,
  variant_code VARCHAR(50) UNIQUE NOT NULL,
  sector VARCHAR(50) NOT NULL,
  touch INTEGER NOT NULL,
  variant_letter CHAR(1) NOT NULL,
  approach_type VARCHAR(30) NOT NULL,
  subject_options TEXT[] NOT NULL,
  body_template TEXT NOT NULL,
  word_count_target INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sends_count INTEGER NOT NULL DEFAULT 0,
  opens_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  reply_rate_7d FLOAT,
  reply_rate_30d FLOAT,
  open_rate_7d FLOAT,
  retired_at TIMESTAMPTZ,
  retire_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_variants_active ON template_variants(active, sector, touch);

ALTER TABLE sends ADD COLUMN IF NOT EXISTS template_variant_id INTEGER REFERENCES template_variants(id);
```

Seed initial 3 variants for hospitality touch 0 (V1/V2/V3 from EMAIL-TEMPLATES.md). S014 skill manages: log send, compute rolling reply rate, retire bottom-quartile weekly.

Failure mode: Hash distribution uneven, variant_letter A gets disproportionate sends. Resolution: Use lead.id modulo variant_count not just A/B/C ranges.

Status: [ ] TODO

---

### Task 3.1.2: Fix 1 — Sign-off as alias first name (already done Phase 1)

Files: Phase 1 task 1.4.1 already complete
Owner: Claude
Prerequisite: 1.4.1
Estimated time: 0 minutes (verification only)

Verification:
```
bash scripts/verify-task.sh 1.4.1
```

Expected output:
Phase 1 task verified, no rework.

Description:
Confirmation that prior phase delivery still works.

Status: [ ] TODO

---

### Task 3.1.3: Fix 2 — Reply-rate tracking per template variant

Files: S001 compose-body integration with S014
Owner: Claude
Prerequisite: 3.1.1
Estimated time: 30 minutes

Verification:
```
# Compose 10 test sends, verify each links to template_variants row
psql "$NEON_URL" -tA -c "SELECT COUNT(DISTINCT template_variant_id) FROM sends WHERE created_at > NOW() - INTERVAL '1 hour'" | xargs -I {} test {} -ge 1
```

Expected output:
Sends table populated with template_variant_id values.

Description:
S001 compose-body picks variant via SHA1(lead.id) mod 3 (deterministic). Logs chosen variant_id to sends.template_variant_id. S014 nightly cron computes reply_rate_7d and reply_rate_30d. Weekly cron retires variants with reply_rate_7d in bottom quartile if sends_count > 100.

Failure mode: All sends use variant A because hash skewed. Resolution: Test with diverse lead.id distribution before declaring done.

Status: [ ] TODO

---

### Task 3.1.4: Fix 3 — Regional spelling (UK vs US)

Files: ~/code/tamazia-cowork-skills/S001-compose-body/scripts/locale-spell.js
Owner: Claude
Prerequisite: 2.8.2
Estimated time: 30 minutes

Verification:
```
node -e "
const c = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/compose.js');
const uk = c.test({lead: {country: 'UK'}, ...}, 'We optimise your strategy');
const us = c.test({lead: {country: 'US'}, ...}, 'We optimise your strategy');
if (uk.includes('optimise') && us.includes('optimize')) process.exit(0);
process.exit(1);
"
```

Expected output:
UK lead body has British spelling, US lead has American.

Description:
Locale-spell module maps 50+ words (organise/organize, colour/color, centre/center, etc.). Compose-body runs through filter based on lead.country. Tested with US, UK, AU, CA leads.

Failure mode: Edge cases missed. Resolution: Use established Node.js library (e.g., british-american-translations) as base, supplement with Tamazia-specific terms.

Status: [ ] TODO

---

### Task 3.1.5: Fix 4 — Language detection skip

Files: ~/code/tamazia-cowork-skills/S001-compose-body/scripts/language-guard.js
Owner: Claude
Prerequisite: 3.1.4
Estimated time: 30 minutes

Verification:
```
# Test: French-name lead at French-domain company should skip
node -e "
const c = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/compose.js');
const result = c.test({lead: {first_name: 'François', domain: 'cabinet-juridique.fr', country: 'FR'}});
if (result.status === 'skipped_non_english') process.exit(0);
process.exit(1);
"
```

Expected output:
Non-English lead routes to manual queue, no automated send.

Description:
Language detection via lead.country, domain TLD, language hints in first/last name (Cyrillic, Chinese characters, Arabic). If detected non-English: mark for manual handling, no automated send. Phase 10 can add localised templates per language if volume justifies.

Failure mode: Anglophone with foreign name (e.g., François living in UK) wrongly skipped. Resolution: Country code primary signal, name only if country ambiguous.

Status: [ ] TODO

---

### Task 3.1.6: Fix 5 — Title abbreviation correctness

Files: ~/code/tamazia-cowork-skills/S001-compose-body/scripts/title-lookup.json
Owner: Claude
Prerequisite: 3.1.4
Estimated time: 20 minutes

Verification:
```
node -e "
const t = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/title-lookup.js');
if (t.format({title: 'Mr', first_name: 'James', last_name: 'Smith', post_nominals: ['KC']}) === 'Mr James Smith KC') process.exit(0);
process.exit(1);
"
```

Expected output:
Title formatted correctly with post-nominals.

Description:
JSON lookup with formatting rules:
- KC (Counsel) at end
- Hon. (Honourable) prefix
- Dr. always prefix
- Sir/Dame prefix
- LLB, LLM, MBA, JD, MD post-nominal
- FRCS, FRCP, FCA, FRSA post-nominal
- Esq. (US legal context only)

Compose-body uses this when addressing lead in formal sectors (legal, financial services).

Failure mode: Title not in lookup. Resolution: Default to first_name + last_name, no honorifics.

Status: [ ] TODO

---

### Task 3.1.7: Fix 6 — Company name normalisation

Files: ~/code/tamazia-cowork-skills/S001-compose-body/scripts/company-format.js
Owner: Claude
Prerequisite: 3.1.4
Estimated time: 20 minutes

Verification:
```
node -e "
const f = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/company-format.js');
// In body: drop suffix. In footer: keep formal.
if (f.casual('Tamazia Ltd') === 'Tamazia' && f.formal('Tamazia Ltd') === 'Tamazia Ltd') process.exit(0);
process.exit(1);
"
```

Expected output:
Casual form drops legal suffix, formal form keeps it.

Description:
Rules:
- Body references use casual form (drops Ltd, LLP, Limited, Inc., LLC, Plc, GmbH, Sarl, etc.)
- Footer references use formal full legal name
- Subject lines use casual form unless space allows formal

Failure mode: Brand names that include legal suffix on purpose (e.g., "Cadbury Plc" as brand). Resolution: Manual override list.

Status: [ ] TODO

---

### Task 3.1.8: Fix 7 — Time-of-day per sector

Files: src/lib/scheduling/sector-time-routing.json
Owner: Claude
Prerequisite: 2.8.4
Estimated time: 25 minutes

Verification:
```
test -f src/lib/scheduling/sector-time-routing.json && \
jq -e '.legal.preferred_hour <= 9 and .hospitality.preferred_hour >= 14' src/lib/scheduling/sector-time-routing.json
```

Expected output:
JSON has sector-specific send hour preferences.

Description:
Per-sector preferred local send hour:
- Legal: 07:30 (lawyers in early)
- Financial Services: 08:00 (markets open)
- Healthcare: 07:00 (pre-clinic)
- Hospitality: 15:00 (post-lunch slump)
- Wellness: 11:00 (mid-morning)
- E-commerce: 10:00 (after standup)
- Real Estate: 09:30
- Professional Services: 08:30
- Education: 16:00 (after class)
- Personal Brand: variable, default 09:00

W2 cron picks alias and lead, computes send time = preferred_hour adjusted to lead's timezone. Random ±15 min jitter to avoid pattern.

Failure mode: Lead's timezone has DST shift. Resolution: timezone-router (2.8.4) handles DST.

Status: [ ] TODO

---

### Task 3.1.9: Fix 8 — Timezone aware (already done Phase 2)

Files: Phase 2 task 2.8.4
Owner: Claude
Prerequisite: 2.8.4
Estimated time: 0 (verification)

Verification:
```
bash scripts/verify-task.sh 2.8.4
```

Status: [ ] TODO

---

### Task 3.1.10: Fix 9 — Unsubscribe link in footer

Files: src/templates/email/footer.html, src/pages/unsubscribe.astro
Owner: Claude
Prerequisite: 1.4.3
Estimated time: 30 minutes

Verification:
```
curl -s -o /dev/null -w "%{http_code}" "https://tamazia.co.uk/unsubscribe?token=test123" | grep -q "200" && \
grep -q "tamazia.co.uk/unsubscribe" src/templates/email/footer.html
```

Expected output:
Unsubscribe page returns 200, footer references it.

Description:
Create unsubscribe page that accepts token, validates against unsubscribe_tokens table (lead_id encoded), confirms unsubscribe, adds email to DNC, returns confirmation page.

Footer always includes: "Reply STOP to unsubscribe OR click: tamazia.co.uk/unsubscribe?token={token}"

PECR exempts B2B from mandatory unsubscribe link, but having one improves deliverability reputation. Best practice.

Failure mode: Token leaked, others can unsubscribe each other. Resolution: Token tied to email+timestamp+secret, not guessable.

Status: [ ] TODO

---

### Task 3.1.11: Fix 10 — Footer compliance (already done Phase 2)

Files: Phase 2 task 1.4.3 + 2.1.2 + 2.5.3
Owner: Claude
Prerequisite: 1.4.3, 2.1.2, 2.5.3
Estimated time: 0 (verification)

Verification:
```
bash scripts/verify-task.sh 1.4.3 && \
bash scripts/verify-task.sh 2.1.2 && \
bash scripts/verify-task.sh 2.5.3
```

Status: [ ] TODO

---

### Task 3.2.1: Reply intent classifier skill (S012)

Files: ~/code/tamazia-cowork-skills/S012-reply-intent-classifier/SKILL.md + scripts/classify.js
Owner: Claude
Prerequisite: 0.1.7 (Groq), 0.1.6 (Cloudflare AI)
Estimated time: 60 minutes

Verification:
```
# 20 test classifications, 18+ must match expected category
node $HOME/code/tamazia-cowork-skills/S012-reply-intent-classifier/scripts/test-suite.js | \
  jq -e '.passed >= 18 and .total == 20' > /dev/null
```

Expected output:
Test suite passes ≥90% accuracy across 13 categories.

Description:
S012 skill. Classifies inbound replies into 13 categories using Cloudflare Workers AI Llama 3.1 8B with structured output (JSON schema). Falls back to Groq Llama 3.1 70B if Cloudflare unavailable. For LEGAL_THREAT or HOSTILE classification, requires confidence ≥0.85 OR escalates via Claude Haiku (paid).

Prompt:
```
You are classifying an email reply from a B2B prospect. The recipient is Tamazia (UK marketing/compliance agency). Categorise into exactly one of:
HOT_BOOK, HOT_PRICE, WARM_INFO, WARM_TIMING, NURTURE, OBJECTION_BUDGET, OBJECTION_INCUMBENT, OBJECTION_FIT, REDIRECT, OOO, HOSTILE, LEGAL_THREAT, UNSUBSCRIBE.

Reply text: {{reply_text}}
Lead context: sector={{sector}}, company={{firm}}, prior touches={{touch_count}}

Output JSON:
{
  "category": "...",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentences",
  "key_signals": ["..."]
}
```

Test suite: 20 hand-labelled real-world replies (positive interest, budget objection, redirect, OOO, hostile, etc.) with expected categories.

Failure mode: Model returns invalid JSON or invalid category. Resolution: Strict schema validation, retry with stronger model if fails.

Status: [ ] TODO

---

### Task 3.2.2: Response draft generator skill (S013) + 130 templates

Files: ~/code/tamazia-cowork-skills/S013-response-draft-generator/, migrations/seed-response-templates.sql
Owner: Claude
Prerequisite: 3.2.1
Estimated time: 4 hours

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM response_templates" | xargs -I {} test {} -eq 130 && \
test -f $HOME/code/tamazia-cowork-skills/S013-response-draft-generator/SKILL.md
```

Expected output:
130 response templates seeded (13 categories × 10 sectors).

Description:
S013 takes lead_id + reply_text + classification, generates draft response calibrated to sector + category. Pulls from response_templates table:
```sql
CREATE TABLE response_templates (
  id SERIAL PRIMARY KEY,
  sector VARCHAR(50) NOT NULL,
  category VARCHAR(30) NOT NULL,
  template_body TEXT NOT NULL,
  tone_notes TEXT,
  required_substitutions TEXT[],
  UNIQUE(sector, category)
);
```

Seed 130 templates: 10 sectors × 13 categories. Each calibrated to sector (legal = formal, hospitality = warm-casual, etc.) and category (HOT_BOOK pushes Calendly, OBJECTION_BUDGET addresses price head-on, etc.).

S013 fills personalisation tokens, runs through forbidden-phrase-checker, returns final draft.

Failure mode: Template tone wrong for combination (legal + curiosity hook clash). Resolution: Each template hand-reviewed, A/B test variants.

Status: [ ] TODO

---

### Task 3.2.3: W6 reply intent classifier integrated

Files: n8n W6 workflow
Owner: Claude
Prerequisite: 3.2.1, 3.2.2
Estimated time: 30 minutes

Verification:
```
# Simulate inbound reply, verify classifier and draft generator fire
curl -s -X POST "$N8N_URL/webhook-test/simulate-reply" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","subject":"Re: scan","body":"Interested, can you send pricing?"}' \
  | jq -e '.category == "HOT_PRICE" and (.draft_response | length) > 0' > /dev/null
```

Expected output:
Simulated reply classified and drafted in single workflow execution.

Description:
W6 receives inbound parsed reply from W3. Calls S012 classifier. Calls S013 draft generator. Stores both in reply_classifications and response_drafts tables. Triggers W10 (notification) to surface in Slack + Telegram with draft response and approval buttons.

Failure mode: Classifier confidence <0.7. Resolution: Routes to MANUAL_REVIEW queue, surfaces to Aman without auto-draft.

Status: [ ] TODO

---

### Task 3.2.4: Hard stop on reply triple-layered

Files: W2 node 2.2, W4 node 4.3, W7 node 7.5 (all guard layers)
Owner: Claude
Prerequisite: 1.2.5, 1.5.1, 1.5.2
Estimated time: 30 minutes

Verification:
```
# Insert lead, mark replied. Trigger W2, W4, W7. Verify no sends fire.
TEST_ID=$(psql "$NEON_URL" -tA -c "INSERT INTO leads (status, replied, next_touch_date, sector, email) VALUES ('replied', TRUE, CURRENT_DATE, 'hospitality', 'triple-guard-test@example.com') RETURNING id")
sleep 10
COUNT=$(psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sends WHERE lead_id = $TEST_ID")
psql "$NEON_URL" -tA -c "DELETE FROM leads WHERE id = $TEST_ID"
test "$COUNT" = "0"
```

Expected output:
Replied lead receives zero sends.

Description:
Defensive: every workflow that sends checks replied flag.
- W2: SELECT ... WHERE replied = FALSE
- W4: SELECT ... WHERE replied = FALSE AND status NOT IN ('replied', ...)
- W7: only sends to leads with open_score >= 4, but checks replied first

Failure mode: One workflow bypasses guard via direct SQL. Resolution: All sends go through compose-body skill which checks centrally.

Status: [ ] TODO

---

### Task 3.2.5: Reply-rate degradation auto-pause

Files: scripts/template-health.sh, n8n weekly cron
Owner: Claude
Prerequisite: 3.1.3, 3.1.1
Estimated time: 30 minutes

Verification:
```
# Simulate variant with poor performance, run health check, verify retired
psql "$NEON_URL" -c "INSERT INTO template_variants (variant_code, sector, touch, variant_letter, approach_type, subject_options, body_template, word_count_target, sends_count, replies_count, reply_rate_7d) VALUES ('test-poor-v1', 'hospitality', 0, 'A', 'value', ARRAY['test'], 'test body', 165, 200, 0, 0.0)"
bash scripts/template-health.sh
RETIRED=$(psql "$NEON_URL" -tA -c "SELECT retired_at FROM template_variants WHERE variant_code = 'test-poor-v1'")
psql "$NEON_URL" -c "DELETE FROM template_variants WHERE variant_code = 'test-poor-v1'"
test -n "$RETIRED"
```

Expected output:
Poor-performing variant auto-retired.

Description:
Weekly cron runs template-health.sh. For each sector + touch combination:
- Compute reply_rate_7d for each active variant
- If a variant has sends_count >= 100 AND reply_rate_7d in bottom quartile: mark retired_at = NOW(), set retire_reason
- If sector + touch now has < 3 active variants: copy a winning variant from another sector + touch as candidate

Telegram alert: "Template variant {code} retired. Reply rate {rate}%. Replaced with {new_code}."

Failure mode: Premature retirement at low sample size. Resolution: Require sends_count >= 100 minimum.

Status: [ ] TODO

---

### Task 3.3.1: Cold approach hybrid by sector

Files: src/lib/sector-config/approach-routing.json
Owner: Claude
Prerequisite: 3.1.1
Estimated time: 30 minutes

Verification:
```
jq -e '.legal.approach == "permission" and .hospitality.approach == "value-first" and .ecommerce.approach == "curiosity"' src/lib/sector-config/approach-routing.json
```

Expected output:
JSON correctly assigns approach type per sector.

Description:
Per sector approach mapping:
- Legal: permission framing (Template A from EMAIL-TEMPLATES.md)
- Financial Services: permission framing
- Real Estate: permission framing
- Healthcare: value-first
- Hospitality: value-first
- Wellness: value-first
- E-commerce: curiosity hook
- SaaS: curiosity hook
- Professional Services: hybrid
- Education: hybrid
- Personal Brand: status framing (Template A.V3)

Compose-body picks template based on this mapping.

Failure mode: Aman wants different default. Resolution: Editable JSON, override per-lead also supported.

Status: [ ] TODO

---

### Task 3.3.2: Switching-agencies challenge template seeded

Files: Email template A.V1/V2/V3 from EMAIL-TEMPLATES.md → template_variants table
Owner: Claude
Prerequisite: 3.1.1
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM template_variants WHERE variant_code LIKE 'switching-agencies-v%'" | grep -q "^3$"
```

Expected output:
3 switching-agencies variants seeded (V1, V2, V3).

Description:
Insert into template_variants:
- 'switching-agencies-v1' (legal sector, touch 0, value-first 175w)
- 'switching-agencies-v2' (any warm-engaged, touch 1, 95w)
- 'switching-agencies-v3' (partner-grade, touch 0, status 145w)

These are the new templates you commissioned. Live in DB ready for compose-body to use.

Failure mode: Body template too long for DB column. Resolution: TEXT column handles up to 1GB, no issue.

Status: [ ] TODO

---

### Task 3.3.3: Touch 0 body composition end-to-end test

Files: compose-body output verified
Owner: Claude
Prerequisite: 3.1.1-3.2.4, all 3.3.x
Estimated time: 20 minutes

Verification:
```
# Compose 10 test bodies across sectors, verify all pass quality checks
node $HOME/code/tamazia-cowork-skills/S001-compose-body/test/end-to-end.js | \
  jq -e '.passed == 10 and .total == 10' > /dev/null
```

Expected output:
10/10 end-to-end compositions pass all quality gates.

Description:
Test suite generates 10 fictional leads across 10 sectors. Composes touch 0 body for each. Each output must:
- Be 150-180 words (touch 0 target)
- Sign off with alias first name
- Include compliance disclaimer
- Pass forbidden-phrase-checker
- Use sector-appropriate approach (permission/value/curiosity)
- Include personalisation tokens (firm, first name, sector, etc.)
- Reference at least one specific finding (placeholder OK for test)

Failure mode: One sector produces non-compliant output. Resolution: Debug specific sector template, fix, re-test.

Status: [ ] TODO

---

### Task 3.4.1: Subject line A/B test infrastructure

Files: ~/code/tamazia-cowork-skills/S011-subject-line-ab/
Owner: Claude
Prerequisite: 3.1.1
Estimated time: 45 minutes

Verification:
```
# 3 different variants used across 30 test leads
node $HOME/code/tamazia-cowork-skills/S011-subject-line-ab/test/distribution.js | \
  jq -e '.unique_subjects >= 3' > /dev/null
```

Expected output:
SHA1-deterministic variant selection produces at least 3 unique subjects across diverse leads.

Description:
S011 picks subject variant via SHA1(lead.id) mod 3. Touch 0: one of 3 sector subjects. Touch 1: "Re: {original subject}". Touch 2: new value-drop subject from sector pool. Touch 3: "Closing your file at Tamazia" (fixed).

Logs variant chosen, compose-body integrates.

Failure mode: Hash distribution skewed. Resolution: Use better-distributed hash (CRC32 or MurmurHash).

Status: [ ] TODO

---

### Task 3.4.2: Subject line constraints enforced

Files: ~/code/tamazia-cowork-skills/S011-subject-line-ab/scripts/validate.js
Owner: Claude
Prerequisite: 3.4.1
Estimated time: 15 minutes

Verification:
```
node -e "
const v = require('$HOME/code/tamazia-cowork-skills/S011-subject-line-ab/scripts/validate.js');
// Should reject: too long, ALL CAPS, contains '!!!', emoji, 'free' prominent
if (v.check('Quick comparison test for Tamazia') && 
    !v.check('FREE AUDIT!!! 🎉🎉') &&
    !v.check('This is a way too long subject line that goes past 60 characters definitely')) process.exit(0);
process.exit(1);
"
```

Expected output:
Validator accepts good subjects, rejects bad.

Description:
Constraints from S5 analysis: max 60 chars, no ALL CAPS, no triple punctuation, no emoji, no spam triggers ('free' in first position, '$', '£', '!!!').

S011 validates before returning subject. Reject + retry with different variant if fails.

Failure mode: All sector variants fail constraints. Resolution: Re-author sector pitches, ensure all subjects pass.

Status: [ ] TODO

---

### Task 3.5.1: Slack notification with full reply context

Files: n8n W10 templates, Slack Block Kit JSON
Owner: Claude
Prerequisite: 3.2.3
Estimated time: 45 minutes

Verification:
```
# Trigger test reply, verify Slack notification has all required fields
curl -s -X POST "$N8N_URL/webhook-test/simulate-reply" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","body":"Send pricing"}'
# Manual: verify Slack channel #tamazia-replies has new message with lead context + draft response + buttons
test -f confirmations/slack-notification-tested.txt
```

Expected output:
Slack notification visually verified with all components.

Description:
Block Kit JSON template per category. Components:
- Header: category emoji + lead name + company
- Context: sector | open count | touch count
- Reply excerpt (first 300 chars)
- Divider
- Pre-drafted response (full text in monospace)
- Action buttons: Approve & Send | Edit | Suppress | Snooze 24h | Hand to Aman

Aman creates confirmations/slack-notification-tested.txt to confirm visual.

Failure mode: Block Kit JSON malformed. Resolution: Use Slack Block Kit Builder to validate.

Status: [ ] TODO

---

### Task 3.5.2: Telegram parallel notification

Files: n8n W10 Telegram nodes
Owner: Claude
Prerequisite: 1.6.1, 3.2.3
Estimated time: 20 minutes

Verification:
```
# Same test reply, verify Telegram receives parallel notification
curl -s -X POST "$N8N_URL/webhook-test/simulate-reply" -d '{"from":"test@example.com","body":"Send pricing"}'
sleep 5
# Manual verify via Telegram
test -f confirmations/telegram-notification-tested.txt
```

Expected output:
Telegram receives parallel P0/P1 notification.

Description:
For P0 events (HOT, HOSTILE, LEGAL_THREAT): Telegram + Slack both fire.
For P1 events (WARM, OBJECTION): Slack only.
For P2 events (NURTURE, OOO): batched in morning Telegram digest.

Markdown formatting in Telegram with action context.

Failure mode: Telegram message exceeds 4096 chars. Resolution: Split into multiple messages.

Status: [ ] TODO

---

### Task 3.5.3: 120-second recall countdown

Files: src/lib/approval/recall-countdown.js, n8n approval workflow
Owner: Claude
Prerequisite: 3.5.1
Estimated time: 30 minutes

Verification:
```
# Test approval flow: approve, see countdown, cancel within 120 sec
node $HOME/code/tamazia-cowork-skills/test/recall-flow.js | \
  jq -e '.canceled_within_window == true' > /dev/null
```

Expected output:
Cancel within 120 sec successfully halts send.

Description:
On approval button click: schedule send for 120 sec future. Display countdown in Slack thread ("Sending in 117s... 116s..."). Cancel button visible in countdown message. If cancel clicked before timer: send aborted, logged to approval_cancellations.

Failure mode: User clicks approve again, second send queued. Resolution: De-dupe by approval_id, only one pending send per reply.

Status: [ ] TODO

---

### Task 3.6.1: Sourcing channel attribution tracking

Files: migrations/2026-05-18-sourcing-attribution.sql, leads.sourcing_channel column
Owner: Claude
Prerequisite: 3.1.1
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='sourcing_channel'" | grep -q "sourcing_channel" && \
psql "$NEON_URL" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='sourcing_api'" | grep -q "sourcing_api"
```

Expected output:
Columns exist.

Description:
Add columns: sourcing_channel (companies_house | meta_ads | hunter | apollo | google_places | manual | referral | etc.), sourcing_api (specific API used). Phase 7 sourcing populates these. Phase 13 reporting analyses which channels produce best conversion to client.

Failure mode: Existing leads have NULL. Resolution: Default 'unknown', backfill where possible.

Status: [ ] TODO

---

### Task 3.7.1: A/B test reporting query view

Files: src/lib/reports/template-performance.sql
Owner: Claude
Prerequisite: 3.1.1, 3.1.3
Estimated time: 20 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT 1 FROM template_variants v JOIN sends s ON s.template_variant_id = v.id GROUP BY v.id LIMIT 1" > /dev/null
```

Expected output:
Reporting query runs without error.

Description:
View definition aggregating: per sector + touch + variant: sends count, opens, replies, reply rate 7d/30d, statistical significance vs other variants. Used by S008 personalisation tracker and chief-of-staff weekly review.

Failure mode: Query slow at scale. Resolution: Add indices on sends.template_variant_id and sends.sent_at.

Status: [ ] TODO

---

### Task 3.8.1: Phase 3 sign-off

Files: confirmations/phase-3-complete.txt
Owner: Both
Prerequisite: All 3.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 3
```

Status: [ ] TODO

---

## PHASE 3 EXIT GATE

```bash
bash scripts/verify-phase.sh 3
```

Returns exit 0 only when:
- Template variant tracker live, A/B test infrastructure operational
- 10 critical compose-body fixes verified (sign-off, spelling, language, titles, normalisation, time-of-day, unsubscribe, footer)
- Reply intent classifier ≥90% accurate on 20-reply test suite
- 130 response templates seeded (13 categories × 10 sectors)
- W6 wired to classify + draft + notify end-to-end
- Hard stop on reply triple-layered (W2, W4, W7)
- Reply-rate degradation auto-pause working
- Cold approach hybrid by sector configured
- Switching-agencies challenge templates seeded
- Subject line A/B with constraints enforced
- Slack notification template per category with action buttons
- Telegram parallel notification for P0/P1
- 120-second recall countdown working
- Sourcing channel attribution columns added
- A/B test reporting query view operational

Phase 4 locked until this passes.

End of Phase 3.
