'use strict';
// E-260 (v23.3) — COOKIE EVIDENCE. THE PECR BREACH WE WERE STRUCTURALLY BLIND TO.
//
// Every finding this engine has ever made was read out of CRAWLED HTML. The actual PECR breach is not in the HTML.
// It is in BEHAVIOUR: cookies WRITTEN TO THE BROWSER before consent, and network calls fired at tracker hosts on
// page load. We have been auditing law firms on cookie compliance while structurally unable to observe a cookie.
//
// THE LAW: PECR reg.6(1)-(2) — no storing of, or access to, information on a subscriber's terminal equipment
// without clear information AND CONSENT. reg.6(4) exempts only what is STRICTLY NECESSARY. Analytics is not
// strictly necessary (the ICO has said so repeatedly). Consent must be a positive act (UK GDPR Art.4(11)).
// THEREFORE a non-essential cookie present on FIRST LOAD with NOTHING clicked is a completed breach. Nothing to
// interpret: the cookie is either there before consent, or it is not.
const path = require('path');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
const M = require(path.join(ROOT, 'src/lib/evidence/cookie-evidence.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('E-260: the tracker oracle is loaded, and it is big enough to be an oracle', () => {
  const o = M.oracle();
  A.ok(o._domains.size > 20000, 'EasyPrivacy must give us tens of thousands of tracker hosts, got ' + o._domains.size);
  A.ok(Object.keys(o.cookie_purposes).length > 1000, 'the Open Cookie Database must give us the cookie purposes');
});

t('E-260: the LICENCE-SAFE sources are used, and the NonCommercial traps are not', () => {
  const raw = require('fs').readFileSync(path.join(ROOT, 'scripts/refresh-tracker-oracle.js'), 'utf8');
  // strip comments: the file NAMES the NonCommercial traps in a warning block precisely so nobody adds them later.
  // What matters is whether any of them is actually FETCHED.
  const src = raw.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  A.ok(/easyprivacy/i.test(src) && /Open-Cookie-Database/i.test(src), 'must use EasyPrivacy (CC BY-SA) + Open Cookie DB (Apache-2.0)');
  A.ok(/DELIBERATELY NOT USED/.test(raw), 'the NonCommercial traps must stay documented in the file so nobody re-adds them');
  // These are NonCommercial. Tamazia charges money. Using them in a paid COMPLIANCE product would itself be a
  // licence breach, which is not a mistake this company can afford.
  A.ok(!/tracker-radar|duckduckgo\/tracker/i.test(src), 'DuckDuckGo Tracker Radar data is CC BY-NC-SA — NonCommercial');
  A.ok(!/ghostery\/trackerdb/i.test(src), 'Ghostery TrackerDB is CC BY-NC-SA — NonCommercial');
  A.ok(!/cookiedatabase\.org/i.test(src), 'cookiedatabase.org is CC BY-NC-ND — NonCommercial AND NoDerivatives');
});

t('E-260: known analytics and advertising hosts are recognised as trackers', () => {
  A.ok(M._isTrackerHost('www.google-analytics.com'), 'GA must be a tracker');
  A.ok(M._isTrackerHost('connect.facebook.net'), 'the Meta Pixel host must be a tracker');
  A.ok(!M._isTrackerHost('www.russell-cooke.co.uk'), 'a law firm is not a tracker host');
});

t('E-260: cookie purposes are classified, and consent-required is decided by PURPOSE not by guesswork', () => {
  const ga = M._classifyCookie('_ga');
  A.strictEqual(ga.consent_required, true, 'Google Analytics requires consent — it is not strictly necessary');
  const fbp = M._classifyCookie('_fbp');
  A.strictEqual(fbp.consent_required, true, 'the Meta Pixel requires consent');
  const unknown = M._classifyCookie('some_random_first_party_session_thing');
  A.strictEqual(unknown.consent_required, false,
    'an UNKNOWN cookie must NEVER be assumed to require consent. Over-claiming here would put a false legal accusation in a report.');
});

t('E-260 FAIL-OPEN: no observation means NO CLAIM (a missing browser is not evidence of a breach)', () => {
  A.deepStrictEqual(M.cookieFindings(null, { country: 'UK' }), [], 'null observation must assert nothing');
  A.deepStrictEqual(M.cookieFindings({ ok: false }, { country: 'UK' }), [], 'a failed observation must assert nothing');
});

t('E-260: a CLEAN site (no non-essential cookies, no trackers, a CMP) produces NO findings', () => {
  const obs = { ok: true, ms: 1, pre_consent: { cookies: [], non_essential: [], tracker_requests: [] }, cmp: { onetrust: true } };
  A.strictEqual(M.cookieFindings(obs, { country: 'UK' }).length, 0, 'we never invent a cookie breach');
});

t('E-260 THE BREACH: a non-essential cookie before consent is a P0 under PECR reg.6', () => {
  const obs = { ok: true, ms: 1, cmp: { onetrust: true }, pre_consent: {
    cookies: [{ name: '_ga', consent_required: true, category: 'Analytics', platform: 'Google Analytics' }],
    non_essential: [{ name: '_ga', consent_required: true, category: 'Analytics', platform: 'Google Analytics' }],
    tracker_requests: [] } };
  const f = M.cookieFindings(obs, { country: 'UK', url: 'https://x.co.uk/' });
  A.strictEqual(f.length, 1);
  A.strictEqual(f[0].severity, 'P0');
  A.strictEqual(f[0].code, 'PECR_PRECONSENT_COOKIES');
  A.match(f[0].statutory_citation, /reg\.6/);
  A.strictEqual(f[0].evidence_quote, null, 'the evidence is the COOKIE, observed in a browser — not a page quote');
  A.strictEqual(f[0].absence_evidence.state, 'observed_in_browser');
});

t('E-260: trackers firing pre-consent are their own finding, independent of cookies', () => {
  const obs = { ok: true, ms: 1, cmp: { onetrust: true }, pre_consent: {
    cookies: [], non_essential: [], tracker_requests: [{ host: 'www.google-analytics.com' }] } };
  const f = M.cookieFindings(obs, { country: 'UK' });
  A.ok(f.some((x) => x.code === 'PECR_PRECONSENT_TRACKERS'), 'a tracker request before consent discloses the IP address to a third party');
});

t('E-260: NO consent mechanism at all, while tracking, is its own finding', () => {
  const obs = { ok: true, ms: 1, cmp: {}, pre_consent: {
    cookies: [], non_essential: [{ name: '_ga', consent_required: true }], tracker_requests: [] } };
  A.ok(M.cookieFindings(obs, { country: 'UK' }).some((x) => x.code === 'PECR_NO_CMP'));
});

t('E-260: PECR is UK/EU law — it is never asserted against a US firm', () => {
  const obs = { ok: true, ms: 1, cmp: {}, pre_consent: {
    cookies: [], non_essential: [{ name: '_ga', consent_required: true }], tracker_requests: [] } };
  A.strictEqual(M.cookieFindings(obs, { country: 'US' }).length, 0, 'PECR does not bind a US-only firm');
});

console.log(bad ? 'E260 COOKIE EVIDENCE: FAIL' : 'E260 COOKIE EVIDENCE: ALL GREEN (' + n + ' checks) — we can finally see the actual PECR breach');
process.exit(bad ? 1 : 0);
