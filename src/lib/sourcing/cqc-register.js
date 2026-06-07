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
async function cqcOfficers({ company, env = process.env } = {}) {
  const key = env.CQC_API_KEY;
  if (!key || !company) return [];
  const H = { 'Ocp-Apim-Subscription-Key': key, 'Accept': 'application/json' };
  try {
    // Find a provider by name, then read its detail for the registered manager / nominated individual.
    const search = await getJSON(`${BASE}/providers?perPage=5&page=1&partnerCode=&name=${encodeURIComponent(company)}`, H);
    const list = (search && (search.providers || search.locations)) || [];
    const out = [];
    for (const p of list.slice(0, 3)) {
      const id = p.providerId || p.locationId; if (!id) continue;
      const detail = await getJSON(`${BASE}/providers/${id}`, H);
      if (!detail) continue;
      const ni = detail.nominatedIndividual || (detail.contacts || []).find(c => /nominated|registered manager/i.test((c.personRoles || []).join(' ') || c.role || ''));
      const nm = ni && (ni.personGivenName ? `${ni.personGivenName} ${ni.personFamilyName || ''}`.trim() : (ni.name || ''));
      if (nm) out.push({ name: nm, role: 'Nominated Individual / Registered Manager', source: 'cqc_register' });
    }
    return out.slice(0, 8);
  } catch (_) { return []; }
}
module.exports = { cqcOfficers };
