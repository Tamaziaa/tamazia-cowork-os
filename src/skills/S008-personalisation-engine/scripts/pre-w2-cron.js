#!/usr/bin/env node
// Phase 6 task 6.3.1 · Pre-W2 cron.
// Runs every morning at 06:00 Europe/London (15 min before W2's 06:15 send cron).
// For each lead in 'ready_for_send' that has no fresh personalisation_pointers, runs S008.
// "Fresh" = personalisation_generated_at within last 14 days AND personalisation_quality_score ≥ 0.70.
// Skip if scanner_budget_state.spent_usd_micro >= daily_cap_usd_micro.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
const { runEngine } = require('./run.js');

const QUALITY_FLOOR = Number(process.env.PERSONALISATION_QUALITY_FLOOR || '0.70');
const FRESH_DAYS = Number(process.env.PERSONALISATION_FRESH_DAYS || '14');

async function main({ limit = 50, dryRun = false } = {}) {
  const t0 = Date.now();
  // Budget gate
  const remaining = pg(`SELECT (daily_cap_usd_micro - spent_usd_micro) FROM scanner_budget_state WHERE workspace_id=1 AND bucket_day=CURRENT_DATE`);
  if (remaining && Number(remaining) <= 0) { console.log(JSON.stringify({ ok: false, reason: 'daily_budget_exhausted', remaining_usd_micro: 0 })); return; }

  // Pull due leads (jurisdiction is the country column on the leads table)
  const sql = `
    SELECT id, domain, sector, jurisdiction, company
    FROM leads
    WHERE status IN ('ready_for_send', 'queued', 'enriched')
      AND COALESCE(replied, FALSE) = FALSE
      AND (personalisation_quality_score IS NULL
           OR personalisation_quality_score < ${QUALITY_FLOOR}
           OR personalisation_generated_at IS NULL
           OR personalisation_generated_at < NOW() - INTERVAL '${FRESH_DAYS} days')
      AND domain IS NOT NULL AND domain != ''
    ORDER BY personalisation_generated_at NULLS FIRST, id
    LIMIT ${Math.max(1, Math.min(200, limit))}`;
  const raw = pg(sql);
  if (!raw) { console.log(JSON.stringify({ ok: true, processed: 0, latency_ms: Date.now() - t0 })); return; }
  const leads = raw.split('\n').filter(Boolean).map(line => { const [id, domain, sector, jurisdiction, company] = line.split('\t'); return { id: Number(id), domain, sector, country: jurisdiction || 'UK', company }; });

  if (dryRun) { console.log(JSON.stringify({ ok: true, dry_run: true, count: leads.length, leads: leads.slice(0, 5) }, null, 2)); return; }

  const results = [];
  for (const lead of leads) {
    try {
      const s = await runEngine({ domain: lead.domain, sector: lead.sector || 'law-firms', country: lead.country || 'UK', company: lead.company, lead_id: lead.id, max_pointers: 50, skip_llm: process.env.PRE_W2_SKIP_LLM === '1' });
      results.push({ lead_id: lead.id, domain: lead.domain, pointer_count: s.pointer_count, score: s.specificity_score, cost_usd_micro: s.total_cost_usd_micro, latency_ms: s.total_latency_ms });
    } catch (e) {
      results.push({ lead_id: lead.id, domain: lead.domain, error: e.message || String(e) });
      pg(`UPDATE leads SET personalisation_generated_at = NOW() WHERE id = ${lead.id}`); // suppress retry for 14d on hard error
    }
    // Re-check budget every 10 leads
    if (results.length % 10 === 0) {
      const r = pg(`SELECT (daily_cap_usd_micro - spent_usd_micro) FROM scanner_budget_state WHERE workspace_id=1 AND bucket_day=CURRENT_DATE`);
      if (r && Number(r) <= 0) { console.log(JSON.stringify({ ok: true, processed: results.length, budget_exhausted: true })); return; }
    }
  }

  console.log(JSON.stringify({ ok: true, processed: results.length, latency_ms: Date.now() - t0, results: results.slice(0, 10) }, null, 2));
}

function parseArgs(argv) {
  const out = { limit: 50, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]);
    else if (argv[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

if (require.main === module) {
  main(parseArgs(process.argv.slice(2))).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { main };
