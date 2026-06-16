# EXECUTION TRACKER (D6.4)
Last updated: 2026-06-16. Source of truth for WBS task status across the v6 wave.
Format: `[STATUS]` = SHIPPED / PENDING / FOUNDER-BLOCKED / IN-PROGRESS / SKIPPED.

---

## SHIPPED — merged to main

| ID    | Description                                       | PR / ref       | Notes |
|-------|---------------------------------------------------|----------------|-------|
| D2.3  | Scraper hardening (yield tracking, retry caps)    | PR#60          | merged |
| D2.5  | Throughput knobs (SCRAPER_MAX env, per-source cap)| PR#60          | merged |
| D3.2  | Qualifier throughput + ORDER BY fix (42P10)       | PR#60          | merged |
| D4.1  | Engine-cycle zero-failures (secrets-in-if fix)    | PR#63          | merged |
| D4.2  | Engine-cycle heartbeat + health integration       | PR#63          | merged |
| D4.3  | Backlog-burst dispatch wired                      | PR#63          | merged |
| D4.4  | neon-guard + eval-qualifier non-fatal             | PR#63          | merged |
| D4.5  | claude-safeguard graceful (no-token exit 0)       | PR#63          | merged |
| D5.3  | Budibase action buttons live                      | manual config  | Budibase UI |
| D5.7  | Notion sync workflow (PR#62)                      | PR#62          | merged |
| D5.8  | MCP action tools (tag_dnc / neon_query / get_lead / capacity_snapshot / notion_cockpit) | PR#59 | merged |
| D6.2  | reconcile-cal-bookings.js wired + nightly trigger | existing       | verified present |

---

## IN THIS PR — pending merge (feat/d33-d61-d64-llm-rescue-capacity-state-20260616)

| ID    | Description                                       | Status         | Notes |
|-------|---------------------------------------------------|----------------|-------|
| D3.3  | LLM rescue wiring (LLM_QA_ENABLED + CLAUDE_CODE_OAUTH check + 100-call rate-limit) | PENDING MERGE | llm-rescue-backlog.yml + run-llm-rescue.js |
| D6.1  | Capacity-report daily GitHub Actions workflow     | PENDING MERGE | .github/workflows/capacity-report.yml |
| D6.4  | EXECUTION-TRACKER.md (this file)                  | PENDING MERGE | tracks WBS state going forward |

---

## FOUNDER-BLOCKED — requires manual action before activation

| ID    | Blocker                                           | What to do |
|-------|---------------------------------------------------|------------|
| D3.3  | LLM rescue OFF by default                        | Set `LLM_QA_ENABLED=1` inside the `ENV_B64` GitHub secret to activate rescue waves. Until then the workflow runs as a safe no-op. |
| D3.3  | Haiku paid fallback absent                       | Add `CLAUDE_CODE_OAUTH_TOKEN` as a GitHub Actions secret if Anthropic/Haiku fallback is wanted. Free models (Cloudflare/Groq/Gemini) run without it. |
| SEND  | Mystrika send gate OFF                           | SEND stays OFF globally. Flip only after inboxes hit warmup target and capacity-report shows non-zero daily_send_capacity. |
| CQC   | CQC key BLANK                                    | Add CQC API key + partner code to ENV_B64 to unlock CQC scraper. |
| FCA   | FCA key BLANK                                    | Add FCA free API key to ENV_B64. |

---

## PENDING — not yet started

| ID    | Description                                       | Priority | Notes |
|-------|---------------------------------------------------|----------|-------|
| D3.4  | LLM factcheck tuning (factcheck_max, confidence thresholds) | Medium | After D3.3 activates and rescue logs exist |
| D5.1  | Cockpit Tier-2 approval tab (PR#30 — website repo) | High  | Awaiting website repo merge |
| D5.9  | Metabase BI (planned, Oracle VM :3000)            | Low    | Read-only BI, deferred |
| D6.3  | Governor release automation (email-ready Tier-1 queue) | High | Dependent on D3.3 rescue waves running |

---

## SKIPPED / OUT-OF-SCOPE

| ID    | Reason |
|-------|--------|
| Apollo | OUT — free plan blocks search, weak UK/ME coverage |
| Mailgun | OUT — AUP bans cold email |
| MillionVerifier | DEFERRED — only if free verify fails at scale |
| Anymailfinder | DEFERRED — only if own crawler email rate falls below threshold |

---

## Live numbers (2026-06-16)

From `v_capacity_funnel` / `capacity-report.js`:

| Metric              | Value  |
|---------------------|--------|
| Total sourced       | 8,945  |
| Tier-1 (icp_tier=1) | 88     |
| quality_fit         | 88     |
| qualified           | 88     |
| pending_approval    | 8,252  |
| governor_released   | 200    |
| audit_verified      | 42     |
| claude_cleared      | 0      |
| mystrika_pushed     | 0      |
| DB ready-pool       | 0      |
| Mystrika capacity   | 0/day (warming, not yet live) |

Key observation: 8,252 leads in `pending_approval` = the D3.3 LLM-rescue target pool. Activating `LLM_QA_ENABLED=1` + letting the rescue waves run is the single highest-leverage unblocked action.
