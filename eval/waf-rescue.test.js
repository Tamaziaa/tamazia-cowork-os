'use strict';
/**
 * A WAF BLOCK IS EVIDENCE ABOUT OUR FETCHER, NOT ABOUT THE FIRM.
 *
 * gatherCorpus fetched a page, and if it came back 403 it was DROPPED ENTIRELY. The render-rescue loop only
 * considered pages with `status === 200` that looked like empty SPA shells. A 403 never reached the renderer.
 *
 * birketts.co.uk 403s every sub-page to a plain fetch. So we read exactly ONE page, never saw their /legal page,
 * and told a top-100 UK law firm it failed to state its SRA authorisation.
 *
 * VERIFIED against the live Playwright renderer:
 *     /legal-notices    direct 403  ->  renderer 200,   2,966 chars
 *     /privacy-policy   direct 403  ->  renderer 200,  28,564 chars
 *     /legal            direct 403  ->  renderer 200,   8,488 chars
 *
 * MEASURED END TO END: birketts went from 1 page / 7,968 chars to 5 pages / 55,366 chars.
 *
 * A JS shell and a WAF block are the same problem wearing different status codes: in both cases a plain fetch
 * cannot see a page that a browser can. They now take the same escape hatch.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const SRC = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');

t('A BLOCKED PAGE GOES TO THE RENDERER (it is not silently dropped)', () => {
  A.ok(/_BLOCKED\s*=\s*new Set\(\[/.test(SRC),
    'there must be an explicit set of bot-block status codes');
  for (const code of [401, 403, 429, 503]) {
    A.ok(new RegExp('_BLOCKED\\s*=\\s*new Set\\(\\[[^\\]]*\\b' + code + '\\b').test(SRC),
      code + ' is a bot-block, not a verdict about the firm — it must be rescued by the renderer');
  }
  A.ok(/_BLOCKED\.has\(Number\(r\.status\)\)\)\s*\{\s*shells\.push/.test(SRC),
    'a blocked page must be pushed onto the render queue');
});

t('THE RENDER SERVICE IS READ FROM THE ENVIRONMENT, and the mint is given one', () => {
  A.ok(/process\.env\.CRAWL_RENDER_URL/.test(SRC), 'compliance.js must read CRAWL_RENDER_URL');
  // The code has ALWAYS read this. For months nobody gave it a value, so every WAF-blocked firm was audited
  // from its homepage alone. A capability nobody hands a key to is not a capability.
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/mint-now.yml'), 'utf8');
  A.ok(/CRAWL_RENDER_URL:\s*\$\{\{\s*secrets\.CRAWL_RENDER_URL\s*\}\}/.test(wf),
    'the mint workflow must PASS CRAWL_RENDER_URL — the renderer existed and the mint was never given it');
});

t('the free Jina reader remains the fallback when no render service is configured', () => {
  A.ok(/r\.jina\.ai/.test(SRC), 'the free reader must stay as the last rung of the ladder');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
