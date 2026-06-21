#!/usr/bin/env node
'use strict';
// ============================================================================================================
// APPLY-REVIEW — act on the human (or auto) review verdict written into leads.review_status.
// (LLM-QA-DESIGN.md flow step 4 + the auto-promote path for high-confidence gate-passing rescues.)
// ============================================================================================================
// review_status values acted on (written by the NocoDB review grid / llm-rescue / llm-factcheck):
//   'auto_promote' -> AUTOMATED: re-run the CANONICAL gate (scoreLead) WITH the qa_found data; promote to Tier-1
//                     ONLY if the gate's own verdict is tier==1 AND the entity is NOT consent-required. The gate,
//                     not the LLM, decides. If it does not re-pass, demote the request to human review (unreviewed).
//   'accepted'     -> HUMAN authority: promote to qa_suggested_tier (or 1). STILL consent-gated — a consent_required
//                     entity is NEVER promoted into the cold path (PECR hard gate is never bypassed, even by Accept).
//   'needs_info'   -> stamp review_note as an enrichment hint + reset lifecycle so enrich/qualify/rescue re-run.
//   'rejected'     -> park out of the cold path (lifecycle='rejected'); does NOT suppress (suppression is opt-out only).
//
// Net Tier-1 only goes UP here: this job PROMOTES (accept/auto) and PARKS (reject/needs_info); it never demotes a
// lead that a human did not explicitly reject. SEND stays OFF. Idempotent: each acted lead is stamped reviewed_at +
// review_status='applied_*' so it is not re-processed. Promotion writes the SAME columns qualify-and-queue.js writes.
// ============================================================================================================

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));
const icp = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'icp.js'));
const rescue = require(path.join(ROOT, 'src', 'lib', 'llm-rescue.js'));   // retierWith (canonical re-tier with found data)
let governor = null; try { governor = require(path.join(ROOT, 'src', 'lib', 'governor.js')); } catch (_e) {}

const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON(), '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
const esc = (v) => (v === null || v === undefined) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');

function asObj(v) { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : {}; return (p && typeof p === 'object') ? p : {}; } catch (_e) { return {}; } }

// the consent/entity (PECR) gate — NEVER bypassed, not even by a human Accept.
function isConsentRequired(lead) {
  try {
    const bucket = lead.entity_type ? icp.classifyEntityType(lead.entity_type) : icp.classifyEntityType(lead.company || '', { asName: true });
    return icp.entityNeedsConsent(bucket);
  } catch (_e) { return false; }
}

// Promote a lead to a tier. Tier-1 -> quality_fit=TRUE + lifecycle='qualified' (+ governor release attempt);
// Tier-2 -> pending_approval.
//
// L1 FIX: `q` here is a rescue.retierWith() result = { inputs, tier, tier_reason } (decideTier output), NOT a full
// scoreLead() result. It has NO top-level total_score / sector_fit_score / need_signal_score / contact_quality_score
// / completeness_score / score fields (those live nested in q.inputs, or do not exist). The old code read them off
// the wrong shape, so num(undefined)=0 zeroed EVERY component + quality_score=GREATEST(existing,0) on every promoted
// lead — corrupting the score-of-record AND breaking re-tier idempotency (a re-tier then saw total_score=0<62 and
// could not re-pass Tier-1). A rescue candidate ALREADY carries a valid persisted total_score (it scored >=62), so
// the correct, simplest fix is to PRESERVE the existing persisted scores: we set ONLY icp_tier, quality_fit, the
// tier metadata pointers, lifecycle, and (additively) backfill a rescue-classified sector_code when one is missing.
// We never overwrite total_score / the four component columns / quality_score.
//
// L11 FIX: the promotion and the review_status='applied_*' verdict stamp must commit ATOMICALLY. Previously promote()
// ran the tier UPDATE and the CALLER ran a SECOND pg() for the verdict stamp; the shim opens a fresh connection per
// call (no shared txn), so a crash between the two left a lead promoted but still review_status='auto_promote'/'accepted'
// — the next run re-promoted it. We now fold the caller's verdict-stamp SET clauses (`extraSets`) into the SAME single
// UPDATE so the tier change and the verdict transition land together (one statement, one connection = one commit).
function promote(lead, tier, q, sourceNote, extraSets) {
  const stage = tier === 1 ? 'qualified' : tier === 2 ? 'pending_approval' : 'rejected';
  const inputs = (q && q.inputs) || {};
  const foundSector = inputs.sector_code || null;   // a rescue-classified sector (was NULL) — additive backfill only
  const pointers = { review_promoted: true, review_source: sourceNote, tier, tier_reason: (q && q.tier_reason) || 'human_accept' };
  // sector_code: backfill ONLY when currently blank (never clobber an existing sector); leave all SCORE columns intact.
  const sectorSet = foundSector ? `sector_code=COALESCE(NULLIF(sector_code,''),${esc(foundSector)}),` : '';
  const stamp = Array.isArray(extraSets) && extraSets.length ? (', ' + extraSets.join(', ')) : '';
  const sql = `UPDATE leads SET icp_tier=${tier}, quality_fit=${tier === 1 ? 'TRUE' : 'FALSE'}, ${sectorSet}
      personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify(pointers))}::jsonb,
      lifecycle_stage='${stage}', reviewed_at=NOW()${stamp}
      WHERE id=${Number(lead.id)}`;
  if (DRY) return sql;
  pg(sql);
  // Tier-1: attempt a governor release (per-sector round-robin, 100/day). If held, the lead stays qualified for
  // the nightly sweep. SEND remains OFF; this only makes it governor-release ELIGIBLE. (Idempotent: guarded by
  // governor_released_at IS NULL, so a crash after the atomic promote/stamp and before this just leaves the lead
  // qualified-but-unreleased for the nightly sweep — never a re-promote.)
  if (tier === 1 && governor) {
    let gov = { ok: false };
    try { gov = governor.canReleaseLead({ sector_code: foundSector || lead.sector_code }); } catch (_e) {}
    if (gov.ok) { try { pg(`UPDATE leads SET governor_released_at=NOW() WHERE id=${Number(lead.id)} AND governor_released_at IS NULL`); } catch (_e) {} }
  }
  return sql;
}

