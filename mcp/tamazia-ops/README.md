# tamazia-ops MCP server

A small, **zero-dependency stdio MCP server** that exposes the Tamazia agency
engine's live operational state to Claude Code and Cowork as callable tools, plus a
set of **scoped, additive action tools** (D5.8) so Claude can operate the cockpit
conversationally. Every write is **additive only** (no DDL, no destructive writes)
and never touches the audit-engine table families (`audit_*`, `compliance_*`,
`framework_*`, `classifier_*`, `pointer_*`, `scanner_cache`). **SEND stays OFF**: the
only tool that can touch the SEND master gate (`set_flag`) refuses to do so without an
explicit double-confirm sentinel.

Built in **Python with the standard library only** (the Oracle VM and this control box
have `python3`, not `node`). The MCP stdio JSON-RPC protocol is implemented **by hand**
(no `mcp` SDK, nothing to `pip install`), so it runs on **Python 3.9+**. This is
deliberate: the target Mac runs Python **3.9.6** and cannot install 3.10, which the
official `mcp` SDK requires. All HTTP (Neon, Slack, Telegram) uses `urllib` from the
stdlib.

## Tools

| Tool | What it returns |
|---|---|
| `pipeline_status()` | One sentence with the seven funnel counts: leads -> qualified -> FIT -> email-ready -> sent -> replied -> booked. |
| `source_performance()` | Per-source bounce rate, reply rate, and cost-per-lead where derivable (joins `leads.source` to `sends` / `bounce_events` / `inbound_emails` and `lead_sources.cost_per_month_gbp`). Metrics it cannot derive are reported as `n/a`, never guessed. |
| `engine_health()` | Which engines ran (last `finished_at` + status per job from `engine_runs`) and which are stuck (`system_health` rows where `check_key LIKE 'stuck_%'`). |
| `todays_bookings()` | `cal_bookings` rows whose `start_at` is today (UTC). |
| `recent_replies(limit=15)` | Recent `inbound_emails` with `matched_lead_id` set (sender, subject, classification, matched lead id). |
| `push_digest()` | Posts the pipeline status + any failing health checks to Slack (`#all-tamazia` via `SLACK_BOT_TOKEN`) and Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). |

### Action tools (D5.8 — write side)

| Tool | Args | What it writes / does |
|---|---|---|
| `accept_lead` | `lead_id`, `dry=false` | Sets `leads.review_status='accepted'` (+ `reviewed_by`, `reviewed_at`, `claude_reviewed_at`) on that one row. The engine's `scripts/apply-review.js` then re-tiers via the **canonical** gate and promotes atomically — the MCP is the verdict pen, it does **not** score. Idempotent (already `accepted`/`applied_*` = no-op). |
| `reject_lead` | `lead_id`, `reason=""`, `suppress=false`, `dry=false` | Sets `review_status='rejected'` (apply-review parks it out of the cold path) and merges `reason` into `claude_review_notes` (jsonb). `suppress=true` additionally inserts the lead's email into `suppression` (guarded `NOT EXISTS`, scope `manual`). Does **not** suppress by default. Idempotent. |
| `remint_audit` | `lead_id_or_hash`, `dry=false` | Resolves a numeric `leads.id` → `leads.audit_hash` (read), else treats the input as a hash; validates against `audit_pages` (read), then **dispatches the `remint-audits` workflow** with that hash. **Never** writes `audit_*` directly. Safe to re-run. |
| `dispatch_workflow` | `name`, `dry=false` | Triggers a GitHub Actions `workflow_dispatch` by name, restricted to a closed **allow-list** of safe, non-send jobs. Unknown names are refused with the allow-list echoed back. |
| `set_flag` | `name`, `value`, `confirm=""`, `dry=false` | Upserts a flag into the `system_state` key/value store the engine reads (e.g. `paused='true'` arms the kill-switch). Idempotent (`ON CONFLICT (key) DO UPDATE`). **The SEND master gate (`SEND_ENABLED`) is refused unless `confirm='I_UNDERSTAND_SENDS_GO_LIVE'` is passed exactly**; default refuses. |

Pass `dry=true` to any action tool to see the **exact SQL / dispatch** it would run
without executing it.

The funnel SQL is copied **verbatim** from `scripts/gen-state.js` so the counts match
the live schema and the auto-generated `docs/PIPELINE-STATE.md`. Neon access mirrors
`ops/neonq.py` exactly (serverless HTTP `/sql` endpoint). Slack/Telegram posting
mirrors `scripts/intel-pulse.js`. The lead-verdict semantics mirror
`scripts/apply-review.js` (which acts on `review_status`); the GitHub
`workflow_dispatch` calls mirror `gh workflow run`. The six read-tool bodies are
unchanged from the earlier SDK version; the transport/registration layer was
rewritten by hand and the five action tools were appended.

