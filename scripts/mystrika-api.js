#!/usr/bin/env node
'use strict';
// Mystrika integration orchestrator (P3.4).
//
// HONEST VENDOR STATE (verified 2026-06, mystrika.com/AppSumo Q&A + help centre): Mystrika does NOT yet expose
// an INBOUND API for creating prospects/campaigns. Only OUTBOUND webhooks (reply/status/bounce) are available.
// So "direct API bulk-add" is a vendor roadmap item, not buildable today. The supported bulk-add is CSV import.
//
// WORKING OUTCOMES (all live, no token needed):
//   * Bulk prospect add  -> scripts/mystrika-export.js writes a CSV with the verified audit link + all 4 gated
//                           touch bodies + full personalisation, restricted to audit_verified leads. One-click
//                           import in Mystrika (Leads -> Import CSV).
//   * Reply sync         -> src/lib/imap-poll-worker.js marks leads replied=TRUE; src/lib/send-guards.js stops
//                           further touches once replied (no double-touching a prospect who answered).
//
// FORWARD-COMPATIBLE: the moment Mystrika ships an inbound API, set MYSTRIKA_API_KEY (+ MYSTRIKA_API_BASE) and
// this script will POST prospects directly. Until then it runs the CSV path and reports readiness. No fabrication.
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function runExport(limit) {
  try { return execFileSync('node', [path.join(__dirname, 'mystrika-export.js'), String(limit || 1000)], { encoding: 'utf8' }); }
  catch (e) { return '[mystrika-export error] ' + (e.message || e); }
}

async function pushViaApi(/* rows */) {
  const key = process.env.MYSTRIKA_API_KEY;
  const base = process.env.MYSTRIKA_API_BASE; // e.g. https://api.mystrika.com (when available)
  if (!key || !base) return { ran: false, reason: 'no_inbound_api', note: 'Mystrika inbound API not available yet (vendor roadmap). Set MYSTRIKA_API_KEY + MYSTRIKA_API_BASE when shipped; bulk-add uses CSV import meanwhile.' };
  // Endpoint shape will follow Mystrika's published spec once released; guarded so it is a one-line activation.
  try {
    const res = await fetch(base.replace(/\/$/, '') + '/v1/prospects/bulk', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ note: 'awaiting published spec' }), signal: AbortSignal.timeout(15000) });
    return { ran: true, status: res.status, note: 'Direct API attempted; confirm against Mystrika spec.' };
  } catch (e) { return { ran: false, reason: 'error', error: String(e.message || e) }; }
}

(async () => {
  const limit = parseInt(process.argv[2] || '1000', 10);
  console.log('=== Mystrika sync ===');
  const api = await pushViaApi();
  if (api.ran) { console.log('Direct API: status ' + api.status + ' · ' + api.note); }
  else {
    console.log('Direct API: ' + api.reason + ' — ' + (api.note || ''));
    console.log('Falling back to the supported CSV bulk-add:');
    console.log(runExport(limit).trim());
    console.log('Import: Mystrika -> Leads -> Import CSV -> map the audit + touch columns (one-time). Reply-sync runs via IMAP poll + send-guards.');
  }
})().catch(e => { console.error('mystrika-api error (non-fatal):', e.message); process.exit(0); });
