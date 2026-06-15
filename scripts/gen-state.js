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
  // O5/O6 [A20/X3/A51]: email-ready MIRRORS the real push WHERE clause in scripts/push-to-mystrika.js (the gate
  // that decides what is actually sendable), NOT a looser touch_%_queued + pending-draft proxy (which reported 32
  // vs the true 25). Kept verbatim in sync with the MCP's Q_EMAIL_READY. Catch-all stays STRICT (founder policy).
  const emailReady = one(`SELECT COUNT(*) FROM leads l WHERE l.quality_fit=TRUE AND COALESCE(l.lifecycle_stage,'')='qualified' AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal') AND COALESCE(l.audit_verified,FALSE)=TRUE AND COALESCE(l.audit_url,'')<>'' AND COALESCE(l.contact_email,l.email,'')<>'' AND COALESCE(l.mystrika_pushed,FALSE)=FALSE AND COALESCE(NULLIF(l.deliverability,''),l.verify_status,'') NOT IN ('bad','invalid','undeliverable','no_mx','nxdomain','disposable') AND COALESCE(l.replied,FALSE)=FALSE AND COALESCE(l.status,'') NOT IN ('suppressed','dnc','bounced','duplicate') AND l.governor_released_at IS NOT NULL`);
  // P2/P4 [A21/X10]: exclude the warmup pool (sends.lead_id NULL) from "sent" — only attributed lead-directed sends count.
  const sent = one(`SELECT COUNT(*) FROM sends WHERE lead_id IS NOT NULL`);
  // P4 [A33/A40]: standardise on matched_lead_id; exclude STOP/opt-out + bounce inbound (suppression/deliverability, not replies).
  const replied = one(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL AND COALESCE(stop_keyword_detected,FALSE)=FALSE AND COALESCE(bounce_detected,FALSE)=FALSE`);
  // P4 [X21]: only count bookings that still stand (exclude cancelled/rejected/no-show).
  const booked = one(`SELECT COUNT(*) FROM cal_bookings WHERE COALESCE(status,'') NOT IN ('cancelled','canceled','rejected','declined','no_show','no-show')`);
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
  // Also persist the digest to Neon so it is always readable without a repo push (branch-safe, survives a failed git push).
  try {
    const esc = s => `'${String(s).replace(/'/g, "''")}'`;
    pg(`INSERT INTO system_state (key,value,updated_at) VALUES ('pipeline_state_md',${esc(out)},now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`);
  } catch (_e) {}
  console.log(`[gen-state] wrote docs/PIPELINE-STATE.md + Neon system_state.pipeline_state_md (${out.length} bytes, health ${v(health)}%)`);
}

main();
