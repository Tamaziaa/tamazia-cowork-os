#!/usr/bin/env node
// Free contact verification batch · £0 replacement for MillionVerifier/NeverBounce credits.
// For leads with a contact_email but no verify_status yet: run the free verifier
// (Hunter primary + DIY disposable/MX/role/syntax), persist verify_status + contact_confidence.
// contact_confidence feeds the 10-layer quality scorer (Layer 3) and the pre-send path.
//   valid  -> confidence = score (>=70)
//   risky  -> confidence = score (40-69), still deliverable domain
//   invalid-> confidence = 0, verify_status='invalid' (quality gate + send skip it)
// Usage: node scripts/verify-contacts.js [LIMIT]   default 25
//
// Set SMTP_PROBE=1 to enable the optional SMTP RCPT probe (only on hosts that allow outbound :25,
// e.g. the Oracle VM — NOT GitHub Actions, which blocks port 25).
//
// REOON (paid fallback): runs ONLY on free-'unknown' results, throttled by a DAILY cap (REOON_DAILY_CAP=500,
// Reoon's plan limit). The day's usage is counted off Neon (reoon_status IS NOT NULL AND reoon_checked_at::date
// = CURRENT_DATE), so the cap holds across all 4 daily verify waves. Once 500 is spent, free MX/SMTP verify
// keeps running for the rest of the day and only the paid Reoon call stops. Each Reoon consultation persists
// reoon_status / reoon_score / reoon_checked_at (additive columns). No REOON_KEY -> Reoon is a no-op (still £0).

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { verifyEmail } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'free-verify.js'));
// Reoon = PAID FALLBACK (D3.1). Used ONLY for emails the free path leaves 'unknown' (see waterfall below).
// Fail-open: with no REOON_KEY, reoonVerify() returns {status:'skipped'} and the free verdict is kept verbatim,
// so this require is a no-op until the founder adds the key. Guarded require so a missing file never breaks verify.
let reoonVerify = async () => ({ status: 'skipped', cost: 0 });
try { reoonVerify = require(path.join(ROOT, 'src', 'lib', 'enrich', 'reoon.js')).verifyEmail; } catch (_e) {}
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

