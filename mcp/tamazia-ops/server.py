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

import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
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

    # O4 [A1/A61/A64]: stamp how stale the health surface is. A health snapshot last written days ago looks live
    # on the Health tab; surface the age of system_health's most-recent checked_at so a frozen health-check / a
    # dark cycle is obvious here too. Fail-soft.
    try:
        age = _scalar(
            "SELECT ROUND(EXTRACT(EPOCH FROM (now()-MAX(checked_at)))/60)::int "
            "FROM system_health",
            default=None,
        )
        if age is not None and str(age) != "":
            a = int(_num(age))
            label = (str(a) + "m ago") if a < 90 else (str(round(a / 60)) + "h ago (STALE)")
            out.append("Health surface last computed: " + label + ".")
    except NeonError:
        pass

    # Stuck checks from system_health.
    # O2 [A13/A42]: `stuck_*` is reserved for ENGINE LIVENESS (check-stuck-jobs.js writes category='liveness',
    # one key per job: stuck_engine-cycle, stuck_mystrika, ...). The DATA metric "leads overdue in cadence" is a
    # different thing (health-check.js writes it with category='data'); it should NOT show up as an engine being
    # "stuck". Filter to category='liveness' so a data backlog never masquerades as a dead engine. (We also accept
    # a future renamed data_stuck_leads key by simply not matching it here.) The data metric still surfaces on the
    # Health tab under its own category.
    q_stuck = """
        SELECT check_key, status, COALESCE(detail,'') AS detail,
               COALESCE(metric::text,'') AS metric
        FROM system_health
        WHERE check_key LIKE 'stuck_%'
          AND COALESCE(category,'') <> 'data'
          AND check_key <> 'stuck_leads'
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
# ACTION TOOLS (D5.8) - write side of the cockpit. Everything below is ADDITIVE
# and SCOPED: the lead-verdict tools touch ONLY review_status / review metadata /
# the claude_* review columns (never the off-limits audit_*/compliance_*/
# framework_*/classifier_*/pointer_*/scanner_cache families), the flag tool writes
# ONLY the system_state key/value store, and the (re)mint never UPDATEs audit_*
# directly - it dispatches the remint-audits workflow instead. Each tool is
# fail-soft (returns an error string, never raises out of the dispatcher) and
# idempotent (re-running on an already-acted row is a safe no-op).
#
# DESIGN BOUNDARY (matches the task's hard rule): these tools do NOT re-implement
# scoreLead / decideTier / icp.js. accept_lead/reject_lead only WRITE THE VERDICT
# into leads.review_status; the engine's scripts/apply-review.js then re-runs the
# CANONICAL gate and performs the promotion atomically (its promote() writes the
# same columns qualify-and-queue.js writes). The MCP is the verdict pen, not the
# scorer. SEND stays OFF throughout (the SEND_ENABLED master gate in send-due.js /
# push-to-mystrika.js sits ABOVE everything here; set_flag refuses to flip it
# without an explicit double-confirm sentinel).
# ===========================================================================

# The single SQL-string escaper, mirroring scripts/apply-review.js `esc` for the
# few spots where a value must be inlined (jsonb literal building). Parameterised
# binding ($1, $2 ...) is preferred and used wherever neon() takes params; this is
# only for values folded into a jsonb object literal.
def _sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def _as_lead_id(lead_id):
    """Coerce a lead id to a positive int, or return None if it is not one."""
    try:
        n = int(str(lead_id).strip())
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


# Verdict values that mean "already acted on" - apply-review.js stamps these
# 'applied_*' forms after it promotes/parks, and 'accepted'/'rejected' are the
# pending verdicts this MCP writes. Re-writing a verdict over any of these would
# either re-queue an already-applied lead or stomp a human decision, so the tools
# treat them as terminal for idempotency.
_APPLIED_PREFIX = "applied_"
_PENDING_VERDICTS = ("accepted", "rejected", "auto_promote", "needs_info")


# ===========================================================================
# GitHub Actions workflow_dispatch helper - mirrors the _post_slack / _post_telegram
# HTTP pattern (stdlib urllib, fail-soft string return). Used by dispatch_workflow
# and remint_audit. The repo is read from git's origin remote first, then env.
# ===========================================================================
# Allow-list of workflow files Claude may trigger conversationally. Deliberately a
# CLOSED set of safe, idempotent, NON-SEND jobs: the cold-send relay (mystrika.yml
# is gated by SEND_ENABLED anyway, but we still keep send orchestration off this
# list) and any destructive/long re-tier reruns are excluded. Unknown names are
# rejected with the allow-list echoed back. Keys are the human names accepted as the
# `name` argument; values are the .github/workflows/<file>.yml that GitHub expects.
SAFE_WORKFLOWS = {
    "engine-cycle": "engine-cycle.yml",
    "remint-audits": "remint-audits.yml",
    "claude-safeguard": "claude-safeguard.yml",
    "gen-state": "gen-state.yml",
    "intel-pulse": "intel-pulse.yml",
    "daily-digest": "daily-digest.yml",
    "match-inbound-replies": "match-inbound-replies.yml",
    "deliverability-guard": "deliverability-guard.yml",
    "neon-guard": "neon-guard.yml",
    # BUGFIX-R2 (#2): dedicated paid-sourcing jobs (source-leads / source-registers / scrapers /
    # resolve-registry-domains) REMOVED from the conversational allow-list — they spend Serper credits, which
    # violates the £0-default. engine-cycle (the normal cron loop) stays; re-add a specific one with founder
    # awareness if conversational scrape-triggering is wanted.
    "llm-rescue-backlog": "llm-rescue-backlog.yml",
    "nightly-workers": "nightly-workers.yml",
}

# The GitHub repo (owner/name) these workflows live in. Mirrors the engine repo;
# overridable via TAMAZIA_GH_REPO for forks/mirrors. Default matches CLAUDE.md.
GH_REPO = _env("TAMAZIA_GH_REPO") or "Tamaziaa/tamazia-cowork-os"


def _gh_token():
    """The GitHub token used for workflow_dispatch (env or engine .env)."""
    return _env("GH_TOKEN") or _env("GITHUB_TOKEN")


def _gh_dispatch(workflow_file, ref="main", inputs=None):
    """POST a workflow_dispatch to the GitHub API. Returns a fail-soft string.

    Endpoint + payload mirror `gh workflow run`:
      POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches
      body = {"ref": <branch>, "inputs": {...}}
    A successful dispatch returns HTTP 204 (no body), which we report as 'dispatched'.
    Any auth/network/HTTP failure is caught and returned as a one-line message so the
    MCP never crashes. The token value is never printed.
    """
    tok = _gh_token()
    if not tok:
        return "GitHub: skipped (GH_TOKEN / GITHUB_TOKEN not set)."
    url = (
        "https://api.github.com/repos/" + GH_REPO
        + "/actions/workflows/" + workflow_file + "/dispatches"
    )
    body = {"ref": ref}
    if inputs:
        body["inputs"] = inputs
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": "Bearer " + tok,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "tamazia-ops-mcp",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            code = getattr(r, "status", r.getcode())
        if code in (201, 202, 204):
            return "dispatched"
        return "GitHub: unexpected status " + str(code) + "."
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = " - " + e.read().decode("utf-8", "ignore")[:160]
        except Exception:
            pass
        return "GitHub: HTTP " + str(e.code) + detail
    except Exception as e:
        return "GitHub: dispatch failed (" + str(e)[:120] + ")."


# ===========================================================================
# TOOL 7: accept_lead
# ===========================================================================
def accept_lead(lead_id, dry: bool = False) -> str:
    """Mark a lead ACCEPTED for the cold path by writing leads.review_status='accepted'.

    This is the verdict pen, not the scorer: the engine's scripts/apply-review.js is
    the canonical promote hook. On its next run it re-tiers with the found data and
    promotes (quality_fit=TRUE + lifecycle_stage='qualified' + a governor-release
    attempt), then stamps review_status='applied_accepted' - all atomically, in
    apply-review.js's own UPDATE. The PECR consent gate there is never bypassed.

    ADDITIVE + SCOPED: writes ONLY review_status, reviewed_by, reviewed_at and
    claude_reviewed_at on the one targeted row. Never touches scores, tier, or any
    off-limits table. SEND stays OFF.

    IDEMPOTENT: if the lead is already 'accepted' (pending) or already 'applied_*'
    (apply-review.js has acted), this is a no-op and says so. `dry=True` returns the
    exact SQL without executing.
    """
    lid = _as_lead_id(lead_id)
    if lid is None:
        return "accept_lead: invalid lead_id (expected a positive integer id)."
    # Read the current verdict first so we can be idempotent and fail-soft.
    try:
        rows = neon(
            "SELECT id, lead_ref, COALESCE(review_status,'') AS rs, "
            "COALESCE(lifecycle_stage,'') AS stage FROM leads WHERE id=$1",
            [lid],
        )
    except NeonError as e:
        return "accept_lead: cannot reach Neon (" + str(e) + ")."
    if not rows:
        return "accept_lead: no lead with id " + str(lid) + "."
    row = rows[0]
    ref = row.get("lead_ref") or ("#" + str(lid))
    cur = str(row.get("rs", "")).lower().strip()
    if cur == "accepted":
        return ("accept_lead: lead " + str(ref) + " is already review_status='accepted' "
                "(pending apply-review). No-op.")
    if cur.startswith(_APPLIED_PREFIX):
        return ("accept_lead: lead " + str(ref) + " is already '" + cur
                + "' (apply-review.js has acted). No-op - won't re-queue.")
    sql = (
        "UPDATE leads SET review_status='accepted', "
        "reviewed_by=COALESCE(NULLIF(reviewed_by,''),'mcp_claude'), "
        "reviewed_at=NOW(), claude_reviewed_at=NOW() "
        "WHERE id=$1 "
        "AND COALESCE(review_status,'') NOT IN ('accepted') "
        "AND COALESCE(review_status,'') NOT LIKE 'applied_%'"
    )
    if dry:
        return "accept_lead (DRY) would run:\n" + sql + "\n  params=[" + str(lid) + "]"
    try:
        neon(sql, [lid])
    except NeonError as e:
        return "accept_lead: write failed (" + str(e) + ")."
    return ("accept_lead: lead " + str(ref) + " marked review_status='accepted'. "
            "apply-review.js will re-tier + promote on its next run (SEND stays OFF).")


# ===========================================================================
# TOOL 8: reject_lead
# ===========================================================================
def reject_lead(lead_id, reason: str = "", suppress: bool = False,
                dry: bool = False) -> str:
    """Mark a lead REJECTED (parks it out of the cold path) via review_status='rejected'.

    Mirrors apply-review.js semantics exactly: a reject PARKS the lead
    (lifecycle_stage='rejected' when apply-review runs) but does NOT suppress by
    itself - suppression is reserved for opt-outs. The free-text `reason` is stored
    additively in leads.claude_review_notes (jsonb merge, never clobbering existing
    keys). Pass suppress=True to ALSO add the lead's email to the suppression table
    (scope='domain'->no, scope is set to 'manual'); this is an explicit, separate,
    additive action.

    ADDITIVE + SCOPED: writes ONLY review_status, reviewed_by, reviewed_at,
    claude_reviewed_at and claude_review_notes on the targeted row (+ one additive
    suppression INSERT when suppress=True). Never touches off-limits tables.

    IDEMPOTENT: a lead already 'rejected'/'applied_*' is a no-op; the suppression
    INSERT is guarded by NOT EXISTS so re-running never duplicates a row.
    """
    lid = _as_lead_id(lead_id)
    if lid is None:
        return "reject_lead: invalid lead_id (expected a positive integer id)."
    try:
        rows = neon(
            "SELECT id, lead_ref, COALESCE(review_status,'') AS rs, "
            "COALESCE(contact_email,email,'') AS em FROM leads WHERE id=$1",
            [lid],
        )
    except NeonError as e:
        return "reject_lead: cannot reach Neon (" + str(e) + ")."
    if not rows:
        return "reject_lead: no lead with id " + str(lid) + "."
    row = rows[0]
    ref = row.get("lead_ref") or ("#" + str(lid))
    cur = str(row.get("rs", "")).lower().strip()
    email = str(row.get("em", "")).strip()
    already = cur == "rejected" or cur.startswith(_APPLIED_PREFIX)

    # Build the verdict UPDATE. The reason is merged into claude_review_notes jsonb
    # additively (|| keeps any existing keys); reason is inlined via _sql_str because
    # it sits inside a jsonb object literal (a bind param cannot build the {} object).
    note_obj = {
        "reject_reason": str(reason or "").strip(),
        "rejected_by": "mcp_claude",
    }
    note_lit = _sql_str(json.dumps(note_obj))
    upd = (
        "UPDATE leads SET review_status='rejected', "
        "reviewed_by=COALESCE(NULLIF(reviewed_by,''),'mcp_claude'), "
        "reviewed_at=NOW(), claude_reviewed_at=NOW(), "
        "claude_review_notes = COALESCE(claude_review_notes,'{}'::jsonb) || "
        + note_lit + "::jsonb "
        "WHERE id=$1 "
        "AND COALESCE(review_status,'') NOT IN ('rejected') "
        "AND COALESCE(review_status,'') NOT LIKE 'applied_%'"
    )
    # Suppression INSERT (only when asked AND we have an email). Guarded by NOT EXISTS
    # on (email, scope) so it is idempotent. scope='manual' marks a hand/agent action.
    sup_sql = None
    if suppress and email:
        sup_sql = (
            "INSERT INTO suppression (email, reason, scope, notes, suppressed_at) "
            "SELECT $1, $2, 'manual', $3, NOW() "
            "WHERE NOT EXISTS (SELECT 1 FROM suppression WHERE lower(email)=lower($1))"
        )

    if dry:
        out = ["reject_lead (DRY) would run:", upd, "  params=[" + str(lid) + "]"]
        if sup_sql:
            out.append("AND (suppress=True):")
            out.append(sup_sql)
            out.append("  params=[" + repr(email) + ", " + repr("rejected: " + str(reason or "")[:120]) + ", "
                       + repr(str(reason or "")[:200]) + "]")
        elif suppress and not email:
            out.append("(suppress=True requested but lead has no email -> suppression skipped)")
        return "\n".join(out)

    if not already:
        try:
            neon(upd, [lid])
        except NeonError as e:
            return "reject_lead: verdict write failed (" + str(e) + ")."
    sup_msg = ""
    if sup_sql:
        try:
            neon(sup_sql, [email, ("rejected: " + str(reason or "")[:120]).strip(), str(reason or "")[:200]])
            sup_msg = " Suppression: " + email + " added (or already present)."
        except NeonError as e:
            sup_msg = " Suppression write failed (" + str(e) + ")."
    elif suppress and not email:
        sup_msg = " (suppress requested but lead has no email -> skipped.)"

    if already:
        return ("reject_lead: lead " + str(ref) + " was already '" + cur
                + "' (no verdict change)." + sup_msg)
    return ("reject_lead: lead " + str(ref) + " marked review_status='rejected' "
            "(apply-review.js will park it out of the cold path; not suppressed by "
            "default)." + sup_msg)


# ===========================================================================
# TOOL 9: remint_audit
# ===========================================================================
def remint_audit(lead_id_or_hash, dry: bool = False) -> str:
    """Enqueue a re-mint of one audit page by dispatching the remint-audits workflow.

    The audit_pages table is in the OFF-LIMITS audit_* family, so this tool NEVER
    UPDATEs it directly. Instead it resolves the input to an audit hash and triggers
    the `remint-audits` GitHub Actions workflow (workflow_dispatch) with the `hashes`
    input set to that single hash - exactly the supported manual path
    (.github/workflows/remint-audits.yml -> REMINT_HASHES -> scripts/remint-audits.js,
    which rebuilds payload_json server-side). Resumable + per-row fail-soft on the
    engine side; safe to re-run (idempotent: a re-mint just refreshes the payload).

    Resolution: a numeric input is treated as a leads.id and its leads.audit_hash is
    looked up (READ only); anything else is treated as an audit hash directly. The
    hash is validated against audit_pages (a READ) before dispatch so a typo fails
    cleanly rather than kicking off an empty run.
    """
    raw = str(lead_id_or_hash).strip()
    if not raw:
        return "remint_audit: empty lead_id_or_hash."
    audit_hash = None
    lid = _as_lead_id(raw)
    if lid is not None:
        # numeric -> resolve the lead's audit hash (read-only).
        try:
            rows = neon(
                "SELECT COALESCE(audit_hash,'') AS h, COALESCE(audit_url,'') AS u "
                "FROM leads WHERE id=$1",
                [lid],
            )
        except NeonError as e:
            return "remint_audit: cannot reach Neon (" + str(e) + ")."
        if not rows:
            return "remint_audit: no lead with id " + str(lid) + "."
        audit_hash = str(rows[0].get("h", "")).strip()
        if not audit_hash:
            return ("remint_audit: lead #" + str(lid) + " has no audit_hash yet "
                    "(not minted). Nothing to re-mint.")
    else:
        audit_hash = raw

    # Validate the hash exists in audit_pages (READ only - we never write audit_*).
    try:
        chk = neon(
            "SELECT domain FROM audit_pages WHERE hash=$1 LIMIT 1", [audit_hash]
        )
    except NeonError as e:
        return "remint_audit: cannot verify hash against audit_pages (" + str(e) + ")."
    if not chk:
        return ("remint_audit: no audit_pages row with hash '" + audit_hash
                + "' (check the hash). Not dispatching.")
    domain = chk[0].get("domain", "")

    if dry:
        return (
            "remint_audit (DRY) would dispatch workflow 'remint-audits.yml' on "
            + GH_REPO + " (ref=main) with inputs={'hashes': '" + audit_hash + "'} "
            "for domain " + str(domain) + ". (No direct audit_* write.)"
        )
    res = _gh_dispatch("remint-audits.yml", ref="main", inputs={"hashes": audit_hash})
    if res == "dispatched":
        return ("remint_audit: dispatched remint-audits for hash " + audit_hash
                + " (" + str(domain) + "). Watch the Actions run; payload_json refreshes "
                "server-side. Re-running is safe.")
    return "remint_audit: " + res


# ===========================================================================
# TOOL 10: dispatch_workflow
# ===========================================================================
def dispatch_workflow(name, dry: bool = False) -> str:
    """Trigger a GitHub Actions workflow_dispatch by name, restricted to an allow-list.

    Only the SAFE_WORKFLOWS set may be triggered (idempotent, non-destructive, NON-
    SEND jobs - the cold-send relay and heavy multi-hour re-tier reruns are
    deliberately excluded). An unknown/typo name is rejected with the allow-list
    echoed back. Uses the same GH_TOKEN workflow_dispatch path as remint_audit.
    Fail-soft: any auth/network error is returned as a one-line message.
    """
    key = str(name or "").strip()
    # Accept either the human key ('engine-cycle') or the file ('engine-cycle.yml').
    if key.endswith(".yml"):
        key = key[:-4]
    wf = SAFE_WORKFLOWS.get(key)
    if not wf:
        allowed = ", ".join(sorted(SAFE_WORKFLOWS.keys()))
        return ("dispatch_workflow: '" + str(name) + "' is not in the allow-list. "
                "Allowed: " + allowed + ".")
    if dry:
        return ("dispatch_workflow (DRY) would dispatch '" + wf + "' on " + GH_REPO
                + " (ref=main), no inputs.")
    res = _gh_dispatch(wf, ref="main", inputs=None)
    if res == "dispatched":
        return "dispatch_workflow: dispatched '" + wf + "' on " + GH_REPO + " (ref=main)."
    return "dispatch_workflow: " + res


# ===========================================================================
# TOOL 11: set_flag
# ===========================================================================
# The kill-switch / flag store the engine actually reads is the system_state
# key/value table (e.g. send-due.js reads system_state.paused). set_flag upserts
# into it. SEND_ENABLED is the master send gate; flipping it ON is the single most
# dangerous action in the cockpit, so it requires an explicit double-confirm
# sentinel and defaults to REFUSE. (Note: the live SEND_ENABLED the relays read is
# the process env/ENV_B64 master gate; writing it here records intent in
# system_state and is still gated by the sentinel so the MCP can never be the thing
# that quietly turns sending on.)
_SEND_FLAG_KEYS = ("send_enabled",)  # lower-cased comparison
_CONFIRM_SENTINEL = "I_UNDERSTAND_SENDS_GO_LIVE"
# Values normalised to a canonical 'true'/'false' for the engine's truthy test
# (send-due.js: value.trim().toLowerCase()==='true'); other flags store verbatim.
_TRUTHY = ("1", "true", "yes", "on")
_FALSY = ("0", "false", "no", "off")


def set_flag(name, value, confirm: str = "", dry: bool = False) -> str:
    """Set an engine flag in the system_state key/value store the engine reads.

    Writes ONLY system_state (key, value, updated_at) - never a lead row, never an
    off-limits table. Idempotent by construction (ON CONFLICT (key) DO UPDATE).

    SAFETY: turning SEND ON is refused unless `confirm` is exactly the sentinel
    'I_UNDERSTAND_SENDS_GO_LIVE'. Any send-flag write WITHOUT the sentinel is
    rejected (whether you are turning it on OR off, so the gate is impossible to
    fumble); a non-send flag is written normally. boolean-ish values are normalised
    to 'true'/'false' so the engine's truthy test matches.

    Examples: set_flag('paused','true') arms the kill-switch (halts all sending
    immediately); set_flag('SEND_ENABLED','true', confirm='I_UNDERSTAND_SENDS_GO_LIVE')
    records send-go-live intent (and is the ONLY way that key can be written here).
    """
    key = str(name or "").strip()
    if not key:
        return "set_flag: empty flag name."
    val = "" if value is None else str(value).strip()
    low = val.lower()
    # Normalise boolean-ish values; leave other strings verbatim.
    if low in _TRUTHY:
        norm = "true"
    elif low in _FALSY:
        norm = "false"
    else:
        norm = val

    is_send_flag = key.lower() in _SEND_FLAG_KEYS
    if is_send_flag:
        # Double-confirm is MANDATORY for the send gate, in either direction, so the
        # MCP can never be the thing that flips sending without an explicit sentinel.
        if confirm != _CONFIRM_SENTINEL:
            return (
                "set_flag: REFUSED. '" + key + "' is the SEND master gate. To change "
                "it you must pass confirm='" + _CONFIRM_SENTINEL + "' (exactly). "
                "SEND is OFF by policy; nothing was written."
            )

    sql = (
        "INSERT INTO system_state (key, value, updated_at) VALUES ($1, $2, now()) "
        "ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()"
    )
    if dry:
        return ("set_flag (DRY) would run:\n" + sql + "\n  params=["
                + repr(key) + ", " + repr(norm) + "]"
                + ("  [SEND gate - sentinel OK]" if is_send_flag else ""))
    try:
        neon(sql, [key, norm])
    except NeonError as e:
        return "set_flag: write failed (" + str(e) + ")."
    extra = ""
    if is_send_flag:
        extra = (" NOTE: the live relays still read the SEND_ENABLED ENV master gate; "
                 "this records intent in system_state under the sentinel.")
    return ("set_flag: system_state['" + key + "'] = '" + norm + "'." + extra)


# ===========================================================================
# TOOL 12-NEW: tag_lead_dnc
# ===========================================================================
def tag_lead_dnc(lead_id) -> str:
    """Tag a lead Do-Not-Contact: sets status='dnc', lifecycle_stage='suppressed'.

    ADDITIVE + SCOPED: writes ONLY status, lifecycle_stage, updated_at on the
    targeted row. Never touches off-limits tables. SEND stays OFF.
    IDEMPOTENT: a lead already status='dnc' is a no-op.
    """
    lid = _as_lead_id(lead_id)
    if lid is None:
        return "tag_lead_dnc: invalid lead_id (expected a positive integer id)."
    try:
        rows = neon(
            "SELECT id, company, domain, COALESCE(status,'') AS st FROM leads WHERE id=$1",
            [lid],
        )
    except NeonError as e:
        return "tag_lead_dnc: cannot reach Neon (" + str(e) + ")."
    if not rows:
        return "tag_lead_dnc: no lead with id " + str(lid) + "."
    row = rows[0]
    company = row.get("company") or ("#" + str(lid))
    domain = row.get("domain") or ""
    if str(row.get("st", "")).lower() == "dnc":
        return ("tag_lead_dnc: lead " + company + " (" + domain + ") is already dnc. No-op.")
    try:
        rows2 = neon(
            "UPDATE leads SET status='dnc', lifecycle_stage='suppressed', "
            "updated_at=NOW() AT TIME ZONE 'UTC' "
            "WHERE id=$1 "
            "RETURNING company, domain",
            [lid],
        )
    except NeonError as e:
        return "tag_lead_dnc: write failed (" + str(e) + ")."
    if rows2:
        c = rows2[0].get("company") or company
        d = rows2[0].get("domain") or domain
        return "tag_lead_dnc: " + c + " (" + d + ") tagged dnc / suppressed."
    return "tag_lead_dnc: lead #" + str(lid) + " tagged dnc / suppressed."


# ===========================================================================
# TOOL 13-NEW: neon_query
# ===========================================================================
def neon_query(sql, limit: int = 50) -> str:
    """Run an arbitrary SELECT query against Neon. Non-SELECT queries are refused.

    SAFETY: only SELECT statements allowed (checked before execution).
    Results capped at min(limit, 200) rows. Returns a formatted table string.
    """
    if not isinstance(sql, str) or not sql.strip():
        return "neon_query: empty sql."
    if not sql.strip().upper().startswith("SELECT"):
        return "neon_query: Only SELECT queries allowed."
    try:
        cap = min(int(limit), 200)
    except (TypeError, ValueError):
        cap = 50
    cap = max(1, cap)
    # Inject LIMIT if not already present (simple heuristic).
    stripped = sql.rstrip().rstrip(";")
    upper = stripped.upper()
    if " LIMIT " not in upper:
        stripped = stripped + " LIMIT " + str(cap)
    try:
        rows = neon(stripped)
    except NeonError as e:
        return "neon_query: query failed (" + str(e) + ")."
    if not rows:
        return "neon_query: 0 rows returned."
    # Format as a plain-text table.
    if isinstance(rows[0], dict):
        cols = list(rows[0].keys())
    else:
        cols = ["col" + str(i) for i in range(len(rows[0]))]
    def _cell(r, c, i):
        if isinstance(r, dict):
            v = r.get(c)
        elif isinstance(r, (list, tuple)):
            v = r[i] if i < len(r) else ""
        else:
            v = r
        return str(v) if v is not None else "NULL"
    col_widths = [max(len(c), max(len(_cell(r, c, i)) for r in rows)) for i, c in enumerate(cols)]
    sep = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"
    header = "|" + "|".join(" " + c.ljust(w) + " " for c, w in zip(cols, col_widths)) + "|"
    lines = [sep, header, sep]
    for r in rows:
        line = "|" + "|".join(" " + _cell(r, c, i).ljust(w) + " " for i, (c, w) in enumerate(zip(cols, col_widths))) + "|"
        lines.append(line)
    lines.append(sep)
    lines.append(str(len(rows)) + " row(s) returned.")
    return "\n".join(lines)


# ===========================================================================
# TOOL 14-NEW: get_lead
# ===========================================================================
def get_lead(query) -> str:
    """Look up one or more leads by id (numeric) or by domain/company name (string).

    Numeric query -> exact id lookup.
    String query  -> ILIKE match on domain and company (up to 5 results).
    Returns key fields: id, company, domain, sector, icp_tier, lifecycle_stage,
    contact_email, quality_fit, audit_url, mystrika_pushed, claude_cleared,
    governor_released_at, status.
    """
    q = str(query or "").strip()
    if not q:
        return "get_lead: empty query."
    select = (
        "SELECT id, company, domain, sector, icp_tier, lifecycle_stage, contact_email, "
        "quality_fit, audit_url, mystrika_pushed, claude_cleared, governor_released_at, status "
        "FROM leads "
    )
    try:
        lid = _as_lead_id(q)
        if lid is not None:
            rows = neon(select + "WHERE id=$1", [lid])
        else:
            safe = q.replace("'", "''")
            rows = neon(select + "WHERE domain ILIKE '%" + safe + "%' OR company ILIKE '%" + safe + "%' LIMIT 5")
    except NeonError as e:
        return "get_lead: cannot reach Neon (" + str(e) + ")."
    if not rows:
        return "get_lead: no leads found for query: " + q
    lines = []
    for r in rows:
        lines.append(
            "id={id} | {company} | {domain} | sector={sector} | tier={icp_tier} | "
            "stage={lifecycle_stage} | email={contact_email} | fit={quality_fit} | "
            "pushed={mystrika_pushed} | cleared={claude_cleared} | "
            "released={governor_released_at} | status={status} | audit_url={audit_url}".format(
                id=r.get("id"),
                company=r.get("company") or "",
                domain=r.get("domain") or "",
                sector=r.get("sector") or "",
                icp_tier=r.get("icp_tier"),
                lifecycle_stage=r.get("lifecycle_stage") or "",
                contact_email=r.get("contact_email") or "",
                quality_fit=r.get("quality_fit"),
                mystrika_pushed=r.get("mystrika_pushed"),
                claude_cleared=r.get("claude_cleared"),
                governor_released_at=r.get("governor_released_at"),
                status=r.get("status") or "",
                audit_url=r.get("audit_url") or "",
            )
        )
    return ("\n".join(lines))


# ===========================================================================
# TOOL 15-NEW: capacity_snapshot
# ===========================================================================
def capacity_snapshot() -> str:
    """Snapshot of lead capacity across key pipeline gates.

    Counts from leads: total, tier-1, quality_fit, qualified, governor-released,
    audit_verified, claude_cleared, mystrika_pushed. Single query, fail-soft.
    """
    q = (
        "SELECT "
        "count(*) AS total, "
        "count(*) FILTER (WHERE icp_tier=1) AS tier1, "
        "count(*) FILTER (WHERE quality_fit) AS quality_fit, "
        "count(*) FILTER (WHERE lifecycle_stage='qualified') AS qualified, "
        "count(*) FILTER (WHERE governor_released_at IS NOT NULL) AS released, "
        "count(*) FILTER (WHERE COALESCE(audit_verified,false)) AS audit_verified, "
        "count(*) FILTER (WHERE COALESCE(claude_cleared,false)) AS cleared, "
        "count(*) FILTER (WHERE COALESCE(mystrika_pushed,false)) AS pushed "
        "FROM leads"
    )
    try:
        rows = neon(q)
    except NeonError as e:
        return "capacity_snapshot: cannot reach Neon (" + str(e) + ")."
    if not rows:
        return "capacity_snapshot: no data returned."
    r = rows[0] if isinstance(rows[0], dict) else {}
    lines = [
        "Capacity snapshot (leads table):",
        "  Total leads      : " + str(r.get("total", "n/a")),
        "  Tier-1           : " + str(r.get("tier1", "n/a")),
        "  Quality fit      : " + str(r.get("quality_fit", "n/a")),
        "  Qualified        : " + str(r.get("qualified", "n/a")),
        "  Governor released: " + str(r.get("released", "n/a")),
        "  Audit verified   : " + str(r.get("audit_verified", "n/a")),
        "  Claude cleared   : " + str(r.get("cleared", "n/a")),
        "  Mystrika pushed  : " + str(r.get("pushed", "n/a")),
    ]
    return "\n".join(lines)


# ===========================================================================
# TOOL 16-NEW: notion_update_cockpit
# ===========================================================================
def notion_update_cockpit(message) -> str:
    """Append a callout block to the Tamazia Notion cockpit page.

    Uses NOTION_API_KEY (or NOTION_TOKEN) from env. Appends a blue callout block
    with the provided message to the fixed cockpit page. Fail-soft.
    """
    msg = str(message or "").strip()
    if not msg:
        return "notion_update_cockpit: empty message."
    notion_key = _env("NOTION_API_KEY") or _env("NOTION_TOKEN")
    if not notion_key:
        return "notion_update_cockpit: NOTION_API_KEY / NOTION_TOKEN not set."
    PAGE_ID = "38148123-488c-81b4-9293-f9c7056ff2ff"
    data = json.dumps({
        "children": [{
            "type": "callout",
            "callout": {
                "rich_text": [{"type": "text", "text": {"content": msg}}],
                "icon": {"type": "emoji", "emoji": "\U0001f4ca"},
                "color": "blue_background",
            },
        }]
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            "https://api.notion.com/v1/blocks/" + PAGE_ID + "/children",
            data=data,
            headers={
                "Authorization": "Bearer " + notion_key,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            method="PATCH",
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            _ = r.read()
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = " - " + e.read().decode("utf-8", "ignore")[:160]
        except Exception:
            pass
        return "notion_update_cockpit: HTTP " + str(e.code) + detail
    except Exception as e:
        return "notion_update_cockpit: failed (" + str(e)[:150] + ")."
    return "notion_update_cockpit: cockpit updated: " + msg[:80]


# ===========================================================================
# HEAL TOOLS (D5.9) — the self-healing nerve center. READ-ONLY by default:
# failing_workflows / diagnose_run / gap_scan only OBSERVE (GitHub REST GETs +
# Neon SELECTs). retry_workflow is the ONLY mutating heal tool, and it is gated
# by a closed allow-list of safe, idempotent, NON-SEND workflows (send/mystrika
# can never be retried from here). Every tool is fail-soft (returns a compact
# JSON string, never raises out of the dispatcher) and never prints a secret.
#
# These wrap the exact GitHub REST + log-grep path that was done by hand all
# session (list failed runs -> pull the logs zip -> grep the real error), so the
# capability is now a first-class, repeatable tool instead of an ad-hoc curl.
# ===========================================================================

# A GitHub API GET helper, mirroring _gh_dispatch's auth/headers but for reads.
# Returns (parsed_json, None) on success or (None, error_string) on any failure.
def _gh_get(path, accept="application/vnd.github+json", raw=False):
    """GET https://api.github.com/<path>. Fail-soft: (data, None) | (None, err).

    `path` is everything after the api host (it may start with '/repos/...'). When
    raw=True the response body bytes are returned unparsed (used for the logs zip).
    The token value is never included in any returned string.
    """
    tok = _gh_token()
    if not tok:
        return None, "GH_TOKEN / GITHUB_TOKEN not set"
    url = "https://api.github.com" + (path if path.startswith("/") else "/" + path)
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": "Bearer " + tok,
                "Accept": accept,
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "tamazia-ops-mcp",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
        if raw:
            return body, None
        return json.loads(body.decode("utf-8", "ignore")), None
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = " - " + e.read().decode("utf-8", "ignore")[:140]
        except Exception:
            pass
        return None, "HTTP " + str(e.code) + detail
    except Exception as e:
        return None, str(e)[:160]


# ===========================================================================
# HEAL TOOL 1: failing_workflows
# ===========================================================================
def failing_workflows(limit: int = 12) -> str:
    """List the most recent FAILED GitHub Actions runs across the engine repo.

    Read-only GET /repos/{repo}/actions/runs?status=failure. Returns a compact JSON
    string: {"repo":..., "count":N, "runs":[{name, conclusion, run_id, branch,
    created_at, workflow_file, html_url}, ...]}. `limit` clamped 1..30 (default 12).
    Fail-soft: returns {"error": "..."} (never a secret) if the API is unreachable.
    """
    try:
        n = max(1, min(int(limit), 30))
    except (TypeError, ValueError):
        n = 12
    data, err = _gh_get(
        "/repos/" + GH_REPO + "/actions/runs?status=failure&per_page=" + str(n)
    )
    if err:
        return json.dumps({"tool": "failing_workflows", "error": err})
    runs = (data or {}).get("workflow_runs", []) or []
    out = []
    for r in runs[:n]:
        wf_path = r.get("path") or ""
        wf_file = wf_path.split("/")[-1] if wf_path else ""
        out.append({
            "name": r.get("name"),
            "conclusion": r.get("conclusion"),
            "run_id": r.get("id"),
            "branch": r.get("head_branch"),
            "created_at": r.get("created_at"),
            "workflow_file": wf_file,
            "html_url": r.get("html_url"),
        })
    return json.dumps({
        "tool": "failing_workflows",
        "repo": GH_REPO,
        "count": len(out),
        "runs": out,
    }, separators=(",", ":"))


# ===========================================================================
# HEAL TOOL 2: diagnose_run
# ===========================================================================
# Lines that carry no diagnostic signal even though they match the error regex
# (the safeguard prompt text, instructional comments echoed into logs, etc.).
_DIAGNOSE_NOISE = re.compile(
    r"(errors actually exist|If you find|Record with:|--clear-audit|"
    r"\"prompt\"|the named competitors|SYSTEMIC engine gap)", re.I
)
# A shell/script comment echoed into the log (starts with '#' but is NOT a GitHub
# Actions '##[...]' workflow command). These often contain words like "exit code"
# in prose and would otherwise masquerade as the real failure line, so drop them.
_COMMENT_LINE = re.compile(r"^#(?!#\[)")
# What counts as a real failure line. Ordered so the dispatcher can also surface
# the single most useful "headline" (an ##[error] / exit-code line) first.
_DIAGNOSE_PAT = re.compile(
    r"(##\[error\]|\bexit code\b|traceback|\bdenied\b|not found|\b401\b|\b403\b|"
    r"\bfatal\b|\berror:|\bException\b|Process completed with exit code [1-9])", re.I
)
# Strip a leading ISO-ish GitHub log timestamp and any ANSI colour escapes so the
# returned error lines are clean and de-duplicate properly.
_TS_PREFIX = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+Z\s")
_ANSI = re.compile(r"\x1b\[[0-9;]*m")


def diagnose_run(run_id, max_lines: int = 15) -> str:
    """Download a run's logs zip, unzip in-memory, return the top distinct error lines.

    THIS is the capability used by hand all session: GET the logs zip for {run_id},
    unzip it with the stdlib zipfile (no temp files), grep every member for the real
    error lines (##[error] / exit code / traceback / denied / 401 / not found / ...),
    drop known prompt/instruction noise, strip timestamps + ANSI colour, de-dupe, and
    return the top ~`max_lines` distinct lines plus a single best 'headline'.

    Read-only. Returns a compact JSON string {"run_id":..., "name":..., "conclusion":
    ..., "headline":..., "errors":[...]}. Fail-soft: {"error": "..."} on any failure.
    Note: the GitHub logs endpoint 302-redirects to signed blob storage; urllib's
    default redirect handling drops the Authorization header on the cross-host hop,
    which is exactly what that storage requires, so this works without extra handling.
    """
    rid = str(run_id or "").strip()
    if not rid.isdigit():
        return json.dumps({"tool": "diagnose_run",
                           "error": "invalid run_id (expected a numeric Actions run id)"})
    # Fetch run metadata first (name/conclusion) — nice context, and confirms the id.
    meta, merr = _gh_get("/repos/" + GH_REPO + "/actions/runs/" + rid)
    name = (meta or {}).get("name") if not merr else None
    conclusion = (meta or {}).get("conclusion") if not merr else None
    raw, err = _gh_get(
        "/repos/" + GH_REPO + "/actions/runs/" + rid + "/logs", raw=True
    )
    if err:
        return json.dumps({"tool": "diagnose_run", "run_id": rid, "name": name,
                           "conclusion": conclusion, "error": "logs: " + err})
    try:
        n = max(1, min(int(max_lines), 40))
    except (TypeError, ValueError):
        n = 15
    seen = []
    headline = None
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
        for member in zf.namelist():
            try:
                txt = zf.read(member).decode("utf-8", "ignore")
            except Exception:
                continue
            for line in txt.splitlines():
                s = _ANSI.sub("", _TS_PREFIX.sub("", line)).strip()
                if not s or len(s) < 4:
                    continue
                if _DIAGNOSE_NOISE.search(s) or _COMMENT_LINE.search(s):
                    continue
                if _DIAGNOSE_PAT.search(s):
                    s = s[:240]
                    if s not in seen:
                        seen.append(s)
                    # Prefer a real GitHub Actions ##[error] line as the headline;
                    # fall back to a bare exit-code line only if no ##[error] is seen.
                    if re.search(r"##\[error\]", s, re.I):
                        if headline is None or not re.search(
                            r"##\[error\]", headline, re.I
                        ):
                            headline = s
                    elif headline is None and re.search(
                        r"exit code [1-9]", s, re.I
                    ):
                        headline = s
    except zipfile.BadZipFile:
        return json.dumps({"tool": "diagnose_run", "run_id": rid,
                           "error": "logs body was not a valid zip"})
    if headline is None and seen:
        headline = seen[0]
    return json.dumps({
        "tool": "diagnose_run",
        "run_id": rid,
        "name": name,
        "conclusion": conclusion,
        "headline": headline,
        "errors": seen[:n],
    }, separators=(",", ":"))


# ===========================================================================
# HEAL TOOL 3: retry_workflow
# ===========================================================================
# The ONLY workflows the retry-once healer may re-run. A CLOSED allow-list of
# safe, idempotent, NON-SEND jobs (the exact set named in the task). send/mystrika
# orchestration is deliberately absent and can never be retried from here. Keys are
# the human names accepted as the `workflow_file` argument (with or without .yml);
# values are the .github/workflows/<file> GitHub expects.
RETRY_SAFE_WORKFLOWS = {
    "gen-state": "gen-state.yml",
    "match-inbound-replies": "match-inbound-replies.yml",
    "notion-sync": "notion-sync.yml",
    "capacity-report": "capacity-report.yml",
    "engine-cycle": "engine-cycle.yml",
    "scrapers": "scrapers.yml",
    "source-registers": "source-registers.yml",
    "llm-rescue-backlog": "llm-rescue-backlog.yml",
    "backlog-burst": "backlog-burst.yml",
    "layer3-complete": "layer3-complete.yml",
}


def retry_workflow(workflow_file, dry: bool = False) -> str:
    """Re-run a workflow on main via workflow_dispatch — the 'retry-once' healer.

    GUARD: refuses any workflow NOT in RETRY_SAFE_WORKFLOWS (a closed set of safe,
    idempotent, NON-SEND jobs). send/mystrika are never retryable from here. Accepts
    either the human name ('gen-state') or the file ('gen-state.yml'). Uses the same
    GH_TOKEN workflow_dispatch path (HTTP 204 = dispatched). Fail-soft JSON string;
    pass dry=true to preview without dispatching.
    """
    key = str(workflow_file or "").strip()
    if key.endswith(".yml"):
        key = key[:-4]
    wf = RETRY_SAFE_WORKFLOWS.get(key)
    if not wf:
        return json.dumps({
            "tool": "retry_workflow",
            "refused": True,
            "reason": "'" + str(workflow_file) + "' is not in the retry allow-list",
            "allowed": sorted(RETRY_SAFE_WORKFLOWS.keys()),
        })
    if dry:
        return json.dumps({"tool": "retry_workflow", "dry": True,
                           "would_dispatch": wf, "repo": GH_REPO, "ref": "main"})
    res = _gh_dispatch(wf, ref="main", inputs=None)
    ok = res == "dispatched"
    return json.dumps({
        "tool": "retry_workflow",
        "workflow": wf,
        "repo": GH_REPO,
        "ref": "main",
        "dispatched": ok,
        "detail": ("re-run requested" if ok else res),
    }, separators=(",", ":"))


# ===========================================================================
# HEAL TOOL 4: gap_scan
# ===========================================================================
# A live mini gap-ledger: a handful of canned Neon integrity SELECTs, each a
# single COUNT, run read-only and returned as numbers. Every query is fail-soft
# on its own (a missing column or table yields "err" for that row, not a crash),
# so the ledger always returns something even if the schema drifts.
_GAP_QUERIES = [
    ("claude_cleared",
     "SELECT count(*) c FROM leads WHERE COALESCE(claude_cleared,false)=true"),
    ("qa_status_null",
     "SELECT count(*) c FROM leads WHERE qa_status IS NULL"),
    ("sends_lead_id_null",
     "SELECT count(*) c FROM sends WHERE lead_id IS NULL"),
    ("leads_over_4_emails",
     "SELECT count(*) c FROM leads WHERE jsonb_typeof(emails)='array' "
     "AND jsonb_array_length(emails) > 4"),
    ("entity_type_null",
     "SELECT count(*) c FROM leads WHERE entity_type IS NULL"),
    ("stuck_sourced_enriched_7d",
     "SELECT count(*) c FROM leads WHERE lifecycle_stage IN ('sourced','enriched') "
     "AND created_at < now() - interval '7 days'"),
]


def gap_scan() -> str:
    """Run the canned Neon integrity COUNTs and return a live mini gap-ledger.

    Read-only. Each metric is a single COUNT, run independently and fail-soft (a
    metric that errors reports "err" rather than aborting the scan). Returns a
    compact JSON string {"tool":"gap_scan","gaps":{metric: n, ...}}. No args.
    """
    gaps = {}
    reachable = True
    for label, q in _GAP_QUERIES:
        try:
            v = _scalar(q, default=None)
            gaps[label] = int(v) if v is not None else None
        except NeonError as e:
            gaps[label] = "err"
            # If Neon itself is down the first failure flips this; later rows still
            # try (cheap) so a single bad query doesn't masquerade as a total outage.
            if "NEON_URL not found" in str(e):
                reachable = False
        except (TypeError, ValueError):
            gaps[label] = "err"
    out = {"tool": "gap_scan", "gaps": gaps}
    if not reachable:
        out["error"] = "NEON_URL not found in env or engine .env"
    return json.dumps(out, separators=(",", ":"))


# ===========================================================================
# GOOGLE API helpers — GSC + GA4 via service account (stdlib-only).
# Signing uses `cryptography` if installed, else falls back to openssl subprocess.
# Token is cached in-process (1h lifetime). Fails soft: returns string, never raises.
# ===========================================================================
_google_token_cache: Dict[str, Any] = {}  # scope -> (access_token, expires_at_epoch)


def _decode_google_sa() -> Optional[Dict]:
    b64 = _env("GOOGLE_SA_KEY_B64")
    if not b64:
        return None
    try:
        return json.loads(base64.b64decode(b64 + "==").decode("utf-8"))
    except Exception:
        return None


def _b64url(b: bytes) -> bytes:
    return base64.urlsafe_b64encode(b).rstrip(b"=")


def _jwt_sign(data_bytes: bytes, private_key_pem: str) -> bytes:
    """RS256-sign data_bytes. Uses cryptography lib if available, else openssl."""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        return key.sign(data_bytes, padding.PKCS1v15(), hashes.SHA256())
    except ImportError:
        pass
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(suffix=".pem")
        os.write(fd, private_key_pem.encode())
        os.close(fd)
        proc = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", tmp],
            input=data_bytes, capture_output=True, timeout=15,
        )
        if proc.returncode != 0:
            raise RuntimeError("openssl error: " + proc.stderr.decode()[:200])
        return proc.stdout
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def _google_access_token(scope: str) -> str:
    """Return a bearer token for `scope`, cached in-process for ~1h."""
    now = int(time.time())
    cached = _google_token_cache.get(scope)
    if cached and cached[1] > now + 60:
        return cached[0]
    sa = _decode_google_sa()
    if not sa:
        raise ValueError("GOOGLE_SA_KEY_B64 not set or invalid")
    hdr = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    pay = _b64url(json.dumps({
        "iss": sa["client_email"], "scope": scope,
        "aud": "https://oauth2.googleapis.com/token",
        "exp": now + 3600, "iat": now,
    }).encode())
    sig = _jwt_sign(hdr + b"." + pay, sa["private_key"])
    jwt = (hdr + b"." + pay + b"." + _b64url(sig)).decode()
    body = ("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer"
            "&assertion=" + urllib.parse.quote(jwt, safe=""))
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body.encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.load(r)
    tok = d.get("access_token")
    if not tok:
        raise ValueError("No access_token in Google token response: " + str(d)[:200])
    _google_token_cache[scope] = (tok, now + int(d.get("expires_in", 3600)))
    return tok


def _google_post(url: str, tok: str, body: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


# ===========================================================================
# TOOL 12: gsc_performance
# ===========================================================================
def gsc_performance(days: int = 30) -> str:
    """Top keywords + pages from Google Search Console for tamazia.co.uk."""
    try:
        days = max(1, min(int(days), 90))
    except (TypeError, ValueError):
        days = 30
    gsc_site = _env("GSC_SITE") or "sc-domain:tamazia.co.uk"
    try:
        tok = _google_access_token("https://www.googleapis.com/auth/webmasters.readonly")
    except Exception as e:
        return "gsc_performance: cannot get Google token (" + str(e)[:200] + ")."

    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    site_enc = urllib.parse.quote(gsc_site, safe="")
    base_url = ("https://www.googleapis.com/webmasters/v3/sites/"
                + site_enc + "/searchAnalytics/query")
    lines = ["GSC — " + gsc_site + " (last " + str(days) + "d, " + start_date + " → " + end_date + "):"]

    def _call(dims):
        return _google_post(base_url, tok, {
            "startDate": start_date, "endDate": end_date,
            "dimensions": dims, "rowLimit": 10,
        })

    try:
        d = _call(["query"])
        rows = d.get("rows", [])
        if rows:
            lines.append("Top keywords (clicks / impressions / pos / CTR):")
            for r in rows:
                q = (r.get("keys") or ["?"])[0]
                lines.append("  {q}: {c} clicks, {i} impr, pos {p:.1f}, CTR {ctr:.1f}%".format(
                    q=q[:60], c=int(r.get("clicks", 0)), i=int(r.get("impressions", 0)),
                    p=float(r.get("position", 0)), ctr=float(r.get("ctr", 0)) * 100,
                ))
        else:
            lines.append("Keywords: no data yet.")
    except Exception as e:
        lines.append("Keywords: error (" + str(e)[:120] + ").")

    try:
        d = _call(["page"])
        rows = d.get("rows", [])
        if rows:
            lines.append("Top pages (clicks / impressions):")
            for r in rows:
                page = (r.get("keys") or ["?"])[0].replace("https://tamazia.co.uk", "")
                lines.append("  {p}: {c} clicks, {i} impr".format(
                    p=page or "/", c=int(r.get("clicks", 0)), i=int(r.get("impressions", 0)),
                ))
        else:
            lines.append("Pages: no data yet.")
    except Exception as e:
        lines.append("Pages: error (" + str(e)[:120] + ").")

    return "\n".join(lines)


# ===========================================================================
# TOOL 13: ga4_analytics
# ===========================================================================
def ga4_analytics(days: int = 30) -> str:
    """Sessions, users, bounce rate, and top pages from GA4 for tamazia.co.uk."""
    try:
        days = max(1, min(int(days), 90))
    except (TypeError, ValueError):
        days = 30
    prop = _env("GA4_PROPERTY_ID") or "536210909"
    try:
        tok = _google_access_token("https://www.googleapis.com/auth/analytics.readonly")
    except Exception as e:
        return "ga4_analytics: cannot get Google token (" + str(e)[:200] + ")."

    url = "https://analyticsdata.googleapis.com/v1beta/properties/" + prop + ":runReport"
    date_range = [{"startDate": str(days) + "daysAgo", "endDate": "today"}]
    lines = ["GA4 — property " + prop + " (last " + str(days) + "d):"]

    try:
        d = _google_post(url, tok, {
            "dateRanges": date_range,
            "metrics": [
                {"name": "sessions"}, {"name": "activeUsers"},
                {"name": "bounceRate"}, {"name": "averageSessionDuration"},
            ],
        })
        rows = d.get("rows", [])
        if rows:
            mv = rows[0].get("metricValues", [])
            def _mv(i):
                return mv[i]["value"] if i < len(mv) else "?"
            br = round(float(_mv(2)) * 100, 1) if _mv(2) != "?" else "?"
            dur = round(float(_mv(3)), 0) if _mv(3) != "?" else "?"
            lines.append("Overall: {s} sessions · {u} users · bounce {br}% · avg session {d}s".format(
                s=_mv(0), u=_mv(1), br=br, d=dur,
            ))
        else:
            lines.append("Overall: no data yet (property may need time to populate).")
    except Exception as e:
        lines.append("Overall stats: error (" + str(e)[:120] + ").")

    try:
        d = _google_post(url, tok, {
            "dateRanges": date_range,
            "dimensions": [{"name": "pagePath"}],
            "metrics": [{"name": "screenPageViews"}, {"name": "activeUsers"}],
            "limit": 10,
            "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}],
        })
        rows = d.get("rows", [])
        if rows:
            lines.append("Top pages (views / users):")
            for r in rows:
                dv = r.get("dimensionValues", [{}])
                mv = r.get("metricValues", [{}, {}])
                path = dv[0].get("value", "?") if dv else "?"
                views = mv[0].get("value", "0") if mv else "0"
                users = mv[1].get("value", "0") if len(mv) > 1 else "0"
                lines.append("  {p}: {v} views, {u} users".format(p=path[:60], v=views, u=users))
    except Exception as e:
        lines.append("Top pages: error (" + str(e)[:120] + ").")

    return "\n".join(lines)


# ===========================================================================
# Tool registry - name -> (callable, description, JSON-Schema for inputs).
# The 6 READ tool bodies above are unchanged from the SDK version; the 5 ACTION
# tools (D5.8) are appended below. This table is the hand-rolled replacement for
# the @mcp.tool() decorators.
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
    # ----- GOOGLE ANALYTICS TOOLS (D5.55) -------------------------------------
    "gsc_performance": {
        "fn": gsc_performance,
        "description": (
            "Top keywords and pages from Google Search Console for tamazia.co.uk. "
            "Uses the GOOGLE_SA_KEY_B64 service account. Optional `days` (1-90, default 30). "
            "Returns clicks, impressions, position, CTR per keyword and page."
        ),
        "inputSchema": _schema(
            properties={
                "days": {
                    "type": "integer",
                    "description": "Look-back window in days (1-90, default 30).",
                    "minimum": 1, "maximum": 90, "default": 30,
                }
            },
        ),
    },
    "ga4_analytics": {
        "fn": ga4_analytics,
        "description": (
            "Sessions, users, bounce rate, avg session duration and top pages from "
            "GA4 for tamazia.co.uk (property 536210909). Uses GOOGLE_SA_KEY_B64. "
            "Optional `days` (1-90, default 30)."
        ),
        "inputSchema": _schema(
            properties={
                "days": {
                    "type": "integer",
                    "description": "Look-back window in days (1-90, default 30).",
                    "minimum": 1, "maximum": 90, "default": 30,
                }
            },
        ),
    },
    # ----- ACTION TOOLS (D5.8) -------------------------------------------------
    "accept_lead": {
        "fn": accept_lead,
        "description": (
            "ACCEPT a lead for the cold path: writes leads.review_status='accepted' "
            "(+ reviewed_by/reviewed_at/claude_reviewed_at). The engine's apply-review.js "
            "then re-tiers via the CANONICAL gate and promotes atomically (the MCP does NOT "
            "score). Additive, scoped to that one row, idempotent (already-accepted / "
            "applied_* = no-op). SEND stays OFF. Pass dry=true to see the SQL."
        ),
        "inputSchema": _schema(
            properties={
                "lead_id": {
                    "type": "integer",
                    "description": "leads.id to accept (positive integer).",
                    "minimum": 1,
                },
                "dry": {
                    "type": "boolean",
                    "description": "If true, return the exact SQL without executing.",
                    "default": False,
                },
            },
            required=["lead_id"],
        ),
    },
    "reject_lead": {
        "fn": reject_lead,
        "description": (
            "REJECT a lead (parks it out of the cold path via review_status='rejected'; "
            "apply-review.js sets lifecycle_stage='rejected'). `reason` is stored additively "
            "in claude_review_notes. Optional suppress=true ALSO adds the email to the "
            "suppression table (guarded, idempotent). Does NOT suppress by default "
            "(suppression is for opt-outs). Scoped + idempotent. Pass dry=true for the SQL."
        ),
        "inputSchema": _schema(
            properties={
                "lead_id": {
                    "type": "integer",
                    "description": "leads.id to reject (positive integer).",
                    "minimum": 1,
                },
                "reason": {
                    "type": "string",
                    "description": "Why it is rejected (stored in claude_review_notes).",
                    "default": "",
                },
                "suppress": {
                    "type": "boolean",
                    "description": "Also add the lead's email to the suppression table.",
                    "default": False,
                },
                "dry": {
                    "type": "boolean",
                    "description": "If true, return the exact SQL without executing.",
                    "default": False,
                },
            },
            required=["lead_id"],
        ),
    },
    "remint_audit": {
        "fn": remint_audit,
        "description": (
            "Enqueue a re-mint of ONE audit page by dispatching the remint-audits "
            "workflow (workflow_dispatch, hashes input). Resolves a numeric leads.id to "
            "its leads.audit_hash, else treats the input as a hash; validates it against "
            "audit_pages first (read only). NEVER writes audit_* directly. Idempotent / "
            "safe to re-run. Pass dry=true to preview the dispatch."
        ),
        "inputSchema": _schema(
            properties={
                "lead_id_or_hash": {
                    "type": "string",
                    "description": "A leads.id (numeric) or an audit hash to re-mint.",
                },
                "dry": {
                    "type": "boolean",
                    "description": "If true, describe the dispatch without firing it.",
                    "default": False,
                },
            },
            required=["lead_id_or_hash"],
        ),
    },
    "dispatch_workflow": {
        "fn": dispatch_workflow,
        "description": (
            "Trigger a GitHub Actions workflow_dispatch by name, restricted to a safe "
            "allow-list (engine-cycle, remint-audits, claude-safeguard, gen-state, "
            "intel-pulse, daily-digest, match-inbound-replies, deliverability-guard, "
            "neon-guard, source-leads, source-registers, scrapers, "
            "resolve-registry-domains, llm-rescue-backlog, nightly-workers). Unknown names "
            "are refused with the allow-list echoed back. Pass dry=true to preview."
        ),
        "inputSchema": _schema(
            properties={
                "name": {
                    "type": "string",
                    "description": "Workflow name from the allow-list (with or without .yml).",
                },
                "dry": {
                    "type": "boolean",
                    "description": "If true, describe the dispatch without firing it.",
                    "default": False,
                },
            },
            required=["name"],
        ),
    },
    "set_flag": {
        "fn": set_flag,
        "description": (
            "Set an engine flag in the system_state key/value store the engine reads "
            "(e.g. paused='true' arms the kill-switch). Writes ONLY system_state; "
            "idempotent (upsert). SAFETY: the SEND master gate (SEND_ENABLED) is REFUSED "
            "unless confirm='I_UNDERSTAND_SENDS_GO_LIVE' is passed exactly; default "
            "refuses. boolean-ish values normalise to 'true'/'false'. Pass dry=true for "
            "the SQL."
        ),
        "inputSchema": _schema(
            properties={
                "name": {
                    "type": "string",
                    "description": "Flag key in system_state (e.g. 'paused', 'SEND_ENABLED').",
                },
                "value": {
                    "type": "string",
                    "description": "Flag value (booleans normalise to 'true'/'false').",
                },
                "confirm": {
                    "type": "string",
                    "description": (
                        "Required ONLY for the SEND gate: must be "
                        "'I_UNDERSTAND_SENDS_GO_LIVE' to change SEND_ENABLED."
                    ),
                    "default": "",
                },
                "dry": {
                    "type": "boolean",
                    "description": "If true, return the exact SQL without executing.",
                    "default": False,
                },
            },
            required=["name", "value"],
        ),
    },
    # ----- D5.8 ADDITIONAL ACTION TOOLS ----------------------------------------
    "tag_lead_dnc": {
        "fn": tag_lead_dnc,
        "description": (
            "Tag a lead Do-Not-Contact: sets status='dnc' and lifecycle_stage='suppressed'. "
            "Additive, scoped to the one row, idempotent (already-dnc = no-op). "
            "SEND stays OFF. Never touches off-limits tables."
        ),
        "inputSchema": _schema(
            properties={
                "lead_id": {
                    "type": "integer",
                    "description": "leads.id to tag DNC (positive integer).",
                    "minimum": 1,
                },
            },
            required=["lead_id"],
        ),
    },
    "neon_query": {
        "fn": neon_query,
        "description": (
            "Run an arbitrary SELECT query against the Neon DB. Only SELECT statements "
            "are allowed (non-SELECT queries are refused). Results capped at min(limit, 200) "
            "rows. Returns a formatted table. Optional `limit` defaults to 50."
        ),
        "inputSchema": _schema(
            properties={
                "sql": {
                    "type": "string",
                    "description": "A SELECT SQL statement to run against Neon.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to return (capped at 200, default 50).",
                    "minimum": 1,
                    "maximum": 200,
                    "default": 50,
                },
            },
            required=["sql"],
        ),
    },
    "get_lead": {
        "fn": get_lead,
        "description": (
            "Look up a lead by numeric id or by domain/company name (ILIKE match, up to 5 "
            "results). Returns id, company, domain, sector, icp_tier, lifecycle_stage, "
            "contact_email, quality_fit, audit_url, mystrika_pushed, claude_cleared, "
            "governor_released_at, status."
        ),
        "inputSchema": _schema(
            properties={
                "query": {
                    "type": "string",
                    "description": "Numeric leads.id, or a domain/company name fragment.",
                },
            },
            required=["query"],
        ),
    },
    "capacity_snapshot": {
        "fn": capacity_snapshot,
        "description": (
            "One-shot capacity report from the leads table: total, tier-1, quality_fit, "
            "qualified, governor-released, audit_verified, claude_cleared, mystrika_pushed. "
            "No args. Fail-soft."
        ),
        "inputSchema": _schema(),
    },
    "notion_update_cockpit": {
        "fn": notion_update_cockpit,
        "description": (
            "Append a blue callout block to the Tamazia Notion cockpit page "
            "(page 38148123-488c-81b4-9293-f9c7056ff2ff). Uses NOTION_API_KEY / "
            "NOTION_TOKEN from env. Fail-soft."
        ),
        "inputSchema": _schema(
            properties={
                "message": {
                    "type": "string",
                    "description": "Text to append as a callout block on the cockpit page.",
                },
            },
            required=["message"],
        ),
    },
    # ----- HEAL TOOLS (D5.9) — self-healing nerve center -----------------------
    "failing_workflows": {
        "fn": failing_workflows,
        "description": (
            "List the most recent FAILED GitHub Actions runs across the engine repo "
            "(name, conclusion, run_id, branch, workflow_file, html_url) via the GitHub "
            "REST API. Read-only. Optional `limit` clamped 1..30 (default 12). Returns "
            "compact JSON. Pair run_id with diagnose_run to read the real error."
        ),
        "inputSchema": _schema(
            properties={
                "limit": {
                    "type": "integer",
                    "description": "Max failed runs to return, clamped 1..30 (default 12).",
                    "minimum": 1,
                    "maximum": 30,
                    "default": 12,
                }
            },
        ),
    },
    "diagnose_run": {
        "fn": diagnose_run,
        "description": (
            "Download a failed run's logs zip, unzip in-memory, and return the top "
            "distinct REAL error lines (##[error] / exit code / traceback / denied / "
            "401 / not found ...) plus a single best 'headline'. Read-only. Required "
            "`run_id` (numeric, from failing_workflows). Optional `max_lines` 1..40 "
            "(default 15). Returns compact JSON. This is the session-long manual "
            "log-grep capability made a first-class tool."
        ),
        "inputSchema": _schema(
            properties={
                "run_id": {
                    "type": "integer",
                    "description": "GitHub Actions run id to diagnose (from failing_workflows).",
                },
                "max_lines": {
                    "type": "integer",
                    "description": "Max distinct error lines to return, 1..40 (default 15).",
                    "minimum": 1,
                    "maximum": 40,
                    "default": 15,
                },
            },
            required=["run_id"],
        ),
    },
    "retry_workflow": {
        "fn": retry_workflow,
        "description": (
            "Re-run a workflow on main via workflow_dispatch — the 'retry-once' healer. "
            "GUARDED: only an allow-list of safe, idempotent, NON-SEND workflows may be "
            "retried (gen-state, match-inbound-replies, notion-sync, capacity-report, "
            "engine-cycle, scrapers, source-registers, llm-rescue-backlog, backlog-burst, "
            "layer3-complete). Never retries send/mystrika. Accepts the name or the .yml. "
            "Returns compact JSON; pass dry=true to preview."
        ),
        "inputSchema": _schema(
            properties={
                "workflow_file": {
                    "type": "string",
                    "description": (
                        "Workflow name or file to retry (must be in the retry allow-list)."
                    ),
                },
                "dry": {
                    "type": "boolean",
                    "description": "If true, preview the dispatch without executing.",
                    "default": False,
                },
            },
            required=["workflow_file"],
        ),
    },
    "gap_scan": {
        "fn": gap_scan,
        "description": (
            "Live mini gap-ledger: runs canned Neon integrity COUNTs (claude_cleared, "
            "qa_status NULL, sends.lead_id NULL, leads with >4 emails, entity_type NULL, "
            "leads stuck in sourced/enriched >7d) and returns the numbers as compact JSON. "
            "Read-only, no args, fail-soft per-metric."
        ),
        "inputSchema": _schema(),
    },
}


# Per-tool accepted keyword arguments. The dispatcher passes ONLY these keys
# (when present in the call's arguments) by keyword, so each function gets exactly
# the inputs it declares and nothing else. A tool not listed here takes no args.
_TOOL_ARGS = {
    "recent_replies": ("limit",),
    "gsc_performance": ("days",),
    "ga4_analytics": ("days",),
    "accept_lead": ("lead_id", "dry"),
    "reject_lead": ("lead_id", "reason", "suppress", "dry"),
    "remint_audit": ("lead_id_or_hash", "dry"),
    "dispatch_workflow": ("name", "dry"),
    "set_flag": ("name", "value", "confirm", "dry"),
    # D5.8 additional action tools
    "tag_lead_dnc": ("lead_id",),
    "neon_query": ("sql", "limit"),
    "get_lead": ("query",),
    "notion_update_cockpit": ("message",),
    # D5.9 heal tools (gap_scan takes no args, so it is intentionally absent)
    "failing_workflows": ("limit",),
    "diagnose_run": ("run_id", "max_lines"),
    "retry_workflow": ("workflow_file", "dry"),
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
        # Map each tool to the argument keys it accepts, and pass ONLY those through
        # by keyword (a tool that takes no args is called bare). This whitelists the
        # surface so a stray/extra argument from a client can never break the call,
        # and keeps the no-dependency, Python-3.9 style (no inspect/signature magic).
        accepted = _TOOL_ARGS.get(name, ())
        kwargs = {k: arguments[k] for k in accepted if k in arguments}
        # Unconditional **kwargs: a no-arg tool gets fn() (empty kwargs); a tool with
        # required args that the client omitted raises a clean TypeError, which the
        # outer except turns into a fail-soft "Tool error" result (never a crash).
        text = fn(**kwargs)
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
