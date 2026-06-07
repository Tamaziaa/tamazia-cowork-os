#!/usr/bin/env node
'use strict';
// 24/7 mint worker — drains minting_queue at concurrency, mints via build() (writes audit_pages +
// signed URL), binds the URL to the lead, fail-soft with retry<=MAXR. Built for an always-on box
// (Oracle free VM under pm2). Multi-worker safe via FOR UPDATE SKIP LOCKED claiming.
//   node scripts/mint-worker.js            # loop forever (drain, then idle, repeat)
//   node scripts/mint-worker.js --once     # drain to empty, then exit
//   node scripts/mint-worker.js --dry      # claim + print only, no mint/write
// Env: MINT_CONCURRENCY (default 10), MINT_IDLE_MS (15000), MINT_MAX_RETRIES (3)
const { execFileSync } = require('child_process');
const path = require('path');
const { build } = require(path.join(__dirname, '..', 'src', 'skills', 'S025-audit-page-builder', 'scripts', 'build.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(__dirname, 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); }
function q(s) { return String(s == null ? '' : s).replace(/'/g, "''"); }

const CONC = Math.max(1, parseInt(process.env.MINT_CONCURRENCY || '10', 10));
const IDLE = Math.max(1000, parseInt(process.env.MINT_IDLE_MS || '15000', 10));
const MAXR = Math.max(1, parseInt(process.env.MINT_MAX_RETRIES || '3', 10));
const ONCE = process.argv.includes('--once');
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atomically claim up to CONC pending rows (pending -> minting). SKIP LOCKED lets many workers run safely.
function claimBatch() {
  const sql = `UPDATE minting_queue SET status='minting'
    WHERE id IN (SELECT id FROM minting_queue WHERE status='pending' ORDER BY enqueued_at LIMIT ${CONC} FOR UPDATE SKIP LOCKED)
    RETURNING id, regexp_replace(COALESCE(domain,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(company,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(sector,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(country,''),'[\t\r\n]+',' ','g'), lead_id;`;
  const out = (pg(sql) || '').trim();
  if (!out) return [];
  return out.split('\n').map((l) => {
    const [id, domain, company, sector, country, lead_id] = l.split('\t');
    return { id, domain, company, sector, country, lead_id: lead_id && lead_id !== '' ? lead_id : null };
  });
}

async function mintOne(row) {
  if (DRY) { console.log('  DRY would mint ' + row.domain + ' (' + row.sector + ')'); return; }
  try {
    const r = await build({
      lead_id: row.lead_id ? Number(row.lead_id) : undefined,
      domain: row.domain, sector: row.sector || 'general', country: row.country || 'UK',
      company: row.company || null, env: process.env,
    });
    pg(`UPDATE minting_queue SET status='done', slug='${q(r.slug)}', hash='${q(r.hash)}', minted_at=now(), error=NULL WHERE id=${row.id};`);
    // Bind the URL to the lead — set ONCE and never overwrite. A lead that already has an audit_url may
    // already be in an active campaign; a new hash would 404 in the recipient's inbox. Re-mints only ever
    // fill leads that don't yet have a URL (the enqueue selects exactly those).
    if (row.lead_id) {
      pg(`UPDATE leads SET audit_url='${q(r.signed_url)}', audit_url_minted_at=now()
          WHERE id=${row.lead_id} AND (audit_url IS NULL OR audit_url='');`);
    }
    console.log('  OK ' + row.domain + ' -> ' + r.slug + '/' + r.hash + ' (fw:' + (r.applicable_frameworks || []).length + ' pts:' + (r.pointers || []).length + ')');
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 160);
    pg(`UPDATE minting_queue SET status=(CASE WHEN retries+1 >= ${MAXR} THEN 'failed' ELSE 'pending' END), retries=retries+1, error='${q(msg)}' WHERE id=${row.id};`);
    console.log('  FAIL ' + row.domain + ' ' + msg);
  }
}

async function drainOnce() {
  const batch = claimBatch();
  if (!batch.length) return 0;
  await Promise.all(batch.map(mintOne)); // CONC in parallel; mints are I/O-bound (API waits)
  return batch.length;
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  console.log(`[mint-worker] start conc=${CONC} idle=${IDLE}ms once=${ONCE} dry=${DRY}`);
  let total = 0;
  for (;;) {
    let n = 0;
    try { n = await drainOnce(); } catch (e) { console.error('[mint-worker] drain error (continue):', String(e.message || e).slice(0, 120)); }
    total += n;
    if (n > 0) { console.log(`[mint-worker] batch=${n} total=${total}`); continue; }
    if (ONCE) { console.log('[mint-worker] queue empty; done. total=' + total); break; }
    await sleep(IDLE);
  }
})().catch((e) => { console.error('[mint-worker] fatal:', e.message); process.exit(1); });