(async () => {
  const limit = Number(process.argv[2] || 25);
  const useSmtp = process.env.SMTP_PROBE === '1';
  const raw = pg(`
    SELECT id::text, contact_email
    FROM leads
    WHERE contact_email IS NOT NULL AND contact_email <> '' AND POSITION('@' IN contact_email) > 1
      -- bug-fix: 'pending' is the UNVERIFIED placeholder the SERP scraper writes at insert (serp-engine.js:
      -- organic_top100 -> verify_status='pending'; health-check/intel-pulse both treat it as "awaiting verify").
      -- The old (NULL OR '') filter MISSED it, so every organic lead stamped 'pending' was never free-verified —
      -- 388 of 614 icp_tier=1 leads were stranded at 'pending' (never deliverability-checked) and so could not
      -- become send-ready. free-verify.js only ever emits valid/risky/invalid/unknown, so re-checking a 'pending'
      -- row is correct (it was never actually verified). prioritise Tier-1 so send-ready depth fills first.
      AND COALESCE(verify_status,'') IN ('', 'pending')
    ORDER BY (icp_tier = 1) DESC NULLS LAST, priority_score DESC NULLS LAST, id DESC LIMIT ${limit}`);
  if (!raw) { console.log('[verify] nothing to verify.'); return; }
  const rows = raw.split('\n').filter(Boolean).map(l => { const [id, email] = l.split('\t'); return { id: Number(id), email }; });

  // ── REOON THROTTLE (Reoon is PAID: 100k credits, 500/day cap — respect it) ──
  // The cap is a DAILY budget, not just per-run, so it must survive across the 4 daily verify waves and any
  // ad-hoc runs. We count how many Reoon checks ALREADY happened TODAY straight off Neon
  // (reoon_status IS NOT NULL AND reoon_checked_at::date = CURRENT_DATE) and only allow the remaining headroom
  // this run. Every Reoon call we make (settled OR refunded 'unknown') stamps reoon_checked_at, so the counter
  // advances and a refunded row is not endlessly re-hit. Free MX/SMTP verify is UNCAPPED and continues for the
  // day even after Reoon's 500 is spent — only the paid fallback stops. A per-run cap (ENRICH_VERIFY_CAP) is
  // kept as a secondary, smaller bound so a single wave can't drain the whole daily allowance at once.
  const REOON_DAILY_CAP = Math.max(0, Number(process.env.REOON_DAILY_CAP || 500));
  let reoonToday = 0;
  try { reoonToday = Number(pg(`SELECT COUNT(*) FROM leads WHERE reoon_status IS NOT NULL AND reoon_checked_at::date = CURRENT_DATE`)) || 0; } catch (_e) { reoonToday = 0; }
  const dailyHeadroom = Math.max(0, REOON_DAILY_CAP - reoonToday);
  // per-run cap (secondary bound); default to the daily headroom so a manual run can use the full remaining day.
  const perRunCap = Math.max(0, Number(process.env.ENRICH_VERIFY_CAP || dailyHeadroom));
  const reoonCap = Math.min(dailyHeadroom, perRunCap);
  if (reoonToday >= REOON_DAILY_CAP) {
    console.log(`[verify] Reoon daily cap reached (${reoonToday}/${REOON_DAILY_CAP}) — free verify continues, paid fallback OFF for today.`);
  } else {
    console.log(`[verify] Reoon budget: ${reoonToday}/${REOON_DAILY_CAP} used today · ${reoonCap} allowed this run (free verify always runs).`);
  }
  let valid = 0, risky = 0, invalid = 0, reoonUsed = 0, reoonUpgraded = 0;
  for (const r of rows) {
    let v;
    try { v = await verifyEmail(r.email, { smtp: useSmtp }); } catch (_e) { continue; }
    // verdict = the verdict we will persist; src = which verifier produced it. Default = the free result.
    let verdict = v.status, conf = v.status === 'invalid' ? 0 : (v.score || 0), src = v.source;
    // Reoon advisory columns for this row (written only when Reoon was actually consulted, settled or refunded).
    let reoonStatus = null, reoonScore = null, reoonChecked = false;

    // ── WATERFALL: PAID FALLBACK ── Reoon runs ONLY when the FREE verdict is still 'unknown' (or empty),
    // i.e. the cheap MX/SMTP/Hunter path could not settle deliverability. Anything the free path already
    // settled (valid/risky/invalid) is kept as-is — never re-checked, never charged. Gated by reoonCap, which
    // is min(daily headroom toward REOON_DAILY_CAP=500, per-run cap): once today's 500 is spent, reoonUsed
    // never reaches a positive cap so the paid call is skipped and the free 'unknown' verdict is kept.
    // No REOON_KEY -> reoonVerify() returns {status:'skipped'} -> we fall through with the free verdict unchanged.
    if ((verdict === 'unknown' || !verdict) && reoonUsed < reoonCap) {
      let rv = null;
      try { rv = await reoonVerify(r.email, process.env); } catch (_e) { rv = null; }
      if (rv && rv.status !== 'skipped' && rv.status !== 'error') {
        reoonUsed++;
        reoonChecked = true;                       // stamp reoon_checked_at so the daily counter advances
        reoonStatus = rv.status;                   // settled (valid/risky/invalid) OR refunded 'unknown'
        // reoon_score: a numeric deliverability score mirroring the free-verify bands so downstream gates can
        // read a single column. settled-good 75, catch-all/risky 55 (do-not-send), invalid 0, refunded unknown NULL.
        reoonScore = rv.status === 'valid' ? 75 : rv.status === 'risky' ? 55 : rv.status === 'invalid' ? 0 : null;
        // Reoon returned a real verdict (valid/risky/invalid) or refunded 'unknown'. Only adopt a SETTLED verdict
        // into the live deliverability gate; a refunded 'unknown' leaves the free verdict in place for retry.
        if (rv.status === 'valid' || rv.status === 'risky' || rv.status === 'invalid') {
          verdict = rv.status; src = 'reoon'; reoonUpgraded++;
          // Confidence: settled-good 75, catch-all/risky 55 (do-not-send), invalid 0. Mirrors free-verify bands.
          conf = rv.status === 'invalid' ? 0 : (rv.status === 'risky' ? 55 : 75);
        }
        // rv.status === 'unknown' (refunded) -> leave the free 'unknown' verdict in place (will retry later).
      }
    }

    if (verdict === 'valid') valid++; else if (verdict === 'risky') risky++; else if (verdict === 'invalid') invalid++;
    // verify_status overloaded -> deliverability split: write the dedicated deliverability VERDICT alongside
    // verify_status (kept for back-compat). verdict here is always a deliverability verdict (valid/risky/invalid/
    // unknown), never a workflow value, so the two stay in lockstep for newly-verified rows. Catch-all/risky is
    // intentionally NOT send-ready (house rule: catch-all = do-not-send) — deliverabilityOf() maps 'risky' -> 'deliverable'.
    // When Reoon was consulted, also persist the dedicated reoon_* columns (additive; advisory audit trail + the
    // source of the daily-cap counter). reoon_checked_at is stamped for BOTH settled and refunded verdicts.
    const reoonSets = reoonChecked
      ? `, reoon_status=${esc(reoonStatus)}, reoon_score=${reoonScore == null ? 'NULL' : Number(reoonScore)}, reoon_checked_at=NOW()`
      : '';
    pg(`UPDATE leads SET verify_status=${esc(verdict)}, deliverability=${esc(verdict)}, contact_confidence=${conf}${reoonSets}, updated_at=NOW() WHERE id=${r.id}`);
    console.log(`  ${r.email.padEnd(40)} ${String(verdict).padEnd(8)} conf=${conf} via=${src}${reoonChecked ? ' [reoon:' + reoonStatus + ']' : ''}`);
  }
  const costNote = reoonUsed > 0
    ? `· Reoon ${reoonUsed} called (${reoonUpgraded} settled) · daily ${reoonToday + reoonUsed}/${REOON_DAILY_CAP}`
    : '· £0 (no paid credits used)';
  console.log(`[verify] ${rows.length} checked · valid ${valid} · risky ${risky} · invalid ${invalid} ${costNote}`);
})().catch(e => { console.error('[verify] FATAL', e.message); process.exit(1); });
