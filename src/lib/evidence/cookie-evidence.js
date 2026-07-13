'use strict';
// E-260 (v23.3) — COOKIE EVIDENCE. THE PECR BREACH WE HAVE BEEN BLIND TO SINCE DAY ONE.
//
// WHAT WE COULD NEVER SEE:
//   Every finding this engine has ever made was read out of CRAWLED HTML. But the actual PECR breach is not in the
//   HTML. It is in BEHAVIOUR:
//       * cookies WRITTEN TO THE BROWSER before the user has consented to anything;
//       * network requests fired at Google Analytics, Meta, Hotjar and 50,000 other tracker hosts, on page load,
//         before any banner is touched.
//   You cannot see any of that by fetching a page and running a regex over it. We have been auditing law firms on
//   cookie compliance while structurally unable to observe a single cookie.
//
// THE LAW, precisely:
//   PECR reg.6(1)-(2): a person may not store information, or gain access to information stored, in the terminal
//   equipment of a subscriber UNLESS the subscriber is provided with clear information AND HAS GIVEN CONSENT.
//   reg.6(4) exempts only what is STRICTLY NECESSARY for a service the subscriber has explicitly requested.
//   Analytics is not strictly necessary. The ICO has said so repeatedly. Advertising plainly is not.
//   Consent must be a positive act (UK GDPR Art.4(11)); it cannot be assumed from mere continued browsing.
//
//   THEREFORE: a non-essential cookie present on FIRST LOAD, with NO interaction of any kind, is a completed breach
//   of PECR reg.6. There is nothing to interpret. The cookie is either there before consent, or it is not.
//   Maximum penalty under PECR (as amended, and see the Data (Use and Access) Act 2025 which raises PECR caps
//   towards UK GDPR levels): the ICO's own enforcement band.
//
// HOW WE OBSERVE IT (and why this needs no SSH):
//   A real Chromium, via Playwright, inside the mint runner. Fresh, isolated browser context (no profile, no prior
//   state). Navigate. Touch NOTHING. Then read document.cookie + the CDP cookie jar + every network request the
//   page fired. Classify each against the tracker oracle (EasyPrivacy: 50,079 tracker hosts; Open Cookie Database:
//   2,239 purpose-labelled cookies, 1,234 of which require consent).
//   The Hetzner box's renderer returns only HTML and would need a code change to return cookies, which needs SSH we
//   do not have. This runs on the GitHub Actions runner instead: versioned in git, free, nothing to babysit.
//
// FAIL-OPEN, ALWAYS: if Playwright is unavailable, if the browser cannot launch, if the site times out — we return
// null and assert NOTHING. A missing observation is not evidence of compliance, and it is certainly not evidence of
// a breach. We never guess at behaviour we did not see.

const fs = require('fs');
const path = require('path');

let _oracle = null;
function oracle() {
  if (_oracle) return _oracle;
  try {
    _oracle = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'tracker-oracle.json'), 'utf8'));
    _oracle._domains = new Set(_oracle.tracker_domains || []);
  } catch (_e) { _oracle = { _domains: new Set(), cookie_purposes: {}, sources: {} }; }
  return _oracle;
}

