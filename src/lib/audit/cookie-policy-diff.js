'use strict';
// P2.2 Cookie-policy vs actual-tracker diff. Pure + testable. The self-incriminating finding:
// the site declares N trackers/cookies in its cookie policy but actually runs M, including undeclared ones.
// Builds on tracker-detect.js (what actually loads) vs what the policy page text declares.
function _text(html) { return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase(); }
function _isPolicyUrl(u) { return /(cookie|privacy|data-protection)/i.test(String(u || '').replace(/^https?:\/\/[^/]+/, '')); }

// Given the multi-page corpus + the trackers tracker-detect found running, return undeclared trackers.
function cookiePolicyDiff({ corpus = [], trackers = [] }) {
  if (!trackers.length) return { ok: true, declared_pages: 0, running: 0, undeclared: [], finding: null };
  const policyPages = corpus.filter(c => _isPolicyUrl(c.url));
  const policyText = policyPages.map(c => _text(c.body)).join(' ');
  const running = trackers.map(t => t.platform);
  // A tracker is "declared" if the policy text names the platform, its controller, or any of its cookie names.
  const undeclared = trackers.filter(t => {
    const names = [t.platform, t.controller].concat(t.cookies || []).filter(Boolean).map(x => String(x).toLowerCase());
    return !names.some(n => n.length > 2 && policyText.includes(n));
  });
  if (!policyPages.length || !undeclared.length) return { ok: true, declared_pages: policyPages.length, running: running.length, undeclared: [], finding: null };
  const names = undeclared.map(t => t.platform);
  const controllers = [...new Set(undeclared.map(t => t.controller).filter(Boolean))];
  return {
    ok: true, declared_pages: policyPages.length, running: running.length, undeclared: names,
    finding: {
      bucket: 'compliance', severity: 'P1', rule_type: 'must_not_appear',
      framework_short: 'UK_PECR', citation: 'UK_PECR',
      citation_url: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/',
      fact: 'Your cookie policy does not declare ' + names.length + ' tracker(s) your site actually runs: ' + names.join(', ') + '.',
      layman_explanation: 'Your site loads ' + running.length + ' tracker(s) but the cookie policy only accounts for some of them. ' + names.join(', ') + ' (data shared with ' + (controllers.join(', ') || 'third parties') + ') run without being disclosed. Under PECR and UK GDPR transparency duties, every non-essential cookie and tracker must be named and explained. An undeclared tracker is self-evidently a transparency breach because your own site sets it.',
      tamazia_fix_short: 'Tamazia produces an accurate, auto-maintained cookie register that declares every tracker the site actually loads, and gates each behind consent.',
      evidence_quote: names.join(', ') + ' detected loading; absent from the cookie/privacy policy text',
      evidence: 'tracker-detect vs policy-page text diff · ' + policyPages.length + ' policy page(s) scanned',
      enforcement_example: 'ICO under PECR: enforcement notices and fines up to GBP 500,000, plus GDPR-level fines (up to GBP 17.5M or 4% of turnover) where consent is the lawful basis; the ICO has run cookie-consent sweeps against major UK sites.',
      fine_low_gbp: null, fine_high_gbp: 17500000,
    },
  };
}
module.exports = { cookiePolicyDiff };
