'use strict';
/**
 * THE ENGINE VERSION IS A PROPERTY OF THE CODE, NOT OF THE ENVIRONMENT.
 *
 * The database holds a stale-worker lock: a row whose payload carries an ENGINE_VERSION other than the one the
 * estate requires is rejected outright, whatever code wrote it, wherever it runs. That lock is the last line of
 * defence against an unreachable box (the Oracle VM, the Hetzner fallback) shipping an audit built by old logic.
 *
 * It was defeated by an environment variable. `.env` carries COMPLIANCE_ENGINE_VERSION, and every mint workflow
 * exports the whole of `.env` AFTER the job's own env block. So a stale value in the secret PINNED a fresh
 * checkout: v25 code built a payload stamped v24, the gate correctly rejected it, and the mint failed with
 * "audit_pages INSERT failed - no row written". Five audits could not be delivered because of it.
 *
 * An env var that can rename the engine's own version is a footgun in both directions: it can make a fresh
 * checkout look stale, and - far worse - a stale checkout look fresh, which silently disarms the lock entirely.
 *
 * E-273 already caught that .env overrides the workflow, and re-asserted MINT_CONCURRENCY and MINT_BUILD_TIMEOUT_MS.
 * It missed this one. Fixing one door is not fixing the bug.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const files = fs.readdirSync(WF).filter((f) => f.endsWith('.yml'));
const isMinter = (s) => /mint-worker\.js|remint|engine-cycle/.test(s);
const loadsEnv = (s) => /done < \.env/.test(s);

t('no minting workflow lets .env pin the engine version', () => {
  const guilty = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(WF, f), 'utf8');
    if (!isMinter(s) || !loadsEnv(s)) continue;
    if (!/unset COMPLIANCE_ENGINE_VERSION/.test(s)) guilty.push(f);
  }
  A.strictEqual(guilty.length, 0,
    'These workflows source .env and then run a minter WITHOUT unsetting COMPLIANCE_ENGINE_VERSION:\n  '
    + guilty.join('\n  ')
    + '\nA stale value in the secret will pin a fresh checkout, the DB stale-worker gate will reject every row, '
    + 'and the mint will fail with "audit_pages INSERT failed - no row written". Add: unset COMPLIANCE_ENGINE_VERSION');
});

t('compliance.js is the single source of the engine version', () => {
  const p = path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js');
  const s = fs.readFileSync(p, 'utf8');
  const m = s.match(/COMPLIANCE_ENGINE_VERSION \|\| '([^']+)'/);
  A.ok(m, 'no ENGINE_VERSION literal in compliance.js');
  const v = m[1];
  // every literal in the file must agree - two different defaults is two different engines
  const all = [...s.matchAll(/COMPLIANCE_ENGINE_VERSION \|\| '([^']+)'/g)].map((x) => x[1]);
  A.strictEqual(new Set(all).size, 1, 'compliance.js declares MORE THAN ONE default engine version: ' + [...new Set(all)].join(', '));
  console.log('   (engine version = ' + v + ')');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
