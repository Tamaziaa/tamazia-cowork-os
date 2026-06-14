#!/usr/bin/env node
// S060 Gemini-powered lead enricher · Phase 7.5
// Takes leads with only company name → fills in domain, contact name, sector, real research notes.
// Uses Gemini 2.5 Flash (free tier 1500/day) + web search via fetch.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { extractJson, generate } = require('../../../lib/llm/gemini.js');
const { fetchWithRetry } = require('../../../skills/S008-personalisation-engine/lib/http.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }
// gap-fix: validate an LLM/scraped email before it becomes a stored contact. Returns the normalised address
// or null. Rejects non-strings, bad syntax, disposable + placeholder domains, and structurally-malformed
// local/domain parts (trailing-dot, leading separator, doubled separators, hyphen-led labels).
const _S060_DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'temp-mail.org', 'getnada.com', 'maildrop.cc', 'dispostable.com']);
const _S060_PLACEHOLDER = /(example\.(com|org|net)|yourdomain|yourcompany|your-?email|email\.com|domain\.com|company\.com|sentry\.io|wixpress|squarespace|godaddy)/i;
function validEmail(raw) {
  if (typeof raw !== 'string') return null;
  const e = raw.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  if (_S060_PLACEHOLDER.test(e)) return null;
  const at = e.indexOf('@'); const lp = e.slice(0, at); const dom = e.slice(at + 1);
  if (_S060_DISPOSABLE.has(dom)) return null;
  if (!/^[a-z0-9]/.test(lp) || !/[a-z0-9]$/.test(lp) || /[._%+\-]{2,}/.test(lp)) return null;
  if (!/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/.test(dom)) return null;
  return e;
}

