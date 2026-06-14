// Universal gate + event log. Every action passes a gate; the gate runs its checks, LOGS the decision
// to gate_events, and only returns pass=true if all checks pass. Nothing erroneous proceeds, and every
// action/event is always saved. Fail-open on the LOGGING (never blocks on a logging failure) but
// fail-CLOSED on the gate decision (a failing check means pass=false).
'use strict';
const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function sql(query) {
  const u = NEON(); if (!u) return { ok: false };
  try { const host = u.replace(/.*@([^/]+)\/.*/, '$1'); const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': u, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, params: [] }), signal: AbortSignal.timeout(15000) }); return { ok: r.ok }; } catch (_) { return { ok: false }; }
}
const esc = s => String(s == null ? '' : s).replace(/'/g, "''");

// checks: [{ name, fn }] where fn(payload) → true | false | { ok, reason }
async function runGate(action, payload = {}, checks = [], opts = {}) {
  const results = [];
  for (const c of checks) {
    let ok = false, reason = '';
    try { const r = await c.fn(payload); if (typeof r === 'object' && r !== null) { ok = !!r.ok; reason = r.reason || ''; } else { ok = !!r; } }
    catch (e) { ok = false; reason = 'check_threw:' + (e && e.message || ''); }
    results.push({ name: c.name, ok, reason });
  }
  const failed = results.filter(r => !r.ok);
  const pass = failed.length === 0;
  const entity = String(payload.entity || payload.domain || payload.lead_id || payload.id || '').slice(0, 200);
  // always log (fail-open on logging)
  if (NEON() && opts.log !== false) {
    const checksJson = esc(JSON.stringify(results)).slice(0, 4000);
    await sql(`INSERT INTO gate_events (action, entity, pass, checks, reasons, occurred_at) VALUES ('${esc(action)}', '${esc(entity)}', ${pass ? 'TRUE' : 'FALSE'}, '${checksJson}'::jsonb, '${esc(failed.map(f => f.name + ':' + f.reason).join('; ')).slice(0, 500)}', NOW())`);
  }
  return { pass, failed: failed.map(f => f.name), reasons: failed.map(f => f.name + ':' + f.reason), checks: results };
}

// Common reusable checks
const checks = {
  nonEmpty: (field) => ({ name: 'nonEmpty:' + field, fn: (p) => ({ ok: !!(p && p[field] != null && String(p[field]).trim() !== ''), reason: 'missing ' + field }) }),
  evidenceBacked: (claimsField, evidenceField) => ({ name: 'evidence_backed', fn: (p) => {
    const claims = (p && p[claimsField]) || []; const ev = JSON.stringify((p && p[evidenceField]) || {}).toLowerCase();
    const bad = claims.filter(c => c && c.verified === false);
    return { ok: bad.length === 0, reason: bad.length + ' unverified claim(s)' };
  } }),
  verifiedContact: { name: 'verified_contact', fn: (p) => ({ ok: !!(p && p.email && p.email_verified), reason: 'no verified email' }) },
  notSuppressed: { name: 'not_suppressed', fn: (p) => ({ ok: !(p && p.suppressed), reason: 'suppressed/opted-out' }) },
  emailLength: (maxWords = 120, maxSubject = 65) => ({ name: 'email_length', fn: (p) => {
    const words = String(p.body || '').trim().split(/\s+/).filter(Boolean).length;
    const subj = String(p.subject || '').length;
    if (words > maxWords) return { ok: false, reason: 'body ' + words + 'w > ' + maxWords };
    if (subj > maxSubject) return { ok: false, reason: 'subject ' + subj + 'ch > ' + maxSubject };
    if (words < 25) return { ok: false, reason: 'body too short ' + words + 'w' };
    return { ok: true };
  } }),
};
// Foolproof placeholder check — no email leaves with an unfilled variable. Catches {x} templates,
// undefined/null/NaN, [square] placeholders, empty quotes, and the tell-tale gaps an empty variable
// leaves behind ("and  is", "Best UK  2026", "#undefined").
// Strict no-dash rule. Replaces em/en dashes and ' - ' used as a pause with clean punctuation,
// and leaves hyphenated words (e.g. 'co-founder', 'top-3') intact.
function noDashes(text) {
  return String(text || '')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')   // em/en dash → comma
    .replace(/(\S)\s+-\s+(\S)/g, '$1, $2')      // ' - ' pause → comma (keeps in-word hyphens)
    .replace(/, ,/g, ',').replace(/\s+,/g, ',');
}
function hasDashPause(text) { return /[\u2014\u2013]/.test(String(text || '')) || /\S\s+-\s+\S/.test(String(text || '')); }
function validatePlaceholders(subject, body) {
  const t = String(subject || '') + '\n' + String(body || '');
  const issues = [];
  if (/\{[a-zA-Z0-9_]+\}/.test(t)) issues.push('unfilled_braces');
  if (/(^|[^a-z])(undefined|null|NaN)([^a-z]|$)/i.test(t)) issues.push('undefined_null');
  if (/\[[a-zA-Z][a-zA-Z _-]{1,30}\]/.test(t)) issues.push('square_placeholder');
  if (/""|''/.test(t)) issues.push('empty_quotes');
  if (/\b(and|publishing|on|for)\s{2,}\S/.test(t) || /\S {3,}\S/.test(t)) issues.push('empty_var_gap');
  if (/Best UK\s{2,}|Best\s+in\s/i.test(t)) issues.push('empty_sector');
  if (/#(undefined|null|NaN|0\b)/.test(t)) issues.push('bad_position');
  return { ok: issues.length === 0, issues };
}
// Full pre-send email gate: length + placeholders + a real audit link when the touch needs one.
function validateEmail(subject, body, opts = {}) {
  const len = checkEmailLength(subject, body, opts.maxWords || 130, opts.maxSubject || 70);
  const ph = validatePlaceholders(subject, body);
  const needsLink = !!opts.requireAuditUrl;
  const linkOk = !needsLink || /https?:\/\/[^ ]+\/audit\//.test(String(body || '')) || /https?:\/\//.test(String(opts.audit_url || ''));
  // curated = the body carries real, lead-specific substance (a keyword-ranking line or a named finding),
  // not just the generic fallback. Prevents sending a hollow email to a lead we have no real signal for.
  const curatedOk = !opts.requireCurated || /"[^"]+"\s*[:\u2014-]\s*(#\d+|outside the top 100|not on page one)/.test(String(body || '')) || /flag(s|ged)?\s+[a-z]/.test(String(body || ''));
  const dashOk = !hasDashPause(String(subject || '') + '\n' + String(body || ''));
  const ok = len.ok && ph.ok && linkOk && curatedOk && dashOk;
  return { ok, length: len, placeholders: ph, link_ok: linkOk, curated_ok: curatedOk, reasons: [...(len.ok ? [] : ['length:' + JSON.stringify(len)]), ...(ph.ok ? [] : ['placeholders:' + ph.issues.join(',')]), ...(linkOk ? [] : ['missing_audit_link']), ...(curatedOk ? [] : ['not_curated']), ...(dashOk ? [] : ['contains_dash'])] };
}
// Convenience: validate an email's subject+body length. Returns { ok, body_words, subject_chars }.
function checkEmailLength(subject, body, maxWords = 120, maxSubject = 65) {
  const body_words = String(body || '').trim().split(/\s+/).filter(Boolean).length;
  const subject_chars = String(subject || '').length;
  return { ok: body_words >= 25 && body_words <= maxWords && subject_chars <= maxSubject, body_words, subject_chars };
}

module.exports = { runGate, checks, checkEmailLength, validatePlaceholders, validateEmail, noDashes, hasDashPause };
