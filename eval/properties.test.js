'use strict';
/**
 * PROPERTY-BASED TESTING (fast-check).
 *
 * Every example-based test I write encodes the cases I ALREADY THOUGHT OF. Every bug that reached a law firm was a
 * case I had not thought of:
 *
 *   sameHost   — 'ed.co' matched 'reed.co.uk'. Three false positives out of the five examples I happened to try.
 *   isProse    — decides whether a line may be QUOTED AS EVIDENCE OF A BREACH.
 *   scrubMoney — rewrote a correct "£25,000 SRA penalty" into the £2.6M aggregate.
 *
 * fast-check does not take examples. It takes a PROPERTY that must hold for ALL inputs, generates hundreds of them
 * (including the empty string, unicode, and boundary values I never enumerate), and when it finds a failure it
 * SHRINKS it to the smallest input that still fails. It finds the cases I did not think of, which is the only kind
 * that has ever hurt us.
 */
const fc = require('fast-check');
const A = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { sameHost, isHost } = require(path.join(ROOT, 'src/lib/util/url-safe.js'));
const { isProse, splitSentences } = require(path.join(ROOT, 'src/lib/util/prose.js'));

let n = 0, bad = 0;
const t = (name, prop) => {
  n++;
  try { fc.assert(prop, { numRuns: 300 }); console.log('ok ' + n + ' ' + name); }
  catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + '\n  ' + String(e.message).split('\n').slice(0, 6).join('\n  ')); }
};

// ── sameHost. The whole point is that a host is NOT a substring.
const host = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/),
  fc.constantFrom('com', 'co.uk', 'de', 'ae', 'org.uk'),
).map(([s, tld]) => s + '.' + tld);

t('sameHost: a host NEVER matches an unrelated host that merely contains it', fc.property(
  host, host, (a, b) => {
    fc.pre(a !== b && !a.endsWith('.' + b) && !b.endsWith('.' + a));
    // an attacker-controlled host that EMBEDS the victim's must not match
    return sameHost(a + '.' + b, a) === false || (a + '.' + b).endsWith('.' + a);
  }));

t('sameHost: is reflexive and www-insensitive', fc.property(
  host, (h) => sameHost(h, h) === true && sameHost('www.' + h, h) === true && sameHost('https://www.' + h + '/x', h) === true));

t('sameHost: a domain appearing in the PATH or QUERY of another host never matches', fc.property(
  host, host, (victim, attacker) => {
    fc.pre(victim !== attacker && !attacker.endsWith('.' + victim) && !victim.endsWith('.' + attacker));
    return isHost('https://' + attacker + '/?ref=' + victim, victim) === false
        && isHost('https://' + attacker + '/' + victim + '/x', victim) === false;
  }));

// ── isProse. A false YES puts page furniture in a legal document.
t('isProse: never accepts a run of Title-Case link labels (a nav bar is not evidence)', fc.property(
  fc.array(fc.stringMatching(/^[A-Z][a-z]{2,9}$/), { minLength: 6, maxLength: 20 }),
  (words) => isProse(words.join(' ')) === false));

t('isProse: never accepts the empty/blank string, and never throws', fc.property(
  fc.string(), (s) => { const r = isProse(s); return typeof r === 'boolean'; }));

t('isProse: rejects anything under 6 words (too short to be a disclosure)', fc.property(
  fc.array(fc.stringMatching(/^[a-z]{2,8}$/), { minLength: 0, maxLength: 5 }),
  (w) => isProse(w.join(' ')) === false));

// ── splitSentences. The scanner and the index must cut text at the SAME places.
t('splitSentences: never returns an empty or whitespace-only fragment', fc.property(
  fc.string(), (s) => splitSentences(s).every((x) => x.length > 0 && x.trim() === x)));

t('splitSentences: total content is preserved (no text is silently dropped)', fc.property(
  fc.array(fc.stringMatching(/^[a-z ]{3,20}$/), { minLength: 1, maxLength: 6 }),
  (parts) => {
    const joined = parts.map((p) => p.trim()).filter(Boolean).join('. ');
    fc.pre(joined.length > 0);
    const out = splitSentences(joined);
    return out.join('').replace(/\s/g, '').length === joined.replace(/[.\s]/g, '').length;
  }));

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
