'use strict';
// Phase 2.1 — refactor-identity guard. connect()'s attachment output across the full decision matrix must match the
// committed baseline hash. Any change to connect's ATTACHMENT behaviour must be a deliberate, reviewed hash update.
const assert = require('assert');
if (!process.env.NEON_URL) { console.log('NEON unavailable — shadow-identity test skipped.'); process.exit(0); }
const { hash, cells } = require('./_shadow-connect.js');
const BASELINE = 'dde4004f9632171296289c43ef57b31da147a4dfeb5cb103f0aeee8f8b824492';
assert.strictEqual(cells, 1998, 'shadow matrix cell count changed');
assert.strictEqual(hash, BASELINE, `connect() attachment output changed (got ${hash}); if intentional, update BASELINE with review`);
console.log(`connect shadow-identity OK: ${cells} cells, hash matches baseline.`);
