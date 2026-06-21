#!/usr/bin/env node
'use strict';
// GAP-LEDGER #97: 351 leads stuck in lifecycle_stage='sourced'/'enriched' since 2026-05-20.
// These leads have already been scored (quality_score IS NOT NULL) but never advanced because
// qualify-and-queue only processes quality_score IS NULL rows. Reset their score so the next
// qualify-and-queue cycle re-evaluates them with current data. Bounded to 100/night.
// Idempotent: only touches leads with quality_score>0 in sourced/enriched for >30 days.
// Usage: node scripts/reap-stuck-pipeline.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); } catch (e) { return ''; } }

if (!NEON) { console.log('[reap-stuck-pipeline] no NEON_URL — skip'); process.exit(0); }

const reaped = pg(`UPDATE leads SET
    quality_score       = NULL,
    quality_scored_at   = NULL,
    requal_version      = NULL,
    updated_at          = NOW()
  WHERE id IN (
    SELECT id FROM leads
    WHERE lifecycle_stage IN ('sourced','enriched')
      AND updated_at < NOW() - INTERVAL '30 days'
      AND COALESCE(quality_score, 0) > 0
      AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced','duplicate','consent_required')
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal','inbound')
    ORDER BY updated_at ASC
    LIMIT 100
  )
  RETURNING 1`);

const count = (reaped.match(/\n/g) || []).length + (reaped ? 1 : 0);
const remaining = pg(`SELECT COUNT(*)::int FROM leads WHERE lifecycle_stage IN ('sourced','enriched') AND updated_at < NOW() - INTERVAL '30 days' AND COALESCE(quality_score,0) > 0`);
console.log(`[reap-stuck-pipeline] reset ${count} old stuck leads for re-qualification · remaining ${remaining.trim()}`);
