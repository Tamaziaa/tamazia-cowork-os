'use strict';
// src/lib/intel/feeds/eurlex-cellar.js — Branch 9 prep · FREE legal feed adapter (isolated, unwired).
// Source: EUR-Lex recently-modified legal acts. EUR-Lex exposes CELLAR (SPARQL) + RSS. We use the RSS shape
// (simplest, no auth) and also accept a CELLAR/SPARQL JSON binding shape so either feed can drive it.
// Pure module. Exports:
//   - parse(raw)          : PURE, deterministic. RSS xml OR SPARQL-JSON string -> normalized records. Never throws.
//   - fetchRecords(opts)  : fetch + parse. FAIL-OPEN: on ANY error returns [] and notes the error.
// Normalized record: { title, source_url, jurisdiction, published, type, fingerprint }
//   fingerprint = sha1(source_url + '|' + title).
// NOTHING is written to any DB, catalogue, or mint path here.

const crypto = require('crypto');

const JURISDICTION = 'EU';
// Public EUR-Lex "recently modified" RSS (myRssId is a public feed handle).
const FEED_URL = 'https://eur-lex.europa.eu/EN/display-feed.rss?myRssId=recently-modified';

function fingerprintOf(source_url, title) {
  return crypto.createHash('sha1').update(`${source_url || ''}|${title || ''}`).digest('hex');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) : '';
}

// Parse a SPARQL/CELLAR JSON results.bindings block. Returns [] if not that shape.
function parseSparqlJson(body) {
  const out = [];
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    const rows = j && j.results && Array.isArray(j.results.bindings) ? j.results.bindings : null;
    if (!rows) return [];
    for (const r of rows) {
      const title = (r.title && r.title.value) || (r.expr_title && r.expr_title.value) || '';
      const source_url = (r.work && r.work.value) || (r.cellarId && r.cellarId.value) || (r.uri && r.uri.value) || '';
      const published = (r.date && r.date.value) || (r.modified && r.modified.value) || '';
      if (!title || !source_url) continue;
      out.push({
        title: decodeEntities(title), source_url: decodeEntities(source_url), jurisdiction: JURISDICTION,
        published: published || null, type: 'legal-act', fingerprint: fingerprintOf(source_url, title),
      });
    }
  } catch (_e) { return []; }
  return out;
}

// PURE. Accepts RSS xml OR SPARQL-JSON. Any malformed / empty input -> [].
function parse(raw) {
  const body = String(raw || '');
  if (!body) return [];
  // JSON path (CELLAR SPARQL)
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{')) {
    const j = parseSparqlJson(body);
    if (j.length) return j;
  }
  const out = [];
  try {
    const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(body)) !== null) {
      const block = m[1];
      const title = tag(block, 'title');
      const link = tag(block, 'link') || tag(block, 'guid');
      const published = tag(block, 'pubDate') || tag(block, 'date') || '';
      if (!title || !link) continue;
      out.push({
        title, source_url: link, jurisdiction: JURISDICTION,
        published: published || null, type: 'legal-act', fingerprint: fingerprintOf(link, title),
      });
    }
  } catch (_e) { return []; }
  return out;
}

async function fetchRecords(opts = {}) {
  const url = opts.url || FEED_URL;
  const timeout = opts.timeout || 15000;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; TamaziaComplianceBot/1.0; +https://tamazia.co.uk)', accept: 'application/rss+xml,application/xml,application/sparql-results+json,application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) { if (opts.notes) opts.notes.push(`eurlex-cellar: HTTP ${res.status}`); return []; }
    const raw = await res.text();
    return parse(raw);
  } catch (e) {
    if (opts.notes) opts.notes.push(`eurlex-cellar: ${e && e.message ? e.message : String(e)}`);
    return [];
  }
}

module.exports = { fetchRecords, parse, parseSparqlJson, fingerprintOf, FEED_URL, JURISDICTION };
