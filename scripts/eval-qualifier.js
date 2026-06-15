#!/usr/bin/env node
// P2-2 · Qualifier eval gate. Runs the CURRENT scorer's tier DECISION (lead-quality.decideTier) over the
// hand-labelled eval set (eval/qualifier.json) and reports tier-agreement vs the expected labels. EXIT 1 when
// agreement is below the fixture's threshold_pct (default 90), so the CI gate (.github/workflows/eval-qualifier.yml)
// BLOCKS merge on a qualifier regression.
//
// Why decideTier and not the full scoreLead: scoreLead re-FETCHES each lead's live site and re-derives every
// signal, so its output is non-deterministic (network + site drift) and cannot be checked against static labels.
// decideTier is the PURE tier-decision seam extracted from scoreLead (byte-identical logic); feeding it the
// fixture's captured signals tests the qualifier's decision deterministically and offline — a stable CI gate.
// A separate `--live` mode runs the full scoreLead for spot-checking (network, never gates). Usage:
//   node scripts/eval-qualifier.js             # deterministic, gate on threshold
//   node scripts/eval-qualifier.js --report    # print the full per-lead table, never exit non-zero
//   node scripts/eval-qualifier.js --live      # run full scoreLead live (spot-check, never gates)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));

const REPORT = process.argv.includes('--report');
const LIVE = process.argv.includes('--live');
const FIXTURE = path.join(ROOT, 'eval', 'qualifier.json');
const tierNum = t => Number(String(t || '').replace(/[^0-9]/g, '')) || 0;   // 'T1' -> 1

// Map a fixture entry's captured signals onto the decideTier() input shape. The fixture stores the high-level
// signals (named_contact, has_linkedin, deliverability, regulated_sector, established, email_verified, total
// proxy); we translate them into the exact flags decideTier reads. A clean named DM is "named_contact && a
// deliverable (not-bad) email"; verified maps to smtpVerifiedPersonal; catch-all-unverified is precomputed.
function signalsForDecide(f) {
  const s = f.signals || {};
  const deliv = String(s.deliverability || '').toLowerCase();
  const bad = ['bad', 'invalid', 'undeliverable', 'no_mx', 'disposable', 'dead'].includes(deliv);
  const cleanNamedDM = !!s.named_contact && s.has_email && !bad;
  const cleanRoleDM = !s.named_contact && s.has_email && !bad;     // generic info@-style usable inbox
  // total_score proxy: a priority + regulated + contactable lead scores >= TIER1_MIN; otherwise estimate from
  // the available signals. We prefer an explicit total in the fixture when present.
  const total = (s.total_score != null) ? s.total_score
    : (f.is_priority_sector ? (cleanNamedDM && s.has_linkedin ? 70 : (s.has_email ? 50 : 40)) : 30);
  return {
    isPrioritySector: !!f.is_priority_sector,
    total_score: total,
    sector_code: f.sector_code || '',
    namedDMRole: cleanNamedDM,
    cleanNamedDM,
    cleanRoleDM,
    hasLinkedin: !!s.has_linkedin,
    confirmedBad: bad,
    smtpVerifiedPersonal: cleanNamedDM && !!s.email_verified,
    sectorRegulated: !!s.regulated_sector,
    established: !!s.established,
    catchAllUnverified: !!s.catchall_unverified,
    inferredEmail: cleanNamedDM && !s.email_verified,
    freeProviderDM: false,
  };
}

(async () => {
  if (!fs.existsSync(FIXTURE)) { console.error('[eval-qualifier] missing fixture ' + FIXTURE); process.exit(2); }
  const fix = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const threshold = Number(fix.threshold_pct || 90);
  const leads = fix.leads || [];
  if (!leads.length) { console.error('[eval-qualifier] empty fixture'); process.exit(2); }

  let agree = 0, scored = 0, errored = 0, passAgree = 0;
  const rows = [];
  for (const f of leads) {
    let gotTier, reason, score;
    try {
      if (LIVE) {
        const q = await lq.scoreLead({ domain: f.domain, sector: f.sector || f.sector_code });
        gotTier = q.tier || 3; reason = q.tier_reason; score = q.total_score != null ? q.total_score : q.score;
      } else {
        const sd = signalsForDecide(f);
        const d = lq.decideTier(sd);
        gotTier = d.tier; reason = d.tier_reason; score = sd.total_score;
      }
    } catch (e) { errored++; rows.push({ domain: f.domain, exp: f.expected_tier, got: 'ERR', ok: false, err: e.message }); continue; }
    scored++;
    const ok = gotTier === tierNum(f.expected_tier);
    if (ok) agree++;
    if ((gotTier <= 2) === !!f.expected_pass) passAgree++;
    rows.push({ domain: f.domain, exp: f.expected_tier, got: 'T' + gotTier, ok, score, reason });
  }

  const denom = scored || 1;
  const agreementPct = Math.round((agree / denom) * 1000) / 10;
  const passPct = Math.round((passAgree / denom) * 1000) / 10;

  if (REPORT) {
    console.log('domain'.padEnd(40), 'exp', 'got', 'ok', 'score', 'reason');
    for (const r of rows) console.log(String(r.domain).padEnd(40), String(r.exp).padEnd(3), String(r.got).padEnd(3), (r.ok ? 'Y' : 'n').padEnd(2), String(r.score == null ? '' : r.score).padEnd(5), r.reason || r.err || '');
  }
  console.log(`[eval-qualifier] mode=${LIVE ? 'live-scoreLead' : 'decideTier'} · tier-agreement ${agree}/${scored} = ${agreementPct}% · pass/fail-agreement ${passPct}% · errored ${errored} · threshold ${threshold}%`);

  if (REPORT || LIVE) process.exit(0);
  if (scored < Math.ceil(leads.length * 0.9)) { console.error(`[eval-qualifier] too many decision failures (${errored}); investigate, not failing as a regression.`); process.exit(2); }
  if (agreementPct < threshold) { console.error(`[eval-qualifier] FAIL: agreement ${agreementPct}% < ${threshold}% — qualifier regression. Blocking merge.`); process.exit(1); }
  console.log('[eval-qualifier] PASS');
  process.exit(0);
})().catch(e => { console.error('[eval-qualifier] fatal:', e.message); process.exit(2); });
