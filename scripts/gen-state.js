#!/usr/bin/env node
// Tamazia state generator · writes docs/PIPELINE-STATE.md (under 8KB): the funnel counts, the last run
// of each engine (from engine_runs), and open health flags (from system_health). The control file
// Tamazia-Remix/STATE.md links here for live numbers. Regenerated post-merge to main + daily by
// .github/workflows/gen-state.yml. Reuses scripts/psql + NEON_URL, same as intel-pulse.js. Fail-open:
// any query that fails renders as "?" and never aborts the file.
//
//   node scripts/gen-state.js

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV = {};
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
const NEON = ENV.NEON_URL || process.env.NEON_URL;
function pg(sql) { if (!NEON) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function one(sql) { const r = pg(sql); return r == null || r === '' ? null : r.split('\n')[0]; }
function many(sql) { const r = pg(sql); return r ? r.split('\n').filter(Boolean) : []; }
const v = x => x == null ? '?' : x;

function main() {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const leads = one(`SELECT COUNT(*) FROM leads`);
  const scored = one(`SELECT COUNT(*) FROM leads WHERE quality_score IS NOT NULL`);
  const qualified = one(`SELECT COUNT(*) FROM leads WHERE lifecycle_stage='qualified'`);
  const fit = one(`SELECT COUNT(*) FROM leads WHERE COALESCE(quality_fit,FALSE)=TRUE`);
  const emailReady = one(`SELECT COUNT(*) FROM leads l WHERE l.status LIKE 'touch_%_queued' AND COALESCE(NULLIF(l.email,''),l.contact_email,'')<>'' AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%' AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal') AND EXISTS (SELECT 1 FROM outreach_drafts od WHERE od.lead_id=l.id AND od.send_status='pending' AND od.channel='email')`);
  const sent = one(`SELECT COUNT(*) FROM sends`);
  const replied = one(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL`);
  const booked = one(`SELECT COUNT(*) FROM cal_bookings`);
  const health = one(`SELECT metric FROM system_health WHERE check_key='_overall'`);
  const engines = many(`SELECT job||'~~'||to_char(MAX(COALESCE(finished_at,started_at)),'YYYY-MM-DD HH24:MI')||'~~'||COALESCE((array_agg(status ORDER BY started_at DESC))[1],'?') FROM engine_runs GROUP BY job ORDER BY MAX(COALESCE(finished_at,started_at)) DESC`);
  const flags = many(`SELECT check_key||' — '||COALESCE(detail,'') FROM system_health WHERE status='fail' AND check_key<>'_overall' ORDER BY check_key`);

  const L = [];
  L.push('# PIPELINE-STATE.md (auto-generated)', '');
  L.push('> Live Neon snapshot, regenerated post-merge to main + daily by `.github/workflows/gen-state.yml`. Do not edit by hand. `Tamazia-Remix/STATE.md` links here for live numbers.', '');
  L.push(`**Generated:** ${now} · **Health:** ${v(health)}%`, '');
  L.push('## Funnel', '', '| Stage | Count |', '|---|---|');
  L.push(`| Sourced (leads) | ${v(leads)} |`);
  L.push(`| Quality-scored | ${v(scored)} |`);
  L.push(`| Qualified | ${v(qualified)} |`);
  L.push(`| FIT | ${v(fit)} |`);
  L.push(`| Email-ready (Tier 1) | ${v(emailReady)} |`);
  L.push(`| Sent | ${v(sent)} |`);
  L.push(`| Replied (matched) | ${v(replied)} |`);
  L.push(`| Booked | ${v(booked)} |`);
  L.push('', '## Engines (last run)', '');
  if (engines.length) { L.push('| Job | Last run (UTC) | Status |', '|---|---|---|'); for (const e of engines) { const [j, t, s] = e.split('~~'); L.push(`| ${j} | ${t || '?'} | ${s || '?'} |`); } }
  else L.push('_No engine_runs rows yet (heartbeats begin on the next cycle)._');
  L.push('', '## Open flags (health fails)', '');
  if (flags.length) for (const f of flags) L.push(`- ${f}`); else L.push('- none');
  L.push('');

  let out = L.join('\n');
  if (out.length > 8000) out = out.slice(0, 8000) + '\n...(truncated)\n';
  const dir = path.join(ROOT, 'docs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_e) {}
  fs.writeFileSync(path.join(dir, 'PIPELINE-STATE.md'), out);
  console.log(`[gen-state] wrote docs/PIPELINE-STATE.md (${out.length} bytes, health ${v(health)}%)`);
}

main();
