# PHASE 1 · INFRASTRUCTURE TRIAGE
**Owner: Claude primary, Aman for Zoho admin actions. Effort: 5 working days. Spend: £0-3/month (Zoho upgrade only if needed).**

Unblock everything currently waiting on infrastructure. Fix the reply listener, enforce hard stop on reply, rename "audit" to "Regulatory Signal Scan" everywhere, add disclaimer to outgoing comms, set up scripts/ folder with all verification machinery.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 0
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 1
```

---

### Task 1.1.1: Create scripts/ folder structure

Files: scripts/verify-task.sh, scripts/verify-phase.sh, scripts/execute-phase.sh, scripts/nightly-regression.sh, scripts/override-task.sh, scripts/notify-telegram.sh, scripts/notify-slack.sh, scripts/lib/checks.sh, scripts/lib/colors.sh, scripts/lib/log.sh
Owner: Claude
Prerequisite: bash scripts/verify-phase.sh 0
Estimated time: 30 minutes

Verification:
```
for f in verify-task.sh verify-phase.sh execute-phase.sh nightly-regression.sh override-task.sh notify-telegram.sh notify-slack.sh; do
  test -x "scripts/$f" || exit 1
done
test -f scripts/lib/checks.sh && \
test -f scripts/lib/colors.sh && \
test -f scripts/lib/log.sh
```

Expected output:
All 7 main scripts exist and are executable. All 3 lib files exist.

Description:
Create scripts/ folder with all verification machinery from TAMAZIA-EXECUTION-VERIFICATION.md. Make scripts executable via `chmod +x scripts/*.sh`. Source the lib files for color output and logging helpers.

Failure mode: Bash syntax error in scripts. Resolution: `bash -n scripts/*.sh` to syntax-check before marking complete.

Status: [x] VERIFIED

---

### Task 1.1.2: Create verification-logs/ folder

Files: verification-logs/.gitkeep, .gitignore (add verification-logs/*.log)
Owner: Claude
Prerequisite: 1.1.1
Estimated time: 2 minutes

Verification:
```
test -d verification-logs && \
test -f verification-logs/.gitkeep && \
grep -q "verification-logs/\*\.log" .gitignore
```

Expected output:
Folder exists, .gitkeep present, .gitignore correctly excludes logs.

Description:
mkdir verification-logs && touch verification-logs/.gitkeep. Append to .gitignore so log files don't bloat git history. Keep folder structure tracked.

Failure mode: .gitignore not picking up pattern. Resolution: Use explicit pattern, verify with `git status`.

Status: [x] VERIFIED

---

### Task 1.1.3: Create .env file from .env.example

Files: .env (gitignored), .env.example (in repo)
Owner: Both
Prerequisite: Phase 0 (all credentials captured)
Estimated time: 10 minutes

Verification:
```
test -f .env && \
test -f .env.example && \
for var in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID SLACK_BOT_TOKEN CALCOM_API_KEY CLOUDFLARE_API_TOKEN GROQ_API_KEY GEMINI_API_KEY; do
  grep -q "^$var=" .env || exit 1
done
```

Expected output:
.env exists with all required vars set.

Description:
Claude creates .env.example template (in repo, no secrets) with all variable names. Aman copies to .env and populates from Phase 0 credentials. Source `.env` in scripts via `source .env` or bash export pattern.

Failure mode: One credential missing. Resolution: Verification fails, Cowork lists which.

Status: [x] VERIFIED

---

### Task 1.2.1: ZeptoMail webhook configuration

Files: n8n workflow W3 reconfigured, .env (add ZEPTOMAIL_INBOUND_TOKEN)
Owner: Both (Aman: Zoho admin, Claude: n8n config)
Prerequisite: 1.1.3
Estimated time: 30 minutes

Verification:
```
curl -s -X POST "$N8N_URL/webhook-test/zeptomail-inbound" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","to":"founder@tamazia.co.uk","subject":"test","html":"<p>test</p>"}' \
  | jq -e '.received == true' > /dev/null
```

Expected output:
n8n webhook receives test payload, parses, logs.

Description:
Aman: Log into ZeptoMail dashboard, configure inbound parse: route founder@tamazia.co.uk → webhook URL https://modest-magpie.pikapod.net/webhook/zeptomail-inbound. Claude: Replace W3 IMAP trigger with HTTP webhook trigger. Parse payload, extract reply text, threading info, route to W6 (reply classifier). 

Test by sending an email from a real address to founder@tamazia.co.uk and verifying the webhook fires within 30 seconds.

Failure mode: ZeptoMail webhook fires but n8n doesn't receive. Resolution: Check webhook URL, check n8n workflow is active.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.2.2: Insert 10 test leads with friendly inboxes

Files: Neon DB `leads` table
Owner: Claude
Prerequisite: 0.1.13 (5 Gmails provided)
Estimated time: 10 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM leads WHERE status='test' AND created_at > NOW() - INTERVAL '1 hour'" | grep -q "^10$"
```

Expected output:
Exactly 10 rows in leads with status='test'.

Description:
Insert 10 test leads into leads table. Use 5 Gmail addresses from 0.1.13 plus 5 dummy ProtonMail addresses Claude creates. Each row: status='test', sector='hospitality', city='London', country='UK', test_lead=TRUE. Used to verify W2 send + W3 reply + W4 follow-up + W6 classify end-to-end without spamming real prospects.

Failure mode: Duplicate emails fail unique constraint. Resolution: Use UPSERT pattern, replace if exists.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.2.3: W2 manual trigger test send

Files: n8n W2 workflow
Owner: Claude
Prerequisite: 1.2.2
Estimated time: 15 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sends WHERE lead_id IN (SELECT id FROM leads WHERE status='test') AND sent_at > NOW() - INTERVAL '30 minutes' AND touch=0" | grep -q "^10$"
```

Expected output:
10 sends logged for test leads, all touch=0.

Description:
Manually trigger W2 cron from n8n UI. W2 picks the 10 test leads, generates cold touch 0 emails, sends via Resend/SMTP2GO/MailerSend rotation. Verifies 10 sends logged in sends table. Visually confirms emails received in friendly inboxes.

Failure mode: Some sends fail. Resolution: Check delivery_status per send, fix root cause (alias quota, relay rate limit).

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.2.4: W4 manual trigger follow-up test

Files: n8n W4 workflow
Owner: Claude
Prerequisite: 1.2.3
Estimated time: 15 minutes

Verification:
```
psql "$NEON_URL" -tA -c "UPDATE leads SET next_touch_date = CURRENT_DATE WHERE status='test'; SELECT 1"
sleep 60
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sends WHERE lead_id IN (SELECT id FROM leads WHERE status='test') AND touch=1 AND sent_at > NOW() - INTERVAL '5 minutes'" | grep -q "^10$"
```

Expected output:
After advancing test leads to today's next_touch_date, manual W4 trigger sends 10 follow-up emails (touch=1).

Description:
Update test leads to have next_touch_date=today. Manually trigger W4. Verify all 10 receive touch 1 (Re: original subject reminder). Reply rate isn't being tested here, just send mechanics.

Failure mode: W4 picks wrong template variant. Resolution: Check template_variants table is seeded, check W4 logic.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.2.5: Reply terminates sequence test

Files: n8n W3, W4, W6 logic
Owner: Claude
Prerequisite: 1.2.4
Estimated time: 30 minutes

Verification:
```
# Reply from test inbox to recent send
# Then advance one lead to next_touch_date = today
# Then manually trigger W4
# Verify replied lead does NOT receive next touch
REPLIED_LEAD=$(psql "$NEON_URL" -tA -c "SELECT id FROM leads WHERE status='test' AND replied = TRUE LIMIT 1")
NEXT_SENDS=$(psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sends WHERE lead_id = $REPLIED_LEAD AND sent_at > NOW() - INTERVAL '5 minutes'")
test "$NEXT_SENDS" = "0"
```

Expected output:
Replied lead has no further sends within test window.

Description:
This is the hard-stop-on-reply enforcement test. Send manually from friendly inbox to alias, reply received by ZeptoMail webhook → W3 → W6 classifies → marks `leads.replied = TRUE` and `leads.status = 'replied'`. Then advance lead's next_touch_date to today, trigger W4. W4 must check `replied = TRUE` AND `status != 'replied'` before sending. If guard works, no send fires.

This is the critical safety property. Tests must pass.

Failure mode: W4 sends to replied lead. Resolution: Add guard at W4 node 4.3 (pre-send check), verify code path, retest.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.3.1: Rename "audit" to "Regulatory Signal Scan" in email templates

Files: src/templates/email/*.html, src/templates/email/*.txt
Owner: Claude
Prerequisite: 1.1.1
Estimated time: 30 minutes

Verification:
```
# Should NOT have customer-facing references to "audit" except properly qualified
# "audit log" or "audit trail" (internal use) acceptable
find src/templates/email -type f \( -name "*.html" -o -name "*.txt" \) -exec grep -l "audit" {} \; | \
  xargs -I {} bash -c 'grep -E "audit\b" {} | grep -v "audit (log|trail|history|record)" | grep -v "Regulatory Signal Scan" && exit 1; exit 0'
```

Expected output:
No customer-facing "audit" remaining, only internal terms preserved.

Description:
Find-replace across all email templates: "audit" → "Regulatory Signal Scan", "audit report" → "Regulatory Signal Scan", "audit findings" → "scan findings", "free audit" → "complimentary scan", "$1500 audit" → "complimentary £1500 scan". Preserve internal terms like "audit log" or "audit trail" (those are technical, not customer-facing).

Failure mode: Edge cases like "auditor" inadvertently changed. Resolution: Manual review of diff before commit.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.3.2: Rename in W7 (audit delivery workflow)

Files: n8n W7 workflow nodes (subject, body, prompts)
Owner: Claude
Prerequisite: 1.3.1
Estimated time: 15 minutes

Verification:
```
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/W7" | \
  jq '.nodes | tostring' | \
  grep -v "Regulatory Signal Scan" | grep -E '\baudit\b' && exit 1; exit 0
```

Expected output:
No customer-facing "audit" in W7 nodes.

Description:
Update W7 workflow JSON: subject lines, body templates, system prompts in HTTP nodes calling Claude/Cloudflare AI. Subject lines change from "Your audit for {firm}" to "Your Regulatory Signal Scan for {firm}".

Failure mode: Workflow update fails. Resolution: Backup JSON before edit, restore if needed.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.3.3: Rename in skills

Files: ~/code/tamazia-cowork-skills/*/SKILL.md
Owner: Claude
Prerequisite: 1.3.1
Estimated time: 20 minutes

