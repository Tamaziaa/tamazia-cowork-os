'use strict';
/**
 * ACTUALLY RUN THE MINT.
 *
 * Two consecutive bugs killed every mint, and BOTH were runtime scope errors that a full green eval suite could
 * not see, because NOT ONE EVAL EVER EXECUTES buildPayload():
 *
 *   1. ReferenceError: _manifest is not defined              (declared in buildPayload, used in build)
 *   2. Cannot access '_manifest' before initialization       (const in the temporal dead zone)
 *
 * 77 tests passed through both. They assert on source text and pure helpers. A suite that never CALLS the function
 * cannot see an exception inside it. That is a hole in the strategy, not bad luck.
 *
 * This test calls buildPayload for real. It does NOT require the network, a database, or an LLM to succeed - it
 * only requires that the function does not blow up on its own scope. Network/DB failures are EXPECTED here and are
 * fine; a ReferenceError or a TDZ error is not, and never will be again.
 */
const A = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const FATAL = [
  /is not defined/i,                    // ReferenceError - a symbol used out of scope
  /before initialization/i,             // TDZ - a const used above its declaration
  /is not a function/i,                 // a require that returned the wrong shape
  /Cannot read propert(y|ies) of undefined/i,
];

(async () => {
  const { buildPayload } = require(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'));
  A.strictEqual(typeof buildPayload, 'function', 'build.js does not export buildPayload');

  let err = null;
  try {
    // A domain that will not resolve. Every network stage fails; that is the point. What must NOT happen is the
    // function tripping over its own scope before it even gets there.
    await buildPayload({
      domain: 'invalid.tamazia-smoke-probe.test',
      sector: 'legal',
      country: 'UK',
      company: 'Smoke Probe',
      env: Object.assign({}, process.env, { MINT_BUILD_TIMEOUT_MS: '20000' }),
    });
  } catch (e) {
    err = e;
  }

  if (err) {
    const msg = String((err && err.message) || err);
    const fatal = FATAL.find((rx) => rx.test(msg));
    A.ok(!fatal, 'buildPayload threw a SCOPE/WIRING error, not an environment error:\n  ' + msg
      + '\n\nThis is the class that killed the mint twice. A network or database failure here is fine and expected; '
      + 'a ReferenceError, a temporal-dead-zone error, or "is not a function" means the code cannot run at all.');
    console.log('ok 1 buildPayload ran; it failed only on the environment (expected): ' + msg.slice(0, 70));
  } else {
    console.log('ok 1 buildPayload ran to completion');
  }
  console.log('\n1/1 passed');
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
