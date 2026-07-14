'use strict';
/**
 * LEGAL DATA GOVERNANCE. Every legal claim we ship carries its authority.
 *
 * We send law firms a document that accuses them of breaching specific law and quotes a specific penalty. Two
 * things must therefore be true of every rule in the catalogue, always:
 *
 *   1. It cites its authority (citation_url). A rule with no citation is an accusation with no law behind it.
 *   2. If it quotes a fine, that figure has a source (fine_source_url). An unsourced number on a legal document
 *      is exactly what we fine other firms for under CAP 3.7.
 *
 * This is not theoretical. We shipped SRA_TR_PRICES_PI - "solicitors must publish prices for personal injury" -
 * which is NOT in the SRA Transparency Rules at all. We accused firms of breaching a rule that does not cover
 * their work. And PECR carried GBP 500,000 for months after the Data (Use and Access) Act 2025 raised the cap to
 * GBP 17.5m: we were understating real exposure by 35x.
 *
 * Skips when NEON_URL is absent (local dev), because a missing DB must not be reported as a clean catalogue.
 */
const A = require('assert');
// A SKIP IS A CONFIDENT ZERO. In CI the database is ALWAYS present; if NEON_URL is missing THERE, this gate did
// not run, and a gate that did not run is not a gate that passed.
const N = process.env.NEON_URL || process.env.DATABASE_URL;
if (!N) {
  if (process.env.CI) {
    console.error('FAIL - NEON_URL is absent in CI. This gate did not run, so it did not pass.');
    process.exit(1);
  }
  console.log('ok - SKIPPED LOCALLY (no NEON_URL). This gate did NOT run. It is NOT a clean catalogue.');
  process.exit(0);
}

const q = async (sql) => {
  const u = new URL(N);
  const res = await fetch(`https://${u.hostname}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': N },
    body: JSON.stringify({ query: sql }),
  });
  const j = await res.json();
  if (j.message) throw new Error(j.message);
  return j.rows || [];
};

(async () => {
  let bad = 0;
  const t = async (name, fn) => { try { await fn(); console.log('ok ' + name); } catch (e) { bad++; console.error('FAIL ' + name + ': ' + e.message); } };

  await t('every ACTIVE rule cites its authority', async () => {
    const r = await q("select count(*)::int n from compliance_rules where active and (citation_url is null or citation_url='')");
    A.strictEqual(r[0].n, 0, r[0].n + ' active rules have NO citation_url. A rule with no citation is an accusation with no law behind it.');
  });

  await t('every fine we quote has a source URL', async () => {
    const r = await q("select count(*)::int n from compliance_rules where active and (fine_high_native is not null or fine_high_gbp is not null) and (fine_source_url is null or fine_source_url='')");
    A.strictEqual(r[0].n, 0, r[0].n + ' rules quote a FINE with no fine_source_url. An unsourced number on a legal document is what we fine other firms for.');
  });

  await t('no rule cites a REPEALED instrument', async () => {
    // Germany: the TMG was repealed 14 May 2024 and replaced by the DDG. France: LCEN art. 6 III was removed on
    // 23 May 2024 by the SREN law (n 2024-449); editor identification now lives in art. 1-1. Citing a repealed
    // provision to a firm in its own jurisdiction is itself a credibility event - in Germany, an Abmahnung risk.
    const r = await q("select rule_id from compliance_rules where active and (citation_url ilike '%/tmg/%' or citation_url ilike '%telemediengesetz%' or citation_url ilike '%LEGIARTI000042038977%')");
    A.strictEqual(r.length, 0, 'cites a repealed instrument: ' + r.map((x) => x.rule_id).join(', '));
  });

  await t('PECR carries the POST-DUAA cap, not the repealed GBP 500k', async () => {
    // The Data (Use and Access) Act 2025 raised the PECR maximum from GBP 500,000 to GBP 17.5m or 4% of global
    // turnover, IN FORCE 5 February 2026. Verified live against legislation.gov.uk and four independent legal
    // commentaries. We shipped the repealed figure for months: a 35x UNDERSTATEMENT of the client's real exposure
    // on the single most common breach we find. Understating exposure is not a safe error - it is the reason a
    // managing partner does nothing.
    const r = await q("select count(*)::int n from compliance_rules where active and framework_short in ('UK_PECR','UK_ICO_COOKIES') and fine_high_gbp = 500000");
    A.strictEqual(r[0].n, 0, r[0].n + ' PECR/cookie rules still carry the REPEALED GBP 500,000 cap. The DUAA 2025 cap is GBP 17,500,000.');
  });

  console.log(bad ? '\nFAILED' : '\nall provenance checks passed');
  process.exit(bad ? 1 : 0);
})();