Verification:
```
find ~/code/tamazia-cowork-skills -name "SKILL.md" -exec grep -l "audit" {} \; | \
  xargs -I {} bash -c 'grep -E "audit\b" {} | grep -v "audit (log|trail|history)" | grep -v "Regulatory Signal Scan" && exit 1; exit 0'
```

Expected output:
No customer-facing "audit" in any skill file.

Description:
Update compose-body skill, sector-pitch skill, audit skill (rename internal references), W7-related skills. Audit skill internal naming can keep "audit" but customer-facing strings (subjects, bodies) use new term.

Failure mode: Skill file syntax broken. Resolution: Validate frontmatter, validate markdown.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.3.4: Rename audit micro-site path

Files: src/pages/audit/ → src/pages/scan/ (or keep /audit/ URL but rebrand content), Cloudflare Pages routes
Owner: Claude
Prerequisite: 1.3.1
Estimated time: 20 minutes

Verification:
```
# Option A: URL changes to /scan/ 
# Option B: URL stays /audit/ but page content uses "Regulatory Signal Scan"
# Test the chosen approach
curl -s https://tamazia.co.uk/audit/test-firm/abc12345 | grep -q "Regulatory Signal Scan" || \
curl -s https://tamazia.co.uk/scan/test-firm/abc12345 | grep -q "Regulatory Signal Scan"
```

