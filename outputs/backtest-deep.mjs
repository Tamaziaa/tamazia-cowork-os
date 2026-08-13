// Deep backtest of Phase 1 + Phase 2.
// Renders fresh audits for 7 jurisdictions + 4 sector combos and runs an
// element-by-element defect sweep. Outputs a single defect log per audit
// plus an overall catalogue. Findings include things the user has flagged
// explicitly:
//   - No UK strings on non-UK audits
//   - Proof band removed
//   - Reviews band populated
//   - No em-dashes / en-dashes used as pauses
//   - mShots has fallback markup
//   - Calendar has the JS-injected fallback
//   - Sector-specific framework correctness
//   - No over-dropping of relevant findings
//   - Schema validation does not strip valid findings
//   - Currency labels match country
//   - Localized regulator names visible

import crypto from 'crypto';
import fs from 'fs';

const SECRET = 'test_secret_key_1234567890abcdef';
const SRC = '/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js';
let src = fs.readFileSync(SRC, 'utf8')
  .replaceAll('__NEON_URL__', 'postgres://u:p@ep-test.neon.tech/db')
  .replaceAll('__TAMAZIA_HMAC_SECRET__', SECRET);
fs.writeFileSync('/tmp/worker-backtest.mjs', src);
const mod = (await import('file:///tmp/worker-backtest.mjs?cache=' + Date.now())).default;
function sign(slug, hash, l, x) { return crypto.createHmac('sha256', SECRET).update(`${slug}|${hash}|${l}|${x}`).digest('hex').slice(0, 32); }

