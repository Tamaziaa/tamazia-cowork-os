// GLEIF · Global Legal Entity Identifier Foundation · 2.5M entities globally · NO KEY · UNLIMITED
// https://api.gleif.org/api/v1/lei-records
// Each LEI record contains: legal name, registered + HQ address, entity status, legal form, parent, children, BIC + ISIN.
// HONEST source for institutional + corporate leads anywhere on the planet.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

const COUNTRY_CODES = { UK: 'GB', US: 'US', DE: 'DE', FR: 'FR', NL: 'NL', ES: 'ES', IT: 'IT', UAE: 'AE', SG: 'SG', HK: 'HK', AU: 'AU', CA: 'CA', JP: 'JP', IN: 'IN' };

async function search({ country = 'UK', name_contains = null, legal_form = null, page_size = 100, page = 1 }) {
  const params = new URLSearchParams({ 'page[size]': String(page_size), 'page[number]': String(page) });
  const cc = COUNTRY_CODES[country] || country;
  if (cc) params.set('filter[entity.legalAddress.country]', cc);
  if (name_contains) params.set('filter[entity.legalName]', name_contains);
  if (legal_form) params.set('filter[entity.legalForm.id]', legal_form);
  const url = `https://api.gleif.org/api/v1/lei-records?${params}`;
  const r = await fetchWithRetry(url, { headers: { 'Accept': 'application/vnd.api+json' }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    return (json.data || []).map(d => {
      const a = d.attributes || {};
      const entity = a.entity || {};
      const legal = entity.legalAddress || {};
      const hq = entity.headquartersAddress || {};
      return {
        platform: 'gleif',
        lei: d.id,
        company: entity.legalName?.name,
        legal_form: entity.legalForm?.id,
        status: entity.status,
        country_legal: legal.country,
        country_hq: hq.country,
        address_legal: [legal.addressLines?.[0], legal.city, legal.region, legal.postalCode].filter(Boolean).join(', '),
        address_hq: [hq.addressLines?.[0], hq.city, hq.region, hq.postalCode].filter(Boolean).join(', '),
        registration_status: a.registration?.status,
        bic: entity.bic?.[0],
        observed_at: new Date().toISOString()
      };
    }).filter(e => e.company);
  } catch (_e) { return []; }
}

async function bulkSearch({ country = 'UK', max_pages = 10, page_size = 100 } = {}) {
  const out = [];
  for (let p = 1; p <= max_pages; p++) {
    const r = await search({ country, page_size, page: p });
    out.push(...r);
    if (r.length < page_size) break;
    await new Promise(r => setTimeout(r, 600));
  }
  return out;
}

module.exports = { search, bulkSearch };

if (require.main === module) {
  (async () => {
    const r = await search({ country: 'UK', page_size: 25 });
    console.log('GLEIF UK page 1:', r.length, 'entities · sample:', JSON.stringify(r.slice(0, 3), null, 2).slice(0, 800));
  })();
}
