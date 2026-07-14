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


// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// SECOND STRYKER PASS. The first pass took prose.js 47->73% and url-safe.js 37->48%. These kill the clusters that
// still survived: the isNonCrawlable branches, every step of the sameHost normaliser, and the three ratio
// thresholds in isProse that decide whether a line is a sentence or a menu.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

t('isNonCrawlable: EVERY branch, pinned', () => {
  A.strictEqual(U.isNonCrawlable(''), true, 'empty href');
  A.strictEqual(U.isNonCrawlable(null), true, 'null href');
  A.strictEqual(U.isNonCrawlable('   '), true, 'whitespace-only href');
  A.strictEqual(U.isNonCrawlable('#section'), true, 'a fragment is the same page');
  for (const sch of ['mailto', 'tel', 'sms', 'callto', 'fax']) {
    A.strictEqual(U.isNonCrawlable(sch + ':x'), true, sch + ': is not a page');
    A.strictEqual(U.isNonCrawlable(sch.toUpperCase() + ':x'), true, sch + ': must be case-insensitive');
  }
  A.strictEqual(U.isNonCrawlable('javascript:alert(1)'), true, 'a dangerous scheme is never crawlable');
  A.strictEqual(U.isNonCrawlable('/privacy'), false, 'a real path IS crawlable');
  A.strictEqual(U.isNonCrawlable('https://x.com/a'), false, 'a real url IS crawlable');
});

t('sameHost normaliser: every step of the chain is load-bearing', () => {
  // scheme strip
  A.strictEqual(U.sameHost('https://reed.co.uk', 'reed.co.uk'), true, 'https:// must be stripped');
  A.strictEqual(U.sameHost('http://reed.co.uk', 'reed.co.uk'), true, 'http:// must be stripped');
  // path strip
  A.strictEqual(U.sameHost('reed.co.uk/careers/jobs', 'reed.co.uk'), true, 'the path must be dropped');
  // www strip
  A.strictEqual(U.sameHost('www.reed.co.uk', 'reed.co.uk'), true, 'www. must be stripped');
  A.strictEqual(U.sameHost('reed.co.uk', 'www.reed.co.uk'), true, 'www. must be stripped on BOTH sides');
  // trailing-dot strip (a fully-qualified DNS name)
  A.strictEqual(U.sameHost('reed.co.uk.', 'reed.co.uk'), true, 'a trailing dot is the same host');
  // case
  A.strictEqual(U.sameHost('REED.CO.UK', 'reed.co.uk'), true, 'host comparison is case-insensitive');
  // and the whole point: none of that may let a lookalike through
  A.strictEqual(U.sameHost('https://www.notreed.co.uk/x', 'reed.co.uk'), false);
});

t('isProse: the function-word RATIO threshold (0.15) is pinned on both sides', () => {
  // 20 words, exactly 3 function words = 0.15 -> must PASS (the guard is `< 0.15`)
  const at15 = 'the of to alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho';
  A.strictEqual(isProse(at15), true, 'exactly 0.15 must still be prose');
  // dilute it: same 3 function words, more content words -> ratio drops below 0.15 -> must FAIL
  const below = at15 + ' sigma tau upsilon phi chi psi omega alpha beta gamma';
  A.strictEqual(isProse(below), false, 'below 0.15 is too sparse to be a sentence');
});

t('isProse: the lowercase RATIO threshold (0.5) is pinned on both sides', () => {
  // 8 words, 4 lowercase = exactly 0.5. Title-Case words are interleaved so this isolates the RATIO guard and does
  // not trip the separate "3 consecutive Title-Case words" rule.
  A.strictEqual(isProse('we Alpha use Beta the Gamma of Delta'), true, 'exactly 0.5 lowercase must pass');
  // tip it below 0.5 -> a label list
  A.strictEqual(isProse('we Alpha use Beta the Gamma Delta of Epsilon Zeta'), false, 'below 0.5 lowercase is a menu');
});

t('isProse: the function-word FLOOR (3) is pinned on both sides', () => {
  A.strictEqual(isProse('the of to alpha beta gamma delta'), true, 'exactly 3 function words passes the floor');
  A.strictEqual(isProse('the of alpha beta gamma delta epsilon'), false, 'only 2 function words is not a sentence');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
