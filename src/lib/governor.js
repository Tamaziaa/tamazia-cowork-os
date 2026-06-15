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

// R3 FIX — UNSECTORED LANE. The release sweep used to deal slots ONLY to the priority sectors, so a Tier-1 lead
// with a NULL (or non-priority) sector_code could NEVER be released — and since the push gate (P6) hard-requires
// governor_released_at IS NOT NULL, those leads could never be pushed either (a permanent leak; pre-fix push
// ignored the governor, so they shipped). Live: 21 of the 614 Tier-1 (the qualified-fit pool) have NULL
// sector_code. This sentinel adds a dedicated "unsectored" lane to the round-robin so those leads get a fair
// share of the daily cap and can reach the email-ready set. The sentinel is NOT a real sector_code (double
// underscores) so it can never collide with a grid code; releaseToday() maps it to the SQL predicate
// "sector_code IS NULL OR sector_code NOT IN (priority)". Appended LAST so the priority sectors keep first claim.
const UNSECTORED_LANE = '__UNSECTORED__';

// The full release order = the priority sectors PLUS the unsectored lane. This is what the round-robin deals over
// and what availableBySector()/releaseToday() iterate, so no qualified Tier-1 lead is structurally unreachable.
function releaseOrder() { return [...prioritySectors(), UNSECTORED_LANE]; }

const DAILY_TOTAL = () => Number(process.env.GOVERNOR_DAILY_TIER1 || 100);

// T1-B01 — STRUCTURAL "never-pushable" exclusions, applied at RELEASE time so the daily cap is not spent on a
// lead the push (push-to-mystrika.js) will silently drop. CRITICAL ORDER NOTE: the engine cycle runs
// governor-release BEFORE enqueue->mint->verify-audits->render, so a lead is NOT yet audit-verified or drafted
// when it is released — requiring audit_verified/draft here would DEADLOCK (a lead can never become verified
// without first being released to be minted). So we DO NOT gate on those. We DO gate on the exclusions that are
// fully knowable at release time and never depend on the downstream mint/render: a replier, a lead whose own
// status is suppressed/dnc/bounced/duplicate, a confirmed-bad deliverability verdict, an excluded lead_type, and
// the canonical opt-out (suppression) registry. These mirror the push's WHERE clause exactly, so releasing a lead
// that clears them means the cap is spent only on leads that CAN ship once the audit/draft catch up. Throughput
// of the audit/draft tail itself is the separate 2,000/day mint pipeline (NOT in this base) — documented, not
// gated here. SQL fragment shared by availableBySector + releaseToday (alias-free, valid in either context).
const SEND_SAFE_SQL = `
      AND COALESCE(replied,FALSE)=FALSE
      AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced','duplicate')
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(NULLIF(deliverability,''), verify_status, '') NOT IN ('bad','invalid','undeliverable','no_mx','nxdomain','disposable')
      AND NOT EXISTS (SELECT 1 FROM suppression sup WHERE lower(sup.email) = lower(COALESCE(NULLIF(primary_email,''), NULLIF(contact_email,''), email)) AND (sup.expires_at IS NULL OR sup.expires_at > NOW()))`;

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

// Per-lane counts of Tier-1 leads that are QUALIFIED, have an email, are NOT consent_required, and have NOT yet
// been released today. This is the candidate pool the round-robin deals from. `order` is the FULL release order
// (priority sectors + the UNSECTORED lane). A lead lands in its priority sector_code bucket; any lead whose
// sector_code is NULL or not a priority code is bucketed into UNSECTORED_LANE (R3 — so it can never be stranded).
function availableBySector(order) {
  const priority = order.filter(s => s !== UNSECTORED_LANE);
  const inList = priority.map(esc).join(',');
  // CASE maps each candidate to its lane: a priority sector_code -> that code; anything else (NULL or
  // non-priority) -> the unsectored sentinel. Counting on the lane key keeps the round-robin allocation correct.
  const raw = pg(`
    SELECT CASE WHEN COALESCE(sector_code,'') IN (${inList}) THEN sector_code ELSE ${esc(UNSECTORED_LANE)} END AS lane, COUNT(*)::int n
    FROM leads
    WHERE quality_fit = TRUE
      AND COALESCE(lifecycle_stage,'') = 'qualified'
      AND COALESCE(consent_required, FALSE) = FALSE
      AND COALESCE(NULLIF(contact_email,''), email, '') <> ''
      AND governor_released_at IS NULL${SEND_SAFE_SQL}
    GROUP BY 1`);
  const out = {};
  for (const line of (raw || '').split('\n').filter(Boolean)) { const [lane, n] = line.split('\t'); out[lane] = Number(n) || 0; }
  return out;
}

