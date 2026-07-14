'use strict';
/**
 * REGEX HEALTH. Every rule in the catalogue is a regex that decides whether we accuse a law firm of breaking the
 * law. A regex that cannot match is not a lenient rule — it is a SILENT HOLE, and it reports a confident zero.
 *
 * MEASURED, v25.14: 19 of 671 active rules carried a broken pattern. THREE WERE P0:
 *    UK_GDPR_A13/A13.1.b      `dpo[@\\s]`      -> the DPO-contact disclosure check was DEAD
 *    UK_TRADING_STANDARDS/TS2.1 `vat\\s*(no)`  -> the VAT-number check was DEAD
 *    UK_HMR_2012              `\\bPOM\\b`      -> prescription-only-medicine advertising was DEAD
 *
 * Three failure modes, all silent:
 *   A. DOES NOT COMPILE            — the rule can never fire.
 *   B. OVER-ESCAPED   (\\b, \\d)   — the WORST kind. `\\d` is an ESCAPED BACKSLASH followed by the letter d, so
 *                                    it matches a literal "\dddd" and nothing else. It compiles. It runs. It
 *                                    finds nothing, forever, and reports that as compliance.
 *   C. UNDER-ESCAPED  (d{2,3})     — the backslash was lost; `d{2,3}` matches the LETTER d, not a digit.
 */
const A = require('assert');
// A SKIP IS A CONFIDENT ZERO (CodeRabbit, and it is the third time this lesson has been taught in one session).
// In CI the database is ALWAYS present. If NEON_URL is missing THERE, this gate did not run — and a gate that did
// not run is not a gate that passed. It FAILS. Locally, a developer without a DB gets a loud skip, not a silent one.
const N = process.env.NEON_URL || process.env.DATABASE_URL;
if (!N) {
  if (process.env.CI) {
    console.error('FAIL - NEON_URL is absent in CI. This gate did not run, so it did not pass. A missing DB is not a green build.');
    process.exit(1);
  }
  console.log('ok - SKIPPED LOCALLY (no NEON_URL). This gate did NOT run. It is NOT evidence of a healthy catalogue.');
  process.exit(0);
}

const q = async (sql) => { const u = new URL(N);
  const r = await fetch(`https://${u.hostname}/sql`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': N }, body: JSON.stringify({ query: sql }) });
  const j = await r.json(); if (j.message) throw new Error(j.message); return j.rows || []; };

const OVER  = /\\\\[bdswBDSW]/;
const UNDER = /(^|[^\\A-Za-z0-9\]])[dsw]\{\d/;

(async () => {
  let bad = 0;
  const t = async (n, fn) => { try { await fn(); console.log('ok ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };

  const rows = await q(`select framework_short fw, rule_id, severity sev, coalesce(regex_pattern,'') rx,
    coalesce(trigger_pattern,'') trig, coalesce(regex_elements::text,'') els from compliance_rules where active`);

  const pats = [];
  for (const x of rows) {
    if (x.rx)   pats.push([x, 'regex_pattern', x.rx]);
    if (x.trig) pats.push([x, 'trigger_pattern', x.trig]);
    if (x.els)  { let e = []; try { e = JSON.parse(x.els) || []; } catch (_e) { e = []; }
      for (const el of e) if (el && el.pattern) pats.push([x, `element "${el.label}"`, el.pattern]); }
  }

  await t('the catalogue is reachable (a gate that reads nothing proves nothing)', () => {
    A.ok(rows.length > 500, 'expected the full catalogue, got ' + rows.length);
    A.ok(pats.length > 500, 'expected hundreds of patterns, got ' + pats.length);
  });

  await t('A. every pattern COMPILES (a pattern that does not compile can never fire)', () => {
    const broken = [];
    for (const [x, where, p] of pats) {
      try { new RegExp(p, 'i'); } catch (e) { broken.push(`${x.fw}/${x.rule_id} [${x.sev}] ${where}: ${e.message.slice(0, 60)}`); }
    }
    A.deepStrictEqual(broken, [], broken.length + ' pattern(s) do not compile:\n  ' + broken.join('\n  '));
  });

  await t('B. no pattern is OVER-ESCAPED (`\\\\d` compiles, runs, and matches NOTHING — a confident zero)', () => {
    const over = [];
    for (const [x, where, p] of pats) {
      if (OVER.test(p)) over.push(`${x.fw}/${x.rule_id} [${x.sev}] ${where}: ${(p.match(OVER) || [''])[0]}`);
    }
    A.deepStrictEqual(over, [],
      over.length + ' pattern(s) are OVER-ESCAPED. They compile, they run, and they find NOTHING:\n  ' + over.join('\n  ') +
      '\n\n`\\\\d` is an escaped backslash followed by the letter d. It matches a literal "\\dddd".' +
      '\nThis silently killed THREE P0 checks: DPO contact, VAT number, and prescription-only-medicine advertising.');
  });

  await t('C. no pattern is UNDER-ESCAPED (`d{2,3}` matches the LETTER d, not a digit)', () => {
    const under = [];
    for (const [x, where, p] of pats) {
      if (UNDER.test(p)) under.push(`${x.fw}/${x.rule_id} [${x.sev}] ${where}: ${(p.match(UNDER) || [''])[0].trim()}`);
    }
    A.deepStrictEqual(under, [], under.length + ' pattern(s) lost a backslash:\n  ' + under.join('\n  '));
  });

  if (bad) { console.error('\n' + bad + ' failing'); process.exit(1); }
  console.log(`\nregex-health: all green (${pats.length} patterns across ${rows.length} active rules)`);
})();
