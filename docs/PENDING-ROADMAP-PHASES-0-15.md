# Pending roadmap · Phases 0 to 15
Honest reconciliation of the MASTER plan (15-phase spec) against what is actually built (Phase 9-12.2 execution log + known gaps). For each phase: status, what is genuinely still pending, and how it gets done. Compiled 2026-05-21.

Legend: ✅ done · 🟡 partial · ⛔ not started · 🔒 blocked on a decision/login/payment

---

## Snapshot
The engine end-to-end (source → enrich → deep-research → 10-layer quality gate → auto-send Touch 0-3 → reply poll → dashboard) is **built and live in the 30-min cycle**. What is left splits into three buckets:
1. **Unblock + harden the live engine** (a handful of logins/decisions, mostly free) — Phases 2, 4, 5, 7, 12 tails.
2. **Finish the "smart ops" layer** — Phases 10, 11, 13 (monitoring, commands, A/B, auto-pause).
3. **Build the not-yet-started halves** — Phase 14 (post-signature client lifecycle) and Phase 15 (operations resilience).

Nothing on the critical revenue path is blocked except reply automation (Zoho Lite, £1/mo) and a true 24/7 host (Oracle/n8n, £0). Both are in Wave A below.

---

## Phase-by-phase

### Phase 0 — Pre-flight approvals ✅
Done. Approvals given, engine in build.

### Phase 1 — Infrastructure triage ✅
Done. Neon Postgres, Cloudflare (DNS + Workers + Access), domains, `.env`, 4 live relays + Brevo (now confirmed active, 300/day free). No pending items.

### Phase 2 — Compliance & legal 🟡🔒
Built: privacy + terms drafts (`drafts/privacy-v2026-05.md`, `terms-v2026-05.md`), GDPR request-handler skill (S052), compliant B2B legitimate-interest posture held.
Pending: EU Article 27 representative appointment; PI insurance; cross-jurisdiction template variants (UK/EU/UAE/US); formal framework-version migration log.
How it gets done: this is a **Danish (CLO) workstream**, not a build task. I prepare the cross-jurisdiction template matrix and the Art 27 / PI brief; Danish executes the appointments and the policy. Spend earmarked in the original plan (~£40 + £100 + €299) is real and needs your sign-off when Danish is ready.

### Phase 3 — Compose body + classifier ✅
Done. Compose engine, S012 14-category reply classifier, content linter (spam + placeholder hard-gates), Aman-identity routing. No pending items.

### Phase 4 — Warmup + replies 🟡🔒
Built: alias rotator (LRU + warmup + health), relay router with caps + failover, S016 alias health monitor.
Pending: **reply automation is blocked on Zoho IMAP** (needs Zoho Mail Lite); alias retirement/replacement workflow; DNS continuous health monitor.
How it gets done: upgrade Zoho Mail Lite on **founder@ only** (1 seat, ~£1/mo) → the existing `zoho-imap-poll` goes live next cycle. Alias retirement + DNS monitor fold into Phase 15 hardening.

### Phase 5 — Audit micro-site (Touch-1 asset) 🟡
Built: audit worker live, Touch-1 audit-reliability guard in `send-due` (never sends a broken audit link), ~17 audits minted.
Pending: **batch-mint audits for the queued lead base** (earlier only 1 of 437 had an audit; Touch 1 holds without one).
How it gets done: run the audit-mint batch as a cycle step so every lead reaching Touch 1 has a resolved audit URL. Pure build, £0, I do it. Wave A.

### Phase 6 — Personalisation + free LLM ✅
Done. S063 deep-research (news + sector intel + brand pointers + Touch 0), Gemini→Groq failover, 50-pointer engine. No pending items.

### Phase 7 — Lead sourcing (50-API) 🟡🔒
Built: SERP engine (10 sectors × type × geo matrix), 14,400-query rotation calendar, Hunter enrichment waterfall, dual sponsored/organic streams, SERPER_KEY live.
Pending: NeverBounce at 0 credits (verification skips when empty); a cheap verifier complement; Apollo paid for scale enrichment (free API blocked); optional finders (Snov/Skrapp) not signed up.
How it gets done: add **MillionVerifier** as the cheap verifier complement (see SECRET-KEYS note); leave Apollo on free (org-enrich only) until scale justifies paid. Wave A for the verifier, deferred for Apollo.

### Phase 8 — Ad intelligence scrapers ✅
Done. Pixel detection, job-board, Meta Ad Library, Google Ads Transparency — all feed the quality scorer's ad-spend signal. No pending items.

### Phase 9 — Multi-channel outreach 🟡
Built: email channel fully live; LinkedIn + Instagram as compliant **manual-send** windows in the dashboard (mark-sent → advances touch); Cal.com booking wired.
Pending: voice-note personalisation, image/video personalisation (deepening items).
How it gets done: these are nice-to-have creative layers, not blockers. Build after the ops layer (Wave B/C). LinkedIn/Insta stay manual by design (compliance line held).

