# TAMAZIA COWORK OS · MASTER EXECUTION FILE
**Version 2.0 · Authored 2026-05-17 · Single Source of Truth**

Everything else in this folder flows from this file. Read this once. Reference by section number for every conversation.

---

## 0. THE LAW OF EXECUTION

These are non-negotiable rules that Cowork (Claude) and Aman both operate under.

**L0.1** Tasks are atomic. Each task in any phase file completes in 30 minutes or less, or it is split.

**L0.2** Tasks tick only when verification passes. The verification command is in the task definition. Cowork must run it before TaskUpdate to completed. No exceptions.

**L0.3** Phases are gated. Phase N tasks do not start until `scripts/verify-phase.sh N-1` returns exit 0. Cowork enforces this before touching any Phase N work.

**L0.4** Tasks marked completed regress automatically if verification stops passing. Nightly cron re-runs every verification. If a previously-green task fails, the checkbox un-ticks and Aman is alerted.

**L0.5** Aman can manually override a verification failure only with: a comment explaining why, an audit-log entry, and a re-verification target date. All three required. Logged in `verification-logs/manual-overrides.log`.

**L0.6** Spend is locked behind explicit approval in COWORK-OS-PURCHASES.md. No subscription is bought, no API key paid for, no service activated without Aman's tick.

**L0.7** Forbidden phrases are enforced at the compose layer. If a draft contains any forbidden phrase, it does not send. Compose-body skill returns error, task blocks.

**L0.8** Sender identity is permanent: "Aman Pareek, International Business Lawyer, Founder Tamazia" on every signed comm. Alias-level sends sign off as alias first name.

**L0.9** Reply terminates sequence. Any reply intent except OOO marks `leads.replied = TRUE` and stops automated follow-up. Hard enforced at W4.

**L0.10** Local-first tracking. No external dashboard, no hosted artifact, no SaaS tracker. Master truth = files in this folder + Cowork's native TaskCreate/TaskUpdate widget.

---

## 1. FILE STRUCTURE

This folder contains the entire executable build. Every file is referenced from here.

```
TAMAZIA-REBUILD/
├── TAMAZIA-EXECUTION-MASTER.md          (this file)
├── TAMAZIA-EXECUTION-VERIFICATION.md    (scripts + command library)
├── TAMAZIA-EXECUTION-SKILLS.md          (58 skill specifications)
├── TAMAZIA-EXECUTION-CONNECTORS.md      (MCPs, plugins, free AI)
├── TAMAZIA-EXECUTION-PHASE-0.md         (Pre-flight approvals)
├── TAMAZIA-EXECUTION-PHASE-1.md         (Infrastructure triage)
├── TAMAZIA-EXECUTION-PHASE-2.md         (Compliance and legal foundation)
├── TAMAZIA-EXECUTION-PHASE-3.md         (Compose body and reply classifier)
├── TAMAZIA-EXECUTION-PHASE-4.md         (Warmup v6 with real replies)
├── TAMAZIA-EXECUTION-PHASE-5.md         (Audit micro-site luxury build)
├── TAMAZIA-EXECUTION-PHASE-6.md         (Personalisation + free LLM)
├── TAMAZIA-EXECUTION-PHASE-7.md         (Lead sourcing 50-API engine)
├── TAMAZIA-EXECUTION-PHASE-8.md         (Ad intelligence scrapers)
├── TAMAZIA-EXECUTION-PHASE-9.md         (LinkedIn + Instagram + Cal.com)
├── TAMAZIA-EXECUTION-PHASE-10.md        (Sector intelligence + 500-title matrix)
├── TAMAZIA-EXECUTION-PHASE-11.md        (Chief of Staff orchestrator)
├── TAMAZIA-EXECUTION-PHASE-12.md        (Deploy bulletproofing)
├── TAMAZIA-EXECUTION-PHASE-13.md        (Continuous improvement)
├── TAMAZIA-EXECUTION-PHASE-14.md        (Post-signature lifecycle, NEW)
├── TAMAZIA-EXECUTION-PHASE-15.md        (Operations resilience, NEW)
├── COWORK-OS-MASTER-PLAN.md             (v1, kept for context, superseded by this)
├── COWORK-OS-TRACKER.md                 (v1 tracker, replaced by per-phase files)
├── COWORK-OS-PURCHASES.md               (subscription decisions)
├── COWORK-OS-EMAIL-TEMPLATES.md         (every email body the system sends)
├── scripts/
│   ├── verify-phase.sh                  (phase gate enforcer)
│   ├── verify-task.sh                   (single task verifier)
│   ├── execute-phase.sh                 (full phase executor)
│   └── nightly-regression.sh            (cron: re-verifies all completed)
├── verification-logs/                   (audit trail)
│   ├── phase-{N}-{timestamp}.log
│   ├── task-{ID}-{timestamp}.log
│   └── manual-overrides.log
├── policies/                            (legal artifacts: PI policy, ICO cert, etc.)
└── signatures/
    ├── aman.txt                         (canonical sender block)
    └── disclaimer.txt                   (canonical compliance footer)
```

