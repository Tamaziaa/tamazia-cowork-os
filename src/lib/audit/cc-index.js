'use strict';
// §2 — Common Crawl Index (CDX) API. Keyless, public, free. Two cheap calls per domain:
//   (a) showNumPages probe → how many HTML pages of this domain the open web has indexed (content-depth signal)
//   (b) a capped URL list → tokenise the firm's own slugs into a REAL on-site topic set (content-gap backstop)
// Both fail-open to null so the engine never depends on CC. We pick the newest crawl id once and cache it.
// Polite: 1 call/domain for each of (a)/(b), 12s timeout, no retries. ADDITIVE — never throws.
const https = require('https');

const _HOST = 'index.commoncrawl.org';
let _crawlId = null;          // cached newest crawl id (e.g. CC-MAIN-2025-43)
let _crawlIdAt = 0;
const _footCache = new Map(); // domain -> { indexed_pages, topics } | null

// The public CDX front-end (index.commoncrawl.org) is periodically overloaded and 504s on every query.
// We treat a non-200 (incl. the 504 HTML body) as "unavailable" and fail-open. A short per-call budget
// keeps a CC outage from adding dead wait to a mint; one tripped call disables CC for the rest of the build.
let _ccDown = false;
function _getJson(path, timeoutMs) {
  return new Promise((resolve) => {
    // Bounded ≤6s per call (was 8s): CC is non-essential enrichment and its public CDX front-end periodically
    // hangs/504s; a tight per-call budget keeps a CC outage from adding dead wait to the mint. Fail-open to null.
    const req = https.get({ host: _HOST, path, headers: { 'User-Agent': 'tamazia-audit/1.0 (+https://tamazia.co.uk)' }, timeout: timeoutMs || 6000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const ct = String(res.headers['content-type'] || '');
      if (/text\/html/.test(ct)) { res.resume(); return resolve(null); }   // 504/error pages come back as HTML, not JSON
      let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(b));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Newest live crawl id from collinfo.json (changes ~monthly). Cached 6h in-process.
async function latestCrawlId() {
  if (_crawlId && (Date.now() - _crawlIdAt) < 6 * 3600 * 1000) return _crawlId;
  const body = await _getJson('/collinfo.json');
  if (!body) return _crawlId;            // keep any prior value; null if first call failed
  try {
    const arr = JSON.parse(body);
    if (Array.isArray(arr) && arr.length && arr[0] && arr[0].id) { _crawlId = arr[0].id; _crawlIdAt = Date.now(); }
  } catch (_e) {}
  return _crawlId;
}

const _norm = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();

// Tokenise indexed-URL pathnames → a deduped, ranked topic set (real on-site themes from the firm's own slugs).
const _STOP = new Set(['the','and','for','with','your','our','about','contact','home','index','page','pages','html','htm','php','aspx','www','com','co','uk','net','org','en','gb','us','blog','news','wp','content','uploads','assets','images','img','static','default','main','site','view','id','p','category','tag','post','posts','article','articles','services','service','privacy','terms','cookie','cookies','policy','sitemap','search','login','account','cart','checkout','faq','faqs']);
function _topicsFromUrls(urls) {
  const freq = new Map();
  for (const u of urls) {
    let path = '';
    try { path = new URL(u.startsWith('http') ? u : 'https://' + u).pathname; } catch (_e) { continue; }
    const segs = path.toLowerCase().replace(/\.(html?|php|aspx?)$/,'').split(/[/_\-?=&.+%]+/).filter(Boolean);
    for (let s of segs) {
      s = s.replace(/[^a-z]/g, '');
      if (s.length < 4 || s.length > 24 || _STOP.has(s) || /^\d+$/.test(s)) continue;
      freq.set(s, (freq.get(s) || 0) + 1);
    }
  }
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
}

// ccFootprint({domain}) → { indexed_pages:number|null, topics:string[] } or null on total failure.
async function ccFootprint({ domain } = {}) {
  const dom = _norm(domain);
  if (!dom) return null;
  if (_ccDown) return null;                       // CC front-end tripped earlier this build → skip fast
  if (_footCache.has(dom)) return _footCache.get(dom);
  const id = await latestCrawlId();
  if (!id) { _footCache.set(dom, null); return null; }
  const base = '/' + id + '-index?url=' + encodeURIComponent(dom) + '&matchType=domain&filter=status:200&filter=mimetype:text/html&output=json';

  // (a) cheap page-count probe (showNumPages returns {pages,pageSize,blocks} without downloading rows)
  let indexed_pages = null;
  const probe = await _getJson(base + '&showNumPages=true');
  if (!probe) { _ccDown = true; _footCache.set(dom, null); return null; }   // first (cheapest) call failed → CC unavailable, stop hammering
  try { const j = JSON.parse(probe.trim().split('\n')[0]); if (j && Number.isFinite(j.pages)) indexed_pages = j.pages; } catch (_e) {}

  // (b) capped URL list → real on-site topics from slugs
  let topics = [];
  const rows = await _getJson(base + '&fl=url&collapse=urlkey&limit=400');
  if (rows) {
    const urls = [];
    for (const line of rows.split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const o = JSON.parse(t); if (o && o.url) urls.push(o.url); } catch (_e) {}
    }
    if (urls.length) topics = _topicsFromUrls(urls);
  }

  const out = (indexed_pages != null || topics.length) ? { indexed_pages, topics } : null;
  _footCache.set(dom, out);
  return out;
}

module.exports = { ccFootprint, latestCrawlId };
