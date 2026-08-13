# TAMAZIA COWORK OS · PROJECT MEMORY (end-to-end source of truth)
Single consolidated state of the whole system. Read this first in any new session, then SECRET-KEYS.md and the docs/ audits. Last synced 2026-05-23 (NEW: §14.12 = live MailDeck/PlusVibe audit + warmup engine + touch fix + final emails; §14.11 = mailbox-pool; handoffs in docs/HANDOFF-2026-05-23-INBOX-INFRA.md, docs/HANDOFF-2026-05-23-MAILBOX-POOL-BUILD.md, docs/HANDOFF-2026-05-23-AUDIT-AND-WARMUP.md).

---

## 1. What this is
An autonomous cold-outreach + compliance/SEO lead engine for Tamazia. Sources leads → enriches → quality-gates → personalises → sends multi-touch email (with LinkedIn/Insta manual windows) → captures + classifies replies → tracks the full client journey → surfaces everything in a cockpit and an hourly intelligence brief. Built by AI-assisted prompting; Aman does not write code or use a terminal.

## 2. The live 30-minute cycle (scripts/run-engine-cycle.sh)
reply-poll → send (gated) → daily-scrape → enrich → deep-research → verify (free) → dedupe → quality-gate → health-check → dashboard. Plus a separate **hourly** intel-pulse.

