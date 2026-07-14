'use strict';
/**
 * THIRD STRYKER PASS - kill the last survivors.
 *
 * Every assertion here exists because Stryker proved it could mutate that exact line and NO TEST NOTICED. On
 * functions that decide what may be QUOTED TO A LAW FIRM AS EVIDENCE, and which URLs we are willing to follow and
 * render, an unguarded line is not a style issue. It is the next incident.
 */
const A = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const U = require(path.join(ROOT, 'src/lib/util/url-safe.js'));
const { isProse, splitSentences, PROSE_WORDS } = require(path.join(ROOT, 'src/lib/util/prose.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const NUL = '\u0000', ZWSP = '\u200b', NBSP = '\u00a0';

t('isDangerousScheme: EVERY scheme in the list, and the control-char bypass', () => {
  for (const sch of ['javascript', 'vbscript', 'data', 'file', 'blob']) {
    A.strictEqual(U.isDangerousScheme(sch + ':x'), true, sch + ': must be blocked');
    A.strictEqual(U.isDangerousScheme(sch.toUpperCase() + ':x'), true, sch + ': case-insensitively');
  }
  // A browser IGNORES control and zero-width chars inside a scheme, so an attacker writes them there to slip past a
  // naive check. If we strip them AND the browser strips them, we agree. If only the browser does, we ship a link
  // we believed was safe and the browser executes it as script.
  A.strictEqual(U.isDangerousScheme('java' + NUL + 'script:alert(1)'), true, 'NUL inside the scheme');
  A.strictEqual(U.isDangerousScheme('java' + ZWSP + 'script:alert(1)'), true, 'zero-width space inside the scheme');
  A.strictEqual(U.isDangerousScheme(NBSP + 'javascript:alert(1)'), true, 'leading non-breaking space');
  A.strictEqual(U.isDangerousScheme('https://x.com'), false);
  A.strictEqual(U.isDangerousScheme(null), false);
});

t('isNonCrawlable: the control-char bypass applies to mail/tel too', () => {
  A.strictEqual(U.isNonCrawlable('mail' + NUL + 'to:a@b.com'), true, 'NUL inside mailto');
  A.strictEqual(U.isNonCrawlable(ZWSP + 'tel:+441234'), true, 'zero-width before tel');
});

t('hostOf: the base argument, the www strip, and the parse failure', () => {
  A.strictEqual(U.hostOf('/privacy', 'https://reed.co.uk'), 'reed.co.uk', 'a relative url resolves against the base');
  A.strictEqual(U.hostOf('https://WWW.Reed.CO.UK/x'), 'reed.co.uk', 'lowercased AND www-stripped');
  A.strictEqual(U.hostOf('://////'), '', 'an unparseable url returns empty - it does not throw');
  A.strictEqual(U.hostOf(null), '');
});

t('isHost: the DOMAIN side is also www-stripped, and endsWith needs the dot', () => {
  A.strictEqual(U.isHost('https://reed.co.uk', 'www.reed.co.uk'), true, 'www on the DOMAIN side must be stripped');
  A.strictEqual(U.isHost('https://careers.reed.co.uk', 'reed.co.uk'), true, 'a subdomain IS the site');
  A.strictEqual(U.isHost('', 'reed.co.uk'), false);
  A.strictEqual(U.isHost('https://reed.co.uk', ''), false);
  A.strictEqual(U.isHost('https://xreed.co.uk', 'reed.co.uk'), false, 'endsWith MUST require the dot separator');
});

t('isProse: the word floor is EXACTLY 6', () => {
  A.strictEqual(isProse('we do not use the cookies'), true, 'exactly 6 words of prose passes');
  A.strictEqual(isProse('we do not use the'), false, 'exactly 5 words fails');
});

t('isProse: words split on ANY whitespace (tabs, newlines, runs of spaces)', () => {
  A.strictEqual(isProse('we\tdo\nnot   use  the cookies'), true,
    'the split must be a whitespace CLASS, not a single space - a sentence broken by a newline is still a sentence');
});

t('isProse: the Title-Case run regex is anchored at BOTH ends', () => {
  // Drop the ^ and 'xAlpha' matches. Drop the $ and 'Alpha1' matches. Either way a link list ships as prose.
  A.strictEqual(isProse('we advise on xAlpha xBeta xGamma matters for our clients'), true,
    'lowercase-led tokens are not Title-Case - the ^ anchor is load-bearing');
  A.strictEqual(isProse('we advise on Alpha1 Beta2 Gamma3 matters for our clients'), true,
    'tokens ending in digits are not the link pattern - the $ anchor is load-bearing');
  A.strictEqual(isProse('we advise on Alpha Beta Gamma matters for our clients'), false,
    'three clean consecutive Title-Case words IS a link list');
});

t('splitSentences: EVERY separator, individually', () => {
  A.deepStrictEqual(splitSentences('a.b'), ['a', 'b'], 'full stop');
  A.deepStrictEqual(splitSentences('a!b'), ['a', 'b'], 'exclamation');
  A.deepStrictEqual(splitSentences('a?b'), ['a', 'b'], 'question mark');
  A.deepStrictEqual(splitSentences('a\u2022b'), ['a', 'b'], 'bullet');
  A.deepStrictEqual(splitSentences('a\nb'), ['a', 'b'], 'newline');
  A.deepStrictEqual(splitSentences('a\u241eb'), ['a', 'b'], 'record separator');
  A.deepStrictEqual(splitSentences('a...b'), ['a', 'b'], 'a RUN of separators is ONE boundary, not three');
  A.deepStrictEqual(splitSentences(null), []);
});

t('PROSE_WORDS is a real regex that actually matches function words', () => {
  A.ok(PROSE_WORDS instanceof RegExp);
  A.ok('we use the of and to'.match(PROSE_WORDS).length >= 4, 'the word list must actually match');
});


t('isHostPath: the LinkedIn/company-profile guard, which had NO tests at all', () => {
  // This is what stops 'evil.com/linkedin.com/in/x' being read as a LinkedIn profile. Stryker could delete its
  // entire body and every test still passed, because nothing called it.
  A.strictEqual(U.isHostPath('https://www.linkedin.com/in/aman', 'linkedin.com', '/in/'), true);
  A.strictEqual(U.isHostPath('https://uk.linkedin.com/in/aman', 'linkedin.com', '/in/'), true, 'a subdomain is the site');
  A.strictEqual(U.isHostPath('https://linkedin.com/company/x', 'linkedin.com', '/in/'), false, 'right host, WRONG path');
  A.strictEqual(U.isHostPath('https://evil.com/linkedin.com/in/x', 'linkedin.com', '/in/'), false, 'the host is not linkedin');
  A.strictEqual(U.isHostPath('https://LINKEDIN.com/IN/Aman', 'linkedin.com', '/in/'), true, 'path match is case-insensitive');
  A.strictEqual(U.isHostPath('not a url', 'linkedin.com', '/in/'), false, 'garbage returns false, never throws');
  A.strictEqual(U.isHostPath('https://linkedin.com/in/x', '', '/in/'), false, 'empty domain');
});

t('isProse: empty tokens from padding must NOT be counted as words', () => {
  // `.filter(Boolean)` is load-bearing. Without it, '  we do not use the  ' splits to 7 tokens (two empty), clears
  // the 6-word floor, and a five-word fragment would be quotable as evidence.
  A.strictEqual(isProse('  we do not use the  '), false,
    'five real words padded with whitespace is still five words');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
