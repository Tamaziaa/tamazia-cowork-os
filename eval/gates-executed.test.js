'use strict';
/**
 * EXECUTION, NOT IMPORT. CodeRabbit (#340): "A require() edge does not prove the stage executes."
 *
 * That is the whole statute-rag lesson. statute-rag.js was REQUIRED for months and never CALLED — a require-graph
 * walk would have called it reachable the entire time. Reachability is necessary; it is not sufficient.
 *
 * The only honest proof that a stage RAN is a payload the engine actually produced. So this gate reads a REAL row
 * from audit_pages and asserts the wired stages are ON it:
 *     citation_gate  — every legal claim we print is citable
 *     coverage       — an audit built on a blocked crawl SAYS so
 *     stage_manifest — the record of what actually executed
 *
 * It is engine-version aware: rows minted BEFORE these gates existed are not evidence of a regression, and are
 * reported, not failed. A row minted ON OR AFTER the gates that LACKS them is a hard failure — that is the exact
 * "wired but never called" state this gate exists to make impossible.
 */
const A = require('assert');
const N = process.env.NEON_URL || process.env.DATABASE_URL;
if (!N) { console.log('ok - skipped (no NEON_URL; a missing DB is NOT a passing gate)'); process.exit(0); }

const GATES_LANDED_IN = 'v25.13';   // citation_gate + coverage were wired here

const q = async (sql) => {
  const u = new URL(N);
  const res = await fetch(`https://${u.hostname}/sql`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': N }, body: JSON.stringify({ query: sql }) });
  const j = await res.json();
  if (j.message) throw new Error(j.message);
  return j.rows || [];
};
const verNum = (v) => { const m = /v(\d+)\.(\d+)/.exec(String(v || '')); return m ? Number(m[1]) * 1000 + Number(m[2]) : 0; };

(async () => {
  let bad = 0;
  const t = async (n, fn) => { try { await fn(); console.log('ok ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };

  const rows = await q(`select slug, hash, payload_json->>'engine_version' ev,
      (payload_json ? 'citation_gate') has_citation_gate,
      (payload_json ? 'coverage') has_coverage,
      (payload_json ? 'stage_manifest') has_stage_manifest,
      (payload_json->>'sendable') sendable
    from audit_pages order by generated_at desc limit 25`);

  await t('audit_pages is readable and non-empty (a gate that reads nothing proves nothing)', () => {
    A.ok(rows.length > 0, 'no audit rows at all — nothing to prove execution against');
  });

  const modern = rows.filter((r) => verNum(r.ev) >= verNum(GATES_LANDED_IN));
  console.log(`    (${rows.length} recent rows; ${modern.length} minted on ${GATES_LANDED_IN}+)`);

  await t(`every audit minted on ${GATES_LANDED_IN}+ carries citation_gate and coverage (proof they EXECUTED)`, () => {
    if (!modern.length) {
      console.log(`    NOTE: no ${GATES_LANDED_IN}+ audit exists yet. This gate becomes a real assertion on the next mint.`);
      return;
    }
    const naked = modern
      .filter((r) => r.has_citation_gate !== true || r.has_coverage !== true)
      .map((r) => `${r.slug}/${r.hash} [${r.ev}] citation_gate=${r.has_citation_gate} coverage=${r.has_coverage}`);
    A.deepStrictEqual(naked, [],
      'These audits were minted by an engine that IMPORTS the gates but did not RUN them:\n  ' + naked.join('\n  ') +
      '\n\nThis is the statute-rag class: required for months, never called. Reachability did not catch it. This does.');
  });

  // The stage manifest landed in v25.0. Rows minted before it are HISTORY, not a regression, and failing on them
  // would be a gate that can never go green — which is just a broken gate wearing a serious face.
  const MANIFEST_LANDED_IN = 'v25.0';
  await t(`every audit minted on ${MANIFEST_LANDED_IN}+ carries a stage_manifest (nothing else can prove what ran)`, () => {
    const scoped = rows.filter((r) => verNum(r.ev) >= verNum(MANIFEST_LANDED_IN));
    const naked = scoped.filter((r) => r.has_stage_manifest !== true).map((r) => r.slug + '/' + r.hash + ' [' + r.ev + ']');
    A.deepStrictEqual(naked, [], 'audits with NO stage manifest — we cannot say what executed: ' + naked.join(', '));
  });

  if (bad) { console.error('\n' + bad + ' failing'); process.exit(1); }
  console.log('\ngates-executed: all green');
})();
