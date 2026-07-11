'use strict';
// E-252 (v23.0) — THE SCAN CACHE IS GONE, AND THIS TEST EXISTS SO IT CANNOT COME BACK.
//
// scanner_cache stored the WHOLE scan keyed on ENGINE_VERSION with a 24h TTL. It failed SILENTLY WHILE REPORTING
// SUCCESS, three times over:
//   1. A logic fix merged without an ENGINE_VERSION bump => every re-mint REPLAYED THE OLD SCAN. E-234 (the
//      fabricated "site compromise" accusation), E-236, E-241, E-242 were all merged and green, and NONE of them
//      ever executed on a single audit. A law firm kept shipping a hacking accusation the code no longer produced.
//   2. The stale key made idem_key stale, so the write seam adopted the OLD audit_pages row while the queue
//      reported "done". 8 of 14 firms were never re-minted at all.
//   3. An audit is a live, evidenced, LEGAL claim about a website as it is RIGHT NOW. A day-old cached scan is not
//      evidence, and dating it today is wrong.
//
// FOUNDER RULE: "dont keep any cache for any audit no cache to be kept delete that rule."
const fs = require('fs');
const path = require('path');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const SCANNER = path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js');
const src = fs.readFileSync(SCANNER, 'utf8');
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');   // strip comments

t('E-252: the scanner NEVER reads a cache', () => {
  A.ok(!/getCached\s*\(/.test(code), 'getCached() is called again in compliance.js — the stale-replay bug is back');
});

t('E-252: the scanner NEVER writes a cache', () => {
  A.ok(!/writeCache\s*\(/.test(code), 'writeCache() is called again in compliance.js');
});

t('E-252: there is no cache key anywhere in the scanner', () => {
  A.ok(!/cacheKey/.test(code), 'cacheKey is back in compliance.js');
});

t('E-252: the scanner does not import the cache helpers at all', () => {
  A.ok(!/require\([^)]*http\.js[^)]*\)[^;]*getCached/.test(code) && !/getCached\s*,/.test(code),
    'compliance.js imports getCached/writeCache again');
});

t('E-252: no scanner_cache SQL survives in the scanner', () => {
  A.ok(!/scanner_cache/i.test(code), 'scanner_cache SQL is back in compliance.js');
});

t('E-252: every scan is a live read — scan() reaches gatherCorpus with no early cache return', () => {
  const i = code.indexOf('async function scan(');
  A.ok(i > 0, 'scan() must exist');
  const body = code.slice(i, i + 2600);
  A.ok(/gatherCorpus\(/.test(body), 'scan() must crawl');
  // there must be NO `return` carrying a cached:true shape before the crawl
  const beforeCrawl = body.slice(0, body.indexOf('gatherCorpus('));
  A.ok(!/cached:\s*true/.test(beforeCrawl), 'scan() still has an early cached-return path before crawling');
});

console.log(bad ? 'E252 NO-CACHE: FAIL' : 'E252 NO-CACHE: ALL GREEN (' + n + ' checks) — every scan is a live read');
process.exit(bad ? 1 : 0);
