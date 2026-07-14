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
// The audit table name, resolved EXACTLY as build.js and remint-audits.js resolve it. A third spelling of
// the same fact is a two-doors bug waiting to happen — and this one decides whether we can SEE the audit
// we just claimed to have written.
const AUDIT_TABLE = (() => { const t = process.env.AUDIT_TABLE || 'audit_pages'; return /^[a-z_][a-z0-9_]*$/i.test(t) ? t : 'audit_pages'; })();
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

// ── SENTRY (optional, DSN-gated) ───────────────────────────────────────────────────────────────────────────────
// A dead-lettered mint means an audit a law firm was going to receive DOES NOT EXIST. That is worth an alert.
// Deliberately dependency-free: a plain HTTPS POST to the Sentry store endpoint. Adding the SDK to a worker whose
// whole job is to not fall over would be adding a way for it to fall over. If SENTRY_DSN is unset this is a no-op,
// and it can never throw — a monitoring failure must never become a mint failure.
function _sentry(title, detail, tags) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const m = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn.trim());
    if (!m) return;
    const [, key, host, projectId] = m;
    const body = JSON.stringify({
      event_id: require('crypto').randomBytes(16).toString('hex'),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: 'error',
      logger: 'mint-worker',
      server_name: String(process.env.GITHUB_RUN_ID || 'local'),
      message: { formatted: title },
      extra: { detail: String(detail).slice(0, 4000) },
      tags: Object.assign({ component: 'mint' }, tags || {}),
    });
    const req = require('https').request({
      method: 'POST',
      host,
      path: '/api/' + projectId + '/store/',
      timeout: 4000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_client=tamazia-mint/1.0, sentry_key=' + key,
      },
    }, (res) => { res.resume(); });
    req.on('error', () => {});      // FAIL-OPEN: monitoring must never take the mint down with it.
    req.on('timeout', () => req.destroy());
    req.write(body); req.end();
  } catch (_e) { /* FAIL-OPEN: see above. */ }
}

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
    // ── THE POST-WRITE ASSERTION. ────────────────────────────────────────────────────────────────────────────
    // The queue reported 1,034 audits 'done'. audit_pages held SEVENTEEN ROWS. 1,004 "done" audits had NO PAGE,
    // and 412 lead records ended up carrying an audit_url that returns HTTP 404. Nothing was ever sent — the send
    // gate is the only reason that is not already a commercial incident.
    //
    // The cause is this line. It marked the row 'done' on the strength of the builder RETURNING a slug, without
    // ever asking the one question that matters: DOES THE PAGE EXIST?
    //
    // A build that returns an object is not an audit. An audit is a row in audit_pages that a law firm can open.
    // So we ask the database, and we ask it about the SPECIFIC slug and hash we are about to write onto a lead.
    // If it is not there, the mint FAILED — whatever the builder said — and it goes back for a retry instead of
    // poisoning a lead with a link to nothing.
    {
      const _chk = (pg(`SELECT 1 FROM ${AUDIT_TABLE} WHERE slug='${q(r.slug)}' AND hash='${q(r.hash)}' LIMIT 1;`) || '').trim();
      if (!_chk) {
        throw new Error('POST-WRITE ASSERTION FAILED: the builder returned ' + r.slug + '/' + r.hash
          + ' but no such row exists in ' + AUDIT_TABLE + '. The mint is NOT done. This is exactly how 1,004 phantom'
          + ' audits and 412 dead lead URLs were created.');
      }
    }

    // ── AND THE SECOND HALF: THE PAGE MUST ACTUALLY LOAD. ────────────────────────────────────────────────────
    // A row in audit_pages is necessary, not sufficient. The prospect clicks a URL, not a row. verify-audit-url.js
    // has existed for months as the declared "SINGLE SOURCE OF TRUTH: is an audit URL 100% correct AND live?" and
    // was reachable from NOTHING — the exact class this whole cleanup is about. Merged in here rather than
    // reimplemented, so there is ONE door to "is this link safe to send".
    //
    // FAIL-OPEN ON INFRASTRUCTURE, FAIL-CLOSED ON TRUTH: a network blip must not fail a good mint, so a check that
    // cannot run leaves the audit 'done' but records why. A check that RUNS and returns non-200 fails the mint.
    if (String(process.env.VERIFY_AUDIT_URL || '1') === '1') {
      let _vau = null;
      try { _vau = require('../src/lib/audit/verify-audit-url.js'); } catch (e) { _sentry(e, { stage: 'verify-audit-url:require' }); }
      if (_vau && typeof _vau.verifyAuditUrl === 'function') {
        const _url = r.signed_url || ((process.env.PUBLIC_BASE_URL || 'https://tamazia.co.uk') + '/audit/' + r.slug + '/' + r.hash);
        let _res = null;
        // CodeRabbit (#340): verifyAuditUrl is ASYNC. Without await, _res is a PROMISE, `_res.ok` is undefined,
        // and this entire guard NEVER RUNS — a broken audit page would still be marked done. The exact class of
        // silent no-op gate this whole cleanup exists to kill, and I shipped one. Awaited.
        try { _res = await _vau.verifyAuditUrl(_url, { live: true, timeoutSec: 15 }); } catch (e) { _sentry(e, { stage: 'verify-audit-url:run' }); }
        if (_res && _res.ok === false && _res.status && String(_res.status) !== '0') {
          throw new Error('POST-WRITE ASSERTION FAILED (live URL): ' + _url + ' returned HTTP ' + _res.status
            + ' (' + (_res.reason || 'not ok') + '). The row exists but the PAGE DOES NOT LOAD. A prospect clicking'
            + ' this link in a cold email from a compliance firm would hit a broken page.');
        }
      }
    }
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
    // A FAILURE MUST EXPLAIN ITSELF. This used to store String(e.message).slice(0, 160) — and the write-seam's real
    // diagnostic (the SQL cause, the idem_key, the HTTP response) went to stderr and DIED with the job. So the queue
    // said only "INSERT failed — no row written", which named nothing. I chased that one message across four
    // sessions, guessing, because the system would not tell me what it knew.
    //
    // Worse: the truncation HID WHICH CODE WAS RUNNING. A stale worker and a genuine SQL error produced the exact
    // same string. So the error now carries the engine version and the commit SHA the worker was actually built
    // from. One run answers "is this a real bug or a stale checkout" instead of five.
    const full = String((e && e.stack) || (e && e.message) || e);
    const ver = (() => { try { return require('../src/skills/S008-personalisation-engine/scanners/compliance.js').ENGINE_VERSION; } catch (_v) { return 'unknown'; } })();
    const sha = String(process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 8);
    const msg = [
      full.split('\n')[0],
      '[engine=' + ver + ' sha=' + sha + ' attempt=' + ((+row.retries || 0) + 1) + '/' + MAXR + ']',
      full.includes('\n') ? '\n' + full.split('\n').slice(1, 6).join('\n') : '',
    ].join(' ').slice(0, 4000);   // the column is TEXT. There is no reason to throw the answer away.

    const dead = (pg(`UPDATE minting_queue SET status=(CASE WHEN retries+1 >= ${MAXR} THEN 'failed' ELSE 'pending' END), retries=retries+1, error='${q(msg)}' WHERE id=${row.id} RETURNING status;`) || '').trim();

    // SENTRY. Gated on the DSN, so this is a no-op until one is set — never a second failure mode on top of the
    // first. A dead-lettered mint is the only thing here worth waking someone for: it means an audit a law firm was
    // going to receive does not exist.
    if (dead === 'failed') _sentry('mint dead-letter: ' + row.domain, msg, { domain: row.domain, engine: ver, sha });

    if (dead === 'failed') console.error('  DEAD-LETTER mint failed (' + MAXR + ' tries): ' + row.domain + ' — ' + msg.slice(0, 300));
    else console.log('  FAIL ' + row.domain + ' ' + msg.slice(0, 300));
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
