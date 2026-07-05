'use strict';
// Phase 3.1 — config-driven feed registry + checksum change-detection. Coverage grows by adding a FEED_SOURCES row.
// Each source: {id, jurisdiction, url, parse}. fetchFeed retries with backoff (self-healing). detectChanges checksums
// every entry and classifies new/updated/unchanged vs the stored state -> law_change_events (event-sourced). A legal
// re-review BLOCKING flag is set on any new/updated entry. FAIL-OPEN: unreachable feed => [] (no crash, staleness noted).
const https = require('https'); const crypto = require('crypto');

const FEED_SOURCES = [
  { id: 'uk-legislation', jurisdiction: 'UK', url: 'https://www.legislation.gov.uk/new/data.feed', parse: parseAtom },
  { id: 'eur-lex-oj',     jurisdiction: 'EU', url: 'https://eur-lex.europa.eu/oj/direct-access.html', parse: parseAtom },
  { id: 'ico-enforcement', jurisdiction: 'UK', url: 'https://ico.org.uk/action-weve-taken/enforcement/', parse: parseAtom },
];

function _get(url, timeoutMs) {
  return new Promise(resolve => {
    try { const req = https.get(url, { timeout: timeoutMs || 12000, headers: { 'User-Agent': 'tamazia-feed/1.0', Accept: 'application/atom+xml,text/html' } },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
      req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); }); } catch (_) { resolve(null); }
  });
}
async function fetchFeed(source, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await _get(source.url);
    if (r && r.status === 200 && r.body) return r.body;
    await new Promise(res => setTimeout(res, 400 * Math.pow(2, i)));   // exponential backoff (self-healing)
  }
  return null;   // fail-open: staleness, not a crash
}
// minimal Atom/RSS entry parser: [{entry_id, title, url, updated}]
function parseAtom(xml) {
  if (!xml) return [];
  const out = []; const blocks = xml.split(/<(?:entry|item)[\s>]/i).slice(1);
  for (const b of blocks) {
    const t = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const id = (b.match(/<id[^>]*>([\s\S]*?)<\/id>/i) || b.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || t;
    const url = (b.match(/<link[^>]*href="([^"]+)"/i) || b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const upd = (b.match(/<(?:updated|pubDate|published)[^>]*>([\s\S]*?)<\/(?:updated|pubDate|published)>/i) || [])[1] || '';
    if (id || t) out.push({ entry_id: String(id).trim().slice(0, 300), title: String(t).replace(/<[^>]+>/g, '').trim().slice(0, 400), url: String(url).trim(), updated: String(upd).trim() });
  }
  return out;
}
function checksum(entry) { return crypto.createHash('sha256').update((entry.title || '') + '|' + (entry.updated || '') + '|' + (entry.url || '')).digest('hex').slice(0, 32); }
// classify entries vs a prior-state lookup (fn: entry_id -> last checksum|null). Pure + testable.
function detectChanges(entries, priorChecksum) {
  const events = [];
  for (const e of (entries || [])) {
    const cs = checksum(e); const prev = priorChecksum(e.entry_id);
    const change_type = prev == null ? 'new' : (prev !== cs ? 'updated' : 'unchanged');
    events.push({ entry_id: e.entry_id, title: e.title, entry_url: e.url, checksum: cs, change_type,
      requires_legal_review: change_type !== 'unchanged' });   // BLOCKING re-review flag on any change
  }
  return events;
}
module.exports = { FEED_SOURCES, fetchFeed, parseAtom, checksum, detectChanges };
