#!/usr/bin/env node
'use strict';
// 24/7 enrichment worker — the binding throttle of the pipeline. Drains un-enriched leads at concurrency,
// runs the website-first DIY waterfall (enrichCompany) with the cost-governed Apify escalation on served
// verticals, then persists THE decision-maker (primary_email/role/source/confidence) + the secondary cc/bcc
// contacts + verification, so the qualify step can tier them. Multi-worker-safe (FOR UPDATE SKIP LOCKED).
//   node scripts/enrich-worker.js          # loop forever
//   node scripts/enrich-worker.js --once   # drain to empty, then exit
//   node scripts/enrich-worker.js --dry    # claim + enrich + print, NO DB write
// Env: ENRICH_CONCURRENCY (default 6), ENRICH_IDLE_MS (20000), APIFY_ENABLE, APIFY_MONTHLY_CAP_USD
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
// load .env (repo root, then sibling execution dir) without overriding real env
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const { enrichCompany } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'enrich.js'));
const { SECTORS } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'icp.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jb = (v) => v == null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

const CONC = Math.max(1, parseInt(process.env.ENRICH_CONCURRENCY || '6', 10));
const IDLE = Math.max(1000, parseInt(process.env.ENRICH_IDLE_MS || '20000', 10));
const ONCE = process.argv.includes('--once');
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atomically claim un-enriched leads. Setting enriched_at NOW() marks them taken so other workers skip.
function claimBatch() {
  const sql = `UPDATE leads SET enriched_at = NOW()
    WHERE id IN (
      SELECT id FROM leads
      WHERE COALESCE(domain,'') <> '' AND enriched_at IS NULL
        AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
        AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      ORDER BY priority_score DESC NULLS LAST, id DESC
      LIMIT ${CONC} FOR UPDATE SKIP LOCKED)
    RETURNING id, COALESCE(domain,''), COALESCE(company,''), COALESCE(sector,'');`;
  const out = (pg(sql) || '').trim();
  if (!out) return [];
  return out.split('\n').map((l) => { const [id, domain, company, sector] = l.split('\t'); return { id, domain, company, sector }; });
}

async function enrichOne(row) {
  const served = !!SECTORS[String(row.sector || '').toLowerCase()];
  let rec;
  try {
    rec = await enrichCompany({ domain: row.domain, company: row.company, sector: row.sector, env: process.env, verify: true, useCache: true, apify: served });
  } catch (e) { console.log('  ERR ' + row.domain + ' ' + String(e.message || e).slice(0, 100)); return; }
  const primary = rec.primary || null;
  const secondary = rec.secondary_emails || [];
  const socials = rec.socials || {};
  const liUrl = (socials.linkedin && (socials.linkedin.url || socials.linkedin)) || (rec.linkedin_people && rec.linkedin_people[0]) || '';
  if (DRY) {
    console.log(`  DRY ${row.domain} -> primary=${primary ? primary.email + ' (' + primary.role + ', conf ' + primary.confidence + (primary.verified ? ', verified' : '') + ')' : 'none'} +${secondary.length} secondary`);
    return;
  }
  const sets = [
    `primary_email=${q(primary && primary.email)}`,
    `primary_email_role=${q(primary && primary.role)}`,
    `primary_email_source=${q(primary && primary.source)}`,
    `decision_maker_confidence=${primary ? Number(primary.confidence || 0) : 'NULL'}`,
    `secondary_emails=${jb(secondary)}`,
    `all_emails=${jb((rec.emails || []).map(e => ({ email: e.value, name: e.name || '', role: e.position || '', source: e.source || '', verified: !!e.verified })))}`,
    `all_socials=${jb(socials)}`,
    `email_verified=${primary ? (primary.verified ? 'TRUE' : 'FALSE') : 'FALSE'}`,
    `enriched_at=NOW()`,
  ];
  // Only set the legacy single-contact fields when we actually found a primary (never clobber a good value with null).
  if (primary && primary.email) {
    sets.push(`contact_email=${q(primary.email)}`, `contact_name=${q(primary.name)}`, `title=${q(primary.role)}`, `contact_confidence=${Number(primary.confidence || 0)}`);
  }
  if (liUrl) sets.push(`linkedin_url=${q(liUrl)}`);
  pg(`UPDATE leads SET ${sets.join(', ')} WHERE id=${row.id};`);
  console.log(`  OK ${row.domain} -> ${primary ? primary.email + ' [' + (primary.role || '?') + '] conf=' + primary.confidence + (primary.verified ? ' ✓' : '') : 'no DM'} (+${secondary.length} cc, ${(rec.counts || {}).emails || 0} emails)`);
}

async function drainOnce() {
  const batch = claimBatch();
  if (!batch.length) return 0;
  await Promise.all(batch.map(enrichOne));
  return batch.length;
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  console.log(`[enrich-worker] start conc=${CONC} idle=${IDLE}ms once=${ONCE} dry=${DRY} apify=${/^(1|true|yes|on)$/i.test(process.env.APIFY_ENABLE || '') ? 'on(cap $' + (process.env.APIFY_MONTHLY_CAP_USD || 29) + ')' : 'off'}`);
  let total = 0;
  for (;;) {
    let n = 0;
    try { n = await drainOnce(); } catch (e) { console.error('[enrich-worker] drain error (continue):', String(e.message || e).slice(0, 120)); }
    total += n;
    if (n > 0) { console.log(`[enrich-worker] batch=${n} total=${total}`); continue; }
    if (ONCE) { console.log('[enrich-worker] nothing to enrich; done. total=' + total); break; }
    await sleep(IDLE);
  }
})().catch((e) => { console.error('[enrich-worker] fatal:', e.message); process.exit(1); });
