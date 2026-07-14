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

// ROBUSTNESS (every-site-mints): build() fetches live sites via raw fetch()/undici. A site that drops the
// connection mid-stream can emit an unhandled 'error' on the HTTP/2 stream (UND_ERR_SOCKET / ECONNRESET /
// "other side closed") with no owning promise — that crashes the ENTIRE worker, killing every concurrent
// mint, not just the bad domain. The per-domain try/catch + race-timeout in mintOne already handle real
// failures (the row goes to retry/dead-letter). This net swallows ONLY benign async network noise so the
// 24/7 drain never dies on one hostile site; anything else exits non-zero for a clean pm2/Actions restart.
const _BENIGN_NET = /UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|other side closed|socket hang up|terminated|HPE_|stream (closed|destroyed)|Premature close/i;
function _isBenignNet(e) { const s = String((e && (e.code || e.message)) || e || ''); return _BENIGN_NET.test(s); }
process.on('unhandledRejection', (e) => { if (_isBenignNet(e)) { console.warn('  (ignored benign net rejection: ' + String((e && e.message) || e).slice(0, 80) + ')'); return; } console.error('FATAL unhandledRejection:', e); process.exit(1); });
process.on('uncaughtException', (e) => { if (_isBenignNet(e)) { console.warn('  (ignored benign net exception: ' + String((e && e.message) || e).slice(0, 80) + ')'); return; } console.error('FATAL uncaughtException:', e); process.exit(1); });
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;

