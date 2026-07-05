'use strict';
// Phase 2.4 — conformal review band (additive). Confidence per attachment from the cohort-frequency calibration;
// review_candidates = attached frameworks with confidence < tau (~10% golden review rate). ADDITIVE: the attach set
// (frameworks) is unchanged (locked separately by connect-shadow-identity). DB-backed; skips without NEON_URL.
const assert = require('assert');
if (!process.env.NEON_URL) { console.log('NEON unavailable — review-band test skipped.'); process.exit(0); }
const { connect, loadCatalogue } = require('../src/lib/compliance/connect.js');
const { buildSignals } = require('../src/lib/compliance/signals.js');
const cat = loadCatalogue();
const corpus = 'A limited company registered in England. Conveyancing and legal advice. We process personal data; privacy policy and cookies.';
const sg = buildSignals({ jurisdictions: ['GB'], sector: 'legal', corpusText: corpus });
const r = connect({ catalogue: cat, jurisdictions: ['GB'], sector: 'legal', signals: sg, text: corpus });
assert(r.confidence && typeof r.confidence === 'object', 'confidence map present');
assert(Array.isArray(r.review_candidates), 'review_candidates present');
assert.strictEqual(r.confidence['UK_GDPR_A13'], 1.0, 'universal framework must be full confidence');
assert(r.review_tau > 0 && r.review_tau < 0.3, 'tau in a sane calibrated range');
// every review candidate is an attached framework with confidence below tau
for (const f of r.review_candidates) { assert(r.frameworks.includes(f), 'review candidate must be attached'); assert(r.confidence[f] < r.review_tau, 'review candidate below tau'); }
// no universal framework is ever a review candidate
for (const f of r.review_candidates) assert(r.confidence[f] !== 1.0, 'universal never in review band');
// Phase 2.4 conformal upgrade: the calibration carries an explicit finite-sample coverage guarantee.
const cal = require('../db/seeds/cohort-frequencies.json');
assert(cal.method && /conformal/i.test(cal.method), 'calibration must document the split-conformal method');
assert(typeof cal.k_index === 'number' && cal.n > 0, 'finite-sample index k and n recorded');
assert(cal.coverage_guarantee && /P\(/.test(cal.coverage_guarantee), 'explicit coverage guarantee recorded');
assert(Math.abs(cal.empirical_review_rate - cal.alpha) < 0.02, 'empirical review rate matches target alpha within finite-sample slack');

console.log(`review-band OK: tau=${r.review_tau}, ${r.frameworks.length} attached, ${r.review_candidates.length} review candidate(s); universals full-confidence.`);