// T1-B01 VISIBILITY — released-vs-actually-pushable. The governor releases on what is knowable at release time
// (quality + send-safety), but the push ALSO requires audit_verified + audit_url + a rendered Touch-0 draft, which
// are produced by the DOWNSTREAM mint/verify/render steps AFTER release. This reports, over all released leads,
// how many are actually push-eligible right now (and the gap), so the throughput lag of that tail is never silent
// — without ever gating release on it (which would deadlock). The gap shrinks as mint/render catch up; a large
// persistent gap means the mint/render tail (the separate 2,000/day mint pipeline) is the bottleneck, not release.
function pushReadiness() {
  const r = pg(`
    SELECT
      COUNT(*) FILTER (WHERE governor_released_at IS NOT NULL)::int AS released,
      COUNT(*) FILTER (WHERE governor_released_at IS NOT NULL AND COALESCE(audit_verified,FALSE)=TRUE AND COALESCE(audit_url,'')<>'')::int AS released_audit_verified,
      COUNT(*) FILTER (WHERE governor_released_at IS NOT NULL AND COALESCE(audit_verified,FALSE)=TRUE AND COALESCE(audit_url,'')<>''
        AND EXISTS (SELECT 1 FROM outreach_drafts od WHERE od.lead_id=leads.id AND od.channel='email' AND od.draft_metadata->>'touch'='0' AND COALESCE(od.draft_body,'')<>''))::int AS released_pushable
    FROM leads`);
  const [released, releasedAuditVerified, releasedPushable] = String(r || '0\t0\t0').split('\t').map(n => Number(n) || 0);
  return { released, released_audit_verified: releasedAuditVerified, released_pushable: releasedPushable, awaiting_audit_or_draft: Math.max(0, released - releasedPushable) };
}

// Snapshot for dashboards / dry-run: today's released count, remaining budget, per-sector availability + plan,
// plus the released-vs-pushable readiness (T1-B01). `order` is the FULL release order (priority sectors + the
// UNSECTORED lane) so the plan can never strand a lead.
function snapshot() {
  const order = releaseOrder();
  const total = DAILY_TOTAL();
  const released = releasedTodayCount();
  const remaining = Math.max(0, total - released);
  const available = availableBySector(order);
  const plan = allocateRoundRobin(remaining, available, order);
  return { uk_day: ukToday(), daily_total: total, released_today: released, remaining, available, plan, order, push_readiness: pushReadiness() };
}

// RELEASE: mark up to `remaining` Tier-1 leads governor_released_at=NOW(), dealt round-robin across sectors.
// Returns { released, by_sector }. Idempotent per day (only un-released leads are eligible).
function releaseToday({ dryRun = false } = {}) {
  const snap = snapshot();
  if (snap.remaining <= 0) return { released: 0, by_sector: {}, reason: 'daily_cap_reached', uk_day: snap.uk_day, daily_total: snap.daily_total };
  const byForSector = {};
  let released = 0;
  const priority = snap.order.filter(s => s !== UNSECTORED_LANE);
  const priorityInList = priority.map(esc).join(',');
  for (const sc of snap.order) {
    const want = snap.plan[sc] || 0;
    if (want <= 0) continue;
    if (dryRun) { byForSector[sc] = want; released += want; continue; }
    // The lane predicate: a real priority sector matches its own code; the UNSECTORED lane matches every lead
    // whose sector_code is NULL or not a priority code (R3 — these are otherwise unreachable by the sweep/push).
    const laneClause = sc === UNSECTORED_LANE
      ? `(sector_code IS NULL OR COALESCE(sector_code,'') NOT IN (${priorityInList}))`
      : `COALESCE(sector_code,'?') = ${esc(sc)}`;
    // Release the `want` oldest-highest-scoring qualified Tier-1 leads in this lane.
    const ids = pg(`
      SELECT id::text FROM leads
      WHERE quality_fit = TRUE AND COALESCE(lifecycle_stage,'')='qualified'
        AND COALESCE(consent_required,FALSE)=FALSE
        AND COALESCE(NULLIF(contact_email,''), email,'') <> ''
        AND governor_released_at IS NULL${SEND_SAFE_SQL}
        AND ${laneClause}
      ORDER BY COALESCE(quality_score,0) DESC, id ASC
      LIMIT ${want}`).split('\n').filter(Boolean);
    if (!ids.length) continue;
    pg(`UPDATE leads SET governor_released_at = NOW() WHERE id IN (${ids.join(',')})`);
    byForSector[sc] = ids.length;
    released += ids.length;
  }
  // T1-B01: surface the released-vs-actually-pushable gap after the sweep so the downstream mint/render lag is
  // visible (release is NOT gated on it — that would deadlock; see SEND_SAFE_SQL / pushReadiness notes).
  const readiness = dryRun ? null : pushReadiness();
  if (readiness) console.log(`[governor] push-readiness: ${readiness.released_pushable}/${readiness.released} released leads are push-eligible now (audit-verified + Touch-0 draft); ${readiness.awaiting_audit_or_draft} awaiting mint/render`);
  // R5 ANNOTATION: the cockpit/MCP `email_ready` mirrors the push gate (governor_released_at IS NOT NULL), so it
  // reads the TRUE push-eligible set — which is 0 until the governor releases, NOT a fault. Make that explicit in
  // the log so an operator never reads a low/zero email_ready as a break (the old higher number was the lie).
  if (readiness && readiness.released_pushable === 0) console.log(`[governor] note: email_ready reflects the REAL push-eligible set (governor-released + audit-verified + draft). ${readiness.released === 0 ? '0 because nothing is released yet' : readiness.released + ' released but none minted/drafted yet'} — expected, not a fault.`);
  return { released, by_sector: byForSector, uk_day: snap.uk_day, daily_total: snap.daily_total, remaining_after: Math.max(0, snap.remaining - released), push_readiness: readiness };
}

