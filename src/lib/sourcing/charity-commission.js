// UK Charity Commission · open data search · no key required for register search
// Endpoint: register-of-charities.charitycommission.gov.uk/api/internal/Search/Charities
// Returns up to 25 charities per query · paginated · UK has ~170,000 charities
// Throughput: 25 results × paginated to page 10 = 250/query · per sector × 10 sectors = 2500/day

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'application/json,text/html;q=0.9',
  'Accept-Language': 'en-GB,en;q=0.9'
};

async function search({ q = '', classification = '', what_charity_does = '', take = 25, skip = 0 }) {
  // Endpoint reverse-engineered from the public search UI
  const url = `https://register-of-charities.charitycommission.gov.uk/api/internal/Search/Charities?searchTerm=${encodeURIComponent(q)}&classifications=${encodeURIComponent(classification)}&whatTheCharityDoes=${encodeURIComponent(what_charity_does)}&take=${take}&skip=${skip}`;
  const r = await fetchWithRetry(url, { headers: BROWSER_HEADERS, timeout: 18000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    const items = json?.searchResults || json?.SearchResults || [];
    return items.map(c => ({
      source: 'charity_commission',
      company: c.charity_name || c.CharityName,
      domain: extractDomain(c.charity_contact_web_address || c.WebAddress || c.charity_email_address),
      sector: 'charity',
      jurisdiction: 'UK',
      city: c.charity_contact_address?.address_line_1 || c.charity_contact_postal_code ? extractCity(c.charity_contact_address) : null,
      email: c.charity_email_address || null,
      phone: c.charity_contact_telephone || c.charity_contact_phone || null,
      registration_number: c.reg_charity_number || c.RegCharityNumber,
      activities: c.charity_activities || c.activities || null,
      classification: c.classifications || c.what_charity_does,
      annual_income: c.last_annual_report_year_end || null,
      website: c.charity_contact_web_address || null,
      raw: c
    })).filter(r => r.company);
  } catch (_e) { return []; }
}

function extractDomain(url) {
  if (!url) return null;
  if (url.includes('@')) return url.split('@').pop().toLowerCase();
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_e) { return null; }
}
function extractCity(addr) {
  if (!addr || typeof addr !== 'object') return null;
  return addr.locality || addr.city || addr.address_line_3 || null;
}

// OFFICIAL Charity Commission Register API (keyed, auto-activates on key landing) ----------------------
// The KEYLESS internal-search endpoint above was reverse-engineered from the public UI and the Commission
// migrated that site (it now returns 404 — verified 2026-06-16), so search() fails open to []. The OFFICIAL
// supported API (api.charitycommission.gov.uk/register/api) is live but needs an Azure APIM subscription key
// (Ocp-Apim-Subscription-Key = CHARITY_COMMISSION_API_KEY; free signup, founder has none yet -> 401). This
// keyed path mirrors the CQC/FCA pattern: when the key is absent it returns [] (fail-open); the moment a key
// is set it auto-activates with NO code change. searchCharityName -> a name list; we map the documented
// fields defensively (the API returns snake_case charity_* fields) to the SAME row shape as search().
const CC_OFFICIAL_BASE = 'https://api.charitycommission.gov.uk/register/api';
async function searchOfficial({ q = '', take = 25, env = process.env } = {}) {
  const key = env.CHARITY_COMMISSION_API_KEY || env.CHARITY_API_KEY;
  if (!key || !q) return [];                                  // keyed-only path -> fail-open without a key
  const url = `${CC_OFFICIAL_BASE}/searchCharityName/${encodeURIComponent(q)}`;
  const r = await fetchWithRetry(url, { headers: { 'Ocp-Apim-Subscription-Key': key, 'Accept': 'application/json' }, timeout: 18000, retries: 1 });
  if (!r.ok) return [];                                       // 401/403/5xx/timeout -> [] (never throw)
  try {
    const json = JSON.parse(r.body);
    const items = Array.isArray(json) ? json : (json?.charities || json?.Charities || []);
    return items.slice(0, take).map(c => ({
      source: 'charity_commission',
      company: c.charity_name || c.CharityName || c.charity_title || null,
      domain: extractDomain(c.charity_contact_web || c.charity_contact_web_address || c.web_address || c.charity_email_address),
      sector: 'charity',
      jurisdiction: 'UK',
      city: c.charity_contact_address?.address_line_1 || null,
      email: c.charity_email_address || null,
      phone: c.charity_contact_phone || c.charity_contact_telephone || null,
      registration_number: c.reg_charity_number || c.charity_number || c.organisation_number || c.RegCharityNumber,
      classification: c.classifications || null,
      website: c.charity_contact_web || c.charity_contact_web_address || c.web_address || null,
      raw: c
    })).filter(x => x.company);
  } catch (_e) { return []; }
}

async function bulkSearch({ classifications = ['101','102','103','104','105'], pages_per_classification = 4 } = {}) {
  // Classifications: 101=Education/Training, 102=Health, 103=Disability, 104=Religion, 105=Arts/Culture
  const out = [];
  for (const c of classifications) {
    for (let p = 0; p < pages_per_classification; p++) {
      const r = await search({ classification: c, take: 25, skip: p * 25 });
      out.push(...r);
      if (r.length === 0) break; // exhausted this classification
      await new Promise(r => setTimeout(r, 800)); // polite throttle
    }
  }
  return out;
}

module.exports = { search, searchOfficial, bulkSearch };

if (require.main === module) {
  (async () => {
    const r = await search({ q: 'education', take: 25 });
    console.log('Charity Commission search "education":', r.length);
    if (r[0]) console.log(JSON.stringify(r[0], null, 2).slice(0, 800));
  })();
}
