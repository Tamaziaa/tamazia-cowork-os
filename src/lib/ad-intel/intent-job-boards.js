// Intent signal via job boards · companies actively hiring marketers/growth/SEO/content/digital roles
// = active marketing budget = strong ad-intent proxy. ALL FREE, NO AUTH NEEDED.
//
// Endpoints (all return JSON):
//  Greenhouse: https://boards.greenhouse.io/embed/job_board?for={company-slug}
//              + https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
//  Lever:      https://api.lever.co/v0/postings/{company-slug}?mode=json
//  Workable:   https://apply.workable.com/api/v1/widget/accounts/{company-slug}
//  Personio:   https://{company-slug}.jobs.personio.com/xml
//  Ashby:      https://api.ashbyhq.com/posting-api/job-board/{company-slug}

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

const MARKETING_KEYWORDS = /(marketing|growth|seo|content|digital|brand|paid social|paid media|performance marketer|demand gen|campaign manager|comms|pr manager|copywriter|crm|email marketing|marketing director|cmo|head of marketing|head of growth|head of digital)/i;

async function greenhouse(slug) {
  const r = await fetchWithRetry(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, { timeout: 10000, retries: 1 });
  if (!r.ok) return [];
  try {
    const j = JSON.parse(r.body);
    return (j.jobs || []).map(jb => ({
      platform: 'greenhouse',
      company_slug: slug,
      title: jb.title,
      location: jb.location?.name,
      updated_at: jb.updated_at,
      absolute_url: jb.absolute_url,
      department: (jb.departments || []).map(d => d.name).join(', '),
      is_marketing: MARKETING_KEYWORDS.test(jb.title + ' ' + (jb.departments || []).map(d => d.name).join(' '))
    }));
  } catch (_e) { return []; }
}

async function lever(slug) {
  const r = await fetchWithRetry(`https://api.lever.co/v0/postings/${slug}?mode=json`, { timeout: 10000, retries: 1 });
  if (!r.ok) return [];
  try {
    const j = JSON.parse(r.body);
    return (Array.isArray(j) ? j : []).map(p => ({
      platform: 'lever',
      company_slug: slug,
      title: p.text,
      location: p.categories?.location,
      department: p.categories?.team,
      updated_at: new Date(p.createdAt || 0).toISOString(),
      absolute_url: p.hostedUrl,
      is_marketing: MARKETING_KEYWORDS.test(p.text + ' ' + (p.categories?.team || ''))
    }));
  } catch (_e) { return []; }
}

async function workable(slug) {
  const r = await fetchWithRetry(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, { timeout: 10000, retries: 1 });
  if (!r.ok) return [];
  try {
    const j = JSON.parse(r.body);
    return (j.jobs || []).map(jb => ({
      platform: 'workable',
      company_slug: slug,
      title: jb.title,
      location: [jb.location?.city, jb.location?.country].filter(Boolean).join(', '),
      updated_at: jb.published_on,
      absolute_url: jb.url,
      is_marketing: MARKETING_KEYWORDS.test(jb.title)
    }));
  } catch (_e) { return []; }
}

async function ashby(slug) {
  const r = await fetchWithRetry(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { timeout: 10000, retries: 1 });
  if (!r.ok) return [];
  try {
    const j = JSON.parse(r.body);
    return (j.jobs || []).map(jb => ({
      platform: 'ashby',
      company_slug: slug,
      title: jb.title,
      location: jb.locationName,
      department: jb.departmentName,
      updated_at: jb.publishedAt,
      absolute_url: jb.jobUrl,
      is_marketing: MARKETING_KEYWORDS.test(jb.title + ' ' + (jb.departmentName || ''))
    }));
  } catch (_e) { return []; }
}

/**
 * Try every ATS endpoint for a given company slug.
 * Returns combined job postings. ANY hit on a marketing-related title = active marketing budget signal.
 */
async function scanCompany(slug) {
  const all = [];
  for (const fn of [greenhouse, lever, workable, ashby]) {
    try { const r = await fn(slug); all.push(...r); } catch (_e) {}
  }
  const marketing_roles = all.filter(j => j.is_marketing);
  return {
    company_slug: slug,
    total_open_roles: all.length,
    marketing_roles_count: marketing_roles.length,
    is_actively_hiring_marketers: marketing_roles.length > 0,
    sample_marketing_role: marketing_roles[0]?.title || null,
    platforms_with_postings: [...new Set(all.map(j => j.platform))],
    intent_score: marketing_roles.length > 0 ? Math.min(10, 3 + marketing_roles.length) : 0,
    postings: all.slice(0, 20)
  };
}

// Slug guessing — most ATS use lowercase company name
function guessSlugs(company) {
  if (!company) return [];
  const base = String(company).toLowerCase().replace(/\b(ltd|limited|llp|inc|corp|corporation|gmbh|plc|company|group)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return [
    base.replace(/\s+/g, ''),       // dishoom
    base.replace(/\s+/g, '-'),      // dishoom (same)
    base.split(' ')[0]              // first word only
  ].filter((v, i, a) => v && a.indexOf(v) === i);
}

async function scanByCompanyName(company) {
  const slugs = guessSlugs(company);
  for (const s of slugs) {
    const r = await scanCompany(s);
    if (r.total_open_roles > 0) return r;
  }
  return { company_slug: slugs[0], total_open_roles: 0, marketing_roles_count: 0, is_actively_hiring_marketers: false, intent_score: 0 };
}

module.exports = { scanCompany, scanByCompanyName, greenhouse, lever, workable, ashby };

if (require.main === module) {
  (async () => {
    for (const slug of ['stripe', 'monzo', 'allbirds', 'dishoom', 'mishcondereya']) {
      const r = await scanCompany(slug);
      console.log(slug.padEnd(20), '· roles:', String(r.total_open_roles).padStart(3), '· mkt:', r.marketing_roles_count, '· sample:', r.sample_marketing_role || '-');
    }
  })();
}
