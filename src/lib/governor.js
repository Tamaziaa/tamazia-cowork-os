// P2-1b · QUALIFIED→email-ready GOVERNOR (per-sector round-robin, Tier-1 only)
// -----------------------------------------------------------------------------------------------
// The bottleneck is QUALIFICATION, not sending. Once a lead is Tier-1 (quality_fit=TRUE), the governor
// decides whether it may be released to the email-ready set TODAY. It enforces two things:
//   1. A TOTAL daily cap (default 100 Tier-1 leads/day).
//   2. PER-SECTOR FAIRNESS via round-robin over the 10 priority sectors: a 10x10 grid (10 sectors ×
//      ~10 each) so one big sector (e.g. Hospitality with 1,300 leads) can't eat the whole 100 and
//      starve Legal/Healthcare. The cap resets at 00:00 Europe/London ("resume 00:00 UK" per CLAUDE.md).
//
// Pure-ish + deterministic: the math (allocateRoundRobin) is unit-testable with no DB. releaseToday() does
// the DB read/write. Counting key = `governor_released_at::date` on leads (additive, NULL-safe). SEND is
// untouched — this gates the QUALIFIED output, exactly as the prompt specifies, and send-pacing.js still
// gates the actual send downstream.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return '';
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).toString().trim(); }
  catch (_e) { return ''; }
}
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// The 10 priority sectors (10x10 grid). Loaded from the sector-grid so it stays the single source of truth.
function prioritySectors() {
  try {
    const grid = require(path.join(ROOT, 'config', 'sector-grid.json'));
    const pr = (grid.sectors || []).filter(s => s.is_priority).sort((a, b) => (a.priority_rank || 99) - (b.priority_rank || 99));
    if (pr.length) return pr.map(s => s.code);
  } catch (_e) {}
  return ['LS', 'HC', 'AE', 'DN', 'FS', 'RE', 'HO', 'FB', 'ED', 'PB']; // fallback = the documented top 10
}

const DAILY_TOTAL = () => Number(process.env.GOVERNOR_DAILY_TIER1 || 100);