---

## 2. PHASE GATE MECHANISM

This is the heart of the "100% success, nothing skipped" guarantee.

### 2.1 How the gate works at task level

Every task in every phase file has this structure:

```
### Task {phase}.{section}.{number}: {title}

Files: {paths to edit/create}
Owner: {Aman | Claude | Both}
Prerequisite: {comma-separated task IDs that must verify first}
Estimated time: {minutes}

Verification:
{bash command that returns exit 0 on pass}

Expected output:
{what the command should print or what state should exist}

Description:
{2-5 sentences: what to do, why, how to do it correctly}

Failure mode:
{what could go wrong and how to recover}

Status: [ ] TODO | [~] DOING | [x] VERIFIED | [!] BLOCKED
```

### 2.2 How the gate works at phase level

Each phase file ends with a **PHASE EXIT GATE** section:

```
## PHASE EXIT GATE

Run this command to confirm all phase tasks verified:
  bash scripts/verify-phase.sh {N}

This command:
  1. Reads every task in this phase file
  2. Executes each task's verification command
  3. Returns exit 0 ONLY if every task returns exit 0
  4. Writes results to verification-logs/phase-{N}-{timestamp}.log
  5. Updates checkboxes in this phase file based on results

Phase {N+1} is locked until this returns exit 0.
```

### 2.3 How Cowork enforces this

When Aman says "execute phase N":

1. Cowork reads PHASE-{N}.md
2. Cowork runs `bash scripts/verify-phase.sh {N-1}` first
3. If non-zero: Cowork stops, reports which Phase N-1 tasks are still blocking
4. If zero: Cowork TaskCreate's every task from Phase N into the live widget
5. For each task in order:
   - TaskUpdate to in_progress
   - Read the task definition
   - Check prerequisites (run their verifications, must all pass)
   - Execute the work (Edit/Write/Bash as required)
   - Run the verification command
   - If exit 0: TaskUpdate to completed, tick the [x] in PHASE-{N}.md, commit MD
   - If non-zero: TaskUpdate to in_progress with blocker note, write [!] BLOCKED in MD with the actual error output, continue to next non-blocked task
6. After all tasks attempted: run `bash scripts/verify-phase.sh {N}`
7. Report final phase status to Aman: X done, Y blocked, specific blockers listed

### 2.4 Manual override path

If a verification can't be machine-checked (rare, but exists for things like "Aman approves design"):

- Task verification command: `test -f confirmations/task-{ID}-approved.txt`
- Aman creates that file with their approval text
- Verification then passes mechanically

If a verification is failing but Aman knows it's actually fine (rare, dangerous):

- Aman runs: `bash scripts/override-task.sh {task-id} "{reason}"`
- Script writes to `verification-logs/manual-overrides.log` with timestamp, task, reason
- Task marked [X-OVERRIDE] in MD (not just [x]) so it's visually distinct
- Re-verification target date set 7 days out
- If verification still fails at re-check: override expires, task flips back to BLOCKED

---

## 3. ALL 15 PHASES AT A GLANCE