async function applyOne(lead) {
  const verdict = String(lead.review_status || '').toLowerCase().trim();
  const found = asObj(lead.qa_found);
  const consent = isConsentRequired(lead);

  // ---- AUTO-PROMOTE: the GATE decides. Re-run the canonical scorer with the found data; promote ONLY on tier==1. ----
  if (verdict === 'auto_promote') {
    if (consent) {
      // entity is consent-required -> NEVER auto-promote into the cold path. Demote to human review.
      const sql = `UPDATE leads SET review_status='unreviewed', qa_reason=${esc('Auto-promote BLOCKED: entity is consent-required (PECR). Needs a consented channel.')}, reviewed_at=NOW() WHERE id=${Number(lead.id)}`;
      if (DRY) return { id: lead.id, action: 'auto_promote_blocked_consent', sql };
      pg(sql); return { id: lead.id, action: 'auto_promote_blocked_consent' };
    }
    const after = await rescue.retierWith(lead, found);
    if (after && after.tier === 1) {
      // L11: stamp the verdict transition in the SAME atomic UPDATE as the promotion (was a separate pg() call).
      // L13: write qa_found fields back to live DB columns so future requalify runs see the same data that
      // caused the gate to pass. Without this, contact_name/linkedin_url are missing in DB even though the
      // in-memory retierWith saw them — requalify would then re-score with empty contact and demote to Tier-2.
      const extraSets = [
        `review_status='applied_auto_promote'`, `reviewed_by=COALESCE(reviewed_by,'llm_auto')`, `qa_status='confirmed'`,
      ];
      if (found.dm_name) extraSets.push(`contact_name=COALESCE(NULLIF(contact_name,''), ${esc(found.dm_name)})`);
      if (found.linkedin_url) {
        extraSets.push(`linkedin_url=COALESCE(NULLIF(linkedin_url,''), ${esc(found.linkedin_url)})`);
        extraSets.push(`contact_linkedin=COALESCE(NULLIF(contact_linkedin,''), ${esc(found.linkedin_url)})`);
      }
      if (found.email_verified) {
        extraSets.push(`email_verified=TRUE`);
        extraSets.push(`deliverability='good'`);
      }
      const sql = promote(lead, 1, after, 'auto_promote_gate_verified', extraSets);
      return { id: lead.id, action: 'promoted_tier1_auto', after_tier: 1, sql };
    }
    // gate did NOT re-pass -> do not promote automatically; hand to a human.
    const sql = `UPDATE leads SET review_status='unreviewed', qa_reason=${esc('Auto-promote declined: deterministic gate did not re-pass Tier-1 with found data (now tier ' + (after && after.tier) + '). Human review.')}, reviewed_at=NOW() WHERE id=${Number(lead.id)}`;
    if (DRY) return { id: lead.id, action: 'auto_promote_declined_gate', after_tier: after && after.tier, sql };
    pg(sql); return { id: lead.id, action: 'auto_promote_declined_gate', after_tier: after && after.tier };
  }

  // ---- HUMAN ACCEPT: human authority promotes to qa_suggested_tier (or 1) — STILL consent-gated. ----
  if (verdict === 'accepted') {
    if (consent) {
      const sql = `UPDATE leads SET review_status='applied_accept_consent_held', reviewed_at=NOW(), qa_reason=${esc('Accepted for relevance but entity is consent-required (PECR): NOT promoted into the cold path. Reach via a consented channel.')} WHERE id=${Number(lead.id)}`;
      if (DRY) return { id: lead.id, action: 'accept_consent_held', sql };
      pg(sql); return { id: lead.id, action: 'accept_consent_held' };
    }
    const wantTier = Number(lead.qa_suggested_tier) === 1 || lead.qa_suggested_tier == null ? 1 : Number(lead.qa_suggested_tier);
    // Re-run the gate to populate the component columns consistently, but a human Accept promotes regardless of the
    // gate's tier (the human is the authority for COMMERCIAL tier; the consent gate above is the only hard block).
    const q = await rescue.retierWith(lead, found);
    // L11: stamp the verdict transition in the SAME atomic UPDATE as the promotion.
    // L13: also write back qa_found fields (same rationale as auto_promote path — see L13 comment above).
    const acceptSets = [
      `review_status='applied_accepted'`, `reviewed_by=COALESCE(reviewed_by,'human')`,
    ];
    if (found.dm_name) acceptSets.push(`contact_name=COALESCE(NULLIF(contact_name,''), ${esc(found.dm_name)})`);
    if (found.linkedin_url) {
      acceptSets.push(`linkedin_url=COALESCE(NULLIF(linkedin_url,''), ${esc(found.linkedin_url)})`);
      acceptSets.push(`contact_linkedin=COALESCE(NULLIF(contact_linkedin,''), ${esc(found.linkedin_url)})`);
    }
    if (found.email_verified) { acceptSets.push(`email_verified=TRUE`); acceptSets.push(`deliverability='good'`); }
    const sql = promote(lead, wantTier, q, 'human_accept', acceptSets);
    return { id: lead.id, action: 'promoted_human', after_tier: wantTier, sql };
  }

  // ---- NEEDS_INFO: stamp the note as an enrich hint + reset lifecycle so enrich/qualify/rescue re-run. ----
  if (verdict === 'needs_info') {
    const note = String(lead.review_note || '').trim();
    const hint = { review_hint: note, review_requested_at: new Date().toISOString() };
    const sql = `UPDATE leads SET lifecycle_stage='enriched', qa_checked_at=NULL, qa_status='pending',
        personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify(hint))}::jsonb,
        review_status='applied_needs_info', reviewed_at=NOW() WHERE id=${Number(lead.id)}`;
    if (DRY) return { id: lead.id, action: 'needs_info_requeued', sql };
    pg(sql); return { id: lead.id, action: 'needs_info_requeued' };
  }

  // ---- REJECTED: park out of the cold path. NOT suppression (that is reserved for opt-outs). ----
  if (verdict === 'rejected') {
    const sql = `UPDATE leads SET lifecycle_stage='rejected', quality_fit=FALSE, icp_tier=GREATEST(COALESCE(icp_tier,3),2),
        review_status='applied_rejected', reviewed_at=NOW(), qa_status='explained' WHERE id=${Number(lead.id)}`;
    if (DRY) return { id: lead.id, action: 'parked_rejected', sql };
    pg(sql); return { id: lead.id, action: 'parked_rejected' };
  }
  return { id: lead.id, action: 'noop', verdict };
}

