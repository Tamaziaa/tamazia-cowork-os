# Tamazia Agent Departments — Operations Reference

> Version: 2026-06-17 | Repo: `Tamaziaa/tamazia-cowork-os`
> This document maps every workflow, script, and metric to one of six named departments so any operator can instantly locate the right workflow, understand what it owns, and know what to do when it breaks.

---

## Department Index

| ID | Name | Role | Workflows |
|----|------|------|-----------|
| DEPT-1 | SOURCING | Finds and writes leads | engine-cycle, scrapers, source-leads, source-registers, source-sponsored, resolve-registry-domains, oracle-a1-acquire |
| DEPT-2 | ENRICHMENT | Deepens lead data | llm-rescue-backlog, backlog-burst, apollo-enrich, ahrefs-enrich |
| DEPT-3 | QUALIFICATION | Gates send-readiness | layer3-complete, claude-safeguard, eval-qualifier, eval-retier |
| DEPT-4 | SEND | Delivers outreach (GATED) | mystrika, push-to-mystrika (inline), deliverability-guard, match-inbound-replies |
| DEPT-5 | OBSERVATION | Watches and alerts | gen-state, capacity-report, intel-pulse, daily-digest, neon-guard, notion-sync |
| DEPT-6 | INTELLIGENCE | External signal enrichment | ahrefs-enrich, apollo-enrich, smatleads-sync |

---

## DEPT-1: SOURCING

**Purpose:** Discovers net-new leads from registers, SERP, sponsored signals, and GBP. Writes raw rows to `leads` table.

### Responsible Workflows

| Workflow file | Schedule | What it does |
|---|---|---|
| `engine-cycle.yml` | `*/30 * * * *` | Orchestrates the full pipeline: source → enrich → qualify → enqueue → mint → render. The heartbeat of the system. |
| `scrapers.yml` | `0 7 * * *` | Runs all 17 scrapers (Companies House, Charity Commission, FCA, CQC, SRA, OpenCorporates, GLEIF, SEC-EDGAR, OSM, SERP top/maps, JobSpy, Reddit, YouTube, X-Ads, Social-Ads). Max 40 per scraper per run. |
| `source-leads.yml` | `*/30 * * * *` (via engine-cycle) | SERP-driven lead discovery. Runs `scripts/source-leads.js`. |
| `source-registers.yml` | `0 7 * * *` | Pulls from government/regulatory registers. |
| `source-sponsored.yml` | `0 7 * * *` | Finds companies running paid ads (signals buying intent + budget). |
| `resolve-registry-domains.yml` | On demand / scheduled | Resolves domain names for register-sourced leads that only have company name. |
| `oracle-a1-acquire.yml` | On demand | Provisions Oracle Always-Free A1 VM (capacity-blocked; `continue-on-error: true` — failures are silent). |
| `smatleads-sync.yml` | `0 6 * * *` | GBP/Google Maps via smatleads.io API (2,168-entry matrix). |

### Key Metric

`scraper_daily.t12_persisted` per source per day. Target: 50+ Tier-1/2 leads per source per run.

### Health Check SQL

```sql
-- Daily yield per source
SELECT source, SUM(t12_persisted) AS tier_1_2_today
FROM scraper_daily
WHERE date = CURRENT_DATE
GROUP BY source
ORDER BY tier_1_2_today DESC;

-- Overall new leads today
SELECT COUNT(*) AS leads_today
FROM leads
WHERE sourced_at > NOW() - INTERVAL '24 hours';

-- Leads without a domain (stuck before enrich)
SELECT COUNT(*) AS no_domain FROM leads WHERE domain IS NULL OR domain = '';
```

### When Failing