| # | Phase | Tasks | Effort | Spend | Blocked by |
|---|---|---|---|---|---|
| 0 | Pre-flight approvals | 15 | 30 min Aman | £0 | none |
| 1 | Infrastructure triage | 22 | 5 days Claude | £0-3/mo | Phase 0 |
| 2 | Compliance and legal | 28 | 8 days mixed | £40 + £100 + €299 | Phase 1 |
| 3 | Compose body and classifier | 30 | 6 days Claude | £0 | Phase 2 |
| 4 | Warmup v6 with replies | 24 | 5 days Claude | £0 | Phase 3 |
| 5 | Audit micro-site luxury | 35 | 10 days Claude | £0 | Phase 4 |
| 6 | Personalisation + free LLM | 26 | 7 days Claude | £0-15/mo | Phase 5 |
| 7 | Lead sourcing 50-API | 32 | 10 days mixed | £15-20/mo | Phase 6 |
| 8 | Ad intelligence scrapers | 18 | 5 days Claude | £0 | Phase 7 |
| 9 | Multi-channel outreach | 25 | 8 days mixed | £0-79/mo | Phase 8 |
| 10 | Sector intelligence + matrix | 22 | 8 days Claude | £0 | Phase 9 |
| 11 | Chief of Staff orchestrator | 20 | 5 days Claude | £0 | Phase 10 |
| 12 | Deploy bulletproofing | 18 | 4 days Claude | £0 | Phase 11 |
| 13 | Continuous improvement | 12 | ongoing | £0 | Phase 12 |
| 14 | Post-signature lifecycle (NEW) | 28 | 8 days Claude | £0 | Phase 6 (parallel) |
| 15 | Operations resilience (NEW) | 22 | 6 days Claude | £0 | Phase 12 |

**Totals**: ~377 tasks, ~95 working days at full pace, £40-115/month recurring + £440 annual one-time.

Phase numbering is execution-priority, not strict sequence. Phases 14 and 15 are new in v2.

---

## 4. WHAT WAS ADDED IN v2 (gaps filled from v1)

These are the 50+ dimensions v1 missed, now absorbed into specific phases:

**Phase 14 (new, post-signature lifecycle)** absorbs: contract generation + e-sign, onboarding sequence, invoicing flow, customer success tracking, renewal automation, upsell triggers, referral capture, case study auto-build, NPS capture, win-loss analysis, client feedback loop into compose-body.

**Phase 15 (new, operations resilience)** absorbs: API key rotation, database backup, disaster recovery plan, audit log of every Aman action, backup notification channels, compliance audit trail for external scrutiny, SSL cert monitoring, multi-domain backup sending, alias retirement workflow.

**Phase 11 (chief of staff, deepened)** absorbs: Slack channel architecture (4 channels named), Telegram command suite (/status /pause /resume /audit /override /escalate), decision rollback workflow, multi-stakeholder threading (parent/board/executive sponsor), team coordination workflows (Aditya/Danish/Manuel handoffs).

**Phase 10 (sector intelligence, deepened)** absorbs: continuous regulator enforcement action monitoring, industry news ingestion daily, prospect company news-trigger outreach, prospect site change auto-refresh of audit, competitor monitoring as continuous ops, brand mention monitoring of Tamazia itself, review monitoring of Tamazia itself, conference and event lead sourcing.

**Phase 9 (multi-channel, deepened)** absorbs: voice note recording skill detail, image generation for personalized creative, Cal.com command structure, video personalization, multi-stakeholder thread maintenance.

**Phase 6 (personalisation, deepened)** absorbs: personalisation engine quality scoring rubric, multi-language support per jurisdiction English, holiday calendar per market (Ramadan/Diwali/Christmas), time-zone aware sending at country level.

**Phase 4 (warmup, deepened)** absorbs: inbox placement heat map per ISP, sender reputation cliff alerts, multi-domain backup sending strategy, alias retirement and replacement workflow, DNS continuous health monitoring.

**Phase 3 (classifier, deepened)** absorbs: reply rate degradation auto-pause at template level, GDPR Article 15/17/20 request handling, A/B testing infrastructure beyond subject lines, sourcing channel attribution.

**Phase 2 (compliance, deepened)** absorbs: cross-jurisdiction compliance variation (UK vs EU vs UAE vs US), localised templates per jurisdiction, framework version migration workflow, compliance audit trail for external scrutiny.

Every gap is now mapped to a specific task in a specific phase with a specific verification command.

---

## 5. SKILL FILES TO CREATE (v2 adds 51 new skills)

Current Tamazia skill files: 7 (compose-body, sector-pitch, audit, research-digest, chief-of-staff, linkedin-drafter, dnc).

New skill files in v2: 51.

