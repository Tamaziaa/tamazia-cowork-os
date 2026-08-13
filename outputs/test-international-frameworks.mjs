// Test harness for R22·1 — international framework rendering on the audit worker.
// Pushes simulated scraped pointers tagged with UAE/Saudi/Singapore/India/HK frameworks
// and asserts the worker renders the right regulator names, URLs and £ exposure labels.
import crypto from 'crypto';
import fs from 'fs';

const SECRET = 'test_secret_key_1234567890abcdef';
const SRC = '/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js';
let src = fs.readFileSync(SRC, 'utf8')
  .replaceAll('__NEON_URL__', 'postgres://u:p@ep-test.neon.tech/db')
  .replaceAll('__TAMAZIA_HMAC_SECRET__', SECRET);
const TMP = '/tmp/worker-intl-test.mjs';
fs.writeFileSync(TMP, src);

// Build a fixture per jurisdiction with one P0 finding tagged to a country-specific framework.
const fixtures = [
  {
    country: 'UAE', domain: 'meraas.ae', sector: 'real-estate', firm: 'meraas',
    expects: ['RERA', 'AED 50,000+', 'Trakheesi', 'UAE Data Office', 'Up to AED 5M'],
    scraped: [
      { severity: 'P0', citation: 'no Trakheesi permit', framework: 'UAE_TRAKHEESI', fact: 'no Trakheesi permit number visible on the marketing creative pages', location: 'https://meraas.ae/', evidence: 'Dubai Land Department Trakheesi permits must appear on every advertising piece. No permit number was detected on any page crawled.', fix: 'Add the Trakheesi permit number to every marketing creative. Tamazia verifies the line.', uplift: 'Removes a direct RERA exposure trigger.' },
      { severity: 'P0', citation: 'no UAE PDPL notice', framework: 'UAE_PDPL', fact: 'no PDPL-compliant data-collection notice on forms', location: 'https://meraas.ae/contact', evidence: 'UAE Federal Data Protection Law 45/2021 requires a notice at the point of data collection. None was detected.', fix: 'Publish a PDPL notice covering lawful basis, retention, transfers and rights.', uplift: 'Closes the PDPL exposure.' },
      { severity: 'P1', citation: 'SEO: meta description', framework: 'GOOGLE_EEAT', fact: 'no meta description on homepage', location: '/', evidence: 'No meta description tag found.', fix: 'Author one.', uplift: '+18-25% snippet CTR.' }
    ]
  },
  {
    country: 'SA', domain: 'cma.org.sa', sector: 'finance', firm: 'cma-saudi',
    expects: ['SAMA', 'Up to SAR 25M', 'SDAIA'],
    scraped: [
      { severity: 'P0', citation: 'no PDPL notice', framework: 'SA_PDPL', fact: 'no Saudi PDPL data-handling notice', location: '/contact', evidence: 'Saudi PDPL requires a notice at point of collection. None detected.', fix: 'Publish a PDPL notice.', uplift: 'Closes SDAIA exposure.' },
      { severity: 'P1', citation: 'CMA disclosure missing', framework: 'SA_CMA_KSA', fact: 'no CMA disclosure block on investor-facing pages', location: '/', evidence: 'CMA disclosure rules require specific disclaimers. Not detected.', fix: 'Add CMA disclosure block.', uplift: 'Closes CMA exposure.' },
      { severity: 'P1', citation: 'SAMA prudential disclosure', framework: 'SA_SAMA', fact: 'no SAMA-mandated banking-conduct block', location: '/', evidence: 'SAMA conduct rules require specific consumer protection disclosures. Not detected.', fix: 'Add the SAMA conduct block.', uplift: 'Closes SAMA exposure.' }
    ]
  },
  {
    country: 'SG', domain: 'lawsociety.org.sg', sector: 'law-firms', firm: 'lawsoc-sg',
    expects: ['PDPC', 'Up to SGD 1M', 'Law Society of Singapore'],
    scraped: [
      { severity: 'P0', citation: 'no PDPA notice', framework: 'SG_PDPA', fact: 'no PDPA-compliant data notice', location: '/contact', evidence: 'PDPA requires a notice at the point of collection. None detected.', fix: 'Publish a PDPA notice.', uplift: 'Closes PDPA exposure.' },
      { severity: 'P1', citation: 'Law Society conduct', framework: 'SG_LAW_SOCIETY', fact: 'no required Singapore-Law-Society disclosures', location: '/', evidence: 'Practice Directions require specific transparency disclosures. None detected.', fix: 'Add the required block.', uplift: 'Closes Law Society exposure.' }
    ]
  },
  {
    country: 'IN', domain: 'sebi.gov.in', sector: 'finance', firm: 'sebi-test',
    expects: ['SEBI', '₹250 crore', 'India Data Protection Board'],
    scraped: [
      { severity: 'P0', citation: 'no DPDP notice', framework: 'IN_DPDP_2023', fact: 'no DPDP-compliant data-fiduciary notice', location: '/contact', evidence: 'DPDP Act 2023 requires a notice at the point of collection. None detected.', fix: 'Publish a DPDP notice.', uplift: 'Closes DPDP exposure.' },
      { severity: 'P1', citation: 'SEBI disclosure missing', framework: 'IN_SEBI', fact: 'no SEBI investor-warning block', location: '/', evidence: 'SEBI rules require specific investor disclosures. Not detected.', fix: 'Add SEBI block.', uplift: 'Closes SEBI exposure.' }
    ]
  },
  {
    country: 'HK', domain: 'hklawsoc.org.hk', sector: 'law-firms', firm: 'hk-law-soc',
    expects: ['PCPD', 'Up to HKD 1M', 'Law Society of Hong Kong'],
    scraped: [
      { severity: 'P0', citation: 'no PDPO notice', framework: 'HK_PDPO', fact: 'no PDPO data-handling notice', location: '/contact', evidence: 'Hong Kong PDPO requires a Personal Information Collection Statement (PICS). None detected.', fix: 'Publish a PICS.', uplift: 'Closes PDPO exposure.' },
      { severity: 'P1', citation: 'Solicitors Practice Rules', framework: 'HK_LAW_SOCIETY', fact: 'no required HK Law Society disclosures', location: '/', evidence: 'Practice rules require specific transparency disclosures. None detected.', fix: 'Add the required block.', uplift: 'Closes Law Society exposure.' }
    ]
  }
];