1. **engine-cycle shows no scraper runs:** Check `engine-cycle` workflow logs in GitHub Actions. Look for exit code 127 (Node version issue) or Neon connection errors.
2. **SearXNG not returning results:** SSH to Oracle VM (`150.230.118.117`), check `pm2 status`. SearXNG runs on port 8888. Restart: `pm2 restart tz-scrape`.
3. **Serper credits exhausted:** Check Serper dashboard. `scraper_daily.t12_persisted` will drop to near zero for SERP sources while register sources continue.
4. **Companies House / register scrapers failing:** Verify free API keys in `ENV_B64`. Check `CQC_PARTNER_CODE`, `CQC_API_KEY`, `FCA_API_EMAIL`, `FCA_API_KEY`.
5. **smatleads-sync not running:** Verify `SMATLEADS_EMAIL` and `SMATLEADS_PASSWORD` in `ENV_B64`. Check `smatleads_runs` table for skipped cities.

---

## DEPT-2: ENRICHMENT

**Purpose:** Takes raw leads and adds decision-maker name, LinkedIn URL, verified email, domain rating, and LLM-rescued public signals. Never fabricates.

### Responsible Workflows

| Workflow file | Schedule | What it does |
|---|---|---|
| `llm-rescue-backlog.yml` | On demand / engine-cycle | LLM (Groq/Gemini/Cloudflare) searches public sources to find the missing decision-maker signal. Finds what the web crawler missed. Never fabricates. |
| `backlog-burst.yml` | On demand | Re-enriches the entire un-enriched backlog in waves: re-runs `enrich-worker.js` with `--max 500` per wave. Fixes junk names + re-scores. |
| `apollo-enrich.yml` | `0 * * * *` (hourly) | Apollo people-search on un-enriched leads. Adds `linkedin_url`, `apollo_person_id`, `apollo_enriched_at`. |
| `ahrefs-enrich.yml` | `0 2 * * *` (02:00 UTC) | Ahrefs Domain Rating via batch API. Adds `domain_rating`, `ahrefs_enriched_at`. |

### Key Metrics

- `qa_status = 'rescued'` count rising daily
- `reoon_status` coverage (should be non-null for any lead with `primary_email`)
- `apollo_enriched_at` coverage on Tier-1 and Tier-2 leads
- `domain_rating` non-null coverage

### Health Check SQL

```sql
-- Enrichment status overview
SELECT qa_status, COUNT(*) AS count
FROM leads
GROUP BY qa_status
ORDER BY count DESC;

-- LLM rescue rate (last 7 days)
SELECT DATE(updated_at) AS day, COUNT(*) AS rescued
FROM leads
WHERE qa_status = 'rescued'
  AND updated_at > NOW() - INTERVAL '7 days'
GROUP BY day ORDER BY day DESC;

-- Reoon verify coverage on leads with email
SELECT
  COUNT(*) FILTER (WHERE reoon_status IS NOT NULL AND primary_email IS NOT NULL) AS verified,
  COUNT(*) FILTER (WHERE reoon_status IS NULL AND primary_email IS NOT NULL) AS unverified_with_email,
  COUNT(*) FILTER (WHERE primary_email IS NULL) AS no_email
FROM leads
WHERE icp_tier IN (1,2);

-- Apollo enrichment gap on Tier-1
SELECT COUNT(*) AS tier1_no_apollo
FROM leads
WHERE icp_tier = 1 AND apollo_enriched_at IS NULL;
```

### When Failing

1. **LLM rescue rate is flat:** Check `LLM_QA_ENABLED` is set to `1` in `ENV_B64`. Check Groq/Gemini quotas (free tier limits). Fallback chain: Groq → Gemini → Cloudflare Workers AI → OpenAI/Anthropic.
2. **backlog-burst not draining:** Check engine-cycle is not holding the `engine-db-work` concurrency group. Dispatch manually via `workflow_dispatch` with `enable=1`.
3. **Apollo enrichment gap growing:** Check `APOLLO_KEY` in `ENV_B64`. Apollo free plan blocks search — paid plan required for people-search at scale.
4. **Ahrefs DR empty:** Check `AHREFS_KEY` in `ENV_B64`. Ahrefs batch API has a credit cost; monitor usage in Ahrefs dashboard.
5. **Reoon not running:** Check `REOON_KEY` in `ENV_B64`. Reoon has a 500/day cap on the free tier; daily-digest will show verification count.

---

## DEPT-3: QUALIFICATION

