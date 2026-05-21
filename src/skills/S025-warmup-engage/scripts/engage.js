#!/usr/bin/env node
// S025 warmup-engage skill (Phase 4 task 4.2.2)
// Picks one warmup_pair, picks two distinct active aliases (alias_from, alias_to),
// schedules a send followed by a jittered reply via warmup_reply_queue.
//
// Output: { from_alias_id, to_alias_id, pair_id, scheduled_reply_at }

const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

function pickAlias(excludeId) {
  const raw = pg(`SELECT id FROM aliases WHERE status IN ('active','warmup_only','live') ${excludeId ? `AND id != ${excludeId}` : ''} ORDER BY RANDOM() LIMIT 1`);
  return raw ? Number(raw) : null;
}

function pickPair() {
  const raw = pg(`SELECT id FROM warmup_pairs WHERE active=TRUE ORDER BY RANDOM() LIMIT 1`);
  return raw ? Number(raw) : null;
}

function engageOne(opts = {}) {
  const fromId = opts.from_alias_id || pickAlias(null);
  const toId   = opts.to_alias_id   || pickAlias(fromId);
  const pairId = opts.pair_id       || pickPair();
  if (!fromId || !toId || !pairId) return { ok: false, reason: 'missing_inputs' };

  // Jitter: 2 to 8 minutes
  const jitter = Math.floor(Math.random() * 360) + 120;
  pg(`INSERT INTO warmup_reply_queue (alias_from_id, alias_to_id, pair_id, scheduled_at, status, jitter_seconds) VALUES (${fromId}, ${toId}, ${pairId}, NOW() + INTERVAL '${jitter} seconds', 'pending', ${jitter})`);
  return { ok: true, from_alias_id: fromId, to_alias_id: toId, pair_id: pairId, jitter_seconds: jitter };
}

if (require.main === module) {
  const out = engageOne();
  console.log(JSON.stringify(out));
}

module.exports = { engageOne, pickAlias, pickPair };
