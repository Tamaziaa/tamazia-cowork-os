# PHASE 4 · WARMUP V6 WITH REAL REPLIES + ALIAS HEALTH GUARDIAN
**Owner: Claude. Effort: 5 working days. Spend: £0.**

Upgrade W1 with reply-from-receiver behaviour, integrate 5 real Gmail seedlist, build the no-email-if-at-risk guardian, add 10 anti-fingerprint layers, automate mail-tester monitoring. This makes Tamazia warmup compete with paid tools (Lemwarm, MailReach) at zero cost.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 3
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 4
```

---

### Task 4.1.1: W1b reply-from-receiver workflow

Files: n8n W1b workflow JSON, ~/code/tamazia-cowork-skills/S016-alias-health-monitor/
Owner: Claude
Prerequisite: Phase 3 complete
Estimated time: 60 minutes

Verification:
```
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_URL/api/v1/workflows/W1b" | jq -e '.active == true' > /dev/null
```

Expected output:
W1b workflow exists, is active.

Description:
Create new workflow W1b parallel to W1.
Trigger: 30-minute cron.
Steps:
1. Pick aliases with new unread warmup-flagged emails since last run
2. Detection: incoming message body_hash exists in `sends` table with kind='warmup' → it's our warmup
3. For each: 70% probability roll to generate reply
4. If reply: schedule send 4-24h later (random), insert into warmup_replies queue
5. Reply content picked from W1-Reply library (50 templates × 6 categories)
6. Reply sent from receiver alias to original sender alias with proper In-Reply-To threading
7. Receiver alias marks original as Starred/Important via IMAP if applicable

Failure mode: Reply loop (alias A replies to B replies to A replies to B...). Resolution: max thread depth 3.

Status: [ ] TODO

---

### Task 4.1.2: W1-Reply library (50 templates × 6 categories)

Files: migrations/2026-05-19-seed-warmup-replies.sql
Owner: Claude
Prerequisite: 4.1.1
Estimated time: 90 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM warmup_reply_templates" | xargs -I {} test {} -ge 300
```

Expected output:
At least 300 warmup reply templates (50 × 6).

Description:
6 categories: acknowledgment, question, follow-up, thanks, scheduling, casual.
50 templates each, total 300.

Examples (acknowledgment): "Got it, thanks." / "Noted." / "Acknowledged, will revert." / "Received."
Examples (question): "Quick question on that point." / "Could you clarify the timing?" / "What's your read on it?"
Examples (casual): "Hope your week is going well." / "How's Q3 looking?" / "Any plans for the bank holiday?"

Length variance 10-200 words. Mix formal/casual to match sender alias persona.

Failure mode: Templates feel robotic. Resolution: Human-write the first 30, AI-generate variations, human-review.

Status: [ ] TODO

---

### Task 4.1.3: Reply queue + scheduled delivery

Files: migrations/2026-05-19-warmup-replies.sql, n8n W1c workflow
Owner: Claude
Prerequisite: 4.1.1
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -c "INSERT INTO warmup_replies (from_alias_id, to_alias_id, reply_body, scheduled_at) VALUES (1, 2, 'test reply', NOW() + INTERVAL '1 minute')"
sleep 90
DELIVERED=$(psql "$NEON_URL" -tA -c "SELECT delivered_at FROM warmup_replies WHERE reply_body = 'test reply'")
psql "$NEON_URL" -c "DELETE FROM warmup_replies WHERE reply_body = 'test reply'"
test -n "$DELIVERED"
```

Expected output:
Scheduled reply delivered after scheduled time.

Description:
warmup_replies queue. W1c cron every 5 min checks for replies due. Sends each via assigned relay. Marks delivered_at. Logs to sends table (kind='warmup_reply').

Failure mode: Queue grows unbounded. Resolution: 24-hour TTL on undelivered entries.

Status: [ ] TODO

---

### Task 4.2.1: 5 Gmail seedlist integration

Files: aliases table, .env (GMAIL_APP_PASSWORD_1 through 5)
Owner: Both (Aman generates app passwords, Claude integrates)
Prerequisite: 0.1.13 (Gmail addresses provided)
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM aliases WHERE type='seedlist' AND status='active'" | xargs -I {} test {} -ge 5
```

