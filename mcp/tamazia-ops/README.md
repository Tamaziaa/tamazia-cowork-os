# tamazia-ops MCP server

A small, dependency-light **stdio MCP server** that exposes the Tamazia agency
engine's live operational state to Claude Code and Cowork as callable tools. It is
**read-only + additive** against Neon (no DDL, no destructive writes) and never
touches the audit engine tables (`audit_*`, `compliance_*`, `framework_*`,
`classifier_*`, etc.).

Built in **Python** (the Oracle VM and this control box have `python3`, not `node`),
using the official `mcp` SDK (`FastMCP`). All HTTP (Neon, Slack, Telegram) uses the
Python standard library, so the only dependency is `mcp` itself.

## Tools

| Tool | What it returns |
|---|---|
| `pipeline_status()` | One sentence with the seven funnel counts: leads -> qualified -> FIT -> email-ready -> sent -> replied -> booked. |
| `source_performance()` | Per-source bounce rate, reply rate, and cost-per-lead where derivable (joins `leads.source` to `sends` / `bounce_events` / `inbound_emails` and `lead_sources.cost_per_month_gbp`). Metrics it cannot derive are reported as `n/a`, never guessed. |
| `engine_health()` | Which engines ran (last `finished_at` + status per job from `engine_runs`) and which are stuck (`system_health` rows where `check_key LIKE 'stuck_%'`). |
| `todays_bookings()` | `cal_bookings` rows whose `start_at` is today (UTC). |
| `recent_replies(limit=15)` | Recent `inbound_emails` with `matched_lead_id` set (sender, subject, classification, matched lead id). |
| `push_digest()` | Posts the pipeline status + any failing health checks to Slack (`#all-tamazia` via `SLACK_BOT_TOKEN`) and Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). |

The funnel SQL is copied **verbatim** from `scripts/gen-state.js` so the counts match
the live schema and the auto-generated `docs/PIPELINE-STATE.md`. Neon access mirrors
`ops/neonq.py` exactly (serverless HTTP `/sql` endpoint). Slack/Telegram posting
mirrors `scripts/intel-pulse.js`.

Every tool is **fail-soft**: if Neon is unreachable or a token is missing, the tool
returns a clear one-line message and the server keeps running.

## Install

Requires **Python 3.10+** (the `mcp` SDK floor; see the version note at the bottom).

```bash
pip install -r requirements.txt
```

That installs just `mcp`. No other packages.

## Configuration (env)

The server reads everything from the environment first, then falls back to the engine
`.env` files, in this order:

1. `$TAMAZIA_ENV` (if set, points at an `.env`)
2. `/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env`
3. `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os/.env`
4. `~/tamazia-engine/.env` (the Oracle VM checkout)

Keys it uses (all already present in the engine `.env`):

- `NEON_URL` - Neon connection string. The host is derived with the same regex as
  `ops/neonq.py` (`.*@([^/]+)/.*`) and the server POSTs to `https://<host>/sql`.
  The secret value is **never printed** by any tool.
- `SLACK_BOT_TOKEN` - for `push_digest` (posts to `#all-tamazia`).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` - for `push_digest`.

No secrets are stored in this directory; nothing is committed.

## Register with Claude Code / Cowork

Add this to your MCP client config (Claude Code: `~/.claude.json` under `mcpServers`,
or `.mcp.json` at the project root; Cowork: the equivalent MCP settings block). The
command is `python3` with the **absolute** path to `server.py`:

```json
{
  "mcpServers": {
    "tamazia-ops": {
      "command": "python3",
      "args": [
        "/Users/amanigga/Desktop/TAMAZIA-REBUILD/_mission-a-cowork/mcp/tamazia-ops/server.py"
      ],
      "env": {
        "TAMAZIA_ENV": "/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env"
      }
    }
  }
}
```

`env` is optional: if you omit it the server still finds the engine `.env` via the
fallback list above. Set `TAMAZIA_ENV` explicitly when the `.env` lives somewhere
else (e.g. on the VM).

You can also register it from the CLI:

```bash
claude mcp add tamazia-ops -- python3 /Users/amanigga/Desktop/TAMAZIA-REBUILD/_mission-a-cowork/mcp/tamazia-ops/server.py
```

## Run on the Oracle Always-Free VM

The VM (`150.230.118.117`, user with the `tamazia-engine` checkout) already has
`python3` and the engine `.env`. Two ways to run it:

**A. On-demand / as an MCP server for a client on the VM.** Point the same config at
the VM path and set `TAMAZIA_ENV` to the VM `.env`:

```json
{
  "mcpServers": {
    "tamazia-ops": {
      "command": "python3",
      "args": ["/home/ubuntu/tamazia-engine/mcp/tamazia-ops/server.py"],
      "env": { "TAMAZIA_ENV": "/home/ubuntu/tamazia-engine/.env" }
    }
  }
}
```

(Adjust `/home/ubuntu/...` to the actual checkout path on the VM.)

**B. Keep it resident with pm2** (alongside `tz-scrape` / `tz-enrich` etc.). MCP
stdio servers are normally spawned by the client, so this is only useful if a
long-lived client connects over a pipe. For a simple always-available process:

```bash
cd /home/ubuntu/tamazia-engine/mcp/tamazia-ops
pip install -r requirements.txt
pm2 start "python3 server.py" --name tz-ops-mcp
pm2 save
```

For scheduled pushes (e.g. a daily digest) you do **not** need the MCP server
resident - call the underlying logic directly. The cleanest path is to keep using the
existing `scripts/intel-pulse.js` cron, or add a tiny cron that imports `push_digest`
and the Neon helpers from `server.py`. The server is primarily an interactive surface
for Claude Code / Cowork.

## Version targeted + what to verify on first run

- **Targeted SDK:** the official `mcp` Python SDK using the **`FastMCP`** pattern,
  imported as `from mcp.server.fastmcp import FastMCP`, started with `mcp.run()`
  over the default **stdio** transport. This is the current stable, documented pattern
  (SDK `1.x`).
- **Python version:** the `mcp` SDK requires **Python 3.10+**. The control box this
  was authored on runs Python **3.9.6**, so the handshake could **not** be exercised
  here. The Oracle VM and CI runners should have a 3.10+ interpreter - install and run
  there. If `python3` on the target is < 3.10, use a 3.10+ binary explicitly in the
  config `command` (e.g. `python3.11`).
- **First-run checklist:**
  1. `pip install -r requirements.txt` succeeds and `python3 -c "import mcp.server.fastmcp"` is clean.
  2. The client lists six tools under `tamazia-ops` after connecting.
  3. `pipeline_status()` returns the funnel sentence (confirms `NEON_URL` resolves and
     `/sql` is reachable). If it says "Cannot reach Neon", check the `.env` path /
     `TAMAZIA_ENV`.
  4. `push_digest()` reports `Slack: posted...` and `Telegram: sent.` Missing tokens
     surface as `skipped`, not errors.
  - If your installed SDK is older and `mcp.server.fastmcp` is absent, the server
    exits at startup with a clear message; upgrade `mcp`, or port the six
    `@mcp.tool()` functions to the low-level `from mcp.server import Server` +
    `mcp.server.stdio.stdio_server()` API (same tool bodies, different registration).
