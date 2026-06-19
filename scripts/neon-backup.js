#!/usr/bin/env node
// Z27-01 · daily Neon backup. Dual path, both fail-soft, both logged to backup_runs.
//  (1) pg_dump "$NEON_URL" | gzip -> R2 backups/neon/<date>/neondb-<ts>.sql.gz  (DEPLOYABLE NOW)
//  (2) Neon API branch snap-<date> + prune  (NO-OP until NEON_API_KEY is set; currently blank)
// Retention: 7 daily + 4 weekly (Sundays). Off-Neon copy survives provider loss (Oracle death proved single-provider loss).
// Usage: node scripts/neon-backup.js            (full run)
//        node scripts/neon-backup.js --dry      (no upload, no branch, no prune — prints plan)
const path = require('path'); const fs = require('fs'); const { execFileSync, execSync } = require('child_process');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const ROOT = path.resolve(__dirname, '..');
const ENV = {}; try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
const E = k => ENV[k] || process.env[k] || '';
const NEON = E('NEON_URL'); const DRY = process.argv.includes('--dry');
const date = new Date().toISOString().slice(0, 10);                 // YYYY-MM-DD
const ts = new Date().toISOString().replace(/[:.]/g, '-');         // sortable
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function logRun(kind, status, detail, bytes) { pg(`INSERT INTO backup_runs(kind,status,detail,bytes,ran_at) VALUES ('${kind}','${status}','${String(detail || '').replace(/'/g, "''").slice(0, 500)}',${bytes == null ? 'NULL' : bytes},NOW())`); }
function notify(msg) { try { execFileSync('node', [path.join(ROOT, 'scripts', 'notify-event.js'), 'stuck', msg], { encoding: 'utf8' }); } catch (_e) {} }

const r2 = E('R2_ENDPOINT') ? new S3Client({ region: 'auto', endpoint: E('R2_ENDPOINT'),
  credentials: { accessKeyId: E('R2_ACCESS_KEY_ID'), secretAccessKey: E('R2_SECRET_ACCESS_KEY') },
  requestHandler: { requestTimeout: 300000, connectionTimeout: 15000 }, maxAttempts: 3 }) : null;
const BUCKET = E('R2_BUCKET');

async function dumpToR2() {
  if (!NEON) { logRun('pg_dump', 'fail', 'NEON_URL blank'); notify('🔴 Neon backup: NEON_URL blank — no dump taken'); return false; }
  if (!r2 || !BUCKET) { logRun('pg_dump', 'fail', 'R2 not configured'); notify('🔴 Neon backup: R2 not configured — no off-site copy'); return false; }
  const tmp = path.join(ROOT, `neondb-${ts}.sql.gz`);
  try {
    // pg_dump streams straight through gzip to a temp file. --no-owner/--no-privileges = portable restore into a fresh branch.
    execSync(`pg_dump --no-owner --no-privileges --format=plain "${NEON}" | gzip -9 > "${tmp}"`, { stdio: ['ignore', 'ignore', 'inherit'], timeout: 1000 * 60 * 20 });
    const buf = fs.readFileSync(tmp); const bytes = buf.length;
    if (bytes < 1024) { logRun('pg_dump', 'fail', `dump suspiciously small (${bytes}B)`); notify(`🔴 Neon backup: dump only ${bytes}B — treating as FAILED`); fs.unlinkSync(tmp); return false; }
    const key = `backups/neon/${date}/neondb-${ts}.sql.gz`;
    if (!DRY) await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: 'application/gzip' }));
    fs.unlinkSync(tmp);
    logRun('pg_dump', 'ok', `${(bytes / 1048576).toFixed(1)}MB -> ${key}`, bytes);
    console.log(`[backup] pg_dump ok: ${(bytes / 1048576).toFixed(1)}MB -> ${key}${DRY ? ' (DRY)' : ''}`);
    return true;
  } catch (e) { try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch (_) {} logRun('pg_dump', 'fail', String(e.message || e)); notify(`🔴 Neon backup pg_dump FAILED: ${String(e.message || e).slice(0, 180)}`); return false; }
}

async function pruneR2() {
  if (!r2 || !BUCKET) return;
  try {
    const out = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/neon/' }));
    const now = Date.now(); const keep = []; const del = [];
    for (const o of (out.Contents || [])) {
      const m = o.Key.match(/backups\/neon\/(\d{4}-\d{2}-\d{2})\//); if (!m) { continue; }
      const ageD = (now - new Date(m[1]).getTime()) / 86400000;
      const isSunday = new Date(m[1]).getUTCDay() === 0;
      if (ageD <= 7) keep.push(o.Key);
      else if (ageD <= 35 && isSunday) keep.push(o.Key);   // weekly tier
      else del.push(o.Key);
    }
    for (const k of del) if (!DRY) await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k }));
    console.log(`[backup] prune: kept ${keep.length}, deleted ${del.length}${DRY ? ' (DRY)' : ''}`);
  } catch (e) { console.error('[backup] prune failed (non-fatal):', String(e.message || e)); }
}

async function neonBranch() {
  const key = E('NEON_API_KEY'); const proj = E('NEON_PROJECT_ID');
  if (!key) { logRun('neon_branch', 'skip', 'NEON_API_KEY blank (founder action) — pg_dump is the live copy'); console.log('[backup] neon-branch skipped: NEON_API_KEY blank'); return; }
  if (!proj) { logRun('neon_branch', 'skip', 'NEON_PROJECT_ID blank'); return; }
  try {
    const r = await fetch(`https://console.neon.tech/api/v2/projects/${proj}/branches`, { method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: { name: `snap-${date}` } }), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Neon API ${r.status}: ${(await r.text()).slice(0, 120)}`);
    logRun('neon_branch', 'ok', `snap-${date} created`); console.log(`[backup] neon branch snap-${date} created`);
    const lr = await fetch(`https://console.neon.tech/api/v2/projects/${proj}/branches`, { headers: { 'Authorization': `Bearer ${key}` }, signal: AbortSignal.timeout(30000) });
    const branches = (await lr.json()).branches || [];
    for (const b of branches) { const m = b.name && b.name.match(/^snap-(\d{4}-\d{2}-\d{2})$/); if (!m) continue;
      const ageD = (Date.now() - new Date(m[1]).getTime()) / 86400000; const sun = new Date(m[1]).getUTCDay() === 0;
      if (ageD > 7 && !(ageD <= 35 && sun) && !DRY) await fetch(`https://console.neon.tech/api/v2/projects/${proj}/branches/${b.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${key}` } });
    }
  } catch (e) { logRun('neon_branch', 'fail', String(e.message || e)); notify(`⚠️ Neon branch snapshot failed (pg_dump still ran): ${String(e.message || e).slice(0, 160)}`); }
}

(async () => {
  pg(`CREATE TABLE IF NOT EXISTS backup_runs (id bigserial PRIMARY KEY, kind text, status text, detail text, bytes bigint, ran_at timestamptz DEFAULT now())`);
  const ok = await dumpToR2();
  await neonBranch();
  await pruneR2();
  // Hard-fail the process ONLY if the spine (pg_dump->R2) failed, so the workflow reds + alerts.
  if (!ok) process.exit(1);
})();
