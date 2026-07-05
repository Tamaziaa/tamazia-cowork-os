'use strict';
// Phase 3.2 — grounded LLM extraction. Unit-tests the JSON extraction + a LIVE dual-model smoke gated on GROQ_API_KEY.
const assert = require('assert');
const { extractObligation, _json } = require('../scripts/llm-extractor.js');
// JSON extraction from messy model output
assert.deepStrictEqual(_json('noise {"obligation":"x","penalty":null} tail'), { obligation: 'x', penalty: null }, 'extracts embedded JSON');
assert.strictEqual(_json('no json here'), null, 'null when no JSON');
// fail-open: no key -> null (never throws)
(async () => {
  const none = await extractObligation('some text', {});
  assert.strictEqual(none, null, 'no GROQ key => null (fail-open)');
  // live smoke (only when a real key is present)
  if (process.env.GROQ_API_KEY) {
    const r = await extractObligation('Under UK GDPR Article 13 a controller must provide privacy information at collection. Maximum fine: the higher of GBP 17.5 million or 4% of global turnover. In force since 25 May 2018.', process.env);
    assert(r && r.obligation, 'live extraction returns an obligation');
    assert(Array.isArray(r.models) && r.models.length >= 1, 'records which models ran');
    assert(typeof r.needs_review === 'boolean', 'needs_review present (penalties gated)');
    assert(r.confidence > 0, 'confidence present');
    console.log(`llm-extractor LIVE OK: models=${r.models.join('+')} needs_review=${r.needs_review} confidence=${r.confidence}`);
  } else {
    console.log('llm-extractor OK (unit): JSON parse + fail-open; live smoke skipped (no GROQ_API_KEY).');
  }
})();