// Fast website lookup via DuckDuckGo for company → website discovery
async function findDomain(company) {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15';
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('"' + company + '"')}+official+website`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA }, timeout: 12000, retries: 1 });
  if (!r.ok) return null;
  // Find first non-aggregator domain in results
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g;
  let m;
  const BLOCK = /\.(?:linkedin|facebook|twitter|x|instagram|tiktok|youtube|wikipedia|companieshouse|find-and-update|duckduckgo|google|bing|yahoo|crunchbase|bloomberg|reuters|ft|bbc)\./i;
  while ((m = re.exec(r.body)) !== null) {
    let href = m[1];
    if (href.includes('uddg=')) { try { href = decodeURIComponent(href.match(/uddg=([^&]+)/)[1]); } catch (_e) {} }
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (!BLOCK.test(host)) return host;
    } catch (_e) {}
  }
  return null;
}

async function enrichLead(lead) {
  const summary = { lead_id: lead.id, company: lead.company, before: { domain: lead.domain, sector: lead.sector }, changes: [] };
  // 1. Discover domain if missing
  let domain = lead.domain;
  if (!domain) {
    domain = await findDomain(lead.company);
    if (domain) {
      pg(`UPDATE leads SET domain=${pgEsc(domain)}, updated_at=NOW() WHERE id=${lead.id}`);
      summary.changes.push({ domain });
    }
  }
  // 2. Fetch domain homepage and let Gemini extract contact data
  if (domain) {
    let body = '';
    try {
      const r = await fetchWithRetry(`https://${domain}/`, { timeout: 10000, retries: 0, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15' } });
      if (r.ok) body = (r.body || '').slice(0, 18000);
    } catch (_e) {}

    if (body) {
      // Strip script/style noise to keep prompt small
      body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
      const r = await extractJson({
        prompt: `Analyse this UK/international business website homepage. Company: "${lead.company}". Extract:
- canonical_sector: one of [law-firms, barristers, accounting, professional-services, healthcare, dental, pharma, finance, fintech, insurance, real-estate, hospitality, ecommerce, retail, education, higher-education, charity, energy, transport, manufacturing, marketing, media, saas, tech, restaurants, wellness]
- principal_contact: { first_name, last_name, title } — the most senior person identifiable (founder/CEO/managing partner)
- secondary_contact: same shape, second senior person if visible
- jurisdictions_operated: array of country codes where they explicitly mention operations (UK, US, EU, FR, DE, ES, NL, IE, IT, UAE, SG, HK, AU, IN, CA, ZA)
- email_pattern: detected email pattern like "{first}.{last}" or "{first}" or "unknown"
- direct_emails: explicitly published email addresses [array]
- linkedin_company_url: company LinkedIn URL if visible
- twitter_handle: with @
- audit_priority_signal: short string ("active marketing", "stale site", "high regulatory risk", "well-resourced", "lean", etc.)
- ad_pixels_detected: subset of [meta, google, linkedin, tiktok, hotjar, hubspot]

Website body:
${body}`,
        schema_hint: '{canonical_sector, principal_contact, secondary_contact, jurisdictions_operated, email_pattern, direct_emails, linkedin_company_url, twitter_handle, audit_priority_signal, ad_pixels_detected}'
      });
      if (r.ok && r.data) {
        const d = r.data;
        const updates = [];
        if (d.canonical_sector && d.canonical_sector !== lead.sector) {
          updates.push(`sector=${pgEsc(d.canonical_sector)}`);
          summary.changes.push({ sector: d.canonical_sector });
        }
        if (d.principal_contact?.first_name) {
          updates.push(`first_name=${pgEsc(d.principal_contact.first_name)}`);
          updates.push(`last_name=${pgEsc(d.principal_contact.last_name)}`);
          updates.push(`title=${pgEsc(d.principal_contact.title)}`);
          summary.changes.push({ contact: `${d.principal_contact.first_name} ${d.principal_contact.last_name} · ${d.principal_contact.title}` });
        }
        // gap-fix: the LLM-extracted address was written to leads.email UNVALIDATED at a hard-coded 0.85
        // confidence. Gemini hallucinates/echoes placeholder + malformed addresses (e.g. 'name@domain.com',
        // 'your@email.com', trailing-dot or sliced-filename junk), which then become "contacts". Validate
        // syntax + structure + reject disposable/placeholder before persisting; skip the write otherwise.
        const _em = validEmail(d.direct_emails && d.direct_emails[0]);
        if (_em) {
          updates.push(`email=${pgEsc(_em)}`);
          updates.push(`email_source='website_extracted'`);
          updates.push(`email_confidence=0.85`);
          summary.changes.push({ email: _em });
        } else if (d.direct_emails && d.direct_emails[0]) {
          summary.changes.push({ email_rejected: String(d.direct_emails[0]).slice(0, 80) });
        }
        if (d.linkedin_company_url) {
          updates.push(`linkedin_url=${pgEsc(d.linkedin_company_url)}`);
          updates.push(`linkedin_confidence=0.9`);
          summary.changes.push({ linkedin: d.linkedin_company_url });
        }
        if (d.audit_priority_signal) {
          updates.push(`research_dossier=${pgEsc(d.audit_priority_signal + ' · jurisdictions: ' + (d.jurisdictions_operated || []).join(','))}`);
        }
        if (updates.length) {
          updates.push('updated_at=NOW()');
          pg(`UPDATE leads SET ${updates.join(', ')} WHERE id=${lead.id}`);
        }
      } else {
        summary.gemini_error = r.error;
      }
    }
  }
  return summary;
}

async function run({ limit = 10, only_missing = true } = {}) {
  const whereClause = only_missing
    ? "WHERE (domain IS NULL OR first_name IS NULL OR email IS NULL OR sector IS NULL OR sector = 'lexquity-investor') AND company IS NOT NULL AND company NOT LIKE 'Test %' AND company NOT LIKE 'Tamazia%'"
    : "WHERE company IS NOT NULL AND company NOT LIKE 'Test %'";
  const raw = pg(`SELECT id::text, company, COALESCE(domain, ''), COALESCE(sector, '') FROM leads ${whereClause} ORDER BY priority_score DESC NULLS LAST, id DESC LIMIT ${limit}`);
  if (!raw) return { error: 'no_leads' };
  const leads = raw.split('\n').filter(Boolean).map(l => { const [id, company, domain, sector] = l.split('\t'); return { id: Number(id), company, domain: domain || null, sector: sector || null }; });
  console.log(`Enriching ${leads.length} leads via Gemini...`);
  const results = [];
  for (const lead of leads) {
    const r = await enrichLead(lead);
    results.push(r);
    process.stdout.write('.');
    // rate limit Gemini free tier 15/min → 4s gap
    await new Promise(r => setTimeout(r, 4500));
  }
  console.log('\n');
  return results;
}

if (require.main === module) {
  const limit = Number(process.argv[2] || 5);
  run({ limit }).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { enrichLead, run, findDomain };
