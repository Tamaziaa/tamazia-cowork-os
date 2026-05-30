// Minimal regression test for the audit site-scanner. Run: node src/lib/audit/tests/site-scan.test.js
const assert = require('assert');
const { extractSignals, pointersFromSignals } = require('../site-scan.js');

// 1) A bare page with no SEO/AI signals must yield findings (incl. the AI-visibility P1)
const bare = extractSignals({ body: '<html><body><p>hi</p></body></html>', headers: {} });
const pts = pointersFromSignals(bare, null, 'law-firms');
assert(pts.length >= 4, 'bare page should surface multiple findings');
assert(pts.some(p => p.bucket === 'ai_visibility' && p.severity === 'P1'), 'missing schema must be a P1 AI-visibility finding');
assert(pts.every(p => p.evidence && p.layman_explanation && p.tamazia_fix_short), 'every finding must carry evidence + explanation + fix');

// 2) A fully-equipped page + good headers must yield zero findings (no fabrication)
const good = extractSignals({
  body: '<html lang="en"><head><title>X Solicitors</title><meta name="description" content="' + 'd'.repeat(150) + '"><meta name="viewport" content="w"><meta property="og:title" content="x"><meta name="twitter:card" content="summary"><link rel="canonical" href="x"><script type="application/ld+json">{}</script></head><body><h1>X</h1></body></html>',
  headers: { 'strict-transport-security': 'max-age=1', 'content-security-policy': "default-src 'self'" },
});
const goodPts = pointersFromSignals(good, null, 'law-firms');
assert.strictEqual(goodPts.length, 0, 'a well-built page must produce zero fabricated findings, got ' + goodPts.length);

console.log('site-scan.test.js · ALL PASS');
