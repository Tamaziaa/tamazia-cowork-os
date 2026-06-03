'use strict';
// P2.15 local-pack / GBP gap — best £0, no-card path. The literal Google 3-pack ranking needs a billed Maps key,
// so instead we measure the signals that DETERMINE local-pack eligibility (the real, diagnosable gap), using
// OpenStreetMap/Nominatim (free, no key) for live map-data presence + on-site NAP + LocalBusiness-geo schema +
// the local-intent SERP rank already computed. A key-gated Google/TomTom Places hook upgrades to the literal pack.
const https = require('https');
let _fetch, _detectSchema;
try { _fetch = require('../../skills/S008-personalisation-engine/lib/http.js').fetchWithRetry; } catch (_e) {}
try { _detectSchema = require('./site-scan.js').detectSchemaTypes; } catch (_e) {}

const SECTOR_NOUN = { legal: 'solicitors', law: 'solicitors', 'law-firms': 'solicitors', healthcare: 'clinic', medical: 'clinic', dental: 'dentist', real_estate: 'estate agents', 'real-estate': 'estate agents', hospitality: 'hotel', accountancy: 'accountants', finance: 'financial advisers' };
const LOCAL_SECTORS = new Set(Object.keys(SECTOR_NOUN));
function sectorNoun(s) { return SECTOR_NOUN[String(s || '').toLowerCase()] || String(s || 'business').replace(/_/g, ' '); }
function isLocalSector(s) { return LOCAL_SECTORS.has(String(s || '').toLowerCase()); }

function _getJson(url, headers, timeout = 9000) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers, timeout }, (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_e) { resolve(null); } }); });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Free, no key. Returns {found, type, lat} or null on failure (fail-open, never fabricates absence on a network error).
async function osmPresence(company, city) {
  const q = encodeURIComponent([company, city].filter(Boolean).join(' '));
  if (!q) return null;
  const j = await _getJson('https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=3&addressdetails=1',
    { 'User-Agent': 'TamaziaAuditBot/1.0 (audit@tamazia.co.uk)', 'Accept-Language': 'en' });
  if (!Array.isArray(j)) return null; // network/parse failure -> unknown, not "absent"
  const hit = j.find(x => x && (x.class === 'office' || x.class === 'amenity' || x.class === 'shop' || x.type === 'lawyer' || x.type === 'clinic')) || j[0];
  return hit ? { found: true, type: (hit.class + '/' + hit.type), lat: hit.lat } : { found: false };
}

function napFromText(text) {
  text = String(text || '');
  const hasPhone = /(tel:\+?\d|\+44\s?\d|\(0\d|\b0\d{3,4}[\s-]?\d{3}[\s-]?\d{3,4}\b|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4})/i.test(text);
  const hasAddr = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/.test(text) || /\b\d{5}(-\d{4})?\b/.test(text) || /\b(P\.?O\.?\s?Box|\d+\s+[A-Z][a-z]+\s+(Street|Road|Avenue|Lane|Drive|Suite|Floor|House|Chambers))\b/.test(text);
  return { hasPhone, hasAddr };
}

async function localPackReadiness({ domain, company, sector, city, homeText = null, env = {} } = {}) {
  if (!isLocalSector(sector) || !city) return { ok: true, applicable: false, finding: null };
  company = company || String(domain || '').replace(/^www\./, '').split('.')[0];
  // self-contained: fetch the homepage (engine http cache) for NAP + schema unless caller passed text
  let body = homeText;
  if (body == null && _fetch && domain) { try { const r = await _fetch('https://' + domain + '/', { timeout: 12000 }); body = (r && r.body) || ''; } catch (_e) { body = ''; } }
  body = String(body || '');
  const gaps = [];
  let osm = null; try { osm = await osmPresence(company, city); } catch (_e) {}
  if (osm && osm.found === false) gaps.push('not listed in OpenStreetMap, the open map data Apple Maps, Bing and AI assistants read');
  let types = []; try { types = (body && _detectSchema) ? Array.from(_detectSchema(body)) : []; } catch (_e) {}
  const hasLocalSchema = types.some(t => /LocalBusiness|LegalService|MedicalBusiness|Dentist|ProfessionalService|RealEstateAgent|Hotel|AccountingService/i.test(String(t)));
  if (!hasLocalSchema) gaps.push('no LocalBusiness schema with address and geo-coordinates');
  const { hasPhone, hasAddr } = napFromText(body);
  if (!hasAddr) gaps.push('no clearly published street address (NAP)');
  if (!hasPhone) gaps.push('no clearly published phone number (NAP)');
  if (!gaps.length) return { ok: true, applicable: true, ready: true, finding: null, osm };
  const where = '"' + sectorNoun(sector) + ' in ' + city + '"';
  const sev = (osm && osm.found === false) || !hasAddr ? 'P1' : 'P2';
  const finding = {
    bucket: 'seo', severity: sev, rule_type: 'observed', kind: 'observed',
    citation: 'Local search (map pack)', framework_short: 'SEO', citation_url: '',
    fact: 'You are missing ' + gaps.length + ' of the signals Google uses to rank the local map pack: ' + gaps.join('; ') + '.',
    layman_explanation: 'When a buyer searches ' + where + ', Google shows a three-result map pack above the normal results, and AI assistants read the same local sources. Those slots go to firms with a complete, consistent local presence. You are missing ' + gaps.length + ' of those signals, so you are structurally excluded from the results buyers tap first.',
    tamazia_fix_short: 'Tamazia builds the local-pack foundation: an optimised Google Business Profile, LocalBusiness schema with geo, consistent NAP and local citations.',
    evidence_quote: (osm && osm.found === false) ? 'not found in OpenStreetMap for ' + city : gaps[0],
    evidence: 'local-readiness check' + (osm ? ' · OpenStreetMap presence' + (osm.found ? ' (found: ' + osm.type + ')' : ' (absent)') : ''),
    fine_low_gbp: null, fine_high_gbp: null,
  };
  return { ok: true, applicable: true, ready: false, gaps, finding, osm };
}
module.exports = { localPackReadiness, osmPresence, sectorNoun, isLocalSector };
