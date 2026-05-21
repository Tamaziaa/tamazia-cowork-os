# PHASE 15 · OPERATIONS RESILIENCE (NEW IN v2)
**Owner: Claude. Effort: 6 working days. Spend: £0.**

The "boring but critical" infrastructure that keeps Tamazia running when things go wrong. API key rotation, database backups, disaster recovery, audit trail export, multi-domain failover, SSL monitoring, GDPR request handling. v1 missed this entirely.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 12
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 15
```

---

### Task 15.1.1: API key rotator skill (S046)

Files: ~/code/tamazia-cowork-skills/S046-api-key-rotator/
Owner: Claude
Prerequisite: Phase 12 complete
Estimated time: 60 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S046-api-key-rotator/SKILL.md
```

Expected output:
Skill exists.

Description:
Quarterly cron OR on security event:
1. For each rotatable service in api_keys table (Resend, SMTP2GO, MailerSend, Hunter, Snov, NeverBounce, Cal.com, Slack, Telegram, Cloudflare, Anthropic, Groq, Gemini, etc.):
   - Generate new key via service API (where possible)
   - Update n8n credential
   - Update .env
   - Update env vars in Cloudflare Pages, Pikapod
   - 24-hour grace period: both old and new keys active
   - After grace: revoke old key
   - Log rotation in api_key_rotations table
2. Services without API for key gen: manual reminder to Aman with step-by-step

Failure mode: Service requires re-OAuth (Slack, etc.). Resolution: Manual step flagged for Aman in rotation calendar.

Status: [ ] TODO

---

### Task 15.2.1: Database backup skill (S047)

Files: ~/code/tamazia-cowork-skills/S047-db-backup/
Owner: Claude
Prerequisite: Phase 12 complete
Estimated time: 60 minutes

Verification:
```
# Run backup, verify file exists in R2
bash $HOME/code/tamazia-cowork-skills/S047-db-backup/scripts/backup.sh
ls backups/neon-$(date +%Y-%m-%d).sql.gz | head -1
```

Expected output:
Backup file exists.

Description:
Daily 02:00 UK:
1. pg_dump of Neon DB
2. Gzip compress
3. Encrypt with GPG (key in vault)
4. Upload to Cloudflare R2 bucket
5. Retention:
   - 7 daily backups
   - 4 weekly (Sunday)
   - 12 monthly (1st of month)
   - Older: delete
6. Weekly Sunday: restore-test to ephemeral DB, verify integrity, drop

Neon has its own automated backups (point-in-time recovery on paid tier) but this provides:
- Off-site backup (R2 different account)
- Cryptographic verification
- Long retention beyond Neon's window

Failure mode: pg_dump times out. Resolution: Split by schema, parallel dumps.

Status: [ ] TODO

---

### Task 15.3.1: Disaster recovery playbook (S048)

Files: docs/runbooks/disaster-recovery.md, ~/code/tamazia-cowork-skills/S048-disaster-recovery/
Owner: Claude
Prerequisite: 15.2.1, 15.1.1
Estimated time: 90 minutes

Verification:
```
test -f docs/runbooks/disaster-recovery.md && \
grep -c "^## Scenario" docs/runbooks/disaster-recovery.md | xargs -I {} test {} -ge 6
```

Expected output:
Playbook with 6+ scenarios.

Description:
Documented recovery playbooks:

**Scenario 1: Neon DB loss**
- Restore from most recent R2 backup (Phase 15.2.1)
- Restore-test verified Sunday, so ≤7 days data loss worst case
- Estimated recovery time: 30-60 minutes

**Scenario 2: n8n Pikapod loss**
- Spin up new Pikapod
- Import n8n workflows from git (workflows backed up to repo weekly)
- Re-attach credentials from .env
- Estimated recovery time: 60-90 minutes

**Scenario 3: Cloudflare account compromise**
- Lock account via 2FA recovery
- Anthropic incident response
- Restore site from GitHub repo
- Re-issue API tokens
- Estimated recovery time: 2-4 hours

**Scenario 4: Domain hijack (DNS theft)**
- Contact registrar (Cloudflare Registrar) immediately
- Provide proof of identity (Tamazia incorporation docs)
- Recover domain
- Backup domain (multi-domain prep from Phase 4) can serve mail during recovery
- Estimated recovery time: 24-72 hours

