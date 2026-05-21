# PHASE 14 · POST-SIGNATURE LIFECYCLE (NEW IN v2)
**Owner: Claude. Effort: 8 working days. Spend: £0 (all free tools).**

When a lead becomes a client, the journey is just beginning. This phase covers contract generation, e-sign, onboarding, customer success, renewals, upsell, referrals, case studies, win/loss analysis. v1 missed this entirely.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 6
```

(Phase 14 can run in parallel with 7-13 once Phase 6 done.)

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 14
```

---

### Task 14.1.1: Contract generator skill (S037)

Files: ~/code/tamazia-cowork-skills/S037-contract-generator/, templates/contract/master.docx
Owner: Claude
Prerequisite: Phase 6 + Phase 2 T&Cs complete
Estimated time: 90 minutes

Verification:
```
# Generate test contract, verify file exists with deal terms
node $HOME/code/tamazia-cowork-skills/S037-contract-generator/test/generate.js \
  --lead-id test-1 --tier growth --deal-value 50000 | jq -e '.contract_file'
test -f $(jq -r '.contract_file' /tmp/test-contract-output.json)
```

Expected output:
Contract DOCX generated with correct deal terms.

Description:
Triggered when lead.status = 'verbal_yes'. Master template (docxtemplater library) merges:
- Client details (legal name, registered address, contact)
- Tamazia details (from corporate file)
- Service tier scope (from PURCHASES tiers)
- Fees and payment terms
- Term length (12 months minimum, 60-day notice)
- Tamazia standard T&Cs (from Phase 2)
- Reference number

Outputs DOCX. Optionally renders PDF via Playwright.

Failure mode: Custom client terms not in template. Resolution: Aman flags, manual addendum.

Status: [ ] TODO

---

### Task 14.1.2: E-sign orchestrator skill (S038)

Files: ~/code/tamazia-cowork-skills/S038-esign-orchestrator/, Documenso setup
Owner: Both (Aman sets up Documenso on Pikapod, Claude integrates)
Prerequisite: 14.1.1
Estimated time: 90 minutes

Verification:
```
# Send test contract for signature
node $HOME/code/tamazia-cowork-skills/S038-esign-orchestrator/test/send.js | jq -e '.envelope_id'
```

Expected output:
Envelope ID returned, contract sent.

Description:
Documenso self-hosted on Pikapod (free, open source) OR DocuSeal free tier as backup.

Skill S038:
1. Upload generated contract DOCX
2. Add signature fields (client + Aman)
3. Set signing order (client first, Aman counter-signs)
4. Send via email to client
5. Webhook on signature events
6. Once both signed: store final PDF in policies/contracts/{client-slug}-{date}.pdf
7. Update lead.status = 'signed', trigger onboarding sequence

Failure mode: Documenso setup complex. Resolution: DocuSeal free tier as immediate fallback (3 envelopes/month free, sufficient for initial volume).

Status: [ ] TODO

---

### Task 14.2.1: Invoicing skill (S039)

Files: ~/code/tamazia-cowork-skills/S039-invoicing-skill/, Zoho Invoice account
Owner: Both (Aman creates Zoho Invoice account, Claude integrates)
Prerequisite: 14.1.2
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S039-invoicing-skill/test/create.js | jq -e '.invoice_url'
```

Expected output:
Invoice generated with URL.

Description:
Aman: Sign up Zoho Invoice (free for 1 user). Connect to Zoho Mail.
Claude: API integration:
- createInvoice(client, items, total, payment_terms)
- sendInvoice(invoice_id, email)
- checkStatus(invoice_id)

Triggers:
- Contract signed → create setup fee invoice
- Monthly retainers → cron 1st of month creates invoices for active clients
- Project milestones → manual or task-based

Backup option: Wave (fully free).

Failure mode: Zoho Invoice rate limits API. Resolution: Cache invoice IDs, batch operations.

Status: [ ] TODO

---

### Task 14.2.2: Payment tracking

Files: invoices table, payment webhook handler
Owner: Claude
Prerequisite: 14.2.1
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='invoices'" | grep -q "^1$"
```

Expected output:
Invoices table exists.

Description:
Schema:
```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES leads(id),
  zoho_invoice_id VARCHAR(100),
  amount DECIMAL(10,2),
  currency VARCHAR(3),
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status VARCHAR(30),
  payment_method VARCHAR(50)
);
```