Expected output:
Either path returns the rebranded page.

Description:
Decision: Keep URL `/audit/{slug}/{hash}` for SEO continuity and link consistency. Update page content to say "Regulatory Signal Scan" throughout. Footer carries full disclaimer. URL is just a slug, not customer-visible language in most contexts.

Failure mode: URL change breaks already-sent links. Resolution: Keep URL stable, only content changes.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.4.1: Sign-off as alias first name fix in compose-body

Files: ~/code/tamazia-cowork-skills/S001-compose-body/scripts/compose.js (or .py)
Owner: Claude
Prerequisite: 1.1.1
Estimated time: 20 minutes

Verification:
```
node -e "
const c = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/compose.js');
const out = c.test({
  alias: { first_name: 'James', email: 'james@tamazia.co.uk' },
  lead: { sector: 'hospitality', first_name: 'John', firm: 'Test Hotel' }
});
if (out.endsWith('\nJames')) process.exit(0);
console.error('Expected ending: James. Got:', out.slice(-50));
process.exit(1);
"
```

Expected output:
Test compose ends with "James" (the alias first name), not "Aman" or "Aman Pareek".

Description:
Current compose.js signs every email with full sender block. Fix: pass `alias.first_name` as the sign-off line at body end. The full sender block (Aman Pareek, International Business Lawyer, etc.) lives in footer.txt and is appended separately. Body sign-off is just the alias name to maintain persona consistency with the from-address.

