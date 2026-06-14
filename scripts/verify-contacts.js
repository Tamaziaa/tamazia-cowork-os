#!/usr/bin/env node
// Free contact verification batch · £0 replacement for MillionVerifier/NeverBounce credits.
// For leads with a contact_email but no verify_status yet: run the free verifier
// (Hunter primary + DIY disposable/MX/role/syntax), persist verify_status + contact_confidence.
// contact_confidence feeds the 10-layer quality scorer (Layer 3) and the pre-send path.
//   valid  -> confidence = score (>=70)
//   risky  -> confidence = score (40-69), still deliverable domain
//   invalid-> confidence = 0, verify_status='invalid' (quality gate + send skip it)
// Usage: node scripts/verify-contacts.js [LIMIT]   default 25
//
// Set SMTP_PROBE=1 to enable the optional SMTP RCPT probe (only on hosts that allow outbound :25,
// e.g. the Oracle VM — NOT GitHub Actions, which blocks port 25).

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { verifyEmail } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'free-verify.js'));
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

(async () => {
  const limit = Number(process.argv[2] || 25);
  const useSmtp = process.env.SMTP_PROBE === '1';
  const raw = pg(`
    SELECT id::text, contact_email
    FROM leads
    WHERE contact_email IS NOT NULL AND contact_email <> '' AND POSITION('@' IN contact_email) > 1
      -- bug-fix: 'pending' is the UNVERIFIED placeholder the SERP scraper writes at insert (serp-engine.js:
      -- organic_top100 -> verify_status='pending'; health-check/intel-pulse both treat it as "awaiting verify").
      -- The old (NULL OR '') filter MISSED it, so every organic lead stamped 'pending' was never free-verified —
      -- 388 of 614 icp_tier=1 leads were stranded at 'pending' (never deliverability-checked) and so could not
      -- become send-ready. free-verify.js only ever emits valid/risky/invalid/unknown, so re-checking a 'pending'
      -- row is correct (it was never actually verified). prioritise Tier-1 so send-ready depth fills first.
      AND COALESCE(verify_status,'') IN ('', 'pending')
    ORDER BY (icp_tier = 1) DESC NULLS LAST, priority_score DESC NULLS LAST, id DESC LIMIT ${limit}`);
  if (!raw) { console.log('[verify] nothing to verify.'); return; }
  const rows = raw.split('\n').filter(Boolean).map(l => { const [id, email] = l.split('\t'); return { id: Number(id), email }; });
  let valid = 0, risky = 0, invalid = 0;
  for (const r of rows) {
    let v;
    try { v = await verifyEmail(r.email, { smtp: useSmtp }); } catch (_e) { continue; }
    if (v.status === 'valid') valid++; else if (v.status === 'risky') risky++; else if (v.status === 'invalid') invalid++;
    const conf = v.status === 'invalid' ? 0 : (v.score || 0);
    pg(`UPDATE leads SET verify_status=${esc(v.status)}, contact_confidence=${conf}, updated_at=NOW() WHERE id=${r.id}`);
    console.log(`  ${r.email.padEnd(40)} ${v.status.padEnd(8)} conf=${conf} via=${v.source}`);
  }
  console.log(`[verify] ${rows.length} checked · valid ${valid} · risky ${risky} · invalid ${invalid} · £0 (no paid credits used)`);
})().catch(e => { console.error('[verify] FATAL', e.message); process.exit(1); });
