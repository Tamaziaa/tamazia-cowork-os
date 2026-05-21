# n8n automation backbone

The whole engine runs on schedules. Two execution options — pick based on where you want it to run.

## What the orchestrator runs (6 branches)
| Schedule | Job | Script |
|---|---|---|
| 00:05 daily | Warmup reset + ramp | `alias-rotator.js --reset` |
| Hourly, 9-17 Mon-Fri | Send window (lint → rotate → route) | `S065/send-due.js` |
| Every 5 min | Reply poll + classify + journey | `zoho-imap-poll.js` |
| 06:00 daily | Source + deep-research + draft, then rebuild dashboard | `run-deep-research-batch.js` → `build-crm-dashboard.js` |
| Mon 08:00 | Alias health + relay capacity report | `S016` + `relay-router.js --capacity` |

## IMPORTANT honest flag: n8n Cloud vs self-hosted
The provided `n8n/tamazia-pipeline.workflow.json` uses **Execute Command** nodes. These run **only on self-hosted n8n** — **n8n Cloud blocks Execute Command** for security. So:

- **Option A (works today, £0, recommended): local launchd.** The engine already runs locally; the same six jobs can run via macOS launchd / cron with zero extra service. This is live-able now — I can generate the launchd plists. n8n Cloud not required for execution.
- **Option B (n8n Cloud visual orchestration):** expose the engine scripts as HTTP endpoints (small API on the existing Cloudflare Worker), then swap the Execute Command nodes for HTTP Request nodes. n8n Cloud then drives + visualises everything. This is a developer step (~half a day) — flagged.
- **Option C (self-host n8n):** run n8n via Docker locally/VPS, import the JSON as-is, Execute Command works directly. Free if self-hosted.

**Recommendation:** start on Option A (launchd, today, free), add Option B for the visual layer once the pipeline has run clean for a week. Don't pay for n8n Cloud execution when launchd does it free.

## To import (Option C / self-hosted)
n8n → Workflows → Import from File → select `n8n/tamazia-pipeline.workflow.json` → set the working-directory path if your repo lives elsewhere → activate.

## Self-healing
Each script handles its own retries/backoff and is idempotent (dedup keys, state tables). `saveDataErrorExecution: all` keeps failed runs for audit. A failed branch never blocks the others.
