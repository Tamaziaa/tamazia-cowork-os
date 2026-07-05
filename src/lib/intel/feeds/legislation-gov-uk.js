'use strict';
// src/lib/intel/feeds/legislation-gov-uk.js — Branch 9 prep · FREE legal feed adapter (isolated, unwired).
// Source: legislation.gov.uk "new legislation" Atom feed (https://www.legislation.gov.uk/new/data.feed).
// Pure module. Exports:
//   - parse(raw)            : PURE, deterministic. Atom string -> normalized records. Never throws.
//   - fetchRecords(opts)    : fetch + parse. FAIL-OPEN: on ANY error returns [] and notes the error.
// Normalized record: { title, source_url, jurisdiction, published, type, fingerprint }
//   fingerprint = sha1(source_url + '|' + title)  (stable across re-runs -> dedup).
// NOTHING is written to any DB, catalogue, or mint path here.

const crypto = require('crypto');

const JURISDICTION = 'UK';
const FEED_URL = 'https://www.legislation.gov.uk/new/data.feed';

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

// PURE. Given the raw Atom feed body, return normalized records. Any malformed / empty input -> [].
function parse(raw) {
  const out = [];
  try {
    const body = String(raw || '');
    if (!body) return [];
    const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
      const block = m[1];
      const title = tag(block, 'title');
      let source_url = '';
      const linkAlt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
        || block.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
      const linkAny = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      const idTag = block.match(/<id[^>]*>([\s\S]*?)<\/id>/i);
      source_url = decodeEntities((linkAlt && linkAlt[1]) || (linkAny && linkAny[1]) || (idTag && idTag[1]) || '');
      const published = tag(block, 'updated') || tag(block, 'published') || '';
      if (!title || !source_url) continue;
      out.push({
        title,
        source_url,
        jurisdiction: JURISDICTION,
        published: published || null,
        type: 'legislation',
        fingerprint: fingerprintOf(source_url, title),
      });
    }
  } catch (_e) {
    return [];
  }
  return out;
}

// fetchRecords — network wrapper. FAIL-OPEN: never throws; on error returns [] and pushes note.
async function fetchRecords(opts = {}) {
  const url = opts.url || FEED_URL;
  const timeout = opts.timeout || 15000;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; TamaziaComplianceBot/1.0; +https://tamazia.co.uk)', accept: 'application/atom+xml,application/xml,text/xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) { if (opts.notes) opts.notes.push(`legislation-gov-uk: HTTP ${res.status}`); return []; }
    const raw = await res.text();
    return parse(raw);
  } catch (e) {
    if (opts.notes) opts.notes.push(`legislation-gov-uk: ${e && e.message ? e.message : String(e)}`);
    return [];
  }
}

module.exports = { fetchRecords, parse, fingerprintOf, FEED_URL, JURISDICTION };
