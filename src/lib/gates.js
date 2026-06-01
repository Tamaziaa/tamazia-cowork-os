// Universal gate + event log. Every action passes a gate; the gate runs its checks, LOGS the decision
// to gate_events, and only returns pass=true if all checks pass. Nothing erroneous proceeds, and every
// action/event is always saved. Fail-open on the LOGGING (never blocks on a logging failure) but
// fail-CLOSED on the gate decision (a failing check means pass=false).
'use strict';
const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function sql(query) {
  const u = NEON(); if (!u) return { ok: false };
  try { const host = u.replace(/.*@([^/]+)\/.*/, '$1'); const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': u, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, params: [] }) }); return { ok: r.ok }; } catch (_) { return { ok: false }; }
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
};

module.exports = { runGate, checks };
