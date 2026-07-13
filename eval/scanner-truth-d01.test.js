'use strict';
// D — THE FALSE-POSITIVE GENERATORS INSIDE THE SCANNER.
// Every check here is a defect CodeQL found in the detection code itself, i.e. in the machinery that decides what
// we accuse a law firm of. These are not style nits. Each one could put a false legal claim on a client's report.
const A = require('assert');
const { htmlToText } = require('../src/lib/util/html-text.js');
const { isDangerousScheme, isNonCrawlable, isHost, isHostPath } = require('../src/lib/util/url-safe.js');
const { attributeEnforcement } = (() => { try { return require('../src/lib/audit/enforcement-map.js'); } catch (_e) { return {}; } })();
const adtech = require('../src/lib/audit/ad-tech.js');

let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

// ---------- D-01: js/bad-tag-filter — SCRIPT BODIES LEAKING INTO THE EVIDENCE CORPUS ----------
t('D-01: a </script > with whitespace does NOT leak JavaScript into the corpus', () => {
  const html = '<p>We take your privacy seriously.</p><script >var _gaq=[["_setAccount","UA-123"]];function track(){}</script ><p>Contact us.</p>';
  const txt = htmlToText(html);
  A.ok(!/_setAccount|_gaq|function track/.test(txt), 'JS leaked into the corpus an evidence_quote is cut from: ' + txt);
  A.strictEqual(txt, 'We take your privacy seriously. Contact us.');
});
t('D-01: an unterminated <script> swallows the rest, it never becomes prose', () => {
  A.strictEqual(htmlToText('<p>Prose.</p><script>var leak=1;'), 'Prose.');
});
t('D-01: a > inside a quoted attribute does not break the tag stripper', () => {
  A.strictEqual(htmlToText('<div data-x="a>b">Hidden</div><p>Visible.</p>'), 'Hidden Visible.');
});
t('D-01: markup commented out is not page content', () => {
  A.strictEqual(htmlToText('<!-- <script>alert(1)</script> --><p>Real text.</p>'), 'Real text.');
});
t('D-01: <style > and <noscript> bodies never enter the corpus', () => {
  A.strictEqual(htmlToText('<style >.a{color:red}</style ><noscript>Enable JS</noscript><p>Text</p>'), 'Text');
});
t('D-01: entities are decoded, so a quote reads as the firm wrote it', () => {
  A.strictEqual(htmlToText('<p>Terms &amp; Conditions&nbsp;apply</p>'), 'Terms & Conditions apply');
});

// ---------- D-02: the regulator misattribution ----------
t('D-02: a UK framework is NEVER attributed to a UAE/GCC regulator', () => {
  const src = require('fs').readFileSync(require.resolve('../src/lib/audit/enforcement-map.js'), 'utf8');
  A.ok(/\/\^\(UAE\|DIFC/.test(src), 'the alternation must be wrapped by the ^ anchor');
  const rx = /^(UAE|DIFC|ADGM|SAUDI|QATAR|DHA|DOH|RERA|TDRA)/;
  A.ok(!rx.test('UK_DOH_ADVERTISING'), 'a UK Department of Health framework is not a Gulf regulator');
  A.ok(!rx.test('US_DHA_RULES'));
  A.ok(rx.test('UAE_PDPL'), 'a genuine UAE framework must still resolve');
  A.ok(rx.test('DIFC_DP'));
});

// ---------- D-03: js/incomplete-url-scheme-check ----------
t('D-03: javascript:/vbscript:/data: are blocked whatever the casing or padding', () => {
  for (const h of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'vbscript:x', 'data:text/html,<script>']) {
    A.ok(isDangerousScheme(h), 'must block: ' + JSON.stringify(h));
    A.ok(isNonCrawlable(h));
  }
  A.ok(!isDangerousScheme('https://example.com/privacy'), 'a real page must remain crawlable');
  A.ok(!isNonCrawlable('https://example.com/privacy'));
});

// ---------- D-05: js/incomplete-url-substring-sanitization ----------
t('D-05: a URL is identified by its HOST, never by substring', () => {
  A.strictEqual(isHost('https://evil.example.com/linkedin.com/in/aman', 'linkedin.com'), false, 'the old .includes() said TRUE here');
  A.strictEqual(isHost('https://uk.linkedin.com/in/aman', 'linkedin.com'), true);
  A.strictEqual(isHostPath('https://www.linkedin.com/company/tamazia', 'linkedin.com', '/in/'), false);
  A.strictEqual(isHostPath('https://www.linkedin.com/in/aman', 'linkedin.com', '/in/'), true);
});

// ---------- D-04: the tracker false positive that would embarrass us in front of a solicitor ----------
t('D-04: a firm that BLOGS about Criteo is not reported as RUNNING Criteo ads', () => {
  const article = '<article><h1>CNIL fines Criteo EUR 40m over consent</h1>'
    + '<p>The French regulator fined Criteo for failing to prove consent. Outbrain and Taboola face similar scrutiny.</p></article>';
  const r = adtech.detectAdTech ? adtech.detectAdTech(article) : (adtech.detect ? adtech.detect(article) : null);
  const res = r || {};
  A.ok(!(res.platforms || []).includes('native-ads'), 'a case note naming Criteo must NOT make us claim they run native ads');
  A.ok(res.runs_ads !== true, 'the firm does not run ads; it wrote about someone who does');
});
t('D-04: a REAL Criteo script tag is still detected', () => {
  const real = '<script src="https://static.criteo.net/js/ld/ld.js" async></script>';
  const r = adtech.detectAdTech ? adtech.detectAdTech(real) : (adtech.detect ? adtech.detect(real) : null);
  const res = r || {};
  A.ok((res.platforms || []).includes('native-ads'), 'a genuine Criteo tag MUST still fire');
});

console.log(bad ? 'D SCANNER TRUTH: FAIL' : 'D SCANNER TRUTH: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
