#!/usr/bin/env node
// S048 · Aman action queue (FOUNDATION) · writes/reads the human action queue + compliance trail.
// Phase 15.7.1. The aman_actions table is BOTH the legal/compliance log of every significant
// human action in Cowork AND the live queue of things waiting for Aman. This skill is the
// canonical read/write interface to it:
//   - enqueue : log an action / queue a decision for Aman (status='open')
//   - list    : list open actions (optionally filtered by priority/type)
//   - resolve : mark an action done/dismissed with an outcome (closes the queue item, keeps the trail)
//
// Real and idempotent: enqueue accepts an optional dedupe_key in context; if an OPEN action with
// the same dedupe_key already exists, it is returned instead of duplicated.
//
// CLI:
//   node action-queue.js list
//   node action-queue.js list --priority p0
//   node action-queue.js enqueue --type approve_reply --source slack --priority p1 \
//        --lead-id 123 --context '{"draft_id":456,"reason":"positive reply"}'
//   node action-queue.js resolve --id 7 --outcome approved

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }
function pgNum(v) { if (v == null || v === '') return 'NULL'; const n = Number(v); return Number.isFinite(n) ? String(n) : 'NULL'; }

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  }
  return a;
}

// Enqueue / log an action for Aman. Returns the row id. Idempotent on context.dedupe_key.
function enqueue({ actionType, source = 'cowork', priority = 'normal', leadId = null, outcome = 'pending', context = {} }) {
  if (!actionType) return { ok: false, error: 'missing_action_type' };
  let ctx = context;
  if (typeof ctx === 'string') { try { ctx = JSON.parse(ctx); } catch (_e) { ctx = { note: context }; } }
  const dedupe = ctx && ctx.dedupe_key ? String(ctx.dedupe_key) : null;

  if (dedupe) {
    const existing = pg(`SELECT id::text FROM aman_actions WHERE status='open' AND context->>'dedupe_key' = ${pgEsc(dedupe)} LIMIT 1`);
    if (existing) return { ok: true, idempotent: true, id: Number(existing) };
  }

  const sql = `INSERT INTO aman_actions (action_type, context, source, outcome, status, priority, lead_id)
    VALUES (${pgEsc(actionType)}, ${pgEsc(JSON.stringify(ctx))}::jsonb, ${pgEsc(source)}, ${pgEsc(outcome)}, 'open', ${pgEsc(priority)}, ${leadId ? pgNum(leadId) : 'NULL'})
    RETURNING id::text`;
  const id = pg(sql);
  if (id == null) return { ok: false, error: 'db_unavailable' };
  if (!id) return { ok: false, error: 'insert_failed' };
  return { ok: true, id: Number(id), action_type: actionType, status: 'open', priority };
}

// List open actions (newest first). Optional priority / type filters.
function listOpen({ priority = null, actionType = null, limit = 50 } = {}) {
  const where = [`status='open'`];
  if (priority) where.push(`priority = ${pgEsc(priority)}`);
  if (actionType) where.push(`action_type = ${pgEsc(actionType)}`);
  const sql = `SELECT id::text, action_type, source, priority, COALESCE(outcome,''), COALESCE(lead_id::text,''), performed_at::text, context::text
    FROM aman_actions WHERE ${where.join(' AND ')}
    ORDER BY CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, performed_at DESC
    LIMIT ${Number(limit)}`;
  const raw = pg(sql);
  if (raw == null) return { ok: false, error: 'db_unavailable' };
  const items = raw ? raw.split('\n').filter(Boolean).map(l => {
    const [id, action_type, source, prio, outcome, lead_id, performed_at, ctx] = l.split('\t');
    let context = {}; try { context = JSON.parse(ctx); } catch (_e) {}
    return { id: Number(id), action_type, source, priority: prio, outcome, lead_id: lead_id ? Number(lead_id) : null, performed_at, context };
  }) : [];
  return { ok: true, count: items.length, items };
}

// Resolve an open action: mark done/dismissed, record outcome, keep the audit row.
function resolve({ id, outcome = 'done', status = 'done' }) {
  if (!id) return { ok: false, error: 'missing_id' };
  const sql = `UPDATE aman_actions SET status=${pgEsc(status)}, outcome=${pgEsc(outcome)}, resolved_at=NOW() WHERE id=${pgNum(id)} AND status='open' RETURNING id::text`;
  const r = pg(sql);
  if (r == null) return { ok: false, error: 'db_unavailable' };
  if (!r) return { ok: false, error: 'not_found_or_already_resolved', id: Number(id) };
  return { ok: true, id: Number(r), status, outcome };
}

function run(argv) {
  const args = argv || process.argv.slice(2);
  const cmd = (args[0] && !args[0].startsWith('--')) ? args[0] : 'list';
  const a = parseArgs(args);
  let r;
  if (cmd === 'enqueue') {
    r = enqueue({ actionType: a.type, source: a.source, priority: a.priority, leadId: a['lead-id'], outcome: a.outcome, context: a.context || {} });
  } else if (cmd === 'resolve') {
    r = resolve({ id: a.id, outcome: a.outcome, status: a.status });
  } else {
    r = listOpen({ priority: a.priority || null, actionType: a.type || null, limit: a.limit || 50 });
  }
  console.log(JSON.stringify(r, null, 2));
  return r;
}

if (require.main === module) run();

module.exports = { enqueue, listOpen, resolve, run };
