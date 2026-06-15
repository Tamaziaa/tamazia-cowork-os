'use strict';
// ============================================================================================================
// LLM-FACTCHECK — the CONSERVATIVE, NET-POSITIVE secondary pass over the existing Tier-1 set.
// (LLM-QA-DESIGN.md job #2: fact-check is conservative and must NEVER reduce the net Tier-1 count.)
// ============================================================================================================
// For each current Tier-1 lead, verify it genuinely belongs there: a NAMED decision-maker (not a role inbox /
// listicle title / company name masquerading as a person) at a CORRECTLY-IDENTIFIED entity, with an email that is
// not a placeholder/role inbox. We ONLY ever FLAG doubtful ones for HUMAN review (review_status='unreviewed' +
// qa_status='flagged' + a qa_reason explaining the doubt). We NEVER auto-demote — a flagged Tier-1 STAYS Tier-1
// until a human confirms. So this pass can only ever surface a handful for review; the net Tier-1 count cannot
// drop because of it. Clean ones are marked qa_status='confirmed'.
//
// Cheap-first: the doubt signals are mostly DETERMINISTIC (role-local check via the canonical isRoleLocal set,
// listicle-shaped company name, missing/non-personlike contact_name, placeholder email). The LLM is used only to
// adjudicate the borderline "is this contact_name actually a person vs a role/company string" call, via the free
// router, strict JSON. £0; respects LLM_QA_ENABLED for the LLM step (deterministic flags run regardless).
// ============================================================================================================

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));            // isRoleLocal (canonical role set)
const router = require(path.join(ROOT, 'src', 'lib', 'llm', 'router.js'));
let icp = null; try { icp = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'icp.js')); } catch (_e) {}

const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON(), '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
const esc = (v) => (v === null || v === undefined) ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jesc = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
function isEnabled() { return /^(1|true|yes|on)$/i.test(String(process.env.LLM_QA_ENABLED || '')); }

// Deterministic doubt detectors -------------------------------------------------------------------------------
const _PLACEHOLDER_LOCAL = /^(user|you|your|name|email|firstname|lastname|johndoe|john\.doe|jane\.doe|example|test|admin|webmaster|noreply|no-reply|donotreply)$/i;
const _LISTICLE = /(top \d+|best \d+|\bdirectory\b|\bbest\b.*\bin\b|leading \d+|\bvs\b|review(s)? of|near (you|me)|cheap|compare|listings?)/i;
// a string that is clearly NOT a person name (role words, company-shaped, single token, or contains digits/brand suffix).
const _ROLE_WORDS = /(team|office|reception|enquir|enquiries|admin|support|info|sales|marketing|hr|department|secretary|public relations|customer|service|desk|clinic|practice|partners|associates|chambers|group|ltd|limited|llp|plc|inc|company|\bco\b)/i;

function localPartOf(email) { return String(email || '').split('@')[0]; }

// classify the doubt signals for one Tier-1 lead (deterministic). Returns { doubts:[...], severity }.
function deterministicDoubts(lead) {
  const doubts = [];
  const name = String(lead.contact_name || lead.decision_maker_name || '').trim();
  const company = String(lead.company || '').trim();
  const email = String(lead.contact_email || lead.primary_email || '').trim();
  const local = localPartOf(email);
  const haveLi = !!String(lead.contact_linkedin || '').trim() || !!(lead.all_socials && (() => { try { return (typeof lead.all_socials === 'object' ? lead.all_socials : JSON.parse(lead.all_socials)).linkedin; } catch (_) { return false; } })());

  // 1) no named decision-maker at all (Part-C: 230 of 614).
  if (!name) doubts.push('no_named_dm');
  else {
    // 2) the "name" is not person-shaped: single token, role word, contains digits, or == company.
    const tokens = name.split(/\s+/);
    if (tokens.length < 2) doubts.push('dm_name_single_token');
    if (_ROLE_WORDS.test(name)) doubts.push('dm_name_looks_like_role');
    if (/\d/.test(name)) doubts.push('dm_name_has_digits');
    if (company && name.toLowerCase() === company.toLowerCase()) doubts.push('dm_name_equals_company');
  }
  // 3) email is a role inbox (canonical set) or a placeholder -> not a real personal DM email.
  if (email) {
    try { if (lq.isRoleLocal(local)) doubts.push('email_is_role_inbox'); } catch (_e) {}
    if (_PLACEHOLDER_LOCAL.test(local.replace(/[._\-+].*$/, ''))) doubts.push('email_is_placeholder');
  }
  // 4) no LinkedIn (Part-C: 51 of 614) — LinkedIn is a hard Tier-1 AND, so a Tier-1 without it is suspicious.
  if (!haveLi) doubts.push('no_linkedin');
  // 5) company name is a listicle/SERP-title shape (mis-identified entity).
  if (company && _LISTICLE.test(company)) doubts.push('company_name_listicle_shaped');
  // 6) entity classified consent-required would be a hard contradiction with Tier-1 (should already be gated, but flag).
  if (icp && company) { try { const b = lead.entity_type ? icp.classifyEntityType(lead.entity_type) : icp.classifyEntityType(company, { asName: true }); if (b === 'sole_trader' || b === 'partnership') doubts.push('entity_consent_required'); } catch (_e) {} }

  // severity: STRONG doubt = the "DM" is provably a role inbox or a placeholder, or entity is consent-required.
  // Those are the only ones the design lets us flag with high confidence; the rest are softer.
  const strong = doubts.some(d => ['email_is_role_inbox', 'email_is_placeholder', 'entity_consent_required', 'dm_name_equals_company'].includes(d));
  return { doubts, strong };
}

