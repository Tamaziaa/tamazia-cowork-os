// Enrichment waterfall: a domain in → as many VERIFIED emails as possible, plus decision-maker
// names, titles and LinkedIn. Multi-source, fail-open, NO fabrication (only what a source returns).
// Sources: Hunter domain-search (emails+names+titles+linkedin) · Serper Google (owner/MD/CEO LinkedIn)
// · site-scrape (/team /about /contact mailto + people) · verify via Hunter/NeverBounce.
'use strict';
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
const DM = /(owner|founder|co-?founder|ceo|chief executive|managing director|\bmd\b|managing partner|senior partner|\bpartner\b|principal|\bdirector\b|head of|vice president|\bvp\b|chief|\bcmo\b|\bcto\b|\bcoo\b|\bcfo\b|business development|sales director|sales manager|marketing director|practice manager|clinic director|general manager)/i;

async function timed(fn, ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fn(c.signal); } finally { clearTimeout(t); } }
async function getJSON(url, opts, ms) { try { const r = await timed(s => fetch(url, { ...opts, signal: s }), ms || 15000); if (!r.ok) return null; return await r.json(); } catch (_) { return null; } }
async function getText(url, ms) { try { const r = await timed(s => fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: s }), ms || 15000); if (!r.ok) return ''; return await r.text(); } catch (_) { return ''; } }

async function hunterDomainSearch(domain, key) {
  if (!key) return [];
  const d = await getJSON(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=50&api_key=${key}`, {}, 20000);
  const emails = ((d && d.data && d.data.emails) || []).map(e => ({
    value: (e.value || '').toLowerCase(),
    first_name: e.first_name || '', last_name: e.last_name || '',
    name: [e.first_name, e.last_name].filter(Boolean).join(' '),
    position: e.position || '', department: e.department || '', seniority: e.seniority || '',
    type: e.type || '', confidence: e.confidence || 0,
    linkedin: e.linkedin || '', source: 'hunter',
    hunter_status: (e.verification && e.verification.status) || '',
  }));
  return emails;
}

async function serperDecisionMakers(company, key) {
  if (!key || !company) return [];
  const q = `site:linkedin.com/in ${company} (CEO OR "Managing Director" OR Founder OR Owner OR Partner OR Director)`;
  const d = await getJSON('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, num: 8 }) }, 15000);
  return ((d && d.organic) || []).filter(o => /linkedin\.com\/in\//i.test(o.link || '')).map(o => {
    const t = (o.title || '').replace(/\s*\|\s*LinkedIn.*/i, '');
    const [name, ...rest] = t.split(/\s[-–]\s/);
    return { name: (name || '').trim(), title: rest.join(' - ').trim(), linkedin: o.link, source: 'serper' };
  });
}

async function scrapeSiteContacts(domain) {
  const out = { emails: [], people: [] };
  for (const pth of ['', '/team', '/about', '/about-us', '/contact', '/our-team', '/people']) {
    const html = await getText('https://' + domain + pth, 12000);
    if (!html) continue;
    for (const m of html.matchAll(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
      const v = m[1].toLowerCase(); if (!out.emails.find(e => e.value === v)) out.emails.push({ value: v, source: 'site' });
    }
    for (const m of html.matchAll(/(https?:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[A-Za-z0-9\-_%]+)/gi)) {
      const li = m[1]; if (!out.people.find(p => p.linkedin === li)) out.people.push({ linkedin: li, source: 'site' });
    }
  }
  return out;
}

async function verifyEmail(email, env) {
  // Hunter verifier first (we have the key), NeverBounce fallback. Returns {verified, status, score, provider}.
  const hk = env.HUNTER_KEY || env.HUNTER_API_KEY;
  if (hk) {
    const d = await getJSON(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${hk}`, {}, 15000);
    const s = d && d.data && d.data.status;
    if (s) return { verified: ['valid', 'accept_all'].includes(s), status: s, score: (d.data.score || 0), provider: 'hunter' };
  }
  const nk = env.NEVERBOUNCE_KEY;
  if (nk) {
    const d = await getJSON(`https://api.neverbounce.com/v4/single/check?key=${nk}&email=${encodeURIComponent(email)}`, {}, 15000);
    if (d && d.result) return { verified: ['valid', 'catchall'].includes(d.result), status: d.result, score: null, provider: 'neverbounce' };
  }
  return { verified: false, status: 'unverified', score: null, provider: 'none' };
}

async function enrichCompany({ domain, company, env = process.env, verify = true }) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const [hunter, dmSerper, site] = await Promise.all([
    hunterDomainSearch(domain, env.HUNTER_KEY || env.HUNTER_API_KEY),
    serperDecisionMakers(company || domain.split('.')[0], env.SERPER_KEY),
    scrapeSiteContacts(domain),
  ]);
  // merge emails (hunter detailed + site-found)
  const byEmail = {};
  for (const e of hunter) byEmail[e.value] = e;
  for (const e of site.emails) if (!byEmail[e.value]) byEmail[e.value] = { value: e.value, name: '', position: '', type: e.value.split('@')[0].length <= 4 ? 'generic' : 'personal', confidence: 0, source: 'site' };
  let emails = Object.values(byEmail);
  // verify (cap to protect quota)
  if (verify) {
    for (const e of emails.slice(0, 12)) { const v = await verifyEmail(e.value, env); e.verified = v.verified; e.verify_status = v.status; e.verify_provider = v.provider; }
  }
  // decision-makers: from hunter positions + serper linkedin + site people
  const dmsFromHunter = emails.filter(e => DM.test(e.position || '')).map(e => ({ name: e.name, title: e.position, email: e.value, linkedin: e.linkedin || '', verified: !!e.verified, source: 'hunter' }));
  const seen = new Set(dmsFromHunter.map(d => (d.name || '').toLowerCase()));
  const decisionMakers = [...dmsFromHunter];
  for (const d of dmSerper) { const k = (d.name || '').toLowerCase(); if (d.name && !seen.has(k)) { seen.add(k); decisionMakers.push({ name: d.name, title: d.title, email: '', linkedin: d.linkedin, verified: false, source: 'serper' }); } }
  const verifiedEmails = emails.filter(e => e.verified);
  return {
    domain, company: company || '',
    emails, decisionMakers,
    linkedin_people: site.people.map(p => p.linkedin),
    counts: { emails: emails.length, verified: verifiedEmails.length, decision_makers: decisionMakers.length },
    sources: { hunter: hunter.length, serper: dmSerper.length, site_emails: site.emails.length, site_linkedin: site.people.length },
    send_ready: verifiedEmails.length > 0,
  };
}

module.exports = { enrichCompany, verifyEmail, hunterDomainSearch, serperDecisionMakers, scrapeSiteContacts, DM };
