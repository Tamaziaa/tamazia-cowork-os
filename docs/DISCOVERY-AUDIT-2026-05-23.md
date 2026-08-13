# Tamazia Cold-Outreach Engine · Discovery Audit
**Date: 2026-05-23 · Read-only audit. No code, DB, or email was modified.**

This report inventories what is built-but-unused, what is out of sync between code and the live Neon DB, and what is missing for 5x leverage. It also documents Phase 14/15 status and the search for the prior-chat "30 repos".

---

## 1 · INVENTORY: WIRED vs BUILT-BUT-UNUSED

### The live cycle (source of truth)
`scripts/run-engine-cycle.sh` runs every 30 min (GitHub Actions `engine-cycle.yml`). It calls, in order:
1. `scripts/zoho-imap-poll.js` — reply polling
2. `src/skills/S065-touch-scheduler/scripts/send-due.js` — gated send window
3. `scripts/run-serp-scrape.js 50` — wide SERP scrape (no-op without SERPER_KEY)
4. `scripts/enrich-and-queue-channels.js 8` — enrich 8 leads
5. `scripts/run-deep-research-batch.js 6` — calls **S063-deep-research**
6. `scripts/verify-contacts.js 25` — free email verify
7. `scripts/dedupe-leads.js`
8. `scripts/qualify-and-queue.js 12` — 10-layer quality gate
9. `scripts/health-check.js` — 30 adverse-scenario probes → `system_health`
10. `scripts/build-crm-dashboard.js`

`scripts/intel-pulse.js` runs hourly (`intel-pulse.yml`) → Slack/Telegram analyst summary.

### scripts/ classification

| Script | Status | Notes |
|---|---|---|
| run-engine-cycle.sh | WIRED | the cycle itself |
| intel-pulse.js | WIRED | hourly yml |
| zoho-imap-poll.js | WIRED | cycle step 1 |
| run-serp-scrape.js | WIRED | cycle step 3 |
| enrich-and-queue-channels.js | WIRED | cycle step 4 |
| run-deep-research-batch.js | WIRED | cycle step 5 |
| verify-contacts.js | WIRED | cycle step 6 |
| dedupe-leads.js | WIRED | cycle step 7 |
| qualify-and-queue.js | WIRED | cycle step 8 |
| health-check.js | WIRED | cycle step 9 |
| build-crm-dashboard.js | WIRED | cycle step 10 |
| psql | WIRED | DB wrapper used everywhere |
| notify-slack.sh / notify-telegram.sh | WIRED | called by serp-scrape + others |
| nightly-regression.sh | WIRED-ish | regression harness; no cron observed in repo, run manually |
| verify-phase.sh / verify-task.sh / execute-phase.sh / override-task.sh | WIRED (tooling) | the phase-gate execution framework |
| load-maildeck-creds.js / setup-lookalike-catchall.js | SETUP | one-shot infra setup (mailbox pool); not in cycle |
| zoho-mx-apply.sh / zoho-mx-auto-poll.sh / zoho-imap-poll variants | SETUP | DNS/MX one-shots |
| capture-telegram-chat-id.sh | SETUP | one-shot |
| create-w14-n8n-workflow.sh / deploy-admin-worker.sh / deploy-audit-worker.sh | SETUP/DEPLOY | infra deploy scripts |
| materialise-client-emails.js | UTILITY | run manually |
| patch-w8-s012.py | ONE-OFF PATCH | historical |
| **backtest-full-pipeline.js** | **BUILT-BUT-UNUSED** | confirmed: zero inbound references |
| **quality-loop.js** | **BUILT-BUT-UNUSED** | confirmed: zero inbound references (superseded by qualify-and-queue.js) |
| **pre-send-pipeline.js** | **BUILT-BUT-UNUSED** | not called by cycle/yml; references S025 + S008 but nothing references it |
| **run-deep-research-batch** is the only path that reaches a skill | — | — |

### src/skills/ classification (inbound-reference analysis)