**Scenario 5: Resend account suspended**
- Reason usually: complaint rate spike, suspected spam
- Pause all outreach immediately
- Switch primary sending to SMTP2GO + MailerSend
- Contact Resend support, provide documentation of legitimate B2B outreach
- Investigate root cause (likely template variant, alias, or recipient list)

**Scenario 6: Slack/Telegram outage**
- Fall back to email notifications via Resend (Phase 11.5.1)
- Continue operations
- Resume normal channels when restored

**Scenario 7: PI insurance claim**
- Notify insurer immediately per policy terms (usually 24 hours)
- Halt scans for sectors implicated
- Document timeline, communications, framework versions used
- Escalate to specialist solicitor

**Scenario 8: GDPR enforcement action**
- Engage Article 27 representative (Phase 2.2.1)
- Provide ICO with audit trail (Phase 15.4.1)
- Suspend processing if ordered
- Document remediation steps

Each scenario: trigger conditions, immediate actions, recovery steps, communication plan, postmortem template.

Status: [ ] TODO

---

### Task 15.3.2: Quarterly DR drill

Files: scripts/dr-drill.sh
Owner: Both (Claude runs drill, Aman validates)
Prerequisite: 15.3.1
Estimated time: 4 hours quarterly

Verification:
```
test -f reports/dr-drills/$(date +%Y-Q%q).md
```

Expected output:
Quarterly drill report exists.

Description:
Once per quarter, run one DR scenario as drill:
- Q1: Neon DB restore drill (restore-test to ephemeral, verify functional)
- Q2: n8n Pikapod migration drill (spin new instance, import workflows)
- Q3: Notification fallback drill (simulate Slack outage)
- Q4: Full simulated incident (random scenario from playbook)

Report: time taken vs target, gaps identified, playbook updates.

Status: [ ] TODO

---

### Task 15.4.1: Audit trail export skill (S049)

Files: ~/code/tamazia-cowork-skills/S049-audit-trail-export/
Owner: Claude
Prerequisite: Phase 12 complete
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S049-audit-trail-export/scripts/export.js \
  --lead-id test-1 --start 2026-01-01 --end 2026-05-17 | jq -e '.export_file'
```

Expected output:
Export file generated.

Description:
On-demand OR scheduled. Use cases:
- DPIA documentation (GDPR Article 35)
- Subject access request (Article 15)
- Regulator request (ICO investigation)
- Legal subpoena
- Internal compliance audit

Skill generates structured JSON + PDF of:
- Every action taken on a lead (sends, replies, audits delivered, status changes)
- Every decision logged (decisions table)
- Every manual override (overrides log)
- Every consent/unsubscribe event
- Every framework version used at time of action
- Sender identity at time of action
- Cryptographic signature on output (immutability proof)

Output stored in policies/audit-trails/{lead-id-or-all}-{date}.pdf.

Failure mode: Large datasets timeout. Resolution: Pagination, async generation, email link when ready.

Status: [ ] TODO

---

### Task 15.5.1: Multi-domain backup sender (S050)

Files: ~/code/tamazia-cowork-skills/S050-multi-domain-backup-sender/
Owner: Claude
Prerequisite: 4.9.1 (Phase 4 strategy doc)
Estimated time: 60 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S050-multi-domain-backup-sender/SKILL.md
```

Expected output:
Skill exists.

Description:
Triggered when primary domain (tamazia.co.uk) reputation drops below threshold:
1. Activate backup domain aliases (tamazia-reach.com or similar)
2. Switch W2/W4 to use backup domain aliases
3. Continue normal sequences from backup domain
4. Primary domain enters "quarantine" mode: no outbound, only inbound, allow reputation to recover
5. After 30 days of clean reputation: primary becomes active again, backup goes to standby

Requires: backup domains warmed up to Phase D (production-ready). Phase 4.9.1 documented strategy, but actual domain reservation deferred until needed (cost ~£10/year each).

Failure mode: All domains compromised simultaneously. Resolution: Emergency procurement of new domain, accept 14-day warmup delay.

