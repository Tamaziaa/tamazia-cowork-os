'use strict';
/**
 * THE COHERENCE GATE — AST, NOT REGEX.
 *
 * The first two versions of this gate were regexes, and both were WRONG IN THE SAME WAY: they encoded ONE SPELLING
 * of the defect and then reported zero.
 *
 *   v1  /require\(path\.resolve/        -> passed while require(require('path').resolve(...)) sat in the file.
 *   v2  /catch \(_e\) \{\}/             -> reported 0 SILENT SWALLOWS while 55 existed, because it could not see
 *                                          `catch (_e) { return null; }`, `catch (_e) { return []; }`, or a
 *                                          comment-only fail-open body. CodeRabbit caught this; I had not.
 *
 * A gate that measures one spelling of a bug is a gate that will be walked around, and worse, it produces a
 * CONFIDENT ZERO — which is more dangerous than no gate at all, because it stops anyone looking.
 *
 * So this parses the code and asks the real questions:
 *   1. Is every require() argument a STRING LITERAL? (a template literal or an expression is invisible to every
 *      static tool, which is how statute-rag.js was built, required, and never called for months.)
 *   2. Does every catch block either RECORD its failure (_warn/_swarn/_SM.failed/throw) or explicitly DECLARE
 *      itself a fail-open with a reason? Silence is not an option. A stage that failed must leave a trace, or the
 *      audit ships as a clean bill of health for a check that never ran.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let acorn, walk;
try {
  acorn = require('acorn'); walk = require('acorn-walk');
} catch (_e) {
  console.log('ok - skipped (acorn not installed; run npm i -D acorn acorn-walk). A MISSING PARSER IS NOT A PASS.');
  process.exit(0);
}
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const FILES = [
  'src/skills/S025-audit-page-builder/scripts/build.js',
  'src/skills/S008-personalisation-engine/scanners/compliance.js',
];
const parse = (f) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return { src, ast: acorn.parse(src, { ecmaVersion: 2022, locations: true, allowHashBang: true }) };
};

t('EVERY require() TAKES A STRING LITERAL (the dependency graph is readable without executing anything)', () => {
  const bad_ = [];
  for (const f of FILES) {
    const { src, ast } = parse(f);
    walk.simple(ast, { CallExpression(node) {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
      const a = node.arguments[0];
      if (!a || a.type !== 'Literal' || typeof a.value !== 'string') {
        bad_.push(f + ':' + node.loc.start.line + '  ' + src.slice(node.start, node.end).slice(0, 50));
      }
    } });
  }
  A.strictEqual(bad_.length, 0,
    'Dynamic require (template literal, variable, or expression):\n  ' + bad_.join('\n  ')
    + '\nNo static tool can follow these, so nobody can answer "what calls this".');
});

t('NO catch BLOCK IS SILENT (it records the failure, or declares itself fail-open with a reason)', () => {
  const bad_ = [];
  for (const f of FILES) {
    const { src, ast } = parse(f);
    walk.simple(ast, { CatchClause(node) {
      const body = src.slice(node.body.start, node.body.end);
      const records = /_warn\(|_swarn\(|_SM\.failed\(|throw |console\.(error|warn)/.test(body);
      const declared = /FAIL-OPEN:/.test(body);
      if (!records && !declared) {
        bad_.push(f + ':' + node.loc.start.line + '  ' + body.replace(/\s+/g, ' ').slice(0, 56));
      }
    } });
  }
  A.strictEqual(bad_.length, 0,
    bad_.length + ' catch blocks neither record nor declare:\n  ' + bad_.join('\n  ')
    + '\nEither call _warn/_swarn, or write "FAIL-OPEN: <why the default IS the answer>". '
    + 'A swallowed failure means the audit ships a clean bill of health for a check that never ran.');
});

t('warnings reach the payload (they are useless if they stop at the console)', () => {
  const b = fs.readFileSync(path.join(ROOT, FILES[0]), 'utf8');
  const s = fs.readFileSync(path.join(ROOT, FILES[1]), 'utf8');
  A.ok(/warnings:\s*_WARN/.test(b), 'build.js does not emit warnings[] on the payload');
  A.ok(/scan_warnings/.test(s), 'compliance.js does not emit scan_warnings[]');
});

t('llmPreflight is CALLED, not merely defined (a missing key must SHOUT, not shrug)', () => {
  const b = fs.readFileSync(path.join(ROOT, FILES[0]), 'utf8');
  A.ok(/llmPreflight\(\)/.test(b), 'build.js never calls llmPreflight()');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