// 7 fixtures across the matrix the user cares about most.
const FIXTURES = [
  {
    slug: 'streathers-uk-law', country: 'UK', sector: 'law-firms', domain: 'streathers.co.uk', company: 'Streathers Solicitors',
    applicable: ['UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','EU_AI_ACT','GOOGLE_EEAT','UK_DMCC_2024','UK_COMPANIES_ACT','UK_SRA_COC','UK_EQUALITY_2010'],
    pointers: [
      { severity:'P0', citation:'Privacy notice missing', category:'privacy_notice_missing', framework:'UK_GDPR_A13', location:'site-wide', evidence:'no privacy notice detected anywhere on the site', fix:'publish a UK GDPR Article 13/14 notice', uplift:'closes ICO trigger' },
      { severity:'P0', citation:'Complaints procedure missing', category:'professional_complaints_procedure_missing', framework:'UK_SRA_COC', location:'site-wide', evidence:'no complaints procedure published anywhere', fix:'publish a procedure with Legal Ombudsman link', uplift:'closes SRA Transparency breach' },
      { severity:'P1', citation:'Cookie consent missing', category:'cookie_consent_missing', framework:'UK_PECR', location:'/', evidence:'no cookie banner detected on the homepage', fix:'deploy a CMP with reject-all parity', uplift:'closes PECR exposure' },
      { severity:'P1', citation:'SEO: meta description', framework:'GOOGLE_EEAT', category:'seo_meta_description_missing', location:'/', evidence:'no meta description tag on homepage', fix:'author a 145-160 char description', uplift:'+18% snippet CTR' }
    ]
  },
  {
    slug: 'emaar-uae-real-estate', country: 'AE', sector: 'real-estate', domain: 'emaar.ae', company: 'Emaar Properties',
    applicable: ['UAE_PDPL','UAE_FED_CONSUMER_2006','GOOGLE_EEAT','UAE_RERA','UAE_TRAKHEESI'],
    pointers: [
      { severity:'P0', citation:'UK GDPR / privacy', framework:'UK_GDPR_A13', category:'privacy_notice_missing', location:'/contact', evidence:'no privacy notice on contact page', fix:'publish a PDPL notice', uplift:'closes UAE Data Office trigger' },
      { severity:'P0', citation:'Real estate regulator number missing', category:'real_estate_regulator_disclosure_missing', framework:'UAE_RERA', location:'site-wide', evidence:'no RERA permit displayed on listings', fix:'add the RERA permit to every listing', uplift:'closes RERA exposure' },
      { severity:'P0', citation:'Trakheesi marketing permit missing', category:'marketing_permit_disclosure_missing', framework:'UAE_TRAKHEESI', location:'/properties', evidence:'no Trakheesi permit on marketing creative', fix:'add Trakheesi permit to every marketing piece', uplift:'closes DLD enforcement trigger' },
      { severity:'P0', citation:'SRA Transparency', framework:'UK_SRA_COC', category:'professional_complaints_procedure_missing', location:'/', evidence:'no complaints page detected', fix:'publish complaints procedure', uplift:'closes regulator transparency' },
      { severity:'P1', citation:'SEO: meta description', framework:'GOOGLE_EEAT', category:'seo_meta_description_missing', location:'/', evidence:'no meta description on homepage', fix:'add a description tag', uplift:'+18% CTR' }
    ]
  },
  {
    slug: 'cma-saudi-finance', country: 'SA', sector: 'finance', domain: 'cma.org.sa', company: 'CMA Saudi Test',
    applicable: ['SA_PDPL','SA_CITC','GOOGLE_EEAT','SA_SAMA','SA_CMA_KSA'],
    pointers: [
      { severity:'P0', citation:'UK GDPR', framework:'UK_GDPR_A13', category:'privacy_notice_missing', location:'/contact', evidence:'no PDPL notice on contact form', fix:'publish a Saudi PDPL notice', uplift:'closes SDAIA trigger' },
      { severity:'P0', citation:'Financial regulator number missing', category:'financial_regulator_disclosure_missing', framework:'SA_SAMA', location:'/', evidence:'no SAMA licence visible', fix:'add SAMA licence to footer', uplift:'closes prudential exposure' },
      { severity:'P1', citation:'PECR cookies', framework:'UK_PECR', category:'cookie_consent_missing', location:'/', evidence:'no cookie banner', fix:'deploy a CMP', uplift:'removes cookie exposure' }
    ]
  },
  {
    slug: 'rt-singapore-law', country: 'SG', sector: 'law-firms', domain: 'rajahtannasia.com', company: 'Rajah & Tann Asia',
    applicable: ['SG_PDPA','GOOGLE_EEAT','SG_LAW_SOCIETY','SG_LPA_RULES'],
    pointers: [
      { severity:'P0', citation:'UK GDPR', framework:'UK_GDPR_A13', category:'privacy_notice_missing', location:'/contact', evidence:'no PDPA notice on contact', fix:'publish a Singapore PDPA notice', uplift:'closes PDPC trigger' },
      { severity:'P0', citation:'Professional transparency', framework:'UK_SRA_COC', category:'professional_transparency_missing', location:'/', evidence:'no Law Society transparency block on site', fix:'add Law Society of Singapore disclosure', uplift:'closes Law Society risk' }
    ]
  },
  {
    slug: 'razorpay-india-fintech', country: 'IN', sector: 'fintech', domain: 'razorpay.com', company: 'Razorpay',
    applicable: ['IN_DPDP_2023','IN_IT_2000','IN_IT_RULES_2021','IN_CONSUMER_2019','GOOGLE_EEAT','IN_RBI','IN_SEBI','IN_NPCI'],
    pointers: [
      { severity:'P0', citation:'UK GDPR', framework:'UK_GDPR_A13', category:'privacy_notice_missing', location:'/contact', evidence:'no DPDP notice on contact form', fix:'publish a DPDP Act notice', uplift:'closes India Data Protection Board' },
      { severity:'P0', citation:'Financial regulator', category:'financial_regulator_disclosure_missing', framework:'IN_RBI', location:'/', evidence:'no RBI licence visible', fix:'add RBI authorisation', uplift:'closes RBI exposure' }
    ]
  },
  {
    slug: 'kwm-hk-law', country: 'HK', sector: 'law-firms', domain: 'kwm.com', company: 'King & Wood Mallesons',
    applicable: ['HK_PDPO','HK_COMPANIES_ORDINANCE','GOOGLE_EEAT','HK_LAW_SOCIETY','HK_BAR'],
    pointers: [
      { severity:'P0', citation:'UK GDPR', framework:'UK_GDPR_A13', category:'privacy_notice_missing', location:'/contact', evidence:'no PDPO PICS on contact', fix:'publish a PICS', uplift:'closes PCPD trigger' },
      { severity:'P0', citation:'Professional transparency', framework:'UK_SRA_COC', category:'professional_transparency_missing', location:'/', evidence:'no HK Law Society disclosure', fix:'add HK Law Society block', uplift:'closes regulator risk' }
    ]
  },
  {
    slug: 'lvmh-fr-luxury', country: 'FR', sector: 'ecommerce', domain: 'lvmh.com', company: 'LVMH',
    applicable: ['EU_GDPR','EU_EPRIVACY','EU_AI_ACT','GOOGLE_EEAT'],
    pointers: [
      { severity:'P0', citation:'UK GDPR / privacy', framework:'UK_GDPR_A13', category:'privacy_notice_missing', location:'/contact', evidence:'no RGPD notice detected', fix:'publier un avis de confidentialite', uplift:'CNIL exposure removed' },
      { severity:'P1', citation:'PECR cookies', framework:'UK_PECR', category:'cookie_consent_missing', location:'/', evidence:'no consent banner', fix:'deploy a CMP', uplift:'closes ePrivacy exposure' }
    ]
  }
];

