# Phase 7 · Aman actions queue
**Things I couldn't do without you, with the exact 30-second instructions for each.**

## 1. Activate the daily sourcing cron (30 seconds, optional)

The cron script is already built. Two ways to schedule:

**Option A (recommended) — Cowork scheduled task.** In a Cowork session, say:
> "Create a scheduled task `tamazia-sourcing-daily` that runs every day at 07:30 local time. Prompt: 'Run /Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/skills/S028-sourcing-orchestrator/scripts/daily-cron.sh then summarise the new leads count, sector mix, jurisdiction mix, and top 3 priorities to chat.'"

Approve the dialog when it appears.

**Option B — macOS launchd.** Run once:
```bash
cat > ~/Library/LaunchAgents/com.tamazia.sourcing.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.tamazia.sourcing</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/skills/S028-sourcing-orchestrator/scripts/daily-cron.sh</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/reports/sourcing-cron/launchd.log</string>
  <key>StandardErrorPath</key><string>/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/reports/sourcing-cron/launchd.err</string>
</dict></plist>
PLIST
launchctl load ~/Library/LaunchAgents/com.tamazia.sourcing.plist
```

Both routes work. Pick whichever fits your workflow.

## 2. Free API keys (60 seconds each, all optional — workarounds already live)

Each of these is a free signup. None of them blocks the engine — the workaround for each is already in production. Adding them just lifts quota.

| Source | URL | Time | What it unlocks |
|---|---|---|---|
| Companies House UK | https://developer.company-information.service.gov.uk/ | 60s | Replaces the HTML scrape with the structured API (5× faster, sector + officer data included). Add as `CH_API_KEY` in .env |
| Hunter.io | https://hunter.io/users/sign_up | 60s | 25 searches + 50 verifications/mo on top of the pattern-based finder. Add as `HUNTER_KEY` |
| Snov.io | https://snov.io/register | 60s | +50 email-finder credits/mo. Add as `SNOV_USER_ID` and `SNOV_SECRET` |
| Apollo.io | https://app.apollo.io/#/signup | 60s | Already available via Common Room plugin if connected. Direct key adds bulk enrichment. Add as `APOLLO_KEY` |
| OpenCorporates | https://opencorporates.com/api_accounts/new | 90s | +500 req/mo on top of free unauth (which already works for basic search). Add as `OPENCORPORATES_KEY` |
| Google Places | https://console.cloud.google.com/google/maps-apis | 5 min | Replaces OSM Overpass for stricter address data. Optional — OSM is sufficient for 80% of cases. Add as `GOOGLE_PLACES_KEY` |
| Yelp Fusion | https://www.yelp.com/developers/v3/manage_app | 2 min | Replaces OSM for US-heavy B2C verticals. Optional. Add as `YELP_KEY` |

## 3. NeverBounce subscription (optional, pre-approved per original spec)

The pattern + SMTP-probe finder already delivers ≥60% verified emails for £0. NeverBounce adds a third-stage paid check that bumps to 90%+. £15-20/mo. Only worth it once daily volume exceeds 100 sourced/day for 30+ days.

URL: https://app.neverbounce.com/signup
Add key as `NEVERBOUNCE_KEY` in .env.

## 4. Slack webhook URL (already in .env from Phase 1)

If the digest doesn't post to Slack, check `SLACK_WEBHOOK_URL` is set. The script prints locally if missing.

---

**Nothing in this list blocks Phase 8/9/10 from shipping.** Each item is an upgrade, not a prerequisite.