| Skill | Status | Inbound refs |
|---|---|---|
| S001-compose-body | INDIRECT | only `tests/`; reached via pre-send-pipeline (itself unused) and S064 |
| S006-linkedin-drafter-v2 | **BUILT-BUT-UNUSED** | 0 |
| S008-personalisation-engine | WIRED (library) | 32 refs — the most-used module (its `lib/http.js` is a shared dependency) |
| S009-compliance-disclaimer-injector | INDIRECT | called by S001 |
| S010-forbidden-phrase-checker | INDIRECT | called by S013 |
| S012-reply-intent-classifier | INDIRECT | only test harness |
| S013-response-draft-generator | INDIRECT | seed migration only |
| S015-check-compliance | **BUILT-BUT-UNUSED** | 0 |
| S016-alias-health-monitor | **BUILT-BUT-UNUSED** | 0 — no cron, not in cycle |
| S019-engagement-tracker | **BUILT-BUT-UNUSED** | 0 — open/scroll/CTA tracking dormant |
| S023-mail-tester-runner | **BUILT-BUT-UNUSED** | 0 — deliverability gating not running |
| S024-bounce-handler | **BUILT-BUT-UNUSED** | 0 |
| S025-audit-page-builder | INDIRECT | only referenced by pre-send-pipeline (unused) + template-resolver; **not in cycle → Touch 1 has no audit URL source** |
| S025-warmup-engage | **BUILT-BUT-UNUSED** | 0 (older warmup_pairs path) |
| S027-proposal-versioning | **BUILT-BUT-UNUSED** | 0 |
| S028-sourcing-orchestrator | **BUILT-BUT-UNUSED** | 0 — the 10-source volume engine is dormant; sole consumer of all `src/lib/sourcing/*` libs (companies-house, osm-overpass, gleif, sec-edgar, opencorporates, charity-commission, bulk-sourcer, find-every-email) |
| S033-ad-intel-orchestrator | **BUILT-BUT-UNUSED** | 0 — ad-library polling + priority boost dormant |
| S036-regulator-watch | **BUILT-BUT-UNUSED** | 0 — regulator RSS ingest dormant (intel_items has 77 rows from a manual run) |
| S051-dns-health-monitor | **BUILT-BUT-UNUSED** | 0 |
| S051-ssl-cert-monitor | **BUILT-BUT-UNUSED** | 0 |
| S052-gdpr-request-handler | **BUILT-BUT-UNUSED** | 0 |
| S057-pre-call-brief | **BUILT-BUT-UNUSED** | 0 — pre-call HTML brief generator dormant |
| S059-lexquity-investor-track | **BUILT-BUT-UNUSED** | 0 |
| S060-gemini-lead-enricher | INDIRECT | called only by S062 (which is itself unused) |
| S062-auto-trigger-chain | **BUILT-BUT-UNUSED** | 0 — the new-lead → enrich → personalise → Touch 0 chain is NOT wired |
| S063-deep-research | WIRED | called by run-deep-research-batch.js (cycle step 5) |
| S064-touch-cadence | **BUILT-BUT-UNUSED** | 0 — RENDERS the 4 touch drafts into `outreach_drafts` |
| S065-touch-scheduler | WIRED | cycle step 2 — READS `outreach_drafts` and sends |

**S064 vs S065 overlap (flagged):** They are complementary, not duplicates, but the seam is broken. S064 is the *renderer* (writes 4 grounded drafts to `outreach_drafts`). S065 is the *sender* (reads pending `outreach_drafts`, sends, advances cadence). Only S065 is wired. Nothing in the cycle runs S064, so the queue S065 drains is not being refilled by the proper renderer — `outreach_drafts` holds only 7 rows (6 pending, 1 blocked_placeholder). The cadence sender is effectively idling on an empty/under-fed queue. The naming is also confusing: S065's own header comment calls itself "Touch cadence scheduler," overlapping S064's name.

---

## 2 · NEON SYNC (71 tables + 7 views = 78 objects → resolves the "78")

