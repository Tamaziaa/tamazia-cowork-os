#!/usr/bin/env node
'use strict';
// eval/predicate-gate.js — UP-1 predicate-producibility gate. Ledger leaf 1.3 (informational) / 3.3 (blocking).
// Asserts every catalogue applies_when predicate has a producer in signals.js. No deps, no DB, deterministic.
// Source: V1 A1; V2 DUP-9, UP-1; V3 §6.3. Exit 1 if orphans exist.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function extractProducers() {
  const s = fs.readFileSync(path.join(ROOT, 'src/lib/compliance/signals.js'), 'utf8');
  const prod = new Set();
  // TRIGGER_RX object keys: "  key: /regex/"
  for (const m of s.matchAll(/^\s{2,}([a-z0-9_]+)\s*:\s*\//gm)) prod.add(m[1]);
  // trig.add('x') / t.add('x') literals (handles digits, hyphens, uppercase free-zone codes)
  for (const m of s.matchAll(/\b(?:trig|t)\.add\(\s*['"]([A-Za-z0-9_\-]+)['"]\s*\)/g)) prod.add(m[1]);
  try { const { PREDICATE_IDS } = require(path.join(ROOT,'src','lib','compliance','registry','predicates.js')); for (const id of PREDICATE_IDS) prod.add(id); } catch (_e) {}
  return prod;
}
function extractConsumers() {
  const laws = require(path.join(ROOT, 'db/seeds/compliance-laws.json'));
  const aw = new Set(), ew = new Set();
  for (const l of laws) {
    (l.applies_when || []).forEach(x => aw.add(x));
    (l.excluded_when || []).forEach(x => ew.add(x));
  }
  return { aw, ew };
}
const isEmployeeBand = f => /employees?_/.test(f); // produced by employeeBand()

const DEFERRED = new Set(['meets_ccpa_threshold','meets_state_threshold']); // business-size thresholds undetectable from a website — held (conservative), revisit at branch 6/7
function run() {
  const producers = extractProducers();
  const { aw, ew } = extractConsumers();
  const orphans = [...aw].filter(f => !producers.has(f) && !isEmployeeBand(f) && !DEFERRED.has(f)).sort();
  const satisfiable = [...aw].filter(f => producers.has(f) || isEmployeeBand(f)).sort();
  const unusedProducers = [...producers].filter(p => !aw.has(p) && !ew.has(p)).sort();

  console.log('PREDICATE PRODUCIBILITY GATE (UP-1)  ·  ledger 1.3 / 3.3');
  console.log('  producers (signals.js)  :', producers.size);
  console.log('  applies_when consumed   :', aw.size, ' | excluded_when:', ew.size);
  console.log('  satisfiable applies_when:', satisfiable.length, satisfiable);
  console.log('  ORPHAN applies_when     :', orphans.length);
  console.log('  orphans:', orphans.join(', '));
  console.log('  deferred (held thresholds):', [...DEFERRED].join(', '));
  console.log('  unused producers:', unusedProducers.join(', '));
  const ok = orphans.length === 0;
  console.log(ok ? '\nPASS: every applies_when is producible.'
                 : `\nFAIL (expected today): ${orphans.length} orphan predicate(s) — laws gated on these are silently dropped (V1 A1).`);
  return { ok, orphans, satisfiable, producers: [...producers], unusedProducers };
}
if (require.main === module) { const r = run(); process.exit(r.ok ? 0 : 1); }
module.exports = { run, extractProducers, extractConsumers };
