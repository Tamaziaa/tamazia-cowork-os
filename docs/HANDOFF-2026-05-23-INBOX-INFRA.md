# HANDOFF — 2026-05-23 · Inbox Infrastructure (MailDeck) session
Self-contained pickup for the next chat. Resume EXACTLY from here. Compiled 2026-05-23.

This session was entirely about the **email-sending infrastructure layer** that sits under the existing Tamazia Cowork OS engine: choosing an inbox provider, the warmup model, the domain strategy, and the sending rail. The engine itself (sourcing → enrich → qualify → personalise → send → reply-capture → cockpit) is unchanged and is documented in PROJECT-MEMORY.md §1-13. This file + PROJECT-MEMORY.md §14 are the new state.

---

## 0. READ ORDER TO RECONSTRUCT STATE
1. `PROJECT-MEMORY.md` (whole file; §14 is this session)
2. This file
3. `SECRET-KEYS.md` (vault)
4. `TAMAZIA-EXECUTION-MASTER.md` (law of execution + phases)
5. `docs/PENDING-ROADMAP-PHASES-0-15.md`
Then `node scripts/health-check.js` for live engine state.

---

## 1. WHERE WE ARE RIGHT NOW (exact)
- **MailDeck Growth purchased/purchasing**: $99/mo, 30 Google Workspace inboxes, 6 domains (5/domain), 20 cold/inbox/day safe ceiling.
- **In the MailDeck Quick Start wizard at "Export to Sequencer".** It will not advance without connecting a sequencer.
- **Manyreach connected** (free, no billing clock) to clear the wizard AND serve as the free warmup engine. Safe settings used: Reply Rate 32, Warmup Daily Limit 10, Email Daily Limit 12, Email sending gap 90.
- **6 lookalike domains bought at Fasthosts**: tamazia.uk, tamazia.store, tamazia.info, tamazia.online (4-bundle £1.50) + tamaziagroup.uk + tamaziagroup.co.uk (free 1st yr).
- **Real domains protected**: tamazia.co.uk = official (Zoho, 5 accounts) + booking link + signature anchor; tamazia.in = official/warm Asia. NEITHER is ever used for cold.
- Kill-switch `system_state.paused = TRUE` (must stay until first real personalised email is approved).

## 2. EVERY DECISION MADE THIS SESSION
1. Provider = MailDeck (beat Puzzle Inbox).
2. Plan = Google Workspace Growth $99/30-inbox (Google core = link-safe + tracking-safe; Outlook only for plain-text volume later).
3. Diversified/Outlook volume = DEFERRED until copy proven + client needs >600/day.
4. Add-ons (EmailShield/MailReply/LeadSonar/Scaling Room) = SKIP, redundant with engine.
5. **Warmup runs in the SEQUENCER, not MailDeck** (Growth Google is not pre-warmed). Never disconnect all sequencers or warmup stops.
6. Rail = Manyreach free for WARMUP + our own engine for COLD (coexist on same inboxes, safe). PlusVibe premium (~$30-40/mo all-in-one) is the alternative if we want turnkey over free.
7. Domains: cold from lookalikes only; real domains are trust anchors; lookalikes 301→tamazia.co.uk; sign/link with tamazia.co.uk.
8. Remove Fasthosts "Mail Basic 5" mailboxes (MX conflict + bad for cold); reply capture via free Cloudflare catch-all.
9. Buy 8 domains, run 6, keep 2 warm reserve (free replacement covers cost; reserve covers warmup time). One spare = Asia-cold lookalike.
10. Risk: complaints <0.1% (0.3% kill line), bounces <2%; ~60% infra / 40% our copy+list; engine rotates domains before burn.
11. Warmup→cold ramp + 6-month model agreed (see PROJECT-MEMORY §14.6).
12. 1-week timeline reality flagged: new Google inboxes can't safely send real volume in wk1 (15-day warmup); pre-warmed Outlook is the only true wk1 option.

## 3. PENDING DECISIONS (Aman)
- **D1 — Final rail**: (A) Manyreach-warmup + own-engine-cold [£0, needs mailbox-pool build] vs (B) PlusVibe premium all-in-one [~$30-40/mo, no build]. Leaning toward maybe PlusVibe later.
- **D2 — 1-week sprint**: buy a small pre-warmed Outlook batch ($50/tenant) to send in wk1, or accept real volume from wk3?
- **D3 — Reserve domains**: buy the 7th + 8th now?
- **D4 — Remove Fasthosts Mail Basic 5** from the basket before paying.

