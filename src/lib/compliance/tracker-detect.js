// Tracker detection backed by the Open Cookie Database (Apache-2.0, github.com/jkwakman/Open-Cookie-Database).
// Detects analytics/advertising trackers from a page's static HTML (script signatures, no headless browser),
// then names the specific cookies + data controller + category for each, so a cookie-consent breach can be
// stated concretely ("Google Analytics sets _ga, _gid (Analytics, controller Google) before any consent gate")
// rather than generically. Category Analytics/Marketing/Advertising = non-essential = consent required (PECR/ePrivacy).

let CLASS = {};
try { CLASS = require('./data/tracker-classification.json'); } catch (_e) { CLASS = {}; }

const SIG = [
  { re: /google-analytics\.com|gtag\(|\/gtag\/js|googleanalyticsobject|\bga\(['"]|\bG-[A-Z0-9]{6,12}\b/i, platform: 'Google Analytics', key: 'Google Analytics', category: 'Analytics', controller: 'Google' },
  { re: /googletagmanager\.com|\bGTM-[A-Z0-9]{5,9}\b/i, platform: 'Google Tag Manager', key: 'Google Tag Manager', category: 'Marketing', controller: 'Google' },
  { re: /googleadservices|googlesyndication|\bAW-\d{6,12}\b|doubleclick\.net/i, platform: 'Google Ads / DoubleClick', key: 'Google Ads', category: 'Advertising', controller: 'Google' },
  { re: /connect\.facebook\.net|\bfbq\(|facebook\.com\/tr/i, platform: 'Meta Pixel', key: 'Facebook', category: 'Advertising', controller: 'Meta' },
  { re: /static\.hotjar\.com|\bhotjar\b|hjid/i, platform: 'Hotjar', key: 'Hotjar', category: 'Analytics', controller: 'Hotjar' },
  { re: /clarity\.ms|\bclarity\(/i, platform: 'Microsoft Clarity', key: 'Microsoft', category: 'Analytics', controller: 'Microsoft' },
  { re: /snap\.licdn\.com|_linkedin_partner_id|linkedin\.com\/px/i, platform: 'LinkedIn Insight Tag', key: 'LinkedIn', category: 'Advertising', controller: 'LinkedIn' },
  { re: /analytics\.tiktok\.com|\bttq\.(load|track|page)\b/i, platform: 'TikTok Pixel', key: 'TikTok', category: 'Advertising', controller: 'TikTok' },
  { re: /s\.pinimg\.com\/ct|\bpintrk\(/i, platform: 'Pinterest Tag', key: 'Pinterest', category: 'Advertising', controller: 'Pinterest' },
  { re: /sc-static\.net\/scevent|\bsnaptr\(/i, platform: 'Snap Pixel', key: 'Snapchat', category: 'Advertising', controller: 'Snap' },
  { re: /static\.ads-twitter\.com|\btwq\(/i, platform: 'X (Twitter) Pixel', key: 'Twitter', category: 'Advertising', controller: 'X' },
  { re: /redditstatic\.com\/ads|\brdt\(/i, platform: 'Reddit Pixel', key: 'Reddit', category: 'Advertising', controller: 'Reddit' },
  { re: /js\.hs-(analytics|scripts|banner)|hs-scripts\.com|hubspot/i, platform: 'HubSpot', key: 'Hubspot', category: 'Analytics', controller: 'HubSpot' },
  { re: /bat\.bing\.com|\buetq\b/i, platform: 'Microsoft Advertising (UET)', key: 'Bing / Microsoft', category: 'Advertising', controller: 'Microsoft' },
  { re: /cdn\.mxpnl\.com|\bmixpanel\b/i, platform: 'Mixpanel', key: 'Mixpanel', category: 'Analytics', controller: 'Mixpanel' },
  { re: /cdn\.amplitude\.com|amplitude\.getInstance|\bamplitude\b/i, platform: 'Amplitude', key: 'Amplitude', category: 'Analytics', controller: 'Amplitude' },
  { re: /cdn\.segment\.com|window\.analytics/i, platform: 'Segment', key: 'Segment', category: 'Analytics', controller: 'Twilio Segment' },
  { re: /fullstory\.com|\bFS\.identify/i, platform: 'FullStory', key: 'FullStory', category: 'Analytics', controller: 'FullStory' },
];

const CONSENT = [
  { re: /cookiebot/i, name: 'Cookiebot' },
  { re: /onetrust|otsdkstub|cookielaw\.org/i, name: 'OneTrust' },
  { re: /usercentrics/i, name: 'Usercentrics' },
  { re: /cookieyes/i, name: 'CookieYes' },
  { re: /termly/i, name: 'Termly' },
  { re: /iubenda/i, name: 'iubenda' },
  { re: /complianz/i, name: 'Complianz' },
  { re: /quantcast|choice\.consent|__cmp/i, name: 'Quantcast / IAB TCF' },
  { re: /civiccomputing|cookie-?control/i, name: 'CIVIC CookieControl' },
  { re: /osano/i, name: 'Osano' },
  { re: /klaro/i, name: 'Klaro' },
  { re: /cookieconsent|cookie-consent/i, name: 'CookieConsent' },
];

function detectTrackers(html) {
  const b = String(html || '');
  const seen = new Set();
  const trackers = [];
  for (const s of SIG) {
    if (s.re.test(b) && !seen.has(s.platform)) {
      seen.add(s.platform);
      const cls = CLASS[s.key] || {};
      trackers.push({
        platform: s.platform,
        category: s.category,
        controller: cls.controller || s.controller,
        cookies: Array.isArray(cls.cookies) ? cls.cookies.slice(0, 5) : [],
      });
    }
  }
  let consentPlatform = null;
  for (const c of CONSENT) { if (c.re.test(b)) { consentPlatform = c.name; break; } }
  const hasConsentText = /we use cookies|cookie policy|cookie settings|manage cookies|accept (all )?cookies|cookie preferences/i.test(b);
  return { trackers, consentPlatform, hasConsentPlatform: !!consentPlatform, hasConsentText };
}

function nonEssential(trackers) {
  return (trackers || []).filter(t => /Analytics|Marketing|Advertising/i.test(t.category || ''));
}

module.exports = { detectTrackers, nonEssential, SIG, CONSENT };
