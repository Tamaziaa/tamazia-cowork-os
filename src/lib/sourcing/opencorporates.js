// OpenCorporates · global registry · free tier (no key for basic search)
// Used for jurisdictions not covered by single national registry (CA, BR, MX, NZ, AU, EU states)

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Tamazia Lead Sourcing aman@tamazia.co.uk';
const BASE = 'https://api.opencorporates.com/v0.4';

function keyParam() { return process.env.OPENCORPORATES_KEY ? `&api_token=${process.env.OPENCORPORATES_KEY}` : ''; }

async function searchCompanies({ q, jurisdiction, per_page = 30 }) {
  let url = `${BASE}/companies/search?q=${encodeURIComponent(q)}&per_page=${per_page}${keyParam()}`;
  if (jurisdiction) url += `&jurisdiction_code=${encodeURIComponent(jurisdiction.toLowerCase())}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    return ((json.results && json.results.companies) || []).map(c => c.company).map(c => ({
      company_number: c.company_number,
      company: c.name,
      jurisdiction: c.jurisdiction_code,
      company_status: c.current_status || c.inactive ? 'inactive' : 'active',
      incorporation_date: c.incorporation_date,
      address: c.registered_address_in_full,
      opencorporates_url: c.opencorporates_url
    }));
  } catch (_e) { return []; }
}

async function getCompany(company_number, jurisdiction) {
  const url = `${BASE}/companies/${encodeURIComponent(jurisdiction.toLowerCase())}/${encodeURIComponent(company_number)}?${keyParam().slice(1)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, timeout: 15000, retries: 1 });
  if (!r.ok) return null;
  try { return JSON.parse(r.body); } catch (_e) { return null; }
}

module.exports = { searchCompanies, getCompany };

if (require.main === module) {
  (async () => {
    const r = await searchCompanies({ q: 'arbitration', jurisdiction: 'gb' });
    console.log('OpenCorporates GB arbitration:', r.length);
    console.log(JSON.stringify(r.slice(0, 3), null, 2));
  })();
}
