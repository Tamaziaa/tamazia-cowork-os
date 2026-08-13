#!/usr/bin/env node
// ============================================================================
// SETUP LOOKALIKE CATCH-ALL · reply capture for the 6 cold lookalike domains
// ----------------------------------------------------------------------------
// Replaces ~24 manual Cloudflare clicks. For each lookalike domain it:
//   1. Finds the Cloudflare zone (reports clearly if the domain isn't on Cloudflare yet).
//   2. Enables Email Routing (adds the required MX/TXT automatically when DNS is on Cloudflare).
//   3. Ensures the forward destination (amangotselected@gmail.com) exists at the account level.
//   4. Sets the CATCH-ALL rule → forward everything to that Gmail.
// Idempotent + self-reporting: safe to re-run; prints per-domain status.
//
// The existing Gmail poller (scripts/zoho-imap-poll.js, GMAIL_IMAP_USER) then reads that inbox and
// the S012/S013 classifier handles every forwarded reply — no further engine wiring needed.
//
// ONE manual step remains: Cloudflare emails amangotselected@gmail.com a one-time destination
// verification link (account-level, so it's a SINGLE click that covers all 6 domains). Click it once.
//
// USAGE: node scripts/setup-lookalike-catchall.js
//   env: CLOUDFLARE_API_TOKEN_EMAIL (or _DNS / CLOUDFLARE_API_TOKEN), CLOUDFLARE_ACCOUNT_ID
//        LOOKALIKE_DOMAINS (comma list, optional), REPLY_FORWARD_TO (optional)
// ============================================================================

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}

const TOKEN = process.env.CLOUDFLARE_API_TOKEN_EMAIL || process.env.CLOUDFLARE_API_TOKEN_DNS || process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const FORWARD_TO = process.env.REPLY_FORWARD_TO || process.env.GMAIL_IMAP_USER || process.env.PRIMARY_GMAIL || 'amangotselected@gmail.com';
// REAL delivered MailDeck domains (verified in-app 2026-05-23). NB: tamaziatop100.com + tamaziaworld.uk
// replaced the earlier-assumed tamaziagroup.* pair.
const DOMAINS = (process.env.LOOKALIKE_DOMAINS || 'tamazia.uk,tamazia.store,tamazia.info,tamazia.online,tamaziatop100.com,tamaziaworld.uk')
  .split(',').map(s => s.trim()).filter(Boolean);

const API = 'https://api.cloudflare.com/client/v4';
async function cf(method, p, body) {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (_e) {}
  return { ok: r.ok && j.success !== false, status: r.status, j };
}

async function zoneId(domain) {
  const r = await cf('GET', `/zones?name=${encodeURIComponent(domain)}`);
  return r.ok && r.j.result && r.j.result[0] ? r.j.result[0].id : null;
}
async function ensureDestination() {
  if (!ACCOUNT_ID) return { ok: false, note: 'no CLOUDFLARE_ACCOUNT_ID — add the destination manually once' };
  // list existing
  const list = await cf('GET', `/accounts/${ACCOUNT_ID}/email/routing/addresses?per_page=50`);
  const exists = list.ok && (list.j.result || []).some(a => (a.email || '').toLowerCase() === FORWARD_TO.toLowerCase());
  if (exists) {
    const rec = (list.j.result || []).find(a => (a.email || '').toLowerCase() === FORWARD_TO.toLowerCase());
    return { ok: true, verified: !!(rec && rec.verified), note: rec && rec.verified ? 'destination verified' : 'destination exists, NOT yet verified (click the Cloudflare email once)' };
  }
  const add = await cf('POST', `/accounts/${ACCOUNT_ID}/email/routing/addresses`, { email: FORWARD_TO });
  return { ok: add.ok, verified: false, note: add.ok ? 'destination created — Cloudflare just emailed a one-time verification link to ' + FORWARD_TO : 'failed to create destination: ' + JSON.stringify(add.j.errors || add.status) };
}
async function enableRouting(zid) {
  const st = await cf('GET', `/zones/${zid}/email/routing`);
  if (st.ok && st.j.result && st.j.result.enabled) return { ok: true, already: true };
  const en = await cf('POST', `/zones/${zid}/email/routing/enable`, {});
  return { ok: en.ok, already: false, err: en.ok ? null : (en.j.errors || en.status) };
}
async function setCatchAll(zid) {
  const r = await cf('PUT', `/zones/${zid}/email/routing/rules/catch_all`, {
    name: 'Tamazia catch-all → unified Gmail', enabled: true,
    matchers: [{ type: 'all' }],
    actions: [{ type: 'forward', value: [FORWARD_TO] }],
  });
  return { ok: r.ok, err: r.ok ? null : (r.j.errors || r.status) };
}

(async () => {
  if (!TOKEN) { console.error('No Cloudflare token (CLOUDFLARE_API_TOKEN_EMAIL). Aborting.'); process.exit(1); }
  console.log(`Reply-capture setup · forward target: ${FORWARD_TO}\n`);
  const dest = await ensureDestination();
  console.log(`Destination: ${dest.note}\n`);

  const results = [];
  for (const d of DOMAINS) {
    const zid = await zoneId(d);
    if (!zid) { console.log(`✗ ${d.padEnd(22)} NOT on Cloudflare — point its nameservers to Cloudflare first, then re-run.`); results.push({ d, status: 'not_on_cloudflare' }); continue; }
    const er = await enableRouting(zid);
    if (!er.ok) { console.log(`⚠ ${d.padEnd(22)} zone found but Email Routing enable failed: ${JSON.stringify(er.err)}`); results.push({ d, status: 'enable_failed' }); continue; }
    const ca = await setCatchAll(zid);
    if (!ca.ok) { console.log(`⚠ ${d.padEnd(22)} routing on, but catch-all rule failed: ${JSON.stringify(ca.err)}`); results.push({ d, status: 'rule_failed' }); continue; }
    console.log(`✓ ${d.padEnd(22)} catch-all → ${FORWARD_TO}${er.already ? ' (routing already on)' : ' (routing enabled)'}`);
    results.push({ d, status: 'ok' });
  }
  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\nDone: ${ok}/${DOMAINS.length} lookalikes capturing replies.`);
  if (!dest.verified) console.log('⚠ Click the one-time Cloudflare verification email in ' + FORWARD_TO + ' (covers all domains). Forwarding is inactive until verified.');
  const notCf = results.filter(r => r.status === 'not_on_cloudflare').map(r => r.d);
  if (notCf.length) console.log('→ Point these domains\' nameservers to Cloudflare, then re-run: ' + notCf.join(', '));
})();
