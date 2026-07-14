'use strict';
// REACHABILITY. Every module on the audit path must be reachable from the mint entrypoint, or DECLARED dormant.
//
// statute-rag.js was required for months and never called. It was not the exception, it was the pattern: THIRTEEN
// modules (691 lines of correct, tested, cited legal logic) were unreachable from build.js. citation-gate.js —
// the gate designed to make an unevidenced monetary claim impossible — had never executed once.
//
// A module can be written, reviewed, merged and unit-tested while being unreachable from the mint. The unit test
// proves the FUNCTION works. Nothing proved the MINT CALLS IT. This gate does.
//
// Reachable => fine. Listed in DORMANT.md with a reason => fine. Neither => CI fails.
const A = require('assert');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = 'src/skills/S025-audit-page-builder/scripts/build.js';
const WATCHED = ['src/lib/audit', 'src/lib/compliance', 'src/lib/evidence'];

// Static require() literals — including the dynamic-looking ones INSIDE functions, which is how this codebase
// wires most of its stages. A regex would miss `require(path.join(...))`; acorn sees the shape and we only
// follow string literals, which is exactly what node resolves at runtime.
function requiresOf(file) {
  if (!file.endsWith('.js')) return [];        // a required .json is a LEAF (data), not a module to walk
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (_e) { return []; }
  let ast;
  // A PARSE FAILURE MUST BE LOUD. The first version of this walker swallowed the error and returned [], so
  // build.js — which opens with a shebang — parsed to nothing and the gate reported ONE reachable module while
  // cheerfully declaring 48 files dead. A walker that cannot read a file must never report "no dependencies".
  // allowHashBang: build.js and the scripts are executables. ecmaVersion 'latest': this codebase uses modern syntax.
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  } catch (e) {
    throw new Error('reachability walker could not parse ' + path.relative(ROOT, file) + ': ' + e.message
      + '\n  A parse failure that returns [] is a CONFIDENT ZERO. It is not allowed here.');
  }
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'CallExpression' && n.callee && n.callee.name === 'require'
        && n.arguments[0] && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string') {
      out.push(n.arguments[0].value);
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return out;
}
function resolveReq(fromFile, spec) {
  if (!spec.startsWith('.')) return null;                       // node_modules — not ours
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const reach = new Set();
(function walk(f) {
  if (reach.has(f)) return;
  reach.add(f);
  for (const spec of requiresOf(f)) {
    const r = resolveReq(f, spec);
    if (r) walk(r);
  }
})(path.join(ROOT, ENTRY));

const watched = [];
for (const d of WATCHED) {
  (function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'tests') scan(p); }
      else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) watched.push(p);
    }
  })(path.join(ROOT, d));
}

const dormantSrc = fs.readFileSync(path.join(ROOT, 'DORMANT.md'), 'utf8');
const declaredDormant = (name) => dormantSrc.includes('`' + name + '`');

let bad = 0;
const t = (n, fn) => { try { fn(); console.log('ok ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };

t('the graph is REAL (calibration — a walker that reaches nothing proves nothing)', () => {
  A.ok(reach.size > 40, 'only ' + reach.size + ' modules reachable from build.js; the walker is broken');
  const must = ['compliance.js', 'connect.js', 'signals.js', 'site-scan.js', 'finding-trust.js'];
  for (const m of must) {
    A.ok([...reach].some((f) => f.endsWith('/' + m)), m + ' is NOT in the graph — the walker is lying');
  }
});

t('every audit-path module is REACHABLE from build.js, or DECLARED dormant in DORMANT.md', () => {
  const undeclared = [];
  for (const f of watched) {
    if (reach.has(f)) continue;
    const rel = path.relative(ROOT, f);
    const short = rel.replace(/^src\/lib\//, '');            // e.g. audit/gap-finder.js
    const bare = path.basename(f);                            // e.g. gap-finder.js
    if (declaredDormant(short) || declaredDormant(bare)) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n').length;
    undeclared.push(rel + ' (' + lines + ' lines)');
  }
  A.deepStrictEqual(undeclared, [],
    undeclared.length + ' module(s) are unreachable from the mint AND undeclared:\n  ' + undeclared.join('\n  ') +
    '\n\nEither wire it into build.js, or add it to DORMANT.md with a written reason and an owner.' +
    '\nstatute-rag.js was required for months and never called. This gate exists so that cannot happen silently again.');
});

t('DORMANT.md does not shelter a module that is ACTUALLY wired (a stale excuse is a lie)', () => {
  const stale = [];
  for (const f of watched) {
    if (!reach.has(f)) continue;
    const bare = path.basename(f);
    // only flag if the DORMANT *table* lists it (the "Wired in" section legitimately names them)
    // anchor on a path boundary: 'subjurisdiction.js' must NOT match a search for 'jurisdiction.js'
    const tableRow = new RegExp('^\\|\\s*`(?:[^`]*/)?' + bare.replace('.', '\\.') + '`', 'm');
    if (tableRow.test(dormantSrc)) stale.push(bare);
  }
  A.deepStrictEqual(stale, [], 'DORMANT.md still excuses these, but they ARE wired: ' + stale.join(', '));
});

console.log('\n  reachable: ' + reach.size + ' modules · watched: ' + watched.length);
if (bad) { console.error('\n' + bad + ' failing'); process.exit(1); }
console.log('reachability: all green');
