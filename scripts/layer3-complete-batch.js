#!/usr/bin/env node
'use strict';
// ============================================================================================================
// LAYER-3 COMPLETE BATCH — the NEW "third layer": a batched Neon->Neon completion loop (300-500 leads/run).
// ============================================================================================================
// Layer-1 = the live engine cycle (source->enrich->verify->qualify->mint->send drip). Layer-2 = the LLM rescue /
// backlog waves that lift individual leads. Layer-3 (THIS) sweeps the Tier-2/qualified backlog in big batches and,
// for EVERY lead in the batch, drives the FULL completion path end to end in one place:
//   (a) INTEGRITY RECHECK  — validate every key column; fix in place what is DETERMINISTICALLY fixable
//                            (COALESCE sector_code->sector, trim over-cap contacts, drop a junk company string,
//                             null a malformed own-domain email), FLAG what is not. Never fabricates a value.
//   (b) TIER-2 -> TIER-1 LIFT — run the EXISTING llm-rescue (finds the ONE missing public signal), then re-run the
//                            CANONICAL deterministic gate (lead-quality.decideTier via retierWith). If — and ONLY
//                            if — the gate itself re-passes Tier-1, the lead is promoted via the EXISTING atomic
//                            promote in apply-review.js (which RE-RUNS the gate again before it writes). The gate,
//                            never this loop and never the LLM, has the final say. We never fabricate a tier.
//   (c) MINT-BEFORE-TOUCH-1 — any lead now Tier-1/qualified with no fresh audit is enqueued + minted (reusing
//                            enqueue-leads.js + mint-worker.js) so the audit_url EXISTS before any Touch-1 is sent.
//   (d) CLAUDE_CLEARED      — leads that pass every check get the Layer-3 send gate set via the EXISTING
//                            claude-safeguard-batch.js finalize (claude_cleared = lead AND audit AND touch).
// Then it updates Notion tags for the changed leads (reuses notion-sync's API pattern; fail-open) and posts ONE
// real summary to Telegram + Slack: "Layer-3 batch: scanned N, fixed N, lifted N->T1, minted N, cleared N, flagged N".
//
// HARD CONSTRAINTS honoured:
//   • Additive + idempotent. --dry is the DEFAULT (reads + logs the PLAN, writes NOTHING); pass --apply to write.
//   • SEND stays OFF. This only makes leads ELIGIBLE beneath the global SEND_ENABLED master gate (never touched).
//   • Deterministic gate keeps final say. We REUSE the canonical scorer/rescue/promote — we do NOT reimplement them.
//   • Heartbeat RACE-GUARD: the run registers an engine_runs heartbeat AND, before doing anything, defers if a heavy
//     re-tier writer (v3-rerun/v3-validate/backlog-burst/nightly-workers) is live (heartbeat.js active-writer), so it
//     never collides with engine-cycle/backlog-burst on the icp_tier/quality_fit/lifecycle/sector_code rows.
//   • Off-limits families (audit_*/compliance_*/framework_*/classifier_*/pointer_*/scanner_cache) are NEVER touched.
//
// Idempotency mechanism: an ADDITIVE `leads.layer3_checked_at` column (ADD COLUMN IF NOT EXISTS — never rename/drop)
// stamped on every processed lead. The batch pulls oldest-checked-first and skips leads checked within RECHECK_HOURS
// unless --force, so re-running --dry twice yields the SAME plan and a real run never re-burns the same lead.
//
// Usage:
//   node scripts/layer3-complete-batch.js [--max 400] [--dry|--apply] [--force] [--recheck-hours 24] [--batch <tag>]
//   (default --max 400, clamped to [300,500]; default DRY. LLM lift only fires when LLM_QA_ENABLED=1 — same kill
//    switch llm-rescue obeys; with it off, lift is skipped and the loop still does recheck/mint/clear/notify.)
//
// Style matches scripts/apply-review.js + claude-safeguard-batch.js: CommonJS, inline .env loader, pg() over
// scripts/psql + NEON_URL, esc(), arg()/has(), DRY mode, fail-soft exit(0).
// ============================================================================================================

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// ---- inline .env loader (same shape as apply-review.js / claude-safeguard-batch.js) ----
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