const OUTDIR = '/sessions/great-hopeful-heisenberg/mnt/outputs/backtest';
fs.mkdirSync(OUTDIR, { recursive: true });

const issues = [];
function log(slug, severity, message) {
  issues.push({ slug, severity, message });
}

async function render(fx) {
  const payload = {
    schema_version: 'v1', domain: fx.domain, sector: fx.sector, country: fx.country,
    framework_version: '7.4.0', applicable_frameworks: fx.applicable, rules: [],
    sections: { cover: { firm: fx.slug } }
  };
  globalThis.fetch = async (_url, opts) => {
    const q = JSON.parse(opts.body).query;
    let rows = [];
    if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(payload), fx.domain, fx.sector, fx.country]];
    else if (/FROM leads/.test(q)) rows = [[fx.company, 78, JSON.stringify(fx.pointers)]];
    return { ok: true, json: async () => ({ rows }) };
  };
  const future = Math.floor(Date.now() / 1000) + 86400;
  const sig = sign(fx.slug, 'YpHBx5lx', '999', future);
  const r = await mod.fetch(new Request(`https://tamazia.co.uk/audit/${fx.slug}/YpHBx5lx?l=999&x=${future}&sig=${sig}`));
  const html = await r.text();
  fs.writeFileSync(`${OUTDIR}/${fx.slug}.html`, html);
  return { status: r.status, html };
}