// May THIS lead be released right now? Used inline by qualify-and-queue when a fresh lead scores Tier-1.
// Respects both the total daily cap AND the per-lane share (a lane at/over its fair allocation waits). R3: a
// NULL/non-priority-sector lead is no longer rejected outright — it is mapped to the UNSECTORED lane and capped
// the same way, so a freshly-qualified unsectored Tier-1 can release inline instead of being stranded.
function canReleaseLead({ sector_code } = {}) {
  const order = releaseOrder();
  const priority = order.filter(s => s !== UNSECTORED_LANE);
  const total = DAILY_TOTAL();
  const released = releasedTodayCount();
  if (released >= total) return { ok: false, reason: 'daily_cap_reached' };
  // Map the lead to its lane: a priority code -> itself; NULL or non-priority -> the UNSECTORED lane.
  const lane = priority.includes(sector_code) ? sector_code : UNSECTORED_LANE;
  // per-lane ceiling for the day = ceil(total / lanes) so no single lane exceeds its fair share.
  const perSectorCap = Math.ceil(total / order.length);
  // Count today's releases in THIS lane. The unsectored lane counts every released lead whose sector_code is
  // NULL or not a priority code; a real sector counts only its own code.
  const priorityInList = priority.map(esc).join(',');
  const laneClause = lane === UNSECTORED_LANE
    ? `(sector_code IS NULL OR COALESCE(sector_code,'') NOT IN (${priorityInList}))`
    : `COALESCE(sector_code,'?')=${esc(lane)}`;
  const sectorReleased = Number(pg(`SELECT COUNT(*)::int FROM leads WHERE governor_released_at IS NOT NULL AND (governor_released_at AT TIME ZONE 'Europe/London')::date=${esc(ukToday())} AND ${laneClause}`) || 0);
  if (sectorReleased >= perSectorCap) return { ok: false, reason: 'sector_cap_reached', lane, sector_released: sectorReleased, per_sector_cap: perSectorCap };
  return { ok: true, lane, sector_released: sectorReleased, per_sector_cap: perSectorCap, total_released: released };
}

module.exports = { prioritySectors, releaseOrder, allocateRoundRobin, snapshot, releaseToday, canReleaseLead, releasedTodayCount, availableBySector, pushReadiness, ukToday, DAILY_TOTAL, UNSECTORED_LANE };

// CLI: `node src/lib/governor.js` prints a snapshot; `--release` releases; `--dry-run` plans only.
if (require.main === module) {
  const arg = process.argv[2] || '--snapshot';
  if (arg === '--release') console.log(JSON.stringify(releaseToday({ dryRun: false }), null, 2));
  else if (arg === '--dry-run') console.log(JSON.stringify(releaseToday({ dryRun: true }), null, 2));
  else console.log(JSON.stringify(snapshot(), null, 2));
}
