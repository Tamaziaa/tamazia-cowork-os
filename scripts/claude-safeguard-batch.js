#!/usr/bin/env node
'use strict';
// ============================================================================================================
// CLAUDE-SAFEGUARD-BATCH — the THIN batch tool for the Layer-3 "Claude safeguard" runner (WS4).
// ============================================================================================================
// This script does NO reasoning. It is the hands, not the brain. The brain is a dedicated Claude Code session
// (fired twice daily by .github/workflows/claude-safeguard.yml on a SUBSCRIPTION OAuth token, ZERO paid API).
// That session calls this tool to (a) PULL the work queue (released-but-uncleared leads nearest to send) and
// (b) RECORD its per-lead clearances by setting the leads.claude_* sub-flags, then FINALIZE the master flag.
//
// The master flag claude_cleared is the Layer-3 send gate: scripts/push-to-mystrika.js and
// src/skills/S065-touch-scheduler/scripts/send-due.js both refuse to send unless COALESCE(claude_cleared,FALSE)
// =TRUE (downstream of the governor + the global SEND_ENABLED master gate, which this tool NEVER touches).
//
// WRITE SCOPE (hard): this tool writes ONLY the leads.claude_* columns. It is READ-ONLY everywhere else and
// never touches the off-limits audit_*/compliance_*/framework_*/classifier_*/pointer_*/scanner_cache families.
//
// Subcommands (flags):
//   --pull [N=50]                  Print up to N released-but-uncleared leads (nearest-to-send first) as JSON
//                                  lines: { lead_ref, id, domain, sector, country, audit_url, contact_email,
//                                  touches:[{touch,subject,body}...] }. This is the work queue.
//   --clear-lead <id>              Set claude_lead_cleared=TRUE  (+ stamp reviewed_at + batch + merge note).
//   --clear-audit <id>             Set claude_audit_cleared=TRUE (+ stamp reviewed_at + batch + merge note).
//   --clear-touch <id>             Set claude_touch_cleared=TRUE (+ stamp reviewed_at + batch + merge note).
//   --finalize <id>                Atomically set claude_cleared = (lead AND audit AND touch) in ONE UPDATE.
//   --batch <id>                   Tag the batch (stamped into claude_review_batch; --pull skips this batch).
//   --note '<json>'                JSON object merged into claude_review_notes (jsonb || jsonb). Optional.
//   --dry                          Print the SQL instead of executing it (no DB write/read side effects).
//
// Idempotency: --pull excludes claude_cleared=TRUE rows; when --batch is given it ALSO excludes rows already
// stamped with that batch (COALESCE(claude_review_batch,'') <> <batch>) so re-running a batch never re-pulls
// work it already stamped. Each clear stamps claude_reviewed_at + claude_review_batch.
//
// Style matches scripts/apply-review.js: CommonJS, inline .env loader, pg() over scripts/psql + NEON_URL,
// esc(), arg()/has(), DRY mode, fail-soft exit(0).
// ============================================================================================================

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON(), '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
const esc = (v) => (v === null || v === undefined) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const DRY = has('dry');

// ---- the work-queue SELECT. Mirrors the send-path pre-gates (push-to-mystrika.js / send-due.js) so the queue
// is exactly the set of leads that the Layer-3 gate (claude_cleared) is the LAST thing holding back. Nearest to
// send first = oldest governor release first. The touch bodies come from outreach_drafts keyed on
// draft_metadata->>'touch' (0..3), channel='email' (same shape mystrika-export.js reads).
function pullSql(n, batch) {
  const batchGuard = batch ? `\n      AND COALESCE(l.claude_review_batch,'') <> ${esc(batch)}` : '';
  return `SELECT json_build_object(
        'lead_ref', l.lead_ref, 'id', l.id, 'domain', l.domain, 'sector', l.sector,
        'country', l.country, 'audit_url', l.audit_url,
        'contact_email', COALESCE(NULLIF(l.contact_email,''), l.email, ''),
        'touches', COALESCE(d.touches, '[]'::json)
      )::text
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('touch', t.touch, 'subject', t.subject, 'body', t.body) ORDER BY t.touch) AS touches
      FROM (
        SELECT (od.draft_metadata->>'touch') AS touch,
               MAX(od.draft_subject) AS subject, MAX(od.draft_body) AS body
        FROM outreach_drafts od
        WHERE od.lead_id = l.id AND od.channel='email' AND (od.draft_metadata->>'touch') IS NOT NULL
        GROUP BY (od.draft_metadata->>'touch')
      ) t
    ) d ON TRUE
    WHERE l.quality_fit = TRUE
      AND COALESCE(l.lifecycle_stage,'') = 'qualified'
      AND COALESCE(l.audit_verified, FALSE) = TRUE
      AND l.governor_released_at IS NOT NULL
      AND COALESCE(l.claude_cleared, FALSE) = FALSE${batchGuard}
      AND l.entity_type IS NOT NULL
      AND COALESCE(l.legal_name,'') <> ''
      AND COALESCE(l.contact_name,'') <> ''
      AND l.country IS NOT NULL
    ORDER BY l.governor_released_at ASC
    LIMIT ${Math.max(1, n)}`;
}

// ---- a sub-flag clear: set the one boolean TRUE + stamp reviewed_at/batch + (optionally) merge a note. Guarded
// on id so a typo can never touch more than one row. Note is merged additively (never clobbers prior notes).
function clearSql(col, id, batch, noteJson) {
  const sets = [`${col}=TRUE`, `claude_reviewed_at=NOW()`];
  if (batch) sets.push(`claude_review_batch=${esc(batch)}`);
  if (noteJson) sets.push(`claude_review_notes = COALESCE(claude_review_notes,'{}'::jsonb) || ${esc(noteJson)}::jsonb`);
  return `UPDATE leads SET ${sets.join(', ')} WHERE id=${Number(id)}`;
}

