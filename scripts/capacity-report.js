#!/usr/bin/env node
'use strict';
// CAPACITY REPORT (read-only) — the single source of truth for "where is the pipeline RIGHT NOW vs full capacity".
// Joins the live Neon funnel (scrape -> tier-1 -> qualified -> governor-released -> audit-verified -> claude_cleared
// -> mystrika_pushed) with the LIVE Mystrika per-campaign send capacity (daily_send_allowed / loaded / sent /
// opportunity) and derives the steady-state maths: how many NEW leads/day the current warmed inbox capacity can
// actually drain, the DB ready-pool depth, and the headroom to top up each campaign today. Writes NOTHING (no DB
// writes, no sends, no Mystrika mutations). Run: `node scripts/capacity-report.js [--json]`.
const { execFileSync } = require('child_process');
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'src', 'lib', 'mystrika', 'client.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const JSON_OUT = process.argv.includes('--json');
function pg(sql) { try { return execFileSync(path.join(__dirname, 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); } catch (_) { return ''; } }
const n = (v) => Number(v || 0);

// Touches per lead and campaign span — used for the steady-state intake maths. A lead receives TOUCHES emails over
// SPAN_DAYS; in steady state daily_sends = new_leads_per_day * TOUCHES, so sustainable intake = capacity / TOUCHES.
const TOUCHES = Math.max(1, parseInt(process.env.CADENCE_TOUCHES || '4', 10));

async function main() {
  if (!NEON) { console.log('No NEON_URL'); return; }
  // ---- 1) The live funnel (one round-trip). icp_tier is smallint (1 = Tier-1).
  const f = pg(`SELECT
      count(*),
      count(*) FILTER (WHERE icp_tier=1),
      count(*) FILTER (WHERE quality_fit),
      count(*) FILTER (WHERE lifecycle_stage='qualified'),
      count(*) FILTER (WHERE lifecycle_stage='pending_approval'),
      count(*) FILTER (WHERE governor_released_at IS NOT NULL),
      count(*) FILTER (WHERE COALESCE(audit_verified,FALSE)),
      count(*) FILTER (WHERE COALESCE(claude_cleared,FALSE)),
      count(*) FILTER (WHERE COALESCE(mystrika_pushed,FALSE)),
      count(*) FILTER (WHERE COALESCE(claude_cleared,FALSE) AND COALESCE(audit_verified,FALSE) AND NOT COALESCE(mystrika_pushed,FALSE))
    FROM leads`).split('\t').map(n);
  const [total, tier1, qfit, qualified, pending, released, auditV, cleared, pushed, readyPool] = f;
  // ready-by-sector (the DB drain pool: cleared + audit-verified + not pushed) keyed to the sector campaigns
  const bySector = {};
  for (const ln of pg(`SELECT COALESCE(NULLIF(sector,''),NULLIF(sector_code,''),'(none)'), count(*)
      FROM leads WHERE COALESCE(claude_cleared,FALSE) AND COALESCE(audit_verified,FALSE) AND NOT COALESCE(mystrika_pushed,FALSE)
      GROUP BY 1 ORDER BY 2 DESC`).split('\n').filter(Boolean)) { const [s, c] = ln.split('\t'); bySector[s] = n(c); }

  // ---- 2) Live Mystrika capacity per campaign (read-only summary calls)
  const camps = [];
  let capDailyTotal = 0, loadedTotal = 0, oppTotal = 0, sentTodayTotal = 0;
  try {
    const cl = await M.listCampaigns();
    const arr = (cl.data && (cl.data.data || cl.data.campaigns)) || cl.data || [];
    for (const c of (Array.isArray(arr) ? arr : [])) {
      const cid = c.id || c.campaign_id; if (!cid) continue;
      let d = {};
      try { const s = await M.campaignSummary(cid); d = (s && s.data && s.data.data) || {}; } catch (_) {}
      const row = { name: c.name || cid, daily_allowed: n(d.daily_send_allowed), daily_sent: n(d.daily_send_count), loaded: n(d.total_lead_contact_count), total_sent: n(d.total_send_count), opportunity: n(d.opportunity) };
      row.send_headroom_today = Math.max(0, row.daily_allowed - row.daily_sent);
      row.hold_room = Math.max(0, row.opportunity - row.loaded);
      camps.push(row);
      capDailyTotal += row.daily_allowed; loadedTotal += row.loaded; oppTotal += row.opportunity; sentTodayTotal += row.daily_sent;
    }
  } catch (_) {}

  // ---- 3) Steady-state maths
  const sustainableIntakePerDay = Math.floor(capDailyTotal / TOUCHES);      // new leads/day the current cap can drain
  const out = {
    as_of_utc: pg(`SELECT now() AT TIME ZONE 'UTC'`),
    funnel: { total, tier1, quality_fit: qfit, qualified, pending_approval: pending, governor_released: released, audit_verified: auditV, claude_cleared: cleared, mystrika_pushed: pushed, db_ready_pool: readyPool },
    ready_pool_by_sector: bySector,
    mystrika: { campaigns: camps.length, daily_send_capacity_total: capDailyTotal, sent_today_total: sentTodayTotal, loaded_total: loadedTotal, opportunity_total: oppTotal, per_campaign: camps },
    maths: {
      touches_per_lead: TOUCHES,
      sustainable_new_leads_per_day_now: sustainableIntakePerDay,
      note: 'sustainable_intake = total daily_send_allowed / touches_per_lead. Rises automatically as inbox warmup lifts daily_send_allowed.',
    },
  };
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }

  const bar = '────────────────────────────────────────────────────────';
  console.log('\nTAMAZIA CAPACITY REPORT  (' + out.as_of_utc + ' UTC)  — read-only, SEND OFF\n' + bar);
  console.log('FUNNEL (live Neon):');
  console.log('  sourced/total ......... ' + total);
  console.log('  Tier-1 (icp_tier=1) ... ' + tier1 + '   quality_fit ' + qfit);
  console.log('  qualified ............. ' + qualified + '   pending_approval ' + pending + '  (Tier-2 awaiting approval/LLM-rescue)');
  console.log('  governor-released ..... ' + released);
  console.log('  audit-verified ........ ' + auditV);
  console.log('  claude_cleared ........ ' + cleared + '   (Layer-3 gate)');
  console.log('  mystrika_pushed ....... ' + pushed);
  console.log('  DB READY-POOL ......... ' + readyPool + '   (cleared + audit-verified + not pushed = the drain queue)');
  console.log(bar);
  console.log('MYSTRIKA CAPACITY (live API): ' + camps.length + ' campaigns');
  console.log('  total daily send capacity (now, warming) .. ' + capDailyTotal + '/day   sent today ' + sentTodayTotal);
  console.log('  prospects loaded .......................... ' + loadedTotal + ' / ' + oppTotal + ' opportunity slots');
  for (const c of camps.sort((a, b) => b.daily_allowed - a.daily_allowed)) {
    console.log('    ' + String(c.name).padEnd(34) + ' cap ' + String(c.daily_allowed).padStart(4) + '/day  loaded ' + String(c.loaded).padStart(5) + '  send-headroom-today ' + c.send_headroom_today);
  }
  console.log(bar);
  console.log('STEADY-STATE MATHS:');
  console.log('  touches per lead .......................... ' + TOUCHES);
  console.log('  sustainable NEW leads/day at current cap .. ' + sustainableIntakePerDay + '/day');
  console.log('  (= ' + capDailyTotal + ' daily-send-cap / ' + TOUCHES + ' touches; auto-scales as inboxes warm)');
  console.log(bar + '\n');
}
main().catch(e => { console.error('capacity-report error (non-fatal):', e.message); process.exit(0); });