(async () => {
  if (!NEON()) { console.log('[apply-review] no NEON_URL'); return; }
  const max = parseInt(arg('max', '200'), 10);
  // act on the four ACTIONABLE verdicts (auto_promote + the three human ones). Already-applied rows are skipped.
  const sql = `SELECT to_jsonb(l) FROM leads l
      WHERE lower(COALESCE(l.review_status,'')) IN ('auto_promote','accepted','needs_info','rejected')
      ORDER BY (lower(l.review_status)='auto_promote') DESC, COALESCE(l.qa_confidence,0) DESC, l.id DESC
      LIMIT ${Math.max(1, max)}`;
  let raw;
  try { raw = pg(sql); } catch (e) { console.log('[apply-review] query error: ' + e.message); return; }
  // L12: parse rows PER-ROW. A single malformed to_jsonb line (NUL byte / truncated) must skip+log, not abort the
  // whole batch (the old `.map(JSON.parse)` threw and lost every actionable lead behind one bad row).
  const rows = []; let skipped = 0;
  for (const s of raw.split('\n')) { if (!s) continue; try { rows.push(JSON.parse(s)); } catch (e) { skipped++; console.log('[apply-review] skipped malformed row: ' + e.message); } }
  if (skipped) console.log(`[apply-review] skipped ${skipped} malformed row(s) (continuing).`);
  if (!rows.length) { console.log('[apply-review] nothing to apply (no actionable review_status).'); return; }
  const counts = {};
  for (const lead of rows) {
    try { const r = await applyOne(lead); counts[r.action] = (counts[r.action] || 0) + 1; if (DRY && r.sql) console.log(`  ${lead.lead_ref || lead.id} -> ${r.action}\n      WOULD: ${String(r.sql).replace(/\s+/g, ' ').slice(0, 220)}...`); else console.log(`  ${lead.lead_ref || lead.id} -> ${r.action}`); }
    catch (e) { console.log(`  ${lead.id} ERROR ${e.message}`); }
  }
  console.log(`[apply-review] applied ${rows.length}${DRY ? ' (DRY)' : ''}: ` + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', '));
})().catch(e => { console.error('[apply-review] fatal (non-blocking):', e.message); process.exit(0); });