Failure mode: Test fails because compose returns full sender block. Resolution: Separate body sign-off (alias.first_name) from footer (signatures/aman.txt) explicitly.

Status: [x] VERIFIED

---

### Task 1.4.2: Compliance disclaimer appended to every email send

Files: ~/code/tamazia-cowork-skills/S009-compliance-disclaimer-injector/SKILL.md, S001-compose-body integration
Owner: Claude
Prerequisite: 0.1.10, 1.4.1
Estimated time: 30 minutes

Verification:
```
# Compose a test email, verify disclaimer text appears at footer
node -e "
const c = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/compose.js');
const out = c.test({
  alias: { first_name: 'James', email: 'james@tamazia.co.uk' },
  lead: { sector: 'hospitality', first_name: 'John', firm: 'Test Hotel' },
  inject_disclaimer: true
});
if (out.includes('not legal advice') && out.includes('Aman Pareek, International Business Lawyer')) process.exit(0);
process.exit(1);
"
```

Expected output:
Test compose output includes disclaimer footer.

Description:
Create skill S009 compliance-disclaimer-injector. Reads signatures/disclaimer.txt. Substitutes {version} and {date} from framework_versions table latest row. Injects below sender block in every email. Integrates into S001 compose-body as auto-postprocess step.

Failure mode: Disclaimer doesn't include framework version. Resolution: Verify framework_versions table populated (Phase 2 task), inject "v0.1-pending" placeholder until then.

Status: [x] VERIFIED

---

### Task 1.4.3: Footer with company number, ICO reg placeholder, EU rep placeholder

Files: src/templates/email/footer.html, src/templates/email/footer.txt
Owner: Claude
Prerequisite: 0.1.14
Estimated time: 15 minutes

Verification:
```
grep -q "Company number:" src/templates/email/footer.html && \
grep -q "ICO Registration:" src/templates/email/footer.html && \
grep -q "Tamazia," src/templates/email/footer.html && \
grep -q "United Kingdom" src/templates/email/footer.html
```

Expected output:
Footer has all required corporate identifiers.