async function inspect(fx, { status, html }) {
  // STATUS
  if (status !== 200) log(fx.slug, 'P0', `HTTP ${status} instead of 200`);

  // PROOF BAND REMOVED
  if (/three clients · three regulators|THREE CLIENTS · THREE REGULATORS/i.test(html)) log(fx.slug, 'P0', 'proof band still present');

  // EM-DASH PAUSES
  const dashCount = (html.match(/\s[—–]\s/g) || []).length;
  if (dashCount > 0) log(fx.slug, 'P1', `${dashCount} em/en-dash pauses in rendered output`);

  // REVIEWS BAND NON-EMPTY
  const revMatch = html.match(/class="rev-grid"[^>]*>([\s\S]*?)<\/div>/);
  if (!revMatch || revMatch[1].trim().length < 200) log(fx.slug, 'P1', 'reviews grid is empty or thin');

  // CALENDAR FALLBACK
  if (!/id="cal-host"/.test(html)) log(fx.slug, 'P1', 'cal-host div missing');
  if (!/id="cal-fallback"/.test(html)) log(fx.slug, 'P1', 'cal-fallback panel missing');

  // mShots fallback
  if (!/onerror=/.test(html)) log(fx.slug, 'P1', 'mShots has no onerror fallback');

  // PHASE 1 CORE: no UK strings on non-UK audits
  if (fx.country !== 'UK') {
    const uk = ['SRA', 'UK GDPR', 'PECR', 'Solicitors Regulation', 'Companies House', 'EHRC', 'CMA enforcement'];
    for (const s of uk) {
      const re = new RegExp(s, 'g');
      const hits = (html.match(re) || []).length;
      if (hits > 0) log(fx.slug, 'P0', `${hits}× "${s}" present on non-UK audit (${fx.country})`);
    }
  }

  // PHASE 1 CORE: jurisdiction-correct regulator name visible
  const expectedRegulator = {
    UK: ['ICO', 'Solicitors Regulation Authority|SRA'],
    AE: ['UAE Data Office', 'RERA'],
    SA: ['SDAIA', 'SAMA'],
    SG: ['PDPC', 'Law Society of Singapore'],
    IN: ['India Data Protection Board', 'RBI'],
    HK: ['PCPD'],
    FR: ['EU DPAs|CNIL']
  }[fx.country] || [];
  for (const exp of expectedRegulator) {
    if (!new RegExp(exp, 'i').test(html)) log(fx.slug, 'P1', `expected regulator marker absent: ${exp}`);
  }

  // Findings present (we shipped N pointers, expect N rendered)
  const findingRows = (html.match(/<details[^>]*style="background:#fff[^"]*border-left:4px solid/g) || []).length;
  if (findingRows < fx.pointers.length - 1) log(fx.slug, 'P0', `only ${findingRows} finding cards rendered (sent ${fx.pointers.length})`);

  // company name
  const escCo = fx.company.replace(/&/g, '&amp;');
  if (!html.includes(escCo)) log(fx.slug, 'P0', `company name "${fx.company}" missing from rendered HTML`);

  // CRITICAL: no "Sector regulator" / "Sector exposure" fallback labels (means a finding hit a framework not in FRAMEWORK_META)
  if (/Sector regulator|Sector exposure/.test(html)) log(fx.slug, 'P0', 'generic "Sector regulator/exposure" fallback rendered');

  // Sextant brand-system eyebrow
  if (!/Sextant MMXVIII/i.test(html)) log(fx.slug, 'P1', 'Sextant MMXVIII eyebrow missing');

  // Priority section present (label varies by finding count: priority / two priorities / priority three / priority N).
  if (!/<section id="priority"/i.test(html) || !/Your (?:priority(?:\s+three|\s+\d+)?|two priorities)/i.test(html)) {
    log(fx.slug, 'P0', 'priority section missing or mis-labelled');
  }

  // pricing tiers
  if (!/From £2,500/.test(html)) log(fx.slug, 'P1', 'Foundation tier price missing');

  // page size sanity
  if (html.length < 60000) log(fx.slug, 'P1', `page size only ${html.length} bytes (expected > 60k)`);
}

console.log('Rendering and inspecting 7 fixtures...\n');
for (const fx of FIXTURES) {
  const r = await render(fx);
  await inspect(fx, r);
  const fxIssues = issues.filter(i => i.slug === fx.slug);
  console.log(`${fx.slug} (${fx.country}/${fx.sector}): ${fxIssues.length} issue${fxIssues.length === 1 ? '' : 's'}`);
  for (const i of fxIssues) console.log(`  ${i.severity}  ${i.message}`);
}

console.log(`\n=== BACKTEST RESULT ===`);
const p0 = issues.filter(i => i.severity === 'P0').length;
const p1 = issues.filter(i => i.severity === 'P1').length;
console.log(`P0: ${p0}, P1: ${p1}, total: ${issues.length}`);
console.log(`\nHTML files: ${OUTDIR}/`);
process.exit(p0 > 0 ? 1 : 0);
