#!/usr/bin/env node
'use strict';
// Thin CLI for the CONSERVATIVE Tier-1 fact-check (src/lib/llm-factcheck.js). Flags doubtful Tier-1 for HUMAN
// review only — NEVER auto-demotes (net Tier-1 cannot drop because of this pass). Deterministic doubts always run;
// the borderline LLM name-adjudication step runs only when LLM_QA_ENABLED. £0 free-first.
// Usage: [LLM_QA_ENABLED=1] node scripts/run-llm-factcheck.js --max 20 [--dry] [--force]
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const fc = require(path.join(ROOT, 'src', 'lib', 'llm-factcheck.js'));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);

(async () => {
  const out = await fc.runFactcheck({ max: parseInt(arg('max', '20'), 10), dry: has('dry'), force: has('force'), recheckHours: parseInt(arg('recheck-hours', '168'), 10) });
  if (!out.ok) { console.log('[llm-factcheck] error: ' + (out.error || 'unknown')); return; }
  console.log(`[llm-factcheck] processed ${out.processed}${out.dry ? ' (DRY)' : ''} · confirmed ${out.confirmed} · flagged-for-review ${out.flagged} (NEVER auto-demoted) · cost $${(out.total_cost_usd_micro / 1e6).toFixed(6)}`);
  for (const r of out.results.slice(0, 40)) {
    if (r.error) { console.log(`  ${r.lead_ref || r.lead_id} ERROR ${r.error}`); continue; }
    if (r.flagged) console.log(`  ${r.lead_ref || r.lead_id} FLAGGED conf=${r.confidence} :: ${r.reason}`);
  }
})().catch(e => { console.error('[llm-factcheck] fatal (non-blocking):', e.message); process.exit(0); });