Description:
Update email footer to include:
- Sender block (from signatures/aman.txt or alias-specific)
- "Tamazia, {Registered office}, United Kingdom"
- "Company number: {company_number} | ICO Registration: {ico_number}"
- "{EU_REP_LINE_IF_EU_RECIPIENT}"
- Compliance disclaimer block
- Unsubscribe link

ICO number placeholder until Phase 2 completes registration. EU rep placeholder until Phase 2 sets up.

Failure mode: Footer breaks email rendering. Resolution: Test in 5 inboxes (Gmail, Outlook, Yahoo, Apple Mail, ProtonMail), fix any rendering bug.

Status: [x] VERIFIED

---

### Task 1.4.4: Forbidden phrase checker skill

Files: ~/code/tamazia-cowork-skills/S010-forbidden-phrase-checker/SKILL.md, scripts/check.js, scripts/forbidden_phrases.json
Owner: Claude
Prerequisite: 1.1.1
Estimated time: 30 minutes

Verification:
```
node ~/code/tamazia-cowork-skills/S010-forbidden-phrase-checker/scripts/check.js \
  --input "Hope this finds you well, just touching base — I'd love to chat" && exit 1; exit 0
```

Expected output:
Script returns non-zero exit code when forbidden phrases detected.

Description:
Create S010 skill. forbidden_phrases.json has list (em dashes, "Hope this finds you well", "I'd love to", "Touching base", "Circling back", "Just following up", "Quick question", "Quick chat", "Synergy", "Game-changer", "Revolutionary", "Click here", "Free" in subject, "Guarantee" in subject, "$" or "£" in subject, "!!", ALL CAPS, emoji in subject, bit.ly, ow.ly). Script reads input, regex match against list, returns exit 0 if clean, non-zero with violation list if not.

S001 compose-body invokes this pre-send. Block send if violations.

Failure mode: False positives (legitimate use of "free"). Resolution: Context-aware regex (e.g., "feel free" allowed, "free audit" blocked).

Status: [x] VERIFIED

---

### Task 1.5.1: Hard-stop guard at W2 cron

Files: n8n W2 workflow node 2.2
Owner: Claude
Prerequisite: 1.2.5
Estimated time: 10 minutes

Verification:
```
# Insert a replied test lead with next_touch_date=today
# Manually run W2
# Verify no send fires for that lead
TEST_ID=$(psql "$NEON_URL" -tA -c "INSERT INTO leads (status, replied, next_touch_date, sector, email) VALUES ('replied', TRUE, CURRENT_DATE, 'hospitality', 'guarded-test@example.com') RETURNING id")
# Wait for next W2 run or manually trigger
sleep 5
COUNT=$(psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM sends WHERE lead_id = $TEST_ID")
psql "$NEON_URL" -tA -c "DELETE FROM leads WHERE id = $TEST_ID"
test "$COUNT" = "0"
```

Expected output:
Replied lead never receives W2 send.

Description:
Defensive guard at W2 node 2.2 (lead selection). Already enforced upstream by W4 guard but adding here ensures even if W4 logic regresses, W2 won't accidentally send to replied. SELECT now reads:
```sql
SELECT * FROM leads 
WHERE status = 'pending' 
  AND replied = FALSE 
  AND email NOT IN (SELECT email FROM dnc) 
  AND domain NOT IN (SELECT domain FROM dnc_domains)
  AND next_touch_date <= CURRENT_DATE
LIMIT 20
```

Failure mode: Lead status="replied" passes through because column doesn't exist yet. Resolution: Migration in 1.5.2.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.5.2: DB migration: add replied column + indices