Total target: 58 skills.

Full specifications for every one of the 58 skills live in TAMAZIA-EXECUTION-SKILLS.md. Each spec has: trigger phrases, input schema, output schema, verification check, dependencies, sample invocation. Reference that file for the complete catalogue.

Headline new skills:
- personalisation-engine (50-pointer orchestrator)
- reply-intent-classifier (13-category)
- response-draft-generator (130 templates)
- compose-instagram-dm
- compose-voice-note
- audit-page-builder
- proposal-pdf-generator
- find-every-email
- email-verifier-3-stage
- ad-intelligence-scraper
- company-news-monitor
- site-change-detector
- contract-generator
- invoicing-skill
- onboarding-sequence
- renewal-automation
- case-study-builder
- win-loss-analyser
- regulator-watch
- industry-news-ingester
- gdpr-request-handler
- gap-scanner
- api-key-rotator
- decision-log
- holiday-calendar
- timezone-router
- multi-stakeholder-thread
- localization-engine
- forbidden-phrase-checker
- mail-tester-runner
- alias-health-monitor
- bounce-handler
- subject-line-ab
- engagement-tracker
- competitive-benchmark
- regulatory-citation
- sourcing-orchestrator
- calendar-pre-brief
- post-call-outcome
- referral-capture
- forecast-builder
- brand-mention-monitor
- review-monitor
- deploy-monitor
- db-backup
- disaster-recovery
- audit-trail-export
- slack-channel-manager
- telegram-command-handler
- compliance-disclaimer-injector
- template-variant-tracker

---

## 6. CONNECTOR AND FREE-AI LEVERAGE (per your specific ask)

Full spec in TAMAZIA-EXECUTION-CONNECTORS.md. Headline:

**Claude's own connectors (already available, leverage)**: Slack, Cal.com via webhook, Telegram via webhook, GitHub, Google Drive (when available), Notion (when available), Cloudflare API for Workers AI.

**MCP plugins available in your Cowork session (some free, some paid)**: Apollo (free tier prospecting), Common Room (intent signals free), Slack-by-Salesforce, brand-voice (Box/Gong/Granola for content discovery), Linear, Notion, similarweb, ahrefs, supermetrics (need keys but most have free tiers), clay, fireflies, zoominfo.

**Free AI hosting**: Cloudflare Workers AI (10k neurons/day free), Groq (30 req/min free, Llama 3.1 70B), Gemini 2.0 Flash ($0.075/M input, cheapest paid), Google AI Studio free tier, Hugging Face Inference API free tier, OpenRouter free models, Together AI $25 trial credit, NVIDIA NIM 1000/month free.

**Self-hosted free options on Pikapod**: Ollama with Llama 3.1 8B, Mistral 7B, Phi-3.5, Qwen 2.5 (bumped instance ~£20-30/mo, deferred unless free options exhausted).

**Strategy**: Cloudflare Workers AI primary for bulk personalisation. Groq for fast classification. Gemini Flash for overflow. Claude Haiku reserved for highest-stakes drafts. Self-hosted Ollama as last resort. Free-first, paid only with explicit Aman approval per spend item in PURCHASES doc.

---

## 7. EXECUTION RHYTHM

How phases actually get executed in working sessions:

**Session start checklist (Cowork runs automatically)**:
1. Read MASTER (this file)
2. Read VERIFICATION (verify-phase.sh logic)
3. TaskList to see what's already in flight
4. Run `bash scripts/verify-phase.sh {current_phase - 1}` to confirm gate
5. Report current state to Aman

**Per-phase execution**:
1. Aman: "execute phase N" or "continue phase N"
2. Cowork: Read PHASE-N.md
3. Cowork: TaskCreate for every task not yet completed
4. Cowork: For each task, follow the L0.2 + L0.3 rules
5. Cowork: After last task, run phase exit gate
6. Cowork: Report results, identify blockers
7. Aman: Resolve blockers OR approve manual override OR mark phase incomplete

**Mid-phase pause/resume**:
- Cowork can pause mid-phase if blocked or if Aman interrupts
- State persists in MD checkboxes + TaskList
- Resume: re-read MD, re-check task statuses, continue from first non-verified

