#!/usr/bin/env node
'use strict';
// VERIFY ATTRIBUTION · regression guard for the two attribution paths the tracking foundation
// depends on. It does NOT send and does NOT write — source is read statically, Neon is read-only.
//
// What it proves:
//   1. sends.lead_id   — BOTH send writers (push-to-mystrika.js, S065 send-due.js) write a `sends`
//                        row that carries lead_id (a NULL lead_id orphans per-source/per-sector
//                        reporting as "unknown"). The 184 legacy NULL rows are dead warmup and are
//                        left as-is; this guards the FORWARD path.
//   2. cal KV->Neon    — the reconcile reader (reconcile-cal-bookings.js toRow()) maps exactly the
//                        field names the website webhook writes into KV, and is wired into the
//                        nightly reconcile.js BEFORE the lifecycle='booked' step.
//   3. Neon invariants — cal_bookings.cal_event_id is UNIQUE (so the webhook + reconcile upserts
//                        succeed past the first booking) and sends.lead_id exists.
//
// Live numbers printed for the operator: cal_bookings count, sends lead_id NULL vs set.
//
// Run:  set -a && . COWORK-OS-EXECUTION/.env && set +a && node scripts/verify-attribution.js
// Exit: 0 when every static check passes (live checks are advisory — they no-op without NEON_URL
//       so this stays CI-safe), 1 if a static wiring check regresses.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let failed = 0;
const ok = (m) => console.log('  PASS · ' + m);
const bad = (m) => { console.log('  FAIL · ' + m); failed++; };
const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (_e) { return ''; } };

// ---- 1. sends.lead_id on both send writers --------------------------------------------------
console.log('[1] sends.lead_id — forward attribution on both send writers');
for (const rel of ['scripts/push-to-mystrika.js', 'src/skills/S065-touch-scheduler/scripts/send-due.js']) {
  const src = read(rel);
  if (!src) { bad(rel + ' — not found'); continue; }
  // The INSERT must list lead_id as the first column of the `sends` insert.
  const m = src.match(/INSERT\s+INTO\s+sends\s*\(\s*lead_id\b/i);
  if (m) ok(rel + ' — INSERT INTO sends (lead_id, …)');
  else bad(rel + ' — sends INSERT does not lead with lead_id');
  // And it must guard a non-integer id rather than orphan the row.
  if (/Number\.isInteger\(\s*leadIdNum\s*\)/.test(src)) ok(rel + ' — integer lead-id guard present');
  else bad(rel + ' — missing integer lead-id guard (could orphan reporting)');
  // And it must stamp a message_id (reply-matching anchor).
  if (/\bmessage_id\b/.test(src)) ok(rel + ' — message_id stamped');
  else bad(rel + ' — no message_id on the sends row');
}

// ---- 2. cal KV->Neon reconcile contract -----------------------------------------------------
console.log('[2] cal_bookings KV->Neon reconcile — reader matches the webhook KV contract');
const recon = read('scripts/reconcile-cal-bookings.js');
if (!recon) { bad('scripts/reconcile-cal-bookings.js — not found'); }
else {
  // The webhook (website functions/api/cal-webhook.js) writes these KV field names. The reconcile
  // reader's toRow() must read the SAME names or every booking is silently dropped.
  const required = ['cal_uid', 'cal_booking_id', 'cal_ical_uid', 'cal_event_type', 'cal_start_time', 'cal_end_time', 'cal_status'];
  const missing = required.filter(f => !new RegExp('rec\\.' + f + '\\b').test(recon));
  if (!missing.length) ok('toRow() reads every webhook KV field (' + required.join(', ') + ')');
  else bad('toRow() does not read: ' + missing.join(', ') + ' — bookings would be dropped');
  if (/ON CONFLICT \(cal_event_id\)/.test(recon)) ok('upsert keyed on UNIQUE cal_event_id (idempotent)');
  else bad('reconcile upsert is not keyed on cal_event_id');
  if (/COALESCE\(cal_bookings\.lead_id, EXCLUDED\.lead_id\)/.test(recon)) ok('never clobbers a resolved lead_id with NULL on re-run');
  else bad('reconcile may overwrite an existing lead_id with NULL');
}
const reconMain = read('scripts/reconcile.js');
if (/reconcile-cal-bookings\.js/.test(reconMain)) ok('reconcile.js invokes the cal KV->Neon job nightly');
else bad('reconcile.js does NOT invoke reconcile-cal-bookings.js — cal_bookings can never fill');

// ---- 3. Live Neon invariants (advisory; no-op without NEON_URL) ------------------------------
(async () => {
  const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
  if (!NEON) {
    console.log('[3] Neon invariants — skipped (no NEON_URL bound; static checks above are authoritative)');
  } else {
    console.log('[3] Neon invariants (read-only)');
    const host = (() => { try { return new URL(NEON).host; } catch (_e) { return NEON.replace(/.*@([^/]+)\/.*/, '$1'); } })();
    const q = async (query) => {
      try {
        const r = await fetch('https://' + host + '/sql', {
          method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, params: [] }), signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) return null;
        const d = await r.json(); return d.rows || d.results || [];
      } catch (_e) { return null; }
    };
    const uniq = await q("SELECT 1 FROM pg_constraint WHERE conrelid='cal_bookings'::regclass AND contype='u' AND pg_get_constraintdef(oid) ILIKE '%cal_event_id%'");
    if (uniq && uniq.length) ok('cal_bookings.cal_event_id is UNIQUE (upserts survive >1 booking)');
    else if (uniq) bad('cal_bookings.cal_event_id is NOT unique — 2nd booking upsert would fail');
    else console.log('  (advisory) could not read cal_bookings constraints');

    const col = await q("SELECT 1 FROM information_schema.columns WHERE table_name='sends' AND column_name='lead_id'");
    if (col && col.length) ok('sends.lead_id column exists');
    else if (col) bad('sends.lead_id column missing');
    else console.log('  (advisory) could not read sends columns');

    const cb = await q('SELECT COUNT(*)::int AS n FROM cal_bookings');
    const sd = await q('SELECT COUNT(*)::int AS total, COUNT(lead_id)::int AS with_lead FROM sends');
    if (cb) console.log('  INFO · cal_bookings rows: ' + (cb[0] && cb[0].n));
    if (sd) console.log('  INFO · sends: total=' + (sd[0] && sd[0].total) + ' with_lead_id=' + (sd[0] && sd[0].with_lead) + ' (legacy NULLs are dead warmup, left as-is)');
  }

  console.log('');
  if (failed) { console.log('ATTRIBUTION VERIFY: ' + failed + ' static check(s) FAILED.'); process.exit(1); }
  console.log('ATTRIBUTION VERIFY: all static wiring checks PASS.');
  process.exit(0);
})();
