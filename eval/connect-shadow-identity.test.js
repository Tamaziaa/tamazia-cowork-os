'use strict';
// Phase 2.1 — refactor-identity guard. connect()'s attachment output across the full decision matrix must match the
// committed baseline hash. Any change to connect's ATTACHMENT behaviour must be a deliberate, reviewed hash update.
const assert = require('assert');
if (!process.env.NEON_URL) { console.log('NEON unavailable — shadow-identity test skipped.'); process.exit(0); }
const { hash, cells } = require('./_shadow-connect.js');
const BASELINE = 'c1bacfc2abbde20546912c7877cef5e4f60d8446c5f4530b12e01cdceb17ecdf';
assert.strictEqual(cells, 1998, 'shadow matrix cell count changed');
assert.strictEqual(hash, BASELINE, `connect() attachment output changed (got ${hash}); if intentional, update BASELINE with review`);
console.log(`connect shadow-identity OK: ${cells} cells, hash matches baseline.`);
