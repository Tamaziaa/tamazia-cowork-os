'use strict';
// P2.16 content-gap: the buyer questions your site has no page for. Pulls real buyer queries from free Google
// autocomplete (via rank-insight) and the firm's actual URL inventory from its sitemap, then flags the
// high-intent queries whose distinctive term appears on NO page. Fail-open (no sitemap or no queries -> no finding).
const https = require('https');
let _ac; try { _ac = require('../touch0/rank-insight.js').autocomplete; } catch (_e) {}
const STOP = new Set(['best','top','near','me','in','the','a','for','of','and','to','your','my','services','service','company','firm','uk','london','prices','cost','reviews','free','online','vs','&']);

function _get(url, timeout = 9000) {
  return new Promise((res) => { const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (TamaziaAuditBot)' }, timeout }, r => { if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { return res(_get(r.headers.location, timeout)); } let b = ''; r.on('data', d => b += d); r.on('end', () => res(r.statusCode === 200 ? b : '')); }); req.on('error', () => res('')); req.on('timeout', () => { req.destroy(); res(''); }); });
}
async function urlInventory(domain) {
  let xml = await _get('https://' + domain + '/sitemap.xml'); if (!xml) xml = await _get('https://' + domain + '/sitemap_index.xml');
  if (!xml) return [];
  let locs = (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map(m => m.replace(/<\/?loc>/g, '').trim());
  // sitemap index -> fetch up to 3 child sitemaps
  if (/sitemapindex/i.test(xml)) { const kids = locs.filter(l => /\.xml/i.test(l)).slice(0, 3); locs = []; for (const k of kids) { const cx = await _get(k); (cx.match(/<loc>([^<]+)<\/loc>/g) || []).forEach(m => locs.push(m.replace(/<\/?loc>/g, '').trim())); } }
  return locs.slice(0, 400);
}
function _slugTokens(urls) {
  const t = new Set();
  for (const u of urls) { try { const p = new URL(u).pathname.toLowerCase(); p.split(/[\/\-_]+/).forEach(x => { if (x.length > 2 && !/^\d+$/.test(x)) t.add(x); }); } catch (_e) {} }
  return t;
}
function _distinctTokens(query, serviceNoun, city) {
  const sn = new Set(String(serviceNoun || '').toLowerCase().split(/\s+/));
  const cy = new Set(String(city || '').toLowerCase().split(/\s+/));
  return String(query || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !sn.has(w) && !cy.has(w));
}
async function contentGap({ domain, serviceNoun, city, sector, env = process.env } = {}) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*/, '').replace(/^www\./, '');
  if (!domain || !_ac || !serviceNoun) return { ok: true, finding: null };
  let queries = [];
  try { const seeds = [serviceNoun + (city ? ' ' + city : ''), 'best ' + serviceNoun, serviceNoun + ' for']; for (const s of seeds) { const a = await _ac(s); if (Array.isArray(a)) queries.push(...a); } } catch (_e) {}
  const NOISE = /\b(salary|salaries|jobs?|vacanc|careers?|courses?|training|apprentice|qualif|becom\w*|trainee|paralegal|intern|degree|diploma|what is|what does|meaning|definition|wikipedia|reddit|quora|work experience|law school|training contract|pupillage|nq\b|legal aid|free)\b/i;
  const OTHER_CITY = /(southampton|leicester|manchester|birmingham|leeds|glasgow|edinburgh|bristol|liverpool|cardiff|sheffield|nottingham|newcastle|brighton|reading|oxford|cambridge|coventry|hull|belfast|aberdeen|dundee|york|bath|exeter|plymouth|portsmouth|swansea|dubai|abu dhabi|new york)/i;
  const fcity = String(city || '').toLowerCase();
  queries = [...new Set(queries.map(q => String(q).toLowerCase().trim()).filter(q => q.length > 6))]
    .filter(q => !NOISE.test(q))                                   // drop job / education / informational intent
    .filter(q => { const m = q.match(OTHER_CITY); return !m || (fcity && fcity.includes(m[1].toLowerCase())); }) // drop other-location noise
    .slice(0, 25);
  if (queries.length < 4) return { ok: true, finding: null };
  const inv = await urlInventory(domain);
  if (inv.length < 2) return { ok: true, finding: null }; // can't prove a gap without the page list
  const slugTok = _slugTokens(inv);
  const gaps = [];
  for (const q of queries) { const dt = _distinctTokens(q, serviceNoun, city); if (!dt.length) continue; const covered = dt.some(t => slugTok.has(t)); if (!covered) gaps.push(q); }
  const top = [...new Set(gaps)].slice(0, 6);
  if (top.length < 3) return { ok: true, finding: null, pages: inv.length, gaps: top };
  const finding = {
    bucket: 'seo', severity: 'P2', rule_type: 'observed', kind: 'observed', citation: 'Content gap', framework_short: 'SEO', citation_url: '',
    fact: 'Buyers search for ' + top.length + '+ topics you have no page for, including: ' + top.slice(0, 4).join('; ') + '.',
    layman_explanation: 'These are real questions your buyers type into Google for your category (pulled from live autocomplete). Your site has ' + inv.length + ' pages and none of them target these. Every one is a page a competitor can rank and be AI-cited for while you are absent, because a search engine and an AI engine can only surface a page that exists.',
    tamazia_fix_short: 'Tamazia builds the missing buyer-intent pages, each targeting one of these searches with depth and schema, so you capture the traffic and the AI citations.',
    evidence_quote: 'autocomplete queries with no matching page: ' + top.slice(0, 3).join(', '),
    evidence: 'free Google autocomplete vs your sitemap (' + inv.length + ' pages)', fine_low_gbp: null, fine_high_gbp: null,
  };
  return { ok: true, finding, pages: inv.length, gaps: top };
}
module.exports = { contentGap, urlInventory };