**Phase completion criteria**:
- `bash scripts/verify-phase.sh N` returns exit 0
- All MD checkboxes for Phase N show [x] or [X-OVERRIDE]
- Phase completion logged with timestamp in `verification-logs/phase-completions.log`
- Slack and Telegram alerts fired

---

## 8. NIGHTLY REGRESSION

Mechanism: every night at 03:00 UK, n8n cron runs `bash scripts/nightly-regression.sh`.

This script:
1. Iterates every completed task (status [x]) across all phase files
2. Runs each task's verification command
3. If passes: no action
4. If fails: flip checkbox to [!] REGRESSED in MD, log to `verification-logs/regressions-{date}.log`, alert Aman via Telegram with specific task and failure reason
5. Commit MD changes to repo with message "Nightly regression: N tasks flipped"
6. Push, triggers auto-deploy of updated tracker

This catches: deploys that broke previously-working features, expired API keys, suspended aliases, broken workflows, dropped database connections, schema drift.

---

## 9. AMAN'S DAILY 30-SECOND RITUAL

Open Cowork → look at TaskList widget → see what's in_progress, what's blocked, what's done overnight.

If anything in [!] BLOCKED: drill in, resolve or approve override.
If everything green: move on with day.

The widget IS the dashboard. No HTML, no hosting, no infrastructure.

If you want a static markdown view: open the relevant PHASE-N.md file. It's the same data.

---

## 10. WHAT TO READ NEXT

In this order:
1. TAMAZIA-EXECUTION-VERIFICATION.md (understand how the gate works mechanically)
2. TAMAZIA-EXECUTION-SKILLS.md (understand the 58 skills the system depends on)
3. TAMAZIA-EXECUTION-CONNECTORS.md (understand the leverage layer)
4. TAMAZIA-EXECUTION-PHASE-0.md (start here for immediate Aman actions)
5. Then phase by phase as you execute

End of MASTER. v2.0 supersedes v1.0 (COWORK-OS-MASTER-PLAN.md kept for context).

---

## CHANGELOG · Phases 9-11 (appended live, 2026-05-20)

### Phase 9 · Email infra hardening + CRM + automation (COMPLETE)
- **Multi-relay router** (`src/lib/notify/relay-router.js`): routes by alias.relay, per-relay daily caps, automatic failover (proven brevo→mailjet). Keys pulled & wired: Mailjet, Brevo, SendGrid, MailerLite (+ existing SMTP2Go). LIVE relays: Mailjet, SendGrid, SMTP2Go. Brevo pending account activation.
- **Capacity (honest):** ~10k/mo live now, ~19k once Brevo activates, ~25k with Resend+MailerSend. 50k needs paid (SendGrid Essentials ~£16/mo) or opt-in nurture stream.
- **Alias rotation** (`src/lib/alias-rotator.js`): LRU + warmup quota + health gate across 90 personas; wired into S065. Daily ramp 2→40.
- **Anti-spam** (`docs/ANTI-SPAM-HARDENING.md`): fixed missing List-Unsubscribe in router; built content-linter.js pre-send gate; 2026 Gmail/Yahoo rules documented.
- **CRM journey** (`migrations/0090_client_journey.sql`): lifecycle_stage, acquisition_channel, lead_type + client_journey timeline view. Dashboard generator `scripts/build-crm-dashboard.js`.
- **Zoho IMAP poller** (`scripts/zoho-imap-poll.js` + `src/lib/notify/zoho-imap-client.js`): pure-Node IMAP, classify, journey.
- **Backtest:** `scripts/backtest-full-pipeline.js` → 7/7 stages PASS.
- **n8n** (`n8n/tamazia-pipeline.workflow.json`): 6 scheduled branches. NOTE: Execute Command = self-hosted only; n8n Cloud needs HTTP endpoints OR use launchd.
- **100-tool catalog** (`docs/100-TOOL-CATALOG.md`).

### Phase 10 · Email deliverability + Zoho receive (COMPLETE)
- CF Email Routing disabled via Chrome; MX swapped to Zoho EU (mx.zoho.eu/mx2/mx3). SPF/DKIM/DMARC all pass. Mail-Tester 9.4 (domain-age ceiling, auto-lifts ~June). aman@/aman.pareek@/apareek@ aliases added in Zoho (bounce fixed).