## 4. PENDING BUILD (Claude — engine side)
- **B1 — Mailbox-pool in src/lib/notify/relay-router.js**: load 30 MailDeck SMTP/IMAP creds, round-robin per mailbox, per-inbox daily caps + the warmup→cold ramp, shared suppression + dedup. (Router currently rotates across relay PROVIDERS, not individual mailboxes — this is the real change.)
- **B2 — Reply capture**: Cloudflare catch-all on each of the 6 lookalikes → amangotselected@gmail.com → existing S012/S013 classifier.
- **B3 — Encode ramp caps** in S065 send-due (cap schedule = PROJECT-MEMORY §14.6).
- **B4 — (later/flagged)** warmup network in-engine = real engineering; until then keep the warmup sequencer.

## 5. CARRIED-FORWARD PENDING (pre-existing, still open)
- T-D / SA grant: GA4 prop 536210909 Viewer + Search Console; push GOOGLE_SA_KEY_B64 into GitHub ENV_B64.
- T-E: Gmail "Send mail as" founder@ / aman@.
- **First REAL lead end-to-end → paste for approval → release kill-switch** (#1 priority).
- Brevo activation; rotate reused admin+SMTP password (security).
- Build backlog: open/click tracking, Touch 4/5, reply approve→auto-send.

## 6. IMMEDIATE NEXT ACTIONS (in order)
1. Aman: finish MailDeck (Manyreach connected) → confirm Prewarm/warmup running on all 30 → MailDeck Exports → download the 30 SMTP/IMAP creds CSV.
2. Aman: remove Fasthosts Mail Basic 5; set Cloudflare catch-all on the 6 lookalikes → amangotselected@gmail.com.
3. Claude: build B1 mailbox-pool from the creds CSV; encode B3 ramp caps.
4. Claude: run first real lead → paste email for approval → release pause.

---

## 7. THE FINAL PICKUP PROMPT (paste this into the next chat)

> Continue the Tamazia Cowork OS build. Read `/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/PROJECT-MEMORY.md` (especially §14) and `docs/HANDOFF-2026-05-23-INBOX-INFRA.md` first — that is the full state. Do not re-derive; pick up from there.
>
> Context in one line: I bought MailDeck Growth ($99, 30 Google Workspace inboxes, 6 lookalike domains, 5/inbox-domain, 20 cold/day ceiling). Warmup runs in the connected sequencer, NOT in MailDeck, so I connected Manyreach (free) as the warmup engine. Cold sending will run on my own Cowork OS engine. Real brand domains tamazia.co.uk (Zoho official, 5 accts) and tamazia.in (Asia official) are NEVER used for cold — cold goes only from the lookalikes (tamazia.uk/.store/.info/.online, tamaziagroup.uk/.co.uk), each 301→tamazia.co.uk.
>
> Settled rules: never cold-send from real domains; complaints <0.1% (0.3% kill line), bounces <2%; per-inbox warmup→cold ramp (wk1 0 → wk6 20/inbox/day, fleet ~600/day = ~13,200 real/mo from month 2); keep a warmup sequencer connected at all times or warmup stops; buy 8 domains run 6 keep 2 warm reserve; system_state.paused stays TRUE until the first real personalised email is approved by me.
>
> Open decisions waiting on me: (D1) final rail Manyreach+own-engine vs PlusVibe premium; (D2) buy pre-warmed Outlook for week-1 sends or wait to week 3; (D3) buy reserve domains 7-8; (D4) remove Fasthosts Mail Basic 5.
>
> What I want you to do next: (1) once I export the 30 MailDeck SMTP/IMAP creds, build the mailbox-pool in `src/lib/notify/relay-router.js` (round-robin per mailbox, per-inbox caps, the ramp schedule, shared suppression + dedup) and encode the ramp caps in S065 send-due; (2) set up reply capture via Cloudflare catch-all on the 6 lookalikes → amangotselected@gmail.com → S012/S013; (3) then run the first real lead end-to-end and paste the email for my approval before any send. Also still open from before: T-D GA4/GSC SA grant + ENV_B64 push, T-E Gmail send-as, Brevo activation, rotate the reused admin+SMTP password. Lead with your recommendation on D1-D4, then proceed.

---
*Backed up in two places: this file + PROJECT-MEMORY.md §14. Both gitignored-safe (no secrets/PII in either; creds live only in .env / SECRET-KEYS.md / the MailDeck Exports CSV).*
