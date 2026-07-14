'use strict';
// THE COHERENCE GATE. This is the capability people buy a semantic code-search tool for, built directly into CI so
// it runs on every push whether or not anyone remembers to ask a tool.
//
// THE DISEASE, measured:
//   * 34 `require(path.resolve(ROOT, ...))` calls in the audit orchestrator - a DYNAMIC require that NO static
//     analysis tool can follow. It made the pipeline's dependency graph INVISIBLE, which is exactly how
//     statute-rag.js was built, required, and never called by a mint for MONTHS without anyone being able to tell.
//   * 51 `catch (_e) {}` swallows in the two files that build the legal document. Each one is a place where a stage
//     can fail and the audit still reports success. The cookie collector returned null for two versions. The breach
//     adjudicator threw "cc is not defined" for two versions while the report told law firms their breaches had
//     been reviewed by a model that never saw them.
//   * "TWO DOORS": four separate times in one session, a fix was applied to ONE of several call sites. CodeRabbit
//     caught the third door in the very PR whose purpose was to eliminate doors.
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const build = fs.readFileSync(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'), 'utf8');
const scan = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
const code = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

t('THE GRAPH IS VISIBLE: no dynamic require survives in the audit orchestrator', () => {
  // The first version of this gate matched only /require\(path\.resolve/ - ONE SPELLING of the defect. It therefore
  // passed while `require(require('path').resolve(...))` sat in the file, still invisible to every static tool.
  // A gate that encodes one spelling of a bug is a gate that will be walked around. The real invariant is: the
  // argument to require() must be a STRING LITERAL, so the dependency graph can be read without executing anything.
  const hits = (code(build).match(/require\(\s*(?!['"`])/g) || []).length;
  A.strictEqual(hits, 0,
    hits + ' dynamic requires remain. No static tool can follow them, so nobody can answer "what calls this" - '
    + 'which is how statute-rag.js went uncalled for months.');
});
t('NOTHING FAILS SILENTLY: no bare swallow in the two files that build the legal document', () => {
  const b = (code(build).match(/catch \(_e\) \{\}/g) || []).length;
  const s = (code(scan).match(/catch \(_e\) \{\}/g) || []).length;
  A.strictEqual(b + s, 0,
    (b + s) + ' bare swallows remain. A swallowed error in a legal document is a lie with a try/catch around it.');
});
t('a swallowed error is RECORDED, so "did anything quietly fail" is answerable', () => {
  A.ok(/_warn\(/.test(build), 'build.js must record its warnings');
  A.ok(/warnings:/.test(build), 'the warnings must reach the payload');
  A.ok(/_swarn\(/.test(scan), 'the scanner must record its warnings');
  A.ok(/scan_warnings:/.test(scan), 'the scan warnings must reach the payload');
});
t('THE SECOND DOOR: every module the orchestrator uses resolves at load (a bad path fails LOUD, not silent)', () => {
  // If any static require is wrong, requiring build.js throws. That is the whole point.
  A.doesNotThrow(() => require(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js')),
    'a module path is broken - and it now fails at LOAD instead of being swallowed at runtime');
});
t('the LLM preflight is called, so a missing key can never again degrade in silence', () => {
  A.ok(/llmPreflight\(\)/.test(build), 'a missing LLM key must SHOUT: it cost us the whole gate chain');
});

console.log(bad ? 'COHERENCE GATE: FAIL' : 'COHERENCE GATE: ALL GREEN (' + n + ' checks)');
process.exit(bad ? 1 : 0);
