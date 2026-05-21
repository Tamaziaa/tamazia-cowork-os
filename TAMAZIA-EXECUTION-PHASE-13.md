# PHASE 13 · CONTINUOUS IMPROVEMENT RHYTHMS
**Owner: System (automated) + Aman (decision gates). Effort: Ongoing. Spend: £0 (recurring only).**

Once Phases 0-12 ship, the system runs itself. Daily, weekly, monthly, quarterly rhythms keep it sharp. Decision gates at 30/60/90/180 days for scale and tooling decisions.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 12
```

## PHASE EXIT GATE
Phase 13 is ongoing, no exit gate. Sub-tasks are recurring jobs that should ALWAYS be in [x] VERIFIED state if cron is healthy.

---

### Task 13.1.1: Daily workflows healthy

Files: scripts/daily-health-check.sh
Owner: System
Prerequisite: Phase 12 complete
Estimated time: ongoing

Verification:
```
# All 19 workflows (W1-W19) executed in last 25 hours with success
for WID in W1 W1b W1c W2 W3 W4 W5 W6 W7 W7b W9 W10 W11 W12 W13 W14 W15 W16 W17 W18 W19; do
  bash scripts/lib/checks.sh check_n8n $WID 25 || exit 1
done
```

Expected output:
All workflows healthy.

Description:
All 21 workflows have run in last 25 hours with success. If any haven't, alert via Telegram + Slack #aman-cos.

Failure mode: Pikapod outage. Resolution: Telegram alert, manual restart, log to incidents.

Status: [ ] TODO

---

### Task 13.1.2: Daily digest fires

Files: W13 morning + evening
Owner: System
Prerequisite: 11.2.3
Estimated time: ongoing

Verification:
```
# Morning digest 07:00 and evening 18:00 in last 24h
psql "$NEON_URL" -tA -c "
  SELECT COUNT(*) FROM digest_log 
  WHERE created_at > NOW() - INTERVAL '24 hours' 
  AND type IN ('morning','evening')
" | xargs -I {} test {} -eq 2
```

Expected output:
Both digests fired.

Description:
Daily verification that 07:00 morning and 18:00 evening digests fired in last 24 hours.

Status: [ ] TODO

---

### Task 13.2.1: Weekly Sunday review

Files: scripts/weekly-review.sh
Owner: System (Sunday 09:00 cron)
Prerequisite: Phase 12 complete
Estimated time: ongoing

Verification:
```
test -f reports/weekly-$(date +%Y-W%V).md
```

Expected output:
Weekly report generated.

Description:
Sunday 09:00 cron generates report covering past week:
- Pipeline health: lead counts by status, conversion rates per stage
- Template variant performance: top 3 winners, bottom 3 retirements
- Mail-tester scores per alias (rolling 7-day avg)
- Bounce rate per relay
- Reply rate by sector
- Sourcing coverage map (cells touched, leads produced)
- Compliance: any new regulator events affecting pipeline
- Aman action items for next week

Posted to Slack #aman-cos + Telegram.

Status: [ ] TODO

---

### Task 13.2.2: Bi-weekly gap scan (Mon/Thu)

Files: W11 chief-of-staff scan (already created Phase 11)
Owner: System
Prerequisite: 11.3.1
Estimated time: ongoing

Verification:
```
psql "$NEON_URL" -tA -c "
  SELECT COUNT(*) FROM gap_scan_runs 
  WHERE run_at > NOW() - INTERVAL '4 days'
" | xargs -I {} test {} -ge 1
```

Expected output:
At least one scan in past 4 days.

Status: [ ] TODO

---

### Task 13.3.1: Monthly review (1st of month)

Files: scripts/monthly-review.sh
Owner: System (1st of month 09:00)
Prerequisite: 13.2.1
Estimated time: ongoing

Verification:
```
test -f reports/monthly-$(date +%Y-%m).md
```

Expected output:
Monthly report exists.

Description:
1st of month 09:00:
- Framework version review prompt to Aman (quarterly bump version, document rule changes)
- Sector pitch refresh: which templates need rewrite based on reply data
- Source verification: any of 50 APIs broken, rate-limited, deprecated?
- Cost review: any subscriptions creeping unexpectedly?
- ROI by sector: CAC per sector, deals won, LTV
- Aman strategic decisions for next month

Report posted to Slack + summary to Telegram.

Status: [ ] TODO

---

### Task 13.4.1: Quarterly sector intelligence refresh

Files: scripts/quarterly-refresh.sh
Owner: System (1st of Mar/Jun/Sep/Dec)
Prerequisite: 13.3.1
Estimated time: ongoing

Verification:
```
# Last refresh within 100 days
psql "$NEON_URL" -tA -c "
  SELECT EXTRACT(DAY FROM NOW() - MAX(last_refreshed_at)) FROM sector_sources
" | awk '{print $1+0}' | xargs -I {} test {} -lt 100
```

Expected output:
Last refresh within 100 days.

Description:
Quarterly:
1. Re-scrape all 1000 sector sources (verify still live, fresh content)
2. Update sector_pitches with current pain stats and recent events
3. Review top-200 firm-type selection (any new sectors emerged? any retiring?)
4. Review 200-city matrix (new markets to add, removed)
5. PI insurance renewal review (re-quote at renewal date)
6. EU Article 27 rep review
7. ICO renewal (annual)

Aman approves changes before applied.

Status: [ ] TODO

---

### Task 13.5.1: Decision gates

Files: scripts/decision-gates.sh
Owner: System (alerts at 30/60/90/180 days)
Prerequisite: Phase 12 complete
Estimated time: ongoing

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM decision_gates"
```

Expected output:
Decision gates tracked.

Description:
Day 30 post-Phase 7 launch: Review 100/day vs 500/day scale decision
Day 60: Smartlead migration evaluation
Day 90: LinkedIn Sales Nav final keep/cancel decision
Day 90: GlockApps trial decision
Day 180: BIMI/VMC blue tick investment

Each gate: Aman receives Telegram prompt with data summary. Decision logged in decisions table.

Status: [ ] TODO

---

### Task 13.6.1: Phase 13 placeholder

Files: confirmations/phase-13-active.txt
Owner: System
Prerequisite: All 13.x.x setup
Estimated time: ongoing

Verification:
```
test -f confirmations/phase-13-active.txt
```

Description:
Phase 13 is continuous. Once initial setup complete, this confirmation indicates active state. No "complete" status, only "active".

Status: [ ] TODO

---

End of Phase 13.