Status: [ ] TODO

---

### Task 15.5.2: SSL cert monitor (S051, from Phase 4)

Files: From Phase 4 task 4.7.1
Owner: Claude
Prerequisite: 4.7.1
Estimated time: 0 (verification)

Verification:
```
bash scripts/verify-task.sh 4.7.1
```

Status: [ ] TODO

---

### Task 15.6.1: GDPR request handler (S052, from Phase 2)

Files: From Phase 2 task 2.7.1
Owner: Claude
Prerequisite: 2.7.1
Estimated time: 0 (verification)

Verification:
```
bash scripts/verify-task.sh 2.7.1
```

Status: [ ] TODO

---

### Task 15.7.1: Action audit log (every Aman action in Cowork)

Files: migrations/2026-05-26-aman-actions-log.sql
Owner: Claude
Prerequisite: 15.4.1
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='aman_actions'" | grep -q "^1$"
```

Expected output:
Table exists.

Description:
Schema:
```sql
CREATE TABLE aman_actions (
  id SERIAL PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL,
  context JSONB NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(50) NOT NULL,
  outcome VARCHAR(30)
);
```

Every significant Aman action in Cowork logged:
- Approving a reply (with content and reasoning)
- Approving an audit
- Manual override of a task
- Updating sender identity
- Updating compliance disclaimer
- Cancelling a send
- Marking a lead VIP/competitor
- Pricing tier change
- T&Cs amendment

This is the legal/compliance trail. External audits can be supplied with this log.

Status: [ ] TODO

---

### Task 15.7.2: Decision rollback workflow

Files: ~/code/tamazia-cowork-skills/S-decision-rollback/
Owner: Claude
Prerequisite: 11.3.2
Estimated time: 30 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S-decision-rollback/SKILL.md
```

Expected output:
Skill exists.

Description:
If a decision in decisions table needs reversal:
1. Aman runs `/tamazia-decision-rollback {decision_id} "{new rationale}"` in Slack
2. Updates decisions.status='reversed', logs reversed_at + reversal_reason
3. Identifies downstream impact (tasks, configurations affected by that decision)
4. Lists affected items in Slack #aman-cos for Aman to action
5. Generates updated MASTER.md decisions section reflecting reversal

Failure mode: Reversal cascades to many tasks. Resolution: Aman reviews impact list before commit.

Status: [ ] TODO

---

### Task 15.8.1: Phase 15 sign-off

Files: confirmations/phase-15-complete.txt
Owner: Both
Prerequisite: All 15.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 15
```

Status: [ ] TODO

---

## PHASE 15 EXIT GATE

```bash
bash scripts/verify-phase.sh 15
```

Returns exit 0 only when:
- API key rotator skill operational
- Database backup daily to R2 with restore-test weekly
- Disaster recovery playbook documents 8 scenarios
- Quarterly DR drill scheduled
- Audit trail export skill operational
- Multi-domain backup sender ready (deferred actual provisioning until needed)
- SSL cert monitor active (from Phase 4)
- GDPR request handler active (from Phase 2)
- Aman action audit log capturing all significant actions
- Decision rollback workflow available

End of Phase 15.

---

# OVERALL EXECUTION COMPLETE

Once Phase 15 verified, the full Tamazia Cowork OS is operational:
- 15 phases
- ~377 tasks
- 58 skill files
- 21 n8n workflows (W1-W19 plus W1b, W1c)
- 50 free APIs integrated
- All compliance + legal foundation in place
- Audit micro-site luxury build
- 50-pointer personalisation engine
- Lead sourcing 100/day verified
- Multi-channel outreach (email + LinkedIn + Instagram)
- Cal.com automation end-to-end
- Sector intelligence base (1000 sources)
- Chief of staff orchestrator
- Deploy bulletproofing with nightly regression
- Post-signature lifecycle automation
- Operations resilience playbooks

Total spend committed: ~£40-60/month + ~£440/year annual.

Time to full operation: ~12 weeks at full pace, ~16-20 weeks at sustainable pace.

Next action: Aman runs `bash scripts/verify-phase.sh 0` after confirming Phase 0 approvals in MASTER Section 0.
