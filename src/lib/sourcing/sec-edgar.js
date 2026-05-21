// SEC EDGAR US sourcing · no key required · 10 req/s rate limit
// Public filings for US-listed companies. Useful for executive personal-brand, healthcare IPOs,
// real-estate developers with SEC-listed parents, and any US-headquartered B2B target.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

const UA = 'Tamazia Lead Sourcing aman@tamazia.co.uk';

async function searchByName(name) {
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"' + name + '"')}&dateRange=custom&startdt=2022-01-01&enddt=2026-05-20&forms=10-K,10-Q,DEF 14A,8-K`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    const hits = (json.hits && json.hits.hits) || [];
    return hits.slice(0, 25).map(h => ({
      company: h._source.display_names ? h._source.display_names[0] : null,
      cik: h._source.ciks ? h._source.ciks[0] : null,
      form: h._source.form,
      filing_date: h._source.file_date,
      sec_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${h._source.ciks ? h._source.ciks[0] : ''}`
    }));
  } catch (_e) { return []; }
}

async function getCompanyTickers() {
  // Annual public file mapping ticker → CIK. Used for US-sector seeding.
  const r = await fetchWithRetry('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    return Object.values(json).map(c => ({ cik: String(c.cik_str).padStart(10, '0'), ticker: c.ticker, name: c.title }));
  } catch (_e) { return []; }
}

async function searchBySicCode(sic) {
  // SIC = Standard Industrial Classification. Used for sector filtering.
  // e.g. SIC 8000 = Healthcare, 6020 = Banks, 7370 = Computer services, 5812 = Eating Places
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${encodeURIComponent(sic)}&type=10-K&dateb=&owner=include&count=40&action=getcompany`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  // Parse the HTML for company names (regex acceptable here — EDGAR's HTML is stable)
  const rows = [];
  const re = /<td[^>]*>(?:<a[^>]*>)?(\d{10})(?:<\/a>)?<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;
  let m;
  while ((m = re.exec(r.body)) !== null && rows.length < 40) {
    rows.push({ cik: m[1], name: m[2].trim() });
  }
  return rows;
}

module.exports = { searchByName, getCompanyTickers, searchBySicCode };

if (require.main === module) {
  (async () => {
    const tickers = await getCompanyTickers();
    console.log('SEC tickers:', tickers.length, '(expect ≥10000)');
    const sic = await searchBySicCode(8000);
    console.log('SIC 8000 healthcare companies:', sic.length, sic.slice(0, 3));
  })();
}
