#!/usr/bin/env node
// Z14-03 · DB preflight. Hard SELECT 1 against the configured NEON_URL. Unlike every pg() in the engine,
// this DOES NOT fail-open: a connectivity/auth error EXITS 1 so the caller (run-engine-cycle.sh / any
// backfill workflow) reds the run and the if:failure() Telegram alert fires — instead of a silent green
// blackout where every write no-ops. Exit 0 only on a real "1" from Neon.
const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ENV = {}; try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
const NEON = ENV.NEON_URL || process.env.NEON_URL;
if (!NEON) { console.error('🔴 DB-PREFLIGHT FAIL: NEON_URL is blank — engine cannot reach the SoT.'); process.exit(1); }
let out;
try {
  out = execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', 'SELECT 1'],
    { encoding: 'utf8', timeout: 30000 }).toString().trim();
} catch (e) {
  console.error('🔴 DB-PREFLIGHT FAIL: Neon did not answer SELECT 1 — connectivity/auth error. Engine would run GREEN-EMPTY (all writes silently no-op). Detail:', String(e.message || e).slice(0, 200));
  process.exit(1);
}
if (out !== '1') { console.error(`🔴 DB-PREFLIGHT FAIL: SELECT 1 returned ${JSON.stringify(out)} (expected "1").`); process.exit(1); }
console.log('[db-preflight] ok: Neon answered SELECT 1');
