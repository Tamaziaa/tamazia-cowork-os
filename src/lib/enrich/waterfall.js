// Multi-channel enrichment waterfall · FREE sources only (no API keys required).
// For each lead: discover website → scrape published emails → find LinkedIn + Instagram →
// decide best_channel (email > linkedin > instagram). Brief/news handled by S063 separately.
//
// Free sources: DuckDuckGo HTML search + direct website fetch (published mailto/contact emails +
// social links in footer). When HUNTER_KEY / Apollo-paid are added, they slot in as higher-yield
// email sources ahead of website scraping (flagged in the channel docs).

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const H = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-GB,en;q=0.9' };

async function ddg(query) {
  const r = await fetchWithRetry(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: H, timeout: 12000, retries: 1 });
  if (!r.ok) return [];
  const out = []; const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g; let m;
  while ((m = re.exec(r.body)) !== null && out.length < 12) {
    let href = m[1];
    if (href.includes('uddg=')) { try { href = decodeURIComponent(href.match(/uddg=([^&]+)/)[1]); } catch (_e) {} }
    out.push(href);
  }
  return out;
}

const SOCIAL_RE = /(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|pinterest)\./i;
function rootDomain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

async function findWebsite(company, knownDomain) {
  if (knownDomain && knownDomain.length > 3) return knownDomain;
  const hits = await ddg(`${company} official website`);
  const DIRECTORY = /wikipedia|gov\.uk|companieshouse|company-information|endole|opencorporates|bloomberg|crunchbase|glassdoor|indeed|trustpilot|cqc\.org|yell\.com|yelp\.|find-and-update|dnb\.com|companies-house|gazette|tussell|zaubacorp/i;
  for (const h of hits) { const d = rootDomain(h); if (d && !SOCIAL_RE.test(d) && !DIRECTORY.test(d)) return d; }
  return '';
}

// Primary email source: Hunter.io domain search (named, role-tagged, confidence-scored).
async function hunterEmails(domain) {
  const key = process.env.HUNTER_KEY; if (!key || !domain) return [];
  try {
    const r = await fetchWithRetry(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}&limit=10`, { timeout: 12000, retries: 1 });
    if (!r.ok) return [];
    const j = JSON.parse(r.body);
    const emails = (j.data && j.data.emails) || [];
    return emails.map(e => ({
      email: (e.value || '').toLowerCase(),
      first_name: e.first_name || '', last_name: e.last_name || '',
      position: e.position || '', confidence: e.confidence || 0,
      type: e.type || '' // 'personal' | 'generic'
    })).filter(e => e.email);
  } catch (_e) { return []; }
}

async function scrapeEmails(domain) {
  if (!domain) return [];
  const emails = new Set();
  for (const p of ['/', '/contact', '/contact-us', '/about', '/about-us', '/team']) {
    try {
      const r = await fetchWithRetry(`https://${domain}${p}`, { headers: H, timeout: 8000, retries: 0 });
      if (r.ok && r.body) {
        const found = r.body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        for (let e of found) {
          e = e.toLowerCase();
          if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/.test(e)) continue;       // asset false-positives
          if (/(example|sentry|wix|squarespace|godaddy|\.png|\.jpg)/.test(e)) continue;
          if (e.endsWith('@' + domain) || e.includes(domain.split('.')[0])) emails.add(e); // prefer same-domain
          else emails.add(e);
        }
      }
    } catch (_e) {}
    if (emails.size >= 5) break;
  }
  // rank: same-domain role addresses first
  const arr = [...emails];
  const roleFirst = arr.sort((a, b) => {
    const ra = /^(info|hello|contact|enquiries|sales|marketing|press|office|admin)@/.test(a) ? 0 : 1;
    const rb = /^(info|hello|contact|enquiries|sales|marketing|press|office|admin)@/.test(b) ? 0 : 1;
    return ra - rb;
  });
  return roleFirst.slice(0, 5);
}

async function findSocial(company, kind, domain) {
  // 1) try the website footer
  if (domain) {
    try {
      const r = await fetchWithRetry(`https://${domain}/`, { headers: H, timeout: 8000, retries: 0 });
      if (r.ok && r.body) {
        const re = kind === 'linkedin' ? /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9._%-]+/i
                                       : /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i;
        const m = r.body.match(re); if (m) return m[0].replace(/["'<>].*$/, '');
      }
    } catch (_e) {}
  }
  // 2) DDG site search
  const site = kind === 'linkedin' ? 'linkedin.com/company' : 'instagram.com';
  const hits = await ddg(`site:${site} ${company}`);
  if (hits.length) { const h = hits.find(x => x.includes(kind === 'linkedin' ? 'linkedin.com' : 'instagram.com')); if (h) return h.split('?')[0]; }
  return '';
}

/**
 * Enrich one lead. Returns { website, emails, linkedin, instagram, best_channel }.
 */
async function enrichLead({ company, domain }) {
  const website = await findWebsite(company, domain);
  // Email waterfall: Hunter (named, scored) → website scrape fallback
  const [hunter, scraped, linkedin, instagram] = await Promise.all([
    hunterEmails(website),
    scrapeEmails(website),
    findSocial(company, 'linkedin', website),
    findSocial(company, 'instagram', website)
  ]);
  // Prefer Hunter named contacts; merge unique scraped role addresses
  const seen = new Set();
  const contacts = [];
  for (const h of hunter) { if (!seen.has(h.email)) { seen.add(h.email); contacts.push(h); } }
  for (const s of scraped) { if (!seen.has(s)) { seen.add(s); contacts.push({ email: s, first_name: '', last_name: '', position: '', confidence: 70, type: /^(info|hello|contact|sales|marketing|press|enquiries)@/.test(s) ? 'generic' : 'personal' }); } }
  const emails = contacts.map(c => c.email);
  let best_channel = 'none';
  if (emails.length) best_channel = 'email';
  else if (linkedin) best_channel = 'linkedin';
  else if (instagram) best_channel = 'instagram';
  return { website, emails, contacts, linkedin, instagram, best_channel };
}

module.exports = { enrichLead, findWebsite, scrapeEmails, findSocial, ddg };

if (require.main === module) {
  (async () => {
    for (const lead of [{ company: 'Dishoom', domain: 'dishoom.com' }, { company: 'Savills', domain: 'savills.co.uk' }]) {
      const r = await enrichLead(lead);
      console.log(`\n${lead.company}: best=${r.best_channel}`);
      console.log('  website:', r.website, '| emails:', r.emails.join(', ') || '-');
      console.log('  linkedin:', r.linkedin || '-', '| instagram:', r.instagram || '-');
    }
  })();
}
