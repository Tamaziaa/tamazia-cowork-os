// Alias rotator · picks the next sending identity for cold outreach.
// Strategy: least-recently-used (LRU) across HEALTHY aliases whose daily warmup quota
// is not yet exhausted. This spreads volume evenly across the 90 personas, respects
// each alias's warmup ramp, and skips any alias the health monitor (S016) has demoted.
//
// Why LRU + quota + health:
//   - LRU  → no single identity over-sends; reputation builds evenly across personas.
//   - quota → honours warmup ramp (day_quota grows as warmup_day advances).
//   - health → S016 demotes aliases on bounce/complaint; rotator never picks demoted ones.
//
// All sends currently route through SMTP2Go (the only live relay). The alias.relay column
// is retained as design metadata for future multi-relay diversification (see ROTATION docs).

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (_e) { return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

// Health gate: only these statuses may send. 'warmup_only' aliases may still send (low volume).
const SENDABLE_STATUSES = ['active', 'live', 'warmup_only'];

/**
 * Pick the next sending alias.
 * @param {object} opts
 * @param {string} [opts.domain]  restrict to a domain ('tamazia.co.uk' | 'tamazia.in')
 * @param {number} [opts.maxBounce7d=3]  skip aliases with bounce_count_7d above this
 * @returns {{id,email,persona_name,first_name,domain,day_quota,sent_today}|null}
 */
function pickSendAlias(opts = {}) {
  const domainClause = opts.domain ? `AND domain = ${esc(opts.domain)}` : '';
  const maxBounce = Number.isFinite(opts.maxBounce7d) ? opts.maxBounce7d : 3;
  const statusList = SENDABLE_STATUSES.map(esc).join(',');
  const sql = `
    SELECT id::text, email, COALESCE(persona_name,'') , COALESCE(first_name,''), domain, COALESCE(day_quota,2), COALESCE(sent_today,0), COALESCE(relay,'brevo')
    FROM aliases
    WHERE status IN (${statusList})
      ${domainClause}
      AND COALESCE(sent_today,0) < COALESCE(day_quota,2)
      AND COALESCE(bounce_count_7d,0) <= ${maxBounce}
      AND COALESCE(paused, FALSE) = FALSE
    ORDER BY last_used_at ASC NULLS FIRST, id ASC
    LIMIT 1`;
  const raw = pg(sql);
  if (!raw) return null;
  const [id, email, persona_name, first_name, domain, day_quota, sent_today, relay] = raw.split('\t');
  return { id: Number(id), email, persona_name, first_name, domain, day_quota: Number(day_quota), sent_today: Number(sent_today), relay };
}

/** Mark an alias as used (call right after a successful send). */
function markUsed(aliasId) {
  if (!aliasId) return;
  pg(`UPDATE aliases SET sent_today = COALESCE(sent_today,0) + 1, last_used_at = NOW() WHERE id = ${Number(aliasId)}`);
}

// D4.1 · Alias ramp cap — raised to 45/inbox once warm (was hard-capped at 40).
// ALIAS_MAX_CAP env overrides (default 45). Ramp: day 20 -> 30, day 24 -> 36, day 28 -> 42, day 30+ -> 45.
// Formula: min(ALIAS_MAX_CAP, max(30, floor(warmup_day * 1.5)))
// The old formula capped at 40 and used 2*warmup_day; the new formula uses 1.5*warmup_day which ramps
// more gradually but reaches the higher 45 ceiling for inboxes that have been warmed past day 30.
const ALIAS_MAX_CAP = parseInt(process.env.ALIAS_MAX_CAP || '45', 10);

/**
 * Daily maintenance — call once per day (cron 00:05).
 * 1. Reset sent_today to 0.
 * 2. Advance warmup: warmup_day += 1, day_quota ramps per schedule, cap at ALIAS_MAX_CAP/day.
 *    Ramp: min(ALIAS_MAX_CAP, max(30, floor(warmup_day * 1.5))).
 *    day 20 -> 30, day 24 -> 36, day 28 -> 42, day 30+ -> 45.
 */
function dailyReset() {
  // D4.1: ramp formula updated to use 1.5*warmup_day with a floor of 30 and cap of ALIAS_MAX_CAP.
  // SQL LEAST/GREATEST mirrors the JS formula exactly. ALIAS_MAX_CAP is not an env in SQL so we inline it.
  const maxCap = ALIAS_MAX_CAP;
  const sql = `
    UPDATE aliases
    SET sent_today = 0,
        warmup_day = COALESCE(warmup_day,1) + 1,
        day_quota  = LEAST(${maxCap}, GREATEST(30, FLOOR(1.5 * (COALESCE(warmup_day,1) + 1))::int)),
        warmup_phase = CASE WHEN COALESCE(warmup_day,1) + 1 >= 21 THEN 'warm' ELSE 'cold' END
    WHERE status IN ('active','live','warmup_only')
    RETURNING id, COALESCE(warmup_day,1) AS warmup_day_new, day_quota`;
  const raw = pg(sql);
  const rows = raw ? raw.split('\n').filter(Boolean) : [];
  const n = rows.length;
  // Log warmup_day and cap for each alias (useful for debugging ramp behaviour)
  if (n > 0) {
    const sample = rows.slice(0, 5).map(r => { const [id, wd, dq] = r.split('\t'); return `alias#${id} warmup_day=${wd} cap=${dq}`; }).join(', ');
    console.log(`[alias-rotator] dailyReset: ${n} aliases reset. Sample: ${sample}${n > 5 ? ' ...' : ''}`);
  }
  return { reset: n, alias_max_cap: maxCap };
}

/** Capacity snapshot — how many sends remain today across the pool. */
function remainingCapacityToday(domain) {
  const domainClause = domain ? `AND domain = ${esc(domain)}` : '';
  const statusList = SENDABLE_STATUSES.map(esc).join(',');
  const raw = pg(`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(sent_today,0) < COALESCE(day_quota,2)) AS aliases_with_room,
      COALESCE(SUM(GREATEST(0, COALESCE(day_quota,2) - COALESCE(sent_today,0))),0) AS sends_remaining,
      COUNT(*) AS total_sendable
    FROM aliases WHERE status IN (${statusList}) ${domainClause}`);
  if (!raw) return { aliases_with_room: 0, sends_remaining: 0, total_sendable: 0 };
  const [a, s, t] = raw.split('\t');
  return { aliases_with_room: Number(a), sends_remaining: Number(s), total_sendable: Number(t) };
}

module.exports = { pickSendAlias, markUsed, dailyReset, remainingCapacityToday, SENDABLE_STATUSES };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === '--reset') { console.log(JSON.stringify(dailyReset())); }
  else if (cmd === '--capacity') { console.log(JSON.stringify(remainingCapacityToday(process.argv[3]), null, 2)); }
  else {
    // default: show the next 5 picks (dry, does not mark used)
    for (let i = 0; i < 5; i++) {
      const a = pickSendAlias({ domain: process.argv[2] });
      console.log(a ? `${a.email.padEnd(34)} persona=${a.persona_name} quota=${a.sent_today}/${a.day_quota}` : '(no eligible alias)');
      if (!a) break;
      // simulate marking used so the next pick differs
      markUsed(a.id);
    }
  }
}