Every tool is **fail-soft**: if Neon (or the GitHub API) is unreachable or a token is
missing, the tool returns a clear one-line error string and the server keeps running.

### Safety model (action tools)

- **Additive + scoped.** `accept`/`reject` write only `review_status` + review
  metadata + the `claude_*` review columns; `set_flag` writes only `system_state`.
  No off-limits table family is ever written. `remint_audit` never `UPDATE`s
  `audit_pages` — it dispatches the workflow that does.
- **SEND is OFF.** `set_flag` refuses to write the `SEND_ENABLED` master gate (in
  either direction) unless `confirm='I_UNDERSTAND_SENDS_GO_LIVE'` is supplied
  exactly. The live relays additionally read the `SEND_ENABLED` env master gate above
  `system_state`, so the MCP can never be the thing that quietly turns sending on.
- **Idempotent.** Re-running `accept`/`reject` on an already-acted lead is a no-op
  (guarded both by a pre-read and by the `UPDATE … WHERE review_status NOT IN (…)`
  clause); `set_flag` upserts; `remint_audit`/`dispatch_workflow` just re-trigger.
- **Allow-listed dispatch.** Only the workflows in `SAFE_WORKFLOWS` can be triggered.

## Install

Requires **Python 3.9+** and nothing else. There are **no dependencies** to install:
the MCP stdio protocol is implemented in `server.py` against the standard library.

```bash
# Optional / no-op - requirements.txt is comments only, there is nothing to install.
pip install -r requirements.txt
```

Verify the file at least compiles under your interpreter (3.9.6 on the target Mac):

```bash
python3 -m py_compile server.py
```

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
- `GH_TOKEN` (or `GITHUB_TOKEN`) - for `dispatch_workflow` and `remint_audit`
  (GitHub Actions `workflow_dispatch`). Needs `actions:write` on the engine repo.
- `TAMAZIA_GH_REPO` - optional `owner/name` override for the workflow repo
  (default `Tamaziaa/tamazia-cowork-os`).

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
# No pip install needed - stdlib only.
pm2 start "python3 server.py" --name tz-ops-mcp
pm2 save
```

For scheduled pushes (e.g. a daily digest) you do **not** need the MCP server
resident - call the underlying logic directly. The cleanest path is to keep using the
existing `scripts/intel-pulse.js` cron, or add a tiny cron that imports `push_digest`
and the Neon helpers from `server.py`. The server is primarily an interactive surface
for Claude Code / Cowork.

## Implementation note + what to verify on first run

- **Transport:** the MCP stdio JSON-RPC 2.0 protocol is implemented **by hand** in
  `server.py` (no SDK). It reads one compact JSON object per line from stdin and writes
  one per line to stdout, flushing after each, and uses **stderr** for all logging so
  stdout stays a clean protocol channel. Handled methods: `initialize` (echoes the
  client's `protocolVersion`, else `2024-11-05`), `tools/list`, `tools/call`, `ping`,
  and the `notifications/initialized` notification (acknowledged with no response).
  Notifications and any message without an `id` never get a reply; unknown methods that
  carry an `id` get a JSON-RPC `-32601 Method not found`. Malformed lines are skipped,
  EOF on stdin exits cleanly, and a tool exception is returned as
  `{ isError: true }`, never crashing the loop.
- **Python version:** runs on **Python 3.9+** (the target Mac has **3.9.6**). The code
  avoids 3.10-only syntax (no `match`, no `X | Y` unions, no `tomllib`); type hints come
  from `typing`. There are **no dependencies**.
- **Offline smoke test (done at authoring time):** piping a hand-written `initialize`
  line then a `tools/list` line into `python3 server.py` emits two well-formed JSON-RPC
  responses; `tools/list` returns all **eleven** tools (six read + five action).
  This works **without** `NEON_URL` - only the live Neon tools need it. The action
  tools also accept `dry=true` to preview their SQL/dispatch without `NEON_URL` or
  `GH_TOKEN`. Reproduce with:

  ```bash
  printf '%s\n%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
    | python3 server.py
  ```

- **First-run checklist (verify the handshake with a real MCP client):**
  1. `python3 -m py_compile server.py` is clean (3.9.6 OK).
  2. The client connects and lists **eleven** tools under `tamazia-ops`
     (six read + five action).
  3. `pipeline_status()` returns the funnel sentence (confirms `NEON_URL` resolves and
     `/sql` is reachable). If it says "Cannot reach Neon", check the `.env` path /
     `TAMAZIA_ENV`.
  4. `push_digest()` reports `Slack: posted...` and `Telegram: sent.` Missing tokens
     surface as `skipped`, not errors.