Zoho webhook on payment: update paid_at. If overdue: Telegram alert, follow-up reminders 7/14/21 days past due, escalate to Aman at 30 days.

Status: [ ] TODO

---

### Task 14.3.1: Onboarding sequence skill (S040)

Files: ~/code/tamazia-cowork-skills/S040-onboarding-sequence/
Owner: Claude
Prerequisite: 14.1.2, 14.2.1
Estimated time: 90 minutes

Verification:
```
# Trigger for test client, verify all onboarding tasks created
node $HOME/code/tamazia-cowork-skills/S040-onboarding-sequence/test/start.js --client-id test-1
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM onboarding_tasks WHERE client_id = (SELECT id FROM leads WHERE email LIKE 'test%' LIMIT 1)" | xargs -I {} test {} -ge 5
```

Expected output:
At least 5 onboarding tasks created.

Description:
30-day structured onboarding:
- Day 0: Welcome email + Calendly kickoff link + onboarding portal access
- Day 1: Detailed questionnaire (services context, access permissions, brand assets)
- Day 7: Data access requested (Google Analytics, Search Console, ad platforms)
- Day 14: Initial scan results presented (call)
- Day 21: Implementation plan signed off
- Day 30: Kickoff call + handoff to delivery

Each step: automated email + Slack reminder to Aman if action needed.

Failure mode: Client unresponsive. Resolution: Escalation cadence (7/14/21 day reminders), Aman P1 alert at 21 days.

Status: [ ] TODO

---

### Task 14.4.1: Client success tracker skill (S041)

Files: ~/code/tamazia-cowork-skills/S041-client-success-tracker/
Owner: Claude
Prerequisite: 14.3.1
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S041-client-success-tracker/test/score.js --client-id test-1 | \
  jq -e '.health_score >= 0 and .health_score <= 100'
```

Expected output:
Health score between 0-100.

Description:
Weekly per active client:
1. Pull engagement signals: portal logins, email response rate to Tamazia comms, deliverables accepted on time, NPS-equivalent from check-in surveys
2. Compute health_score (0-100):
   - 80-100: green (renewing likely)
   - 60-79: amber (needs attention)
   - <60: red (churn risk)
3. Risk factors flagged:
   - No response to last 2 check-ins
   - Deliverable rejected
   - Invoice late
   - Slow access provisioning
4. Upsell signals flagged:
   - Asking about additional services
   - Hitting plan limits
   - Multiple stakeholders engaged

Reports daily Slack #aman-cos for any client below 60.

Status: [ ] TODO

---

### Task 14.5.1: Renewal automation skill (S042)

Files: ~/code/tamazia-cowork-skills/S042-renewal-automation/
Owner: Claude
Prerequisite: 14.4.1
Estimated time: 60 minutes

Verification:
```
# Simulate client with renewal in 65 days, verify automated outreach
node $HOME/code/tamazia-cowork-skills/S042-renewal-automation/test/check.js
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM renewal_outreach WHERE created_at > NOW() - INTERVAL '5 min'"
```

Expected output:
Outreach scheduled.

Description:
Daily cron checks all active clients for contract_end_date approaching:
- 60d out: renewal email + Calendly conversation invite
- 30d out: reminder + draft new proposal (incorporating year's data)
- 14d out: escalation to Aman direct (warm personal note)
- 7d out: P0 Telegram alert if no renewal commitment

Renewal proposal auto-drafted from: original deal, year's outcomes (case_study data), proposed expansion (upsell signals).

Failure mode: Client churns. Resolution: Trigger win-loss-analyser, transition to alumni status, schedule re-engagement after 12 months.

Status: [ ] TODO

---

### Task 14.6.1: Upsell engine skill (S043)

Files: ~/code/tamazia-cowork-skills/S043-upsell-engine/
Owner: Claude
Prerequisite: 14.4.1
Estimated time: 45 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S043-upsell-engine/test/identify.js --client-id test-1
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM upsell_opportunities" | xargs -I {} test {} -ge 0
```

Expected output:
Skill runs without error.

Description:
Triggered by client-success-tracker signals:
- SEO going well + Tamazia not yet on compliance retainer → propose compliance retainer
- Single location succeeding → propose expansion to other locations
- Audit results lead to identified gap → propose project to fix

Drafts upsell proposal (smaller version of audit page, focused on the one gap). Aman approves before sending.

Tracks: opportunity, status, deal value, conversion.

Status: [ ] TODO

---

### Task 14.7.1: Referral capture skill (S044)