function _isTrackerHost(host) {
  const o = oracle();
  host = String(host || '').toLowerCase();
  if (o._domains.has(host)) return true;
  // a subdomain of a known tracker host is a tracker host
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (o._domains.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

// Classify a cookie by NAME against the Open Cookie Database. Unknown => we do NOT assume it needs consent.
// Over-claiming here would be a false positive on a legal claim, which is the one thing we cannot afford.
function _classifyCookie(name) {
  const o = oracle();
  const n = String(name || '').toLowerCase();
  const hit = o.cookie_purposes[n];
  if (hit) return { known: true, category: hit.category, consent_required: !!hit.consent_required, platform: hit.platform, description: hit.description };
  // Prefix families the Open Cookie DB records generically (_ga_XXXX, _gid, _fbp...). Only the unambiguous ones.
  const FAM = [
    [/^_ga($|_)/, 'Analytics', 'Google Analytics'],
    [/^_gid$/, 'Analytics', 'Google Analytics'],
    [/^_gcl_/, 'Marketing', 'Google Ads'],
    [/^_fbp$|^_fbc$/, 'Marketing', 'Meta Pixel'],
    [/^_hj/, 'Analytics', 'Hotjar'],
    [/^__utm/, 'Analytics', 'Google Analytics (legacy)'],
    [/^_clck$|^_clsk$/, 'Analytics', 'Microsoft Clarity'],
    [/^_uetsid|^_uetvid/, 'Marketing', 'Microsoft Advertising'],
    [/^li_sugr$|^bcookie$|^lidc$/, 'Marketing', 'LinkedIn'],
  ];
  for (const [rx, cat, plat] of FAM) {
    if (rx.test(n)) return { known: true, category: cat, consent_required: true, platform: plat, description: '' };
  }
  return { known: false, category: null, consent_required: false };
}

/**
 * observe(url) -> { ok, pre_consent: { cookies:[], tracker_requests:[] }, cmp, ms } | null
 * Loads the page in a FRESH context and touches nothing. Everything observed is, by construction, PRE-CONSENT.
 */
async function observe(url, opts) {
  // E-267: resolve the browser driver robustly, and SAY why if we cannot. `require('playwright')` was failing in
  // the mint (the driver installs into a node_modules the build could not resolve), observe() returned null, and
  // the fail-open path was SILENT — so the cookie collector produced nothing and no log said why. A missing
  // browser is a legitimate fail-open, but it must be OBSERVABLE, not invisible.
  let chromium = null, _drv = '';
  for (const mod of ['playwright', 'playwright-core', '@playwright/test']) {
    try { const m = require(mod); chromium = m.chromium || (m.default && m.default.chromium); if (chromium) { _drv = mod; break; } } catch (_e) { /* try next */ }
  }
  if (!chromium) { console.error('[cookie-evidence] no playwright driver resolvable (tried playwright, playwright-core, @playwright/test) — install it in the mint or set COOKIE_EVIDENCE=0'); return null; }

  const t0 = Date.now();
  let browser = null;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
    });
    const page = await ctx.newPage();

    const trackerReqs = [];
    page.on('request', (r) => {
      try {
        const h = new URL(r.url()).hostname;
        if (_isTrackerHost(h)) trackerReqs.push({ host: h, url: r.url().slice(0, 180), type: r.resourceType() });
      } catch (_e) { /* ignore */ }
    });

    // E-270: waitUntil MUST NOT be 'networkidle'. The very sites we are hunting for PECR breaches — analytics- and
    // ad-tag-heavy law-firm sites — keep the network busy indefinitely, so 'networkidle' NEVER fires and goto burns
    // its entire timeout on exactly our targets, which (with a cold Chromium launch on the CI runner) blew past the
    // 35s outer race every single time and returned null. Cookies and trackers set ON LOAD are already captured: the
    // request listener is attached BEFORE goto, and the cookie jar is read AFTER a settle. 'domcontentloaded' + a
    // short settle is exactly how Blacklight and Cookiepedia observe pre-consent state. Correct on the merits AND
    // inside budget. Internal goto timeout is deliberately tight so a genuinely hung page can never eat the budget.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Number((opts && opts.timeoutMs) || 15000) }).catch(() => {});
    // We deliberately do NOT click, scroll, or dismiss anything. Whatever exists now existed BEFORE consent.
    // Settle long enough for on-load analytics/ad tags to fire and drop their cookies, but no interaction of any kind.
    await page.waitForTimeout(3500);

    const raw = await ctx.cookies();
    const cookies = raw.map((c) => {
      const cls = _classifyCookie(c.name);
      return {
        name: c.name, domain: c.domain, third_party: !String(c.domain || '').replace(/^\./, '').endsWith(new URL(url).hostname.replace(/^www\./, '')),
        category: cls.category, consent_required: cls.consent_required, platform: cls.platform || null, known: cls.known,
        expires_days: c.expires && c.expires > 0 ? Math.round((c.expires * 1000 - Date.now()) / 86400000) : null,
      };
    });

    // Is there even a consent mechanism? A site that sets trackers AND has no CMP at all is the worst case.
    const cmp = await page.evaluate(() => {
      const has = (s) => !!document.querySelector(s);
      const txt = (document.body && document.body.innerText || '').slice(0, 4000);
      return {
        tcf: typeof window.__tcfapi === 'function',
        onetrust: has('#onetrust-banner-sdk') || typeof window.OneTrust !== 'undefined',
        cookiebot: has('#CybotCookiebotDialog') || typeof window.Cookiebot !== 'undefined',
        civic: has('#ccc') || has('.ccc-widget'),
        cookieyes: has('.cky-consent-container'),
        banner_text: /cookie|consent|privacy/i.test(txt),
      };
    }).catch(() => ({}));

    const seen = new Set();
    const uniqTrackers = trackerReqs.filter((r) => (seen.has(r.host) ? false : (seen.add(r.host), true)));
    await browser.close(); browser = null;

    return {
      ok: true,
      ms: Date.now() - t0,
      pre_consent: {
        cookies,
        non_essential: cookies.filter((c) => c.consent_required),
        tracker_requests: uniqTrackers,
      },
      cmp,
      oracle: (oracle().sources || {}),
    };
  } catch (_e) {
    try { if (browser) await browser.close(); } catch (_e2) {}
    console.error('[cookie-evidence] browser observation failed for ' + url + ': ' + String((_e && _e.message) || _e).slice(0, 120));
    return null;   // FAIL-OPEN, but never silent
  }
}