// LLM adjudication (borderline only): is contact_name a real PERSON, or a role/company/placeholder string?
// Strict JSON. Used only when there is a name but deterministic checks were ambiguous. £0 free router.
async function llmIsRealPerson({ name, company, role }) {
  const sys = 'You decide if a string is a real individual person\'s name (not a role, team, department, or company name). Return strict JSON only.';
  const prompt = `String: "${name}"\nCompany: "${company || ''}"\nRole field: "${role || ''}"\nIs "${name}" a real individual person\'s full name?\nReturn JSON: {"is_person": true|false, "confidence": <0-100>, "why": "<short>"}`;
  const r = await router.run({ system: sys, prompt, role: 'classify', json: true, max_tokens: 120, temperature: 0 });
  if (!r || !r.ok) return { ok: false, cost: (r && r.cost_usd_micro) || 0, model: r && (r.provider + '/' + r.model) };
  let obj = null; try { const t = r.text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(); const m = t.match(/\{[\s\S]*\}/); obj = JSON.parse(m ? m[0] : t); } catch (_e) {}
  if (!obj) return { ok: false, cost: r.cost_usd_micro || 0, model: r.provider + '/' + r.model };
  return { ok: true, is_person: !!obj.is_person, confidence: Math.max(0, Math.min(100, Number(obj.confidence || 0))), why: obj.why || '', cost: r.cost_usd_micro || 0, model: r.provider + '/' + r.model };
}

// fact-check one Tier-1 lead. Returns the verdict (confirmed / flagged) + advisory write payload. NEVER demotes.
async function factcheckLead(lead, { useLlm = true } = {}) {
  const { doubts, strong } = deterministicDoubts(lead);
  let model = 'deterministic';
  let cost = 0;
  let confidence = 100; // confidence that it is correctly Tier-1; lowered as doubts mount

  // borderline LLM adjudication: there IS a name and the only doubt is a soft name-shape flag — ask the model.
  const name = String(lead.contact_name || lead.decision_maker_name || '').trim();
  const softNameDoubt = doubts.includes('dm_name_looks_like_role') || doubts.includes('dm_name_single_token');
  if (useLlm && isEnabled() && name && softNameDoubt && !strong) {
    const a = await llmIsRealPerson({ name, company: lead.company, role: lead.contact_title || lead.decision_maker_title });
    cost += a.cost || 0; if (a.model) model = a.model;
    if (a.ok && a.is_person && a.confidence >= 60) {
      // model clears the name -> drop the soft name doubts (the LLM rescued the doubt).
      for (const d of ['dm_name_looks_like_role', 'dm_name_single_token']) { const i = doubts.indexOf(d); if (i >= 0) doubts.splice(i, 1); }
    } else if (a.ok && !a.is_person && a.confidence >= 60) {
      doubts.push('llm_name_not_person');
    }
  }

  const flagged = doubts.length > 0;
  // confidence-it-is-Tier-1: 100 minus a penalty per doubt (strong doubts penalise more). Floor 0.
  const penalty = doubts.reduce((s, d) => s + (['email_is_role_inbox', 'email_is_placeholder', 'entity_consent_required', 'dm_name_equals_company', 'llm_name_not_person'].includes(d) ? 35 : 15), 0);
  confidence = Math.max(0, 100 - penalty);

  let reason, qa_status, review_status = null;
  if (!flagged) {
    qa_status = 'confirmed';
    reason = 'Tier-1 verified: named DM + reachable email + LinkedIn, entity is corporate.';
  } else {
    qa_status = 'flagged';
    review_status = 'unreviewed'; // HUMAN review only — never auto-demote.
    const human = doubts.map(d => ({
      no_named_dm: 'no named decision-maker', dm_name_single_token: 'DM name is a single token',
      dm_name_looks_like_role: 'DM "name" looks like a role/team', dm_name_has_digits: 'DM name contains digits',
      dm_name_equals_company: 'DM name equals the company name', email_is_role_inbox: 'primary email is a role inbox',
      email_is_placeholder: 'primary email is a placeholder', no_linkedin: 'no LinkedIn URL',
      company_name_listicle_shaped: 'company name looks like a listicle/SERP title', entity_consent_required: 'entity looks consent-required (sole trader/partnership)',
      llm_name_not_person: 'name is not a real person',
    }[d] || d));
    reason = `KEEP Tier-1 pending review. Doubt: ${human.join('; ')}. (Not auto-demoted — verify the named DM/email/entity.)`;
  }
  return { lead_id: lead.id, lead_ref: lead.lead_ref, company: lead.company, doubts, strong, flagged, confidence, model, reason, qa_status, review_status, cost_usd_micro: cost };
}