// ---- house deps (REUSE; never reimplement scoring/enrich/mint) ----
const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));      // decideTier, tierInputsFromPersisted
const rescue = require(path.join(ROOT, 'src', 'lib', 'llm-rescue.js'));              // rescueLead, retierWith, writeRescue, isEnabled

const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON(), '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
function pgSafe(sql) { try { return pg(sql); } catch (e) { return { _err: String(e.message || e) }; } }
const esc = (v) => (v === null || v === undefined) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jesc = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);

// DRY is the DEFAULT. --apply opts in to writes. (--dry is accepted too and is a no-op alias of the default.)
const APPLY = has('apply');
const DRY = !APPLY;
const FORCE = has('force');
const RECHECK_HOURS = Math.max(0, parseInt(arg('recheck-hours', '24'), 10) || 24);
// --max default 400, clamped to the [300,500] design range.
const MAX = Math.min(500, Math.max(300, parseInt(arg('max', '400'), 10) || 400));
const BATCH = arg('batch', 'layer3-' + new Date().toISOString().slice(0, 10));

// junk-company detector (mirrors the spirit of llm-rescue's looksLikePerson NONPERSON guard, but for company strings
// that are clearly NOT a real business name: SEO prefixes, listicle tails, empty/placeholder, pure punctuation).
const _JUNK_CO = /^(home|homepage|home page|welcome|untitled|index|default|page not found|404|loading|n\/a|null|none|test|example|domain for sale|coming soon)$/i;
function isJunkCompany(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (_JUNK_CO.test(n)) return true;
  if (/^[^a-z0-9]+$/i.test(n)) return true;                 // pure punctuation/symbols
  if (n.length < 2) return true;
  return false;
}
const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const _DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;
function isValidDomain(d) { const x = String(d || '').toLowerCase().replace(/^www\./, '').trim(); return !!x && _DOMAIN_RE.test(x) && x.split('.').length <= 6; }

const asObj = (v) => { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : {}; return (p && typeof p === 'object') ? p : {}; } catch (_e) { return {}; } };
const asArr = (v) => { if (Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : []; return Array.isArray(p) ? p : []; } catch (_e) { return []; } };

// over-cap contact ceiling (CLAUDE.md: cap 4/co). all_emails beyond this are trimmed (kept first 4, deterministic).
const CONTACT_CAP = Math.max(1, parseInt(process.env.LAYER3_CONTACT_CAP || '4', 10));