Expected output:
5 seedlist aliases active.

Description:
Aman: For each of 5 Gmail accounts, enable 2FA, generate app-specific password (Google Account → Security → 2-Step Verification → App passwords → "Mail"). Names: gmail_seedlist_1 through 5.

Claude: Insert into aliases table with type='seedlist', engagement_role='active'. Store app passwords in env or secrets manager. n8n credentials for IMAP access to each Gmail.

W1b includes these in reply rotation. They look like real human inboxes (because they are).

Failure mode: Google flags app password gen as suspicious. Resolution: Generate one at a time over 1-2 days, never bulk.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 4.2.2: Warmup-Engage manual trigger skill

Files: ~/code/tamazia-cowork-skills/S-warmup-engage/SKILL.md
Owner: Claude
Prerequisite: 4.2.1
Estimated time: 20 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S-warmup-engage/SKILL.md
```

Expected output:
Skill file exists.

Description:
Manual-trigger skill for Aman to engage warmup activity from his real Gmail accounts (open emails, reply, mark important, star). Single Slack command "/tamazia-engage gmail1 5" engages 5 random unread warmup emails on gmail_seedlist_1 with realistic actions. Throttled to ≤5 actions/day per real account to stay below Google automation detection.

Failure mode: Aman doesn't run regularly. Resolution: Scheduled prompt in Telegram "Run /tamazia-engage today?"

Status: [ ] TODO

---

### Task 4.3.1: Alias health monitor table + skill

Files: migrations/2026-05-19-alias-health.sql, ~/code/tamazia-cowork-skills/S016-alias-health-monitor/
Owner: Claude
Prerequisite: Phase 3 complete
Estimated time: 45 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM alias_health WHERE checked_at > NOW() - INTERVAL '1 hour'" | xargs -I {} test {} -ge 30 && \
test -f $HOME/code/tamazia-cowork-skills/S016-alias-health-monitor/SKILL.md
```

Expected output:
Hourly snapshot for each alias exists.

Description:
Schema:
```sql
CREATE TABLE alias_health (
  id SERIAL PRIMARY KEY,
  alias_id INTEGER REFERENCES aliases(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mail_tester_score FLOAT,
  bounce_rate_7d FLOAT,
  complaint_rate_7d FLOAT,
  open_rate_7d FLOAT,
  reply_rate_7d FLOAT,
  status_recommended VARCHAR(20),
  reason TEXT
);
CREATE INDEX idx_alias_health_alias_time ON alias_health(alias_id, checked_at DESC);
```

S016 hourly cron: for each alias, compute 7-day rolling rates from sends + audit_events. Recommend status:
- score >=8.5, bounce <2%, complaint <0.1%, open >5% → active
- score 7-8.5 OR bounce 2-5% → warmup_only
- score <7 OR bounce >5% OR complaint >0.1% → rest
- 3 consecutive rest periods → retired

If recommended differs from current alias.status, auto-transition. Telegram alert on transitions.

Failure mode: Recently warmed-up alias hasn't sent enough for stats. Resolution: Require sends_count_7d >= 20 before any rest/retire transition.

Status: [ ] TODO

---

### Task 4.3.2: W2 and W4 only pick status=active

Files: W2 node 2.3, W4 node 4.4
Owner: Claude
Prerequisite: 4.3.1
Estimated time: 15 minutes

Verification:
```
# Create test alias in 'rest' status, verify W2 doesn't pick it
psql "$NEON_URL" -c "INSERT INTO aliases (email, first_name, status, warmup_day, type) VALUES ('rest-test@tamazia.co.uk', 'TestRest', 'rest', 30, 'cold') ON CONFLICT (email) DO UPDATE SET status='rest'"
# Manually trigger W2 and observe alias pick
ALIAS_USED=$(psql "$NEON_URL" -tA -c "SELECT alias_id FROM sends WHERE sent_at > NOW() - INTERVAL '5 minutes' ORDER BY sent_at DESC LIMIT 1")
REST_ID=$(psql "$NEON_URL" -tA -c "SELECT id FROM aliases WHERE email='rest-test@tamazia.co.uk'")
psql "$NEON_URL" -c "DELETE FROM aliases WHERE email='rest-test@tamazia.co.uk'"
test "$ALIAS_USED" != "$REST_ID"
```