const TMP_PATH = '/tmp/worker-intl-test.mjs';
const mod = (await import('file://' + TMP_PATH)).default;
function sign(slug, hash, l, x) { return crypto.createHmac('sha256', SECRET).update(`${slug}|${hash}|${l}|${x}`).digest('hex').slice(0, 32); }

let totalPass = 0, totalFail = 0;
for (const fx of fixtures) {
  console.log('\n===', fx.country, '·', fx.domain, '===');
  const payload = {
    schema_version: 'v1', domain: fx.domain, sector: fx.sector, country: fx.country,
    framework_version: '7.4.0',
    applicable_frameworks: fx.scraped.map(s => s.framework).concat(['GOOGLE_EEAT']),
    rules: [],
    sections: { cover: { firm: fx.firm } }
  };
  const lead = { company: fx.firm, quality_score: 70, pointers: JSON.stringify(fx.scraped) };
  globalThis.fetch = async (urlStr, opts) => {
    const q = JSON.parse(opts.body).query;
    let rows = [];
    if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(payload), payload.domain, payload.sector, payload.country]];
    else if (/FROM leads/.test(q)) rows = [[lead.company, lead.quality_score, lead.pointers]];
    return { ok: true, json: async () => ({ rows }) };
  };
  const slug = fx.firm, hash = 'YpHBx5lx', l = '999';
  const future = Math.floor(Date.now() / 1000) + 86400;
  const sig = sign(slug, hash, l, future);
  const r = await mod.fetch(new Request(`https://tamazia.co.uk/audit/${slug}/${hash}?l=${l}&x=${future}&sig=${sig}`));
  const body = await r.text();
  let ok = 0, fail = 0;
  const chk = (cond, name) => { if (cond) { ok++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
  chk(r.status === 200, '200 status');
  for (const ex of fx.expects) chk(body.includes(ex), `contains "${ex}"`);
  chk(!/Sector regulator/.test(body), 'no generic "Sector regulator" fallback');
  chk(!/Sector exposure/.test(body), 'no generic "Sector exposure" fallback');
  totalPass += ok; totalFail += fail;
}

console.log(`\nRESULT: ${totalPass} pass / ${totalFail} fail`);
process.exit(totalFail ? 1 : 0);
