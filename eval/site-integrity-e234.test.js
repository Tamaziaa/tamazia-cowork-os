'use strict';
// E-234 (v22.8) — SITE-INTEGRITY FALSE-POSITIVE LOCK.
// On 11 Jul the engine published a P0 headline accusing freeths.co.uk (a real UK law firm) of being HACKED,
// with the evidence literally reading "slot, sex, porn". The detector was regex-matching BARE WORDS over RAW
// HTML: `\bsex\b` matched "sex discrimination", `slots?\b` matched the HTML <slot> element and "time slot",
// `porn` matched "pornography" on a criminal-law page. This eval makes that class of fabrication impossible to
// reintroduce: legitimate practice-area vocabulary must NEVER fire, and a genuine injected-link cluster must.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
const fnSrc = src.slice(src.indexOf('const _SPAM_BRAND_RX'), src.indexOf('\n}\n', src.indexOf('function _detectCompromise')) + 3);
const detect = new Function('corpus', 'sector', fnSrc + '\nreturn _detectCompromise(corpus, sector);');

let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };
const A = require('assert');

t('a law firm practising EMPLOYMENT law (sex discrimination, sexual harassment) is NEVER called hacked', () => {
  const c = [{ url: 'https://firm.co.uk/employment/', body: '<h1>Employment</h1><p>We advise on sex discrimination and sexual harassment claims, and equal pay.</p>'.repeat(4) }];
  A.strictEqual(detect(c, 'law-firms'), null);
});
t('HTML <slot> elements and "time slot" copy never trigger a compromise finding', () => {
  const c = [{ url: 'https://firm.co.uk/', body: '<slot name="a"></slot><slot name="b"></slot><div class="slot-grid">Book a time slot. Slots available.</div>'.repeat(4) }];
  A.strictEqual(detect(c, 'law-firms'), null);
});
t('a criminal-law page discussing pornography offences is NEVER called hacked', () => {
  const c = [{ url: 'https://firm.co.uk/criminal/', body: '<p>We defend allegations involving indecent images and pornography offences.</p>'.repeat(5) }];
  A.strictEqual(detect(c, 'law-firms'), null);
});
t('a gambling-law practice page (casino, betting clients) is NEVER called hacked', () => {
  const c = [{ url: 'https://firm.co.uk/gambling/', body: '<p>Our gambling team advises casino operators and betting exchanges on licensing.</p>'.repeat(5) }];
  A.strictEqual(detect(c, 'law-firms'), null);
});
t('the EXACT freeths evidence string ("slot, sex, porn") can no longer be produced', () => {
  const c = [{ url: 'https://freeths.co.uk/', body: '<p>sex discrimination</p><slot></slot><p>pornography offences</p><p>time slot</p>'.repeat(6) }];
  const r = detect(c, 'law-firms');
  A.strictEqual(r, null, 'must be silent; got: ' + (r && r.evidence_quote));
});
t('a GENUINELY hacked site (3+ injected off-site spam links) IS still caught', () => {
  const c = [{ url: 'https://victim.co.uk/', body: `
    <a href="https://situs-slot-gacor.xyz/">situs slot gacor</a>
    <a href="https://judi-bola-online.info/">judi bola</a>
    <a href="https://1xbet-promo.top/">1xbet bonus</a>
    <a href="https://victim.co.uk/about">About us</a>` }];
  const r = detect(c, 'law-firms');
  A.ok(r, 'must fire on a real injected-link cluster');
  A.ok(/https?:\/\//.test(r.evidence_quote), 'evidence must quote the injected URLs verbatim (P-011)');
  A.strictEqual(r.severity, 'P0');
});
t('a single stray spam link is not enough (needs a cluster of 3)', () => {
  const c = [{ url: 'https://v.co.uk/', body: '<a href="https://1xbet-promo.top/">bonus</a><a href="https://v.co.uk/x">x</a>' }];
  A.strictEqual(detect(c, 'law-firms'), null);
});
t('same-site links containing spammy words never count as injected', () => {
  const c = [{ url: 'https://firm.co.uk/', body: '<a href="https://firm.co.uk/casino-bonus-law">Casino bonus law</a><a href="https://firm.co.uk/slot-machine-licensing">Slot machine licensing</a><a href="https://firm.co.uk/betting-disputes">Betting disputes</a>' }];
  A.strictEqual(detect(c, 'law-firms'), null);
});
console.log(bad ? 'E234 SITE-INTEGRITY: FAIL' : 'E234 SITE-INTEGRITY: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
