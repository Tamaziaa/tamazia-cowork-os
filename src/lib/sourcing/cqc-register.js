'use strict';
// CQC (Care Quality Commission) public API (healthcare sector). Names the REGISTERED MANAGER / NOMINATED
// INDIVIDUAL of a care provider — the person accountable to the regulator (the decision-maker). Free API at
// api.cqc.org.uk; needs CQC_API_KEY (free Azure APIM subscription key). Returns [{name,role,source}] or [].
const BASE = 'https://api.cqc.org.uk/public/v1';
async function getJSON(url, headers, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers, signal: c.signal }); if (!r.ok) return null; return await r.json(); }
  catch (_) { return null; } finally { clearTimeout(t); }
}
const { normalizePersonName } = require('./fca-register.js');
async function cqcOfficers({ company, providerId, env = process.env } = {}) {
  const key = env.CQC_API_KEY;
  const partnerCode = (env.CQC_PARTNER_CODE || '').trim();
  if (!key || (!company && !providerId)) return [];
  // The CQC API requires a registered partnerCode on every request; without one, calls are throttled to
  // uselessness. Hard-disable rather than silently firing throttled requests. (Operator key: CQC_PARTNER_CODE)
  if (!partnerCode) { console.log('CQC disabled: no CQC_PARTNER_CODE'); return []; }
  const H = { 'Ocp-Apim-Subscription-Key': key, 'Accept': 'application/json' };
  const pc = `partnerCode=${encodeURIComponent(partnerCode)}`;
  try {
    // ?name= free-text provider search is UNSUPPORTED by the CQC API: a real lookup needs a providerId.
    // Name-only calls return [] gracefully instead of relying on an endpoint that does not exist.
    if (!providerId) return [];
    const detail = await getJSON(`${BASE}/providers/${encodeURIComponent(providerId)}?${pc}`, H);
    if (!detail) return [];
    const out = [];
    // Nominated individual lives inside regulatedActivities[] (there is no "Registered Manager" field).
    const acts = detail.regulatedActivities || [];
    for (const a of acts) {
      const ni = a.nominatedIndividual;
      if (ni && (ni.personGivenName || ni.personFamilyName)) {
        const nm = normalizePersonName(`${ni.personGivenName || ''} ${ni.personFamilyName || ''}`.trim());
        if (nm) { out.push({ name: nm, role: 'Nominated Individual', source: 'cqc_register' }); break; }
      }
    }
    return out.slice(0, 8);
  } catch (_) { return []; }
}
module.exports = { cqcOfficers };
