#!/usr/bin/env node
// pre-send-checklist.js — GAP-LEDGER #89: assert all 4 send unblocks before SEND_ENABLED is flipped.
// Read-only diagnostic — no DB writes, no sends, no state changes. Exits 0 = all clear, exits 1 = blocked.
//
//   node scripts/pre-send-checklist.js          # full check + human-readable output
//   node scripts/pre-send-checklist.js --json   # machine-readable JSON
//
// THE 4 SEND UNBLOCKS (every PASS required before flipping SEND_ENABLED=1):
//   1. CLAUDE_CODE_OAUTH_TOKEN present in ENV (unblocks Layer-3 automated clearing, 600/day)
//   2. 3 legal footer vars present + non-dummy in ENV: TAMAZIA_REG_ADDRESS + TAMAZIA_COMPANY_NUMBER
//      + TAMAZIA_ICO_NUMBER (Art-14 PECR + UK DMCCA 2024 identity disclosure; dummy 00000000 blocks)
//   3. Mystrika: at least 1 per-sector campaign has ≥1 email sequence (5-touch) defined.
//      (POST /campaign/save 422 means sequences missing; must exist or Mystrika rejects the send)
//   4. Mystrika: daily_campaign_sending_limit ≥ 50 on active campaigns (safe minimum for ramp).
//      Target: 150; floor check: 50 (below floor = still warming up, sends will be trivially low).
//
// ALSO REPORTS (non-blocking informational checks):
//   A. SEND_ENABLED current value
//   B. Neon: leads with claude_cleared=TRUE (ready for the final relay gate)
//   C. Neon: Mystrika sequences_sent (warmup progress)
//   D. CQC/FCA keys present (unblocks healthcare/finance DM lanes)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// Load .env without overriding real env
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const JSON_MODE = process.argv.includes('--json');
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');

function pg(sql) {
  if (!NEON) return null;
  try { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).toString().trim(); }
  catch (_e) { return null; }
}

function isDummy(val) {
  if (!val) return true;
  const v = String(val).trim();
  return v === '' || /^0+$/.test(v) || v.startsWith('DUMMY') || v.startsWith('{{') || v.toUpperCase() === 'PLACEHOLDER';
}

const checks = {};
const info = {};

// ── BLOCKER 1: CLAUDE_CODE_OAUTH_TOKEN ───────────────────────────────────────
const hasOAuth = !!(process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN.length > 8);
checks['B1_claude_oauth'] = {
  name: 'CLAUDE_CODE_OAUTH_TOKEN present',
  pass: hasOAuth,
  detail: hasOAuth ? 'Token present (masked)' : 'MISSING — Layer-3 clearance degrades to pull-and-log only; no automated clearing',
  action: hasOAuth ? null : 'Add CLAUDE_CODE_OAUTH_TOKEN to GitHub repo secrets (generate with: claude setup-token on a Claude subscription)',
};

// ── BLOCKER 2: Legal footer env vars ─────────────────────────────────────────
const addr = process.env.TAMAZIA_REG_ADDRESS || '';
const co = process.env.TAMAZIA_COMPANY_NUMBER || '';
const ico = process.env.TAMAZIA_ICO_NUMBER || '';
const addrOk = addr && !isDummy(addr);
const coOk = co && !isDummy(co);
const icoOk = ico && !isDummy(ico);
const footerAllOk = addrOk && coOk && icoOk;
checks['B2_footer_env'] = {
  name: '3 legal footer vars (Art-14 PECR / UK DMCCA 2024)',
  pass: footerAllOk,
  detail: [
    `TAMAZIA_REG_ADDRESS: ${addrOk ? 'PRESENT' : 'MISSING/DUMMY'}`,
    `TAMAZIA_COMPANY_NUMBER: ${coOk ? 'PRESENT' : 'MISSING/DUMMY'}`,
    `TAMAZIA_ICO_NUMBER: ${icoOk ? 'PRESENT' : 'MISSING/DUMMY'}`,
  ].join(' | '),
  action: footerAllOk ? null : 'Set real ICO + company# + registered address in ENV_B64 (Q30 founder action). This is THE ONLY SEND BLOCKER.',
};

