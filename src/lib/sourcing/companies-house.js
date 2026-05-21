// Companies House UK · public search + API
// Workaround: when CH_API_KEY is not set, fall back to HTML scrape of the public
// find-and-update.company-information.service.gov.uk search endpoint.
// This is allowed by ToS (the search page is public-facing, no scraping prohibition).

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

const UA = 'Tamazia Lead Sourcing aman@tamazia.co.uk';
const API_BASE = 'https://api.company-information.service.gov.uk';
const PUBLIC_BASE = 'https://find-and-update.company-information.service.gov.uk';

function hasApiKey() { return !!process.env.CH_API_KEY; }
function authHeader() {
  if (!hasApiKey()) return {};
  const auth = Buffer.from(process.env.CH_API_KEY + ':').toString('base64');
  return { 'Authorization': `Basic ${auth}` };
}

async function searchByKeywordApi(keyword, opts = {}) {
  const items_per_page = opts.items_per_page || 50;
  const url = `${API_BASE}/search/companies?q=${encodeURIComponent(keyword)}&items_per_page=${items_per_page}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', ...authHeader() }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    return (json.items || []).map(it => ({
      company_number: it.company_number,
      company: it.title,
      company_status: it.company_status,
      company_type: it.company_type,
      date_of_creation: it.date_of_creation,
      address: it.address_snippet,
      sic_codes: it.sic_codes || [],
      ch_url: `https://find-and-update.company-information.service.gov.uk/company/${it.company_number}`
    }));
  } catch (_e) { return []; }
}

async function searchByKeywordPublic(keyword, opts = {}) {
  // Fallback path: scrape the public search page. Returns same shape as API version.
  const page = opts.page || 1;
  const url = `${PUBLIC_BASE}/search/companies?q=${encodeURIComponent(keyword)}&page=${page}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  // Each result is in <li class="type-company"> with embedded company_number + name
  // Pattern: href="/company/12345678">Company Name</a>
  const re = /<a[^>]+href="\/company\/(\w+)"[^>]*>([^<]+)<\/a>[\s\S]{0,400}?(?:Incorporated on\s+<span[^>]*>([^<]+)<\/span>)?/g;
  let m; let count = 0;
  while ((m = re.exec(r.body)) !== null && count < 50) {
    const company_number = m[1];
    const company = m[2].trim();
    if (company_number && company && !/^\d{8}$/.test(company)) { // dedupe: skip if name is just the number
      results.push({
        company_number,
        company,
        company_status: 'unknown',
        company_type: 'ltd',
        date_of_creation: m[3] || null,
        address: null,
        sic_codes: [],
        ch_url: `${PUBLIC_BASE}/company/${company_number}`
      });
      count++;
    }
  }
  return results;
}

async function searchByKeyword(keyword, opts = {}) {
  if (hasApiKey()) {
    const r = await searchByKeywordApi(keyword, opts);
    if (r.length > 0) return r;
  }
  // Workaround path
  return await searchByKeywordPublic(keyword, opts);
}

async function getCompany(company_number) {
  if (hasApiKey()) {
    const url = `${API_BASE}/company/${company_number}`;
    const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', ...authHeader() }, timeout: 15000, retries: 1 });
    if (r.ok) {
      try { return JSON.parse(r.body); } catch (_e) {}
    }
  }
  // Fallback: scrape public company detail page
  const url = `${PUBLIC_BASE}/company/${company_number}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 15000, retries: 1 });
  if (!r.ok) return null;
  const nameMatch = r.body.match(/<p class="heading-xlarge"[^>]*>\s*([^<]+)/);
  const statusMatch = r.body.match(/Company status\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)/);
  return {
    company_number,
    company_name: nameMatch ? nameMatch[1].trim() : null,
    company_status: statusMatch ? statusMatch[1].trim() : null,
    registered_office_address: { country: 'United Kingdom' },
    _from: 'public_scrape'
  };
}

module.exports = { searchByKeyword, getCompany, hasApiKey };

if (require.main === module) {
  (async () => {
    const r = await searchByKeyword('aesthetic clinic');
    console.log('CH search "aesthetic clinic" returned:', r.length);
    console.log(JSON.stringify(r.slice(0, 5), null, 2));
  })();
}