Row counts (key tables):

**Actively used:** serp_query_log 14,400 · leads 408 · scanner_cache 260 · compliance_rules 232 · sends 184 · response_templates 130 · framework_versions 96 · aliases 90 · alias_health 90 · ad_scraping_runs 82 · intel_items 77 · compliance_docs 50 · template_variants 34 · system_health 33 · subject_variants 30 · personalisation_scans 22 · suppression 16 · smtp_relays 6 · relay_daily_usage 5.

**Empty / orphaned (0 rows) — built but never populated:** ad_intelligence, audit_events, **audit_pages**, bounce_events, cal_bookings, client_email_files, compliance_checks, dead_letter_queue, email_archive_index, email_sequence_state, health_check, **inbound_emails**, isp_placement, lia_register, linkedin_outreach, pipeline_runs, proposal_versions, prospect_research, sector_heat, send_aborts, send_throttle_state, sequences, site_change_log, sourcing_attribution, verification_log.

These map directly to the dormant skills: `audit_pages` empty (S025 not wired), `audit_events` empty (S019 not wired), `inbound_emails` empty (reply pipeline never matched a reply), `linkedin_outreach` empty (S006 not wired), `proposal_versions` empty (S027 not wired), `sourcing_attribution`/`verification_log` empty (S028 not wired), `bounce_events` empty (S024 not wired).

### Warmup duplication (CONFIRMED + a sync gap)
- **Older build, IN the DB:** `warmup_pairs` (50 rows) + `warmup_reply_queue` (1 row). Consumed by `src/skills/S025-warmup-engage/scripts/engage.js` (which is unused) and seeded by `migrations/2026-05-19-seed-warmup-pairs.sql`.
- **Newer build, NOT in the DB:** `warmup_daily_usage` + `warmup_log`. These are defined in `migrations/2026-05-23-warmup-engine.sql` and used by `src/lib/notify/warmup-engine.js` — but **the migration has not been applied** (neither table exists in Neon). So the new warmup engine cannot run; it would error on first query.
- **Net:** two parallel warmup designs. One (pairs) is seeded but its driver is unwired; the other (daily_usage/log) has code but no schema. Neither is currently running warmups end-to-end. (By contrast, the sibling 2026-05-23 mailbox-pool migration WAS applied: `smtp_relays` + `relay_daily_usage` exist.)

### Leads table reality
- Total: **408**. All 408 currently classify as real prospects (no investor/test/seed rows in this snapshot; acquisition channels are local_search_osm 145, uk_company_registry 135, global_lei_registry 79, us_sec_filings 39, ad_intelligence_google 10).
- With `contact_email`: **27** (6.6%).
- `quality_score >= 60`: **7**. `priority_score >= 60`: 2. Real prospect with contact_email AND score>=60: **4**.
- Status: `new` 404, `touch_0_queued` 4. (Nothing has reached touch_1+; lifecycle barely started.)
- `system_health._overall` = **84 (fail)**. Failing probes: `sendable_real_leads=0`, `null_quality_pct=91%`, `relay_unknown_pct=99%`. Warnings: send freshness 119h, reply-poll freshness 18h.
- Sends ever: **184 total = 181 warmup + 3 cold.** The engine has effectively never sent real cold mail at volume.

---

## 3 · BUILT-BUT-UNUSED CAPABILITIES (value if wired)

