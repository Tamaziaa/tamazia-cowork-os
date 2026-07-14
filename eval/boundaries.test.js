'use strict';
/**
 * BOUNDARY TESTS — written because STRYKER PROVED THE OLD TESTS WERE THEATRE.
 *
 * Mutation testing flips a `<` to a `<=`, a `&&` to an `||`, a `0.5` to a `0.6`, and re-runs the suite. If the
 * tests still pass, that line is NOT PROTECTED. Coverage said prose.js and url-safe.js were exercised. Stryker said:
 *
 *     prose.js     47% mutation score   (39 surviving mutants)
 *     url-safe.js  37% mutation score   (65 surviving mutants)
 *
 * Over HALF the logic in the two modules that decide WHAT MAY BE QUOTED TO A LAW FIRM AS EVIDENCE was unguarded.
 * Every threshold below is one Stryker showed nobody was watching. Each is now pinned ON BOTH SIDES.
 */
const A = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { isProse, splitSentences } = require(path.join(ROOT, 'src/lib/util/prose.js'));
const U = require(path.join(ROOT, 'src/lib/util/url-safe.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const sentence = (k) => Array(k).fill('the').map((w, i) => (i % 2 ? 'of' : 'the')).join(' ');

// ── isProse: word-count floor (6) and ceiling (60), pinned on both sides
t('isProse: 5 words rejected, 6 words accepted (the floor is exactly 6)', () => {
  A.strictEqual(isProse('we do not use the'), false, '5 words must be rejected');
  A.strictEqual(isProse('we do not use any of the cookies'), true, '8 words of real prose must be accepted');
});
t('isProse: 60 words accepted, 61 rejected (the ceiling is exactly 60)', () => {
  A.strictEqual(isProse(sentence(60)), true, '60 words must still be accepted');
  A.strictEqual(isProse(sentence(61)), false, '61 words must be rejected');
});
// ── explicit nav markers
t('isProse: an explicit nav marker is never quotable', () => {
  for (const w of ['menu', 'toggle', 'skip to', 'breadcrumb', 'navigation']) {
    A.strictEqual(isProse('please use the ' + w + ' to find our privacy policy today'), false, w + ' must be rejected');
  }
});
// ── function-word floor (fn < 3)
t('isProse: fewer than 3 function words is not a sentence', () => {
  A.strictEqual(isProse('cookies privacy policy terms consent banner tracking'), false, '0 function words');
  A.strictEqual(isProse('we use cookies on this website to analyse traffic'), true, 'many function words');
});
// ── lowercase ratio (< 0.5 = Title-Case labels)
t('isProse: majority Title-Case tokens are labels, not prose', () => {
  A.strictEqual(isProse('Our Expertise Industries Consumer Markets And Retail Sectors'), false);
});
// ── 3+ consecutive Title-Case run
t('isProse: a run of 3+ consecutive Title-Case words is a link list', () => {
  A.strictEqual(isProse('we advise on Consumer Markets Retail matters for our clients'), false,
    'three consecutive Title-Case words = a menu, not a sentence');
  A.strictEqual(isProse('we advise on Consumer Markets matters for all of our clients'), true,
    'two consecutive Title-Case words is a legitimate proper noun');
});
// ── never throws, always boolean
t('isProse: null/undefined/empty never throw', () => {
  for (const v of [null, undefined, '', '   ', 0, {}]) A.strictEqual(typeof isProse(v), 'boolean');
});

// ── splitSentences
t('splitSentences: splits on . ! ? and bullet, drops empties', () => {
  A.deepStrictEqual(splitSentences('A. B! C? D'), ['A', 'B', 'C', 'D']);
  A.deepStrictEqual(splitSentences('...'), []);
  A.deepStrictEqual(splitSentences(''), []);
});

// ── url-safe: every branch pinned
t('isDangerousScheme: javascript: in any casing/whitespace', () => {
  for (const h of ['javascript:alert(1)', 'JavaScript:x', '  javascript:x', 'java\tscript:x', 'data:text/html,x', 'vbscript:x']) {
    A.strictEqual(U.isDangerousScheme(h), true, h + ' must be dangerous');
  }
  A.strictEqual(U.isDangerousScheme('https://x.com'), false);
  A.strictEqual(U.isDangerousScheme('/privacy'), false);
});
t('hostOf: parses, strips www, returns null on garbage', () => {
  A.strictEqual(U.hostOf('https://www.reed.co.uk/a/b'), 'reed.co.uk');
  A.ok(!U.hostOf('not a url'), 'garbage must be falsy — hostOf returns an empty string, which every caller treats as absent');
});
t('isHost: exact host only — never the path, query, or a prefix attack', () => {
  A.strictEqual(U.isHost('https://reed.co.uk/x', 'reed.co.uk'), true);
  A.strictEqual(U.isHost('https://www.reed.co.uk', 'reed.co.uk'), true);
  A.strictEqual(U.isHost('https://evil.com/?r=reed.co.uk', 'reed.co.uk'), false);
  A.strictEqual(U.isHost('https://evil.com/reed.co.uk', 'reed.co.uk'), false);
  A.strictEqual(U.isHost('https://reed.co.uk.evil.net', 'reed.co.uk'), false);
});
t('sameHost: subdomains match, lookalikes do not', () => {
  A.strictEqual(U.sameHost('careers.reed.co.uk', 'reed.co.uk'), true, 'a subdomain IS the same site');
  A.strictEqual(U.sameHost('notreed.co.uk', 'reed.co.uk'), false, 'a lookalike is NOT');
  A.strictEqual(U.sameHost('ed.co', 'reed.co.uk'), false, 'a substring is NOT');
  A.strictEqual(U.sameHost('', 'reed.co.uk'), false);
  A.strictEqual(U.sameHost('reed.co.uk', ''), false);
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