**Purpose:** Gates which leads are email-ready. Sets `claude_cleared = TRUE` and `icp_tier = 1` only when a lead has a real decision-maker, a verified email, passes ICP scoring, and passes the Claude safety check.

### Responsible Workflows

| Workflow file | Schedule | What it does |
|---|---|---|
| `layer3-complete.yml` | On demand / engine-cycle | Batched L3 completion: 300-500 leads per run. Rechecks enrichment completeness, lifts Tier-2 → Tier-1 where justified, mints audits, clears claude_cleared, notifies Notion. |
| `claude-safeguard.yml` | On demand / engine-cycle | Runs `claude-safeguard-batch.js`. Applies Claude safety review to borderline leads. Sets or clears `claude_cleared`. |
| `eval-qualifier.yml` | `30 5 * * 1` (Mon 05:30 UTC) | Weekly eval: measures qualifier accuracy against ground truth. |
| `eval-retier.yml` | On demand | Re-tiers leads in bulk after scoring model changes. |

### Key Metrics

- `claude_cleared = TRUE` count (target: growing from 88)
- `icp_tier = 1` total count (current: 88)
- Tier-1 count daily delta (should be positive)
- `lifecycle_stage = 'sourced'` backlog length (Tier-1 leads not yet cleared)

### Health Check SQL

```sql
-- Core qualification funnel
SELECT
  COUNT(*) FILTER (WHERE claude_cleared = TRUE) AS claude_cleared,
  COUNT(*) FILTER (WHERE icp_tier = 1) AS tier_1,
  COUNT(*) FILTER (WHERE icp_tier = 2) AS tier_2,
  COUNT(*) FILTER (WHERE icp_tier = 3) AS tier_3,
  COUNT(*) FILTER (WHERE icp_tier IS NULL) AS unscored
FROM leads;

-- Tier-1 leads NOT yet claude_cleared (blocked from send)
SELECT COUNT(*) AS tier1_blocked
FROM leads
WHERE icp_tier = 1 AND (claude_cleared IS NULL OR claude_cleared = FALSE);

-- Leads ready to qualify (enriched + scored + not yet cleared)
SELECT COUNT(*) AS ready_to_qualify
FROM leads
WHERE enriched_at IS NOT NULL
  AND primary_email IS NOT NULL
  AND reoon_status NOT IN ('invalid','catch_all','unknown','disposable')
  AND (claude_cleared IS NULL OR claude_cleared = FALSE)
  AND icp_tier IN (1,2);

-- Qualification rate over past 7 days
SELECT DATE(updated_at) AS day, COUNT(*) AS newly_cleared
FROM leads
WHERE claude_cleared = TRUE
  AND updated_at > NOW() - INTERVAL '7 days'
GROUP BY day ORDER BY day DESC;
```

### When Failing

1. **claude_cleared count stuck:** The most common cause is the `id-token: write` permission missing in the Claude Code GitHub App. Fixed in PR #75. If it recurs, check the `claude-safeguard.yml` permissions block.
2. **layer3-complete not running:** Check `CLAUDE_CODE_OAUTH_TOKEN` is set in `ENV_B64`. Without it, the L3 completion step silently skips.
3. **Tier-1 count falling:** This is expected if the re-scoring model was updated (eval-retier demoted borderline leads). Check `eval-retier` logs for the count delta.
4. **eval-qualifier showing accuracy < 85%:** Scoring model needs calibration. Review false-positive Tier-1 leads manually and adjust ICP weights in `src/lib/enrich/lead-quality.js`.

---

## DEPT-4: SEND (GATED)

> **SEND_ENABLED = false** — This department is operationally gated. No leads are sent until Aman flips `SEND_ENABLED=true` in `ENV_B64`. All workflows below are live but the push-to-mystrika step does nothing when the gate is closed.

**Purpose:** Delivers cold outreach via Mystrika (5 touches / 20 days, reply-stop). Receives and routes inbound replies to n8n webhook.

### Responsible Workflows

