// Enrichment waterfall — a domain in, as many VERIFIED emails + decision-makers out, at £0.
// FREE engine (no Hunter required): site-scrape + Serper names + EMAIL-PATTERN INFERENCE + decision-maker
// name -> candidate email + MX/disposable/role verification (no SMTP, port 25 is blocked everywhere).
// Hunter/NeverBounce are optional boosters. Every result cached in Neon so a domain is enriched once.
'use strict';
const dns = require('dns').promises;
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
const DM = /(owner|founder|co-?founder|ceo|chief executive|managing director|\bmd\b|managing partner|senior partner|\bpartner\b|principal|\bdirector\b|head of|vice president|\bvp\b|chief|\bcmo\b|\bcto\b|\bcoo\b|\bcfo\b|business development|sales director|sales manager|marketing director|practice manager|clinic director|general manager)/i;
const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
// Phase A convergence: the engine's canonical 10-layer verifier is the source of truth.
let _canonicalVerify = null;
try { _canonicalVerify = require(require('path').resolve(__dirname, '..', 'enrich', 'free-verify.js')).verifyEmail; } catch (_) {}
let _canonicalEnrich = null;
try { _canonicalEnrich = require(require('path').resolve(__dirname, '..', 'enrich', 'waterfall.js')).enrichLead; } catch (_) {}

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

