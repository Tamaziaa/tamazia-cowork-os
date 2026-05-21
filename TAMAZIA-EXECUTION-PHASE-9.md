# PHASE 9 · MULTI-CHANNEL OUTREACH (LINKEDIN + INSTAGRAM + CAL.COM)
**Owner: Claude. Effort: 8 working days. Spend: £0-79/month (Sales Nav trial only if approved).**

Every priority lead gets 3 outreach drafts ready: email, LinkedIn message, Instagram DM. Aman picks channel based on context. Cal.com automation: pre-call brief, post-call outcome capture, calendar sync.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 8
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 9
```

---

### Task 9.1.1: LinkedIn drafter v2 hardening (S006 upgrade)

Files: ~/code/tamazia-cowork-skills/S006-linkedin-drafter/scripts/v2.js
Owner: Claude
Prerequisite: Phase 8 complete
Estimated time: 60 minutes

Verification:
```
node -e "
const ld = require('$HOME/code/tamazia-cowork-skills/S006-linkedin-drafter/scripts/v2.js');
ld.test({lead_id: 'test-1'}).then(r => {
  if (r.connection_note.length <= 300 && r.follow_up.length <= 500 && r.full_message.length <= 1900) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Three-tier message within character limits.

Description:
v2 hardening:
1. Apply all 50 compose-body standards (forbidden phrases, regional spelling, etc.)
2. 50-pointer personalisation pointers used
3. Three-tier sequence: connection (300 chars), follow-up (500 chars), full message (1900 chars)
4. Sign-off appropriate: connection = first name, full = "Aman Pareek, International Business Lawyer"
5. No links in connection note (LinkedIn flags as spam)
6. Reference at least one specific pointer per tier

Failure mode: 1900 char limit too tight for full pitch. Resolution: Prioritise opening hook + one specific finding + one CTA, drop sections.

Status: [ ] TODO

---

### Task 9.1.2: LinkedIn mutual connection leverage

Files: src/lib/linkedin/mutual-connections.ts
Owner: Claude
Prerequisite: 9.1.1
Estimated time: 30 minutes

Verification:
```
node -e "
const m = require('./src/lib/linkedin/mutual-connections.ts');
// Test: if Manuel is 1st-degree connection of target, surface that
m.findMutual({target_url: 'linkedin.com/in/some-prospect', via: 'Manuel Penades Fons'}).then(r => {
  if (r.has_mutual !== undefined) process.exit(0);
  process.exit(1);
});
"
```

Expected output:
Function returns mutual connection status.

Description:
For each LinkedIn URL of prospect:
- Check Aman's network: any mutual connections?
- Special check: Manuel Penades Fons connections (arbitration network valuable)
- If yes: prepend message with "Manuel mentioned you" or "Through Manuel" warm intro angle

Requires LinkedIn Sales Navigator OR manual confirmation per lead. Free path: check via LinkedIn search "{prospect} in:network" while logged in (manual or extension-based).

Failure mode: No clean API for free tier. Resolution: Default to "no mutual" cold approach, upgrade if Sales Nav trial activated.

Status: [ ] TODO

---

### Task 9.1.3: Recent post engagement comment generator

Files: ~/code/tamazia-cowork-skills/S006-linkedin-drafter/scripts/post-comment.js
Owner: Claude
Prerequisite: 9.1.1
Estimated time: 45 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S006-linkedin-drafter/scripts/post-comment.js \
  --linkedin-url linkedin.com/in/test-prospect \
  --recent-post "Just launched our new compliance platform" | \
  jq -e '.comment | length > 20 and length < 200'
```

Expected output:
Comment drafted within reasonable length.

Description:
For each prospect's LinkedIn URL, fetch their last 3 posts (via public RSS-like fetch or manual paste). Generate a substantive, non-sycophantic comment that:
- Engages with the actual content (not generic "Great post!")
- Adds value (data point, observation, related question)
- Doesn't pitch
- 20-200 chars

Aman manually posts the comment before sending connection request. Warming the room.

Failure mode: Prospect has no recent posts. Resolution: Skip engagement step, go direct.

Status: [ ] TODO

---

### Task 9.1.4: Voice note script generator

Files: ~/code/tamazia-cowork-skills/S006-linkedin-drafter/scripts/voice-note.js
Owner: Claude
Prerequisite: 9.1.1
Estimated time: 45 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S006-linkedin-drafter/scripts/voice-note.js --lead-id test-1 | \
  jq -e '.script | length > 100 and length < 600 and .duration_estimate_sec >= 30 and .duration_estimate_sec <= 90'
```

Expected output:
Voice note script 30-90 sec.

Description:
LinkedIn voice notes have 40-60% higher reply rates per industry data. Skill generates a SCRIPT for Aman to record (not auto-send, that's against ToS):

- 30-90 second target (200-400 words conversational)
- Personal hook (specific to lead)
- One observation, not a pitch
- Inviting close ("Curious what you think")
- Natural pauses indicated

Aman records on phone, sends via LinkedIn voice note feature.

Failure mode: Aman uncomfortable with voice notes. Resolution: Skip, use text only.

Status: [ ] TODO

---

### Task 9.2.1: Instagram DM drafter skill (NEW S-ig-dm)

Files: ~/code/tamazia-cowork-skills/S-instagram-dm-drafter/
Owner: Claude
Prerequisite: 9.1.1, 7.4.2
Estimated time: 60 minutes

Verification:
```
node $HOME/code/tamazia-cowork-skills/S-instagram-dm-drafter/test/draft.js --lead-id test-1 | \
  jq -e '.tier1.length <= 250 and .tier2.length <= 500 and .tier3.length <= 1500'
```

Expected output:
Three-tier Instagram DM within limits.

Description:
For each lead with instagram_handle, generate 3-tier DM:
- Tier 1 (first DM, ≤250 chars): personal hook, no pitch, references their recent post or brand element
- Tier 2 (follow-up after no reply, ≤500 chars): light value reference, soft question
- Tier 3 (after engagement, ≤1500 chars): full pitch adapted to conversational tone

Sector-calibrated tone:
- Hospitality/Wellness/Personal Brand: casual, warm
- Legal/FS: more reserved, peer-level
- E-commerce/SaaS: curious, brand-aware

No links in first DM (Instagram flags as spam). Always reference one specific thing from their content. Drafts only, never auto-sent (ToS).

Failure mode: Brand has minimal Instagram activity. Resolution: Reference their bio + most recent post, accept brevity.

Status: [ ] TODO

---

### Task 9.2.2: Multi-stakeholder thread skill (S058)

Files: ~/code/tamazia-cowork-skills/S058-multi-stakeholder-thread/
Owner: Claude
Prerequisite: 9.1.1
Estimated time: 45 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S058-multi-stakeholder-thread/SKILL.md
```

Expected output:
Skill exists.

Description:
When a deal has multiple decision-influencers:
- Champion (internal advocate)
- Economic buyer (final approver)
- Blocker (potential opposer)
- Parent company contact (if applicable)

S058 tracks all in stakeholder_map table. Drafts different messages per role, never contradicts. Aman approves before sending each.

Schema:
```sql
CREATE TABLE stakeholder_map (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  contact_email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  role VARCHAR(50) NOT NULL,
  influence_score INTEGER,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ
);
```

Failure mode: Same person classified as champion AND blocker. Resolution: Manual reconciliation, Aman picks dominant role.

Status: [ ] TODO

---

### Task 9.3.1: Slack notification with all 3 channel drafts

Files: n8n W10 expansion for priority leads
Owner: Claude
Prerequisite: 9.1.1, 9.2.1, 7.6.2
Estimated time: 30 minutes

Verification:
```
# Trigger notification for test priority lead
curl -s -X POST "$N8N_URL/webhook-test/priority-lead-notification" -d '{"lead_id":"test-1"}'
sleep 5
test -f confirmations/multi-channel-notification-tested.txt
```

Expected output:
Slack notification has email + LinkedIn + Instagram drafts visible.

Description:
For top 10 leads/day, Slack notification displays:
- Lead context (firm, sector, priority score, ad intel summary)
- Email draft (collapsible)
- LinkedIn 3-tier (collapsible)
- Instagram 3-tier (collapsible, only if handle exists)
- Buttons: [Send Email] [Open LinkedIn] [Open Instagram] [Edit All] [Hand to Aman]

Channel selection logic:
- Email always available
- LinkedIn only if linkedin_url exists
- Instagram only if instagram_handle exists AND sector relevant (hospitality, wellness, personal brand, e-com)

Logs which channel used per lead in outreach_channels table for attribution analysis.

Failure mode: Slack message too long. Resolution: Use Slack threading - summary message + thread details.

Status: [ ] TODO

---

### Task 9.4.1: Cal.com webhook integration

Files: n8n W15 cal.com webhook handler
Owner: Both (Aman configures webhook, Claude builds handler)
Prerequisite: 0.1.5
Estimated time: 30 minutes

Verification:
```
# Trigger test booking via Cal.com API, verify webhook fires
curl -s -X POST https://api.cal.com/v1/bookings \
  -H "Authorization: Bearer $CALCOM_API_KEY" \
  -d '{"eventTypeId":1,"start":"2026-06-01T10:00:00Z","attendees":[{"email":"test@example.com","name":"Test"}]}'
sleep 10
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM lead_bookings WHERE booked_via = 'calcom' AND created_at > NOW() - INTERVAL '1 minute'" | grep -q "^1$"
```

Expected output:
Booking logged in lead_bookings table.

Description:
Aman: In Cal.com settings, add webhook: https://modest-magpie.pikapod.net/webhook/cal-booked. Event: BOOKING_CREATED.

Claude: W15 webhook handler:
1. Parse payload (booking ID, attendee email + name, start time, event type)
2. Match attendee email to lead in leads table
3. Update lead.status='call_booked', lead.call_at=start_time
4. Insert into lead_bookings table
5. Trigger pre-call brief generation (W16, 60 min before call)
6. Slack + Telegram notification: "{Firm} booked a call for {time}"

Failure mode: Attendee email doesn't match any lead. Resolution: Create new lead from booking data, flag for Aman review.

Status: [ ] TODO

---

### Task 9.4.2: Pre-call brief generator (W16)

Files: n8n W16 pre-call brief
Owner: Claude
Prerequisite: 9.4.1, 6.2.1 (personalisation)
Estimated time: 60 minutes

Verification:
```
# Simulate booking 65 min from now, verify brief generated and sent 60 min before
psql "$NEON_URL" -c "INSERT INTO lead_bookings (lead_id, booked_at, call_at) VALUES (1, NOW(), NOW() + INTERVAL '65 minutes')"
sleep 360  # 6 min after, brief should have fired
test -f confirmations/pre-call-brief-tested.txt
```

Expected output:
Pre-call brief delivered to Slack + Telegram.

Description:
W16 cron checks every 5 min for bookings 55-65 min away. For each:
1. Generate brief from: lead research dossier, personalisation pointers, audit engagement data (which sections they viewed), prior touch history, ad intelligence summary
2. Format as concise pre-call doc (~600 words):
   - Who: name, title, firm, sector
   - What they engaged with: audit sections viewed, dwell time
   - Why they're talking to us: inferred from intent signals
   - Key questions to ask
   - Likely objections + handling
   - Pricing tier to lead with
   - Suggested 5-minute opener
3. Send to Slack + Telegram

Failure mode: Lead has minimal data (cold booking). Resolution: Brief includes "minimal pre-context, run discovery script".

Status: [ ] TODO

---

### Task 9.4.3: Post-call outcome capture

Files: n8n W17 post-call follow-up
Owner: Claude
Prerequisite: 9.4.2
Estimated time: 45 minutes

Verification:
```
# Simulate booking ending 10 min ago, verify outcome prompt fired
psql "$NEON_URL" -c "UPDATE lead_bookings SET call_at = NOW() - INTERVAL '10 minutes' WHERE lead_id = 1"
sleep 60
test -f confirmations/post-call-prompt-tested.txt
```

Expected output:
Slack prompt asking outcome appears.

Description:
W17 cron every 5 min checks for bookings call_at 5-15 min ago. For each:
1. Send Slack message to Aman: "How did the call with {Firm} go?"
2. Buttons: [Booked/Signed] [Sent Proposal] [Nurture] [No Fit] [No Show]
3. On click, update lead.status accordingly
4. If [Sent Proposal]: trigger contract-generator (S037, Phase 14)
5. If [Nurture]: schedule re-engagement in 30 days
6. If [No Fit]: mark lost with reason
7. If [No Show]: trigger no-show follow-up sequence

Failure mode: Aman doesn't click within hours. Resolution: Reminder after 4 hours, then daily until clicked.

Status: [ ] TODO

---

### Task 9.4.4: Google Calendar sync

Files: Cal.com → Google Calendar sync settings
Owner: Aman
Prerequisite: 0.1.5
Estimated time: 15 minutes

Verification:
```
test -f confirmations/calcom-gcal-sync-confirmed.txt
```

Expected output:
Aman confirms sync active.

Description:
Aman: In Cal.com → Settings → Apps → Google Calendar → Connect. Configure: write bookings to primary calendar, read availability from primary.

This means Cal.com respects Aman's existing calendar blocks (won't double-book) AND bookings appear in Google Calendar (where Aman lives).

Failure mode: Sync delay. Resolution: Cal.com guarantees within 5 min, alert Aman if issues.

Status: [ ] TODO

---

### Task 9.5.1: LinkedIn Sales Navigator trial decision

Files: confirmations/sales-nav-trial.txt
Owner: Aman
Prerequisite: 9.1.1
Estimated time: 5 min sign-up, 30 day trial

Verification:
```
test -f confirmations/sales-nav-trial.txt && \
grep -q "TRIAL_STARTED:" confirmations/sales-nav-trial.txt
```

Expected output:
Trial started or explicit deferral.

Description:
Aman decides: start 30-day free trial OR defer until needed.

If trial: start at LinkedIn Sales Navigator landing page. Tracks performance during 30 days:
- Sales Nav-sourced leads vs other sources
- Reply rate on InMails vs cold email
- Calls booked attributable to Sales Nav

Day 28: review report, decide keep (£79/month) or cancel.

If deferred: write to file:
```
TRIAL_STARTED: deferred until day 60 or until manual lead sourcing insufficient
```

Status: [ ] TODO

---

### Task 9.6.1: Phase 9 sign-off

Files: confirmations/phase-9-complete.txt
Owner: Both
Prerequisite: All 9.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 9
```

Status: [ ] TODO

---

## PHASE 9 EXIT GATE

```bash
bash scripts/verify-phase.sh 9
```

Returns exit 0 only when:
- LinkedIn drafter v2 with 3-tier sequence in limits
- Mutual connection check working
- Recent post engagement comment generator
- Voice note script generator
- Instagram DM drafter operational
- Multi-stakeholder thread skill built
- Slack notification with all 3 channels for priority leads
- Cal.com webhook integrated, bookings logged
- Pre-call brief generated 60 min before
- Post-call outcome capture working
- Google Calendar sync confirmed
- LinkedIn Sales Nav decision logged

Phase 10 locked until this passes.

End of Phase 9.
