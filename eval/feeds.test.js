#!/usr/bin/env node
'use strict';
// eval/feeds.test.js — Branch 9 prep. Offline-deterministic tests for the three FREE legal-feed adapters.
// Asserts: correctly-shaped records from real fixtures, fingerprint stability across two parses, and FAIL-OPEN
// on malformed/empty input. Plus an OPTIONAL live reachability probe that SKIPS gracefully (never fails the
// suite) when network/token is unavailable. No DB writes. Exit 1 only on OFFLINE assertion failure.
const fs = require('fs');
const path = require('path');

const ukFeed = require('../src/lib/intel/feeds/legislation-gov-uk.js');
const euFeed = require('../src/lib/intel/feeds/eurlex-cellar.js');
const clFeed = require('../src/lib/intel/feeds/courtlistener.js');

const FX = path.join(__dirname, 'fixtures', 'feeds');
const read = (f) => fs.readFileSync(path.join(FX, f), 'utf8');

let pass = 0, fail = 0, skip = 0;
const F = (cond, msg) => { if (cond) { pass++; console.log('PASS ' + msg); } else { fail++; console.log('FAIL ' + msg); } };
const SKIP = (msg) => { skip++; console.log('SKIP ' + msg); };

const FIELDS = ['title', 'source_url', 'jurisdiction', 'published', 'type', 'fingerprint'];
function assertShaped(label, recs, jurisdiction) {
  F(Array.isArray(recs), `${label}: returns an array`);
  F(recs.length >= 1, `${label}: >=1 record parsed`);
  const r = recs[0] || {};
  for (const k of FIELDS) F(Object.prototype.hasOwnProperty.call(r, k), `${label}: record has field "${k}"`);
  // published MAY be null by design; all other fields must be non-empty strings.
  for (const k of ['title', 'source_url', 'jurisdiction', 'type', 'fingerprint']) {
    F(typeof r[k] === 'string' && r[k].length > 0, `${label}: field "${k}" non-empty`);
  }
  F(r.jurisdiction === jurisdiction, `${label}: jurisdiction === ${jurisdiction}`);
  F(/^https?:\/\//.test(r.source_url), `${label}: source_url is absolute http(s)`);
  F(/^[0-9a-f]{40}$/.test(r.fingerprint), `${label}: fingerprint is sha1 hex(40)`);
}
function assertFingerprintStable(label, mod, raw) {
  const a = mod.parse(raw), b = mod.parse(raw);
  F(a.length === b.length && a.length >= 1, `${label}: two parses same count`);
  const fa = a.map((x) => x.fingerprint).join(',');
  const fb = b.map((x) => x.fingerprint).join(',');
  F(fa === fb, `${label}: fingerprints stable across two parses`);
  // fingerprint is a deterministic function of source_url+title only
  const manual = mod.fingerprintOf(a[0].source_url, a[0].title);
  F(manual === a[0].fingerprint, `${label}: fingerprint === sha1(source_url|title)`);
}
function assertFailOpen(label, mod) {
  for (const bad of ['', null, undefined, '<not xml', '{"broken":', '<feed></feed>', '{}', '[]', 12345, {}]) {
    let out;
    try { out = mod.parse(bad); } catch (e) { out = '__threw__'; }
    F(Array.isArray(out) && out.length === 0, `${label}: fail-open [] on ${JSON.stringify(bad)}`);
  }
}

console.log('=== OFFLINE: legislation.gov.uk (UK) ===');
const ukRaw = read('legislation-gov-uk.atom.xml');
const ukRecs = ukFeed.parse(ukRaw);
assertShaped('UK', ukRecs, 'UK');
assertFingerprintStable('UK', ukFeed, ukRaw);
assertFailOpen('UK', ukFeed);
F(ukRecs.length === 3, 'UK: fixture yields exactly 3 entries');
F(ukRecs[0].type === 'legislation', 'UK: type === legislation');

console.log('=== OFFLINE: EUR-Lex (EU) — RSS ===');
const euRaw = read('eurlex-cellar.rss.xml');
const euRecs = euFeed.parse(euRaw);
assertShaped('EU-rss', euRecs, 'EU');
assertFingerprintStable('EU-rss', euFeed, euRaw);
assertFailOpen('EU', euFeed);
F(euRecs.length === 2, 'EU-rss: fixture yields exactly 2 items');
F(euRecs[0].type === 'legal-act', 'EU-rss: type === legal-act');

console.log('=== OFFLINE: EUR-Lex (EU) — CELLAR SPARQL JSON ===');
const euJson = read('eurlex-cellar.sparql.json');
const euJsonRecs = euFeed.parse(euJson);
assertShaped('EU-sparql', euJsonRecs, 'EU');
F(euJsonRecs.length === 2, 'EU-sparql: fixture yields exactly 2 bindings');
F(/^https?:\/\//.test(euJsonRecs[0].source_url), 'EU-sparql: CELLAR work URI captured as source_url');

console.log('=== OFFLINE: CourtListener (US) ===');
const clRaw = read('courtlistener.opinions.json');
const clRecs = clFeed.parse(clRaw);
assertShaped('US', clRecs, 'US');
assertFingerprintStable('US', clFeed, clRaw);
assertFailOpen('US', clFeed);
F(clRecs.length === 2, 'US: fixture yields exactly 2 opinions');
F(clRecs[0].type === 'court-opinion', 'US: type === court-opinion');
F(clRecs[0].source_url.startsWith('https://www.courtlistener.com/opinion/'), 'US: relative absolute_url resolved to full URL');

console.log('=== OFFLINE: cross-feed invariants ===');
const allFp = [...ukRecs, ...euRecs, ...clRecs].map((r) => r.fingerprint);
F(new Set(allFp).size === allFp.length, 'no fingerprint collisions across feeds');
F(ukFeed.JURISDICTION === 'UK' && euFeed.JURISDICTION === 'EU' && clFeed.JURISDICTION === 'US', 'module JURISDICTION constants correct');

// ── OPTIONAL live reachability probe. NEVER fails the suite. Skips if offline / no token. ──
(async () => {
  console.log('=== OPTIONAL: live reachability (skips gracefully) ===');
  async function probe(label, mod, opts) {
    const notes = [];
    let recs = [];
    try { recs = await mod.fetchRecords({ timeout: 8000, notes, ...(opts || {}) }); }
    catch (e) { SKIP(`${label}: live probe threw but adapter fail-open — ${e.message}`); return; }
    if (recs.length >= 1) {
      const okShape = recs.every((r) => FIELDS.every((k) => k in r));
      F(okShape, `${label}: LIVE records well-shaped (${recs.length})`);
    } else {
      SKIP(`${label}: live unavailable/empty — ${notes.join('; ') || 'no records'} (not a failure)`);
    }
  }
  await probe('UK-live', ukFeed);
  await probe('EU-live', euFeed);
  await probe('US-live', clFeed); // token-optional: skips cleanly when COURTLISTENER_TOKEN unset

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped.`);
  if (fail) { console.log('OFFLINE assertions FAILED.'); process.exit(1); }
  console.log('All OFFLINE feed-adapter assertions pass.');
  process.exit(0);
})();
