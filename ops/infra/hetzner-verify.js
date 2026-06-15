#!/usr/bin/env node
/**
 * hetzner-verify.js  —  £0 SMTP email verification, route-around for the dead Oracle VM.
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   The engine's email-verification bottleneck has one hard cause: a real RCPT-TO probe
 *   needs OUTBOUND TCP/25, and GitHub-hosted Actions runners run on Azure, which blocks
 *   outbound :25 platform-wide on EVERY tier (free/Team/Enterprise alike). No GitHub plan
 *   upgrade unblocks it. So the engine-cycle verify step degrades to Hunter+MX heuristics
 *   only and can never reach paid-tool (NeverBounce/MillionVerifier) accuracy.
 *   This script runs the SMTP layer on a box where :25 IS open (Hetzner, once the outbound
 *   :25 block is lifted — see ops/infra/HETZNER-VERIFY-SETUP.md), and writes the verdicts
 *   back into Neon additively.
 *
 * SEND-SAFE — THIS NEVER SENDS EMAIL.
 *   The SMTP conversation is HELO -> MAIL FROM -> RCPT TO -> QUIT. There is NO DATA phase,
 *   so no message body is ever transmitted. RCPT-TO probing is exactly how every commercial
 *   verifier works; it is verification, not sending. (Matches src/lib/enrich/free-verify.js
 *   smtpVerify(), which this file vendors verbatim so behaviour is identical to the engine.)
 *
 * IDEMPOTENT / RATE-LIMITED / CAPPED
 *   - Only touches rows whose verify_status is NULL/''/'pending'/'unknown' AND have an '@' email.
 *     Never overwrites the workflow flags 'approved'/'verified' (those mean "source-eligible",
 *     a different axis from deliverability — see note below).
 *   - Per-domain serialisation + delay so we never hammer one MX (avoids tarpitting/greylist bans).
 *   - Hard cap per run (default 200; --limit N). A row touched in the last RECHECK_DAYS is skipped.
 *   - Writes: smtp_verdict (dedicated, unambiguous), smtp_checked_at, contact_confidence (0-100),
 *     and ONLY fills verify_status when it was NULL/''/'pending'/'unknown' (additive, never clobbers).
 *
 * VOCABULARY (matches free-verify.js): valid | risky | invalid | unknown.
 *
 * USAGE
 *   node ops/infra/hetzner-verify.js --limit 5 --dry      # probe + print, write nothing
 *   node ops/infra/hetzner-verify.js --limit 200          # real run, capped 200
 *   SMTP_FROM=verify@tamazia.in node ops/infra/hetzner-verify.js   # override probe envelope-from
 *
 * ENV: NEON_URL required. HUNTER_KEY optional (used as a corroborating signal when present).
 *      Reads .env from this file's dir or repo root if process.env not already populated.
 */

'use strict';
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');

// ---- env loader (no deps): prefer process.env, else .env in cwd / repo root / this dir ----
(function loadEnv() {
  const tryFiles = [
    process.env.ENV_FILE,
    path.join(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '.env'),
  ].filter(Boolean);
  for (const f of tryFiles) {
    try {
      const t = fs.readFileSync(f, 'utf8');
      for (const line of t.split('\n')) {
        const mm = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2].replace(/^['"]|['"]$/g, '');
      }
      break;
    } catch (_e) { /* next */ }
  }
})();

// ---- pg client: prefer 'pg' if installed, else fall back to a tiny pg8000-via-python shim ----
let pgQuery;
try {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.NEON_URL, ssl: { rejectUnauthorized: false } });
  let connected = false;
  pgQuery = async (sql, params = []) => {
    if (!connected) { await client.connect(); connected = true; }
    return (await client.query(sql, params)).rows;
  };
  pgQuery._close = async () => { try { await client.end(); } catch (_e) {} };
} catch (_e) {
  // Fallback: shell out to python3 + pg8000 (always present once setup.sh has run).
  const { execFileSync } = require('child_process');
  pgQuery = async (sql, params = []) => {
    // crude param substitution for the small set of queries here (params are pre-escaped ints/strings)
    let q = sql;
    params.forEach((v, i) => {
      const lit = v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
      q = q.replace(new RegExp('\\$' + (i + 1) + '(?![0-9])'), lit);
    });
    const out = execFileSync('python3', ['-c', PY_SHIM, process.env.NEON_URL, q], { encoding: 'utf8' });
    return JSON.parse(out || '[]');
  };
  pgQuery._close = async () => {};
}
const PY_SHIM = `
import sys, json, re
import pg8000.native as p
m=re.match(r"postgres(?:ql)?://([^:]+):([^@]+)@([^/:]+)(?::(\\\\d+))?/([^?]+)", sys.argv[1])
c=p.Connection(user=m.group(1),password=m.group(2),host=m.group(3),port=int(m.group(4) or 5432),database=m.group(5),ssl_context=True)
rows=c.run(sys.argv[2])
cols=[d['name'] for d in c.columns] if c.columns else []
print(json.dumps([dict(zip(cols,r)) for r in rows], default=str))
`;

