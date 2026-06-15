#!/usr/bin/env node
// GLOBAL stale-run reaper (race-guard hardening). Run at the START of every engine cycle, BEFORE the
// activeWriter() race-guard check in run-engine-cycle.sh.
//
// WHY: the engine-cycle race guard (heartbeat.js activeWriter()) SKIPS the race-sensitive steps
// (qualify/enqueue/mint/render) whenever a heavy re-tier writer (v3-rerun / v3-validate / backlog-burst /
// nightly-workers) has an engine_runs row with status='running' within the writer TTL (ENGINE_WRITER_TTL_MIN,
// default 360m). heartbeat.js HAS a reaper, but it is PER-JOB and only fires on that SAME job's NEXT start. So
// if a heavy writer CRASHES (OOM, SIGKILL, runner death) and never restarts, its 'running' row is never closed
// and it blocks the cycle's seam for the full TTL (~12 cycles at 30-min cadence) — qualify/enqueue/mint/render
// are starved the whole time. That is the gap this closes.
//
// WHAT: force-close ANY engine_runs row that is still status='running' with no finished_at and a started_at
// older than the writer TTL, REGARDLESS of job — set status='stale', finished_at=now(). This guarantees a
// crashed writer can never wedge the cycle forever: once a 'running' row ages past the TTL it is reaped, so
// activeWriter() (which only counts 'running' rows within the TTL anyway) stops seeing it and the cycle resumes.
//
// SAFE BY DESIGN:
//  - Time-gated to the SAME TTL the guard uses (ENGINE_WRITER_TTL_MIN, default 360m): we only ever touch rows
//    already past the window where activeWriter() would consider them live, so we can NEVER close a writer the
//    guard still trusts. A genuinely long-running writer under the TTL is untouched.
//  - Only flips status running->stale + stamps finished_at. Never deletes, never touches `leads` or any other
//    table, never edits off-limits tables. Idempotent (a second run matches nothing).
//  - FAIL-OPEN: no NEON_URL or any DB error -> log + exit 0. The reaper must never block or fail the cycle.
//
// Usage: node scripts/reap-stale-runs.js   (exit 0 always)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// Load .env exactly like the sibling scripts (heartbeat.js / render-touches.js): file values do not clobber
// an already-exported env var, so a value injected by run-engine-cycle.sh (which sources .env) still wins.
(() => {
  try {
    const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
  } catch (_e) {}
})();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
// Match the guard's TTL so we only reap rows the guard already treats as past-window. Same default (360m).
const TTL_MIN = Number(process.env.ENGINE_WRITER_TTL_MIN || 360);

function pg(sql) {
  if (!NEON) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (_e) { return null; }
}

function main() {
  if (!NEON) { console.log('[reap-stale-runs] no NEON_URL — skipping (fail-open)'); return; }
  const ttl = Number.isFinite(TTL_MIN) && TTL_MIN > 0 ? TTL_MIN : 360;
  // Count first so the cycle log shows what was reaped (observability for the founder/Health tab).
  const n = pg(`SELECT count(*) FROM engine_runs
      WHERE status='running' AND finished_at IS NULL AND started_at < now() - interval '${ttl} minutes'`);
  const stale = Number(n) || 0;
  if (stale > 0) {
    pg(`UPDATE engine_runs SET status='stale', finished_at=now(),
          last_error=COALESCE(last_error,'reaped by global stale-reaper: running > ${ttl}m with no finish (crashed writer)')
        WHERE status='running' AND finished_at IS NULL AND started_at < now() - interval '${ttl} minutes'`);
    console.log(`[reap-stale-runs] force-closed ${stale} stale 'running' run(s) older than ${ttl}m -> status='stale'`);
  } else {
    console.log(`[reap-stale-runs] no stale runs (none 'running' older than ${ttl}m)`);
  }
}

try { main(); } catch (e) { console.error('[reap-stale-runs] fatal (fail-open):', e && e.message); }
process.exit(0);
