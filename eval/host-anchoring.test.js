'use strict';
/**
 * A HOST IS NOT A SUBSTRING.
 *
 * `url.includes('reed.co.uk')` is TRUE for 'https://evil.com/?ref=reed.co.uk'. That is not a pedantic point: the
 * Wikidata official-website check used exactly this test, so any entity whose claim merely MENTIONED the domain
 * anywhere in the string was bound to the firm — and that entity feeds FIRM IDENTITY and JURISDICTION. The wrong
 * company's name and the wrong country's law, on a document we send to a law firm.
 *
 * It is the same family as `href.startsWith('javascript:')` (case/whitespace naive) and the enforcement-map regex
 * `/^UAE|DIFC|.../` where `^` anchored only the FIRST branch, so UK_DOH_ADVERTISING was told its regulator was a
 * Gulf authority. CodeQL calls it js/incomplete-hostname-regexp. We call it: compare the parsed HOST, never a
 * substring of the URL.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { isHost, hostOf } = require(path.join(ROOT, 'src/lib/util/url-safe.js'));
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

t('isHost rejects a domain that merely APPEARS in the URL', () => {
  A.strictEqual(isHost('https://evil.com/?ref=reed.co.uk', 'reed.co.uk'), false, 'query-string mention must not match');
  A.strictEqual(isHost('https://evil.com/reed.co.uk/x', 'reed.co.uk'), false, 'path mention must not match');
  A.strictEqual(isHost('https://reed.co.uk.attacker.net/', 'reed.co.uk'), false, 'subdomain-prefix attack must not match');
});
t('isHost accepts the real host and its www', () => {
  A.strictEqual(isHost('https://www.reed.co.uk/about', 'reed.co.uk'), true);
  A.strictEqual(isHost('https://reed.co.uk', 'reed.co.uk'), true);
});
t('NO audit-path file compares a host with .includes(domain)', () => {
  const FILES = [
    'src/lib/audit/site-scan.js', 'src/lib/sourcing/markets.js',
    'src/skills/S025-audit-page-builder/scripts/build.js',
    'src/skills/S008-personalisation-engine/scanners/compliance.js',
    'src/lib/audit/geo-probe.js', 'src/lib/audit/source-gap.js',
  ];
  const guilty = [];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    src.split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return;
      if (/(url|href|u)\s*\.\s*includes\(\s*(dom|domain)\b/.test(l)) guilty.push(f + ':' + (i + 1));
      // the GEO probe and source-gap form: h.includes(dom) || dom.includes(h) — 3 false positives out of 5
      if (/\bh\s*\.\s*includes\(\s*dom\b|\bdom\s*\.\s*includes\(\s*h\b/.test(l)) guilty.push(f + ':' + (i + 1));
    });
  }
  A.strictEqual(guilty.length, 0,
    'Unanchored host comparison:\n  ' + guilty.join('\n  ')
    + '\nA host is not a substring. Use isHost() from src/lib/util/url-safe.js.');
});
console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