## 3. 24/7 host — LIVE
- GitHub Actions on repo **Tamaziaa/tamazia-cowork-os** (private). Owner is the user account "Tamaziaa". Token = `GH_TOKEN` (classic, scopes repo+workflow) in .env.
- Secret **ENV_B64** = base64 of .env, encrypted (libsodium sealed box) into repo Actions secrets. The whole env is there; no key sits in the repo.
- Two workflows: `engine-cycle.yml` (every 30 min) and `intel-pulse.yml` (hourly). Both decode ENV_B64 → run node.
- Repo push hygiene: secrets + PII are gitignored (.env, SECRET-KEYS.md, INFRASTRUCTURE-INVENTORY.md, docs/API-KEYS-REGISTRY.md, confirmations/, client_email_files/, backups/, logs/, uploads/). Every push is scanned against literal secret values before pushing.
- To push engine changes: clone repo to /tmp, rsync the workspace in with the exclude list, secret-scan, commit, push (the mounted folder blocks git's lockfiles, so git must run in the sandbox FS, not the mount).

## 4. Email — sending (LIVE) and receiving
- **Relays (multi-relay router, failover + daily caps + Message-ID):** SMTP2Go, Resend, Mailjet, SendGrid, Brevo all live. MailerSend dropped (24h token). MailerLite = nurture only. Both tamazia.co.uk and tamazia.in authenticated (SPF/DKIM/DMARC) in Brevo.
- **Aman-identity rule:** drafts signed "Aman Pareek" send from aman@ identities; persona-rotated aliases for the rest. 90 sending aliases (45 per domain) in rotation.
- **Receiving (cold replies):** route through **tamazia.in** (already MX=Cloudflare) catch-all → **amangotselected@gmail.com** (Gmail u/3 in the browser; free IMAP, app password saved). The poller reads that Gmail, classifies (14-cat), writes inbound_emails (dashboard) + sets leads.replied/sends.replied_at, and posts Slack+Telegram. Baseline UID set so only NEW mail is processed. A Gmail filter labels all @tamazia.in/@tamazia.co.uk mail "Tamazia Replies" + never-spam.
- **Zoho** hosts tamazia.co.uk team mailboxes (founder@ etc., 5 users). Zoho free has no IMAP/forward — DO NOT pay for it. To bring .co.uk + founder@ replies into the same Gmail, move tamazia.co.uk MX to Cloudflare catch-all → Gmail (see Open Items).

## 5. Pipeline + tracking accuracy (all fixed this project)
- **Canonical send log:** send-due now writes every send to the `sends` table (lead, alias, recipient, subject, Message-ID, relay, touch, time). Previously it only updated outreach_drafts, so new sends were invisible. `sends` is the one source of truth the dashboard + reply-matching read.
- **Email column fix:** sender reads `COALESCE(email, contact_email)` (enrichment writes contact_email; the empty `email` column was why nothing sent).
- **Opt-out / compliance hard-gate:** send selection excludes unsubscribed/bounced/replied/manually-handled/completed leads (both email_sequence_state and inbound classification). Opt-outs are honored.
- **Test-data guard (critical):** send selection excludes acquisition_channel like %test%/%seed% and lead_type investor/institution/internal. The send queue had been full of internal_test brands + a LexQuity investor (ADQ), armed to send, blocked only by the email-column bug. Queue cleared (status excluded_nonprospect). Health probe `test_in_send_queue` fails if any reappear.
- **Reputation auto-pause:** send halts a cycle if 7-day bounce rate >= 8% (fail-open).
- **Dedupe:** non-destructive; marks duplicate-domain leads suppressed, keeps the most-progressed as primary (duplicate_of). In cycle.
- **Free verifier:** commercial-grade, £0 (Hunter + DIY syntax/typo/disposable/role/MX/SMTP/catch-all/greylisting). Replaces MillionVerifier/NeverBounce paid. In cycle (verify-contacts.js). Cheap paid backstop if ever wanted: MillionVerifier (~$0.0005/email) or Bouncer.
- **Quality gate:** 10-layer scorer, PASS>=35, applied across SERP + ad-intel (W14) + aggressive streams.

## 6. Self-diagnosis — health engine (LIVE)
`scripts/health-check.js`: ~32 live probes across infra/keys/liveness/sourcing/quality/send/alias/deliverability/reply/data. Writes `system_health`. Cockpit Health tab shows score + fail/warn/ok per category. Current: ~88-90%, 0 fail (warns: send stalled, legacy relay attribution, emailable-unscored — all self-resolving). Adversarial detail in docs/50-SCENARIO-ADVERSARIAL-AUDIT.md.

## 7. Cockpit — LIVE (tamazia.co.uk/admin, behind Cloudflare Access SSO)
Cloudflare Worker (cloudflare/admin-worker.js), Claude light theme, deploy via scripts/deploy-admin-worker.sh. Sections: Today (action queue), Health, Replies, Pipeline+scraping (charts), Deliverability (charts), LinkedIn/Instagram/Sponsored/Organic/Aggressive. Resilient queries (one failure can't blank it). Rendered + tested against live data: zero JS errors. NOTE: gated by CF Access email-OTP — Claude cannot view the deployed page; verification is done by rendering locally with live data. Backlog: docs/DASHBOARD-REBUILD-PLAN.md (100 changes + 50 efficiency pointers; ~top third shipped).

## 8. Hourly intelligence brief — LIVE
`scripts/intel-pulse.js`: PhD-level analysis of the live pipeline → Slack + Telegram (summary + 3 ranked improvements + critical flags). Gemini → Groq failover → deterministic fallback. Hourly via intel-pulse.yml. The `metrics` object has marked slots for external sources (gsc_*, ga_*, form_leads_*, crm_*) to plug in.

## 9. Decisions settled (answered end-to-end)
- LexQuity market = international arbitration. No pivots. (identity)
- Zoho: do NOT pay; £0 reply path via tamazia.in + Cloudflare + Gmail. (Zoho forces all-5-seats; alias cap 30 makes 1 seat unviable anyway.)
- Relays: 5 live; MailerSend dropped.
- Verification: free verifier primary, no paid credits.
- Host: GitHub Actions (chosen over Oracle VM) — free, no server admin.
- Verifier/Apollo: MillionVerifier verifies, it is NOT an Apollo replacement (Apollo finds; Hunter+SERP cover finding).

## 10. OPEN ITEMS awaiting YOUR action (recommended answer noted)
1. Confirm the tamazia.in Cloudflare catch-all → amangotselected@gmail.com is enabled + the destination verified (4 clicks). Without it, cold replies don't reach the Gmail. **Recommended: do it.**
2. tamazia.co.uk MX move to Cloudflare catch-all → Gmail (+ founder@ rule) to unify .co.uk + founder@ replies. Decommissions Zoho mailboxes into forwards (history stays in Zoho). **Needs your explicit go.** All 5 Zoho accounts are yours, so it's clean.
3. Gmail "Send mail as" for the identities you reply as by hand (founder@, aman@). SMTP creds in hand (SMTP2Go user `tamazia.co.uk`). Do .in identities now, .co.uk after the MX move.
4. SECURITY (URGENT): rotate the reused admin+SMTP password (the value shared in chat). It guards the cockpit AND the SMTP relay and was committed to repo history once — rotating it makes the leaked value worthless. Use a distinct SMTP password going forward.
5. External-source sync (the "everything in one place" ask): (a) where do website form leads land — HubSpot (connected) or a native form needing a webhook? (b) Google Analytics is NOT connected — connect GA4 or use Ahrefs Web Analytics? (c) Search Console — add a Google API key/service account so the autonomous host can pull it (Ahrefs MCP is agent-side only). Each plugs into intel-pulse `metrics` + the cockpit.
6. Disable any legacy n8n send workflows (W2/W4) on PikaPod so send-due is the sole writer to `sends` (avoid double-logging).
7. Build backlog (no decision needed, just sequencing): open/click tracking pixel; per-relay reputation + cap-vs-usage bars; cockpit auto-refresh + last-cycle banner; reply approve→auto-send.

## 11. Known data realities (not bugs)
- Queue is starved of REAL sendable leads (it was all test/seed/investor data, now excluded). Real sends need the sourcing→enrich→qualify→draft chain to run on genuine prospects via the host. Health `sendable_real_leads` shows this truthfully.
- 195 historical `sends` lack relay attribution (legacy send path); new router-logged sends record it.
- Gemini free quota gets exhausted by deep-research; Groq failover covers analysis.

## 12. Credentials & sources
Full vault: SECRET-KEYS.md (gitignored). Connected MCPs (agent-side): Ahrefs (SEO+GSC), Apollo, Close, HubSpot, Google Drive, Notion. NOT connected: Google Analytics. Engine API keys live in .env (Neon, Cloudflare, SERPER, Hunter, 5 relays, Gemini, Groq, Cal.com, Slack, Telegram, Gmail IMAP, GH_TOKEN).

## 13. How to reconstruct state next session
Read: PROJECT-MEMORY.md (this) → **§14 below + docs/HANDOFF-2026-05-23-INBOX-INFRA.md (latest session, inbox infra)** → SECRET-KEYS.md → docs/50-SCENARIO-ADVERSARIAL-AUDIT.md → docs/DASHBOARD-REBUILD-PLAN.md → docs/PENDING-ROADMAP-PHASES-0-15.md → TAMAZIA-EXECUTION-MASTER.md. Then run `node scripts/health-check.js` for live state.

---

## 14. INBOX INFRASTRUCTURE LAYER — MailDeck (session 2026-05-23)
This layer sits UNDER the existing engine. The §4 relays stay as transactional/fallback; this adds dedicated WARMED cold-sending mailboxes on throwaway lookalike domains so the engine stops sending cold from the real brand domains.

### 14.1 Provider + plan — DECIDED & PURCHASING
- Provider **MailDeck** (maildeck.co), chosen over Puzzle Inbox (Puzzle cheaper on Google but smaller/newer op, lower per-inbox volume, fewer guarantees).
- Plan **Google Workspace "Growth" = $99/mo · 30 inboxes · 6 domains (5/domain) · 20 cold/inbox/day safe ceiling.** Google is the core because it is link-safe + open-tracking-safe; Outlook strips links (Safe Links) and breaks open tracking, so Outlook is plain-text volume only (add later for >600/day toward 1000/day; Outlook warms in 3-7d).
- DEFERRED (not bought): MailDeck Diversified "Starter" ($99, ~40K/mo but 210/215 inboxes plain-text Outlook/SMTP). Revisit only when copy is proven + a client needs raw volume.
- Add-ons EmailShield / MailReply / LeadSonar / Scaling Room: ALL skipped, redundant with the engine.

### 14.2 CRITICAL — warmup runs IN THE SEQUENCER, not in MailDeck
- MailDeck = infra + DNS + clean IPs. Ongoing inbox warmup runs INSIDE the connected sequencer (per MailDeck docs + G2), NOT inside MailDeck. The only "warm without a sequencer" product is paid Pre-Warmed Outlook ($50/tenant) — our Growth Google inboxes are NOT that.
- So **disconnect all sequencers → warmup STOPS and inboxes drift.** (Corrects an earlier wrong claim that MailDeck warms independently.)
- Resolution: keep a FREE warmup source connected (Manyreach, free) doing WARMUP ONLY, run cold via our own engine. Warmup tool + sending tool on the same inbox is standard/safe if warmup(~10/d) + cold(ramp) stays under the ceiling.
- Our engine has NO warmup network of its own. Building one = real engineering (FLAGGED). Until built, never drop the warmup sequencer.

### 14.3 Sequencer / sending rail — state + OPEN decision
- MailDeck Quick Start "Export to Sequencer" wizard will NOT advance without connecting one of SmartLead / Manyreach / Instantly / Plusvibe / Outengine(soon). Sidebar (Mailboxes/SMTP/Exports/Prewarm) is independent of the wizard.
- ACTION TAKEN: connected **Manyreach** (free, 250 credits, NO time limit, NO card = only no-billing-clock option) to clear the wizard AND act as the free warmup engine. Safe connect values ("Recommended Settings"): Reply Rate 32, Warmup Daily Limit 10, Email Daily Limit 12, Email sending gap 90. Do NOT max (max Email Daily Limit = burn).
- Confirmed: CAN switch/disconnect sequencers after setup (yes); CAN run own engine via SMTP creds from Exports/SMTP sidebar (yes); warmup will NOT auto-continue on MailDeck if all sequencers removed (no — see 14.2).
- OPEN DECISION: final rail = (A) Manyreach free warmup + our own engine for cold [£0, needs mailbox-pool build] vs (B) PlusVibe premium all-in-one [~$30-40/mo, warmup+tracking+follow-up+unified inbox, zero engineering, fastest]. Aman leaning to possibly take PlusVibe premium later. Reco: turnkey (Manyreach now / PlusVibe later) for the 1-wk sprint, migrate to own engine once mailbox-pool is built + proven.

### 14.4 Domain architecture — DECIDED
- NEVER cold-send from real brand domains. **tamazia.co.uk = official only (Zoho, 5 accounts) + booking link + signature anchor. tamazia.in = official/warm Asia only.** Trust anchors, never the cold cannon.
- Cold goes ONLY from throwaway lookalikes. Bought at Fasthosts: tamazia.uk, tamazia.store, tamazia.info, tamazia.online (4-bundle £1.50) + tamaziagroup.uk + tamaziagroup.co.uk (free 1st yr) = 6 lookalikes for the 6-domain Growth plan.
- TLD trust: .uk/.co.uk strongest; .store/.info/.online weaker but usable.
- Each lookalike 301-redirects to tamazia.co.uk; emails LINK to + sign with tamazia.co.uk for credibility while the lookalike absorbs all risk.
- REMOVE Fasthosts "Mail Basic 5" mailbox line-items (MX conflicts with MailDeck Google Workspace on the same domain; Fasthosts shared mail is bad for cold). Reply capture = free Cloudflare catch-all instead.
- Reserve: buy 8 domains, run 6, keep 2 warm in reserve (20-25%). Free domain replacement covers COST of a burn; warm reserve covers TIME (fresh replacement = ~2-3 wks warmup; warm spare swaps in 1-3 days). One spare can double as the Asia-cold domain so real .in is never used for cold.

### 14.5 Risk model (web-verified 2026-05-23)
- Domain burn at enterprise scale (50M+/mo): 10-20%/mo. Our profile (low volume, compliance-led, verified lists): far lower — low single digits or near-zero for months.
- Hard thresholds (Gmail active enforcement since Nov 2025): spam complaints <0.1% target / 0.3% kill line (permanent 5.7.x rejects above); bounces <2%.
- ~60% deliverability = infra (MailDeck). ~40% = our copy + list + targeting + pacing (us/engine). MailDeck cannot save a domain from bad copy or a dirty list.
- Protection = engine health-check catches bounce/placement drift early and rotates a domain BEFORE full burn.

### 14.6 Warmup ramp + 6-month volume model (cap schedule to ENCODE in engine)
- Per-inbox cold/day: wk1 0 (pure warmup), wk2 3, wk3 8, wk4 13, wk5 17, wk6+ 20.
- Warmup/inbox/day: ramp to ~15 wk1, ~25-30 wk2-3 peak (while cold low), taper to ~12-15 maintenance forever.
- Fleet (30 inboxes): cold ≈600/day by wk6 = ~13,200 real/mo from month 2; 6-month real-lead total ~68-70K. Warmup never zero.
- First real cold ~day 10 (cleanest, most-verified leads first). Full volume wk6.

### 14.7 The 1-week timeline reality — FLAG
Standard Google Growth inboxes need ~15d warmup → you CANNOT safely send real cold volume in week 1 from the new MailDeck inboxes. To book meetings in wk1 you need already-warm capacity. Options: (a) add a small batch of MailDeck PRE-WARMED Outlook ($50/tenant, ready now, plain-text only) for wk1 sends while the Google fleet warms for the wk3+ push; or (b) accept wk1-2 = warmup + list/copy prep + a tiny day-10 trickle, real volume wk3. Do NOT blast new Google inboxes early to hit the date — that burns them.

### 14.8 Engine integration — PENDING BUILD (Claude)
1. **Mailbox-pool in src/lib/notify/relay-router.js**: load 30 MailDeck SMTP/IMAP creds (MailDeck Exports CSV), round-robin across mailboxes, per-inbox daily caps + warmup→cold ramp (14.6), shared suppression + dedup (no double-touch). Today the router rotates across RELAY PROVIDERS, not individual mailboxes — this is the real change.
2. **Reply capture for the 6 lookalikes**: Cloudflare catch-all each → amangotselected@gmail.com → existing S012/S013 classifier.
3. **Encode ramp caps** in S065 send-due so the engine never overshoots per-inbox.
4. Keep `system_state.paused = TRUE` until the first real personalised email is approved.

### 14.9 Carried-forward pending items (from §10, still open)
- T-D / SA: grant SA Viewer on GA4 prop 536210909 + add to Search Console (Google propagation); push GOOGLE_SA_KEY_B64 into GitHub ENV_B64 secret.
- T-E: Gmail "Send mail as" for founder@ / aman@ (SMTP creds in hand).
- **First REAL lead end-to-end → paste email(s) for approval → then release paused kill-switch** (#1 priority; engine built but never run on a real lead).
- Brevo account activation; rotate the reused admin+SMTP password (SECURITY, urgent).
- §10.2 tamazia.co.uk MX-to-Cloudflare is now DEPRIORITIZED: .co.uk stays official on Zoho; cold replies arrive via lookalikes; keep .in catch-all for legacy.
- Build backlog: open/click tracking, Touch 4/5, reply approve→auto-send, per-relay reputation bars.

### 14.10 Spend log (this session)
- MailDeck Growth $99/mo (committed). Fasthosts domains ~£2.28 + 2 reserve (a few £). Manyreach £0. Frostbite £0 (optional wk1 trickle bridge, 5-inbox free).
- Net new recurring = $99/mo MailDeck only. PlusVibe premium (~$30-40/mo) only if option (B) chosen later.

### 14.12 LIVE AUDIT + WARMUP ENGINE + TOUCH FIX + FINAL EMAILS (session 2026-05-23c, Claude, via Chrome)
**Drove Chrome through MailDeck + PlusVibe. Ground-truth state (overrides earlier assumptions):**
- **REAL 6 domains = tamazia.info, tamazia.online, tamazia.store, tamazia.uk, tamaziatop100.com, tamaziaworld.uk** (NOT tamaziagroup.*). Order "Google Workspace" Delivered, 30 inboxes (5/domain). Order id cc8f4328-3d8b-417d-8866-95a625d2111a.
- **30 inboxes = FEMALE personas, firstName.lastName@domain** (e.g. reagan.caldwell@tamazia.info, jasmine.haverford@tamaziaworld.uk). Full roster in `config/maildeck-roster.json` (gitignored, no passwords). IMPLICATION: cold mail sends AS the persona; Aman/King's becomes the firm anchor in the body (cannot sign "Aman Pareek" from a female inbox).
- **MailDeck SMTP product = "COMING SOON"** (not usable as a relay). **Exports = empty / order-detail "Loading…" stuck / `/api/orders` exposes addresses + names but NO inbox passwords** (provisioning{} empty, admin_password null). So the 30 app-passwords are NOT retrievable from MailDeck yet → HARD BLOCKER for any sending/warmup. Path: MailDeck support (Intercom) to enable the credential export / deliver app-passwords.
- **MailDeck "Prewarm" = a domain marketplace (buy pre-warmed), NOT ongoing warmup of our inboxes.** MailDeck does not warm our inboxes.
- **PlusVibe connected (email/password, 14-day trial) but email-accounts page is EMPTY — 0 inboxes attached, 0 sequencer profiles. So NO warmup is running anywhere.** The MailDeck "Uploading ✓" step did not actually push inboxes to PlusVibe. PlusVibe's native warmup (UI) does NOT need the business-plan API key; the API key is only for OUR engine to control it programmatically.
**Decision: go sequencer-free. Built our own £0 warmup (no Manyreach/PlusVibe needed).**
- **New: `src/lib/notify/warmup-engine.js`** — peer-to-peer warmup: our 30 inboxes warm EACH OTHER (Google-to-Google is fine, web-verified). Ramp wk1 ~12 → wk2-3 ~28 peak → wk5+ ~14 maintenance (never zero). Sends tagged [tzwu:…] mail via pool SMTP; receiver side (compact IMAP-over-TLS) marks read, rescues from Spam→Inbox, replies to ~33% (reply rate = strongest signal). Pure logic tested (pairing/ramp/token). Runs the moment creds load. `migrations/2026-05-23-warmup-engine.sql` (warmup_daily_usage, warmup_log).
- **TOUCH SYSTEM FIX (why touches weren't firing):** `qualify-and-queue.js` only admitted scrape_stream sponsored/organic_top100/aggressive — silently excluding ALL local_search + null-stream prospects. 398 real leads were stuck at status='new', never scored, so the cadence never started. Broadened eligibility to any genuine prospect with a domain + real contact (test/investor still excluded; quality gate + token gate unchanged). PROOF: eligible-for-queue went 0 → 32 emailable real leads. (~366 others need email enrichment first.)
- **FINAL EMAIL SEQUENCE:** `templates/FINAL-SEQUENCE-PROFESSIONAL-SERVICES.md` — polished persona-sent Touch 0-3 + reply handlers for UK law firms. Hooks: specific ranking-gap finding, competitor outranks you, AI-invisibility, SRA transparency signals. USPs: King's-trained founder (legal-fluent SEO), scan-first value, 8-weeks-not-18-months, onboarding migration included. Deliverability-safe (forbidden-phrase compliant). Replaces the weak auto-drafts (e.g. lead 78 "uses Google Tag Manager").
- **Reconciled real domains** in `scripts/setup-lookalike-catchall.js` default list.
**THE ONE BLOCKER:** 30 inbox app-passwords (MailDeck export not yet functional). Everything downstream (warmup, cold, first send) waits on this. NOT a code problem.
**Deferred this session (lower priority than the above, creds-gated anyway):** Fasthosts nameserver→Cloudflare check (needed before the catch-all script runs), 30-GitHub-repo + prior-chat-transcript deep sync, and actually running qualify+enrich live on the 32 leads.

### 14.13 DECISIVE — MailDeck support answers (session 2026-05-23d, via Intercom "Maya" AI agent)
**This overrides the "send cold from our own engine" plan. Read carefully.**
- **MailDeck Google Workspace Growth is API-delivered into a SEQUENCER. You do NOT get per-inbox SMTP/IMAP logins or the 30 Google account passwords — ever.** Maya (verbatim gist): "the inboxes are connected to your sequencer via API, so you normally won't get per-inbox logins to copy out (that's why Exports can be empty and SMTP shows coming soon)... there isn't a place in our flow where you're given 30 Google account emails + passwords... the setup is API-based." Confirmed again: switching sequencer is allowed (Smartlead/Instantly/PlusVibe/others) but "there isn't a place to retrieve per-inbox SMTP/app-passwords for your own tool."
- **CONSEQUENCE: our own-engine raw-SMTP sending (mailbox-pool.js) and the £0 peer warmup engine CANNOT run on these 30 MailDeck inboxes.** They are only reusable if we later buy inboxes from a provider that exposes SMTP creds. Not wasted, but stranded for now.
- **PlusVibe is empty because provisioning hasn't finished.** Order configured May 22; Maya: provisioning takes 2-3 business days → inboxes should appear in PlusVibe ~May 26-27. Warmup "starts automatically during provisioning" (days 1-2 creation + DNS + warmup begins; from ~day 3 cold can run alongside). NB treat the "day 3 cold" claim with caution vs the 15-day Google norm; ramp conservatively.
- **STRATEGIC PIVOT (recommended): engine = the BRAIN, sequencer = the SENDING ARM.** Keep all the engine value (sourcing, enrich, verify, 10-layer quality gate, personalization, the FINAL email sequence, reply intelligence, cockpit, intel-pulse) and push ready leads + copy into a supported sequencer via its API; read replies/stats back. Smartlead (unlimited inboxes + unlimited warmup, strong API, ~$39-94/mo) is the best fit; PlusVibe is already connected (14-day trial) for an immediate start; Instantly is the alt. £0 sending is NOT achievable with MailDeck Growth — a sequencer is mandatory.
- **TOUCH FIX PROVEN LIVE:** qualify-and-queue (broadened eligibility) scored 5 real law firms; 3 PASSED and entered the cadence (Streathers 90 FIT, Solidum 90 FIT, Edwards Duthie Shamash 78) → status=touch_0_queued (held by paused kill-switch). The cadence now actually fires for real leads.
- **SECURITY: GitHub token is embedded in plaintext in `.git/config` remote URL (ghp_...). Rotate it + use a credential helper.** Only ONE repo exists (Tamaziaa/tamazia-cowork-os), not 30 — the "30 repos" reference is unresolved (likely from a prior session; 51 sessions exist). Needs Aman to clarify.
- **Research (sequencers):** Smartlead = no provisioning, connect inboxes via IMAP/SMTP or API, unlimited accounts + warmup. Instantly = unlimited mailboxes on paid, 4M-inbox warmup pool, built-in lead DB. Both connect to inboxes the same way a sequencer must; none change the fact that MailDeck won't hand us raw creds.

### 14.14 DISCOVERY AUDIT + REMEDIATION PLAN (session 2026-05-23e, Claude + subagent)
Full docs: **docs/DISCOVERY-AUDIT-2026-05-23.md** (subagent, exhaustive) + **docs/SENDING-PATH-AND-REMEDIATION-PLAN.md**.
- **~60% of the system is BUILT BUT UNWIRED.** Live cycle runs ~11 scripts; dormant: S028-sourcing-orchestrator (→ sendable_real_leads=0, only 27/408 leads have email), S060+S062 enrichment (→ 91% null quality), S064 touch-renderer (→ broken seam with S065 sender; queue never refilled), S025 audit-page-builder (→ Touch 1 link has no source), S023 mail-tester, S019 open/click, S024 bounce, S016 alias-health, S033 ad-intel, S036 regulator-watch. Dead scripts: backtest-full-pipeline.js, quality-loop.js, pre-send-pipeline.js.
- **Neon:** 71 tables + 7 views; ~25 orphaned. Warmup duplicated (old warmup_pairs/warmup_reply_queue unwired + new warmup_daily_usage/warmup_log). FIXED THIS SESSION: applied mailbox-pool + warmup migrations → mailbox_pool, mailbox_daily_usage, cold_recipient_log, warmup_daily_usage, warmup_log now exist.
- **Leads:** 408 real, 27 emailed (6.6%), 7 scored>=60, 404 new + 4 touch_0_queued. health _overall 84 FAIL (sendable=0, null_quality 91%, relay_unknown 99%).
- **Phase 14 (revenue ops: invoices/onboarding/forecasts) + Phase 15 (aman_actions, DR runbooks) = 0 built, fully pending.**
- **MailDeck reality (confirmed):** infra-only, no in-app send; SMTP product "coming soon"; Google Workspace API-delivered, no extractable creds. MailDeck DOES sell an SMTP product (gives creds, lower trust) — relevant migration option.
- **Sending plan:** month-1 via PlusVibe-trial/Smartlead on the MailDeck inboxes; month-2 migrate to a creds-providing reseller (Maildoso/Mailforge/Hypertide class) for own-engine. 12-15K is a month-2 number; month-1 safe ≈ 5-8K (15-day warmup).
- **30 repos: NOT recoverable** — the prior session ("Tamazia OS installation setup") transcript ends at Aman's question before the reply listing them. Need Aman to reopen that chat or approve fresh research.
- **DECISIONS PENDING (Aman):** (1) sending path PlusVibe vs Smartlead; (2) green light to wire dormant skills into the live cycle (Section C order); (3) 30-repos: re-research or paste; (4) rotate the GitHub token leaked in .git/config.

### 14.15 PIPELINE WIRING + 5-LAYER TEST (session 2026-05-23f, Claude)
**MailDeck workaround: FINAL/CLOSED.** Maya confirmed all four avenues are NO: (a) no sending API, (b) no in-app SMTP date + no per-inbox SMTP exposure, (c) cannot export the 30 app passwords, (d) connecting Smartlead does not surface reusable SMTP creds. There is NO way to send from our own engine with these MailDeck inboxes. Plan stands: month-1 via a sequencer; month-2 migrate to a creds-providing reseller for own-engine.
**Built + wired + tested this session (the seam that makes touches work):**
- **NEW `scripts/render-due-leads.js`** — the missing link: finds qualified leads (lifecycle_stage='qualified' / score>=60) with a real email and NO clean Touch-0 draft, calls S064.renderAll → writes Touch 0-3 + sets status='touch_0_queued'. Idempotent. Root-cause fix: qualify only queued leads that ALREADY had a draft, and nothing rendered them, so the cadence never filled.
- **WIRED into run-engine-cycle.sh:** added S028 sourcing (env-gated SOURCING_ENABLED, after SERP scrape) and render-due-leads (after qualify, before health). Cycle is now: poll → send(gated) → SERP → **S028 source** → enrich → deep-research → verify → dedupe → qualify → **render(S064 seam)** → health → dashboard.
- **GitHub token:** scrubbed from the local .git/config remote (now tokenless https). Aman MUST still revoke+regenerate it on GitHub + update .env GH_TOKEN + re-push ENV_B64 (I cannot create tokens).
- **5-LAYER TEST PASSED:** (1) syntax JS+bash OK; (2) all modules require() OK; (3) cycle parses, 12 steps, targets exist; (4) render-due idempotent (0 due after render); (5) LIVE: S028 sourced 48 London law firms via free OSM + deduped (0 new, correct); render produced full 4-touch drafts for 2 fresh qualified leads (Oetkerhotels, Four Seasons). SAFETY verified: paused=true, 0 cold sends. health 80% (3 fails are freshness timers from the dev env, clear when the host runs).
- **COPY NOTE / decision:** the wired renderer S064 uses its OWN built-in campaign angle ("feature you in our 2026 'Best UK [sector]' piece + complimentary £1,500 Compliance+SEO audit + DA87 backlink", signed Aman). This DIFFERS from templates/FINAL-SEQUENCE-PROFESSIONAL-SERVICES.md (the "you rank below competitor X" angle, persona-sent). Aman to pick which campaign runs; S064's is live now. Both still sign Aman → persona/from reconciliation still pending at send time.
- **STILL DORMANT (next tracks, not done):** S025 audit-page-builder (Touch 1 currently uses a fallback audit URL, not a real generated page), telemetry S023 mail-tester / S019 open-click / S024 bounce / S016 alias-health, S033 ad-intel + S036 regulator-watch into scoring, email-coverage enrichment (still ~6.6%; wire find-every-email/S060 harder), Phase 14 (revenue ops) + Phase 15 (action layer/DR) = 0 built. Fasthosts nameserver check still pending.

### 14.16 BIG BUILD-OUT: 7-touch + S025 + telemetry + email enrich + Phase14/15 + Fasthosts (session 2026-05-23g)
**MailDeck direct-send: re-confirmed CLOSED** (Maya: no sending API, no SMTP product date / no per-inbox SMTP, no app-password export, no reusable creds via Smartlead). Own-engine on these inboxes = impossible; sequencer for month-1, migrate month-2.
**Sequencer answer:** PlusVibe free trial (1,000 emails, 3 warmup inboxes) is NOT enough for month-1. Cheapest viable = **PlusVibe Personal $37/mo** (25k emails/mo, unlimited warmup, already connected); Smartlead Base $39 = alt with stronger API. £0 sending impossible with MailDeck Growth.
**7-TOUCH SEQUENCE (built+tested):** rewrote S064 render.js from 4→7 research-optimized touches (250-source 5-agent study). Lowercase subjects, <100 words, soft interest-CTAs (~3x), gratitude closers, King's credential as quiet context (touch 4), per-lead audit hooks, in-thread, breakup (touch 6). Cadence days [0,3,7,12,19,28,40] in send-due (MAX_TOUCH=6). 8/8 pure tests + live render = 7 distinct drafts, idempotent. Signs "Aman Pareek" (SENDER_SIGNATURE env to swap for persona at send).
**WIRED INTO LIVE CYCLE (now 16 steps):** + S028 sourcing, + find-emails.js (scrape-published-emails first, then pattern/role probe — note SMTP probe needs port 25 which most hosts block; scrape path is the workhorse), + build-audit-pages.js (S025 → leads.audit_url; Touch 1 now embeds a REAL signed /audit/ URL, verified), + render-due-leads.js (the seam), + S016 alias-health, + S019 re-engagement scan. S024 bounce-handler (needs relay webhooks) + S023 mail-tester (stub + send-dependent) FLAGGED for deployment, not cron-wired.
**Email coverage:** 27/42 leads-with-domain (64%) now have an email (the 6.6%-of-408 figure counted leads without websites). find-emails lifts it each cycle via website scraping.
**PHASE 14 + 15 FOUNDATION (subagent, tested):** 16 tables created+verified (client_accounts, invoices, payments, onboarding_tasks, forecasts, ... + aman_actions, api_key_rotations, dr_drills, decision_rollbacks). 3 working skills: S039 invoicing, S022 forecast roll-up, S048 action-queue. docs/runbooks/DISASTER-RECOVERY.md (9 scenarios). Foundation-complete; remaining phase skills (S037/38/40-45, S046/47/49/50) are schema-only. Detail: docs/PHASE-14-15-FOUNDATION-2026-05-23.md.
**FASTHOSTS:** all 6 domains registered there (exp 22-May-2027), on FASTHOSTS nameservers (not Cloudflare). Do NOT move NS now (would break MailDeck Google MX). Cloudflare catch-all only needed for month-2 own-engine; under sequencer plan replies come via the sequencer inbox.
**GitHub token:** scrubbed from local .git/config; Aman must still revoke+regenerate on GitHub.
**SAFETY (final):** paused=true, 0 cold sends, 16-step cycle syntax-stable x2. Health freshness fails are dev-env timers (clear on host).
**STILL OPEN:** pick sending path (PlusVibe $37 vs Smartlead $39); resolve sender identity (Aman vs female persona) at send; remaining phase skills; S024/S023 deployment wiring; rotate token; 30-repos still unrecovered (need Aman to reopen that chat).

### 14.17 VERIFIED SEQUENCER TERMS + 10-PARAM SCRAPER (session 2026-05-23h)
**Sequencer terms VERIFIED in-app (correcting earlier guesses):**
- PlusVibe FREE TRIAL = 3 inboxes + 1,000 emails only → NOT enough for month-1.
- PlusVibe PERSONAL $37/mo = 25,000 email sends/mo + warmup + UNLIMITED email accounts + unified inbox + AI writer. NO webhooks/API (Business-only). → COVERS our send volume (~18k cold < 25k) + 30 inboxes; engine loads leads via CSV, replies via unified inbox. CHEAPEST that fits capacity.
- PlusVibe BUSINESS $77/mo = 150k sends + advanced warmup + Webhooks & API → needed only if our engine must auto-push leads / auto-pull replies.
- Smartlead BASE $39 = only 6,000 sends/mo → NOT enough (my earlier "$39 alt" was WRONG). Smartlead PRO $94 = 90k sends + warmup + unlimited inboxes + API = the real Smartlead tier for us.
- HONEST REC: start PlusVibe Personal $37 (covers full sending+warmup capacity, unlimited inboxes); upgrade to Business $77 only for API automation. Smartlead Pro $94 if you prefer Smartlead's API-first stack.
**10-PARAMETER WEBSITE SCRAPER — built + wired + tested:**
- NEW src/lib/enrich/website-intel.js: per firm extracts (1) all on-domain emails, (2) people [name+title+email], (3) company LinkedIn, (4) Instagram, (5) other socials, (6) phone+address, (7) SEO signals (title/meta/h1/schema/mobile/blog/word-count), (8) compliance signals (privacy/cookie/terms/accessibility/SRA#/regulated), (9) news, (10) services/practice-areas — PLUS derived audit pointers (P0/P1) for the touch hooks. Zero-dep HTTP (works on port-25-blocked hosts). High-precision people extractor (rejects junk names).
- NEW scripts/scrape-intel.js: writes all 10 params to leads (website_intel jsonb, people, all_emails, all_socials, linkedin_url, instagram_handle, phone, contact_email, personalisation_pointers) AND sets first_name/last_name/title from the best scraped senior person → touches address the real decision-maker by name. migrations/2026-05-23-website-intel.sql (website_intel, people cols).
- WIRED into cycle (replaced find-emails.js). Cycle still 16 steps, syntax-stable x2.
- PROVEN end-to-end on Streathers Solicitors (id 48): scraped LinkedIn + Instagram + phone + person "Jessica Palmer, Head of Family Law" + 2 SEO pointers → score 90 → real signed audit URL → 7-touch sequence opening "hi Jessica," citing the real finding ("no meta description, so search + AI snippets are auto-generated"). Email coverage honest gap: firms hiding emails behind forms (e.g. Streathers) yield socials+people but no email → use LinkedIn/Insta channel or named pattern-guess.
**FRESH 5x10 RUN:** full pipeline (source→scrape→qualify→audit→render-7-touch) is wired + proven on real leads; the full 5-leads x 10-sectors matrix now ACCUMULATES automatically via the cycle (S028 rotates 10 sectors by hour). Did NOT brute-force all 50 live this turn (hundreds of slow scrapes); 3 law-firm leads fully review-ready, Streathers fully showcased to Touch 2. paused=true throughout, 0 sends.

### 14.18 $37 OPERATING FLOW + DOMAIN RESOLVER + PLUSVIBE EXPORT + FOOTER (session 2026-05-23i)
**$37 (no-API) workaround DOCUMENTED + BUILT — full runbook in docs/PLUSVIBE-37-FLOW.md.** Honest: $37 Personal has NO API/webhooks → cannot pull replies/stats every 15 min; flow is push-based (engine→CSV→PlusVibe upload; replies worked in PlusVibe Unified Inbox). $37 covers capacity (25k sends/mo + unlimited inboxes + warmup ≥ our 13-18k cold). Reply-automation needs $77 (webhooks) or Smartlead.
**GAP FOUND + FIXED — domain coverage:** only 42/408 leads had a website (90% name-only from SEC/CH → unscrapeable). NEW scripts/resolve-domains.js (SERP company→website, directory-blocklist, idempotent, domain_resolve_failed flag) wired into cycle BEFORE scrape-intel. Proven live (resolved clinics → real sites). migrations/2026-05-23-domain-resolver.sql.
**NEW scripts/export-to-plusvibe.js** — the function-without-API mechanism: exports queued+7-touch leads to exports/plusvibe-<stamp>.csv (26 cols: lead fields + all_emails + socials + audit_url + touch0..6 subject/body) + a *-social.csv for email-hidden leads (LinkedIn/Insta). PlusVibe sequence step N = {{touchN_subject}}/{{touchN_body}} → fully-rendered per-lead copy survives with no templating loss. BACKTEST caught + fixed: Postgres base64 wraps at 76 chars with newlines → was truncating bodies; fixed by stripping newlines in SQL. Validated: 2 leads, 26 cols, footer present, 7 touches filled, parses clean.
**BRANDED FOOTER on every touch (S064):** "TAMAZIA · tamazia.co.uk" wordmark + registered address + reply-"stop" opt-out (UK PECR/CAN-SPAM compliance). Image logo intentionally avoided on cold (spam signal). Open-tracking pixel intentionally OFF (PlusVibe tracks natively; pixel on plain-text cold hurts deliverability) — env hook TRACK_PIXEL_URL for future own-engine HTML sends.
**SCALE:** batch sizes env-driven (RESOLVE_BATCH/SCRAPE_BATCH/...); cycle now 17 steps. HONEST host ceiling: GitHub Actions free (2,000 min/mo) sustains a few hundred fully-processed leads/day, NOT 5,000/day (500×10). For true scale move cycle to a ~$5/mo always-on VPS. scrapers have try/catch error isolation + timeouts + retry (fetchWithRetry / AbortController).
**STILL OPEN (unchanged):** pick PlusVibe $37 vs $77 vs Smartlead; sender identity; rotate GitHub token; release kill-switch on first approval; 30-repos unrecovered.

### 14.19 PERSONA SIGNATURE + REPO STACK + FINAL WORKFLOW (session 2026-05-23j)
**SENDER IDENTITY DECIDED = PERSONA.** S064 now signs each lead as its deterministic female persona (id % 30 from config/maildeck-roster.json); founder Aman/King's referenced THIRD-PERSON in touch 4 ("our founder, Aman Pareek, read law at King's"). export-to-plusvibe adds sender_email + sender_persona columns so the sequencer pins each lead to its persona's inbox (From matches signature). Verified: lead 48→Lisa Cabot, 88→Dina Ashenden, 514→Caitlin Gainsborough; no stray "Aman" sign-off; founder ref present.
**REPO STACK EVALUATED → docs/STRONGEST-PIPELINE-REPOS.md.** Verdicts: ADOPT google-maps-scraper (volume sourcing w/ site+phone+email = the 200/day-with-website unlock), searxng (free SERP, replaces SERPER cost), crawl4ai (JS-aware 10-param scrape), theHarvester (hidden-email OSINT), reacher (email verify HTTP), gpt-researcher (selective deep research), splink (dedupe at scale), bullmq+Redis (24/7 orchestration, Node-native). EXTRA: BillionMail (own SMTP inboxes) + Coldflow/OutreachStudio (self-hosted sequencer) = month-2 own-infra to escape MailDeck's no-creds wall entirely.
**THE INTEGRATION TRUTH:** all repos except bullmq are Go/Rust/Python services → need ONE always-on ~$5/mo VPS (Docker). The free GitHub-Actions host CANNOT do 200/day full-scrape (minute cap + no persistent services). The VPS is the single highest-leverage spend; engine is already modular (env batch sizes) to plug them in.
**REPLY AUTOMATION (perfect way, 3 tiers):** $37 = PlusVibe's INCLUDED AI Reply Label Detection (auto-tags replies in Unified Inbox, ~5min/day triage) + sequencer auto-runs the 7 touches + daily CSV feed. $77/Smartlead = webhooks→our engine→S012 classify→S013 auto-draft→approve→send (zero-touch). Own-infra = BillionMail+IMAP+S012/S013 loop, £0. Touches run automatically once the sequence is set; engine only feeds new leads daily.
**FINAL FLOW doc = docs/PLUSVIBE-37-FLOW.md (operations) + docs/STRONGEST-PIPELINE-REPOS.md (scale architecture).** paused=true, 0 sends throughout.

### 14.20 PLUSVIBE $37 VERIFIED IN-APP + CREDENTIAL FOOTER + VPS (session 2026-05-23k)
**Credential footer (per Aman) on every touch:** Founder Aman Pareek, LLM Int'l Business Law King's; £110M+ generated; 840% organic growth; 882% peak client revenue growth; 200+ laws/campaign. (Flagged: stat-heavy footers raise spam risk on cold; kept single-line lowercase; env-overridable TAMAZIA_CREDS.)
**PLUSVIBE $37 VERDICT — VERIFIED in the live app (built a test campaign "Tamazia Pipeline Test" — Aman can delete):**
- ✓ Sequences: multi-step (Add Step), per-step custom Wait (0/3/4/5/7/9/12 → our cadence), A/B variations, subject + rich body, AI writer, built-in spam/quality score.
- ✓ Merge variables: {{first_name}}{{last_name}}{{company_name}}{{city}}{{state}}{{country}}{{phone_number}}{{job_title}} standard; CUSTOM CSV columns auto-become merge tags (PlusVibe standard) → {{audit_finding}}{{audit_url}}{{sender_persona}} work.
- ✓ Subsequences tab = reply branching; stop-on-reply is the default → a reply auto-cancels that lead's remaining touches (also enforced engine-side: send-due excludes replied=TRUE).
- ✓ Capacity (verified earlier): 25k sends/mo + warmup + unlimited inboxes ≥ our 30-inbox/13-18k need.
- VERDICT: **$37 Personal fully runs the SENDING pipeline** (7 auto-scheduled touches, exact copy via native templates, 30 inboxes, warmup, stop-on-reply). The ONLY thing it does NOT do = automated reply ingestion into our engine (no API/webhooks) → that's $77. So lock $37 to LAUNCH; upgrade to $77 only when reply volume justifies zero-touch.
- ONE thing to confirm in PlusVibe Settings: per-lead "sending account" assignment (so From matches {{sender_persona}}). If only rotation is available, either run 1 campaign/persona or use a neutral "Tamazia team" sign-off. Export already provides sender_email per lead for the pin.
**RECOMMENDED METHOD = native templates (not whole-body merge):** docs/PLUSVIBE-7-TEMPLATES.md = the 7 steps as paste-in PlusVibe templates with merge tags; export-to-plusvibe now emits the merge vars (company_name, audit_finding, audit_url, sender_email, sender_persona) + keeps whole-body columns as fallback. 29-col CSV validated.
**VPS for 5,000 scrapes/day (best cheap, no-downtime):** Hetzner **CAX21** (4 ARM vCPU, 8GB, 80GB, 20TB traffic) ≈ €8.5/$9/mo — best price/quality; ARM runs Go/Rust/Node/Chromium fine. Use CPX31 (4 x86 vCPU, 8GB ≈ €14) only if a tool needs x86. Add Hetzner auto-backups for resilience. Cheaper-but-variable: Contabo. Hetzner is the quality pick. Run Docker: searxng + google-maps-scraper + crawl4ai + reacher + Redis + bullmq + our Node engine → real 200-5,000/day.
**REPLY-STOP confirmed:** PlusVibe stop-on-reply (default) + our engine's replied-exclusion = no follow-ups after a reply, automatically.

### 14.22 /AUDIT/ WORKER BUILT+DEPLOYED + ORACLE CHECK (session 2026-05-23m)
**TOUCH-1 AUDIT PAGE — BUILT, TESTED (8/8), DEPLOYED:** new `cloudflare/audit-page-worker.js` (signed, DB-backed) replaces the old baked-data audit-worker. Matches S025 URLs /audit/{slug}/{hash}?l&x&sig. Verifies HMAC (Web-Crypto) — proven byte-identical to S025's node-crypto signing. Loads audit_pages + lead from Neon (HTTP SQL), renders a clean conversion page (firm, current 32 / 12-week 86, real scraped findings, frameworks/200+ laws, AI-search, £1500/3500/7500 tiers, booking CTA, King's-credential footer), logs page_view to audit_events. Local test 8/8: 200 valid · 403 tampered · 410 expired · 404 malformed. **Caught+fixed a real bug: the deploy placeholder substitution was also replacing the sig-guard sentinel → would have silently disabled signature checks; guard now always verifies.**
- HMAC secret: set TAMAZIA_HMAC_SECRET in .env; re-signed all audit URLs (build-audit-pages re-run); re-rendered → 7 Touch-1 drafts now carry signed /audit/ links. **ACTION: re-push ENV_B64 to the host so S025-in-cycle signs with the same secret.**
- DEPLOY: `scripts/deploy-audit-worker.sh` → worker UPLOADED to CF as "tamazia-audit" (upload:True). **ROUTE BINDING BLOCKED: the CLOUDFLARE_API_TOKEN gets "Authentication error" (code 10000) on zone Workers Routes API — it can upload scripts but lacks Zone→Workers Routes→Edit.** REMAINING USER STEP (30s): Cloudflare dashboard → Workers & Pages → tamazia-audit → Triggers → Add route `tamazia.co.uk/audit*`; OR add Workers-Routes-Edit to the token + re-run the deploy script. After that, Touch-1 links resolve 200 and Touch 1 can go live.
**VPS — ORACLE checked in browser:** account exists (tenancy "tamazia", personage418@gmail.com) but at sign-in (password browser-filled). Did NOT submit login (security rule: never password-auth on user's behalf). User signs in + creates the Ampere A1. **Verdict stands: Oracle Always Free (4 OCPU ARM + 24GB + 200GB, $0 forever) is the best near-zero option — nothing truly beats free-forever 24GB.** Credit offers (GCP $300/90d the most generous, AWS/Azure $200, Vultr $250, DO $200) are TEMPORARY bridges, not permanent; use only if Oracle "Out of Capacity" blocks the region. Manage with Coolify.

### 14.21 NEAR-FREE VPS + AUDIT-LINK FLOW + PIPELINE RECHECK (session 2026-05-23l)
**VPS — near-free winner = ORACLE CLOUD ALWAYS FREE ARM (Ampere A1): 4 OCPU + 24GB RAM + 200GB block, $0/mo forever** (beats Hetzner CAX21's 8GB at $9). Caveats: "Out of Capacity" in busy regions (retry / pick a region / use a claim-retry script); idle-reclaim if 95th-pct CPU <20% over 7d (our scrapers run hot → safe); card needed for identity (not charged). Fallback if no capacity: Hetzner CAX21 ~$9, or free credits (DigitalOcean $200/Vultr $250) to bridge. Manage with Coolify (free self-hosted PaaS). Run Docker: searxng + google-maps-scraper + crawl4ai + reacher + Redis + bullmq + our engine.
**TOUCH-1 AUDIT LINK FLOW (verified, touch1_has_audit_url=true):** build-audit-pages.js (S025) generates an HMAC-signed URL → writes leads.audit_url → (a) render.js (S064) embeds it in Touch 1 body, (b) export-to-plusvibe emits it as the audit_url column → PlusVibe Step 2 template uses {{audit_url}} which merges the per-lead URL. **REMAINING DEPLOY GAP (honest):** the audit PAGE must actually be SERVED at tamazia.co.uk/audit/{slug}/{hash} (CF worker route) or the link 404s. Our own send-due hard-blocks Touch 1 until the URL resolves HTTP 200 (safe); PlusVibe does NOT check, so DEPLOY the /audit/ route before enabling Touch 1 in PlusVibe. = the one open build before live Touch 1.
**PIPELINE CONNECTIVITY RECHECK (full, end-to-end, verified):** 17-step cycle in correct order; every stage's input selector reads the prior stage's output: resolve-domains(363 waiting) → scrape-intel(44 waiting,3 done) → qualify(29 waiting,5 qualified) → build-audit(0 waiting,7 done) → render(0 waiting,5×7-touch) → export(5 ready). Audit link flows to Touch 1 + export. All 8 pipeline scripts syntax-clean. Chain works one after another; new leads flow through as the cycle runs. paused=true, 0 sends.

### 14.11 MAILBOX-POOL BUILD — DONE + TESTED (session 2026-05-23b, Claude)
Engine side of §14.8 is BUILT, cred-ready, and tested (33/33 unit+integration tests incl. a live SMTP delivery over TLS). Nothing sends yet (paused=true, no creds loaded, real-lead queue unqualified). Decision recorded: D1=A (own engine, build done), D2=wait to wk3, D3=buy+park 2 reserves, D4=remove Mail Basic 5.
- **New: `src/lib/notify/mailbox-pool.js`** — loads 30 creds from `config/maildeck-mailboxes.{csv,json}` (gitignored) or `MAILDECK_MAILBOXES_B64`; per-mailbox age→ramp cap (§14.6); LRU round-robin; per-inbox + fleet caps; shared dedup (one mailbox owns each prospect, follow-ups reuse it); ZERO-dependency raw SMTP over TLS (587 STARTTLS + 465 implicit); self-healing error backoff. Real domains hard-rejected everywhere.
- **Edited: `relay-router.js`** — new `maildeck` provider delegates to the pool; NO failover to HTTP relays (a cold send can never fall back to a real domain); `capacitySnapshot()` now includes the fleet.
- **Edited: `S065 send-due.js`** — `COLD_RAIL` (default `maildeck`): cold sends now leave from a lookalike mailbox (from-address overridden; persona name + tamazia.co.uk signature/links kept). Run capped by `fleetRemainingToday()`; per-inbox ramp enforced in the pool; defense-in-depth real-domain abort. NOTE: with rail=maildeck and no creds, the engine cold-sends NOTHING until the fleet is loaded — this is the safety posture, not a bug.
- **Edited: `imap-poll-worker.js`** — added precise sender→lead match so lookalike replies match even when In-Reply-To is stripped (primary In-Reply-To→sends.message_id path already domain-agnostic).
- **New: `migrations/2026-05-23-mailbox-pool.sql`** — mailbox_pool, mailbox_daily_usage, cold_recipient_log, sends.mailbox_address. Idempotent.
- **New: `scripts/load-maildeck-creds.js`** — one command on export: ensures schema, validates CSV, upserts identities (NO passwords in DB), writes gitignored creds file, emits MAILDECK_MAILBOXES_B64, prints ramp readout. Refuses real-domain mailboxes.
- **New: `scripts/setup-lookalike-catchall.js`** — scripts the 6 Cloudflare catch-alls → amangotselected@gmail.com via CLOUDFLARE_API_TOKEN_EMAIL (replaces ~24 manual clicks). Needs lookalike nameservers on Cloudflare; one-time destination verify click.
- **New: `scripts/health-check.js` probes** — maildeck_pool_loaded, cold_real_domain_guard (FAIL if any cold left a real domain), maildeck_cap_integrity.
- **New: `config/maildeck-mailboxes.sample.csv`** — the export template/format.
- WHEN CREDS LAND: `node scripts/load-maildeck-creds.js config/maildeck-mailboxes.csv --write-env` → re-push ENV_B64 → `node scripts/setup-lookalike-catchall.js` → dry-run send-due → approve first email → flip paused.
- OPEN (still): first real email is NOT ready — the 6 real law-firm drafts are on UNQUALIFIED/UNVERIFIED leads (status='new', no quality_score, 3/6 have no email) and the engine copy is generic/spammy. Must run qualify+verify and rewrite Touch-0 copy before the first real send. Reserve-domain warmup caveat: a parked reserve is COLD reserve (still needs ramp); true warm reserve needs MailDeck slots.