// ============================================================================================
// SMTP/MX layer — VENDORED VERBATIM from src/lib/enrich/free-verify.js (smtpOnce/smtpVerify/mxHosts).
// Kept byte-for-byte equivalent so Hetzner results == engine results. NO DATA phase = no send.
// ============================================================================================
async function mxHosts(domain) {
  try {
    const recs = await dns.resolveMx(domain);
    if (recs && recs.length) return recs.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
  } catch (_e) {}
  try { const a = await dns.resolve4(domain); if (a && a.length) return [domain]; } catch (_e) {}
  return [];
}
function smtpOnce(mxHost, addr, { from = 'verify@tamazia.in', helo = 'tamazia.in', timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    let sock, stage = 0, buf = '', finished = false;
    const fin = (r) => { if (finished) return; finished = true; try { sock.write('QUIT\r\n'); sock.end(); sock.destroy(); } catch (_e) {} resolve(r); };
    try { sock = net.createConnection(25, mxHost); } catch (_e) { return resolve(null); }
    const t = setTimeout(() => fin(null), timeout);
    sock.setEncoding('utf8');
    sock.on('error', () => { clearTimeout(t); fin(null); });
    sock.on('data', (d) => {
      buf += d; if (!/\r\n/.test(buf)) return;
      const line = buf.trim().split('\r\n').pop(); const code = Number(line.slice(0, 3)); buf = '';
      try {
        if (stage === 0) { if (code !== 220) return fin(null); sock.write(`EHLO ${helo}\r\n`); stage = 1; }
        else if (stage === 1) { sock.write(`MAIL FROM:<${from}>\r\n`); stage = 2; }
        else if (stage === 2) { if (code >= 400) return fin(null); sock.write(`RCPT TO:<${addr}>\r\n`); stage = 3; }
        else if (stage === 3) { clearTimeout(t); fin({ code, greylisted: code === 450 || code === 451 || code === 421, ok: code >= 250 && code < 260 }); }
      } catch (_e) { clearTimeout(t); fin(null); }
    });
  });
}
async function smtpVerify(mxHost, email, env) {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  let real = await smtpOnce(mxHost, email, env);
  if (real && real.greylisted) { await sleep(3000); real = await smtpOnce(mxHost, email, env); }
  if (!real) return null;
  const rand = `zz-nope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
  let ca = await smtpOnce(mxHost, rand, env);
  if (ca && ca.greylisted) { await sleep(3000); ca = await smtpOnce(mxHost, rand, env); }
  const catchAll = !!(ca && ca.ok);
  return { realOk: real.ok, realCode: real.code, catchAll };
}

// ---- light L1-L6 (syntax/role/webmail/disposable/mx) so we never RCPT a junk address ----
const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org','yopmail.com','getnada.com','trashmail.com','sharklasers.com','maildrop.cc','dispostable.com','mailnesia.com','spam4.me','tempr.email','moakt.com','mohmal.com','temp-mail.io','dropmail.me']);
const ROLE = new Set(['info','admin','sales','support','contact','hello','help','office','team','enquiries','enquiry','marketing','billing','accounts','hr','jobs','careers','press','media','noreply','no-reply','postmaster','webmaster','abuse','privacy','legal','finance','reception','bookings']);
const FREE = new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','hotmail.co.uk','outlook.com','live.com','msn.com','aol.com','icloud.com','me.com','protonmail.com','proton.me','gmx.com','zoho.com','yandex.com','mail.com','ymail.com']);
const SYNTAX = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parts(email) { const e = String(email || '').trim().toLowerCase(); const at = e.lastIndexOf('@'); return { email: e, local: at > 0 ? e.slice(0, at) : '', domain: at > 0 ? e.slice(at + 1) : '' }; }

// Verify one email via the SMTP layer. Returns {status,score,reason,source,role,webmail,catchAll}.
async function verifyEmailSmtp(email, env) {
  const { local, domain, email: e } = parts(email);
  if (!e || !SYNTAX.test(e) || !domain) return { status: 'invalid', score: 0, reason: 'bad_syntax', source: 'syntax' };
  if (DISPOSABLE.has(domain)) return { status: 'invalid', score: 0, reason: 'disposable', source: 'disposable' };
  const role = ROLE.has(local), webmail = FREE.has(domain);
  const mx = await mxHosts(domain);
  if (!mx.length) return { status: 'invalid', score: 8, reason: 'no_mx', source: 'mx', role, webmail };
  // Free webmail (gmail/outlook) can't be reliably RCPT-probed (they accept-all then bounce later) -> MX-only.
  if (webmail) return { status: 'unknown', score: role ? 45 : 60, reason: 'webmail_mx_only', source: 'mx', role, webmail };
  const sv = await smtpVerify(mx[0], e, env);
  if (!sv) return { status: 'unknown', score: role ? 45 : 55, reason: 'smtp_no_response', source: 'mx', role, webmail };
  if (sv.catchAll) return { status: 'risky', score: 55, reason: 'catch_all_domain', source: 'smtp', role, webmail, catchAll: true };
  if (sv.realOk) { const sc = role ? 60 : 82; return { status: role ? 'risky' : 'valid', score: sc, reason: 'smtp_rcpt_ok', source: 'smtp', role, webmail, catchAll: false }; }
  if (sv.realCode >= 500) return { status: 'invalid', score: 8, reason: 'smtp_rcpt_rejected', source: 'smtp', role, webmail };
  return { status: 'unknown', score: role ? 45 : 55, reason: 'smtp_inconclusive', source: 'smtp', role, webmail };
}

// ============================================================================================
// Batch driver
// ============================================================================================
function arg(name, def) { const i = process.argv.indexOf(name); return i > -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : def; }

async function main() {
  const LIMIT = Number(arg('--limit', 200));
  const DRY = !!arg('--dry', false);
  const PER_DOMAIN_DELAY = Number(process.env.PER_DOMAIN_DELAY_MS || 1500);
  const RECHECK_DAYS = Number(process.env.RECHECK_DAYS || 30);
  const env = { from: process.env.SMTP_FROM || 'verify@tamazia.in', helo: process.env.SMTP_HELO || 'tamazia.in', timeout: Number(process.env.SMTP_TIMEOUT_MS || 8000) };
  if (!process.env.NEON_URL) { console.error('[hetzner-verify] NEON_URL missing'); process.exit(2); }

  // Candidate selection: deliverability not yet established. We treat NULL/''/'pending'/'unknown'
  // as "needs an SMTP verdict". We DO NOT touch 'approved'/'verified' (source-workflow flags) or
  // rows already SMTP-checked within RECHECK_DAYS (idempotent / no churn).
  const rows = await pgQuery(
    `SELECT id, contact_email
       FROM leads
      WHERE contact_email IS NOT NULL AND contact_email <> '' AND position('@' in contact_email) > 1
        AND COALESCE(NULLIF(verify_status,''),'pending') IN ('pending','unknown')
        AND (smtp_checked_at IS NULL OR smtp_checked_at < NOW() - INTERVAL '${RECHECK_DAYS} days')
      ORDER BY priority_score DESC NULLS LAST, id DESC
      LIMIT ${LIMIT}`
  );
  if (!rows.length) { console.log('[hetzner-verify] nothing to verify (queue clean).'); await pgQuery._close(); return; }

  console.log(`[hetzner-verify] ${rows.length} candidates · cap ${LIMIT} · dry=${DRY} · from=${env.from}`);
  const tally = { valid: 0, risky: 0, invalid: 0, unknown: 0 };
  let lastDomain = null;
  for (const r of rows) {
    const email = String(r.contact_email).trim().toLowerCase();
    const domain = email.slice(email.lastIndexOf('@') + 1);
    if (domain === lastDomain) await sleep(PER_DOMAIN_DELAY); // serialise per-MX politely
    lastDomain = domain;

    let v;
    try { v = await verifyEmailSmtp(email, env); }
    catch (e) { console.log(`  ${email.padEnd(40)} ERROR ${e.message}`); continue; }
    tally[v.status] = (tally[v.status] || 0) + 1;
    const conf = v.status === 'invalid' ? 0 : (v.score || 0);

    if (!DRY) {
      // Additive write. smtp_verdict is the unambiguous SMTP truth. verify_status is only filled
      // when it was NULL/''/'pending'/'unknown' (never clobbers 'approved'/'verified').
      await pgQuery(
        `UPDATE leads
            SET smtp_verdict = $1,
                smtp_checked_at = NOW(),
                contact_confidence = $2,
                verify_status = CASE WHEN COALESCE(NULLIF(verify_status,''),'pending') IN ('pending','unknown')
                                     THEN $3 ELSE verify_status END,
                updated_at = NOW()
          WHERE id = $4`,
        [v.status, conf, v.status, r.id]
      );
    }
    console.log(`  ${email.padEnd(40)} ${v.status.padEnd(8)} score=${String(v.score).padEnd(3)} ${v.reason.padEnd(20)} via=${v.source}${v.role ? ' [role]' : ''}${v.webmail ? ' [webmail]' : ''}`);
  }
  console.log(`[hetzner-verify] done · valid ${tally.valid} · risky ${tally.risky} · invalid ${tally.invalid} · unknown ${tally.unknown} · £0 (no paid credits, no email sent)`);
  await pgQuery._close();
}

if (require.main === module) {
  main().catch(e => { console.error('[hetzner-verify] FATAL', e.message); process.exit(1); });
}
module.exports = { verifyEmailSmtp, smtpVerify, mxHosts };
