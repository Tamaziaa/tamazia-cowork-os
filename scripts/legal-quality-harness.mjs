// PERMANENT legal-quality harness. Runs the live compliance engine on a fixed golden set spanning sectors +
// jurisdictions and asserts the quality invariants from the roadmap (Phase 0.2). Run after every phase to catch
// regressions and measure restoration. Read-only (no DB writes). Usage: NEON_URL=... node scripts/legal-quality-harness.mjs
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const { scan } = await import(path.join(REPO, 'src/skills/S008-personalisation-engine/scanners/compliance.js'));

// Golden set: expected_regulators = framework-code prefixes that MUST be assessable for this firm (attached at minimum;
// ideally a grounded finding OR a screened-intelligence block). issuer/child flags drive false-positive checks.
const GOLDEN = [
  { domain: 'rashidlaw.co.uk',     sector: 'law-firms',  country: 'UK', expect: ['UK_SRA', 'UK_DPA_2018', 'UK_PECR', 'UK_COMPANIES_ACT'], issuer: false, child: false },
  { domain: 'coutts.com',          sector: 'finance',    country: 'UK', expect: ['UK_FCA_CONDUCT', 'UK_DPA_2018', 'UK_PECR'],            issuer: false, child: false },
  { domain: 'towerclinicuae.com',  sector: 'dental',     country: 'AE', expect: ['UAE_DHA', 'UAE_PDPL'],                                 issuer: false, child: false },
  { domain: 'royalarmouriesevents.co.uk', sector: 'hospitality', country: 'UK', expect: ['UK_DPA_2018', 'UK_PECR', 'UK_CMA'],            issuer: false, child: false },
  { domain: 'bnsluxury.com',       sector: 'real-estate', country: 'US', expect: ['US_FAIR_HOUSING', 'US_FTC'],                          issuer: false, child: false },
];
const NON_FINING = /EQUALITY|GOOGLE_EEAT|ASA|RICS|ABI|GMC|GDC|VOLUNTARY|ACCA|ICAEW|CE_PLUS/i;

function check(domain, r) {
  const out = [];
  const findings = r.findings || r.pointers || [];
  const attached = (r.frameworks || []).map(String);
  const fwWithFinding = new Set(findings.map(f => String(f.framework || f.citation || '')));
  const g = GOLDEN.find(x => x.domain === domain);
  // (a) expected regulators assessable (attached)
  for (const e of g.expect) {
    const isAttached = attached.some(a => a.startsWith(e));
    const hasFinding = [...fwWithFinding].some(a => a.startsWith(e));
    out.push({ k: `regulator ${e}`, ok: isAttached, note: isAttached ? (hasFinding ? 'attached+finding' : 'attached, no finding (screened)') : 'MISSING' });
  }
  // (b) every finding evidence-grounded
  const ungrounded = findings.filter(f => f.kind !== 'signal' && !(String(f.evidence_quote || '').trim() || (f.absence_evidence && (f.absence_evidence.nearest_quote || f.absence_evidence.state))));
  out.push({ k: 'all findings evidence-grounded', ok: ungrounded.length === 0, note: ungrounded.length ? `${ungrounded.length} ungrounded (${[...new Set(ungrounded.map(f=>f.framework||f.citation))].slice(0,4).join(',')})` : 'ok' });
  // (c) no fabricated penalty on a non-fining framework
  const fab = findings.filter(f => NON_FINING.test(String(f.framework || f.citation || '')) && (f.fine_high_gbp || f.fine_low_gbp));
  out.push({ k: 'no fabricated fine on non-fining body', ok: fab.length === 0, note: fab.length ? fab.map(f=>f.framework||f.citation).join(',') : 'ok' });
  // (d) MAR only on issuers
  const mar = findings.some(f => /MAR/.test(String(f.framework || f.citation || '')));
  out.push({ k: 'MAR gated to issuers', ok: !mar || g.issuer, note: mar ? (g.issuer ? 'issuer ok' : 'FALSE POSITIVE (non-issuer)') : 'absent' });
  // (e) children's/age code only on child-audience
  const child = findings.some(f => /AADC|CHILDREN|_AGE/.test(String(f.framework || f.citation || '')) || /age.appropriate|children.s code/i.test(String(f.desc || f.description || '')));
  out.push({ k: "children's-code gated to child audience", ok: !child || g.child, note: child ? (g.child ? 'ok' : 'OVER-ATTACHED') : 'absent' });
  return { findings: findings.length, attached: attached.length, out };
}

let totalFail = 0;
for (const g of GOLDEN) {
  try {
    const r = await scan({ domain: g.domain, sector: g.sector, country: g.country, cache_max_age: 0 });
    const res = check(g.domain, r);
    const fails = res.out.filter(c => !c.ok).length; totalFail += fails;
    console.log(`\n### ${g.domain} [${g.sector}/${g.country}] — findings=${res.findings} attached=${res.attached} — ${fails} fail(s)`);
    for (const c of res.out) console.log(`   ${c.ok ? 'PASS' : 'FAIL'}  ${c.k} — ${c.note}`);
  } catch (e) { console.log(`\n### ${g.domain} — ENGINE ERROR: ${String(e.message).slice(0, 120)}`); totalFail += 99; }
}
console.log(`\n==== ${totalFail} total quality-check failures across ${GOLDEN.length} golden firms ====`);