// ---- finalize: the master flag is computed in SQL from the three sub-flags in ONE atomic UPDATE (no read-modify
// -write race). This is the value the send-path gate reads. SEND stays OFF regardless — this only makes the lead
// eligible beneath the SEND_ENABLED master gate.
function finalizeSql(id, batch, noteJson) {
  const sets = [
    `claude_cleared = (COALESCE(claude_lead_cleared,FALSE) AND COALESCE(claude_audit_cleared,FALSE) AND COALESCE(claude_touch_cleared,FALSE))`,
    `claude_reviewed_at=NOW()`,
  ];
  if (batch) sets.push(`claude_review_batch=${esc(batch)}`);
  if (noteJson) sets.push(`claude_review_notes = COALESCE(claude_review_notes,'{}'::jsonb) || ${esc(noteJson)}::jsonb`);
  return `UPDATE leads SET ${sets.join(', ')} WHERE id=${Number(id)}`;
}

// validate that --note is a JSON object before it reaches SQL (so a malformed note fails loud, not silently).
function normNote(raw) {
  if (!raw) return null;
  let o; try { o = JSON.parse(raw); } catch (_e) { throw new Error('--note must be valid JSON'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('--note must be a JSON object');
  return JSON.stringify(o);
}

function statsFooter() {
  try {
    const r = pg(`SELECT
        (SELECT COUNT(*) FROM leads WHERE quality_fit=TRUE AND COALESCE(lifecycle_stage,'')='qualified'
           AND COALESCE(audit_verified,FALSE)=TRUE AND governor_released_at IS NOT NULL
           AND COALESCE(claude_cleared,FALSE)=FALSE) AS pending,
        (SELECT COUNT(*) FROM leads WHERE COALESCE(claude_cleared,FALSE)=TRUE
           AND claude_reviewed_at::date = (NOW() AT TIME ZONE 'Europe/London')::date) AS cleared_today`).trim();
    // the scripts/psql shim delimits multiple columns with a TAB (not '|'); split on \t.
    const [pending, clearedToday] = (r.split('\n')[0] || '0\t0').split('\t');
    return `[claude-safeguard] queue-pending=${pending} cleared-today=${clearedToday}`;
  } catch (e) { return `[claude-safeguard] stats unavailable: ${e.message}`; }
}

(function main() {
  if (!NEON()) { console.log('[claude-safeguard] no NEON_URL — nothing to do.'); return; }
  const batch = arg('batch', null);
  let note = null;
  try { note = normNote(arg('note', null)); } catch (e) { console.error('[claude-safeguard] ' + e.message); process.exit(2); }

  // ---- PULL: print the work queue as JSON lines. ----
  if (has('pull')) {
    const i = process.argv.indexOf('--pull');
    const nRaw = process.argv[i + 1];
    const n = (nRaw && !nRaw.startsWith('--')) ? parseInt(nRaw, 10) : 50;
    const sql = pullSql(Number.isFinite(n) ? n : 50, batch);
    if (DRY) { console.log(sql); return; }
    let raw; try { raw = pg(sql); } catch (e) { console.log('[claude-safeguard] pull error: ' + e.message); return; }
    let pulled = 0;
    for (const s of raw.split('\n')) { if (!s.trim()) continue; try { JSON.parse(s); console.log(s.trim()); pulled++; } catch (_e) { /* skip malformed line */ } }
    console.log(`[claude-safeguard] pulled=${pulled}${batch ? ' batch=' + batch : ''}`);
    console.log(statsFooter());
    return;
  }

  // ---- sub-flag clears + finalize: each takes an <id> immediately after the flag. ----
  const clearMap = { 'clear-lead': 'claude_lead_cleared', 'clear-audit': 'claude_audit_cleared', 'clear-touch': 'claude_touch_cleared' };
  for (const flag of Object.keys(clearMap)) {
    if (has(flag)) {
      const id = arg(flag, null);
      if (!id || !Number.isFinite(Number(id))) { console.error(`[claude-safeguard] --${flag} needs a numeric lead id`); process.exit(2); }
      const sql = clearSql(clearMap[flag], id, batch, note);
      if (DRY) { console.log(sql); return; }
      pg(sql);
      console.log(`[claude-safeguard] ${flag} id=${id} -> ${clearMap[flag]}=TRUE${batch ? ' batch=' + batch : ''}`);
      console.log(statsFooter());
      return;
    }
  }

  if (has('finalize')) {
    const id = arg('finalize', null);
    if (!id || !Number.isFinite(Number(id))) { console.error('[claude-safeguard] --finalize needs a numeric lead id'); process.exit(2); }
    const sql = finalizeSql(id, batch, note);
    if (DRY) { console.log(sql); return; }
    pg(sql);
    const v = pg(`SELECT claude_cleared FROM leads WHERE id=${Number(id)}`).trim().split('\n')[0] || '';
    console.log(`[claude-safeguard] finalize id=${id} -> claude_cleared=${v === 't' ? 'TRUE' : v === 'f' ? 'FALSE' : v}`);
    console.log(statsFooter());
    return;
  }

  console.error('usage: claude-safeguard-batch.js --pull [N] | --clear-lead <id> | --clear-audit <id> | --clear-touch <id> | --finalize <id>  [--batch <id>] [--note \'{json}\'] [--dry]');
  process.exit(2);
})();