function writeFactcheck(res, { dry = false } = {}) {
  const sets = [
    `qa_reason = ${esc(res.reason)}`,
    `qa_confidence = ${Math.round(res.confidence)}`,
    `qa_model = ${esc(res.model)}`,
    `qa_status = ${esc(res.qa_status)}`,
    `qa_found = COALESCE(qa_found,'{}'::jsonb) || ${jesc({ factcheck_doubts: res.doubts })}`,
    `qa_checked_at = NOW()`,
  ];
  // flagged -> set review_status for a human, but NEVER clobber an existing human verdict and NEVER touch icp_tier.
  if (res.review_status) sets.push(`review_status = COALESCE(NULLIF(review_status,''), ${esc(res.review_status)})`);
  const sql = `UPDATE leads SET ${sets.join(', ')} WHERE id = ${Number(res.lead_id)} AND icp_tier = 1`; // scope-guard: only ever touch a Tier-1 row
  if (dry) return { sql, wrote: false };
  pg(sql);
  return { sql, wrote: true };
}

// Run the fact-check over the current Tier-1 set (cost-capped). Deterministic doubts always run; the LLM borderline
// step runs only when LLM_QA_ENABLED. NEVER demotes. dry prints would-writes.
async function runFactcheck({ max = 20, dry = false, force = false, recheckHours = 168 } = {}) {
  if (!NEON()) return { ok: false, error: 'no NEON_URL', processed: 0 };
  const freshGuard = force ? '' : `AND (qa_checked_at IS NULL OR qa_checked_at < NOW() - INTERVAL '${Math.max(1, recheckHours)} hours' OR COALESCE(qa_status,'') NOT IN ('confirmed','flagged'))`;
  const sql = `SELECT to_jsonb(l) FROM leads l WHERE l.icp_tier = 1 ${freshGuard}
      ORDER BY COALESCE(quality_score,0) DESC NULLS LAST, id DESC LIMIT ${Math.max(1, Number(max) || 20)}`;
  let rows = [];
  try { rows = pg(sql).split('\n').filter(Boolean).map(s => JSON.parse(s)); } catch (e) { return { ok: false, error: e.message, processed: 0 }; }
  const results = []; let cost = 0;
  for (const lead of rows) {
    try { const res = await factcheckLead(lead, { useLlm: true }); cost += res.cost_usd_micro || 0; const w = writeFactcheck(res, { dry }); results.push({ ...res, _sql: dry ? w.sql : undefined }); }
    catch (e) { results.push({ lead_id: lead.id, error: e.message }); }
  }
  const flagged = results.filter(r => r.flagged).length;
  return { ok: true, processed: results.length, flagged, confirmed: results.length - flagged, total_cost_usd_micro: cost, dry, results };
}

module.exports = { runFactcheck, factcheckLead, deterministicDoubts, writeFactcheck, isEnabled };