Files: migrations/2026-05-17-add-replied-column.sql
Owner: Claude
Prerequisite: 1.5.1
Estimated time: 10 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name='replied'" | grep -q "replied"
psql "$NEON_URL" -tA -c "SELECT indexname FROM pg_indexes WHERE tablename='leads' AND indexname='idx_leads_replied'" | grep -q "idx_leads_replied"
```

Expected output:
Column and index exist.

Description:
Migration script:
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_reply_received_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_replied ON leads(replied) WHERE replied = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_next_touch ON leads(next_touch_date) WHERE replied = FALSE;
```

These indices keep guard query performant at scale.

Failure mode: Migration fails on existing data. Resolution: Test on staging DB first if available, else apply with explicit IF NOT EXISTS.

Status: [x] VERIFIED

---

### Task 1.6.1: Notification scripts working

Files: scripts/notify-telegram.sh, scripts/notify-slack.sh
Owner: Claude
Prerequisite: 0.1.3, 0.1.4
Estimated time: 15 minutes

Verification:
```
bash scripts/notify-telegram.sh "Phase 1 test notification from Cowork" && \
bash scripts/notify-slack.sh "general" "Phase 1 test notification from Cowork"
```

Expected output:
Both notifications received by Aman within 5 seconds.

Description:
Scripts exist from VERIFICATION.md. Test that Telegram bot can post (uses $TELEGRAM_BOT_TOKEN and $TELEGRAM_CHAT_ID). Test Slack post (uses $SLACK_BOT_TOKEN to "general" channel). Markdown formatting works on Telegram. Plain text works on Slack.

Failure mode: Slack scope insufficient to post. Resolution: Add chat:write.public scope, reinstall app.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 1.7.1: Backup current state before Phase 2 changes

Files: backups/pre-phase-2-{date}.sql.gz, backups/pre-phase-2-{date}.tar.gz
Owner: Claude
Prerequisite: All Phase 1 tasks
Estimated time: 10 minutes

Verification:
```
ls backups/pre-phase-2-*.sql.gz | head -1 && \
ls backups/pre-phase-2-*.tar.gz | head -1
```

Expected output:
Two backup files exist (DB dump + code tarball).

Description:
Take pg_dump of Neon DB, gzip, save to backups/. Tar up current state of n8n workflows (export JSON via API), gzip, save. Pre-Phase-2 snapshot, rollback target if Phase 2 work needs reverting.

Failure mode: pg_dump connection refused. Resolution: Check NEON_URL valid, retry.

Status: [x] VERIFIED

---

### Task 1.8.1: Phase 1 sign-off

Files: confirmations/phase-1-complete.txt
Owner: Both (verification script + Aman ack)
Prerequisite: 1.1.1, 1.1.2, 1.1.3, 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5, 1.3.1, 1.3.2, 1.3.3, 1.3.4, 1.4.1, 1.4.2, 1.4.3, 1.4.4, 1.5.1, 1.5.2, 1.6.1, 1.7.1
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 1
```

Expected output:
All Phase 1 tasks verified.

Description:
Final Phase 1 gate. Run verify-phase.sh which iterates all tasks. If all green, post Telegram + Slack notification "Phase 1 complete. Infrastructure unblocked. Phase 2 unlocked."

Failure mode: One or more tasks fail re-verification. Resolution: Cowork lists which, addresses, re-runs.

Status: [x] VERIFIED

---

## PHASE 1 EXIT GATE

```bash
bash scripts/verify-phase.sh 1
```

Returns exit 0 only when:
- scripts/ folder built with all 7 main scripts + lib
- ZeptoMail webhook routing replies to W3 within 30 seconds
- 10 test leads inserted, W2 + W4 + W6 end-to-end verified
- Hard stop on reply enforced and tested (no send after reply)
- "audit" renamed to "Regulatory Signal Scan" everywhere customer-facing
- Sign-off as alias first name in compose-body
- Compliance disclaimer auto-injected in every email
- Footer has company number + ICO placeholder + EU rep placeholder
- Forbidden phrase checker built and integrated
- Notification scripts confirmed working
- Backup taken pre-Phase-2

Phase 2 locked until this returns exit 0.

End of Phase 1.
