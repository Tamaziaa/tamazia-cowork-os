// Enrichment waterfall — a domain in, as many VERIFIED emails + decision-makers out, at £0.
// FREE engine (no Hunter required): site-scrape + Serper names + EMAIL-PATTERN INFERENCE + decision-maker
// name -> candidate email + MX/disposable/role verification (no SMTP, port 25 is blocked everywhere).
// Hunter/NeverBounce are optional boosters. Every result cached in Neon so a domain is enriched once.
'use strict';
const dns = require('dns').promises;
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
const DM = /(owner|founder|co-?founder|ceo|chief executive|managing director|\bmd\b|managing partner|senior partner|\bpartner\b|principal|\bdirector\b|head of|vice president|\bvp\b|chief|\bcmo\b|\bcto\b|\bcoo\b|\bcfo\b|business development|sales director|sales manager|marketing director|practice manager|clinic director|general manager)/i;
const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;

async function timed(fn, ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fn(c.signal); } finally { clearTimeout(t); } }
async function getJSON(url, opts, ms) { try { const r = await timed(s => fetch(url, { ...opts, signal: s }), ms || 15000); if (!r.ok) return null; return await r.json(); } catch (_) { return null; } }
async function getText(url, ms) { try { const r = await timed(s => fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: s }), ms || 15000); if (!r.ok) return ''; return await r.text(); } catch (_) { return ''; } }
async function sql(query) { const u = NEON(); if (!u) return { ok: false, rows: [] }; try { const host = u.replace(/.*@([^/]+)\/.*/, '$1'); const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': u, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, params: [] }) }); if (!r.ok) return { ok: false, rows: [] }; const d = await r.json(); return { ok: true, rows: d.rows || d.results || [] }; } catch (_) { return { ok: false, rows: [] }; } }
const esc = s => String(s).replace(/'/g, "''");

// ---- free verification lists (loaded once from Neon, fallback to built-ins) ----
let _lists = null;
async function loadLists() {
  if (_lists) return _lists;
  const built = { disposable: new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com']), role: new Set(['info', 'contact', 'hello', 'admin', 'sales', 'support', 'enquiries', 'enquiry', 'office', 'mail', 'team', 'reception', 'hi', 'help', 'no-reply', 'noreply']) };
  const d = await sql("select domain from disposable_domains"); const r = await sql("select local_part from generic_local_parts");
  if (d.ok) d.rows.forEach(x => built.disposable.add((x.domain || '').toLowerCase()));
  if (r.ok) r.rows.forEach(x => built.role.add((x.local_part || '').toLowerCase()));
  _lists = built; return built;
}

// ---- MX check (free, no SMTP) ----
const _mxCache = {};
async function hasMX(domain) {
  if (domain in _mxCache) return _mxCache[domain];
  let ok = false; try { const mx = await dns.resolveMx(domain); ok = Array.isArray(mx) && mx.length > 0; } catch (_) { ok = false; }
  _mxCache[domain] = ok; return ok;
}

// ---- email-pattern inference (the Hunter-killer) ----
const SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function detectPattern(knownEmails, domain) {
  // From any email whose local part we can map to a first/last name, infer the firm's pattern.
  for (const e of knownEmails) {
    if (!e.first_name || !e.last_name || !e.value) continue;
    const lp = e.value.split('@')[0].toLowerCase();
    const f = e.first_name.toLowerCase(), l = e.last_name.toLowerCase();
    const fi = f[0], li = l[0];
    const map = { [`${f}.${l}`]: 'first.last', [`${f}${l}`]: 'firstlast', [`${fi}${l}`]: 'flast', [`${fi}.${l}`]: 'f.last', [`${f}`]: 'first', [`${f}_${l}`]: 'first_last', [`${l}${fi}`]: 'lastf', [`${f}.${li}`]: 'first.l' };
    if (map[lp]) return map[lp];
  }
  return null;
}
function applyPattern(pattern, first, last, domain) {
  if (!first || !pattern) return null;
  const f = first.toLowerCase().replace(/[^a-z]/g, ''), l = (last || '').toLowerCase().replace(/[^a-z]/g, '');
  const fi = f[0] || '', li = l[0] || '';
  const m = { 'first.last': `${f}.${l}`, 'firstlast': `${f}${l}`, 'flast': `${fi}${l}`, 'f.last': `${fi}.${l}`, 'first': `${f}`, 'first_last': `${f}_${l}`, 'lastf': `${l}${fi}`, 'first.l': `${f}.${li}` };
  const lp = m[pattern]; if (!lp || (pattern !== 'first' && !l)) return null;
  const email = `${lp}@${domain}`; return SYNTAX.test(email) ? email : null;
}

// ---- free verify: syntax + MX + disposable + role (no SMTP). NeverBounce optional booster. ----
async function verifyFree(email, env) {
  const lists = await loadLists();
  const [lp, dom] = email.toLowerCase().split('@');
  const syntax = SYNTAX.test(email);
  const disposable = lists.disposable.has(dom);
  const role = lists.role.has(lp);
  const mx = syntax && !disposable ? await hasMX(dom) : false;
  // verified = deliverable-shaped: good syntax, real MX, not disposable. Role flagged but not rejected.
  let verified = syntax && mx && !disposable;
  let status = !syntax ? 'invalid_syntax' : disposable ? 'disposable' : !mx ? 'no_mx' : role ? 'role_valid' : 'valid';
  let provider = 'free';
  // optional NeverBounce booster for catch-all confidence (only if key + looks valid)
  if (verified && env && env.NEVERBOUNCE_KEY) {
    const d = await getJSON(`https://api.neverbounce.com/v4/single/check?key=${env.NEVERBOUNCE_KEY}&email=${encodeURIComponent(email)}`, {}, 12000);
    if (d && d.result) { verified = ['valid', 'catchall'].includes(d.result); status = d.result; provider = 'neverbounce'; }
  }
  return { verified, status, role, disposable, mx, provider };
}

async function hunterDomainSearch(domain, key) {
  if (!key) return [];
  const d = await getJSON(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=50&api_key=${key}`, {}, 20000);
  return ((d && d.data && d.data.emails) || []).map(e => ({ value: (e.value || '').toLowerCase(), first_name: e.first_name || '', last_name: e.last_name || '', name: [e.first_name, e.last_name].filter(Boolean).join(' '), position: e.position || '', type: e.type || '', confidence: e.confidence || 0, linkedin: e.linkedin || '', source: 'hunter' }));
}
async function serperDecisionMakers(company, key) {
  if (!key || !company) return [];
  const q = `site:linkedin.com/in ${company} (CEO OR "Managing Director" OR Founder OR Owner OR Partner OR Director)`;
  const d = await getJSON('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, num: 8 }) }, 15000);
  return ((d && d.organic) || []).filter(o => /linkedin\.com\/in\//i.test(o.link || '')).map(o => { const t = (o.title || '').replace(/\s*\|\s*LinkedIn.*/i, ''); const [name, ...rest] = t.split(/\s[-–]\s/); const nm = (name || '').trim(); const [first, ...lr] = nm.split(/\s+/); return { name: nm, first_name: first || '', last_name: lr.join(' '), title: rest.join(' - ').trim(), linkedin: o.link, source: 'serper' }; });
}
async function scrapeSiteContacts(domain) {
  const out = { emails: [], people: [] };
  for (const pth of ['', '/team', '/about', '/about-us', '/contact', '/our-team', '/people']) {
    const html = await getText('https://' + domain + pth, 12000); if (!html) continue;
    for (const m of html.matchAll(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) { const v = m[1].toLowerCase(); if (!out.emails.find(e => e.value === v)) out.emails.push({ value: v, source: 'site' }); }
    for (const m of html.matchAll(/(https?:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[A-Za-z0-9\-_%]+)/gi)) { const li = m[1]; if (!out.people.find(p => p.linkedin === li)) out.people.push({ linkedin: li, source: 'site' }); }
  }
  return out;
}

async function cacheGet(domain) { const r = await sql(`SELECT payload FROM enrichment_cache WHERE domain='${esc(domain)}' AND refreshed_at > NOW() - INTERVAL '30 days'`); return (r.ok && r.rows[0]) ? r.rows[0].payload : null; }
async function cachePut(domain, rec) { try { const p = `'${esc(JSON.stringify(rec))}'::jsonb`; await sql(`INSERT INTO enrichment_cache (domain, payload, email_count, verified_count, dm_count, source, refreshed_at) VALUES ('${esc(domain)}', ${p}, ${rec.counts.emails}, ${rec.counts.verified}, ${rec.counts.decision_makers}, 'waterfall', NOW()) ON CONFLICT (domain) DO UPDATE SET payload=EXCLUDED.payload, email_count=EXCLUDED.email_count, verified_count=EXCLUDED.verified_count, dm_count=EXCLUDED.dm_count, refreshed_at=NOW()`); } catch (_) {} }

async function enrichCompany({ domain, company, env = process.env, verify = true, useCache = true }) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (useCache && NEON()) { const c = await cacheGet(domain); if (c) { c.cached = true; return c; } }
  const [hunter, dmSerper, site] = await Promise.all([
    hunterDomainSearch(domain, env.HUNTER_KEY || env.HUNTER_API_KEY), // optional booster
    serperDecisionMakers(company || domain.split('.')[0], env.SERPER_KEY),
    scrapeSiteContacts(domain),
  ]);
  // known emails (with names where available) → infer the firm pattern
  const known = [...hunter];
  const byEmail = {}; for (const e of hunter) byEmail[e.value] = e;
  for (const e of site.emails) if (!byEmail[e.value]) byEmail[e.value] = { value: e.value, type: e.value.split('@')[0].length <= 4 ? 'generic' : 'personal', source: 'site' };
  const pattern = detectPattern(known, domain);
  // decision-makers (serper names + hunter positions + site linkedin) → generate candidate emails via pattern
  const dms = [];
  for (const e of hunter) if (DM.test(e.position || '')) dms.push({ name: e.name, first_name: e.first_name, last_name: e.last_name, title: e.position, email: e.value, linkedin: e.linkedin || '', source: 'hunter' });
  const seen = new Set(dms.map(d => (d.name || '').toLowerCase()));
  for (const d of dmSerper) { const k = (d.name || '').toLowerCase(); if (d.name && !seen.has(k)) { seen.add(k); const guess = pattern ? applyPattern(pattern, d.first_name, d.last_name, domain) : null; dms.push({ name: d.name, first_name: d.first_name, last_name: d.last_name, title: d.title, email: guess || '', email_guessed: !!guess, linkedin: d.linkedin, source: 'serper' }); if (guess && !byEmail[guess]) byEmail[guess] = { value: guess, name: d.name, position: d.title, type: 'personal', source: 'pattern', guessed: true }; } }
  let emails = Object.values(byEmail);
  // verify (free MX/disposable/role; NeverBounce booster) — cap to protect any keyed quota
  if (verify) { for (const e of emails.slice(0, 25)) { const v = await verifyFree(e.value, env); e.verified = v.verified; e.verify_status = v.status; e.verify_provider = v.provider; e.role = v.role; } }
  for (const d of dms) if (d.email) { const e = emails.find(x => x.value === d.email); if (e) d.verified = !!e.verified; }
  const verifiedEmails = emails.filter(e => e.verified);
  const rec = {
    domain, company: company || '', pattern,
    emails, decisionMakers: dms, linkedin_people: site.people.map(p => p.linkedin),
    counts: { emails: emails.length, verified: verifiedEmails.length, decision_makers: dms.length, guessed: emails.filter(e => e.guessed).length },
    sources: { hunter: hunter.length, serper: dmSerper.length, site_emails: site.emails.length, site_linkedin: site.people.length },
    send_ready: verifiedEmails.length > 0,
  };
  if (NEON()) await cachePut(domain, rec);
  return rec;
}

module.exports = { enrichCompany, verifyFree, detectPattern, applyPattern, hasMX, hunterDomainSearch, serperDecisionMakers, scrapeSiteContacts, DM };
