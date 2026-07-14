'use strict';
// RC-1 (E01, E20) — THE FIRM HAS A NAME.
// Before this module the client's name was the DOMAIN STEM in ~7 places in build.js, so a shipped report said
// "Kingsleynapley" and another was addressed to "Bristol Office" (a page heading). These tests pin the ladder,
// the rejection rules, and the fail-open/NULL behaviour of the Companies House rung. No network: the CH client
// is injected.
const assert = require('assert');
const fi = require('../src/lib/audit/firm-identity.js');

(async () => {
  // ── 1. schema.org JSON-LD Organization WINS over og:site_name and <title> ───────────────────────
  const kn = `<html><head>
    <title>Kingsley Napley | Top London Law Firm | Solicitors</title>
    <meta property="og:site_name" content="KN London">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"LegalService","name":"Kingsley Napley LLP","legalName":"KINGSLEY NAPLEY LLP"}</script>
  </head><body><h1>Bristol Office</h1></body></html>`;
  let r = await fi.resolveFirmIdentity({ domain: 'kingsleynapley.co.uk', html: kn, env: {} });
  assert.strictEqual(r.source, 'schema_org', 'schema.org rung must win');
  assert.strictEqual(r.display_name, 'Kingsley Napley LLP', 'schema.org name is the display name');
  assert(r.confidence >= 0.9, 'schema.org is the highest-confidence rung');
  // and the domain stem NEVER survives when a real name exists (the shipped "Kingsleynapley" defect)
  assert.notStrictEqual(r.display_name.toLowerCase(), 'kingsleynapley', 'domain stem must be superseded by the real name');

  // ── 2. @graph arrays are parsed (the shape most CMS plugins actually emit) ──────────────────────
  const graph = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"birketts.co.uk"},{"@type":"Organization","name":"Birketts LLP"}]}</script>`;
  r = await fi.resolveFirmIdentity({ domain: 'birketts.co.uk', html: graph, env: {} });
  assert.strictEqual(r.display_name, 'Birketts LLP', '@graph Organization resolved');

  // ── 3. "Bristol Office" is REJECTED for birketts.co.uk ──────────────────────────────────────────
  // Two independent guards must both catch it: generic page furniture, and no token shared with the stem.
  assert.strictEqual(fi.rejectReason('Bristol Office', 'birketts.co.uk'), 'generic_page_furniture', 'page furniture rejected');
  assert.strictEqual(fi.rejectReason('Ipswich Branch', 'birketts.co.uk'), 'generic_page_furniture', 'branch headings rejected');
  assert.strictEqual(fi.sharesTokenWithDomain('Bristol Office', 'birketts.co.uk'), false, 'no >=4-char token shared with the stem');
  const bristol = `<html><head><meta property="og:site_name" content="Bristol Office">
    <title>Bristol Office</title></head><body></body></html>`;
  r = await fi.resolveFirmIdentity({ domain: 'birketts.co.uk', html: bristol, env: {} });
  assert.notStrictEqual(r.display_name, 'Bristol Office', 'a page heading can never become the client name');
  assert.strictEqual(r.source, 'domain_stem', 'every real rung rejected -> honest domain-stem fallback');
  assert.strictEqual(r.display_name, 'Birketts', 'the stem is cleaned + title-cased, never invented');
  assert(r.rejected.some((x) => x.value === 'Bristol Office' && x.reason === 'generic_page_furniture'), 'the rejection is recorded, not silent');

  // ── 4. A REAL name that merely looks generic SURVIVES because it shares a token with the domain ─
  assert.strictEqual(fi.rejectReason('The Office Group', 'theofficegroup.com'), null, '"The Office Group" survives for theofficegroup.com');
  const tog = `<html><head><meta property="og:site_name" content="The Office Group"><title>The Office Group</title></head></html>`;
  r = await fi.resolveFirmIdentity({ domain: 'theofficegroup.com', html: tog, env: {} });
  assert.strictEqual(r.display_name, 'The Office Group', 'a real firm called "The Office Group" keeps its name');
  assert.strictEqual(r.source, 'og_site_name', 'og:site_name is rung 2');
  // the same string on an UNRELATED domain is still rejected — the guard is the domain tie, not a blocklist
  assert.strictEqual(fi.rejectReason('The Office Group', 'birketts.co.uk'), 'no_token_shared_with_domain', 'and it is rejected where it is NOT the firm — the guard is the domain tie, not a blocklist');

  // ── 5. <title>: the site's own separator is stripped and marketing tails removed ────────────────
  const titleOnly = `<html><head><title>Kingsley Napley | Top London Law Firm</title></head></html>`;
  r = await fi.resolveFirmIdentity({ domain: 'kingsleynapley.co.uk', html: titleOnly, env: {} });
  assert.strictEqual(r.source, 'title', 'falls to the <title> rung when there is no schema.org / og:site_name');
  assert.strictEqual(r.display_name, 'Kingsley Napley', 'separator + marketing tail stripped');
  const homeFirst = `<html><head><title>Home - Streathers Solicitors</title></head></html>`;
  r = await fi.resolveFirmIdentity({ domain: 'streathers.co.uk', html: homeFirst, env: {} });
  assert.strictEqual(r.display_name, 'Streathers Solicitors', '"Home" segment discarded, the tied segment wins');

  // ── 6. Short/acronym names survive the token rule (no false rejection of real firms) ────────────
  assert.strictEqual(fi.rejectReason('BDO', 'bdo.co.uk'), null, 'a 3-letter real name is not rejected');
  assert.strictEqual(fi.rejectReason('Bates Wells Braithwaite', 'bwbllp.com'), 'no_token_shared_with_domain', 'unverifiable tie -> reject and fall through, never guess');

  // ── 7. COMPANIES HOUSE — gated, and NULL without a key. A missing field is fine; a wrong one is not. ──
  r = await fi.resolveFirmIdentity({ domain: 'kingsleynapley.co.uk', html: kn, env: {} /* no key */ });
  assert.strictEqual(r.company_number, null, 'no key -> company_number NULL (never invented)');
  assert.strictEqual(r.registered_office, null, 'no key -> registered_office NULL');
  assert.strictEqual(r.companies_house_status, 'no_key', 'the reason is reported, not hidden');
  assert(r.notes.some((n) => /COMPANIES_HOUSE_KEY/.test(n)), 'the missing key is stated plainly in notes');

  // with a key: a confirmed register match fills legal_name + number + registered office (injected http)
  const chFetch = async (url) => {
    if (url.includes('/search/companies')) {
      return { status: 200, json: async () => ({ items: [
        { title: 'KINGSLEY NAPLEY LLP', company_number: 'OC312043', company_status: 'active', address_snippet: 'Knights Quarter, London' },
        { title: 'KINGSLEY NAPLEY TRUSTEES LIMITED', company_number: '01234567' },
      ] }) };
    }
    if (url.includes('/company/OC312043')) {
      return { status: 200, json: async () => ({ registered_office_address: { address_line_1: 'Knights Quarter', address_line_2: '14 St Johns Lane', locality: 'London', postal_code: 'EC1M 4AJ', country: 'England' } }) };
    }
    return { status: 404, json: async () => ({}) };
  };
  r = await fi.resolveFirmIdentity({ domain: 'kingsleynapley.co.uk', html: kn, env: { COMPANIES_HOUSE_KEY: 'k' }, fetchImpl: chFetch });
  assert.strictEqual(r.display_name, 'Kingsley Napley LLP', 'schema.org still wins the DISPLAY name');
  assert.strictEqual(r.legal_name, 'KINGSLEY NAPLEY LLP', 'the register supplies the LEGAL name');
  assert.strictEqual(r.company_number, 'OC312043', 'company number comes from the register, keyed to the matched title');
  assert(/EC1M 4AJ/.test(r.registered_office), 'registered office comes from the company profile endpoint');
  assert.strictEqual(r.companies_house_status, 'confirmed');

  // a register result that is NOT the firm is refused — no "nearest match" is ever attached
  const wrongFetch = async (url) => (url.includes('/search/companies')
    ? { status: 200, json: async () => ({ items: [{ title: 'ACME WIDGETS LIMITED', company_number: '99999999' }] }) }
    : { status: 404, json: async () => ({}) });
  r = await fi.resolveFirmIdentity({ domain: 'kingsleynapley.co.uk', html: kn, env: { CH_API_KEY: 'k' }, fetchImpl: wrongFetch });
  assert.strictEqual(r.company_number, null, 'an unrelated register row is NOT attached (no nearest-match fabrication)');
  assert.strictEqual(r.companies_house_status, 'not_found');

  // API down -> fail open, fields NULL, mint continues
  const downFetch = async () => { throw new Error('ECONNRESET'); };
  r = await fi.resolveFirmIdentity({ domain: 'kingsleynapley.co.uk', html: kn, env: { CH_API_KEY: 'k' }, fetchImpl: downFetch });
  assert.strictEqual(r.companies_house_status, 'unavailable', 'network failure -> unavailable, not a guess');
  assert.strictEqual(r.company_number, null);
  assert.strictEqual(r.display_name, 'Kingsley Napley LLP', 'and the display name still resolves (fail-open)');

  // ── 8. Zero-signal site: honest stem, and it says so ────────────────────────────────────────────
  r = await fi.resolveFirmIdentity({ domain: 'www.smith-jones.co.uk', html: '<html><body>hi</body></html>', env: {} });
  assert.strictEqual(r.display_name, 'Smith Jones', 'hyphenated stem cleaned to words');
  assert.strictEqual(r.source, 'domain_stem');
  assert(r.notes.some((n) => /domain stem/.test(n)), 'the fallback is disclosed');

  // ── 9. Nothing is fabricated when there is nothing: malformed JSON-LD is skipped, not repaired ──
  const bad = `<script type="application/ld+json">{"@type":"Organization","name":</script><title>Acme Legal</title>`;
  r = await fi.resolveFirmIdentity({ domain: 'acmelegal.co.uk', html: bad, env: {} });
  assert.strictEqual(r.display_name, 'Acme Legal', 'malformed JSON-LD ignored; the <title> rung answers');

  console.log('RC-1 firm-identity: OK');
})().catch((e) => { console.error(e); process.exit(1); });