1. **S028-sourcing-orchestrator** — 10-source lead engine (Companies House, OSM, GLEIF, SEC, OpenCorporates, charity commission, bulk-sourcer, find-every-email). *Wiring it = volume: thousands of leads/day instead of relying on a SERP key that isn't set.*
2. **S062-auto-trigger-chain** — new-lead → Gemini enrich → personalise → Touch 0 queued. *Closes the gap where 91% of leads have null quality and only 27/408 have an email.*
3. **S060-gemini-lead-enricher** — fills domain/contact/sector/email from company name on the free Gemini tier. *Directly fixes the 6.6% contact-email coverage.*
4. **S064-touch-cadence** — renders the 4 grounded touch drafts into `outreach_drafts`. *Feeds S065, which is currently draining an empty queue.*
5. **S025-audit-page-builder** — generates the HMAC-signed `/audit/{slug}/{hash}` page. *Touch 1 needs an audit URL; `audit_pages` is empty so Touch 1 has nothing to link to.*
6. **S019-engagement-tracker** — ingests open/scroll/CTA/PDF events → high-intent Slack alerts. *No open/click tracking is running today (`audit_events` empty).*
7. **S023-mail-tester-runner** — mail-tester.com deliverability score before send. *No spam-score gating on outbound.*
8. **S016-alias-health-monitor** — per-alias bounce/complaint scoring + auto-pause state machine. *Protects domain reputation; currently nothing auto-pauses a bad alias.*
9. **S024-bounce-handler** — `bounce_events` ingestion + alias flagging. *Bounce handling is dormant.*
10. **S033-ad-intel-orchestrator** — polls ad libraries, boosts priority for active advertisers. *High-intent scoring signal, dormant.*
11. **S036-regulator-watch** — regulator RSS/HTML ingest → `intel_items` (compliance-hook personalisation fuel). *Dormant.*
12. **S057-pre-call-brief** — 1-page HTML brief for a Cal.com booking. *Dormant (no bookings yet anyway).*
13. **S006-linkedin-drafter-v2 / linkedin_outreach** — multi-channel waterfall. *Email-only today.*
14. **S027-proposal-versioning, S015-check-compliance, S051/S052 monitors** — all dormant.
15. **backtest-full-pipeline.js + quality-loop.js + pre-send-pipeline.js** — confirmed dead scripts (no inbound refs).

---

## 4 · TOP 10 MISSING / 5x-LEVERAGE (ranked)

1. **Wire sourcing volume (S028).** `sendable_real_leads=0` is the dominant health failure. Without SERPER_KEY the only live source path is dormant code. Highest leverage by far.
2. **Wire enrichment + auto-trigger (S062 + S060).** 91% null quality, 6.6% email coverage. This converts raw leads into sendable, scored, personalised leads automatically.
3. **Wire S064 → S065 seam (draft rendering before sending).** The sender is wired; the renderer that fills its queue is not. Fix the seam or the engine never sends at cadence.
4. **Apply the warmup-engine migration + wire one warmup path.** Pick `warmup_daily_usage`/`warmup_log` (newer) OR `warmup_pairs` (older), apply schema, retire the other. Domain reputation depends on warmup actually running.
5. **Wire S025 audit-page generation.** Touch 1's value prop is the personalised audit URL; `audit_pages` is empty so Touch 1 currently can't link to anything.
6. **Wire S023 mail-tester gating** before any volume cold send (spam-score floor).
7. **Wire S019 open/click tracking + S024 bounce handling.** Today there is zero engagement telemetry (`audit_events`, `bounce_events`, `inbound_emails` all empty) — the engine is flying blind on deliverability and intent.
8. **Wire S016 alias-health auto-pause.** `relay_unknown_pct=99%` means sends aren't even attributing a relay; alias/relay health is unmonitored.
9. **Fix relay attribution in the send path.** 99% of `sends` have unknown relay — reporting and rotation logic are degraded.
10. **Wire S033 ad-intel + S036 regulator-watch** to feed priority scoring and compliance-hook personalisation (the differentiators of this engine).

---

## 5 · PHASE 14 & 15 STATUS

Both phases are **entirely PENDING** — none of their skills, tables, or confirmations exist.

**Phase 14 (Post-signature lifecycle)** specifies skills S037 contract-generator, S038 e-sign (Documenso/DocuSeal), S039 invoicing (Zoho), S040 onboarding, S041 client-success-tracker, S042 renewal-automation, S043 upsell-engine, S044 referral-capture, S045 case-study-builder, S021 win-loss-analyser, S022 forecast-builder; tables `invoices`, `onboarding_tasks`, `win_loss_records`, `forecasts`, `renewal_outreach`, `upsell_opportunities`.
- **Done:** nothing. No S037–S045/S021/S022 dirs exist; none of the tables exist; no `phase-14-complete.txt`.