// Current date in Europe/London (handles BST/GMT) as YYYY-MM-DD, so the "reset 00:00 UK" boundary is correct
// regardless of the server's UTC clock.
function ukToday(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// PURE round-robin allocator. Given a total budget and the per-sector pool of *available* candidates
// (sector_code -> count not yet released today), deal out slots one sector at a time, in priority order,
// skipping exhausted sectors, until the budget is spent or nothing is left. Returns sector_code -> slots.
// 10x10 = with 10 sectors and a budget of 100, a fully-stocked grid yields ~10 each; a thin sector gets
// what it has and its remainder rolls to the next sector (so the daily 100 is still met when supply exists).
function allocateRoundRobin(budget, available, order) {
  const alloc = {};
  const pool = {};
  for (const s of order) { alloc[s] = 0; pool[s] = Math.max(0, Number(available[s] || 0)); }
  let left = Math.max(0, Number(budget) || 0);
  let progressed = true;
  while (left > 0 && progressed) {
    progressed = false;
    for (const s of order) {
      if (left <= 0) break;
      if (pool[s] > 0) { alloc[s]++; pool[s]--; left--; progressed = true; }
    }
  }
  return alloc;
}

// How many Tier-1 leads were already released today (UK day)?
function releasedTodayCount() {
  const r = pg(`SELECT COUNT(*)::int FROM leads WHERE governor_released_at IS NOT NULL AND (governor_released_at AT TIME ZONE 'Europe/London')::date = ${esc(ukToday())}`);
  return r ? Number(r) : 0;
}

// Per-sector counts of Tier-1 leads that are QUALIFIED, have an email, are NOT consent_required, and have
// NOT yet been released today. This is the candidate pool the round-robin deals from.
function availableBySector(order) {
  const inList = order.map(esc).join(',');
  const raw = pg(`
    SELECT COALESCE(sector_code,'?') sc, COUNT(*)::int n
    FROM leads
    WHERE quality_fit = TRUE
      AND COALESCE(lifecycle_stage,'') = 'qualified'
      AND COALESCE(consent_required, FALSE) = FALSE
      AND COALESCE(NULLIF(contact_email,''), email, '') <> ''
      AND governor_released_at IS NULL
      AND COALESCE(sector_code,'?') IN (${inList})
    GROUP BY 1`);
  const out = {};
  for (const line of (raw || '').split('\n').filter(Boolean)) { const [sc, n] = line.split('\t'); out[sc] = Number(n) || 0; }
  return out;
}

// Snapshot for dashboards / dry-run: today's released count, remaining budget, per-sector availability + plan.
function snapshot() {
  const order = prioritySectors();
  const total = DAILY_TOTAL();
  const released = releasedTodayCount();
  const remaining = Math.max(0, total - released);
  const available = availableBySector(order);
  const plan = allocateRoundRobin(remaining, available, order);
  return { uk_day: ukToday(), daily_total: total, released_today: released, remaining, available, plan, order };
}

// RELEASE: mark up to `remaining` Tier-1 leads governor_released_at=NOW(), dealt round-robin across sectors.
// Returns { released, by_sector }. Idempotent per day (only un-released leads are eligible).
function releaseToday({ dryRun = false } = {}) {
  const snap = snapshot();
  if (snap.remaining <= 0) return { released: 0, by_sector: {}, reason: 'daily_cap_reached', uk_day: snap.uk_day, daily_total: snap.daily_total };
  const byForSector = {};
  let released = 0;
  for (const sc of snap.order) {
    const want = snap.plan[sc] || 0;
    if (want <= 0) continue;
    if (dryRun) { byForSector[sc] = want; released += want; continue; }
    // Release the `want` oldest-highest-scoring qualified Tier-1 leads in this sector.
    const ids = pg(`
      SELECT id::text FROM leads
      WHERE quality_fit = TRUE AND COALESCE(lifecycle_stage,'')='qualified'
        AND COALESCE(consent_required,FALSE)=FALSE
        AND COALESCE(NULLIF(contact_email,''), email,'') <> ''
        AND governor_released_at IS NULL
        AND COALESCE(sector_code,'?') = ${esc(sc)}
      ORDER BY COALESCE(quality_score,0) DESC, id ASC
      LIMIT ${want}`).split('\n').filter(Boolean);
    if (!ids.length) continue;
    pg(`UPDATE leads SET governor_released_at = NOW() WHERE id IN (${ids.join(',')})`);
    byForSector[sc] = ids.length;
    released += ids.length;
  }
  return { released, by_sector: byForSector, uk_day: snap.uk_day, daily_total: snap.daily_total, remaining_after: Math.max(0, snap.remaining - released) };
}

// May THIS lead be released right now? Used inline by qualify-and-queue when a fresh lead scores Tier-1.
// Respects both the total daily cap AND the per-sector share (a sector at/over its fair allocation waits).
function canReleaseLead({ sector_code } = {}) {
  const order = prioritySectors();
  const total = DAILY_TOTAL();
  const released = releasedTodayCount();
  if (released >= total) return { ok: false, reason: 'daily_cap_reached' };
  const sc = order.includes(sector_code) ? sector_code : null;
  if (!sc) return { ok: false, reason: 'non_priority_sector' };
  // per-sector ceiling for the day = ceil(total / sectors) so no single sector exceeds its fair lane.
  const perSectorCap = Math.ceil(total / order.length);
  const sectorReleased = Number(pg(`SELECT COUNT(*)::int FROM leads WHERE governor_released_at IS NOT NULL AND (governor_released_at AT TIME ZONE 'Europe/London')::date=${esc(ukToday())} AND COALESCE(sector_code,'?')=${esc(sc)}`) || 0);
  if (sectorReleased >= perSectorCap) return { ok: false, reason: 'sector_cap_reached', sector_released: sectorReleased, per_sector_cap: perSectorCap };
  return { ok: true, sector_released: sectorReleased, per_sector_cap: perSectorCap, total_released: released };
}

module.exports = { prioritySectors, allocateRoundRobin, snapshot, releaseToday, canReleaseLead, releasedTodayCount, availableBySector, ukToday, DAILY_TOTAL };

// CLI: `node src/lib/governor.js` prints a snapshot; `--release` releases; `--dry-run` plans only.
if (require.main === module) {
  const arg = process.argv[2] || '--snapshot';
  if (arg === '--release') console.log(JSON.stringify(releaseToday({ dryRun: false }), null, 2));
  else if (arg === '--dry-run') console.log(JSON.stringify(releaseToday({ dryRun: true }), null, 2));
  else console.log(JSON.stringify(snapshot(), null, 2));
}
