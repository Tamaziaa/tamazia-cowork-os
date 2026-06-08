#!/usr/bin/env node
'use strict';
// WS-C — the self-audit CYCLE (deterministic backbone of the gap-finder + auto-fix loop). Runs the full compliance
// invariant set in one pass and fails CLOSED if anything is red, so a cron/CI run catches a regression the moment it
// lands. Cadence: per-engine-cycle (blocks export if red) + weekly. The adversarial agent verification + auto-fix PR
// of any surfaced gap is layered on top via the Workflow tool (see the final wide bug-test); this script is the
// deterministic gate those agents trust. Exit 1 on ANY failure.
//   node scripts/self-audit-workflow.js
const path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

function run(label, args) {
  process.stdout.write(`  • ${label.padEnd(34)} `);
  try { const out = execFileSync(NODE, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/(\d+)\s+PASS\s*\/\s*(\d+)\s+FAIL/) || out.match(/PASS\s+(\d+)\s+FAIL\s+(\d+)/);
    const failN = m ? Number(m[2]) : 0;
    console.log(m ? `${m[0]}` : 'OK'); return { ok: failN === 0, label, out };
  } catch (e) { const out = (e.stdout || '') + (e.stderr || ''); console.log('FAIL (exit ' + (e.status || '?') + ')'); return { ok: false, label, out }; }
}

console.log('=== SELF-AUDIT CYCLE (compliance) ===');
const steps = [
  ['gap-finder (7 dimensions)', [path.join(ROOT, 'src', 'lib', 'audit', 'gap-finder.js')]],
  ['qa-compliance ship-gate', [path.join(ROOT, 'scripts', 'qa-compliance.js')]],
  ['qa-validate-library (29)', [path.join(ROOT, 'scripts', 'migrations', 'qa-validate-library.js')]],
  ['resolver+overlay test', [path.join(ROOT, 'scripts', 'migrations', 'test-resolver.js')]],
  ['corpus-index test', [path.join(ROOT, 'scripts', 'migrations', 'test-corpus-index.js')]],
  ['enforcement test', [path.join(ROOT, 'scripts', 'migrations', 'test-enforcement.js')]],
  ['engine adversarial regression', [path.join(ROOT, 'scripts', 'adversarial-test.js')]],
];
const results = steps.map(([l, a]) => run(l, a));
const red = results.filter(r => !r.ok);
console.log(`\n${results.length - red.length}/${results.length} green.`);
if (red.length) {
  console.log('SELF-AUDIT RED — the following must be fixed before export:');
  for (const r of red) console.log('  - ' + r.label + ' :: ' + (r.out.split('\n').filter(x => /FAIL|Error|gap/i.test(x)).slice(0, 3).join(' | ') || 'see output'));
  process.exit(1);
}
console.log('SELF-AUDIT GREEN — compliance invariants hold end-to-end.');