// ── BLOCKER 3+4: Mystrika API (sequence exists + limit ≥ 50) ─────────────────
// We read from Neon's mystrika_campaigns snapshot (sync'd every 6h by mystrika-sync.yml) rather
// than hitting the Mystrika API directly so this script stays read-only and requires no live creds.
let mystrika3Pass = false, mystrika4Pass = false;
let mDetailSeq = 'Neon mystrika_campaigns table unreadable', mDetailLimit = '';
try {
  const totalCampaigns = pg(`SELECT COUNT(*) FROM mystrika_campaigns`);
  const withSequence = pg(`SELECT COUNT(*) FROM mystrika_campaigns WHERE status IN ('active','draft') AND (sequences_count > 0 OR (settings::text LIKE '%step%' AND settings::text NOT LIKE '%"steps":[]%'))`);
  const belowFloor = pg(`SELECT COUNT(*) FROM mystrika_campaigns WHERE status='active' AND COALESCE((settings->>'daily_limit')::int,0) < 50`);
  const minLimit = pg(`SELECT MIN((settings->>'daily_limit')::int) FROM mystrika_campaigns WHERE status='active' AND settings->>'daily_limit' IS NOT NULL`);
  const n = Number(totalCampaigns) || 0;
  const s = Number(withSequence) || 0;
  const b = Number(belowFloor);
  const ml = Number(minLimit) || 0;
  mystrika3Pass = n > 0 && s > 0;
  mystrika4Pass = n > 0 && b === 0;
  mDetailSeq = `Total campaigns: ${n}; with ≥1 sequence: ${s}`;
  mDetailLimit = `Active campaigns below 50 daily limit: ${b}; min limit: ${ml}`;
} catch (_e) {
  mDetailSeq = `Could not read mystrika_campaigns: ${_e.message}`;
}

checks['B3_mystrika_sequences'] = {
  name: 'Mystrika campaigns have email sequences',
  pass: mystrika3Pass,
  detail: mDetailSeq,
  action: mystrika3Pass ? null : 'Q31: For each campaign Edit Campaign → Settings → Step 3 → add 5-touch sequence. POST /campaign/save 422 = missing sequence.',
};
checks['B4_mystrika_limit'] = {
  name: 'Mystrika daily sending limit ≥ 50 on active campaigns',
  pass: mystrika4Pass,
  detail: mDetailLimit,
  action: mystrika4Pass ? null : 'Q31: Edit Campaign → Settings → Daily Campaign Sending Limit → 150. Target: 150; floor: 50.',
};

// ── INFORMATIONAL ─────────────────────────────────────────────────────────────
info['send_enabled'] = `SEND_ENABLED=${process.env.SEND_ENABLED || '(not set)'} — ${/^(1|true|yes|on)$/i.test(process.env.SEND_ENABLED || '') ? 'LIVE (sends will go)' : 'OFF (safe)'}`;
const cleared = pg(`SELECT COUNT(*) FROM leads WHERE claude_cleared=TRUE`);
info['claude_cleared'] = `Leads with claude_cleared=TRUE: ${cleared || 0}`;
const tier1Ready = pg(`SELECT COUNT(*) FROM leads WHERE icp_tier=1 AND COALESCE(audit_url,'')<>'' AND COALESCE(audit_verified,FALSE)=TRUE AND claude_cleared=TRUE`);
info['tier1_send_ready'] = `Tier-1 send-ready (cleared + audit verified): ${tier1Ready || 0}`;
const govReleased = pg(`SELECT COUNT(*) FROM leads WHERE governor_released=TRUE`);
info['governor_released'] = `Governor-released leads: ${govReleased || 0}`;
info['cqc_key'] = `CQC_PARTNER_CODE: ${process.env.CQC_PARTNER_CODE ? 'PRESENT' : 'MISSING (Q32 — unblocks healthcare CQC lane)'}`;
info['fca_key'] = `FCA_API_KEY: ${process.env.FCA_API_KEY ? 'PRESENT' : 'MISSING (Q32 — unblocks finance FCA lane)'}`;

// ── OUTPUT ────────────────────────────────────────────────────────────────────
const allPass = Object.values(checks).every(c => c.pass);

if (JSON_MODE) {
  console.log(JSON.stringify({ all_clear: allPass, checks, info }, null, 2));
} else {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║      TAMAZIA PRE-SEND CHECKLIST (read-only)          ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  for (const [key, c] of Object.entries(checks)) {
    const icon = c.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon}  [${key}] ${c.name}`);
    console.log(`       ${c.detail}`);
    if (!c.pass && c.action) console.log(`       ACTION: ${c.action}`);
    console.log('');
  }
  console.log('── INFORMATIONAL ──────────────────────────────────────');
  for (const v of Object.values(info)) console.log(`   ${v}`);
  console.log('');
  if (allPass) {
    console.log('🟢  ALL BLOCKERS CLEAR — ready to flip SEND_ENABLED=1 in ENV_B64');
  } else {
    const blocked = Object.values(checks).filter(c => !c.pass).length;
    console.log(`🔴  ${blocked} BLOCKER(S) REMAINING — do NOT flip SEND_ENABLED until all PASS`);
  }
  console.log('');
}

process.exit(allPass ? 0 : 1);