| Workflow file | Schedule | What it does |
|---|---|---|
| `mystrika.yml` | `0 */6 * * *` (every 6h) | Syncs Mystrika campaign state back to Neon (`sends` table). Reads reply/bounce/open signals. |
| `deliverability-guard.yml` | `0 5 * * *` (05:00 UTC) | Checks inbox warm-up status, SPF/DMARC/DKIM, MX for all 6 send domains. Alerts on deliverability risk. |
| `match-inbound-replies.yml` | `*/5 * * * *` | Matches Zoho IMAP inbound emails against `leads.primary_email`. Sets `replied_at`, `reply_classified`. Routes to n8n `tamazia-reply` webhook. |

### Key Metrics

- `sends` table row count (total outreach delivered)
- `sends.sent_at > NOW() - INTERVAL '24h'` (daily send volume)
- Mystrika reply sync count (shows two-way sync is live)
- `replied_at IS NOT NULL` count (reply tracking)

### Health Check SQL

```sql
-- Send gate status (must be false until Aman enables)
SELECT value FROM system_state WHERE key = 'SEND_ENABLED';

-- Sends in last 24h (should be 0 while gated)
SELECT COUNT(*) AS sends_24h
FROM sends
WHERE sent_at > NOW() - INTERVAL '24 hours';

-- Email-ready Tier-1 leads pending send
SELECT COUNT(*) AS pending_send
FROM leads
WHERE icp_tier = 1
  AND claude_cleared = TRUE
  AND primary_email IS NOT NULL
  AND reoon_status NOT IN ('invalid','catch_all','unknown','disposable')
  AND status = 'active'
  AND (enqueued_at IS NULL OR enqueued_at < NOW() - INTERVAL '7 days');

-- Recent inbound replies
SELECT COUNT(*) AS replies_7d
FROM leads
WHERE replied_at > NOW() - INTERVAL '7 days';

-- Deliverability issues (catch-all domains)
SELECT COUNT(*) AS catchall_leads
FROM leads
WHERE reoon_status = 'catch_all' AND icp_tier IN (1,2);
```

### When Failing

1. **SEND_ENABLED still false:** This is intentional. Aman must set `SEND_ENABLED=true` in `ENV_B64` and re-encrypt. Do not change without founder sign-off.
2. **Mystrika sync not running:** Check `MYSTRIKA_API_KEY` in `ENV_B64`. Mystrika LTD Plan 2 ($250 one-time). Campaign limit is 50/inbox/day at 40-45 safe.
3. **match-inbound-replies failing with Gmail noise:** Fixed in PR #70 (Node 20→24 migration). If it recurs, check `ZOHO_IMAP_*` credentials in `ENV_B64`.
4. **deliverability-guard alerting on warm-up:** IceMail 30-inbox warm-up period is ~15 Jun. Do not send to cold domains. Check warm-up status in IceMail dashboard (`app.icemail.ai`).
5. **Daily limit blocked at 20:** Mystrika daily limit needs to be raised to 150 in each campaign's Settings (step 3). Requires manual action in Mystrika UI — cannot be done via API.

---

## DEPT-5: OBSERVATION

**Purpose:** Watches the entire pipeline, generates state snapshots, posts alerts, and syncs to Notion cockpit. The operator's eyes.

### Responsible Workflows

| Workflow file | Schedule | What it does |
|---|---|---|
| `gen-state.yml` | `0 6 * * *` + push to main | Regenerates `docs/PIPELINE-STATE.md` with live Neon stats. Commits to main. |
| `capacity-report.yml` | `0 7 * * *` | Generates daily capacity report: Tier-1 output count, governor state, send runway. |
| `intel-pulse.yml` | `0 * * * *` (hourly) | Tracks enforcement news, FCA/CQC activity. Writes to `notifications`. |
| `daily-digest.yml` | `0 7 * * *` | Sends ONE Telegram digest: buckets all `notifications` from the past 24h. |
| `notify-daily-digest.yml` | `0 7 * * *` | Sends the structured engine status report (sourcing/enrichment/qualification/send totals). |
| `neon-guard.yml` | `0 6:17 * * *` | Checks Neon DB health: connection, table count, row count deltas. |
| `notion-sync.yml` | On demand / engine-cycle | Syncs cockpit data (lead counts, tier distribution) to Notion database `7478755f`. |

### Key Metrics

