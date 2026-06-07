#!/usr/bin/env node
'use strict';
// Tier-2 approval surface (founder-in-the-loop). Tier-2 leads are regulated buyers with a real gap but NOT
// auto-minted — they wait here for a yes/no. Approving mints + emails them; rejecting drops them.
//   node scripts/approve-leads.js                 # list pending-approval (Tier-2) leads
//   node scripts/approve-leads.js --approve 12,34 # approve by id -> quality_fit=TRUE, lifecycle='qualified'
//   node scripts/approve-leads.js --approve all   # approve every pending-approval lead (use with care)
//   node scripts/approve-leads.js --reject 56,78  # reject -> lifecycle='rejected'
// Approved leads are picked up by enqueue-leads.js -> mint-worker.js (audit minted) -> push-to-mystrika.js.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); }
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? (process.argv[i + 1] || '') : null; };
const ids = (s) => (s || '').split(',').map(x => x.trim()).filter(x => /^\d+$/.test(x));

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  const approve = arg('approve'); const reject = arg('reject');

  if (approve != null) {
    const where = approve === 'all' ? `icp_tier=2 AND COALESCE(lifecycle_stage,'')='pending_approval'` : (ids(approve).length ? `id IN (${ids(approve).join(',')})` : null);
    if (!where) { console.error('nothing to approve (give ids or "all")'); process.exit(1); }
    const n = (pg(`WITH u AS (UPDATE leads SET quality_fit=TRUE, lifecycle_stage='qualified', approved_at=NOW() WHERE ${where} RETURNING 1) SELECT count(*) FROM u;`) || '').trim();
    console.log(`approved ${n} lead(s) -> they will mint + email on the next enqueue/mint cycle.`);
    return;
  }
  if (reject != null) {
    if (!ids(reject).length) { console.error('give ids to reject'); process.exit(1); }
    const n = (pg(`WITH u AS (UPDATE leads SET quality_fit=FALSE, lifecycle_stage='rejected' WHERE id IN (${ids(reject).join(',')}) RETURNING 1) SELECT count(*) FROM u;`) || '').trim();
    console.log(`rejected ${n} lead(s).`);
    return;
  }

  // Default: list pending-approval leads with the signals that justify a yes/no.
  const rows = (pg(`
    SELECT id, COALESCE(company,domain,''), COALESCE(sector,''), COALESCE(quality_score::text,'0'),
           COALESCE(primary_email,contact_email,''), COALESCE(decision_maker_confidence::text,'0'),
           COALESCE(NULLIF(personalisation_pointers->>'top_finding',''), top_finding, '')
    FROM leads WHERE icp_tier=2 AND COALESCE(lifecycle_stage,'')='pending_approval'
    ORDER BY quality_score DESC NULLS LAST, id DESC LIMIT 200`) || '').trim();
  if (!rows) { console.log('No Tier-2 leads pending approval.'); return; }
  const list = rows.split('\n').map(r => r.split('\t'));
  console.log(`\n${list.length} Tier-2 lead(s) pending approval:\n`);
  console.log('  id    score  conf  sector         company / decision-maker email / top finding');
  for (const [id, company, sector, score, email, conf, finding] of list) {
    console.log(`  ${id.padEnd(5)} ${score.padStart(4)}  ${conf.padStart(4)}  ${(sector || '-').padEnd(13)} ${(company || '').slice(0, 30)} | ${(email || 'no email').slice(0, 32)} | ${(finding || '').slice(0, 44)}`);
  }
  console.log(`\nApprove:  node scripts/approve-leads.js --approve <ids|all>`);
  console.log(`Reject:   node scripts/approve-leads.js --reject <ids>\n`);
})().catch(e => { console.error('approve-leads error:', e.message); process.exit(1); });
