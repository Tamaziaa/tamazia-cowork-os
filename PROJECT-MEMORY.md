# TAMAZIA COWORK OS · PROJECT MEMORY (end-to-end source of truth)
Single consolidated state of the whole system. Read this first in any new session, then SECRET-KEYS.md and the docs/ audits. Last synced 2026-05-21.

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
Read: PROJECT-MEMORY.md (this) → SECRET-KEYS.md → docs/50-SCENARIO-ADVERSARIAL-AUDIT.md → docs/DASHBOARD-REBUILD-PLAN.md → docs/PENDING-ROADMAP-PHASES-0-15.md → TAMAZIA-EXECUTION-MASTER.md. Then run `node scripts/health-check.js` for live state.
