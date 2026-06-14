#!/usr/bin/env node
'use strict';
// RECONCILE CAL.COM BOOKINGS · KV -> Neon.
// The cal.com booking webhook (website repo: functions/api/cal-webhook.js) only writes the booking to
// Cloudflare KV (binding FORM_SUBMISSIONS, key `bookings:cal:<uid>`). Nothing copies those into Neon, so
// `cal_bookings` sits empty (0) and scripts/reconcile.js step 3 can never flip a lead to lifecycle='booked'.
// This job closes that gap: it lists the KV booking records via the Cloudflare KV REST API and UPSERTs each
// into cal_bookings keyed on cal_event_id (the stable cal uid). Idempotent + fail-open. Run nightly, before
// reconcile.js (or let reconcile.js call it). British spelling, no destructive writes.
//
//   node scripts/reconcile-cal-bookings.js [--limit 1000] [--dry]
//
// Env (loaded from <root>/.env, same as the other engine scripts):
//   NEON_URL                 Neon connection string (read+additive write via scripts/psql)
//   CLOUDFLARE_API_TOKEN     token with KV read scope on the namespace below
//   CLOUDFLARE_ACCOUNT_ID    account that owns the KV namespace (the engine account; see ACCOUNT note)
//   CLOUDFLARE_KV_ACCOUNT_ID (optional) overrides CLOUDFLARE_ACCOUNT_ID for the KV call only
//   CAL_BOOKINGS_KV_NAMESPACE_ID (optional) overrides the namespace id below
//
// NOTE - ACCOUNT (verified 2026-06-13 via the live CF API, supersedes an earlier cross-account guess):
//   the live website wrangler.toml binds FORM_SUBMISSIONS to namespace id 11971a76eda74339936dd7738680d973,
//   and that namespace lives in the ENGINE account (78c79417..., == CLOUDFLARE_ACCOUNT_ID), NOT a separate
//   account. The engine's CLOUDFLARE_API_TOKEN_FULL already reads it (confirmed: it holds csp:/form keys;
//   the cal-webhook writes bookings under `bookings:cal:<uid>`). So NO CLOUDFLARE_KV_ACCOUNT_ID and no extra
//   token are needed - the default fallback to CLOUDFLARE_ACCOUNT_ID is correct. cal_bookings reads 0 today
//   only because no call has been booked yet (SEND is off); this job fills it once the first booking lands.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// Mirror the engine's .env loader (intel-pulse.js / health-check.js). Fall back to the shared env locations
// and finally process.env so this runs on the VM, in CI, or locally without edits.
const ENV = {};
const ENV_FILES = [
  path.join(ROOT, '.env'),
  '/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env',
  '/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os/.env',
];
for (const f of ENV_FILES) {
  try {
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && ENV[m[1]] === undefined) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_e) { /* file may not exist on this host; that's fine */ }
}
const env = (k) => (process.env[k] !== undefined ? process.env[k] : ENV[k]);

const NEON = env('NEON_URL') || env('NEON_CONNECTION_STRING');
// Prefer the FULL token (verified 2026-06-13 to have KV-read on this namespace); fall back to the plain one.
const CF_TOKEN = env('CLOUDFLARE_API_TOKEN_FULL') || env('CLOUDFLARE_API_TOKEN');
const CF_ACCOUNT = env('CLOUDFLARE_KV_ACCOUNT_ID') || env('CLOUDFLARE_ACCOUNT_ID');
// Verified 2026-06-13 vs live website wrangler.toml ([[kv_namespaces]] binding=FORM_SUBMISSIONS) AND the live CF
// API (the namespace lives in the engine account == CLOUDFLARE_ACCOUNT_ID). Overridable for safety.
const KV_NAMESPACE = env('CAL_BOOKINGS_KV_NAMESPACE_ID') || '11971a76eda74339936dd7738680d973';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const LIMIT = Math.max(1, parseInt(arg('limit', '1000'), 10));

function pg(sql) {
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (e) { console.error('  pg error (non-fatal):', String(e.message || e).slice(0, 160)); return null; }
}
const esc = (v) => (v == null || v === '') ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
// timestamptz literal or NULL; let Postgres parse the ISO 8601 string cal.com emits.
const tsLit = (v) => { const s = String(v || '').trim(); return s ? `'${s.replace(/'/g, "''")}'::timestamptz` : 'NULL'; };

