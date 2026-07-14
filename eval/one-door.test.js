'use strict';
/**
 * ONE DOOR. The single most expensive bug class in this codebase is not a wrong answer — it is a RIGHT answer
 * implemented twice, fixed once. Every one of these shipped to a law firm:
 *
 *   fwRegulator()  had two doors -> fixed one -> "Sector regulator" kept printing (and CodeRabbit found a THIRD).
 *   firmName()     had two doors -> fixed one -> the audit stayed addressed to "Bristol Office".
 *   "671 frameworks" lived in _adapter.js AND audit-app.js -> the claim was corrected in one place only.
 *   isProse()      lived in compliance.js AND corpus-index.js under a "kept in sync with compliance.js" comment.
 *
 * A comment that says "keep this in sync" is not a mechanism. This is the mechanism.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const walk = (d, out = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith('.js')) out.push(p);
  }
  return out;
};
const files = walk(path.join(ROOT, 'src'));

// Any function whose definition may exist only ONCE in the tree, because a second copy is a legal-document defect.
const SINGLE = ['_isProse', 'isProse', 'splitSentences', 'htmlToText'];

t('ONE DOOR: no evidence-eligibility or text-extraction function is defined twice', () => {
  const dupes = [];
  for (const fn of SINGLE) {
    const re = new RegExp('function\\s+' + fn + '\\s*\\(', 'g');
    const hits = files.filter((f) => re.test(fs.readFileSync(f, 'utf8')));
    if (hits.length > 1) {
      dupes.push(fn + ' defined in ' + hits.length + ': ' + hits.map((h) => path.relative(ROOT, h)).join(', '));
    }
  }
  A.strictEqual(dupes.length, 0,
    'A second copy has appeared:\n  ' + dupes.join('\n  ')
    + '\nThese decide whether a string may be QUOTED TO A LAW FIRM AS EVIDENCE OF A BREACH. Two copies means the '
    + 'scanner and the index can disagree about what a sentence is, silently. Import from src/lib/util/prose.js '
    + 'or src/lib/util/html-text.js. Do not copy and add a "keep in sync" comment — that is not a mechanism.');
});

t('ONE DOOR: nobody re-declares the prose word-list', () => {
  const hits = files.filter((f) => /const\s+_?PROSE_WORDS\s*=/.test(fs.readFileSync(f, 'utf8')));
  const outside = hits.filter((f) => !/util[\\/]prose\.js$/.test(f));
  A.strictEqual(outside.length, 0,
    'PROSE_WORDS re-declared outside prose.js: ' + outside.map((h) => path.relative(ROOT, h)).join(', '));
});

t('ONE DOOR: the shared module is real and behaves', () => {
  const p = require(path.join(ROOT, 'src/lib/util/prose.js'));
  A.strictEqual(p.isProse('Our Expertise Industries Consumer Markets Contact'), false, 'nav must not be quotable');
  A.strictEqual(p.isProse('We use cookies on this website to improve your experience and analyse traffic.'), true,
    'a real disclosure sentence must be quotable');
  A.deepStrictEqual(p.splitSentences('One. Two! Three?'), ['One', 'Two', 'Three']);
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
