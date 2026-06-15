#!/usr/bin/env node
'use strict';
// EVAL / PROOF harness for the LLM-RESCUE worker (small, £0, read-mostly). Demonstrates the generation-first loop
// end-to-end on a SMALL sample of the real "missing-only-LinkedIn" cohort: form the SERP query -> read result
// TITLES + URL slugs (linkedin.com never fetched) -> the free LLM disambiguates -> write qa_found -> re-run the
// CANONICAL deterministic gate (decideTier over tierInputsFromPersisted) -> show the before/after tier + the
// measured £0 cost. DRY by default (prints what it WOULD write); pass --write to persist qa_* on the tiny sample.
//
// This is the founder-facing proof that the LLM LIFTS leads toward Tier-1 by finding a missing PUBLIC signal,
// without relaxing the gate (the gate keeps the final say) and without ever touching icp_tier.
//
// Usage: LLM_QA_ENABLED=1 node scripts/eval-llm-rescue.js [--n 12] [--sectors LS,DN,HC,FS,RE,AE] [--write]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const rescue = require(path.join(ROOT, 'src', 'lib', 'llm-rescue.js'));
const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));
const pg = (s) => execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', s], { encoding: 'utf8', maxBuffer: 2e8 }).toString();
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');

(async () => {
  if (!rescue.isEnabled()) { console.log('[eval] LLM_QA_ENABLED is off — set LLM_QA_ENABLED=1 to run the eval.'); return; }
  const n = parseInt(arg('n', '12'), 10);
  const sectors = (arg('sectors', 'LS,DN,HC,FS,RE,AE')).split(',').map(s => `'${s.trim()}'`).join(',');
  // pull the missing-LinkedIn cohort (checking BOTH contact_linkedin and all_socials), then keep only the ones the
  // PERSISTED gate flips to Tier-1 on LinkedIn alone — so the eval demonstrates genuine, gate-verified lifts.
  const sql = `SELECT to_jsonb(l) FROM leads l
    WHERE icp_tier=2 AND COALESCE(quality_score,0) >= ${lq.TIER1_MIN} AND sector_code IN (${sectors})
      AND COALESCE(contact_name,'') <> '' AND COALESCE(NULLIF(contact_email,''), primary_email, '') <> ''
      AND COALESCE(contact_linkedin,'') = '' AND COALESCE(all_socials->'linkedin'->>'url', all_socials->>'linkedin','') = ''
      AND COALESCE(consent_required,FALSE)=FALSE AND COALESCE(domain,'') <> ''
      AND COALESCE(deliverability,verify_status,'pending') NOT IN ('bad','invalid')
    ORDER BY quality_score DESC, id DESC LIMIT ${n * 12}`;
  const all = pg(sql).split('\n').filter(Boolean).map(s => JSON.parse(s));
  const sample = [];
  for (const l of all) {
    if (sample.length >= n) break;
    const before = lq.decideTier(await lq.tierInputsFromPersisted(l));
    const probe = JSON.parse(JSON.stringify(l)); probe.all_socials = Object.assign({}, probe.all_socials || {}, { linkedin: { url: 'probe' } });
    const after = lq.decideTier(await lq.tierInputsFromPersisted(probe));
    if (before.tier !== 1 && after.tier === 1) sample.push(l);
  }
  console.log(`[eval] flip-eligible sample: ${sample.length} leads (missing only LinkedIn, gate flips on it).${WRITE ? ' WRITING qa_* on this sample.' : ' DRY (no writes).'}`);
  console.log('lead_ref     | company                     | DM (stored)          | found LinkedIn (SERP titles/slugs)      | conf | base->after | verdict');
  console.log('-'.repeat(160));
  let cost = 0, found = 0, auto = 0, human = 0, explained = 0;
  for (const l of sample) {
    const res = await rescue.rescueLead(l, 'missing_linkedin');
    cost += res.cost_usd_micro || 0;
    if (res.found.linkedin_url) found++;
    if (res.review_status === 'auto_promote') auto++; else if (res.review_status === 'unreviewed') human++; else if (res.qa_status === 'explained') explained++;
    if (WRITE) rescue.writeRescue(res, { dry: false });
    console.log(`${(l.lead_ref || '').padEnd(12)} | ${String(l.company).slice(0, 27).padEnd(27)} | ${String(l.contact_name || '').slice(0, 20).padEnd(20)} | ${String(res.found.linkedin_url || '(none)').slice(0, 39).padEnd(39)} | ${String(res.confidence).padStart(4)} | T${res.base_tier}->T${res.after_tier}       | ${res.review_status || res.qa_status}`);
  }
  console.log('-'.repeat(160));
  console.log(`\nTOTALS/${sample.length}: LinkedIn FOUND ${found} · auto-promote ${auto} · human-review ${human} · explained ${explained}`);
  console.log(`MEASURED LLM COST: $${(cost / 1e6).toFixed(6)} (micro-USD ${cost}) — free models (Cloudflare/Groq/Gemini), so £0.`);
  console.log('NOTE: icp_tier is NEVER written by rescue — promotion is decided later by apply-review re-running the gate, or a human Accept.');
})().catch(e => { console.error('[eval] error:', e.message); process.exit(1); });