const CF_API = 'https://api.cloudflare.com/client/v4';
function cfHeaders() { return { Authorization: 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json' }; }

// List every key under a prefix (cursor-paginated), then bulk-read each value. Mirrors the cockpit listKv().
async function listBookingRecords(prefix, cap) {
  const records = [];
  let cursor = '';
  do {
    const u = new URL(`${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NAMESPACE}/keys`);
    u.searchParams.set('prefix', prefix);
    u.searchParams.set('limit', '1000');
    if (cursor) u.searchParams.set('cursor', cursor);
    const r = await fetch(u, { headers: cfHeaders(), signal: AbortSignal.timeout(20000) }); // bound each KV page so the nightly job can't hang
    if (!r.ok) { throw new Error(`KV list HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); }
    const j = await r.json();
    if (!j.success) { throw new Error('KV list error: ' + JSON.stringify(j.errors || j).slice(0, 200)); }
    for (const k of (j.result || [])) {
      if (records.length >= cap) return records;
      const name = k.name;
      const vr = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NAMESPACE}/values/${encodeURIComponent(name)}`, { headers: cfHeaders(), signal: AbortSignal.timeout(15000) });
      if (!vr.ok) continue;                 // skip a single unreadable key, keep going
      const txt = await vr.text();
      let rec; try { rec = JSON.parse(txt); } catch (_e) { continue; }   // skip non-JSON / index keys
      records.push(rec);
    }
    cursor = (j.result_info && j.result_info.cursor) || '';
  } while (cursor && records.length < cap);
  return records;
}

// Map a KV booking record (shape from functions/api/cal-webhook.js) to a cal_bookings row.
function toRow(rec) {
  // cal_event_id is the UNIQUE upsert key. Prefer the stable cal uid, then bookingId, then iCalUID.
  const calEventId = rec.cal_uid || rec.cal_booking_id || rec.cal_ical_uid || '';
  if (!calEventId) return null;             // can't upsert without the conflict key
  return {
    cal_event_id: calEventId,
    event_type: rec.cal_event_type || '',
    attendee_name: rec.name || (rec.attendees && rec.attendees[0] && rec.attendees[0].name) || '',
    attendee_email: (rec.email || (rec.attendees && rec.attendees[0] && rec.attendees[0].email) || '').toLowerCase(),
    start_at: rec.cal_start_time || '',
    end_at: rec.cal_end_time || '',
    // Normalise the lifecycle status to the lower-case vocab reconcile.js already excludes on (cancelled/rejected).
    status: String(rec.cal_status || 'confirmed').toLowerCase(),
  };
}

(async () => {
  if (!NEON) { console.error('[cal-reconcile] no NEON_URL — abort'); process.exit(0); }
  if (!CF_TOKEN || !CF_ACCOUNT) {
    console.error('[cal-reconcile] missing CLOUDFLARE_API_TOKEN(_FULL) / account id — cannot read KV. ' +
      'Expected CLOUDFLARE_API_TOKEN_FULL + CLOUDFLARE_ACCOUNT_ID (engine account 78c79417...) in env. No-op.');
    process.exit(0);
  }

  let records;
  try { records = await listBookingRecords('bookings:', LIMIT); }
  catch (e) {
    // Fail-open: a KV/account/token problem must never crash the nightly cycle. Flag and exit 0.
    console.error('[cal-reconcile] KV read failed (non-fatal):', String(e.message || e).slice(0, 200));
    console.error('  Check the token KV scope (namespace 11971a76... lives in the engine account 78c79417... == CLOUDFLARE_ACCOUNT_ID).');
    process.exit(0);
  }

  const rows = records.map(toRow).filter(Boolean);
  console.log(`[cal-reconcile] KV bookings read: ${records.length} record(s), ${rows.length} with a cal id${DRY ? ' (DRY)' : ''}`);
  if (!rows.length) { console.log('[cal-reconcile] nothing to upsert.'); return; }
  if (DRY) {
    for (const r of rows.slice(0, 10)) console.log(`  would upsert ${r.cal_event_id} · ${r.attendee_email || '?'} · ${r.event_type || '?'} · ${r.status}`);
    return;
  }

  let upserted = 0, linked = 0;
  for (const r of rows) {
    // Best-effort lead linkage by attendee email (additive, FK-safe: the subquery yields NULL when no lead
    // matches, and lead_id is nullable). Never invents a lead.
    const leadIdExpr = r.attendee_email
      ? `(SELECT id FROM leads WHERE lower(email)=${esc(r.attendee_email)} OR lower(contact_email)=${esc(r.attendee_email)} ORDER BY id LIMIT 1)`
      : 'NULL';
    // Idempotent upsert on the UNIQUE cal_event_id. On conflict we refresh the mutable fields (status can move
    // CONFIRMED -> CANCELLED on a reschedule/cancel) but never clobber an already-resolved lead_id with NULL.
    const sql = `INSERT INTO cal_bookings (cal_event_id, event_type, lead_id, attendee_name, attendee_email, start_at, end_at, status, created_at)
      VALUES (${esc(r.cal_event_id)}, ${esc(r.event_type)}, ${leadIdExpr}, ${esc(r.attendee_name)}, ${esc(r.attendee_email)}, ${tsLit(r.start_at)}, ${tsLit(r.end_at)}, ${esc(r.status)}, NOW())
      ON CONFLICT (cal_event_id) DO UPDATE SET
        event_type    = COALESCE(NULLIF(EXCLUDED.event_type,''), cal_bookings.event_type),
        attendee_name = COALESCE(NULLIF(EXCLUDED.attendee_name,''), cal_bookings.attendee_name),
        attendee_email= COALESCE(NULLIF(EXCLUDED.attendee_email,''), cal_bookings.attendee_email),
        lead_id       = COALESCE(cal_bookings.lead_id, EXCLUDED.lead_id),
        start_at      = COALESCE(EXCLUDED.start_at, cal_bookings.start_at),
        end_at        = COALESCE(EXCLUDED.end_at, cal_bookings.end_at),
        status        = COALESCE(NULLIF(EXCLUDED.status,''), cal_bookings.status)
      RETURNING (lead_id IS NOT NULL) AS has_lead`;
    const out = pg(sql);
    if (out != null) { upserted++; if (/^t/i.test(out)) linked++; }
  }
  const total = pg(`SELECT COUNT(*) FROM cal_bookings`);
  console.log(`[cal-reconcile] upserted ${upserted}/${rows.length} bookings (${linked} linked to a lead) · cal_bookings total now ${total}`);
})().catch(e => { console.error('[cal-reconcile] error (non-fatal):', String(e.message || e).slice(0, 200)); process.exit(0); });
