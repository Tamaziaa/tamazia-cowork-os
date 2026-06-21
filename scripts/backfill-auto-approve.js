#!/usr/bin/env node
'use strict';
// GAP-LEDGER #96: 8,279 leads stuck in lifecycle_stage='pending_approval' with no batch-approve path.
// Tier-2 leads sit in pending_approval indefinitely because the only advance is LLM-rescue → apply-review,
// but LLM-rescue targets icp_tier=2 regardless of lifecycle_stage — so the stage is not a hard block,
// but the governor only releases QUALIFIED leads, and capacity-report/push only count qualified leads.
//
// This script auto-approves Tier-2 leads with a basic data floor (domain + score >= 40 + not consent_required)
// to lifecycle_stage='qualified', unlocking them for LLM-rescue cohorts, nightly enrichment, and eventually
// Tier-1 promotion. Idempotent (approved_at IS NULL guard). Bounded at --max 500/night.
// Usage: node scripts/backfill-auto-approve.js [--max N]
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); } catch (e) { return ''; } }

const MAX = (() => { const i = process.argv.indexOf('--max'); return (i >= 0 && /^\d+$/.test(process.argv[i + 1] || '')) ? parseInt(process.argv[i + 1], 10) : 500; })();

if (!NEON) { console.log('[auto-approve] no NEON_URL — skip'); process.exit(0); }

const result = pg(`UPDATE leads SET
    lifecycle_stage = 'qualified',
    approved_at     = NOW(),
    review_status   = 'auto_approve',
    updated_at      = NOW()
  WHERE id IN (
    SELECT id FROM leads
    WHERE icp_tier = 2
      AND COALESCE(lifecycle_stage,'') = 'pending_approval'
      AND approved_at IS NULL
      AND COALESCE(consent_required, FALSE) = FALSE
      AND COALESCE(domain,'') <> ''
      AND COALESCE(quality_score, 0) >= 40
      AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced','duplicate')
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal','inbound')
    ORDER BY COALESCE(quality_score,0) DESC
    LIMIT ${MAX}
  )
  RETURNING 1`);

const approved = (result.match(/\n/g) || []).length + (result ? 1 : 0);
const remaining = pg(`SELECT COUNT(*)::int FROM leads WHERE icp_tier=2 AND COALESCE(lifecycle_stage,'')='pending_approval' AND approved_at IS NULL`);
console.log(`[auto-approve] advanced ${approved} Tier-2 pending_approval→qualified · remaining ${remaining.trim()}`);
