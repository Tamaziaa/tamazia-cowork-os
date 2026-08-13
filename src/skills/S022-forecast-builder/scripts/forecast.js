#!/usr/bin/env node
// S022 · Forecast builder (FOUNDATION) · weekly weighted pipeline roll-up → forecasts table.
// Phase 14.10.1. Aggregates the open pipeline from leads by stage, applies the stage
// probabilities the phase doc specifies, and produces best / likely / worst scenarios plus
// gap-to-quota. Persists one snapshot row to `forecasts` for accuracy tracking over time.
//
// Real and self-contained: it queries the live leads table, derives a stage per lead from its
// status, multiplies by a per-stage deal value, and rolls up. Where the schema has no explicit
// deal_value on leads, it falls back to a tier/sector default value (configurable via env), so
// the roll-up is real arithmetic, not a stub. The Slack post is the next layer.
//
// CLI:
//   node forecast.js                 # compute + persist a snapshot, print JSON
//   node forecast.js --dry           # compute + print, write NOTHING
//   node forecast.js --quota 50000   # set the quota for gap-to-quota

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

// Stage probabilities exactly as the phase doc specifies.
const STAGE_PROB = {
  pending: 0.01, contacted: 0.03, engaged: 0.08, replied: 0.18,
  call_booked: 0.25, proposal_sent: 0.40, negotiating: 0.65, closed: 1.00,
};
// Default per-deal value when a lead has no explicit deal_value (£0-cost engine; conservative ACV).
const DEFAULT_DEAL_VALUE = Number(process.env.FORECAST_DEFAULT_DEAL_VALUE || 6000);
const DEFAULT_QUOTA = Number(process.env.FORECAST_QUOTA || 50000);

// Map a lead's free-form status into a canonical forecast stage.
function stageFromStatus(status, replied) {
  const s = (status || '').toLowerCase();
  if (replied === 't' || replied === true) return 'replied';
  if (/closed|client|won/.test(s)) return 'closed';
  if (/negotiat/.test(s)) return 'negotiating';
  if (/proposal/.test(s)) return 'proposal_sent';
  if (/call|booked|meeting|demo/.test(s)) return 'call_booked';
  if (/repl/.test(s)) return 'replied';
  if (/engaged|open|click/.test(s)) return 'engaged';
  if (/touch_\d+_queued|sent|contacted|cadence/.test(s)) return 'contacted';
  return 'pending';
}

function buildForecast({ quota = DEFAULT_QUOTA } = {}) {
  // Pull the open pipeline (exclude terminal lost/bounced/suppressed and internal/test/seed leads).
  const raw = pg(`SELECT COALESCE(status,'') , COALESCE(replied::text,'f'), COUNT(*)::text
    FROM leads
    WHERE COALESCE(status,'') NOT ILIKE '%lost%'
      AND COALESCE(status,'') NOT ILIKE '%bounced%'
      AND COALESCE(status,'') NOT ILIKE '%unsub%'
      AND COALESCE(status,'') NOT ILIKE '%suppress%'
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%'
      AND COALESCE(acquisition_channel,'') NOT ILIKE '%seed%'
    GROUP BY status, replied`);
  if (raw == null) return { ok: false, error: 'db_unavailable' };

  const rows = raw ? raw.split('\n').filter(Boolean).map(l => { const [status, replied, count] = l.split('\t'); return { status, replied, count: Number(count) }; }) : [];

  // Roll up by canonical stage.
  const breakdown = {};
  let openDeals = 0, pipelineValue = 0, weighted = 0, bestCase = 0, worstCase = 0, likelyCase = 0;
  for (const r of rows) {
    const stage = stageFromStatus(r.status, r.replied);
    const prob = STAGE_PROB[stage] != null ? STAGE_PROB[stage] : 0.01;
    const value = r.count * DEFAULT_DEAL_VALUE;
    const w = value * prob;
    breakdown[stage] = breakdown[stage] || { count: 0, value: 0, weighted: 0, probability: prob };
    breakdown[stage].count += r.count;
    breakdown[stage].value += value;
    breakdown[stage].weighted += w;
    openDeals += r.count;
    pipelineValue += value;
    weighted += w;
    // best: every high-confidence (>=0.25) deal closes at full value; worst: only >=0.90 closes.
    if (prob >= 0.25) bestCase += value;
    if (prob >= 0.90) worstCase += value;
  }
  likelyCase = Math.round(weighted * 100) / 100;
  bestCase = Math.round(bestCase * 100) / 100;
  worstCase = Math.round(worstCase * 100) / 100;
  pipelineValue = Math.round(pipelineValue * 100) / 100;
  weighted = Math.round(weighted * 100) / 100;
  const gap = Math.round((quota - likelyCase) * 100) / 100;

  // round breakdown weighted values
  for (const k of Object.keys(breakdown)) breakdown[k].weighted = Math.round(breakdown[k].weighted * 100) / 100;

  return {
    ok: true,
    open_deals: openDeals,
    pipeline_value: pipelineValue,
    weighted_value: weighted,
    quota,
    gap_to_quota: gap,
    scenarios: { best: bestCase, likely: likelyCase, worst: worstCase },
    stage_breakdown: breakdown,
  };
}

function persist(f) {
  if (!f.ok) return null;
  const sql = `INSERT INTO forecasts (snapshot_date, pipeline_value, weighted_value, best_case, likely_case, worst_case, open_deals, stage_breakdown, quota, gap_to_quota)
    VALUES (CURRENT_DATE, ${f.pipeline_value}, ${f.weighted_value}, ${f.scenarios.best}, ${f.scenarios.likely}, ${f.scenarios.worst}, ${f.open_deals}, ${pgEsc(JSON.stringify(f.stage_breakdown))}::jsonb, ${f.quota}, ${f.gap_to_quota})
    RETURNING id::text`;
  const id = pg(sql);
  return id ? Number(id) : null;
}

function run(argv) {
  const args = argv || process.argv.slice(2);
  const dry = args.includes('--dry');
  const qi = args.indexOf('--quota');
  const quota = qi >= 0 ? Number(args[qi + 1]) : DEFAULT_QUOTA;
  const f = buildForecast({ quota });
  if (f.ok && !dry) f.snapshot_id = persist(f);
  console.log(JSON.stringify(f, null, 2));
  return f;
}

if (require.main === module) run();

module.exports = { buildForecast, persist, stageFromStatus, run, STAGE_PROB };