### Phase 10 — Sector intelligence + matrix 🟡
Built: sector intel inside deep-research; brand-pointer connection to Tamazia.
Pending: continuous regulator-enforcement monitoring; daily industry-news ingestion; **news-trigger outreach** (prospect makes news → timely touch); prospect-site-change audit refresh; Tamazia self-brand/review monitoring.
How it gets done: a scheduled "signals" workflow (Serper news queries + the Ahrefs/SimilarWeb plugins already available) writing trigger rows that bump a lead's priority. Wave B. £0.

### Phase 11 — Chief of Staff orchestrator 🟡
Built: admin dashboard live (7 tabs, behind CF Access); Slack #all-tamazia + Telegram reporting; decisions logging.
Pending: **Telegram command suite** (/status /pause /resume /audit /override /escalate); decision-rollback workflow; multi-stakeholder threading (Aditya/Danish/Manuel handoffs).
How it gets done: build the Telegram command bot as an n8n workflow on PikaPod (webhook → action → Neon); decision-rollback is a small skill. Wave B. £0.

### Phase 12 — Deploy bulletproofing 🟡🔒
Built: `run-engine-cycle.sh` self-healing orchestrator + launchd plist (local always-on); terse reporting.
Pending: **true 24/7 host** (laptop-independent); nightly regression automation.
How it gets done: Oracle Always Free VM + PikaPod n8n watchdog (full runbook in `HOST-24-7-ORACLE-VM-N8N-WIRING.md`), or GitHub Actions cron as the zero-sysadmin alternative. Wave A. £0.

### Phase 13 — Continuous improvement ⛔
Not started.
Scope: A/B testing infra beyond subject lines; reply-rate degradation auto-pause at template level; sourcing-channel attribution; performance feedback loop into compose-body.
How it gets done: add A/B variant fields to drafts + a stats roll-up; auto-pause reads reply-rate per template and flips status when it craters. Wave B. £0.

### Phase 14 — Post-signature client lifecycle ⛔
Not started (this is the half of the business that runs *after* a lead says yes).
Scope: contract generation + e-sign; onboarding sequence; invoicing flow; customer-success tracking; renewal automation; upsell triggers; referral capture; case-study auto-build; NPS capture; win-loss analysis.
How it gets done: stand this up **when the first client signs**, not before (resource discipline). Sequence: e-sign (Cal.com + a free e-sign or DocuSeal) → onboarding emails → invoicing → CS/renewal. Wave C. Mostly £0, e-sign may need a cheap tool.

### Phase 15 — Operations resilience ⛔
Not started.
Scope (from the spec): API key rotator (S046); daily DB backup to Cloudflare R2 + weekly restore-test (S047); disaster-recovery playbook, 8 scenarios (S048); audit-trail export for GDPR/ICO (S049); multi-domain backup sender (S050); SSL cert monitor (S051); GDPR request handler (S052, partial); Aman-action audit log; decision-rollback.
How it gets done: this is the "sleep at night" layer — build once the engine is earning. Priority order within it: DB backup → audit-trail export → key rotation → DR playbook → multi-domain failover. Wave D. £0.

---

## The roadmap, sequenced into waves

**Wave A — unblock + harden the live engine (this week, £~1/mo total)**
1. Zoho Mail Lite on founder@ only (£1/mo) → reply automation live. *You: 1 payment.*
2. Stand up 24/7 host (Oracle VM + n8n watchdog, or GitHub Actions) → engine runs without your laptop. *You: account + paste; me: everything else.*
3. Batch-mint audits so Touch 1 never holds (Phase 5 closeout). *Me, £0.*
4. Add MillionVerifier as the verification complement; keep NeverBounce as secondary. *You: 1 signup; me: wire it.*
5. Brevo already confirmed live — no action. ✅

**Wave B — finish the smart-ops layer (next 2-3 weeks, £0)**
6. Telegram command suite + decision-rollback (Phase 11). *Me, on n8n.*
7. Continuous regulator/news monitoring + news-trigger outreach (Phase 10). *Me, £0.*
8. A/B testing + reply-rate auto-pause (Phase 13). *Me, £0.*

**Wave C — post-signature lifecycle (trigger: first signed client, Phase 14)**
9. E-sign → onboarding → invoicing → CS/renewal/upsell → referral/case-study/NPS. *Me; possibly one cheap e-sign tool.*

**Wave D — operations resilience (once earning, Phase 15)**
10. DB backup to R2 → audit-trail export → key rotation → DR playbook → multi-domain failover. *Me, £0.*

**Ongoing — compliance deepening (Phase 2, Danish-owned)**
11. EU Art 27 rep, PI insurance, cross-jurisdiction templates. *Danish executes; me: prep the matrix + brief. Spend on your sign-off.*

---

## What needs you vs what needs me
**You (logins/decisions/payments, all small):** Zoho Lite payment · Oracle account + paste (or approve GitHub Actions) · MillionVerifier signup · GitHub repo + token for the host prerequisite · eventual e-sign + compliance spend sign-offs.
**Me (build, £0, autonomous):** audit batch-mint, host wiring, Telegram commands, monitoring/news-triggers, A/B + auto-pause, Phase 14 + 15 builds, compliance template matrix.

The only thing standing between "engine runs on my laptop" and "engine runs forever without me" is Wave A items 1 and 2.