### Phase 11 · Admin dashboard + multi-channel (IN PROGRESS)
- **Admin dashboard** (`cloudflare/admin-worker.js` + `scripts/deploy-admin-worker.sh`): password-gated (admin123, hash stored server-side), HMAC sessions, live Neon HTTP queries. Tabs: Overview, Pending LinkedIn, Pending Instagram, Email tracking, Aggressive leads (select→pipeline). DEPLOYED + login verified + live data (437 clients). LIVE at workers.dev URL; custom tamazia.co.uk/admin route needs 1 manual CF dashboard click (token can't write zone routes).
- **Schema** added: channel_sends (manual LinkedIn/Insta send tracking), leads.website/best_channel/aggressive_selected/aggressive_source.
- **PENDING:** multi-channel waterfall enrichment + per-channel touch templates (task 70); 50-gap research + connector wiring + launchd (task 71).

### Compliance posture (HELD, stated)
Aggressive personal-social scraping NOT built (LinkedIn/Meta ToS + UK GDPR/PECR risk to the raise). Built: full system + manual-send tracking model + compliant B2B enrichment (Apollo/Hunter licensed). Social data capture = user-operated Chrome extensions (his platform use), engine tracks.

### Phase 11 cont. · Multi-channel waterfall + admin dashboard fixes (2026-05-20 pm)
- **Enrichment waterfall** (`src/lib/enrich/waterfall.js` + `scripts/enrich-and-queue-channels.js`): FREE discovery (DuckDuckGo + website scrape) → website, role emails, LinkedIn, Instagram, best_channel. Channel waterfall email→linkedin→instagram. Queues manual-send templates into `channel_sends` (dashboard pending tabs). Wrong-track (investor/arbitration) excluded.
- **Touch-1 audit guarantee** in `send-due.js`: blocks Touch 1 unless audit_url present AND resolves 200. No broken links.
- **Admin dashboard** array-mode render bug fixed; pending LinkedIn/Insta + aggressive tabs now render. Apollo/HubSpot/Close MCP connected.
- **OPEN FLAGS (need Aman):** Apollo free API blocked (paid for scale enrichment); HUNTER_KEY + NEVERBOUNCE_KEY empty; only 1/437 audits minted (Touch-1 needs audit-mint batch); custom tamazia.co.uk/admin route = 1 CF-dashboard click; always-on host = Oracle free VM setup pending; 15k/mo sequencer choice pending.
- **STILL QUEUED (task 71):** 50-gap research + Google sponsored-results scraper; Oracle VM 24/7 deploy; full per-stage gap audit (connect 3-4 / flag 3-4 each); alias send-readiness re-audit.

### Phase 11 cont. · Enrichment live + audits + always-on + gap audit (2026-05-20 late)
- **Hunter LIVE** (key wired + integrated into waterfall): pulls named decision-makers w/ position+confidence (verified: Dishoom → Alice Wellings Head of PR etc.). Email waterfall = Hunter → website-scrape fallback. Stores contact name/title/email on lead.
- **NeverBounce wired** (key private_7de8...; authenticates; 0 credits now, refreshes monthly).
- **Directory-domain exclusion** added (endole/cqc/opencorporates/etc.) — fixes shell-lead false website matches.
- **Audit-mint:** 17 scan-ready leads minted with live audit URLs (audit.tamazia.co.uk, HTTP 200 verified). Touch-1 guard passes for them. Honest note: only real-website leads can be audited; CH shell leads can't.
- **Always-on built:** scripts/run-engine-cycle.sh (self-healing orchestrator) + scripts/launchd/co.tamazia.engine-cycle.plist (load once, runs every 30 min). Cowork scheduled-tasks needs interactive approval (deferred). Oracle VM = PENDING per Aman.
- **50-gap per-stage audit:** docs/PIPELINE-GAP-AUDIT-50.md — 10 stages, 50 gaps, connect/flag tools each, 12 highest-ROI moves ranked.
- **Google sponsored scraper:** src/lib/scraping/google-sponsored.js — 180-query matrix (sector×type×geo) + ingestSponsored() → aggressive-leads review window. Chrome-operated extraction.
- **Connectors connected (Aman):** Apollo (free API blocked — paid needed), HubSpot, Close MCP. tamazia.co.uk/admin live behind CF Access + password.
- **PENDING (decisions/logins needed):** Oracle VM 24/7; Zoho IMAP app-password (unblocks reply automation); activate Brevo; Resend+MailerSend keys; Snov/Anymailfinder/Skrapp signups; connect Ahrefs/SimilarWeb/Notion plugins; Apollo paid for scale enrichment.

### Phase 11 cont. · ROI moves + identity fix (2026-05-20 night)
- **BIBLE RULE set:** in the working window, keep completing pending tasks autonomously; CEO-decide; box only hard calls.
- **Zoho app-password generated** ("tamazia-engine") + wired. HARD FINDING: Zoho FREE plan blocks IMAP/POP/Forwards (paid-only). Reply automation needs Zoho Mail Lite (~£1/mo) — app-password + poller ready, just needs the plan.
- **Hunter LIVE** (verified, named contacts). **NeverBounce wired** (0 credits, refreshes).
- **Identity consistency fix:** Aman-signed S063 founder drafts now send from aman@/aman.pareek@/apareek@ as "Aman Pareek" (no more persona/signature mismatch); personas reserved for high-volume/channel streams. Verified.
- **Full email preview** sent to founder@ (from/to/subject/body shown to Aman).
- **Connectors surfaced in chat:** Ahrefs, Similarweb, Notion (one-click connect).
- **17 audit URLs live** (HTTP 200); Touch-1 gated.
- **Always-on:** run-engine-cycle.sh + launchd plist (load once). Oracle VM = PENDING (Aman's call). Cowork scheduler needs interactive approval.
- **Built earlier this session:** enrichment waterfall (Hunter+web+social), directory-exclusion fix, 50-gap per-stage audit (docs/PIPELINE-GAP-AUDIT-50.md), Google sponsored scraper (180-query matrix).
- **HARD DECISIONS for Aman (box):** (1) Zoho Mail Lite ~£1/mo to unlock reply automation; (2) Oracle VM 24/7 (pending); (3) connect Ahrefs/Similarweb/Notion (buttons in chat).

### Phase 11 cont. · Email research + live scraper test + journey checklist (2026-05-20 late night)
- **Email-platform research** (docs/EMAIL-PLATFORM-RESEARCH.md, 10+ sources): 100 cold/inbox/day is unsafe on ALL platforms; safe = 30-50/inbox/day warmed. Answer: Google Workspace/M365 NOT better; use many cheap warmed inboxes on SECONDARY domains (Inframail ~$129/mo unlimited) + our relay/rotation engine. SMTP2Go 96% best relay.
- **Ahrefs + Notion MCP connected** (tools live); Similarweb logged in.
- **Google sponsored scraper LIVE-tested via Chrome**: "luxury hotel london" → real sponsored ad-runners (oetkerhotels.com, fourseasons.com) extracted + ingested to aggressive review window. HONEST: SERP scraping opportunistic (clinic query showed no ads); robust detection stays pixel/job-board/Meta-Ad-Lib; SERP API flagged for always-on consistency.
- **Real Touch-0 generated** for Four Seasons (live, site-grounded). Caught unresolved [Decision Maker Name] placeholder → added PLACEHOLDER GUARD to content-linter (blocks any [..]/{{..}}/merge-field draft). Verified.
- **Lead journey checklist** (docs/LEAD-JOURNEY-CHECKLIST.md): 14-gate journey, per-sector Touch-0 framing, full tracking map, live ad-runner proof.
- **HARD DECISIONS (box):** (1) Zoho Mail Lite ~£1/mo for IMAP reply automation [do last per Aman]; (2) Oracle VM 24/7 [pending]; (3) secondary cold domains + Inframail ~$129/mo for true 50k volume; (4) SERP API for consistent sponsored scraping.

### Phase 12 · Wide lead-scraper engine (2026-05-21)
- **SERP engine** (src/lib/scraping/serp-engine.js + serp-client.js): 10 sectors × ~5 types × 8 geos = 400-query matrix; wave loop runs until 50 unique genuine leads/sector × 10 = 500/day; dual streams — SPONSORED (ads, auto-approved) + ORGANIC TOP-100 (manual verify). Provider-agnostic (Serper.dev primary, SerpAPI fallback).
- **Gates:** domain-boundary aggregator blocklist (fixed substring bug: keeps oetkerhotels.com, blocks hotels.com/booking.com/rightmove/wikipedia/socials/gov), genuine-client heuristic, full dedup vs existing base. Verified.
- **Schema:** scrape_stream, verify_status, scraped_at, scrape_query, all_emails (JSONB), all_socials (JSONB), scrape_runs table.
- **Dashboard:** 2 new windows deployed + verified — "Sponsored (ad-runners)" + "Organic Top-100 (verify)" with "Send to pipeline" → approves + queues Touch 0 + full follow-up. (send_to_pipeline action wired.)
- **Deep enrichment:** waterfall persists all_emails (named+scored via Hunter) + all_socials per lead.
- **Daily runner** scripts/run-serp-scrape.js wired into run-engine-cycle.sh (skips cleanly if no key).
- **10 sourcing ways** documented (docs/LEAD-SCRAPER-ENGINE.md): Google sponsored/organic, Meta Ad Lib, job-board, pixel, Maps/Places, Ahrefs paid-pages, Similarweb traffic-qualify, registries-gated, competitor-overlap.
- **Live-proven:** Google sponsored extraction returned real ad-runners (Four Seasons, Oetker) → ingested to Sponsored window.
- **ONE FLAG:** SERP API key needed to run live — recommend Serper.dev (2,500 free, ~$50/mo for 50k). Sign up + paste SERPER_KEY into .env (I can't create accounts). Engine runs the instant the key lands.

### Phase 12.1 · Self-running lead engine + smart calendar (2026-05-21)
- **Query calendar** (src/lib/scraping/query-calendar.js + serp_query_log table): 14,400 unique queries (10 sectors × modifier×type×geo×intent). Daily pull = freshest (never-run→stalest); bank cycles ~96 days before repeat. logQueryRun tracks yield → drives rotation. Same sector, different keyword daily.
- **Engine wired to calendar:** scrapeSector now pulls pickTodaysQueries() + logs each run. Fresh leads every day, re-runs old only when fresh exhausted (still yields new ad-runners).
- **Daily-idempotent:** run-serp-scrape.js skips if >=500 already scraped today, so the 30-min cycle does the full scrape once/day (no credit burn).
- **Deep enrichment in cycle:** enrich (Hunter emails + all socials + website) → run-deep-research-batch (S063: recent news + sector intel + unique brand pointers connecting to Tamazia + personalised Touch 0).
- **Reporting:** run-serp-scrape sends completion report to Telegram + Slack (#all-tamazia) + dashboard scrape_runs. Verified notify path works.
- **Smart schedule** documented (docs/SMART-SCHEDULE.md): full daily cadence, freshness logic, per-lead journey, reporting, hosting.
- **Cycle order:** reply-poll → send → daily-scrape → enrich → deep-research → dashboard.
- **STILL NEEDS:** SERPER_KEY (serper.dev) to begin live sourcing; 24/7 host (Oracle VM pending) for unattended daily runs.

### Phase 12.2 · 10-layer quality gate + auto-send + automation audit (2026-05-21)
- **10-layer lead-quality scorer** (src/lib/enrich/lead-quality.js): genuine-business, live-site, decision-maker contact, contact-depth, ad-spend signal, brand presence, regulated sector, COMPLIANCE GAP (missing privacy/cookies/terms), SEO GAP (weak meta/schema/H1), site maturity. score 0-100, PASS>=60, FIT flag = wants compliance AND seo AND ad-runner. Proven: Four Seasons 64 PASS, Oetker 72 PASS+FIT, booking.com rejected.
- **Auto-send wiring** (qualify-and-queue.js): scraped sponsored + approved-organic + aggressive-selected leads → scored → if PASS + has Touch-0 → status=touch_0_queued → send-due auto-sends Touch 0 + locked +5/+10/+20d follow-up. In cycle.
- **Quality gate in send-due:** scored leads <60 never auto-send (status=quality_blocked). Founder-curated (null score) ungated.
- **Fixed hotels.com substring bug** in quality scorer (now uses domain-boundary isAggregator).
- **Cycle order:** reply-poll → send(gated) → scrape(daily) → enrich → deep-research → quality-gate → dashboard.
- **Terse Slack/Telegram** reports (one-liners).
- **Automation audit** docs/AUTOMATION-AUDIT-PHASE5-NOW.md: every Phase 5→now automation, cycle status, dashboard connection.