// ---- free verify: canonical 10-layer (free-verify.js) with inline as backup ----
async function verifyFree(email, env) {
  if (_canonicalVerify) {
    try {
      const r = await _canonicalVerify(email, env || {});
      const c = r.checks || {};
      return { verified: r.status === 'valid', status: r.status, score: r.score, role: !!c.role, disposable: !!c.disposable, mx: !!c.mx, provider: r.source || 'free-verify' };
    } catch (_) { /* fall through to inline backup */ }
  }
  return verifyFreeInline(email, env);
}
async function verifyFreeInline(email, env) {
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
// The firm's OWN website is the strongest email signal. Pull every address (mailto + plain-text +
// common obfuscations), and for each, bind a nearby NAME + ROLE from the surrounding HTML so the
// decision-maker's email can be identified (source 'site_named' when a person is attached).
const _ASSET = /\.(png|jpe?g|gif|svg|webp|css|js|ico|pdf|woff2?|ttf|mp4|webm)$/i;
const _PLACEHOLDER = /(example\.(com|org)|sentry\.io|wixpress|squarespace|godaddy|domain\.com|yourdomain|email\.com|company\.com)/i;
const _GENERIC_LOCAL = /^(info|contact|hello|hi|admin|sales|support|enquir(y|ies)|office|mail|team|reception|help|no-?reply|accounts|marketing|careers|jobs|hr|press|media|bookings?|appointments?|general)$/i;
function _stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim(); }
// Words that are titles/labels, not part of a person's name — a name candidate stops at the first of these.
const _NAME_STOP = /^(Managing|Senior|Junior|Associate|Partner|Partners|Director|Directors|Manager|Practice|Clinic|Office|Operations|Head|Chief|Executive|Officer|Founder|Co|Owner|Principal|Solicitor|Solicitors|Barrister|Surveyor|Accountant|Lawyer|Lawyers|Consultant|Adviser|Advisor|General|Sales|Marketing|Business|Development|Commercial|Email|Contact|Tel|Telephone|Phone|Mobile|Fax|Our|The|Meet|Team|About|Reach|Call|Address|Registered|Company|Ltd|Limited|LLP)$/;
function _cleanName(raw) {
  const parts = String(raw || '').split(/\s+/); const out = [];
  for (const p of parts) { if (_NAME_STOP.test(p)) break; out.push(p); if (out.length >= 3) break; }
  return out.length >= 2 ? out.join(' ') : '';
}
const _NAME_RE = /\b[A-Z][a-z'’\-]{1,}\s+[A-Z][a-z'’.\-]{1,}\b/g; // two consecutive capitalized words
function _nearbyPerson(window, email) {
  const lp0 = email.split('@')[0];
  if (_GENERIC_LOCAL.test(lp0)) return { name: '', role: '' }; // generic inbox → never attribute a person
  const text = _stripTags(window);
  const near = text.slice(-90); // role + fallback name must be CLOSE to the email (avoid bleeding across cards)
  let role = ''; let mm; const rg = new RegExp(DM.source, 'gi'); while ((mm = rg.exec(near))) role = mm[0];
  const lp = lp0.replace(/[._\-+]/g, ' ').toLowerCase();
  const names = (text.match(_NAME_RE) || []).map(_cleanName).filter(Boolean);
  let name = '';
  // 1) STRONGEST: a name whose token matches the email's local part (closest match wins).
  for (let i = names.length - 1; i >= 0; i--) { const parts = names[i].toLowerCase().split(/\s+/); if (parts.some(p => p.length > 2 && lp.includes(p))) { name = names[i]; break; } }
  // 2) ELSE: only if a role is present right next to the email, take the nearest name to it.
  if (!name && role) { const cn = (near.match(_NAME_RE) || []).map(_cleanName).filter(Boolean); if (cn.length) name = cn[cn.length - 1]; }
  return { name: name.replace(/^(?:dr|mr|mrs|ms|miss|prof|sir|dame)\.?\s+/i, '').trim(), role: role.trim() };
}
// "name [at] domain [dot] co.uk" / "&#64;" / "(at)" → reconstruct a real address (handles multi-part TLDs).
const _OBF = /([a-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\}|&#0?64;|\sat\s)\s*([a-z0-9.\-]+)\s*(?:\[dot\]|\(dot\)|\{dot\}|&#0?46;|\sdot\s)\s*([a-z]{2,}(?:\.[a-z]{2,})?)/gi;
// PURE: extract emails (mailto + plain-text + obfuscated) and LinkedIn people from one page's HTML,
// binding nearby name+role to each email. Deterministic + unit-testable (no network).
function parseContactsFromHtml(html, domain, page = '/') {
  const out = { emails: [], people: [] };
  const seenE = new Set(), seenP = new Set();
  const root = String(domain || '').replace(/^www\./, '');
  const addEmail = (vRaw, window) => {
    const v = String(vRaw || '').toLowerCase().trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return;
    if (_ASSET.test(v) || _PLACEHOLDER.test(v)) return;
    const person = window ? _nearbyPerson(window, v) : { name: '', role: '' };
    if (seenE.has(v)) { const e = out.emails.find(x => x.value === v); if (e && !e.name && person.name) { e.name = person.name; e.title = person.role; e.source = 'site_named'; } return; }
    seenE.add(v);
    out.emails.push({ value: v, source: person.name ? 'site_named' : 'site', name: person.name || '', title: person.role || '', page });
  };
  for (const m of html.matchAll(/mailto:([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/gi)) addEmail(m[1], html.slice(Math.max(0, m.index - 200), m.index + 40));
  for (const m of html.matchAll(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi)) addEmail(m[0], html.slice(Math.max(0, m.index - 200), m.index + 40));
  for (const m of html.matchAll(_OBF)) addEmail(`${m[1]}@${m[2]}.${m[3]}`, html.slice(Math.max(0, m.index - 160), m.index + 20));
  for (const m of html.matchAll(/(https?:\/\/[a-z]{0,3}\.?linkedin\.com\/in\/[A-Za-z0-9\-_%]+)/gi)) { const li = m[1]; if (!seenP.has(li)) { seenP.add(li); out.people.push({ linkedin: li, source: 'site' }); } }
  return out;
}
async function scrapeSiteContacts(domain) {
  const out = { emails: [], people: [] };
  const seenE = new Set(), seenP = new Set();
  for (const pth of ['', '/team', '/about', '/about-us', '/contact', '/contact-us', '/our-team', '/people', '/our-people', '/staff', '/meet-the-team', '/leadership', '/partners', '/management']) {
    const html = await getText('https://' + domain + pth, 12000); if (!html) continue;
    const part = parseContactsFromHtml(html, domain, pth || '/');
    for (const e of part.emails) { if (seenE.has(e.value)) { const cur = out.emails.find(x => x.value === e.value); if (cur && !cur.name && e.name) { cur.name = e.name; cur.title = e.title; cur.source = 'site_named'; } } else { seenE.add(e.value); out.emails.push(e); } }
    for (const p of part.people) { if (!seenP.has(p.linkedin)) { seenP.add(p.linkedin); out.people.push(p); } }
  }
  return out;
}

async function cacheGet(domain) { const r = await sql(`SELECT payload FROM enrichment_cache WHERE domain='${esc(domain)}' AND refreshed_at > NOW() - INTERVAL '30 days'`); return (r.ok && r.rows[0]) ? r.rows[0].payload : null; }
async function cachePut(domain, rec) { try { const p = `'${esc(JSON.stringify(rec))}'::jsonb`; await sql(`INSERT INTO enrichment_cache (domain, payload, email_count, verified_count, dm_count, source, refreshed_at) VALUES ('${esc(domain)}', ${p}, ${rec.counts.emails}, ${rec.counts.verified}, ${rec.counts.decision_makers}, 'waterfall', NOW()) ON CONFLICT (domain) DO UPDATE SET payload=EXCLUDED.payload, email_count=EXCLUDED.email_count, verified_count=EXCLUDED.verified_count, dm_count=EXCLUDED.dm_count, refreshed_at=NOW()`); } catch (_) {} }

async function enrichCompany({ domain, company, sector, env = process.env, verify = true, useCache = true, apify = false }) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (useCache && NEON()) { const c = await cacheGet(domain); if (c) { c.cached = true; return c; } }
  // CONVERGED: base discovery (website + emails + socials) comes from the canonical waterfall.enrichLead.
  // My adds on top: Serper decision-makers, email-pattern inference, free verification, Neon cache.
  let base = { website: '', emails: [], contacts: [], linkedin: '', instagram: '' };
  if (_canonicalEnrich) { try { base = await _canonicalEnrich({ company: company || domain.split('.')[0], domain }); } catch (_) {} }
  let _firmo = {}, _social = { socials: {} };
  try { _firmo = await require('./firmographics.js').extractFirmographics({ domain, company, env }); } catch (_) {}
  try { _social = await require('./social-find.js').findSocials({ domain }); } catch (_) {}
  const [hunter, dmSerper, site] = await Promise.all([
    Promise.resolve((base.contacts || []).map(c => ({ value: (c.email || '').toLowerCase(), first_name: c.first_name || '', last_name: c.last_name || '', name: [c.first_name, c.last_name].filter(Boolean).join(' '), position: c.position || '', type: c.type || '', confidence: c.confidence || 0, linkedin: '', source: 'waterfall' }))),
    serperDecisionMakers(company || domain.split('.')[0], env.SERPER_KEY),
    scrapeSiteContacts(domain).then(s => ({ emails: s.emails || [], people: [...(base.linkedin ? [{ linkedin: base.linkedin }] : []), ...(s.people || [])] })).catch(() => ({ emails: [], people: base.linkedin ? [{ linkedin: base.linkedin }] : [] })),
  ]);
  // known emails (with names where available) → infer the firm pattern
  const known = [...hunter];
  const byEmail = {}; for (const e of hunter) byEmail[e.value] = e;
  for (const e of site.emails) {
    if (!byEmail[e.value]) byEmail[e.value] = { value: e.value, name: e.name || '', position: e.title || '', type: e.name ? 'personal' : (e.value.split('@')[0].length <= 4 ? 'generic' : 'personal'), source: e.source || 'site' };
    else { if (e.name && !byEmail[e.value].name) byEmail[e.value].name = e.name; if (e.title && !byEmail[e.value].position) byEmail[e.value].position = e.title; if (e.source === 'site_named') byEmail[e.value].source = 'site_named'; }
  }
  const pattern = detectPattern(known, domain);
  // decision-makers (serper names + hunter positions + site linkedin) → generate candidate emails via pattern
  const dms = [];
  for (const e of hunter) if (DM.test(e.position || '')) dms.push({ name: e.name, first_name: e.first_name, last_name: e.last_name, title: e.position, email: e.value, linkedin: e.linkedin || '', source: 'hunter' });
  const seen = new Set(dms.map(d => (d.name || '').toLowerCase()));
  for (const d of dmSerper) { const k = (d.name || '').toLowerCase(); if (d.name && !seen.has(k)) { seen.add(k); const guess = pattern ? applyPattern(pattern, d.first_name, d.last_name, domain) : null; dms.push({ name: d.name, first_name: d.first_name, last_name: d.last_name, title: d.title, email: guess || '', email_guessed: !!guess, linkedin: d.linkedin, source: 'serper' }); if (guess && !byEmail[guess]) byEmail[guess] = { value: guess, name: d.name, position: d.title, type: 'personal', source: 'pattern', guessed: true }; } }
  // Companies House officers = authoritative decision-makers (£0, official register). Generate candidate emails
  // via the firm's detected pattern, else default to the most-common B2B form first.last@domain.
  try {
    const _ch = require('./companies-house.js');
    const _chRes = await _ch.findDecisionMakers({ company: company || domain.split('.')[0], domain });
    for (const o of (_chRes.officers || [])) {
      const k = (o.name || '').toLowerCase(); if (!o.name || seen.has(k)) continue; seen.add(k);
      const parts = o.name.trim().split(/\s+/); const first = parts[0] || ''; const last = parts.length > 1 ? parts[parts.length - 1] : '';
      const guess = pattern ? applyPattern(pattern, first, last, domain) : ((first && last) ? (first.toLowerCase() + '.' + last.toLowerCase() + '@' + domain) : '');
      dms.push({ name: o.name, first_name: first, last_name: last, title: o.role || 'Director', email: guess, email_guessed: !!guess, linkedin: '', source: 'companies_house', ch_url: _chRes.ch_url || '' });
      if (guess && !byEmail[guess]) byEmail[guess] = { value: guess, name: o.name, position: o.role || 'Director', type: 'personal', source: 'companies_house_pattern', guessed: true };
    }
  } catch (_) {}
  // Regulator registers (SRA / FCA / CQC) name the role-holders who carry the regulatory liability — the
  // near-free decision-maker backbone for this niche. Name → firm email pattern → candidate address (guessed).
  try {
    const { findRegulatedOfficers } = require('./dm-registers.js');
    const regOfficers = await findRegulatedOfficers({ company: company || domain.split('.')[0], domain, sector, env });
    for (const o of regOfficers) {
      const k = (o.name || '').toLowerCase(); if (!o.name || seen.has(k)) continue; seen.add(k);
      const parts = o.name.trim().split(/\s+/); const first = parts[0] || ''; const last = parts.length > 1 ? parts[parts.length - 1] : '';
      const guess = pattern ? applyPattern(pattern, first, last, domain) : ((first && last) ? (first.toLowerCase() + '.' + last.toLowerCase() + '@' + domain) : '');
      dms.push({ name: o.name, first_name: first, last_name: last, title: o.role || 'Officer', email: guess, email_guessed: !!guess, linkedin: '', source: 'register_pattern', register: o.source || 'register' });
      if (guess && !byEmail[guess]) byEmail[guess] = { value: guess, name: o.name, position: o.role || '', type: 'personal', source: 'register_pattern', guessed: true };
    }
  } catch (_) {}
  // Website-named people with a decision-maker role = the strongest DM signal (founder's primary source).
  for (const e of site.emails) {
    if (e.name && e.title && DM.test(e.title)) {
      const k = e.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      const parts = e.name.trim().split(/\s+/);
      dms.push({ name: e.name, first_name: parts[0] || '', last_name: parts.length > 1 ? parts[parts.length - 1] : '', title: e.title, email: e.value, email_guessed: false, linkedin: '', source: 'site_named' });
    }
  }
  let emails = Object.values(byEmail);
  // verify (free MX/disposable/role; NeverBounce booster) — cap to protect any keyed quota, but verify the
  // NAMED / decision-maker emails FIRST so a register/CH-derived DM beyond index 25 isn't left unverified
  // (which would wrongly demote a real buyer out of Tier 1).
  const _VCAP = Math.max(25, parseInt(env.ENRICH_VERIFY_CAP || '40', 10));
  if (verify) {
    const _dmEmails = new Set(dms.map(d => d.email).filter(Boolean));
    const _ordered = [...emails].sort((a, b) => ((b.name ? 2 : 0) + (_dmEmails.has(b.value) ? 1 : 0)) - ((a.name ? 2 : 0) + (_dmEmails.has(a.value) ? 1 : 0)));
    for (const e of _ordered.slice(0, _VCAP)) { const v = await verifyFree(e.value, env); e.verified = v.verified; e.verify_status = v.status; e.verify_provider = v.provider; e.role = v.role; }
  }
  for (const d of dms) if (d.email) { const e = emails.find(x => x.value === d.email); if (e) d.verified = !!e.verified; }
  // Phase C: registry officers are decision-makers too
  for (const o of (_firmo.officers || [])) { const k = (o.name || '').toLowerCase(); if (o.name && !seen.has(k)) { seen.add(k); dms.push({ name: o.name, title: o.role || 'Officer', email: '', linkedin: '', source: 'companies_house' }); } }
  // Pick THE decision-maker's email (primary) + rank the rest as secondary cc/bcc contacts.
  let dmsel = { primary: null, secondary: [] };
  try { dmsel = require('../enrich/dm-email-scoring.js').selectDecisionMaker({ emails, decisionMakers: dms }); } catch (_) {}
  // Apify escalation (opt-in via apify:true, cost-governed) — ONLY when free-DIY produced no VERIFIED
  // decision-maker email. This is the cost-minimizing gate: the cheap actors run on the gated subset only.
  if (apify && (!dmsel.primary || !dmsel.primary.verified)) {
    try {
      const A = require('../apify/client.js');
      const [leadsFound, cd] = await Promise.all([
        A.findDecisionMakerEmail({ domain, company, env }).catch(() => []),
        A.contactDetails({ domain, env }).catch(() => ({ emails: [], socials: {} })),
      ]);
      for (const p of leadsFound) {
        if (!p.email) continue; const v = p.email.toLowerCase();
        if (!byEmail[v]) byEmail[v] = { value: v, name: p.name || '', position: p.title || '', type: 'personal', source: 'apify_leads' };
        const k = (p.name || '').toLowerCase(); if (p.name && !seen.has(k)) { seen.add(k); dms.push({ name: p.name, title: p.title || '', email: v, linkedin: p.linkedin || '', source: 'apify_leads', verified: !!p.verified }); }
      }
      for (const e of (cd.emails || [])) { const v = (e.value || '').toLowerCase(); if (v && !byEmail[v]) byEmail[v] = { value: v, type: v.split('@')[0].length <= 4 ? 'generic' : 'personal', source: 'apify_contact' }; }
      for (const [k, u] of Object.entries(cd.socials || {})) { if (u && !(_social.socials || {})[k]) { _social.socials = _social.socials || {}; _social.socials[k] = { url: u }; } }
      emails = Object.values(byEmail);
      if (verify) { for (const e of emails.filter(x => x.verified == null).slice(0, _VCAP)) { const v = await verifyFree(e.value, env); e.verified = v.verified; e.verify_status = v.status; e.verify_provider = v.provider; e.role = v.role; } }
      // Optional Apify deliverability verify on still-unverified candidates (final gate).
      try {
        const unver = emails.filter(e => !e.verified).map(e => e.value);
        if (unver.length) { const vr = await A.verifyEmails({ emails: unver, env }); const { isVerifiedStatus } = require('../enrich/verify-status.js'); for (const r of vr) { const e = emails.find(x => x.value === r.email); if (e && r.status) { e.verified = isVerifiedStatus(r.status); e.verify_status = r.status; e.verify_provider = 'apify_verify'; } } }
      } catch (_) {}
      for (const d of dms) if (d.email) { const e = emails.find(x => x.value === d.email); if (e) d.verified = !!e.verified; }
      try { dmsel = require('../enrich/dm-email-scoring.js').selectDecisionMaker({ emails, decisionMakers: dms }); } catch (_) {}
    } catch (_) {}
  }
  const verifiedEmails = emails.filter(e => e.verified);
  const rec = {
    domain, company: company || '', pattern,
    website: base.website || ('https://' + domain), instagram: (_social.socials.instagram && _social.socials.instagram.url) || base.instagram || '',
    socials: _social.socials || {}, firmographics: { reg_number: _firmo.reg_number || null, registration_country: _firmo.country || '', jurisdiction: _firmo.jurisdiction || '', vat_number: _firmo.vat_number || null, status: _firmo.status || '', officers: _firmo.officers || [], operating_countries: _firmo.operating_countries || [], regions: _firmo.regions || [], serves_eu: !!_firmo.serves_eu, confident_country: !!_firmo.confident_country },
    emails, decisionMakers: dms, linkedin_people: site.people.map(p => p.linkedin),
    primary: dmsel.primary, secondary_emails: dmsel.secondary || [], decision_maker_confidence: dmsel.primary ? dmsel.primary.confidence : 0,
    counts: { emails: emails.length, verified: verifiedEmails.length, decision_makers: dms.length, guessed: emails.filter(e => e.guessed).length },
    sources: { hunter: hunter.length, serper: dmSerper.length, site_emails: site.emails.length, site_linkedin: site.people.length },
    send_ready: verifiedEmails.length > 0,
  };
  if (NEON()) await cachePut(domain, rec);
  return rec;
}

module.exports = { enrichCompany, verifyFree, detectPattern, applyPattern, hasMX, hunterDomainSearch, serperDecisionMakers, scrapeSiteContacts, parseContactsFromHtml, DM };
