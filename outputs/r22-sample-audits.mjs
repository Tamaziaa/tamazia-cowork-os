// R22·4 — sample audits for one realistic client per new jurisdiction.
// Renders each as an HTML file in outputs/ and runs an element-by-element check
// to compile the R22·5 defect catalogue.
import crypto from 'crypto';
import fs from 'fs';

const SECRET = 'test_secret_key_1234567890abcdef';
const SRC = '/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js';
let src = fs.readFileSync(SRC, 'utf8')
  .replaceAll('__NEON_URL__', 'postgres://u:p@ep-test.neon.tech/db')
  .replaceAll('__TAMAZIA_HMAC_SECRET__', SECRET);
const TMP = '/tmp/worker-r22-4.mjs';
fs.writeFileSync(TMP, src);
const mod = (await import('file://' + TMP)).default;
function sign(slug, hash, l, x) { return crypto.createHmac('sha256', SECRET).update(`${slug}|${hash}|${l}|${x}`).digest('hex').slice(0, 32); }

// Five realistic clients (publicly listed, no fabricated brands).
const samples = [
  {
    slug: 'bsabh', country: 'UAE', sector: 'law-firms', domain: 'bsabh.com',
    company: 'BSA Ahmad Bin Hezeem & Associates', score: 72,
    pointers: [
      { severity: 'P0', citation: 'no UAE PDPL notice', framework: 'UAE_PDPL', category: 'compliance',
        fact: 'no PDPL-compliant data notice on the contact page', location: 'https://bsabh.com/contact',
        evidence: 'The contact page collects name, email and phone but does not link to a UAE PDPL notice covering lawful basis, retention and transfer.',
        fix: 'Publish a PDPL Article 13 notice and link it from every form. Tamazia drafts and verifies.',
        uplift: 'Removes a direct UAE Data Office trigger and lifts the compliance score band.' },
      { severity: 'P0', citation: 'SEO: mobile viewport', framework: 'GOOGLE_EEAT', category: 'technical',
        fact: 'no mobile viewport meta on the homepage', location: 'https://bsabh.com/',
        evidence: 'No <meta name="viewport"> tag detected; mobile-first indexing ranks from the broken mobile render.',
        fix: 'Ship a responsive viewport tag and fix mobile CLS. Tamazia covers in week one.',
        uplift: 'Mobile rankings restored across practice areas, +35-55% organic sessions within 90 days.' },
      { severity: 'P1', citation: 'no DIFC DP notice', framework: 'DIFC_DP_LAW_2020', category: 'compliance',
        fact: 'no DIFC DP Law 5/2020 disclosure on DIFC-facing pages', location: '/difc',
        evidence: 'DIFC-facing service pages do not carry a DIFC Commissioner of Data Protection notice covering controller, retention and rights.',
        fix: 'Add a DIFC DP notice block on every DIFC-facing service page.',
        uplift: 'Closes the DIFC commissioner exposure.' },
      { severity: 'P1', citation: 'PECR cookies', framework: 'UK_PECR', category: 'compliance',
        fact: 'no cookie-consent banner', location: '/',
        evidence: 'No consent management platform detected on the homepage HTML.',
        fix: 'Deploy a CMP with reject-all parity. Tamazia integrates and audits.',
        uplift: 'Eligible for the ICO good-practice defence.' },
      { severity: 'P1', citation: 'AI/search authority', framework: 'GOOGLE_EEAT', category: 'visibility',
        fact: 'no LinkedIn company entity linked from any page', location: '/',
        evidence: 'No LinkedIn URL found in any crawled page. AI search defaults to firms with a complete entity graph.',
        fix: 'Add LinkedIn + Companies House sameAs schema; ship author bylines.',
        uplift: '+15-25% AI citation coverage; entity verified in 60 days.' }
    ]
  },
  {
    slug: 'baker-mckenzie-saudi', country: 'SA', sector: 'law-firms', domain: 'bakermckenzie.com',
    company: 'Baker McKenzie Saudi Arabia', score: 80,
    pointers: [
      { severity: 'P0', citation: 'no Saudi PDPL notice', framework: 'SA_PDPL', category: 'compliance',
        fact: 'no Saudi PDPL data notice on the Riyadh office page', location: '/saudi-arabia',
        evidence: 'The Riyadh office page collects enquiries but does not link to a Saudi PDPL notice.',
        fix: 'Publish a Saudi PDPL notice and link it from the office page.',
        uplift: 'Removes a direct SDAIA exposure trigger.' },
      { severity: 'P0', citation: 'MOJ advertising rules', framework: 'SA_MOJ_REGS', category: 'compliance',
        fact: 'no Saudi MOJ professional-conduct notice on practice pages', location: '/saudi-arabia/services',
        evidence: 'Saudi MOJ rules require specific transparency disclosures on legal-service pages. None detected.',
        fix: 'Add the MOJ-mandated block to every Saudi practice page.',
        uplift: 'Closes the MOJ disciplinary risk.' },
      { severity: 'P1', citation: 'CITC anti-spam', framework: 'SA_CITC', category: 'compliance',
        fact: 'no opt-in toggle on the newsletter form', location: '/subscribe',
        evidence: 'CITC anti-spam rules require explicit prior consent. The newsletter form has no opt-in toggle.',
        fix: 'Add a clear opt-in checkbox and proof-of-consent logging.',
        uplift: 'Closes CITC exposure.' },
      { severity: 'P1', citation: 'SEO: structured data', framework: 'GOOGLE_EEAT', category: 'seo',
        fact: 'no JSON-LD schema on the homepage', location: '/',
        evidence: 'No application/ld+json block detected; AI assistants cannot parse the entity cleanly.',
        fix: 'Implement LegalService + Organization schema with sameAs links.',
        uplift: '+30-45% AI citation coverage.' }
    ]
  },
  {
    slug: 'rajahtannasia', country: 'SG', sector: 'law-firms', domain: 'rajahtannasia.com',
    company: 'Rajah & Tann Asia', score: 84,
    pointers: [
      { severity: 'P0', citation: 'no PDPA notice', framework: 'SG_PDPA', category: 'compliance',
        fact: 'no PDPA-compliant data-handling notice on the contact form', location: '/contact',
        evidence: 'The contact form collects name, email and matter type but does not link to a Singapore PDPA notice.',
        fix: 'Publish a PDPA notice covering purpose, retention, transfers and rights, link it from every form.',
        uplift: 'Removes a direct PDPC trigger and clears the Law Society conduct cross-reference.' },
      { severity: 'P0', citation: 'Law Society practice rules', framework: 'SG_LAW_SOCIETY', category: 'compliance',
        fact: 'no Law Society of Singapore transparency block on the home page', location: '/',
        evidence: 'Singapore Law Society Practice Directions require specific firm-transparency disclosures. None detected on the homepage.',
        fix: 'Add the required block to the footer site-wide.',
        uplift: 'Closes the Law Society disciplinary risk.' },
      { severity: 'P1', citation: 'SEO: thin content', framework: 'GOOGLE_EEAT', category: 'content',
        fact: 'practice-area pages average 380 words', location: '/services',
        evidence: 'Practice-area pages are well below the 1,200-1,500 word threshold for E-E-A-T credibility.',
        fix: 'Build out every practice-area page to 1,200-1,500 regulator-vetted words with named author bylines.',
        uplift: '+40-70% impressions on practice-area terms in 12 weeks.' }
    ]
  },
  {
    slug: 'cyrilshroff', country: 'IN', sector: 'law-firms', domain: 'cyrilshroff.com',
    company: 'Cyril Amarchand Mangaldas', score: 81,
    pointers: [
      { severity: 'P0', citation: 'no DPDP notice', framework: 'IN_DPDP_2023', category: 'compliance',
        fact: 'no DPDP-compliant data-fiduciary notice', location: '/contact',
        evidence: 'Cyril Amarchand collects enquiries through a form that does not link to a DPDP Act 2023 notice.',
        fix: 'Publish a DPDP Act notice covering purpose, retention, consent and rights of the principal.',
        uplift: 'Removes a direct India Data Protection Board exposure.' },
      { severity: 'P0', citation: 'Bar Council advertising', framework: 'IN_BAR_COUNCIL_RULES', category: 'compliance',
        fact: 'practice area pages cite specific outcomes', location: '/practice-areas',
        evidence: 'The Bar Council of India Rules prohibit solicitation; pages with specific case outcomes risk a complaint.',
        fix: 'Revise practice area copy to comply with Bar Council Rules; Aman LLM-reviews the language.',
        uplift: 'Closes the Bar Council disciplinary risk.' },
      { severity: 'P1', citation: 'IT Rules 2021 grievance', framework: 'IN_IT_RULES_2021', category: 'compliance',
        fact: 'no grievance officer contact published', location: '/',
        evidence: 'IT Intermediary Rules 2021 require a grievance officer name + contact on the website. Not detected.',
        fix: 'Publish a grievance officer block in the footer site-wide.',
        uplift: 'Closes the IT Rules safe-harbour gap.' }
    ]
  },
  {
    slug: 'kingandwood', country: 'HK', sector: 'law-firms', domain: 'kwm.com',
    company: 'King & Wood Mallesons (HK)', score: 79,
    pointers: [
      { severity: 'P0', citation: 'no PDPO PICS', framework: 'HK_PDPO', category: 'compliance',
        fact: 'no PDPO Personal Information Collection Statement on the HK office page', location: '/hong-kong',
        evidence: 'HK PDPO requires a PICS at the point of collection. None detected on the HK office contact form.',
        fix: 'Publish a PICS covering purpose, classes of data, retention and access rights.',
        uplift: 'Removes the PCPD enforcement trigger.' },
      { severity: 'P0', citation: 'HK Law Society conduct', framework: 'HK_LAW_SOCIETY', category: 'compliance',
        fact: 'no HK Law Society regulated-by line on the HK office page', location: '/hong-kong',
        evidence: 'HK Solicitors\' Practice Rules require a "regulated by the Law Society of Hong Kong" disclosure on every HK practice page.',
        fix: 'Add the disclosure line to the HK office page and the global footer.',
        uplift: 'Closes the Law Society disciplinary risk.' },
      { severity: 'P1', citation: 'TDO trade descriptions', framework: 'HK_TDO_TRADE_DESCRIPTION', category: 'compliance',
        fact: 'service descriptions cite "best in class" without basis', location: '/services',
        evidence: 'Trade Descriptions Ordinance prohibits unsubstantiated comparative claims on HK-facing service pages.',
        fix: 'Revise language and either remove or substantiate every comparative claim. Tamazia reviews the copy.',
        uplift: 'Closes the HK Customs / TDO exposure.' }
    ]
  }
];