- `gen-state` last run success (check `engine_runs` table)
- `capacity-report` Tier-1 output count (should be ≥88 and growing)
- Telegram `@tamazia_bot` receiving messages without errors
- Notion cockpit showing correct Tier counts

### Health Check SQL

```sql
-- Last gen-state run
SELECT name, status, started_at, finished_at,
       EXTRACT(EPOCH FROM (finished_at - started_at))::int AS duration_s
FROM engine_runs
WHERE name = 'gen-state'
ORDER BY started_at DESC LIMIT 1;

-- Undigested notifications backlog
SELECT kind, COUNT(*) AS count
FROM notifications
WHERE digested_at IS NULL AND created_at > NOW() - INTERVAL '48 hours'
GROUP BY kind ORDER BY count DESC;

-- System state snapshot
SELECT key, value, updated_at
FROM system_state
ORDER BY updated_at DESC LIMIT 20;

-- Recent engine cycle heartbeats
SELECT name, status, started_at
FROM engine_runs
WHERE started_at > NOW() - INTERVAL '2 hours'
ORDER BY started_at DESC;
```

### When Failing

1. **gen-state not committing:** Check `GH_TOKEN` in `ENV_B64`. The workflow pushes to main via `x-access-token`. If the token expired, gen-state runs green but never commits.
2. **No Telegram messages arriving:** Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `ENV_B64`. Run `scripts/capture-telegram-chat-id.sh` to verify.
3. **Notion sync not updating:** Check `NOTION_API_KEY` in `ENV_B64`. Notion database ID is `7478755f`. The Notion integration must have write access to the workspace.
4. **neon-guard failing:** This usually means Neon connection string is invalid or Neon is in cold-start. Check `NEON_URL` / `NEON_CONNECTION_STRING` in `ENV_B64`.
5. **capacity-report showing zero Tier-1:** Usually a scoring issue in DEPT-3, not DEPT-5. Cross-check with DEPT-3 health check SQL.

---

## DEPT-6: INTELLIGENCE

**Purpose:** Enriches leads with authoritative external signals: Ahrefs domain authority, Apollo people data, smatleads GBP/LinkedIn. These signals feed back into scoring and qualification.

### Tools

| Tool | What it provides | Status |
|---|---|---|
| Ahrefs (`ahrefs-enrich.yml`) | `domain_rating` (0-100 DR), organic traffic estimate | Live — batch API via `AHREFS_KEY` |
| Apollo (`apollo-enrich.yml`) | Named decision-maker, LinkedIn URL, `apollo_person_id` | Live — requires paid plan for people-search |
| smatleads.io (`smatleads-sync.yml`) | GBP place data: rating, reviews, score, claimed, email, phone | Live — `SMATLEADS_EMAIL` + `SMATLEADS_PASSWORD` |
| Close CRM sync | Pipeline stage → Neon | Not yet wired |
| PostHog tracking | Website visitor → lead attribution | Not yet wired |

### Key Metrics

- `domain_rating IS NOT NULL` coverage on Tier-1/2
- `apollo_enriched_at IS NOT NULL` coverage on Tier-1/2
- `smatleads_runs` daily row count (searches executed today)
- `gbp_rating IS NOT NULL` coverage (GBP-sourced leads)

### Health Check SQL

```sql
-- Intelligence coverage on priority leads
SELECT
  COUNT(*) AS total_t1_t2,
  COUNT(*) FILTER (WHERE domain_rating IS NOT NULL) AS has_ahrefs_dr,
  COUNT(*) FILTER (WHERE apollo_enriched_at IS NOT NULL) AS has_apollo,
  COUNT(*) FILTER (WHERE gbp_rating IS NOT NULL) AS has_gbp,
  ROUND(100.0 * COUNT(*) FILTER (WHERE domain_rating IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS ahrefs_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE apollo_enriched_at IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS apollo_pct
FROM leads
WHERE icp_tier IN (1,2);

-- smatleads runs today
SELECT city, sector, keyword, results_count, ran_at
FROM smatleads_runs
WHERE ran_at > NOW() - INTERVAL '24 hours'
ORDER BY ran_at DESC;

-- GBP coverage by sector
SELECT sector_code, COUNT(*) FILTER (WHERE gbp_rating IS NOT NULL) AS with_gbp, COUNT(*) AS total
FROM leads
WHERE icp_tier IN (1,2)
GROUP BY sector_code ORDER BY total DESC;
```

