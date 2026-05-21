# PHASE 11 · CHIEF OF STAFF + NOTIFICATIONS + COORDINATION
**Owner: Claude. Effort: 5 working days. Spend: £0.**

Build the cross-pipeline orchestrator. Slack channel architecture, Telegram command suite, gap scanner running every 3 days, decision log, multi-stakeholder threading, conflict checks across Tamazia and LexQuity contacts.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 10
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 11
```

---

### Task 11.1.1: Slack channel architecture

Files: scripts/slack-channels-setup.sh
Owner: Both (Aman: in Slack workspace, Claude: setup script)
Prerequisite: Phase 10 complete
Estimated time: 30 minutes

Verification:
```
curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" "https://slack.com/api/conversations.list" | \
  jq -e '[.channels[] | select(.name | IN("aman-cos","tamazia-pipeline","tamazia-replies","tamazia-deploys"))] | length == 4'
```

Expected output:
All 4 named channels exist.

Description:
Create 4 Slack channels:
- #aman-cos (chief of staff actions, gap scans, decisions log)
- #tamazia-pipeline (lead flow, daily digests, new audits delivered)
- #tamazia-replies (incoming replies awaiting approval, P0/P1 notifications)
- #tamazia-deploys (deploy notifications, regression alerts, CI failures)

Permissions: Aman + Tamazia COS bot. Add channel descriptions defining purpose.

Failure mode: Channel name taken. Resolution: Add suffix (e.g., #tamazia-pipeline-v2).

Status: [ ] TODO

---

### Task 11.1.2: Telegram bot command suite

Files: n8n W18 telegram-command-handler
Owner: Claude
Prerequisite: 0.1.3
Estimated time: 60 minutes

Verification:
```
# Send /status command, verify reply
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" -d "text=/status"
sleep 10
# Manual: verify bot replied with pipeline status
test -f confirmations/telegram-commands-tested.txt
```

Expected output:
Bot responds to commands.

Description:
W18 webhook receives Telegram messages, parses commands:
- /status → pipeline summary (today's sends/opens/replies/bookings)
- /pause {workflow} → halt specific workflow (with confirmation)
- /resume {workflow} → restart paused workflow
- /audit {domain} → trigger audit generation for domain
- /override {task-id} {reason} → manual task override
- /escalate {issue} → P0 Slack alert
- /digest → on-demand morning digest
- /alias {alias-id} → alias health detail
- /lead {lead-id} → lead context summary
- /help → command list

Each command requires confirmation step for destructive operations.

Failure mode: Command parsing breaks on edge characters. Resolution: Regex validation, return usage hint on invalid.

Status: [ ] TODO

---

### Task 11.1.3: Slack ↔ n8n full integration

Files: n8n W19 slack-interactions
Owner: Claude
Prerequisite: 11.1.1
Estimated time: 60 minutes

Verification:
```
# Trigger interactive button click, verify n8n receives
curl -s -X POST "$N8N_URL/webhook-test/slack-interactions" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'payload={"type":"block_actions","actions":[{"action_id":"approve_reply","value":"test-1"}]}'
sleep 2
test -f confirmations/slack-buttons-tested.txt
```

Expected output:
Slack button click handled by n8n.

Description:
Slack app configured with interactivity URL: webhook to n8n. Handles:
- Approve/Edit/Suppress/Snooze buttons on reply notifications
- /tamazia-pipeline slash command → pipeline summary
- /tamazia-leads slash command → top 10 priority
- /tamazia-audit {domain} slash command → trigger audit
- /tamazia-suppress {email} slash command → DNC add

W19 routes each action to appropriate downstream workflow.

Failure mode: Slack signing secret validation fails. Resolution: Strict timestamp + HMAC check on every request.

Status: [ ] TODO

---

### Task 11.2.1: 120-second recall countdown UI

Files: src/lib/slack-blocks/recall-countdown.ts
Owner: Claude
Prerequisite: 3.5.3, 11.1.3
Estimated time: 30 minutes

Verification:
```
# Trigger approval, see countdown update in real time, cancel
node tests/recall-countdown-e2e.js | jq -e '.canceled_at_t < 120'
```

Expected output:
Cancel triggers within 120-second window.

Description:
On reply approval click:
- Slack message edited to show "Sending in 120s..."
- n8n schedules send at +120s
- Every 30s, message updates ("Sending in 90s..." etc.)
- "Cancel" button visible throughout
- At t=120s: if not canceled, send fires, message updates "Sent ✓"
- If cancel clicked before: send aborted, message "Canceled by Aman", logged

Visual: prominent countdown, big cancel button.

Failure mode: Slack rate limit on message edits. Resolution: Update every 30s not every second, well within limit.

Status: [ ] TODO

---

### Task 11.2.2: Notification routing logic

Files: src/lib/notifications/router.ts
Owner: Claude
Prerequisite: 11.1.1, 11.1.2
Estimated time: 45 minutes

Verification:
```
node -e "
const r = require('./src/lib/notifications/router.ts');
const routes = r.route({type: 'reply', category: 'HOT_BOOK'});
if (routes.includes('slack') && routes.includes('telegram')) process.exit(0);
process.exit(1);
"
```

Expected output:
Multi-channel routing for P0 events.

Description:
Per event type, route to appropriate channels:

| Event | Slack | Telegram |
|---|---|---|
| HOT_BOOK reply | #tamazia-replies | YES (instant) |
| HOT_PRICE reply | #tamazia-replies | YES (instant) |
| HOSTILE/LEGAL_THREAT | #aman-cos | YES (P0 emoji) |
| WARM/NURTURE | #tamazia-replies | morning digest |
| Bounce alerts | #tamazia-replies | morning digest |
| Alias suspended | #aman-cos | YES |
| Deploy success | #tamazia-deploys | NO |
| Deploy failure | #tamazia-deploys | YES |
| Daily digest | #tamazia-pipeline | morning + evening |
| Gap scan results | #aman-cos | morning batch |

Status: [ ] TODO

---

### Task 11.2.3: Morning and evening digest

Files: n8n W13 expanded
Owner: Claude
Prerequisite: 11.2.2, 7.6.2
Estimated time: 30 minutes

Verification:
```
# Trigger morning digest manually, verify both channels
curl -s -X POST "$N8N_URL/webhook-test/morning-digest" -d '{"manual":true}'
sleep 5
test -f confirmations/digest-routing-tested.txt
```

Expected output:
Both Slack #tamazia-pipeline and Telegram receive morning digest.

Description:
Morning 07:00:
- Slack #tamazia-pipeline (detailed)
- Telegram (concise, 500 chars max)

Evening 18:00:
- Slack #tamazia-pipeline (day's outcomes, tomorrow's previews)
- Telegram (short summary)

Both pull from same data: leads count by status, sends today, replies categorised, bookings, alias health.

Status: [ ] TODO

---

### Task 11.3.1: Gap scanner skill (S020) - the chief of staff scan

Files: ~/code/tamazia-cowork-skills/S020-gap-scanner/
Owner: Claude
Prerequisite: 11.2.3
Estimated time: 90 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S020-gap-scanner/scripts/scan.sh
test -f reports/gap-scan-$(date +%Y-%m-%d).md && \
grep -q "Gaps identified:" reports/gap-scan-$(date +%Y-%m-%d).md
```