Files: ~/code/tamazia-cowork-skills/S044-referral-capture/
Owner: Claude
Prerequisite: 14.4.1
Estimated time: 45 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S044-referral-capture/SKILL.md
```

Expected output:
Skill exists.

Description:
Detects referrals in:
1. Client comms mentioning another person ("you should talk to X at Y")
2. Explicit referral form on tamazia.co.uk/refer
3. Calendar bookings where attendees include both Aman + client + new person

For each referral:
- Create new lead with referred_by populated
- Auto-draft intro/acknowledgment to client
- Auto-draft warm intro request to client for referred prospect
- Track conversion of referrals (highest-value lead source typically)

Failure mode: False positives (client mentioning industry peer not as referral). Resolution: Confidence threshold, manual confirmation before lead creation.

Status: [ ] TODO

---

### Task 14.8.1: Case study builder skill (S045)

Files: ~/code/tamazia-cowork-skills/S045-case-study-builder/
Owner: Claude
Prerequisite: 14.4.1
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S045-case-study-builder/test/build.js --client-id test-1
test -f drafts/case-studies/test-client-draft.md
```

Expected output:
Case study draft generated.

Description:
Triggered 90 days after client launch IF results positive (health_score ≥80 AND measurable outcomes).

Pulls metrics: before/after engagement, attributed revenue, key wins. Drafts case study narrative (300-500 words). Status='draft_pending_approval'.

Sends to client for permission to publish. Once approved:
- Published to tamazia.co.uk/case-studies/{client-slug}
- Used in future audit pages for matching sectors

Failure mode: Client declines permission. Resolution: Anonymous version with metrics only, no name.

Status: [ ] TODO

---

### Task 14.9.1: Win-loss analyser skill (S021)

Files: ~/code/tamazia-cowork-skills/S021-win-loss-analyser/
Owner: Claude
Prerequisite: 14.5.1
Estimated time: 45 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S021-win-loss-analyser/test/analyse.js --lead-id test-won
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM win_loss_records" | xargs -I {} test {} -ge 0
```

Expected output:
Win/loss record created.

Description:
Triggered on lead.status change to 'client' (won) or 'lost'.

Captures:
- Time to close (days from first touch)
- Touches count
- Channels used (email/LinkedIn/Instagram/call)
- Decisive factor (per Aman's note)
- Sector pitch used
- Compete vs (incumbent or competitor named)
- Pricing tier accepted/rejected
- Learnings (Aman free-text)

Monthly aggregate analysis: patterns by sector, by channel, by pricing tier.

Status: [ ] TODO

---

### Task 14.10.1: Forecast builder skill (S022)

Files: ~/code/tamazia-cowork-skills/S022-forecast-builder/
Owner: Claude
Prerequisite: 14.9.1
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S022-forecast-builder/test/forecast.js | \
  jq -e '.scenarios.likely and .scenarios.best and .scenarios.worst'
```

Expected output:
Three scenarios produced.

Description:
Weekly Friday:
- Pipeline snapshot: leads by stage with deal_value
- Stage probabilities: pending 1%, contacted 3%, engaged 8%, replied 18%, call_booked 25%, proposal_sent 40%, negotiating 65%, closed 100%
- Weighted forecast = sum(value × probability)
- 3 scenarios: best (all high-confidence close), likely (weighted), worst (only above-90% close)
- Gap to quota
- Stored in forecasts table for accuracy tracking over time

Slack #aman-cos posts weekly forecast.

Status: [ ] TODO

---

### Task 14.11.1: Phase 14 sign-off

Files: confirmations/phase-14-complete.txt
Owner: Both
Prerequisite: All 14.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 14
```

Status: [ ] TODO

---

## PHASE 14 EXIT GATE

```bash
bash scripts/verify-phase.sh 14
```

Returns exit 0 only when:
- Contract generator working (DOCX from template + deal terms)
- E-sign orchestrator (Documenso or DocuSeal) operational
- Invoicing skill creating invoices via Zoho
- Payment tracking with overdue alerts
- Onboarding sequence 30-day flow
- Client success tracker weekly per active client
- Renewal automation 60/30/14/7 day cadence
- Upsell engine identifying opportunities
- Referral capture detecting and creating leads
- Case study builder generating drafts at 90 days
- Win-loss analyser capturing every outcome
- Forecast builder weekly forecasts

Phase 14 active end-state: post-signature lifecycle fully automated.

End of Phase 14.