// ------------------------------------------------------------------------------------------------------------
// STEP 0 — additive idempotency column. ADD COLUMN IF NOT EXISTS (never rename/drop) — Neon-additive-only.
// In DRY mode we DO NOT run DDL (no writes at all); ordering falls back to existing timestamps, which still gives a
// stable oldest-first plan. In APPLY mode we provision it once so the stamp + skip-window work.
// ------------------------------------------------------------------------------------------------------------
let _l3ColReady = false;
function ensureLayer3Column() {
  if (_l3ColReady || DRY) return;
  const r = pgSafe(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS layer3_checked_at timestamptz`);
  if (!r || !r._err) _l3ColReady = true;
}
// detect whether the column already exists (so the SELECT can use it for ordering even in DRY mode if a prior
// APPLY run created it). Fail-open to false.
function layer3ColExists() {
  const r = pgSafe(`SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='layer3_checked_at' LIMIT 1`);
  return !(r && r._err) && String(r || '').trim() === '1';
}

// ------------------------------------------------------------------------------------------------------------
// HEARTBEAT RACE-GUARD — register an engine_runs row so engine-cycle's active-writer guard sees us, AND defer
// if a heavy re-tier writer is already live. heartbeat.js is the single source of both behaviours; we shell to it
// exactly like the workflows do. Fail-open: if heartbeat is unavailable we proceed (never block on the guard).
// NOTE: the engine-cycle guard watches WRITER_JOBS = [v3-rerun, v3-validate, backlog-burst, nightly-workers]. We
// register under a job name that COLLIDES with none of those (so we never wedge their guard) but we still honour
// THEIR liveness so we don't race them on the tier/lifecycle rows.
// ------------------------------------------------------------------------------------------------------------
const L3_JOB = 'layer3-complete';
function hb(args) { try { return execFileSync('node', [path.join(ROOT, 'scripts', 'heartbeat.js'), ...args], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; } }
function activeWriter() { return hb(['active-writer']); }
function hbStart() { return DRY ? '' : hb(['start', L3_JOB]); }
function hbFinish(id, status, processed, errors, lastError) { if (DRY || !id) return; hb(['finish', id, status || 'ok', String(processed || 0), String(errors || 0), ...(lastError ? [String(lastError).slice(0, 500)] : [])]); }

// ------------------------------------------------------------------------------------------------------------
// PULL — the batch. Tier-2 OR qualified, NOT yet claude_cleared, NOT consent-required, NOT suppressed/dnc/etc,
// with a real domain. Oldest-checked-first (layer3_checked_at if present, else qa_checked_at/reviewed_at), so the
// sweep makes monotonic progress and re-runs are stable. The recheck window skips leads we touched < RECHECK_HOURS
// ago (unless --force) — the idempotency guard. Pulled as to_jsonb(l) rows (the shape rescue/lq expect).
// ------------------------------------------------------------------------------------------------------------
function pullSql(n, hasL3Col) {
  const orderCheck = hasL3Col
    ? `COALESCE(l.layer3_checked_at, l.qa_checked_at, l.reviewed_at, '1970-01-01'::timestamptz) ASC`
    : `COALESCE(l.qa_checked_at, l.reviewed_at, '1970-01-01'::timestamptz) ASC`;
  const freshGuard = (FORCE || !hasL3Col) ? '' : `AND (l.layer3_checked_at IS NULL OR l.layer3_checked_at < NOW() - INTERVAL '${RECHECK_HOURS} hours')`;
  return `SELECT to_jsonb(l) FROM leads l
    WHERE (COALESCE(l.icp_tier,2) = 2 OR COALESCE(l.lifecycle_stage,'') = 'qualified')
      AND COALESCE(l.claude_cleared, FALSE) = FALSE
      AND COALESCE(l.consent_required, FALSE) = FALSE
      AND COALESCE(l.status,'') NOT IN ('suppressed','dnc','bounced','duplicate')
      AND COALESCE(l.domain,'') <> ''
      ${freshGuard}
    ORDER BY ${orderCheck}, l.id ASC
    LIMIT ${Math.max(1, n)}`;
}

// ------------------------------------------------------------------------------------------------------------
// (a) INTEGRITY RECHECK — per lead. Returns { fixes:[{set,why}], flags:[reason], deterministicSets:{col:sqlValueExpr} }.
// We only ever propose DETERMINISTIC, additive fixes (backfill/trim/null-a-bad-value). Anything that would need a
// new fact (a missing contact, an unknowable sector) is FLAGGED, never fabricated.
// ------------------------------------------------------------------------------------------------------------
function integrityRecheck(lead) {
  const fixes = [];
  const flags = [];
  const sets = {};  // col -> raw SQL value expression (already escaped)

  const domain = String(lead.domain || '').toLowerCase().replace(/^www\./, '').trim();
  const sector = String(lead.sector || '').trim();
  const sectorCode = String(lead.sector_code || '').trim();
  const filterKey = String(lead.filter_key || '').trim();
  const company = lead.company;
  const contactEmail = String(lead.contact_email || '').trim();
  const primaryEmail = String(lead.primary_email || '').trim();

  // 1) DOMAIN validity — a bad/empty domain is a hard flag (cannot deterministically repair a URL).
  if (!isValidDomain(domain)) flags.push('invalid_domain');

  // 2) COMPANY not junk — a junk/placeholder company string is FLAGGED (we never invent a name).
  if (isJunkCompany(company)) flags.push('junk_company');

  // 3) SECTOR set — DETERMINISTIC backfill: COALESCE sector <- sector_code <- filter_key when sector is blank but a
  //    code exists (the V3 re-tier path writes sector_code and leaves sector blank). Backfill ONLY, never clobber.
  if (!sector && (sectorCode || filterKey)) {
    const v = sectorCode || filterKey;
    sets.sector = esc(v);
    fixes.push({ set: `sector=${esc(v)}`, why: `backfill sector from ${sectorCode ? 'sector_code' : 'filter_key'}` });
  } else if (!sector && !sectorCode && !filterKey) {
    flags.push('no_sector');
  }

  // 4) EMAIL shape — if an own-domain email is structurally malformed (fails the syntax filter), NULL it so the gate
  //    + send path never trip on it. We null a BAD value (deterministic, additive-safe); we never synthesise one.
  if (contactEmail && !_EMAIL_RE.test(contactEmail)) {
    sets.contact_email = `NULL`;
    fixes.push({ set: `contact_email=NULL`, why: 'malformed contact_email cleared' });
  }
  if (primaryEmail && !_EMAIL_RE.test(primaryEmail)) {
    sets.primary_email = `NULL`;
    fixes.push({ set: `primary_email=NULL`, why: 'malformed primary_email cleared' });
  }
  // flag a lead that ends up with NO usable email shape at all (after the above) — not fixable here, needs enrich.
  const willHaveEmail = (contactEmail && _EMAIL_RE.test(contactEmail)) || (primaryEmail && _EMAIL_RE.test(primaryEmail));
  if (!willHaveEmail) flags.push('no_valid_email');

  // 5) OVER-CAP contacts — trim all_emails to CONTACT_CAP (keep the first N, deterministic order preserved).
  const emails = asArr(lead.all_emails);
  if (emails.length > CONTACT_CAP) {
    const trimmed = emails.slice(0, CONTACT_CAP);
    sets.all_emails = jesc(trimmed);
    fixes.push({ set: `all_emails=<${CONTACT_CAP} kept>`, why: `trimmed ${emails.length}->${CONTACT_CAP} over-cap contacts` });
  }

  // 6) DM not bound to >1 domain — a decision-maker email whose domain differs from the lead's own domain is a
  //    cross-bind (the compliant path forbids it). FLAG it (we do not guess which is correct).
  const dmEmail = contactEmail || primaryEmail;
  if (dmEmail && _EMAIL_RE.test(dmEmail) && domain) {
    const dmDom = dmEmail.split('@')[1].toLowerCase();
    const free = /^(gmail|googlemail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|protonmail|proton|gmx|mail|yandex|ymail|btinternet)\./.test(dmDom);
    const own = dmDom === domain || dmDom.endsWith('.' + domain) || domain.endsWith('.' + dmDom);
    if (!own && !free) flags.push('dm_domain_crossbind');
  }

  // 7) NULL where NOT-NULL expected — `company` is NOT NULL in schema; a row that somehow carries an empty company
  //    is a data bug. (id is the PK and always present.) We can't invent a company, so FLAG.
  if (company == null || String(company).trim() === '') flags.push('null_company');

  return { fixes, flags, sets };
}

// apply the deterministic integrity sets for one lead (single UPDATE), + stamp the recheck note additively.
function writeIntegrity(lead, sets, flags) {
  const clauses = Object.entries(sets).map(([col, valExpr]) => `${col}=${valExpr}`);
  // record the integrity verdict additively into personalisation_pointers (jsonb || jsonb) so it is auditable and
  // NEVER clobbers existing pointers. (We use personalisation_pointers because it is the established advisory bag.)
  const note = { layer3_integrity: { at: new Date().toISOString(), fixed: Object.keys(sets), flags } };
  clauses.push(`personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${jesc(note)}`);
  const sql = `UPDATE leads SET ${clauses.join(', ')} WHERE id=${Number(lead.id)}`;
  if (DRY) return { sql, wrote: false };
  pg(sql);
  return { sql, wrote: true };
}

// stamp layer3_checked_at on a processed lead (idempotency window). additive; only in APPLY mode.
function stampChecked(id) {
  if (DRY || !_l3ColReady) return;
  pgSafe(`UPDATE leads SET layer3_checked_at=NOW() WHERE id=${Number(id)}`);
}

// ------------------------------------------------------------------------------------------------------------
// (b) LIFT — reuse llm-rescue.rescueLead (finds the missing signal, re-tiers with the canonical gate) then, on a
// gate-verified Tier-1 flip, mark review_status='auto_promote' + qa_status='rescued' so the EXISTING apply-review.js
// atomic promote actions it (apply-review RE-RUNS the gate before writing — deterministic gate keeps final say).
// We do NOT promote here ourselves; we only stage the advisory columns rescue already owns, then call apply-review.
// In DRY mode we run the rescue read-path (it accepts dry=true and writes nothing) and just record the verdict.
// ------------------------------------------------------------------------------------------------------------
async function liftLead(lead) {
  // LLM lift obeys the SAME kill switch llm-rescue obeys. If off, skip the lift (recheck/mint/clear still run).
  if (!rescue.isEnabled()) return { attempted: false, reason: 'llm_qa_disabled' };
  let res;
  try { res = await rescue.rescueLead(lead, 'layer3'); }
  catch (e) { return { attempted: true, error: e.message }; }
  // writeRescue persists the advisory qa_* columns (idempotent). In DRY it returns the SQL and writes nothing.
  try { rescue.writeRescue(res, { dry: DRY }); } catch (_e) {}
  const lifted = !!res.flippedTo1 && res.suggested_tier === 1;
  return { attempted: true, lifted, res };
}

// drive the EXISTING atomic promote for all staged auto_promote leads in ONE shot (reuse apply-review.js). It
// re-runs the canonical gate per lead and only promotes on tier==1; SEND stays OFF. Returns the promoted count by
// parsing its summary line. In DRY we call it with --dry (it writes nothing and prints the WOULD-promote plan).
function runApplyReview(maxN) {
  const args = [path.join(ROOT, 'scripts', 'apply-review.js'), '--max', String(Math.max(1, maxN))];
  if (DRY) args.push('--dry');
  let out = '';
  try { out = execFileSync('node', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).toString(); }
  catch (e) { return { ok: false, out: String(e.stdout || e.message || ''), promoted: 0 }; }
  // count promotions from the per-line actions (promoted_tier1_auto / promoted_human) — robust to the summary fmt.
  const promoted = (out.match(/-> promoted_tier1_auto/g) || []).length + (out.match(/-> promoted_human/g) || []).length;
  return { ok: true, out, promoted };
}

// ------------------------------------------------------------------------------------------------------------
// (c) MINT-BEFORE-TOUCH-1 — reuse enqueue-leads.js (enqueues quality_fit leads with no audit_url, deduped) +
// mint-worker.js --once (drains the queue, mints audit_pages, binds audit_url). Idempotent: enqueue skips already-
// minted/queued; the worker drains to empty. In DRY we DO NOT mint (no writes) — we only COUNT how many lifted/
// qualified leads currently lack a fresh audit, i.e. what WOULD be minted.
// ------------------------------------------------------------------------------------------------------------
function countNeedingMint() {
  const r = pgSafe(`SELECT count(*)::int FROM leads
      WHERE COALESCE(quality_fit,false)=true
        AND (audit_url IS NULL OR audit_url='')
        AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
        AND COALESCE(dormant,false)=false`);
  return (r && !r._err) ? (parseInt(String(r).trim(), 10) || 0) : 0;
}
function runMint(limit) {
  if (DRY) return { minted: 0, wouldMint: countNeedingMint() };
  const before = countNeedingMint();
  try { execFileSync('node', [path.join(ROOT, 'scripts', 'enqueue-leads.js'), String(Math.max(1, limit))], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); } catch (_e) {}
  try { execFileSync('node', [path.join(ROOT, 'scripts', 'mint-worker.js'), '--once'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (_e) {}
  const after = countNeedingMint();
  return { minted: Math.max(0, before - after), wouldMint: before };
}

// ------------------------------------------------------------------------------------------------------------
// (d) CLAUDE_CLEARED — for leads that are send-ready (qualified + quality_fit + audit_verified + governor-released)
// and pass all our checks, set the Layer-3 send gate via the EXISTING claude-safeguard-batch.js. We set the three
// sub-flags then FINALIZE (claude_cleared = lead AND audit AND touch) — claude-safeguard owns that atomic compute.
// Only leads with NO integrity FLAGS are cleared (a flagged lead is never cleared). SEND stays OFF regardless.
// The eligible set mirrors claude-safeguard's own pull predicate, so we only clear what the send gate would gate.
// ------------------------------------------------------------------------------------------------------------
function clearEligibleIds(ids) {
  // restrict the candidate ids to the exact send-gate-eligible set (same predicate claude-safeguard --pull uses).
  if (!ids.length) return { eligible: [], cleared: 0 };
  const idList = ids.map(Number).filter(Number.isFinite).join(',');
  if (!idList) return { eligible: [], cleared: 0 };
  const r = pgSafe(`SELECT id FROM leads WHERE id IN (${idList})
      AND quality_fit = TRUE
      AND COALESCE(lifecycle_stage,'') = 'qualified'
      AND COALESCE(audit_verified, FALSE) = TRUE
      AND governor_released_at IS NOT NULL
      AND COALESCE(claude_cleared, FALSE) = FALSE`);
  const eligible = (r && !r._err) ? String(r).split('\n').map(s => s.trim()).filter(Boolean) : [];
  if (!eligible.length) return { eligible: [], cleared: 0 };
  if (DRY) return { eligible, cleared: 0 };  // DRY: count what WOULD clear; write nothing.
  let cleared = 0;
  const sg = path.join(ROOT, 'scripts', 'claude-safeguard-batch.js');
  const note = JSON.stringify({ layer3: { batch: BATCH, at: new Date().toISOString() } });
  for (const id of eligible) {
    try {
      execFileSync('node', [sg, '--clear-lead', id, '--batch', BATCH, '--note', note], { encoding: 'utf8' });
      execFileSync('node', [sg, '--clear-audit', id, '--batch', BATCH], { encoding: 'utf8' });
      execFileSync('node', [sg, '--clear-touch', id, '--batch', BATCH], { encoding: 'utf8' });
      const out = execFileSync('node', [sg, '--finalize', id, '--batch', BATCH], { encoding: 'utf8' }).toString();
      if (/claude_cleared=TRUE/.test(out)) cleared++;
    } catch (_e) {}
  }
  return { eligible, cleared };
}

// ------------------------------------------------------------------------------------------------------------
// NOTION TAGS — reuse notion-sync's API pattern (Bearer + Notion-Version, https). Fail-open if NOTION_API_KEY
// absent. We append ONE callout summarising the Layer-3 batch result (Neon stays authoritative; Notion is display).
// This intentionally mirrors notion-sync.js rather than importing it (that script is a self-contained main()).
// ------------------------------------------------------------------------------------------------------------
const NOTION_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || '';
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID || '38148123-488c-81b4-9293-f9c7056ff2ff'; // Tamazia Cockpit B
function notionRequest(method, apiPath, body) {
  const https = require('https');
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({ hostname: 'api.notion.com', path: apiPath, method,
      headers: { 'Authorization': 'Bearer ' + NOTION_KEY, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_e) { resolve({ _raw: d, status: res.statusCode }); } }); });
    req.on('error', (e) => resolve({ _err: String(e.message || e) }));
    if (data) req.write(data); req.end();
  });
}
async function updateNotion(summaryLine, changedCount) {
  if (!NOTION_KEY) { console.log('[layer3] NOTION_API_KEY not set — skipping Notion tags (fail-open).'); return; }
  if (DRY) { console.log('[layer3] DRY: would append Notion callout: ' + summaryLine); return; }
  if (!changedCount) { console.log('[layer3] no changed leads — skipping Notion callout.'); return; }
  try {
    const r = await notionRequest('PATCH', `/v1/blocks/${NOTION_PAGE_ID}/children`, {
      children: [{ type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: summaryLine } }], icon: { type: 'emoji', emoji: '🧱' }, color: 'purple_background' } }],
    });
    if (r && (r._err || r.status >= 400 || r.object === 'error')) console.log('[layer3] Notion update non-fatal: ' + (r.message || r._err || r.status));
    else console.log('[layer3] Notion callout appended.');
  } catch (e) { console.log('[layer3] Notion update failed (fail-open): ' + e.message); }
}

// ------------------------------------------------------------------------------------------------------------
// NOTIFY — ONE real summary to Telegram + Slack via the repo's notify-*.sh (which honour NOTIFY_REALTIME and the
// digest fallback). Fail-open. In DRY we print the line instead of sending.
// ------------------------------------------------------------------------------------------------------------
function notify(summaryLine) {
  if (DRY) { console.log('[layer3] DRY: would notify Telegram+Slack: ' + summaryLine); return; }
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-telegram.sh'), summaryLine], { encoding: 'utf8', stdio: 'ignore' }); } catch (_e) {}
  try { execFileSync('bash', [path.join(ROOT, 'scripts', 'notify-slack.sh'), 'all-tamazia', summaryLine], { encoding: 'utf8', stdio: 'ignore' }); } catch (_e) {}
  console.log('[layer3] notified (or routed to digest): ' + summaryLine);
}

// ============================================================================================================
// MAIN
// ============================================================================================================
(async function main() {
  if (!NEON()) { console.log('[layer3] no NEON_URL — nothing to do.'); return; }
  console.log(`[layer3] start mode=${DRY ? 'DRY (no writes)' : 'APPLY'} max=${MAX} recheck_hours=${RECHECK_HOURS}${FORCE ? ' force' : ''} batch=${BATCH} llm_lift=${rescue.isEnabled() ? 'on' : 'off (LLM_QA_ENABLED)'}`);

  // RACE-GUARD: defer if a heavy re-tier writer is live (so we never collide on tier/lifecycle rows).
  const writer = activeWriter();
  if (writer) {
    console.log(`[layer3] RACE-GUARD: heavy writer '${writer}' is running — deferring this run (no writes). Re-run after it finishes.`);
    return;
  }

  // register our own heartbeat row (APPLY only) so the engine-cycle / ops view sees this run.
  const hbId = hbStart();

  const counts = { scanned: 0, fixed: 0, lifted: 0, minted: 0, cleared: 0, flagged: 0 };
  const changedIds = new Set();   // leads we mutated in any way (integrity fix or lift) — drives Notion + clear set.
  const liftedIds = [];
  let errors = 0;

  try {
    if (APPLY) ensureLayer3Column();
    const hasL3Col = _l3ColReady || layer3ColExists();

    // ---- PULL the batch ----
    const raw = pgSafe(pullSql(MAX, hasL3Col));
    if (raw && raw._err) { console.log('[layer3] pull error: ' + raw._err); hbFinish(hbId, 'error', 0, 1, raw._err); return; }
    const rows = [];
    for (const s of String(raw).split('\n')) { if (!s.trim()) continue; try { rows.push(JSON.parse(s)); } catch (_e) { errors++; } }
    console.log(`[layer3] pulled ${rows.length} lead(s) (Tier-2/qualified, uncleared, oldest-checked-first).`);

    // ---- PER-LEAD: integrity recheck + lift attempt ----
    for (const lead of rows) {
      counts.scanned++;
      let changed = false;

      // (a) integrity recheck
      const ir = integrityRecheck(lead);
      if (ir.flags.length) counts.flagged++;
      if (Object.keys(ir.sets).length) {
        const w = writeIntegrity(lead, ir.sets, ir.flags);
        counts.fixed++;
        changed = true;
        if (DRY) console.log(`  ${lead.lead_ref || lead.id} FIX ${ir.fixes.map(f => f.why).join('; ')}${ir.flags.length ? '  | FLAGS: ' + ir.flags.join(',') : ''}`);
      } else if (ir.flags.length && DRY) {
        console.log(`  ${lead.lead_ref || lead.id} FLAG ${ir.flags.join(',')} (not deterministically fixable)`);
      }

      // (b) Tier-2 -> Tier-1 lift attempt (only for non-qualified, i.e. genuinely Tier-2 leads; a qualified lead is
      //     already at/above the bar). rescueLead re-tiers with the canonical gate; on a gate-verified flip we stage
      //     the auto_promote for apply-review's atomic promote. Re-read the (maybe integrity-fixed) row so the lift
      //     sees the backfilled sector etc.: fold the deterministic sets onto the in-memory copy (cheap, no re-fetch).
      const isQualified = String(lead.lifecycle_stage || '') === 'qualified';
      if (!isQualified) {
        const copy = Object.assign({}, lead);
        if (ir.sets.sector) copy.sector = String(ir.sets.sector).replace(/^'|'$/g, '');
        if (ir.sets.contact_email === 'NULL') copy.contact_email = null;
        if (ir.sets.primary_email === 'NULL') copy.primary_email = null;
        const lift = await liftLead(copy);
        if (lift.lifted) {
          counts.lifted++;
          liftedIds.push(lead.id);
          changed = true;
          if (DRY && lift.res) console.log(`  ${lead.lead_ref || lead.id} LIFT->T1 ${String(lift.res.reason || '').slice(0, 140)}`);
        } else if (DRY && lift.attempted && lift.res && lift.res.reason) {
          // surface a near-miss only briefly (keeps the dry log readable).
          if (lift.res.flippedTo1 === false && lift.res.suggested_tier === 2) console.log(`  ${lead.lead_ref || lead.id} lift: ${String(lift.res.reason).slice(0, 120)}`);
        }
      }

      if (changed) changedIds.add(lead.id);
      stampChecked(lead.id);
    }

    // ---- promote staged auto_promote leads via the EXISTING atomic promote (gate re-decides). ----
    let promoted = 0;
    if (liftedIds.length || APPLY) {
      const ar = runApplyReview(Math.max(liftedIds.length, 50));
      promoted = ar.promoted;
      if (DRY) console.log(`[layer3] apply-review (DRY) would promote ~${promoted} (gate re-verified).`);
      else console.log(`[layer3] apply-review promoted ${promoted} lead(s) (gate re-verified, atomic).`);
    }

    // ---- (c) MINT before Touch-1: ensure every qualified/quality_fit lead has an audit_url. ----
    const mint = runMint(MAX);
    counts.minted = mint.minted;
    if (DRY) console.log(`[layer3] mint (DRY): ${mint.wouldMint} quality_fit lead(s) currently lack a fresh audit (would enqueue+mint).`);
    else console.log(`[layer3] mint: minted ${mint.minted} new audit(s) (${mint.wouldMint} needed before run).`);

    // ---- (d) CLAUDE_CLEARED: clear the send-gate for fully send-ready, unflagged leads in this batch. ----
    // candidate ids = scanned leads with NO integrity flags. (clearEligibleIds re-restricts to the send-gate set.)
    const clearCandidates = rows.filter(l => !integrityRecheck(l).flags.length).map(l => l.id);
    const clr = clearEligibleIds(clearCandidates);
    counts.cleared = clr.cleared;
    if (DRY) console.log(`[layer3] clear (DRY): ${clr.eligible.length} lead(s) are send-gate-eligible and would be claude_cleared.`);
    else console.log(`[layer3] cleared ${clr.cleared}/${clr.eligible.length} send-gate-eligible lead(s).`);

    // ---- SUMMARY line (the ONE real result posted everywhere). lifted reflects gate-verified promotions. ----
    const summary = `Layer-3 batch: scanned ${counts.scanned}, fixed ${counts.fixed}, lifted ${promoted || counts.lifted}->T1, minted ${counts.minted}, cleared ${counts.cleared}, flagged ${counts.flagged}`;
    console.log('[layer3] ' + summary);

    // ---- Notion tags + Telegram/Slack notify (both fail-open). ----
    await updateNotion(summary + (DRY ? ' [dry]' : ''), changedIds.size + promoted);
    notify(summary);

    hbFinish(hbId, 'ok', counts.scanned, errors);
  } catch (e) {
    console.error('[layer3] fatal (non-blocking): ' + e.message);
    hbFinish(hbId, 'error', counts.scanned, errors + 1, e.message);
  }
})().catch(e => { console.error('[layer3] fatal (non-blocking):', e.message); process.exit(0); });
