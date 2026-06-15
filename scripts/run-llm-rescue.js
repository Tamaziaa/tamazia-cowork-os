#!/usr/bin/env node
'use strict';
// Thin CLI for the LLM-RESCUE generation worker (src/lib/llm-rescue.js). Cost-capped, free-model-first, gated on
// the LLM_QA_ENABLED kill switch (default OFF). Writes ADVISORY qa_* columns only — never icp_tier/send state.
// Usage:
//   LLM_QA_ENABLED=1 node scripts/run-llm-rescue.js --max 15 [--cohort missing_linkedin] [--dry] [--force]
//   (no env / LLM_QA_ENABLED unset -> prints the kill-switch notice and exits 0, so a cycle step is a safe no-op)
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const rescue = require(path.join(ROOT, 'src', 'lib', 'llm-rescue.js'));

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);

(async () => {
  const out = await rescue.runWave({
    max: parseInt(arg('max', '15'), 10),
    cohort: arg('cohort', null),
    dry: has('dry'),
    force: has('force'),
    recheckHours: parseInt(arg('recheck-hours', '168'), 10),
  });
  if (out.skipped) { console.log('[llm-rescue] ' + out.reason); return; }
  if (!out.ok) { console.log('[llm-rescue] error: ' + (out.error || 'unknown')); return; }
  const flips = out.results.filter(r => r.flippedTo1);
  const auto = out.results.filter(r => r.review_status === 'auto_promote');
  const human = out.results.filter(r => r.review_status === 'unreviewed');
  const explained = out.results.filter(r => r.qa_status === 'explained');
  console.log(`[llm-rescue] processed ${out.processed}${out.dry ? ' (DRY)' : ''} · flipped→T1 ${flips.length} · auto-promote ${auto.length} · human-review ${human.length} · explained ${explained.length} · cost $${(out.total_cost_usd_micro / 1e6).toFixed(6)}`);
  for (const r of out.results.slice(0, 30)) {
    if (r.error) { console.log(`  ${r.lead_ref || r.lead_id} [${r.cohort}] ERROR ${r.error}`); continue; }
    console.log(`  ${r.lead_ref || r.lead_id} [${r.cohort}] ${r.base_tier}->${r.after_tier} ${r.review_status || r.qa_status} conf=${r.confidence} :: ${r.reason}`);
    if (out.dry && r._sql) console.log(`      WOULD: ${r._sql.slice(0, 240)}...`);
  }
})().catch(e => { console.error('[llm-rescue] fatal (non-blocking):', e.message); process.exit(0); });