Expected output:
Rest-status alias never picked.

Description:
W2 node 2.3 alias picker: `SELECT * FROM aliases WHERE status='active' AND warmup_day >= 14 AND ...`. Same for W4. Defensive check at pre-send confirms alias still active.

Failure mode: Race condition where alias flipped to rest after picked but before send. Resolution: Re-check at compose-body level immediately before sending.

Status: [ ] TODO

---

### Task 4.3.3: Telegram alert on alias status transition

Files: W11 notification trigger in S016
Owner: Claude
Prerequisite: 4.3.1, 1.6.1
Estimated time: 15 minutes

Verification:
```
# Trigger status transition by manipulating bounce rate
psql "$NEON_URL" -c "UPDATE alias_health SET bounce_rate_7d = 0.08 WHERE alias_id = (SELECT id FROM aliases WHERE status='active' LIMIT 1)"
# Run S016 manually
bash $HOME/code/tamazia-cowork-skills/S016-alias-health-monitor/scripts/check.sh
# Verify Telegram alert fires (manual)
test -f confirmations/alias-transition-alert-tested.txt
```

Expected output:
Manual verification of Telegram alert.

Description:
When S016 transitions an alias from active to rest (or worse), W11 fires Telegram notification:
> Alias `james@tamazia.co.uk` flipped to REST. Reason: bounce_rate 8.2% > 5% threshold. Last 7 days: 12 bounces / 145 sends. Auto-resuming in 48h.

Status: [ ] TODO

---

### Task 4.4.1: Anti-fingerprint v6 - 10 new layers

Files: ~/code/tamazia-cowork-skills/S-warmup-fingerprint-v6/
Owner: Claude
Prerequisite: 4.1.1
Estimated time: 90 minutes

Verification:
```
# Simulation: run 30 W1 cycles, verify collision rate 0%
node $HOME/code/tamazia-cowork-skills/S-warmup-fingerprint-v6/test/collision-test.js | \
  jq -e '.collision_rate == 0' > /dev/null
```

Expected output:
Zero collisions across 30-cycle simulation.

Description:
v6 adds 10 layers beyond v5:
1. Time-of-day variation per alias personality (early bird vs night owl)
2. Day-of-week weighting (Tue/Wed/Thu heavier, weekend lighter for B2B aliases)
3. Sender device User-Agent rotation (mobile vs desktop)
4. Signature variation (5 sig blocks per alias rotate)
5. Quote depth variation (top-post vs bottom-post vs no-quote)
6. Reply latency natural (no exact-hour replies)
7. Email length variance (20-300 words mix)
8. Punctuation rhythm variation (some use ellipses, some bullets, etc.)
9. Threading depth (some grow to 4-5, most stay 1-2)
10. Casual typo injection (1 typo per 10 emails, in non-critical words)

All controlled by run seed (Math.floor(Date.now()/1800000)) for reproducibility.

Failure mode: Typos make Tamazia look unprofessional in customer-facing. Resolution: ONLY in warmup, never in cold outreach. Different code path.

Status: [ ] TODO

---

### Task 4.5.1: Mail-tester runner skill (S023)

Files: ~/code/tamazia-cowork-skills/S023-mail-tester-runner/
Owner: Claude
Prerequisite: 4.3.1
Estimated time: 45 minutes

Verification:
```
# Run for one alias, expect score populated
ALIAS_ID=$(psql "$NEON_URL" -tA -c "SELECT id FROM aliases WHERE status='active' LIMIT 1")
bash $HOME/code/tamazia-cowork-skills/S023-mail-tester-runner/scripts/run.sh $ALIAS_ID
SCORE=$(psql "$NEON_URL" -tA -c "SELECT mail_tester_score FROM alias_health WHERE alias_id = $ALIAS_ID ORDER BY checked_at DESC LIMIT 1")
echo "$SCORE" | grep -qE '^[0-9]+(\.[0-9]+)?$'
```

Expected output:
Numeric score logged.