// FAIL LOUD, NOT SIDEWAYS. NEON was read straight into execFileSync(psql, [NEON, ...]) with no guard. When the
// variable is missing, psql receives NO connection string and falls back to a LOCAL UNIX SOCKET that does not exist
// on a CI runner, so the failure surfaces as:
//     psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed
// That names the wrong thing entirely. Nobody reading it would guess "the NEON_URL secret is not set on this job",
// and every downstream query then fails for a reason that has nothing to do with the real cause. A missing
// credential must say its own name.
if (!NEON) {
  throw new Error('NEON_URL is not set (checked NEON_URL, NEON_CONNECTION_STRING, NEON_DATABASE_URL). '
    + 'Without it psql falls back to a local socket and every query fails with a misleading '
    + '"connection to server on socket /var/run/postgresql" error. Set the secret on this job.');
}

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
// --reclaim-startup: force-reclaim ALL stale 'minting' rows at boot, ignoring RECLAIM_MIN TTL.
// Used by mint-now.yml so every new GH Actions run immediately cleans up orphans left by the
// previous job (which was SIGKILLed at the job timeout before rows could be released).
// Safe under concurrency: a live Oracle VM worker's fresh claims are <1 min old; we only reset
// rows >2 min old here to avoid stomping an actively-running sibling worker.
const RECLAIM_STARTUP = process.argv.includes('--reclaim-startup');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Additive, fail-open: a claim timestamp so reclaimStale() can age claims. Legacy rows (and rows a not-yet-
// upgraded worker claims) have claimed_at NULL — those are aged by enqueued_at instead (see reclaimStale).
function ensureClaimedAt() { try { pg(`ALTER TABLE minting_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz`); } catch (_e) {} }

// Startup reclaim: used with --reclaim-startup (mint-now.yml). Force-resets ALL 'minting' rows
// claimed >2 min ago to 'pending' (retries=0), regardless of RECLAIM_MIN. The 2-min floor avoids
// stomping a sibling Oracle VM worker that just claimed a fresh batch. Any row older than 2 min is
// an orphan from a killed worker — safe to reset. Retries are zeroed so the domain gets a fresh
// attempt with the current (fixed) code rather than burning toward MAXR on zombie kills.
function reclaimStartup() {
  try {
    const out = (pg(`UPDATE minting_queue
        SET status='pending', retries=0,
            error='reclaimed at startup: orphan from previous killed worker'
        WHERE status='minting'
          AND claimed_at < now() - interval '2 minutes'
        RETURNING domain;`) || '').trim();
    const n = out ? out.split('\n').filter(Boolean).length : 0;
    if (n) console.log(`[mint-worker] startup-reclaim: reset ${n} orphaned 'minting' row(s) -> pending (retries=0)`);
    return n;
  } catch (e) { console.error('[mint-worker] startup-reclaim error (continue):', String(e.message || e).slice(0, 120)); return 0; }
}

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

// RECOVERY (production resilience): a build timeout / network drop is TRANSIENT (load- or site-dependent),
// not a permanent defect — those rows must not dead-letter forever or coverage silently caps below 100%.
// recoverTransient() returns transient-failed rows to 'pending' with a fresh retry budget, bounded by
// recovery_count<MAX_RECOVERY so a genuinely-broken site eventually stays failed (no infinite loop). A row
// is only recovered once its last failure is RECOVER_COOLDOWN_MIN old, so a hammered site gets a real rest.
// The recovery_count column is added idempotently; legacy rows treat NULL as 0. (every-site-mints goal)
const MAX_RECOVERY = Math.max(0, parseInt(process.env.MINT_MAX_RECOVERY || '5', 10));
const RECOVER_COOLDOWN_MIN = Math.max(1, parseInt(process.env.MINT_RECOVER_COOLDOWN_MIN || '20', 10));
const _TRANSIENT_RX = "(timeout|ECONNRESET|ETIMEDOUT|EPIPE|socket|network|other side closed|terminated|ENOTFOUND|EAI_AGAIN|503|502|429|reclaimed|challenge|anti-bot)";
function ensureRecoveryCol() { try { pg(`ALTER TABLE minting_queue ADD COLUMN IF NOT EXISTS recovery_count int DEFAULT 0;`); } catch (_e) {} }
function recoverTransient() {
  if (MAX_RECOVERY <= 0) return 0;
  try {
    const out = (pg(`UPDATE minting_queue
        SET status='pending', retries=0, recovery_count=COALESCE(recovery_count,0)+1, error=NULL
        WHERE status='failed'
          AND COALESCE(recovery_count,0) < ${MAX_RECOVERY}
          AND COALESCE(error,'') ~* '${_TRANSIENT_RX}'
          AND COALESCE(minted_at, enqueued_at) < now() - interval '${RECOVER_COOLDOWN_MIN} minutes'
        RETURNING id;`) || '').trim();
    const n = out ? out.split('\n').filter(Boolean).length : 0;
    if (n) console.log(`[mint-worker] recovered ${n} transient-failed row(s) -> pending (bounded by recovery_count<${MAX_RECOVERY})`);
    return n;
  } catch (e) { console.error('[mint-worker] recover error (continue):', String(e.message || e).slice(0, 120)); return 0; }
}

// Atomically claim up to CONC pending rows (pending -> minting). SKIP LOCKED lets many workers run safely.
// source is returned so mintOne() can apply a source-aware build timeout (manual rows get more time).
function claimBatch() {
  const sql = `UPDATE minting_queue SET status='minting', claimed_at=now()
    WHERE id IN (SELECT id FROM minting_queue WHERE status='pending' AND COALESCE(domain,'') <> '' AND domain NOT LIKE 'resolve:%' ORDER BY priority ASC NULLS LAST, enqueued_at ASC LIMIT ${CONC} FOR UPDATE SKIP LOCKED)
    RETURNING id, regexp_replace(COALESCE(domain,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(company,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(sector,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(country,''),'[\t\r\n]+',' ','g'), lead_id, COALESCE(source,'auto');`;
  const out = (pg(sql) || '').trim();
  if (!out) return [];
  return out.split('\n').map((l) => {
    const [id, domain, company, sector, country, lead_id, source] = l.split('\t');
    return { id, domain, company, sector, country, lead_id: lead_id && lead_id !== '' ? lead_id : null, source: source || 'auto' };
  });
}

// Resolve company-name-only rows (domain IS NULL, from the cockpit "audit search" name path) to a real
// domain BEFORE they can be claimed. Reuses the same free-first SERP + accuracy guard as sourcing
// (resolveWebsite). A row that resolves gets its domain filled (then mints normally next claim); a row that
// can't resolve goes status='failed' with a clear reason so it is never stuck and is visible in History.
async function resolveNames() {
  let resolveWebsite;
  try { ({ resolveWebsite } = require(path.join(__dirname, '..', 'src', 'skills', 'S028-sourcing-orchestrator', 'scripts', 'run.js'))); }
  catch (_e) { return 0; } // resolver unavailable — leave name rows pending; they are not claimable, never crash
  let rows = [];
  try {
    // Name-only rows carry a sentinel domain 'resolve:<slug>' (minting_queue.domain is NOT NULL).
    const out = (pg(`SELECT id, regexp_replace(COALESCE(company,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(country,''),'[\t\r\n]+',' ','g')
      FROM minting_queue WHERE status='pending' AND domain LIKE 'resolve:%' AND COALESCE(company,'')<>''
      ORDER BY enqueued_at ASC LIMIT ${CONC}`) || '').trim();
    rows = out ? out.split('\n').map(l => { const [id, company, country] = l.split('\t'); return { id, company, country }; }) : [];
  } catch (_e) { return 0; }
  if (!rows.length) return 0;
  let filled = 0;
  for (const r of rows) {
    let dom = null;
    try { dom = await resolveWebsite(r.company, r.country || ''); } catch (_e) { dom = null; }
    if (dom) {
      // Fill the domain only if still null (race-safe). If another queue row already holds this domain, fail
      // this one rather than create a duplicate mint.
      const taken = (pg(`SELECT 1 FROM minting_queue WHERE lower(domain)=lower('${q(dom)}') AND id<>${r.id} LIMIT 1`) || '').trim();
      if (taken === '1') { pg(`UPDATE minting_queue SET status='failed', error='resolved domain ${q(dom)} already queued' WHERE id=${r.id} AND domain LIKE 'resolve:%';`); continue; }
      pg(`UPDATE minting_queue SET domain='${q(dom)}', error=NULL WHERE id=${r.id} AND domain LIKE 'resolve:%';`);
      filled++;
    } else {
      pg(`UPDATE minting_queue SET status='failed', error='could not resolve a domain from company name' WHERE id=${r.id} AND domain LIKE 'resolve:%';`);
      console.error('  DEAD-LETTER name-resolve failed: ' + String(r.company).slice(0, 60));
    }
    await sleep(400); // gentle on the free SERP
  }
  if (filled) console.log(`[mint-worker] resolved ${filled} company-name row(s) -> domain`);
  return filled;
}

async function mintOne(row) {
  if (DRY) { console.log('  DRY would mint ' + row.domain + ' (' + row.sector + ')'); return; }
  // Manual cockpit mints (source='manual') target real, content-heavy sites whose PSI audit can outlast
  // the default BUILD_TIMEOUT_MS even when set via env. Give them at least 10 minutes regardless of the
  // env var so the Oracle VM pm2 worker (default 120s) and any other worker both honour the same floor.
  // Auto/pipeline rows keep the env-configured cap (default 120s) which is fine for lighter sourced sites.
  const effectiveTimeout = (row.source === 'manual') ? Math.max(BUILD_TIMEOUT_MS, 600000) : BUILD_TIMEOUT_MS;
  try {
    let _to;
    const r = await Promise.race([
      build({
        lead_id: row.lead_id ? Number(row.lead_id) : undefined,
        domain: row.domain, sector: row.sector || 'general', country: row.country || 'UK',
        company: row.company || null, env: process.env,
      }),
      new Promise((_, rej) => { _to = setTimeout(() => rej(new Error('mint build timeout after ' + effectiveTimeout + 'ms')), effectiveTimeout); }),
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
    const dead = (pg(`UPDATE minting_queue SET status=(CASE WHEN retries+1 >= ${MAXR} THEN 'failed' ELSE 'pending' END), retries=retries+1, error='${q(msg)}' WHERE id=${row.id} RETURNING status;`) || '').trim();
    if (dead === 'failed') console.error('  DEAD-LETTER mint failed (' + MAXR + ' tries): ' + row.domain + ' — ' + msg);
    else console.log('  FAIL ' + row.domain + ' ' + msg);
  }
}

async function drainOnce() {
  reclaimStale();                 // return orphaned 'minting' claims to 'pending' before claiming new work
  recoverTransient();             // return transient-failed (timeout/network) rows to 'pending' (bounded) so no avoidable failure is terminal
  await resolveNames();           // turn company-name-only rows into domains (or fail them) before claiming
  const batch = claimBatch();
  if (!batch.length) return 0;
  await Promise.all(batch.map(mintOne)); // CONC in parallel; mints are I/O-bound (API waits)
  return batch.length;
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  console.log(`[mint-worker] start conc=${CONC} idle=${IDLE}ms once=${ONCE} dry=${DRY} reclaimAfter=${RECLAIM_MIN}m startupReclaim=${RECLAIM_STARTUP}`);
  ensureClaimedAt();              // additive claim-timestamp column (idempotent, fail-open)
  ensureRecoveryCol();            // additive recovery-counter column (idempotent, fail-open)
  if (RECLAIM_STARTUP) reclaimStartup(); // reset orphans from previous killed worker before claiming
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
