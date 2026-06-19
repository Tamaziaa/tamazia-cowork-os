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
// Stale-claim TTL. A worker killed (SIGKILL at job timeout / OOM / crash) between claim and the
// done/retry UPDATE leaves its row stuck status='minting' FOREVER — nothing else resets it (the mint-queue
// analogue of the engine_runs zombie). reclaimStale() force-returns such rows to 'pending' so they re-mint.
// Default 30m, well past a normal mint; override with MINT_RECLAIM_AFTER_MIN. Idempotent + safe under
// concurrency (a row a live worker is actively minting is younger than the TTL, so it is never reclaimed).
const RECLAIM_MIN = Math.max(1, parseInt(process.env.MINT_RECLAIM_AFTER_MIN || '30', 10));
// Z7-06: per-build wall-clock cap. build() fetches the live site; one un-fetchable/challenge-walled domain can
// hang the await until the JOB timeout SIGKILLs the worker mid-build, orphaning the claim (status stuck 'minting').
// Racing build() against a timeout lets mintOne reject cleanly → catch increments retries → after MAXR the row
// goes 'failed' instead of looping as a zombie. Default 120s (well past a normal mint); override with the env.
const BUILD_TIMEOUT_MS = Math.max(30000, parseInt(process.env.MINT_BUILD_TIMEOUT_MS || '120000', 10));
const ONCE = process.argv.includes('--once');
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Additive, fail-open: a claim timestamp so reclaimStale() can age claims. Legacy rows (and rows a not-yet-
// upgraded worker claims) have claimed_at NULL — those are aged by enqueued_at instead (see reclaimStale).
function ensureClaimedAt() { try { pg(`ALTER TABLE minting_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz`); } catch (_e) {} }

// Reaper: return rows orphaned in 'minting' (claim never resolved) back to 'pending', retry-counted so a row
// that repeatedly kills a worker eventually goes 'failed' instead of looping. Gated by TTL on claimed_at, OR
// on enqueued_at when claimed_at IS NULL (legacy/pre-upgrade claims) — so a freshly-claimed row is never stolen.
function reclaimStale() {
  try {
    const out = (pg(`UPDATE minting_queue
        SET status=(CASE WHEN COALESCE(retries,0)+1 >= ${MAXR} THEN 'failed' ELSE 'pending' END),
            retries=COALESCE(retries,0)+1,
            error=COALESCE(error,'reclaimed: stale minting claim (worker killed before done/retry)')
        WHERE status='minting'
          AND ( (claimed_at IS NOT NULL AND claimed_at < now() - interval '${RECLAIM_MIN} minutes')
             OR (claimed_at IS NULL AND enqueued_at < now() - interval '${RECLAIM_MIN} minutes') )
        RETURNING id;`) || '').trim();
    const n = out ? out.split('\n').filter(Boolean).length : 0;
    if (n) console.log(`[mint-worker] reclaimed ${n} stale 'minting' row(s) -> pending/failed`);
    return n;
  } catch (e) { console.error('[mint-worker] reclaim error (continue):', String(e.message || e).slice(0, 120)); return 0; }
}

// Atomically claim up to CONC pending rows (pending -> minting). SKIP LOCKED lets many workers run safely.
function claimBatch() {
  const sql = `UPDATE minting_queue SET status='minting', claimed_at=now()
    WHERE id IN (SELECT id FROM minting_queue WHERE status='pending' ORDER BY priority ASC NULLS LAST, enqueued_at ASC LIMIT ${CONC} FOR UPDATE SKIP LOCKED)
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
    let _to;
    const r = await Promise.race([
      build({
        lead_id: row.lead_id ? Number(row.lead_id) : undefined,
        domain: row.domain, sector: row.sector || 'general', country: row.country || 'UK',
        company: row.company || null, env: process.env,
      }),
      new Promise((_, rej) => { _to = setTimeout(() => rej(new Error('mint build timeout after ' + BUILD_TIMEOUT_MS + 'ms')), BUILD_TIMEOUT_MS); }),
    ]);
    clearTimeout(_to);
    pg(`UPDATE minting_queue SET status='done', slug='${q(r.slug)}', hash='${q(r.hash)}', minted_at=now(), error=NULL WHERE id=${row.id};`);
    // Bind the URL to the lead — set ONCE and never overwrite. A lead that already has an audit_url may
    // already be in an active campaign; a new hash would 404 in the recipient's inbox. Re-mints only ever
    // fill leads that don't yet have a URL (the enqueue selects exactly those).
    // F1 FIX: also persist audit_slug + audit_hash (the other mint path, verify-audits.js, already does this).
    // reconcile.js's orphan-audit cleaner is gated on `audit_slug IS NOT NULL` — a lead minted here with only
    // audit_url set was INVISIBLE to that cleaner, so a dead audit_pages row would never clear the URL and a
    // 404 link could reach the send path. Set them in the SAME guarded UPDATE so they stay consistent + set-once.
    if (row.lead_id) {
      pg(`UPDATE leads SET audit_url='${q(r.signed_url)}', audit_slug='${q(r.slug)}', audit_hash='${q(r.hash)}', audit_url_minted_at=now()
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
  reclaimStale();                 // return orphaned 'minting' claims to 'pending' before claiming new work
  const batch = claimBatch();
  if (!batch.length) return 0;
  await Promise.all(batch.map(mintOne)); // CONC in parallel; mints are I/O-bound (API waits)
  return batch.length;
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  console.log(`[mint-worker] start conc=${CONC} idle=${IDLE}ms once=${ONCE} dry=${DRY} reclaimAfter=${RECLAIM_MIN}m`);
  ensureClaimedAt();              // additive claim-timestamp column (idempotent, fail-open)
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
