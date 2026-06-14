// Phase D — send pacing. Cold sending can never exceed warmup capacity, or the domains burn. Computes a
// daily send budget that RAMPS during warmup (low early, full after day ~14), reads how many were already
// sent today, and gates the next send. Fail-open on reads, fail-CLOSED on the cap (no budget = no send).
'use strict';
const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function sql(query) { const u = NEON(); if (!u) return { ok: false, rows: [] }; try { const host = u.replace(/.*@([^/]+)\/.*/, '$1'); const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': u, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, params: [] }), signal: AbortSignal.timeout(15000) }); if (!r.ok) return { ok: false, rows: [] }; const d = await r.json(); return { ok: true, rows: d.rows || d.results || [] }; } catch (_) { return { ok: false, rows: [] }; } }

// Per-inbox daily cold cap ramps with the warmup day. Conservative, deliverability-first.
function perInboxCap(warmupDay) {
  if (warmupDay == null || warmupDay < 0) return 0;
  if (warmupDay < 3) return 5;
  if (warmupDay < 7) return 10;
  if (warmupDay < 14) return 20;
  if (warmupDay < 21) return 30;
  return 40; // steady-state per warmed inbox
}
// Total daily budget = warmed inboxes × per-inbox cap.
function dailyCap({ inboxes = 0, warmupDay = 0, hardMax = Number(process.env.SEND_DAILY_HARD_MAX || 500) } = {}) {
  return Math.min(hardMax, Math.max(0, Math.floor(inboxes) * perInboxCap(warmupDay)));
}

// Live budget: reads warmed-inbox count + warmup day + today's sends from Neon. Fail-open to a safe default.
async function sendBudget(env = process.env) {
  let inboxes = 0, warmupDay = 0, sentToday = 0;
  const mb = await sql("SELECT COUNT(*)::int c FROM mailbox_pool WHERE COALESCE(status,'')<>'disabled'");
  if (mb.ok && mb.rows[0]) inboxes = Number(mb.rows[0].c) || 0;
  const wd = await sql("SELECT COALESCE(MAX(EXTRACT(DAY FROM (NOW()-started_at))),0)::int d FROM mailbox_pool WHERE started_at IS NOT NULL");
  if (wd.ok && wd.rows[0]) warmupDay = Number(wd.rows[0].d) || 0;
  const st = await sql("SELECT COUNT(*)::int c FROM sends WHERE sent_at::date = CURRENT_DATE");
  if (st.ok && st.rows[0]) sentToday = Number(st.rows[0].c) || 0;
  const cap = dailyCap({ inboxes, warmupDay });
  const remaining = Math.max(0, cap - sentToday);
  return { cap, sent_today: sentToday, remaining, inboxes, warmup_day: warmupDay, can_send: remaining > 0 };
}

// Gate: may we send N more right now? Fail-closed (unknown budget → false).
async function canSend(n = 1, env = process.env) {
  const b = await sendBudget(env);
  return { ok: b.remaining >= n, remaining: b.remaining, cap: b.cap, sent_today: b.sent_today, reason: b.remaining >= n ? '' : 'daily_cap_reached' };
}
module.exports = { perInboxCap, dailyCap, sendBudget, canSend };