/**
 * Turn the observation into PECR findings. Only what we actually saw. Nothing inferred.
 */
function cookieFindings(obs, ctx) {
  if (!obs || !obs.ok) return [];   // saw nothing, claim nothing
  const out = [];
  const pre = obs.pre_consent || {};
  const nonEssential = pre.non_essential || [];
  const trackers = pre.tracker_requests || [];
  const country = String((ctx && ctx.country) || 'UK').toUpperCase();
  const isUKorEU = !country || country === 'UK' || country === 'GB' || country === 'GBR' || /^(EU|FR|DE|IE|NL|ES|IT|BE|PT|AT|SE|DK|FI|PL|LU)$/.test(country);
  if (!isUKorEU) return [];

  // ---- THE BREACH: a non-essential cookie present before ANY consent ----
  if (nonEssential.length) {
    const named = nonEssential.slice(0, 6).map((c) => c.name + (c.platform ? ' (' + c.platform + ', ' + c.category + ')' : '')).join('; ');
    out.push({
      status: 'miss', severity: 'P0',
      framework: 'UK_PECR', code: 'PECR_PRECONSENT_COOKIES', rule_type: 'prohibit',
      statutory_citation: 'Privacy and Electronic Communications (EC Directive) Regulations 2003 reg.6(1)-(2)',
      citation_url: 'https://www.legislation.gov.uk/uksi/2003/2426/regulation/6',
      description: 'Non-essential cookies are written to the visitor’s browser on page load, before any consent is given',
      layman_explanation: 'The law requires consent BEFORE a non-essential cookie is set. On a first visit, with nothing clicked, '
        + nonEssential.length + ' non-essential cookie' + (nonEssential.length === 1 ? ' was' : 's were') + ' already placed on the device: ' + named + '. '
        + 'Consent must be a positive act; it cannot be assumed from browsing.',
      tamazia_fix_short: 'Block all non-essential cookies and tags until consent is given, and wire the consent banner to actually gate them.',
      // THE EVIDENCE IS THE COOKIE ITSELF, OBSERVED IN A REAL BROWSER. Not a quote. Not an inference.
      evidence_quote: null,
      absence_evidence: {
        state: 'observed_in_browser',
        requirement: 'no non-essential cookie may be set before consent (PECR reg.6)',
        nearest_quote: 'Observed in a fresh Chromium session with no interaction: ' + named,
        pages_checked: 1,
      },
      evidence_url: (ctx && ctx.url) || null,
      cookie_evidence: nonEssential.slice(0, 20),
      fine_low_gbp: 0, fine_high_gbp: 500000,
      enforce_typical_low_gbp: 50000, enforce_typical_high_gbp: 350000,
      penalty_note: 'ICO monetary penalty (PECR); the Data (Use and Access) Act 2025 raises PECR caps towards UK GDPR levels',
    });
  }

  // ---- Trackers firing before consent (network evidence, independent of cookies) ----
  if (trackers.length) {
    const hosts = trackers.slice(0, 6).map((t) => t.host).join(', ');
    out.push({
      status: 'miss', severity: 'P1',
      framework: 'UK_PECR', code: 'PECR_PRECONSENT_TRACKERS', rule_type: 'prohibit',
      statutory_citation: 'PECR 2003 reg.6; UK GDPR Art.6 (lawful basis for the onward processing)',
      citation_url: 'https://www.legislation.gov.uk/uksi/2003/2426/regulation/6',
      description: 'Third-party tracking requests fire on page load, before any consent is given',
      layman_explanation: 'On a first visit with nothing clicked, the page contacted ' + trackers.length + ' known tracking host'
        + (trackers.length === 1 ? '' : 's') + ': ' + hosts + '. Personal data (at minimum the IP address and page URL) is disclosed '
        + 'to those third parties before the visitor has agreed to anything.',
      tamazia_fix_short: 'Load all tracking tags only after consent, through a consent-gated tag manager.',
      evidence_quote: null,
      absence_evidence: {
        state: 'observed_in_browser',
        requirement: 'no non-essential tracking before consent',
        nearest_quote: 'Network requests observed in a fresh Chromium session with no interaction: ' + hosts,
        pages_checked: 1,
      },
      evidence_url: (ctx && ctx.url) || null,
      tracker_evidence: trackers.slice(0, 20),
      fine_low_gbp: 0, fine_high_gbp: 500000,
      enforce_typical_low_gbp: 30000, enforce_typical_high_gbp: 250000,
      penalty_note: 'ICO monetary penalty (PECR)',
    });
  }

  // ---- No consent mechanism at all, while tracking ----
  const cmp = obs.cmp || {};
  const hasCmp = !!(cmp.tcf || cmp.onetrust || cmp.cookiebot || cmp.civic || cmp.cookieyes);
  if (!hasCmp && (nonEssential.length || trackers.length)) {
    out.push({
      status: 'miss', severity: 'P1',
      framework: 'UK_ICO_COOKIES', code: 'PECR_NO_CMP', rule_type: 'must_appear',
      statutory_citation: 'PECR 2003 reg.6(2); ICO guidance on the use of cookies and similar technologies',
      citation_url: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/',
      description: 'The site sets non-essential cookies or trackers but presents no recognised consent-management mechanism',
      layman_explanation: 'No consent-management platform was detected, yet non-essential cookies or third-party trackers are active. '
        + 'There is therefore no mechanism by which valid consent could have been obtained.',
      tamazia_fix_short: 'Deploy a consent-management platform that genuinely blocks non-essential tags until consent.',
      evidence_quote: null,
      absence_evidence: { state: 'observed_in_browser', requirement: 'a consent mechanism must exist before non-essential cookies are set', pages_checked: 1 },
      evidence_url: (ctx && ctx.url) || null,
      fine_low_gbp: 0, fine_high_gbp: 500000,
      enforce_typical_low_gbp: 20000, enforce_typical_high_gbp: 200000,
      penalty_note: 'ICO monetary penalty (PECR)',
    });
  }

  return out;
}

module.exports = { observe, cookieFindings, _isTrackerHost, _classifyCookie, oracle };
