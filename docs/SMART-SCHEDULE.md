# Smart schedule · the daily lead-engine calendar
How the engine runs itself every day to source 500 fresh unique high-quality leads, enrich them fully, send the right touch on the right channel, and report — all tracked end to end.

## The cadence (one orchestrator, daily-idempotent steps)
`scripts/run-engine-cycle.sh` runs every 30 min (launchd / Oracle / scheduled-task). Each step is idempotent and self-skips when nothing's due, so the same cycle file safely produces a smart daily rhythm:

| Step | Frequency (effective) | What it does |
|---|---|---|
| `zoho-imap-poll.js` | every 30 min | Pull + classify replies (founder@), pause cadence on reply. (Needs Zoho IMAP — paid.) |
| `send-due.js` | every 30 min, business hours via warmup quota | Send due touches: linted, audit-gated (Touch 1), aman@ identity, relay-routed + failover. Per-alias daily caps mean it naturally throttles. |
| `run-serp-scrape.js 50` | **once/day** (daily-idempotent gate) | Wide scrape: 50 unique genuine leads/sector × 10 = 500/day, calendar-rotated queries, dedup + aggregator gates, dual streams. |
| `enrich-and-queue-channels.js 8` | every 30 min (8 leads/run) | Hunter emails + all socials + website + best-channel + queue LinkedIn/Insta touches. |
| `run-deep-research-batch.js 6` | every 30 min (6 leads/run) | S063 deep research: recent news + sector intel + unique brand pointers that connect to Tamazia + personalised Touch 0. |
| `build-crm-dashboard.js` | every 30 min | Refresh the admin dashboard snapshot. |

Net effect over a day: 500 fresh leads scraped at the first run after midnight, then continuously enriched + deep-researched + drafted across the day's cycles, with sends throttled to warmup-safe volumes and replies polled every 30 min. No step ever double-runs destructively.

## Why leads stay fresh + unique every day
- **Query calendar** (`query-calendar.js`): 14,400 unique queries across 10 sectors (modifier × type × geo × intent). Each day pulls the **freshest** (never-run, then stalest) — the bank cycles every ~96 days before any repeat.
- **Re-running old queries** surfaces NEW leads anyway: ads rotate and new businesses rank, so a re-run of "luxury hotel London" weeks later yields different ad-runners.
- **Dedup** against the whole base means a lead is never scraped twice.
- Same sector, different keyword every day → wide, non-repetitive coverage of each niche.

## Per-lead full journey (tracked end to end)
sourced → ad-intent → enriched (all emails/socials/website) → deep-researched (news + brand pointers + Tamazia angle) → audit minted → Touch 0 drafted (aman@, linted) → sent (email auto / LinkedIn-Insta manual via dashboard) → Touch 1 (audit-gated) → Touch 2 → Touch 3 → reply classified → journey logged. Every stage writes to Postgres + shows in tamazia.co.uk/admin.

## Reporting (when the daily scrape completes)
`run-serp-scrape.js` sends a completion report to **Telegram + Slack (#all-tamazia)** with: leads sourced (X/500), per-sector breakdown, fresh queries remaining, runtime. The admin dashboard's `scrape_runs` data shows the same. Failures send an alert too.

## To make it run 24/7 (hosting — pending)
The cadence runs wherever the orchestrator is scheduled: launchd (local Mac, load once), Oracle free VM (pending), or a scheduled task. The logic is host-agnostic; pick the host and the calendar runs itself.

## The one input still needed
`SERPER_KEY` (serper.dev, 2,500 free / ~$50/mo for 50k). Until it's set, the scrape step skips cleanly and the rest of the cycle (enrich/research/send/dashboard/reply) runs on existing leads.
