#!/usr/bin/env python3
"""tamazia-ops MCP server (stdio, stdlib-only).

Read-only operations cockpit for the Tamazia agency engine, exposed to Claude Code
and Cowork as MCP tools. Every tool reads the LIVE Neon DB over the serverless HTTP
/sql endpoint, the exact same path scripts/ensure-schema.js and ops/neonq.py use.

Design rules (kept deliberately):
  - Read-only + ADDITIVE only. No DDL, no destructive writes. The audit_* /
    compliance_* / framework_* / classifier_* tables are never touched.
  - Fail-soft: a tool that cannot reach Neon (or a token is missing) returns a clear
    one-line message and never raises, so the MCP server stays up.
  - ZERO dependencies. The MCP stdio JSON-RPC protocol is implemented by hand against
    the Python standard library so this runs on Python 3.9 (the user's Mac has 3.9.6
    and cannot install 3.10+, which the `mcp` SDK requires). HTTP is stdlib urllib.
  - The funnel SQL is copied VERBATIM from scripts/gen-state.js so the counts match
    the live schema and the auto-generated docs/PIPELINE-STATE.md exactly.

NEON_URL and the Slack/Telegram tokens are read from the environment first, then from
the engine .env (COWORK-OS-EXECUTION/.env, then cowork-os/.env). The secret value is
never printed by any tool.

Protocol: MCP stdio = JSON-RPC 2.0, one compact JSON object per line, read line /
write line. We implement initialize, notifications/initialized, tools/list and
tools/call by hand. Nothing but protocol messages is ever written to stdout; all
diagnostics go to stderr.

Run:  python3 server.py        (stdio transport; launched by the MCP client)
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Config: NEON_URL + tokens from env, falling back to the engine .env files.
# Mirrors ops/neonq.py (load_neon + HOST regex) exactly.
# ---------------------------------------------------------------------------
ENV_CANDIDATES = [
    os.environ.get("TAMAZIA_ENV"),
    "/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env",
    "/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os/.env",
    # On the Oracle VM the engine checkout lives here; harmless if absent.
    os.path.expanduser("~/tamazia-engine/.env"),
]


def _env(key):
    """Return env var `key`, else the first matching `^KEY=...` line in an .env."""
    if os.environ.get(key):
        return os.environ[key]
    pat = re.compile(r"^\s*" + re.escape(key) + r"\s*=\s*(.*?)\s*$")
    for p in ENV_CANDIDATES:
        if p and os.path.exists(p):
            try:
                with open(p, encoding="utf-8", errors="ignore") as fh:
                    for line in fh:
                        m = pat.match(line)
                        if m:
                            return m.group(1).strip().strip('"').strip("'")
            except OSError:
                continue
    return None


NEON = _env("NEON_URL")
HOST = re.sub(r".*@([^/]+)/.*", r"\1", NEON) if NEON else None


class NeonError(Exception):
    """Raised internally when Neon is unreachable or misconfigured."""


def neon(query, params=None):
    """POST one SQL statement to https://<host>/sql and return rows (list of dict).

    Identical request shape to ops/neonq.py: header carries the connection string,
    body is {"query": q, "params": []}, rows come back as d['rows'].
    Raises NeonError on any failure so callers can fail-soft with a clean message.
    """
    if not NEON or not HOST:
        raise NeonError("NEON_URL not found in env or engine .env")
    try:
        req = urllib.request.Request(
            "https://" + HOST + "/sql",
            data=json.dumps({"query": query, "params": params or []}).encode(),
            headers={
                "Neon-Connection-String": NEON,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except Exception as e:  # network, auth, JSON, timeout - all fail-soft
        raise NeonError(str(e)[:200])
    return d.get("rows", d.get("results", []))


def _scalar(query, default=None):
    """First column of the first row, or `default` on empty/None."""
    rows = neon(query)
    if not rows:
        return default
    first = rows[0]
    if isinstance(first, dict):
        for v in first.values():
            return v
        return default
    if isinstance(first, (list, tuple)):
        return first[0] if first else default
    return first


def _num(x, default=0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _pct(numer, denom):
    n, d = _num(numer), _num(denom)
    return round(n / d * 100, 1) if d else 0.0


# ---------------------------------------------------------------------------
# Funnel SQL - copied VERBATIM from scripts/gen-state.js (one(...) queries) so
# the seven counts match the live schema and PIPELINE-STATE.md.
# ---------------------------------------------------------------------------
Q_LEADS = "SELECT COUNT(*) FROM leads"
Q_QUALIFIED = "SELECT COUNT(*) FROM leads WHERE lifecycle_stage='qualified'"
Q_FIT = "SELECT COUNT(*) FROM leads WHERE COALESCE(quality_fit,FALSE)=TRUE"
# O5/O6 [A20/X3/A51]: "email-ready" must mirror the REAL push WHERE clause in
# scripts/push-to-mystrika.js (the gate that actually decides what gets sent), not a
# looser touch_%_queued + pending-draft proxy. The old proxy reported 32; the true
# send-eligible set is 25 (and drops to 0 until the governor releases, by design).
# This is the SINGLE source of truth shared verbatim with gen-state.js's emailReady.
# Kept in sync with push-to-mystrika.js: quality_fit + qualified + audit_verified +
# audit_url + email + not-already-pushed + deliverability-clean + not-replied +
# status-not-suppressed + governor-released. (catch-all stays STRICT per founder.)
Q_EMAIL_READY = (
    "SELECT COUNT(*) FROM leads l "
    "WHERE l.quality_fit=TRUE AND COALESCE(l.lifecycle_stage,'')='qualified' "
    "AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal') "
    "AND COALESCE(l.audit_verified,FALSE)=TRUE AND COALESCE(l.audit_url,'')<>'' "
    "AND COALESCE(l.contact_email,l.email,'')<>'' AND COALESCE(l.mystrika_pushed,FALSE)=FALSE "
    "AND COALESCE(NULLIF(l.deliverability,''), l.verify_status, '') "
    "NOT IN ('bad','invalid','undeliverable','no_mx','nxdomain','disposable') "
    "AND COALESCE(l.replied,FALSE)=FALSE "
    "AND COALESCE(l.status,'') NOT IN ('suppressed','dnc','bounced','duplicate') "
    "AND l.governor_released_at IS NOT NULL"
)
# P2/P4 [A21/X10]: exclude the warmup pool from "sent". Real lead-directed sends stamp
# sends.lead_id (send-due.js / push-to-mystrika.js); warmup traffic leaves it NULL. The
# bare COUNT(*) counted 184 warmup rows as outreach. Filter to attributed sends only.
Q_SENT = "SELECT COUNT(*) FROM sends WHERE lead_id IS NOT NULL"
# P4 [A33/A40]: a reply is a matched_lead_id row that is NOT a STOP/opt-out or a bounce
# (those are suppression/deliverability signals, not engagement). Standardised on
# matched_lead_id across MCP + gen-state; the stop/bounce filter mirrors compute-metrics.js.
Q_REPLIED = (
    "SELECT COUNT(*) FROM inbound_emails "
    "WHERE matched_lead_id IS NOT NULL "
    "AND COALESCE(stop_keyword_detected,FALSE)=FALSE "
    "AND COALESCE(bounce_detected,FALSE)=FALSE"
)
# P4 [X21]: a booking only counts if it actually stands. Exclude cancelled/rejected/no-show.
Q_BOOKED = (
    "SELECT COUNT(*) FROM cal_bookings "
    "WHERE COALESCE(status,'') NOT IN "
    "('cancelled','canceled','rejected','declined','no_show','no-show')"
)


def _funnel():
    """Return the seven funnel counts as ints. Per-stage fail-soft -> 'n/a'."""
    out = {}
    for key, q in [
        ("leads", Q_LEADS),
        ("qualified", Q_QUALIFIED),
        ("fit", Q_FIT),
        ("email_ready", Q_EMAIL_READY),
        ("sent", Q_SENT),
        ("replied", Q_REPLIED),
        ("booked", Q_BOOKED),
    ]:
        try:
            out[key] = _scalar(q, default="n/a")
        except NeonError:
            out[key] = "n/a"
    return out


# ===========================================================================
# TOOL 1: pipeline_status
# ===========================================================================
def pipeline_status() -> str:
    """One sentence with the seven Tamazia funnel counts (sourced -> booked)."""
    try:
        neon("SELECT 1")
    except NeonError as e:
        return "Cannot reach Neon: " + str(e)
    f = _funnel()
    return (
        "Tamazia funnel: {leads} leads sourced -> {qualified} qualified -> "
        "{fit} FIT -> {email_ready} email-ready -> {sent} sent -> "
        "{replied} replied -> {booked} booked.".format(**f)
    )


# ===========================================================================
# TOOL 2: source_performance
# ===========================================================================
def source_performance() -> str:
    """Per-source bounce rate, reply rate, and cost-per-lead where derivable.

    Joins leads.source (the canonical per-source key, e.g. 'serp-top','reddit')
    to sends / bounce_events / inbound_emails for deliverability, and to
    lead_sources.cost_per_month_gbp for cost-per-lead. Sources with a cost of
    0 (free registers/signals) report cost-per-lead as GBP0.00; any metric that
    cannot be derived for a source is reported as 'n/a' rather than guessed.
    """
    # Per-source: leads sourced, sends, bounces, replies. bounce/reply rates are
    # over SENDS (the deliverability denominator), cost-per-lead is over LEADS.
    q = """
        WITH per AS (
          SELECT COALESCE(NULLIF(l.source,''),'(unknown)') AS source,
                 COUNT(DISTINCT l.id)                                   AS leads,
                 COUNT(DISTINCT s.id)                                   AS sends,
                 COUNT(DISTINCT s.id) FILTER (
                   WHERE s.bounced_at IS NOT NULL
                      OR COALESCE(s.delivery_status,'') ILIKE '%bounce%'
                      OR COALESCE(s.status,'')          ILIKE '%bounce%')         AS bounces,
                 COUNT(DISTINCT s.id) FILTER (WHERE s.replied_at IS NOT NULL)     AS replies
          FROM leads l
          LEFT JOIN sends s ON s.lead_id = l.id
          GROUP BY 1
        )
        SELECT per.source, per.leads, per.sends, per.bounces, per.replies,
               COALESCE(ls.cost_per_month_gbp, NULL) AS cost_gbp
        FROM per
        LEFT JOIN lead_sources ls ON ls.source = per.source
        WHERE per.leads > 0
        ORDER BY per.sends DESC, per.leads DESC
        LIMIT 40
    """
    try:
        rows = neon(q)
    except NeonError as e:
        return "Cannot compute source performance (Neon unreachable: " + str(e) + ")."
    if not rows:
        return "No source rows yet: leads.source is empty across the table."

    lines = ["Per-source performance (bounce/reply over sends, cost-per-lead over leads):"]
    for r in rows:
        src = r.get("source", "(unknown)")
        leads = int(_num(r.get("leads")))
        sends = int(_num(r.get("sends")))
        bounces = int(_num(r.get("bounces")))
        replies = int(_num(r.get("replies")))
        cost = r.get("cost_gbp")

        bounce_s = (str(_pct(bounces, sends)) + "%") if sends else "n/a (0 sends)"
        reply_s = (str(_pct(replies, sends)) + "%") if sends else "n/a (0 sends)"
        if cost is None:
            cpl_s = "n/a (source not in lead_sources)"
        elif leads:
            cpl_s = "GBP" + format(_num(cost) / leads, ".2f") + "/lead"
        else:
            cpl_s = "n/a (0 leads)"

        lines.append(
            "- {src}: {leads} leads, {sends} sends | bounce {b} | reply {rp} | {cpl}".format(
                src=src, leads=leads, sends=sends, b=bounce_s, rp=reply_s, cpl=cpl_s
            )
        )
    lines.append(
        "Note: cost-per-lead uses lead_sources.cost_per_month_gbp / leads-sourced "
        "(a monthly cost spread over lifetime leads, so it trends down as volume grows); "
        "free sources show GBP0.00."
    )
    return "\n".join(lines)


# ===========================================================================
# TOOL 3: engine_health
# ===========================================================================
def engine_health() -> str:
    """Which engines ran (engine_runs) and which are stuck (system_health stuck_*).

    Reports each job's last finished_at + latest status from engine_runs, then any
    system_health rows where check_key LIKE 'stuck_%' that are not passing.
    """
    out = []

    # Last run per job (latest by finished_at, falling back to started_at).
    q_runs = """
        SELECT job,
               to_char(MAX(COALESCE(finished_at, started_at)), 'YYYY-MM-DD HH24:MI') AS last_run,
               (array_agg(status ORDER BY COALESCE(finished_at, started_at) DESC))[1] AS last_status,
               SUM(COALESCE(errors,0)) AS errors
        FROM engine_runs
        GROUP BY job
        ORDER BY MAX(COALESCE(finished_at, started_at)) DESC
        LIMIT 40
    """
    try:
        runs = neon(q_runs)
        if runs:
            out.append("Engines (last run, UTC):")
            for r in runs:
                job = r.get("job", "?")
                last = r.get("last_run") or "?"
                st = r.get("last_status") or "?"
                errs = int(_num(r.get("errors")))
                tail = (" (" + str(errs) + " errors)") if errs else ""
                out.append("- {j}: {t} -> {s}{x}".format(j=job, t=last, s=st, x=tail))
        else:
            out.append("Engines: no engine_runs rows yet (heartbeats begin next cycle).")
    except NeonError as e:
        out.append("Engines: cannot read engine_runs (Neon unreachable: " + str(e) + ").")

    # Stuck checks from system_health.
    q_stuck = """
        SELECT check_key, status, COALESCE(detail,'') AS detail,
               COALESCE(metric::text,'') AS metric
        FROM system_health
        WHERE check_key LIKE 'stuck_%'
        ORDER BY (status='fail') DESC, check_key
    """
    try:
        stuck = neon(q_stuck)
        bad = [r for r in stuck if str(r.get("status", "")).lower() in ("fail", "warn")]
        if not stuck:
            out.append("Stuck checks: none registered (no stuck_* keys in system_health).")
        elif not bad:
            out.append("Stuck checks: all " + str(len(stuck)) + " stuck_* checks passing.")
        else:
            out.append("Stuck checks flagged:")
            for r in bad:
                detail = r.get("detail") or r.get("metric") or ""
                out.append(
                    "- {k} [{s}] {d}".format(
                        k=r.get("check_key"), s=r.get("status"), d=detail
                    ).rstrip()
                )
    except NeonError as e:
        out.append("Stuck checks: cannot read system_health (Neon unreachable: " + str(e) + ").")

    return "\n".join(out)


# ===========================================================================
# TOOL 4: todays_bookings
# ===========================================================================
def todays_bookings() -> str:
    """cal_bookings whose start_at is today (UTC). One line per booking."""
    q = """
        SELECT to_char(start_at, 'HH24:MI') AS at,
               COALESCE(attendee_name,'?')    AS who,
               COALESCE(attendee_company,'')   AS company,
               COALESCE(attendee_email,'')     AS email,
               COALESCE(event_type,'')         AS event_type,
               COALESCE(status,'')             AS status
        FROM cal_bookings
        WHERE (start_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
        ORDER BY start_at
    """
    # Both sides forced to UTC: `start_at::date` alone uses the SESSION timezone, while the RHS already forces
    # UTC, so under any non-UTC session tz a booking near midnight would land in the wrong day. The session is
    # GMT today (so this is a no-op now), but pinning both sides to UTC makes the "today (UTC)" contract hold
    # regardless of the connection's tz.
    try:
        rows = neon(q)
    except NeonError as e:
        return "Cannot read today's bookings (Neon unreachable: " + str(e) + ")."
    if not rows:
        return "No bookings for today (cal_bookings has 0 rows starting today, UTC)."
    lines = ["Today's bookings (UTC, " + str(len(rows)) + "):"]
    for r in rows:
        comp = (" @ " + r["company"]) if r.get("company") else ""
        em = (" <" + r["email"] + ">") if r.get("email") else ""
        et = (" [" + r["event_type"] + "]") if r.get("event_type") else ""
        st = (" - " + r["status"]) if r.get("status") else ""
        lines.append(
            "- {t} {who}{comp}{em}{et}{st}".format(
                t=r.get("at", "?"), who=r.get("who", "?"),
                comp=comp, em=em, et=et, st=st,
            )
        )
    return "\n".join(lines)


# ===========================================================================
# TOOL 5: recent_replies
# ===========================================================================
def recent_replies(limit: int = 15) -> str:
    """Recent inbound_emails that matched a lead (matched_lead_id IS NOT NULL).

    Shows received time, sender, subject, classification, and the matched lead id.
    `limit` is clamped to 1..50.
    """
    try:
        n = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        n = 15
    q = """
        SELECT to_char(received_at, 'YYYY-MM-DD HH24:MI') AS at,
               COALESCE(from_email,'?')              AS from_email,
               COALESCE(subject,'(no subject)')      AS subject,
               COALESCE(classification,'')           AS classification,
               matched_lead_id
        FROM inbound_emails
        WHERE matched_lead_id IS NOT NULL
        ORDER BY received_at DESC NULLS LAST, id DESC
        LIMIT %d
    """ % n
    try:
        rows = neon(q)
    except NeonError as e:
        return "Cannot read recent replies (Neon unreachable: " + str(e) + ")."
    if not rows:
        return "No matched replies yet (inbound_emails has 0 rows with matched_lead_id)."
    lines = ["Recent matched replies (newest first, " + str(len(rows)) + "):"]
    for r in rows:
        subj = (r.get("subject") or "").replace("\n", " ").strip()
        if len(subj) > 70:
            subj = subj[:67] + "..."
        cls = (" {" + r["classification"] + "}") if r.get("classification") else ""
        lines.append(
            "- {at} {frm} | \"{subj}\"{cls} -> lead #{lid}".format(
                at=r.get("at", "?"), frm=r.get("from_email", "?"),
                subj=subj, cls=cls, lid=r.get("matched_lead_id"),
            )
        )
    return "\n".join(lines)


# ===========================================================================
# Slack / Telegram posting - mirrors scripts/intel-pulse.js (postSlack/postTelegram)
# ===========================================================================
def _post_slack(text):
    tok = _env("SLACK_BOT_TOKEN")
    if not tok:
        return "Slack: skipped (SLACK_BOT_TOKEN not set)."
    try:
        req = urllib.request.Request(
            "https://slack.com/api/chat.postMessage",
            data=json.dumps({"channel": "#all-tamazia", "text": text}).encode("utf-8"),
            headers={
                "Authorization": "Bearer " + tok,
                "Content-Type": "application/json; charset=utf-8",
            },
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
        if d.get("ok"):
            return "Slack: posted to #all-tamazia."
        return "Slack: API returned not-ok (" + str(d.get("error", "unknown")) + ")."
    except Exception as e:
        return "Slack: post failed (" + str(e)[:120] + ")."


def _post_telegram(text):
    tok = _env("TELEGRAM_BOT_TOKEN")
    chat = _env("TELEGRAM_CHAT_ID")
    if not tok or not chat:
        return "Telegram: skipped (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set)."
    try:
        req = urllib.request.Request(
            "https://api.telegram.org/bot" + tok + "/sendMessage",
            data=json.dumps(
                {"chat_id": chat, "text": text, "parse_mode": "Markdown"}
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
        if d.get("ok"):
            return "Telegram: sent."
        return "Telegram: API returned not-ok (" + str(d.get("description", "unknown")) + ")."
    except Exception as e:
        return "Telegram: send failed (" + str(e)[:120] + ")."


# ===========================================================================
# TOOL 6: push_digest
# ===========================================================================
def push_digest() -> str:
    """Post pipeline status + any health fails to Slack (#all-tamazia) and Telegram.

    Builds the one-line funnel plus a short list of failing health checks
    (system_health.status='fail', excluding '_overall'), posts to both channels,
    and returns what was sent and each channel's delivery result.
    """
    # Funnel line (fail-soft if Neon is down -> still report that).
    try:
        neon("SELECT 1")
        f = _funnel()
        funnel_line = (
            "{leads} leads -> {qualified} qual -> {fit} FIT -> {email_ready} email-ready "
            "-> {sent} sent -> {replied} replied -> {booked} booked".format(**f)
        )
    except NeonError as e:
        funnel_line = "Neon unreachable (" + str(e) + ")"

    # Health fails + overall score (same shape as intel-pulse.js).
    fails = []
    health = None
    try:
        health = _scalar("SELECT metric FROM system_health WHERE check_key='_overall'")
        rows = neon(
            "SELECT check_key || ' - ' || COALESCE(detail,'') AS line "
            "FROM system_health WHERE status='fail' AND check_key<>'_overall' "
            "ORDER BY check_key"
        )
        fails = [r.get("line", "") for r in rows if r.get("line")]
    except NeonError:
        pass

    when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    health_str = (str(health) + "%") if health not in (None, "") else "?"

    slack_text = (
        ":bar_chart: *Tamazia ops digest* (" + when + ") - health " + health_str + "\n"
        + funnel_line
        + ("\n\n:rotating_light: *Health fails:*\n" + "\n".join("- " + x for x in fails)
           if fails else "\n\nHealth: no failing checks.")
    )
    tg_text = (
        "*Tamazia ops digest* (" + when + ") - health " + health_str + "\n"
        + funnel_line
        + ("\n\nHealth fails:\n" + "\n".join("- " + x for x in fails)
           if fails else "\n\nHealth: no failing checks.")
    )

    slack_res = _post_slack(slack_text)
    tg_res = _post_telegram(tg_text)

    return (
        "push_digest sent:\n"
        + funnel_line + "\n"
        + ("health fails: " + str(len(fails)) if fails else "health: clean") + "\n"
        + slack_res + "\n" + tg_res
    )


# ===========================================================================
# Tool registry - name -> (callable, description, JSON-Schema for inputs).
# The 6 tool bodies above are unchanged from the SDK version; this table is the
# hand-rolled replacement for the @mcp.tool() decorators.
# ===========================================================================
def _schema(properties=None, required=None):
    return {
        "type": "object",
        "properties": properties or {},
        "required": required or [],
    }


TOOLS = {
    "pipeline_status": {
        "fn": pipeline_status,
        "description": (
            "One sentence with the seven Tamazia funnel counts: leads sourced -> "
            "qualified -> FIT -> email-ready -> sent -> replied -> booked. Reads live Neon."
        ),
        "inputSchema": _schema(),
    },
    "source_performance": {
        "fn": source_performance,
        "description": (
            "Per-source bounce rate, reply rate, and cost-per-lead where derivable "
            "(joins leads.source to sends / bounce_events / inbound_emails and "
            "lead_sources.cost_per_month_gbp). Metrics it cannot derive are 'n/a', never guessed."
        ),
        "inputSchema": _schema(),
    },
    "engine_health": {
        "fn": engine_health,
        "description": (
            "Which engines ran (last finished_at + status per job from engine_runs) and "
            "which are stuck (system_health rows where check_key LIKE 'stuck_%')."
        ),
        "inputSchema": _schema(),
    },
    "todays_bookings": {
        "fn": todays_bookings,
        "description": "cal_bookings rows whose start_at is today (UTC), one line per booking.",
        "inputSchema": _schema(),
    },
    "recent_replies": {
        "fn": recent_replies,
        "description": (
            "Recent inbound_emails with matched_lead_id set (received time, sender, "
            "subject, classification, matched lead id). Optional 'limit' clamped to 1..50."
        ),
        "inputSchema": _schema(
            properties={
                "limit": {
                    "type": "integer",
                    "description": "Max replies to return, clamped 1..50 (default 15).",
                    "minimum": 1,
                    "maximum": 50,
                    "default": 15,
                }
            },
        ),
    },
    "push_digest": {
        "fn": push_digest,
        "description": (
            "Posts the pipeline status + any failing health checks to Slack (#all-tamazia "
            "via SLACK_BOT_TOKEN) and Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)."
        ),
        "inputSchema": _schema(),
    },
}


# ===========================================================================
# Hand-rolled MCP stdio JSON-RPC 2.0 transport (stdlib only, Python 3.9 safe).
# One compact JSON object per line in and out; flush after every write; stderr
# for any logging so stdout stays a clean protocol channel.
# ===========================================================================
PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "tamazia-ops", "version": "1.0.0"}


def _log(msg):
    """Diagnostics to stderr only - stdout is reserved for protocol messages."""
    try:
        sys.stderr.write("[tamazia-ops] " + str(msg) + "\n")
        sys.stderr.flush()
    except Exception:
        pass


def _write_message(obj):
    """Serialize one JSON-RPC message as a single compact line and flush stdout."""
    sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _result(req_id, result):
    _write_message({"jsonrpc": "2.0", "id": req_id, "result": result})


def _error(req_id, code, message):
    _write_message(
        {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}
    )


def _handle_initialize(params):
    """Echo the client's protocolVersion if present, else our default."""
    client_ver = None
    if isinstance(params, dict):
        client_ver = params.get("protocolVersion")
    return {
        "protocolVersion": client_ver or PROTOCOL_VERSION,
        "capabilities": {"tools": {}},
        "serverInfo": SERVER_INFO,
    }


def _handle_tools_list():
    tools = []
    for name, spec in TOOLS.items():
        tools.append(
            {
                "name": name,
                "description": spec["description"],
                "inputSchema": spec["inputSchema"],
            }
        )
    return {"tools": tools}


def _handle_tools_call(params):
    """Dispatch one tools/call. Returns an MCP tool result dict (never raises)."""
    if not isinstance(params, dict):
        return {
            "content": [{"type": "text", "text": "Invalid params for tools/call."}],
            "isError": True,
        }
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if not isinstance(arguments, dict):
        arguments = {}
    spec = TOOLS.get(name)
    if spec is None:
        return {
            "content": [{"type": "text", "text": "Unknown tool: " + str(name)}],
            "isError": True,
        }
    try:
        fn = spec["fn"]
        # Only recent_replies takes an argument; pass through the optional 'limit'.
        if name == "recent_replies":
            text = fn(arguments.get("limit", 15))
        else:
            text = fn()
        return {
            "content": [{"type": "text", "text": str(text)}],
            "isError": False,
        }
    except Exception as e:  # never crash the loop on a tool exception
        _log("tool '" + str(name) + "' raised: " + repr(e))
        return {
            "content": [{"type": "text", "text": "Tool error: " + str(e)[:300]}],
            "isError": True,
        }


def _dispatch(message):
    """Route one parsed JSON-RPC message. Notifications (no id) get no response."""
    if not isinstance(message, dict):
        return  # malformed top-level - skip silently (already logged by caller)

    method = message.get("method")
    has_id = "id" in message and message.get("id") is not None
    req_id = message.get("id")
    params = message.get("params")

    # Notifications (and any message without an id) never get a response.
    if not has_id:
        # notifications/initialized and friends: acknowledge by doing nothing.
        return

    if method == "initialize":
        _result(req_id, _handle_initialize(params))
        return
    if method == "tools/list":
        _result(req_id, _handle_tools_list())
        return
    if method == "tools/call":
        _result(req_id, _handle_tools_call(params))
        return
    if method == "ping":
        # Harmless liveness check some clients send; reply with empty result.
        _result(req_id, {})
        return

    # Any other method that carries an id -> standard JSON-RPC method-not-found.
    _error(req_id, -32601, "Method not found")


def main():
    """Read JSON-RPC lines from stdin until EOF; respond on stdout. Fail-soft."""
    _log("starting (stdlib-only, Python " + sys.version.split()[0] + ")")
    while True:
        try:
            line = sys.stdin.readline()
        except Exception as e:
            _log("stdin read error, exiting: " + repr(e))
            break
        if line == "":
            # EOF -> client closed the pipe; exit cleanly.
            break
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except Exception as e:
            # Malformed line: skip it, keep the loop alive.
            _log("skipping malformed line: " + repr(e))
            continue
        try:
            _dispatch(message)
        except Exception as e:
            # Last-ditch guard: a bug in dispatch must never kill the server.
            _log("dispatch error: " + repr(e))
            try:
                mid = message.get("id") if isinstance(message, dict) else None
                if mid is not None:
                    _error(mid, -32603, "Internal error")
            except Exception:
                pass


if __name__ == "__main__":
    main()
