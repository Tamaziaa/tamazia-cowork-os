#!/usr/bin/env node
// Phase 0 of the V3 sourcing re-run: additive-only schema for the new model.
// ADD COLUMN IF NOT EXISTS only — never rename/drop (`leads` is SHARED with the audit engine).
// Idempotent, safe to run every cycle. Reuses scripts/psql + NEON_URL like the other engine scripts.
//   node scripts/v3/migrate-v3-schema.js
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }

// All additive. V3 Section B fields not already on `leads`. `company` stays as the V3 company_name.
const COLS = [
  ['legal_name', 'text'], ['company_number', 'text'], ['name_source', 'text'],
  ['name_status', "text DEFAULT 'unverified'"], ['name_normalised_at', 'timestamptz'],
  ['requal_version', 'text'],
  ['sector_code', 'text'], ['sub_sector_code', 'text'], ['sector_confidence', 'text'],
  ['sector_fit_score', 'int'], ['need_signal_score', 'int'], ['contact_quality_score', 'int'],
  ['completeness_score', 'int'], ['total_score', 'int'], ['filter_key', 'text'], ['queue_rank', 'int'],
  ['park_reason', 'text'],
  ['sig_regulated', 'boolean'], ['sig_ads_running', 'boolean'], ['sig_seo_gap', 'boolean'],
  ['sig_compliance_gap', 'boolean'], ['sig_hiring', 'boolean'], ['sig_multi_location', 'boolean'],
  ['contacts', 'jsonb'],   // up to 3 structured decision-makers for multi-threading
];
let ok = 0, err = 0;
for (const [c, t] of COLS) {
  try { pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${c} ${t}`); ok++; }
  catch (e) { err++; console.error(`  leads.${c}: ${String(e.message).slice(0, 90)}`); }
}
// Gate 3 accountability table (V3 Section K)
try {
  pg(`CREATE TABLE IF NOT EXISTS scraper_scorecard (
        id bigserial PRIMARY KEY, scraper_source text, sampled_at timestamptz DEFAULT now(), sample_n int,
        valid_email_pct numeric, named_contact_pct numeric, sector_match_pct numeric, linkedin_id_pct numeric,
        duplicate_pct numeric, tier1_pct numeric, cost_per_lead numeric, verdict text)`);
  ok++;
} catch (e) { err++; console.error('  scraper_scorecard:', String(e.message).slice(0, 90)); }
console.log(`[v3-schema] ${ok} applied, ${err} errors (additive, idempotent)`);