**Phase 15 (Operations resilience)** specifies S046 api-key-rotator, S047 db-backup→R2, S048 disaster-recovery playbook (8 scenarios), quarterly DR drill, S049 audit-trail-export, S050 multi-domain-backup-sender, S051 SSL monitor (from Phase 4), S052 GDPR handler (from Phase 2), `aman_actions` table, decision-rollback.
- **Done (partial, carried from earlier phases):** `S051-ssl-cert-monitor`, `S051-dns-health-monitor`, `S052-gdpr-request-handler` skill dirs exist — but all three are BUILT-BUT-UNUSED (0 inbound refs).
- **Pending:** S046–S050, `aman_actions` table (absent), DR playbook (`docs/runbooks/` is empty), backups-to-R2, decision-rollback. No `phase-15-complete.txt`.

Confirmations on disk stop at **phase-8-complete.txt** (0,1,2,3,4,5,6,6.5,6.6,8 present; 7 and 9–15 absent), consistent with Phases 9–15 not formally gated.

---

## 6 · THE "30 REPOS" FROM A PRIOR CHAT — NOT RECOVERED

**Could not find the list.** What I checked:
- All committed docs/markdown: the only GitHub URL anywhere is `github.com/Tamaziaa/tamazia-website` (the site repo). No Google-Maps-scraper / MX / email-finder repo URLs are stored in the codebase.
- Session transcripts via `mcp__session_info`: read the strongest candidates — "Tamazia OS installation setup", "TAMAZIA OS PIPELINE REFER 4", "Refer 4", "Sync project, backup to GitHub, execute edits".
  - "Tamazia OS installation setup" contains the exact triggering question (the W9 message asking to "include the scraper which uses open meta ad platform data... find email of everyone in that company... 25 places... company's house in all jurisdictions"). **But the stored transcript ends at that user message** — the assistant's reply that would have listed the repos is not present in the retrievable transcript (it appears the response was not captured, or was produced in a session that is not accessible from this environment).
  - The other sessions are website/CSS and plan-generation work; none list repos.
- On-disk JSONL: only 2 transcript files are mounted in this environment; the rest of the 51 sessions are not on the accessible filesystem, only reachable via the session tool (which returned the truncated transcript above).

**Closest surviving artifact:** `docs/AD-INTEL-50-FREE-ALTERNATES.md` and `docs/100-TOOL-CATALOG.md` list the *data sources / APIs* (Apify Meta+Google+TikTok+LinkedIn ad-library actors, OSM Overpass, GLEIF, Companies House, SEC EDGAR, OpenCorporates, Hunter/Snov/NeverBounce/Anymailfinder/Findymail for email finding, DNS MX lookups, ScrapingBee/ScraperAPI/Zenrows/BrightData). These overlap conceptually with the "Google Maps scraper / MX / email-finding tools" the user remembers, but they are sources/SaaS, not the specific GitHub repo list. If the repo list is needed, it must be recovered from the original chat UI (the session that produced the reply to that W9 question) — it is not in this repo or in the transcripts reachable here.

---

## APPENDIX · Method
- Code: ripgrep cross-reference of every skill ID and script name across `*.js/*.sh/*.yml/*.sql` excluding each skill's own directory; traced the `run-engine-cycle.sh` and `intel-pulse.js` call graphs and their transitive `require()`s.
- DB: single dynamic UNION query for all public-table row counts via the `scripts/psql` (pg8000) wrapper; targeted queries for leads breakdown, warmup tables, system_health, sends. Read-only throughout.
- Phases: cross-checked Phase 14/15 spec files against table existence (`information_schema`), skill-dir existence, and `confirmations/`.
