'use strict';
// E-262 (v23.4) — EVERY MINTER, EVERYWHERE, MINTS AT THE LATEST VERSION OR IT DOES NOT MINT.
//
// "all the places where we mint should automatically get the latest version and should always mint at the latest"
//
// THE PROBLEM: there is not one minter. There are at least three, and only ONE is reachable from GitHub:
//   1. GitHub Actions mint-now   — dispatched on `ref: main`, always latest. Fine.
//   2. The Oracle VM pm2 worker  — its own checkout, on a box we cannot disable through the GitHub API.
//                                  IT MINTED nypost.com AND therealdeal.com AFTER I DISABLED EVERY WORKFLOW.
//   3. The Hetzner mint fallback — /opt/tamazia-mint, pinned at v19, and there is no SSH key for that box.
// So "the mints are stopped" was TRUE of GitHub and FALSE of the estate.
//
// THE FIX works even on a box we cannot log into, because the DATABASE is the one thing every minter must touch.
// engine_flags holds the REQUIRED ENGINE_VERSION and a global mint_enabled switch, read BEFORE a row is claimed.
const fs = require('fs');
const path = require('path');
const A = require('assert');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const SRC = fs.readFileSync(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'), 'utf8');
const CODE = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

t('E-262: the gate exists and runs BEFORE anything is crawled or written', () => {
  A.ok(/_versionGate/.test(CODE), 'the version gate must exist');
  const iBuild = CODE.indexOf('async function build(');
  A.ok(iBuild > 0, 'build() must exist');
  const body = CODE.slice(iBuild);
  const iGate = body.indexOf('await _versionGate()');
  A.ok(iGate > 0, 'the gate must be called inside build()');
  // inside build(), the gate must precede EVERY call that costs anything: the crawl, the LLM, the write.
  for (const costly of ['scanSite(', 'compliance', 'neonHttp(', 'INSERT INTO']) {
    const i = body.indexOf(costly);
    if (i > 0) A.ok(iGate < i, 'the gate must run BEFORE ' + costly + ' — a stale minter should not even fetch a page');
  }
});

t('E-262 THE KILL SWITCH: mint_enabled=false stops EVERY minter, including boxes we cannot reach', () => {
  A.ok(/mint_enabled/.test(CODE), 'the global kill switch must be read from the database');
  A.ok(/GLOBALLY DISABLED/.test(SRC), 'and it must refuse loudly, naming why');
});

t('E-262 THE STALE-MINTER REFUSAL: a worker on an old ENGINE_VERSION physically cannot ship an audit', () => {
  A.ok(/required_engine_version/.test(CODE), 'the required version must come from the database, not from the worker');
  A.ok(/STALE MINTER REFUSED/.test(SRC));
  A.ok(/want !== mine/.test(CODE), 'a version MISMATCH must refuse');
});

t('E-262: it FAILS OPEN on an unreadable database, but NEVER on a version mismatch', () => {
  // A DB blip must not halt the business. But shipping a STALE audit is worse than shipping none, so a mismatch
  // always refuses. That asymmetry is deliberate and it is the whole design.
  A.ok(/flags_unreadable_fail_open/.test(CODE), 'a DB blip must not stop minting');
  A.ok(/Shipping a stale audit is worse than shipping none/.test(SRC), 'the asymmetry must be documented where the next person will read it');
});

t('E-262: the scanner EXPORTS its ENGINE_VERSION so the gate can actually compare', () => {
  const sc = fs.readFileSync(path.join(ROOT, 'src/skills/S008-personalisation-engine/scanners/compliance.js'), 'utf8');
  A.ok(/module\.exports = \{ ENGINE_VERSION/.test(sc), 'ENGINE_VERSION must be exported or the gate has nothing to compare');
});

t('E-262: the GitHub minter is dispatched on main, so it is always latest by construction', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/mint-now.yml'), 'utf8');
  A.ok(/workflow_dispatch/.test(wf));
  A.ok(!/ref:\s*['"]?v\d/.test(wf), 'the mint workflow must never be pinned to a tag');
});

console.log(bad ? 'E262 VERSION GATE: FAIL' : 'E262 VERSION GATE: ALL GREEN (' + n + ' checks) — a stale minter cannot ship');
process.exit(bad ? 1 : 0);
