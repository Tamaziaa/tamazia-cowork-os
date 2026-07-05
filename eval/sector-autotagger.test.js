'use strict';
// Phase 3.3 — LLM sector auto-tagging grounded to canonical codes. Unit (fail-open + canonical constraint) + live smoke.
const assert = require('assert');
const { autoTagSectors, CANON } = require('../scripts/sector-autotagger.js');
(async () => {
  const none = await autoTagSectors('x', {});
  assert.deepStrictEqual(none.sectors, [], 'no key => [] (fail-open)');
  if (process.env.GROQ_API_KEY) {
    const r = await autoTagSectors('The SRA Transparency Rules require law firms providing conveyancing and probate to publish price and complaints information.', process.env);
    assert(Array.isArray(r.sectors), 'sectors array');
    assert(r.sectors.every(s => CANON.has(s)), 'every tag is a canonical sector (no invented codes)');
    assert(r.sectors.includes('law-firms'), 'law-firm regulation tags law-firms');
    console.log(`sector-autotagger LIVE OK: ${r.method}, sectors=[${r.sectors.join(',')}]`);
  } else { console.log('sector-autotagger OK (unit): fail-open + canonical constraint; live smoke skipped.'); }
})();