Expected output:
Gap scan report generated with structured output.

Description:
S020 runs every 3 days (Mon/Thu 07:00):

Scans 8 categories:
1. Workflow errors last 72h (n8n executions failed)
2. Leads stuck >7 days no progression (status='pending' or 'contacted' too long)
3. Replies awaiting response >24 hours
4. Audits engaged but no booking >5 days
5. Aliases below 8/10 mail-tester
6. Template variants with declining reply rate
7. Cross-check Tamazia leads against LexQuity contacts (potential conflicts)
8. Open n8n workflow alerts

For each gap: severity ranking, root cause assessment, proposed fix.

Output: structured Markdown report to #aman-cos with 30 gaps + recommendations. Also written to reports/ folder for audit.

Failure mode: Too many gaps to action. Resolution: Top 10 priority surfaced upfront, full 30 in details.

Status: [ ] TODO

---

### Task 11.3.2: Decision log

Files: migrations/2026-05-24-decisions.sql, ~/code/tamazia-cowork-skills/S-decision-log/
Owner: Claude
Prerequisite: 11.3.1
Estimated time: 45 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM decisions" | xargs -I {} test {} -ge 1
```

Expected output:
Decisions table exists with entries.

Description:
Schema:
```sql
CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  summary VARCHAR(500) NOT NULL,
  rationale TEXT NOT NULL,
  source VARCHAR(100) NOT NULL,
  deciders TEXT[] NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'decided',
  linked_phase INTEGER,
  linked_task_id VARCHAR(50),
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT
);
```

Every major decision in this plan logged. Reviewable in Cowork artifact and Slack /tamazia-decisions command. Aman can mark a decision reversed (logs reversal with reason).

Seed: all top-line decisions from MASTER Section 0.

Failure mode: Decisions piled without rationale. Resolution: Schema requires rationale (NOT NULL).

Status: [ ] TODO

---

### Task 11.4.1: Cross-pipeline orchestration (Tamazia ↔ LexQuity)

Files: src/lib/orchestration/cross-company-check.ts
Owner: Claude
Prerequisite: 11.3.1
Estimated time: 45 minutes

Verification:
```
# Test: Aman's LexQuity investor contact accidentally in Tamazia outreach
node tests/cross-company-conflict.js | jq -e '.conflicts_detected >= 0'
```

Expected output:
Conflict check runs without errors.

Description:
Tamazia operates separately from LexQuity but shares Aman as principal. Risk: Tamazia outreach to a LexQuity investor or LexQuity advisor could embarrass Aman.

Cross-check on every Tamazia outreach:
1. Lead email or domain matches LexQuity contact table → halt, escalate to Aman
2. Lead is in LexQuity investor pipe → halt, manual review
3. Lead is LexQuity advisor → suppress + tag

LexQuity contacts table referenced read-only by Tamazia stack. Updates in LexQuity propagate within 1 hour.

Failure mode: LexQuity contacts table not yet built. Resolution: Build minimal stub, Aman seeds with key names manually.

Status: [ ] TODO

---

### Task 11.4.2: Multi-stakeholder thread integration

Files: S058 from Phase 9
Owner: Claude
Prerequisite: 11.4.1
Estimated time: 0 (verification)

Verification:
```
bash scripts/verify-task.sh 9.2.2
```

Status: [ ] TODO

---

### Task 11.5.1: Backup notification channels

Files: src/lib/notifications/fallback.ts
Owner: Claude
Prerequisite: 11.2.2
Estimated time: 30 minutes

Verification:
```
# Test: simulate Slack failure, verify Telegram still fires
node tests/notification-fallback.js | jq -e '.fallback_succeeded'
```

Expected output:
Fallback triggers when primary fails.

Description:
If Slack API returns error or times out:
- Try Telegram only
- If both fail: email Aman via Resend (last resort)
- Log failures in notification_failures table for diagnosis

If Telegram fails: try Slack only.
If both fail: log + email + retry every 5 min for 1 hour.

Status: [ ] TODO

---

### Task 11.6.1: Phase 11 sign-off

Files: confirmations/phase-11-complete.txt
Owner: Both
Prerequisite: All 11.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 11
```

Status: [ ] TODO

---

## PHASE 11 EXIT GATE

```bash
bash scripts/verify-phase.sh 11
```

Returns exit 0 only when:
- 4 Slack channels created (#aman-cos, #tamazia-pipeline, #tamazia-replies, #tamazia-deploys)
- Telegram bot command suite live (/status, /pause, /resume, /audit, /override, /escalate, /digest, /alias, /lead, /help)
- Slack ↔ n8n integration with button handling
- 120-second recall countdown live
- Notification routing logic by event type
- Morning + evening digest both channels
- Gap scanner skill running Mon/Thu, posting 30 gaps
- Decision log populated with seed decisions
- Cross-pipeline orchestration (Tamazia ↔ LexQuity)
- Backup notification channels with fallback

Phase 12 locked until this passes.

End of Phase 11.
