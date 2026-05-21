// Apollo · org enrichment + people search via X-Api-Key header
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
function key() { return process.env.APOLLO_KEY || ''; }
function hdrs() { return { 'X-Api-Key': key(), 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }; }

async function enrichOrg(domain) {
  if (!key()) return { ok: false, error: 'no_apollo_key' };
  const r = await fetchWithRetry(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, { headers: hdrs(), timeout: 15000, retries: 1 });
  if (!r.ok) return { ok: false, status: r.status };
  try {
    const json = JSON.parse(r.body);
    return { ok: true, org: json.organization || null, raw: json };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function searchPeople({ organization_ids, person_titles = ['CEO', 'Founder', 'Managing Partner', 'Director', 'Head of Marketing'], page = 1, per_page = 10 }) {
  if (!key()) return { ok: false };
  const body = { organization_ids: Array.isArray(organization_ids) ? organization_ids : [organization_ids], person_titles, page, per_page };
  const r = await fetchWithRetry('https://api.apollo.io/api/v1/mixed_people/search', { method: 'POST', headers: hdrs(), body: JSON.stringify(body), timeout: 18000, retries: 1 });
  if (!r.ok) return { ok: false, status: r.status };
  try {
    const json = JSON.parse(r.body);
    const people = (json.people || []).concat(json.contacts || []).map(p => ({
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      seniority: p.seniority,
      email: p.email,
      linkedin_url: p.linkedin_url,
      city: p.city,
      country: p.country,
      photo: p.photo_url,
      apollo_id: p.id
    }));
    return { ok: true, people, raw_total: json.total_entries };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { enrichOrg, searchPeople };

if (require.main === module) {
  (async () => {
    const o = await enrichOrg('mishcon.com');
    console.log('Apollo enrich mishcon.com:', o.ok, 'name:', o.org?.name, 'id:', o.org?.id);
    if (o.org?.id) {
      const p = await searchPeople({ organization_ids: o.org.id });
      console.log('People found:', p.people?.length);
      console.log('First 3:', JSON.stringify(p.people?.slice(0, 3), null, 2));
    }
  })();
}
