'use strict';
// Phase 2.1 — refactor-identity guard. connect()'s attachment output across the full decision matrix must match the
// committed baseline hash. Any change to connect's ATTACHMENT behaviour must be a deliberate, reviewed hash update.
const assert = require('assert');
if (!process.env.NEON_URL) { console.log('NEON unavailable — shadow-identity test skipped.'); process.exit(0); }
const { hash, cells } = require('./_shadow-connect.js');
const BASELINE = 'a8ab1a9fbbff9efa9ad844dbee85cc60cce814b833da6c96fc2ad425c51f2cfe';
assert.strictEqual(cells, 1998, 'shadow matrix cell count changed');
assert.strictEqual(hash, BASELINE, `connect() attachment output changed (got ${hash}); if intentional, update BASELINE with review`);
console.log(`connect shadow-identity OK: ${cells} cells, hash matches baseline.`);
