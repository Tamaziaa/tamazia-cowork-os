'use strict';
// src/lib/intel/feeds/courtlistener.js — Branch 9 prep · FREE legal feed adapter (isolated, unwired).
// Source: CourtListener opinions API v4 (https://www.courtlistener.com/api/rest/v4/opinions/).
// Token-OPTIONAL: if no COURTLISTENER_TOKEN is set we SKIP the network call cleanly (returns []), but parse()
// still works on any saved fixture for deterministic testing.
// Pure module. Exports:
//   - parse(raw)          : PURE, deterministic. JSON string/obj -> normalized records. Never throws.
//   - fetchRecords(opts)  : fetch + parse. FAIL-OPEN + token-optional: returns [] if no token or on any error.
// Normalized record: { title, source_url, jurisdiction, published, type, fingerprint }
//   fingerprint = sha1(source_url + '|' + title).
// NOTHING is written to any DB, catalogue, or mint path here.

const crypto = require('crypto');

const JURISDICTION = 'US';
const API_URL = 'https://www.courtlistener.com/api/rest/v4/opinions/';
const SITE = 'https://www.courtlistener.com';

function fingerprintOf(source_url, title) {
  return crypto.createHash('sha1').update(`${source_url || ''}|${title || ''}`).digest('hex');
}

function absoluteUrl(u) {
  const s = String(u || '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return SITE + (s.startsWith('/') ? s : '/' + s);
}

// Derive a human title from an opinion record (v4 opinions have no cluster case_name inline;
// fall back through the fields CourtListener actually returns).
function titleOf(op) {
  return (op.case_name || op.caseName ||
    (op.cluster && (op.cluster.case_name || op.cluster.caseName)) ||
    op.snippet ||
    (op.type ? `Opinion ${op.type}` : '') ||
    (op.id != null ? `Opinion ${op.id}` : '')).toString().trim();
}

// PURE. Accepts the v4 list response ({results:[...]}) or a bare array of opinions. Malformed/empty -> [].
function parse(raw) {
  const out = [];
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!j) return [];
    const rows = Array.isArray(j) ? j : (Array.isArray(j.results) ? j.results : null);
    if (!rows) return [];
    for (const op of rows) {
      if (!op || typeof op !== 'object') continue;
      const title = titleOf(op);
      const source_url = absoluteUrl(op.absolute_url || op.resource_uri || (op.id != null ? `/opinion/${op.id}/` : ''));
      const published = op.date_created || op.date_modified || (op.cluster && op.cluster.date_filed) || '';
      if (!title || !source_url) continue;
      out.push({
        title: title.slice(0, 300),
        source_url,
        jurisdiction: JURISDICTION,
        published: published || null,
        type: 'court-opinion',
        fingerprint: fingerprintOf(source_url, title.slice(0, 300)),
      });
    }
  } catch (_e) {
    return [];
  }
  return out;
}

// fetchRecords — token-optional + FAIL-OPEN. No token => skip cleanly (note it, return []).
async function fetchRecords(opts = {}) {
  const token = opts.token || process.env.COURTLISTENER_TOKEN || process.env.COURTLISTENER_API_TOKEN;
  if (!token) { if (opts.notes) opts.notes.push('courtlistener: no token — skipped cleanly'); return []; }
  const url = opts.url || `${API_URL}?order_by=-date_created`;
  const timeout = opts.timeout || 15000;
  try {
    const res = await fetch(url, {
      headers: {
        authorization: `Token ${token}`,
        'user-agent': 'Mozilla/5.0 (compatible; TamaziaComplianceBot/1.0; +https://tamazia.co.uk)',
        accept: 'application/json',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) { if (opts.notes) opts.notes.push(`courtlistener: HTTP ${res.status}`); return []; }
    const raw = await res.text();
    return parse(raw);
  } catch (e) {
    if (opts.notes) opts.notes.push(`courtlistener: ${e && e.message ? e.message : String(e)}`);
    return [];
  }
}

module.exports = { fetchRecords, parse, fingerprintOf, titleOf, API_URL, JURISDICTION };
