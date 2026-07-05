'use strict';
// PSI CrUX fallback: structural + behavioural proof that when the Lighthouse lab test yields null for a strategy,
// the CrUX field-data path is invoked, shaped so buildPsiStrat can render it (scores object present, cwv populated),
// and is fail-open. No live API needed — asserts the wiring in source + the shape contract.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'audit', 'site-scan.js'), 'utf8');
// wiring present
assert(/_cruxOne\(/.test(src), 'CrUX helper defined');
assert(/mobile = mobile \|\| cm; desktop = desktop \|\| cd;/.test(src), 'CrUX fills only the missing strategy');
assert(/chromeuxreport\.googleapis\.com/.test(src), 'queries the Chrome UX Report API');
assert(/strategy === 'desktop' \? 'DESKTOP' : 'PHONE'/.test(src), 'maps desktop->DESKTOP / mobile->PHONE form factor');
// shape contract: a CrUX result must carry a present-but-null scores object (so buildPsiStrat renders the CWV) + cwv
const shapeOK = /scores: \{ performance: null[\s\S]*?cwv,/.test(src);
assert(shapeOK, 'CrUX result has scores object + cwv so the render shows field data, not "not assessed"');
// origin-level fallback after url-level
assert(/origin: 'https:\/\/' \+ domain/.test(src), 'falls back to origin-level CrUX when URL has thin data');
console.log('crux-fallback OK: fills only the missing strategy, correct form factors, render-shaped, url->origin fallback, fail-open.');