const OUT_DIR = '/sessions/great-hopeful-heisenberg/mnt/outputs/r22-samples';
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHECKLIST = [
  ['eyebrow present', /Personalised regulatory \+ SEO \+ AI visibility audit/],
  ['priority section', /Your (?:priority(?:\s+three|\s+\d+)?|two priorities)/],
  ['Company name', null],   // placeholder — filled per fixture
  ['verbatim evidence block', /What we found, verbatim/],
  ['evidence highlighted', /<mark/],
  ['Location field', /Where on your site/],
  ['The law field', />The law</],
  ['Exposure field', />Exposure</],
  ['Tamazia fix field', />Tamazia fix</],
  ['If fixed field', />If fixed</],
  ['Framework consolidated section', /one box per regulator/],
  ['Framework status 2-col', /Framework status · what works · what's missing/],
  ['Compliance context', /was checked against/],
  ['AI visibility section', /AI search visibility/],
  ['Three pricing tiers', /From £2,500/],
  ['Begin Foundation CTA', /Begin Foundation/],
  ["founder's cal embed", /cal\.com\/tamazia\/strategy-call/],
  ['mobile sticky CTA', /class="mcta no-print"/],
  ['print stylesheet', /@media print/],
  ['proof band: Orchid', /Orchid Hotels/],
  ['proof band: Meraas', /Meraas/],
  ['no generic Sector regulator fallback', /Sector regulator/, true],
  ['no generic Sector exposure fallback', /Sector exposure/, true],
  ['no Manuel / LexQuity mention', /Penadés|LexQuity|Danish|Aditya/, true],
];

const defects = [];
for (const fx of samples) {
  const payload = {
    schema_version: 'v1', domain: fx.domain, sector: fx.sector, country: fx.country,
    framework_version: '7.4.0',
    applicable_frameworks: fx.pointers.map(p => p.framework).concat(['GOOGLE_EEAT']),
    rules: [],
    sections: { cover: { firm: fx.slug } }
  };
  globalThis.fetch = async (urlStr, opts) => {
    const q = JSON.parse(opts.body).query;
    let rows = [];
    if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(payload), fx.domain, fx.sector, fx.country]];
    else if (/FROM leads/.test(q)) rows = [[fx.company, fx.score, JSON.stringify(fx.pointers)]];
    return { ok: true, json: async () => ({ rows }) };
  };
  const future = Math.floor(Date.now() / 1000) + 86400;
  const sig = sign(fx.slug, 'YpHBx5lx', '999', future);
  const r = await mod.fetch(new Request(`https://tamazia.co.uk/audit/${fx.slug}/YpHBx5lx?l=999&x=${future}&sig=${sig}`));
  const body = await r.text();
  const outPath = `${OUT_DIR}/${fx.slug}.html`;
  fs.writeFileSync(outPath, body);
  console.log(`\n=== ${fx.country} · ${fx.company} → ${outPath.replace('/sessions/great-hopeful-heisenberg/mnt/outputs/', '')} ===`);
  console.log(`  HTTP ${r.status} · ${body.length} bytes`);

  let pass = 0, fail = 0;
  // Company name check (custom) — HTML-escape & since the worker calls esc() on it.
  const escCompany = fx.company.replace(/&/g, '&amp;');
  if (body.includes(escCompany)) { pass++; console.log(`  PASS Company name "${fx.company}" present`); }
  else { fail++; defects.push(`[${fx.slug}] Company name "${fx.company}" missing`); console.log(`  FAIL Company name "${fx.company}" missing`); }

  for (const row of CHECKLIST) {
    const [name, re, isNeg] = row;
    if (!re) continue;  // skip placeholder rows
    const matched = re.test(body);
    const ok = isNeg ? !matched : matched;
    if (ok) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; defects.push(`[${fx.slug}] ${name}`); console.log(`  FAIL ${name}`); }
  }

  // Country-specific assertions
  const countrySpecific = {
    UAE: ['UAE Data Office', 'PDPL'],
    SA:  ['SDAIA', 'PDPL'],
    SG:  ['PDPC', 'Singapore'],
    IN:  ['India Data Protection Board', 'DPDP'],
    HK:  ['PCPD', 'PDPO']
  };
  for (const needle of (countrySpecific[fx.country] || [])) {
    if (body.includes(needle)) { pass++; console.log(`  PASS country-needle "${needle}"`); }
    else { fail++; defects.push(`[${fx.slug}] missing country-needle "${needle}"`); console.log(`  FAIL country-needle "${needle}"`); }
  }
  console.log(`  → ${pass} pass / ${fail} fail`);
}

console.log('\n\n=== DEFECT CATALOGUE ===');
if (defects.length === 0) console.log('  (no defects across 5 sample jurisdictions)');
else for (const d of defects) console.log('  · ' + d);
console.log(`\nTotal defects: ${defects.length}`);
process.exit(defects.length === 0 ? 0 : 1);