### When Failing

1. **Ahrefs DR not populating:** Check `AHREFS_KEY` in `ENV_B64`. Ahrefs batch DR API has rate limits; the `ahrefs-enrich.yml` workflow runs at 02:00 UTC to avoid peak. Check Ahrefs subscription credits.
2. **Apollo coverage flat:** Apollo free plan does not support people-search. Paid plan is required. Check `APOLLO_KEY` credits in Apollo dashboard.
3. **smatleads-sync hitting 10,000 credit limit:** The daily cap is 100 searches per run (configurable via `max_searches` workflow_dispatch input). Check `smatleads_runs` table to see total searches consumed. Budget: 10,000 total credits.
4. **GBP results empty for a city:** smatleads may have exhausted results for that city/keyword combo. The `smatleads_runs` table tracks what was searched — re-runs skip already-searched combos for the same day.

---

## Cross-Department Runbook: Pipeline Stall

When leads stop flowing end-to-end (Tier-1 not growing for 48h+):

```
1. Check DEPT-5 (gen-state, capacity-report) — is the observation layer still running?
2. Check DEPT-1 (scrapers.yml, engine-cycle) — are new leads being sourced?
   SQL: SELECT COUNT(*) FROM leads WHERE sourced_at > NOW() - INTERVAL '24h'
3. Check DEPT-2 (backlog-burst, llm-rescue-backlog) — are enriched_at / qa_status moving?
   SQL: SELECT COUNT(*) FROM leads WHERE enriched_at > NOW() - INTERVAL '24h'
4. Check DEPT-3 (layer3-complete, claude-safeguard) — is claude_cleared count moving?
   SQL: SELECT COUNT(*) FROM leads WHERE claude_cleared = TRUE
5. Check DEPT-6 (apollo-enrich, ahrefs-enrich) — are intelligence signals filling in?
6. DEPT-4 (SEND) is gated — not the stall cause unless SEND_ENABLED was recently flipped.
```

## Secrets Reference

All secrets live in `ENV_B64` (base64-encoded `.env`). Required per department:

| Secret | Department | Notes |
|---|---|---|
| `NEON_URL` / `NEON_CONNECTION_STRING` | All | Neon PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | DEPT-5 | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | DEPT-5 | Chat/channel ID |
| `NOTION_API_KEY` | DEPT-5 | Notion integration token |
| `GH_TOKEN` | DEPT-5 | GitHub PAT for gen-state push |
| `MYSTRIKA_API_KEY` | DEPT-4 | Mystrika LTD plan API key |
| `APOLLO_KEY` | DEPT-2, DEPT-6 | Apollo paid plan required for people-search |
| `AHREFS_KEY` | DEPT-6 | Ahrefs batch API key |
| `REOON_KEY` | DEPT-2 | Reoon email verifier (500/day free cap) |
| `SMATLEADS_EMAIL` | DEPT-6 | smatleads.io account email |
| `SMATLEADS_PASSWORD` | DEPT-6 | smatleads.io account password |
| `LLM_QA_ENABLED` | DEPT-2 | Set to `1` to enable LLM rescue |
| `CLAUDE_CODE_OAUTH_TOKEN` | DEPT-3 | GitHub App token for claude-safeguard |
| `CQC_PARTNER_CODE` | DEPT-1 | CQC API partner code (FOUNDER ACTION NEEDED) |
| `CQC_API_KEY` | DEPT-1 | CQC API key (FOUNDER ACTION NEEDED) |
| `FCA_API_EMAIL` | DEPT-1 | FCA Register API email (FOUNDER ACTION NEEDED) |
| `FCA_API_KEY` | DEPT-1 | FCA Register API key (FOUNDER ACTION NEEDED) |
| `SEND_ENABLED` | DEPT-4 | `false` (GATED — Aman must flip) |