Description:
S023 weekly per alias:
1. Generate unique mail-tester address (mail-tester.com gives one per check)
2. Send test email from alias to that address
3. Wait 30 seconds
4. Scrape result page (https://www.mail-tester.com/{token})
5. Parse 0-10 score
6. Store in alias_health.mail_tester_score
7. Alert if score < 8

mail-tester.com is free but rate-limited. Stagger across aliases (1 per hour).

Failure mode: mail-tester rate-limited. Resolution: Reduce frequency to every other week per alias, prioritise lowest-scoring aliases.

Status: [ ] TODO

---

### Task 4.5.2: Postmaster Tools integration

Files: src/lib/monitoring/postmaster-tools.js
Owner: Both (Aman verifies domain in Google Postmaster, Claude pulls data)
Prerequisite: 0.1.1 (Tamazia domain confirmed)
Estimated time: 30 minutes (Aman) + 30 min (Claude)

Verification:
```
# Should return reputation data for tamazia.co.uk
node src/lib/monitoring/postmaster-tools.js | jq -e '.domain_reputation' > /dev/null
```

Expected output:
Postmaster Tools API returns domain reputation.

Description:
Aman: Verify tamazia.co.uk in Google Postmaster Tools (DNS TXT record).
Claude: API integration to pull reputation data daily. Log to domain_reputation table. Alert if reputation drops to "low" or "bad".

Failure mode: API rate-limited or auth issues. Resolution: Daily check sufficient, no need real-time.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 4.5.3: Microsoft SNDS integration

Files: src/lib/monitoring/microsoft-snds.js
Owner: Both
Prerequisite: 0.1.1
Estimated time: 30 minutes

Verification:
```
node src/lib/monitoring/microsoft-snds.js | jq -e '.ip_reputation' > /dev/null
```

Expected output:
Microsoft SNDS returns IP reputation for sending IPs.

Description:
Aman: Register Tamazia sending IPs in Microsoft Smart Network Data Services.
Claude: Daily scrape of SNDS data. Log per-IP reputation.

Failure mode: Resend/SMTP2GO IPs not assignable since they're shared. Resolution: Monitor at domain level via Postmaster, IP-level only if dedicated IP later.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 4.5.4: Inbox placement heat map per ISP

Files: scripts/inbox-placement-test.sh, scripts/seedlist-inboxes.txt
Owner: Claude
Prerequisite: 4.2.1, 4.5.1
Estimated time: 45 minutes

Verification:
```
bash scripts/inbox-placement-test.sh
# Generates report
test -f reports/inbox-placement-$(date +%Y-%m-%d).md
```

Expected output:
Inbox placement report generated.

Description:
Weekly placement test:
1. Pick one active alias
2. Send to seedlist: 5 Gmail + 5 dummy Outlook + 5 ProtonMail + 3 Yahoo + 2 iCloud (15 inboxes minimum)
3. After 5 minutes, check each inbox (via IMAP where possible, manual for some)
4. Note placement: Primary / Spam / Promotions / Not received
5. Generate heat map report: alias × ISP × placement

Costs nothing if seedlist already built (Phase 4.2.1 covers 5 Gmail). Need to provision additional dummy inboxes for other ISPs.

Failure mode: Manual check too time-consuming. Resolution: ProtonMail and iCloud IMAP automate. Yahoo offers Mail+ API. Manual only for edge cases.

Status: [ ] TODO

---

### Task 4.6.1: Bounce handler skill (S024)

Files: ~/code/tamazia-cowork-skills/S024-bounce-handler/
Owner: Claude
Prerequisite: Phase 3 complete
Estimated time: 60 minutes

Verification:
```
# Simulate bounce event, verify alias and lead updated
curl -s -X POST "$N8N_URL/webhook-test/bounce" \
  -H "Content-Type: application/json" \
  -d '{"event":"bounced","recipient":"test@example.com","reason":"5.1.1 user unknown","message_id":"abc123"}'
sleep 5
psql "$NEON_URL" -tA -c "SELECT delivery_status FROM sends WHERE message_id = 'abc123'" | grep -q "bounced_hard"
```

Expected output:
Bounce event processed, send marked.

Description:
S024 invoked by W5 webhook receivers. Logic:
- Hard bounce (5xx, user unknown): mark sends.delivery_status='bounced_hard', increment alias.bounce_count, suppress lead.email from future sends
- Soft bounce (4xx, temporary): mark sends.delivery_status='bounced_soft', retry once after 30 min, then escalate to hard
- Complaint (FBL): immediate DNC, alert Telegram P0

If alias.bounce_count > 5 in 7 days: trigger S016 health check.

Failure mode: Webhook payload format varies by relay. Resolution: Per-relay parser (Resend, SMTP2GO, MailerSend each different).

Status: [ ] TODO

---

### Task 4.7.1: SSL cert monitor skill (S051)

Files: ~/code/tamazia-cowork-skills/S051-ssl-cert-monitor/
Owner: Claude
Prerequisite: 0.1.1
Estimated time: 30 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S051-ssl-cert-monitor/scripts/check.sh tamazia.co.uk | jq -e '.days_until_expiry > 0'
```

Expected output:
Cert check returns days until expiry.

Description:
S051 daily cron checks SSL cert expiry on all owned domains. Uses openssl s_client. Logs to cert_status table. Alerts at 30/14/7/1 day before expiry.

Cloudflare auto-renews Universal SSL but monitor regardless.

Failure mode: Self-signed cert. Resolution: Note in cert_status, flag for manual.

Status: [ ] TODO

---

### Task 4.8.1: DNS continuous health monitoring

Files: ~/code/tamazia-cowork-skills/S-dns-health/
Owner: Claude
Prerequisite: 0.1.1
Estimated time: 30 minutes

Verification:
```
bash $HOME/code/tamazia-cowork-skills/S-dns-health/scripts/check.sh tamazia.co.uk | \
  jq -e '.spf_valid and .dkim_valid and .dmarc_valid'
```

Expected output:
DNS records all valid.

Description:
Daily check:
- SPF: dig +short txt tamazia.co.uk includes _spf.resend.com _spf.smtp2go.com _spf.mailersend.net
- DKIM: per-relay selector record exists and valid
- DMARC: dig +short txt _dmarc.tamazia.co.uk returns p=quarantine or p=reject
- MX: dig mx tamazia.co.uk returns expected Zoho records

If any check fails, alert Telegram P0. DNS drift is silent killer.

Failure mode: DNS propagation delay. Resolution: Re-check after 5 min before alerting.

Status: [ ] TODO

---

### Task 4.9.1: Multi-domain backup sender preparation

Files: docs/domain-strategy.md, candidate domain reservations
Owner: Both
Prerequisite: 0.1.1
Estimated time: 30 minutes

Verification:
```
test -f docs/domain-strategy.md && \
grep -q "PRIMARY:" docs/domain-strategy.md && \
grep -q "BACKUP_1:" docs/domain-strategy.md
```

Expected output:
Strategy doc with primary + backup domains.

Description:
Document strategy for multi-domain sending in case primary reputation degrades:
- Primary: tamazia.co.uk (production now)
- Backup 1: reserve tamazia-reach.com or similar (~£10/year, defer unless needed)
- Backup 2: reserve tamazia-mail.co.uk (~£10/year, defer)

Each backup goes through 30-day warmup before becoming alternate. Phase 15 builds the failover mechanism if needed.

Failure mode: Backup names too similar (look like phishing). Resolution: Pick distinct but related names.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 4.10.1: Phase 4 sign-off

Files: confirmations/phase-4-complete.txt
Owner: Both
Prerequisite: All 4.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 4
```

Status: [ ] TODO

---

## PHASE 4 EXIT GATE

```bash
bash scripts/verify-phase.sh 4
```

Returns exit 0 only when:
- W1b reply-from-receiver running with 50×6 templates
- 5 real Gmail seedlist integrated, app passwords secured
- Warmup-Engage manual skill for Aman built
- Alias health monitor live with hourly cron and auto-transitions
- W2/W4 pick only status=active aliases
- Telegram alert on status transitions
- Anti-fingerprint v6 (10 layers added), 0% collisions
- Mail-tester runner weekly per alias
- Postmaster Tools + Microsoft SNDS integrations
- Inbox placement heat map across 15 seedlist inboxes
- Bounce handler skill processing webhooks per-relay
- SSL cert monitor on all owned domains
- DNS continuous health monitoring
- Multi-domain backup strategy documented

Phase 5 locked until this passes.

End of Phase 4.
