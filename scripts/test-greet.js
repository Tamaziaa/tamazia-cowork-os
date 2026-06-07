#!/usr/bin/env node
'use strict';
// A4f unit test for the greeting swap in push-to-mystrika.js. Loads the SAME exported greet the
// script uses (cannot drift). Fixtures are REAL stored touch-0 bodies (outreach_drafts, touch=0).
const assert = require('assert');
const { greet } = require('./push-to-mystrika.js');

// Fixture 1 — real stored touch-0 body (bare "Name," opener, as rendered by S064 render.js)
const real = "Jessica,\n\nWe're publishing \"Best family law solicitors in London 2026\" and Streathers Solicitors is shortlisted.\n\nWhere you rank today for the searches that matter most:";
const out1 = greet(real, 'Amara');
assert.ok(out1.startsWith('Amara,\n\n'), 'real fixture: secondary first name swapped in');
assert.ok(out1.includes('Streathers Solicitors'), 'real fixture: body untouched beyond greeting');

// Fixture 2 — real stored "Team," opener; empty first -> configured fallback "there"
const team = "Team,\n\nWe're publishing \"Best UK boutique hotels 2026\" and Oetkerhotels is shortlisted.";
assert.ok(greet(team, '').startsWith('there,\n'), 'Team, -> there,');

// Fixture 3 — salutation form is preserved
assert.strictEqual(greet('Hi Jane,\nquick one', 'Sam'), 'Hi Sam,\nquick one', 'Hi Name, form');

// Fixture 4 — GUARD: a body that does NOT open with a greeting line is left unchanged
// (comma mid-sentence: greeting comma must end its line)
const guard = 'Tamazia, the agency, was shortlisted for an award.\n\nJessica,';
assert.strictEqual(greet(guard, 'Sam'), guard, 'non-greeting opener unchanged');

// Fixture 5 — empty/null bodies pass through
assert.strictEqual(greet('', 'Sam'), '');
assert.strictEqual(greet(null, 'Sam'), null);

console.log('greet unit test: 5/5 PASS');
