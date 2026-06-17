#!/usr/bin/env node
'use strict';
// Thin CLI for the LLM-RESCUE generation worker (src/lib/llm-rescue.js). Cost-capped, free-model-first, gated on
// the LLM_QA_ENABLED kill switch (default OFF). Writes ADVISORY qa_* columns only — never icp_tier/send state.
// Usage:
//   LLM_QA_ENABLED=1 node scripts/run-llm-rescue.js --max 15 [--cohort missing_linkedin] [--dry] [--force] [--run-cost-cap-micro N]
//   (no env / LLM_QA_ENABLED unset -> prints the kill-switch notice and exits 0, so a cycle step is a safe no-op)
//   (--run-cost-cap-micro = optional per-run cost ceiling in micro-USD, on top of the agency daily budget; the old
//    --token-cap flag was phantom and has been removed.)
//
// D3.3 ADDITIONS:
//   CLAUDE_CODE_OAUTH_TOKEN check: if the Anthropic/Haiku fallback is needed but the token is absent, this
//   script logs a clear warning and continues — free models (Cloudflare/Groq/Gemini) are tried first, so
//   the wave still runs without the token, just without the paid Haiku fallback tier.
//   Rate-limit protection: --max is capped at MAX_LLM_CALLS_PER_RUN (default 250) so a single run can
//   never exceed the cost-protection ceiling regardless of what is passed on the CLI. The hard COST
//   guard is independent of this lead cap: the per-run budget early-exit (LLM_QA_RUN_COST_CAP_MICRO)
//   + the agency daily LLM budget stop the wave the instant spend is hit, and free-first routing
//   (Cloudflare->Groq->Gemini) returns $0 on the common path, so widening the lead cap raises drain
//   throughput WITHOUT raising the cost ceiling — a quota spike still cannot bill past the cost cap.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const rescue = require(path.join(ROOT, 'src', 'lib', 'llm-rescue.js'));

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);

// D3.3: hard ceiling on LLM calls per run (rate-limit / throughput cap). Env-tunable; default 250.
// Raised 100 -> 250 to drain the ~8.6k un-checked Tier-2 backlog continuously across the 4 daily waves.
// This is a LEAD throughput cap, NOT the cost guard: the real spend ceiling is the per-run cost early-exit
// (LLM_QA_RUN_COST_CAP_MICRO) + the agency daily LLM budget (LLM_QA_DAILY_CAP_MICRO), both enforced inside
// runWave(). Free-first routing returns $0 on the common path, so a wider lead cap lifts drain rate while
// the cost cap still hard-stops the wave the instant any paid spend reaches the ceiling (quota-spike safe).
const MAX_LLM_CALLS_PER_RUN = Math.max(1, parseInt(process.env.LLM_QA_MAX_CALLS_PER_RUN || '250', 10));

// D3.3: CLAUDE_CODE_OAUTH_TOKEN check. Free models run without it; Haiku is the paid fallback only.
// If absent we warn clearly and continue (the wave still runs on Cloudflare/Groq/Gemini at £0).
// If you want Haiku as the paid fallback, add CLAUDE_CODE_OAUTH_TOKEN to the ENV_B64 GitHub secret.
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.warn('[llm-rescue] WARNING: CLAUDE_CODE_OAUTH_TOKEN and ANTHROPIC_API_KEY are both absent.');
  console.warn('[llm-rescue] Haiku fallback (paid) is unavailable. Running on free models only (Cloudflare/Groq/Gemini).');
  console.warn('[llm-rescue] To enable paid fallback: add CLAUDE_CODE_OAUTH_TOKEN to the ENV_B64 GitHub secret.');
}

(async () => {
  const requestedMax = parseInt(arg('max', '15'), 10);
  // Apply the per-run rate-limit cap (D3.3 cost protection). Log if we had to clamp.
  const clampedMax = Math.min(requestedMax, MAX_LLM_CALLS_PER_RUN);
  if (clampedMax < requestedMax) {
    console.log(`[llm-rescue] D3.3 rate-limit: clamped --max ${requestedMax} -> ${clampedMax} (LLM_QA_MAX_CALLS_PER_RUN=${MAX_LLM_CALLS_PER_RUN})`);
  }
  const out = await rescue.runWave({
    max: clampedMax,
    cohort: arg('cohort', null),
    dry: has('dry'),
    force: has('force'),
    recheckHours: parseInt(arg('recheck-hours', '168'), 10),
    runCostCapMicro: parseInt(arg('run-cost-cap-micro', '0'), 10),
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
