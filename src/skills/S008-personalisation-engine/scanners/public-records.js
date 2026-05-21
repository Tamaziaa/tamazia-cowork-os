// Public records scanner · Phase 6 task 6.2.7
// Two free sources:
//   1. Companies House (UK) — search by company name, returns company number, status, type, accounts state
//   2. RDAP / WHOIS — domain registration date, registrar, expiry
//
// Both are free public APIs. Companies House requires CH_API_KEY (HTTP basic, key as username).

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const SCANNER = 'public_records';

async function scan({ domain, company, country = 'UK', cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cacheKey = `${domain}|${company || ''}|${country}`;
  const cached = getCached({ domain: cacheKey, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  const isPrivateHost = /^(127\.|10\.|192\.168\.|localhost)/.test(domain) || /^\d/.test(domain);
  const [ch, rdap] = await Promise.all([
    (country === 'UK' && !isPrivateHost) ? companiesHouseSearch({ company: company || domain.split('.')[0] }) : Promise.resolve({ ok: false, reason: isPrivateHost ? 'private_host_skipped' : 'non-uk-jurisdiction' }),
    isPrivateHost ? Promise.resolve({ ok: false, reason: 'private_host_skipped' }) : rdapLookup({ domain })
  ]);

  const issues = [];
  if (country === 'UK' && ch.ok && ch.matches.length === 0) {
    issues.push({ severity: 'P1', id: 'no_companies_house_match', evidence_url: 'https://find-and-update.company-information.service.gov.uk/', fact: `No Companies House match for "${company || domain.split('.')[0]}"`, recommendation: 'Confirm the legal entity name on the website footer matches the registered name at Companies House' });
  }
  if (country === 'UK' && ch.ok && ch.matches[0]) {
    const m = ch.matches[0];
    if (m.company_status && m.company_status !== 'active') {
      issues.push({ severity: 'P0', id: 'companies_house_status_not_active', evidence_url: `https://find-and-update.company-information.service.gov.uk/company/${m.company_number}`, fact: `Companies House status for ${m.title} is "${m.company_status}" (company number ${m.company_number})`, recommendation: 'Update the legal entity disclosed on the site to match Companies House' });
    }
    if (m.address) {
      // not an issue per se — info only
    }
  }
  if (rdap.ok && rdap.created_year && (new Date().getFullYear() - rdap.created_year) < 1) {
    issues.push({ severity: 'P2', id: 'recently_registered_domain', evidence_url: 'https://rdap.iana.org/', fact: `Domain ${domain} was registered in ${rdap.created_year} — under 12 months old, low trust signal for SERPs`, recommendation: 'Compensate with strong onsite trust signals (case studies, named clients, SRA/CQC/FCA registrations, schema.org)' });
  }

  const payload = {
    domain, country, ok: true,
    companies_house: ch,
    rdap,
    issues
  };
  writeCache({ domain: cacheKey, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}

async function companiesHouseSearch({ company }) {
  const key = process.env.CH_API_KEY;
  if (!key) return { ok: false, error: 'no_ch_key' };
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(company)}&items_per_page=5`;
  const auth = 'Basic ' + Buffer.from(`${key}:`).toString('base64');
  const r = await fetchWithRetry(url, { headers: { Authorization: auth }, timeout: 12000 });
  if (!r.ok) return { ok: false, status: r.status };
  let data; try { data = JSON.parse(r.body); } catch (_e) { return { ok: false, error: 'parse_error' }; }
  const matches = (data.items || []).map(it => ({
    company_number: it.company_number,
    title: it.title,
    company_status: it.company_status,
    company_type: it.company_type,
    date_of_creation: it.date_of_creation,
    address: it.address?.address_line_1 ? `${it.address.address_line_1}${it.address.locality ? ', ' + it.address.locality : ''}${it.address.postal_code ? ', ' + it.address.postal_code : ''}` : ''
  }));
  return { ok: true, query: company, total_results: data.total_results || 0, matches };
}

async function rdapLookup({ domain }) {
  const root = domain.split('.').slice(-1)[0];
  const url = `https://rdap.org/domain/${domain}`;
  const r = await fetchWithRetry(url, { timeout: 10000, retries: 1, headers: { 'Accept': 'application/rdap+json' } });
  if (!r.ok) {
    // For .uk we try the nominet RDAP
    const alt = await fetchWithRetry(`https://rdap.nominet.uk/uk/domain/${domain}`, { timeout: 10000, retries: 1 });
    if (alt.ok) return parseRdap(alt.body);
    return { ok: false, status: r.status };
  }
  return parseRdap(r.body);
}
function parseRdap(body) {
  try {
    const d = JSON.parse(body);
    const events = d.events || [];
    const reg = events.find(e => e.eventAction === 'registration');
    const exp = events.find(e => e.eventAction === 'expiration');
    const upd = events.find(e => e.eventAction === 'last changed' || e.eventAction === 'last update of RDAP database');
    const registrar = d.entities?.find(e => (e.roles || []).includes('registrar'));
    return {
      ok: true,
      registered_at: reg?.eventDate || null,
      created_year: reg?.eventDate ? Number(reg.eventDate.slice(0, 4)) : null,
      expires_at: exp?.eventDate || null,
      last_changed_at: upd?.eventDate || null,
      registrar: registrar ? (registrar.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || registrar.handle || null) : null,
      ldhName: d.ldhName || null,
      nameservers: (d.nameservers || []).map(n => n.ldhName).filter(Boolean).slice(0, 6)
    };
  } catch (e) { return { ok: false, error: 'rdap_parse_error' }; }
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  const company = process.argv[3] || 'Tamazia';
  scan({ domain: dom, company, country: 'UK' })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}
module.exports = { scan };
