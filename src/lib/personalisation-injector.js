// Phase 6 task 6.4.1 · spam-safe injection of personalisation into outbound emails.
// Rules:
//   1. Only ONE personalised reference per email body. More = obvious template.
//   2. The pointer must be P0 or P1 (P2 is "interesting" but not severe enough to lead with).
//   3. The reference must be a single sentence that the LLM-stage already proved is brand-safe.
//   4. NO bare links to the audit page in the first message. Audit URL is referenced as
//      "the brief I drafted for you" or "a one-page brief" (no audit micro-site URL inline).
//   5. The signed audit URL goes in the P.S. on touch 2+ only, never on touch 1.
//   6. If no pointer with quality ≥ 0.70 exists, return a generic-but-still-personalised sentence
//      drawn from public records (Companies House status + sector). Never go fully blind.
//
// Returns: { ok, sentence, pointer_used?, fallback?, evidence_url? }

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }

const FORBIDDEN = [/—/, /–/, /\bleverage\b/i, /\bseamlessly?\b/i, /\brobust\b/i, /\bdive deep\b/i, /\bsupercharge\b/i, /\bskyrocket\b/i, /\bworld[- ]?class\b/i, /\bbest in class\b/i];

function pickPointerFor(lead) {
  if (!lead || !lead.personalisation_pointers) return null;
  let pointers;
  try { pointers = typeof lead.personalisation_pointers === 'string' ? JSON.parse(lead.personalisation_pointers) : lead.personalisation_pointers; }
  catch (_e) { return null; }
  if (!Array.isArray(pointers)) return null;
  // P0 first, then P1; require quality ≥ 0.70
  const sorted = pointers.filter(p => p && (p.quality === undefined || p.quality >= 0.70))
    .sort((a, b) => {
      const av = (a.severity === 'P0' ? 0 : a.severity === 'P1' ? 1 : 2);
      const bv = (b.severity === 'P0' ? 0 : b.severity === 'P1' ? 1 : 2);
      if (av !== bv) return av - bv;
      return (b.quality || 0) - (a.quality || 0);
    });
  // Only P0 / P1 for first touch
  return sorted.find(p => p.severity === 'P0' || p.severity === 'P1') || null;
}

function phrasingFor(pointer, lead) {
  if (!pointer) return null;
  const path = (pointer.evidence_url ? new URL(pointer.evidence_url).pathname : '');
  const where = path && path !== '/' ? `your ${path.replace(/\//g, '').slice(0, 24)} page` : 'your home page';

  // Bucket-specific phrasings (deterministic, brand-safe, single sentence)
  if (pointer.bucket === 'compliance') {
    const code = (pointer.citation || '').split(/\s+/)[0];
    const regulatorMap = {
      'UK_GDPR_A13': 'the ICO', 'UK_PECR': 'the ICO', 'UK_ICO_COOKIES': 'the ICO', 'EU_GDPR': 'the relevant supervisory authority',
      'UK_SRA_COC': 'the SRA', 'UK_BSB': 'the BSB',
      'UK_ICAEW': 'ICAEW', 'UK_ACCA': 'ACCA', 'UK_FRC': 'the FRC', 'UK_HMRC_AML': 'HMRC',
      'UK_CQC': 'the CQC', 'UK_MHRA': 'the MHRA', 'UK_GPHC': 'the GPhC', 'UK_ABPI': 'the PMCPA', 'UK_GDC': 'the GDC',
      'UK_FCA_CONC25': 'the FCA', 'UK_PRA': 'the PRA', 'UK_PSR': 'the PSR', 'UK_FOS_FSCS': 'the FCA', 'UK_ABI': 'the ABI',
      'UK_RICS': 'RICS', 'UK_ARLA': 'Propertymark', 'UK_TPO': 'The Property Ombudsman',
      'UK_OFSTED': 'Ofsted', 'UK_DFE': 'the Department for Education', 'UK_OFS': 'the Office for Students',
      'UK_CHARITY_COMMISSION': 'the Charity Commission', 'UK_FUNDRAISING_REG': 'the Fundraising Regulator', 'UK_HMRC_GIFTAID': 'HMRC',
      'UK_OFGEM': 'Ofgem', 'UK_CAA': 'the CAA', 'UK_ORR': 'the ORR', 'UK_DVSA': 'the DVSA',
      'UK_OFCOM': 'Ofcom', 'UK_ASA_CAP': 'the ASA', 'UK_IPSO': 'IPSO',
      'UK_HSE': 'the HSE', 'UK_UKCA': 'OPSS', 'UK_ENV_AGENCY': 'the Environment Agency', 'UK_FSA': 'the FSA',
      'UK_LICENSING_ACT': 'the Licensing Authority', 'UK_CMA': 'the CMA', 'UK_TRADING_STANDARDS': 'Trading Standards',
      'UK_NCSC_CYBER_ESSENTIALS': 'NCSC', 'UK_DSIT_NIS2': 'DSIT', 'US_FTC': 'the FTC'
    };
    const regulator = regulatorMap[code] || 'the regulator';
    return `I noticed ${where} is missing a disclosure required by ${pointer.citation || 'the framework that applies to your sector'}, which is the kind of thing ${regulator} flags first when auditing a firm of your size.`;
  }
  if (pointer.bucket === 'seo' && /missing_h1|heading_hierarchy_broken/.test(pointer.fact || '')) {
    return `I had a look at ${lead.domain} and ${where} ships without an h1 tag, which means Google is reading your h2 as the lead signal.`;
  }
  if (pointer.bucket === 'seo') {
    return `I had a look at ${lead.domain} and the on-page SEO has a fixable gap: ${truncateLowerFirst(pointer.fact, 110)}.`;
  }
  if (pointer.bucket === 'website') {
    return `One thing I picked up on ${lead.domain}: ${truncateLowerFirst(pointer.fact, 130)}.`;
  }
  if (pointer.bucket === 'ad_intel') {
    return `Looking at your ad and tracking setup, ${truncateLowerFirst(pointer.fact, 130)}.`;
  }
  if (pointer.bucket === 'public_records') {
    return `From the public records on ${lead.domain}, ${truncateLowerFirst(pointer.fact, 130)}.`;
  }
  return null;
}
function truncateLowerFirst(s, n) {
  s = String(s || ''); if (!s) return s;
  const out = s.length > n ? s.slice(0, n - 1) + '…' : s;
  return out.charAt(0).toLowerCase() + out.slice(1);
}

function fallbackFor(lead) {
  // No usable pointer — use the sector + jurisdiction to produce a still-relevant sentence
  const sector = (lead.sector || '').toLowerCase();
  const sectorMap = {
    'law-firms': 'firms regulated by the SRA',
    'healthcare': 'providers registered with the CQC',
    'finance': 'firms authorised by the FCA',
    'hospitality': 'operators in the hospitality sector',
    'real-estate': 'firms in regulated property work'
  };
  const where = sectorMap[sector] || 'firms in regulated work';
  return `I focus on ${where} and have been running compliance-grade SEO audits across the UK market this quarter.`;
}

function injectorFor({ lead, touchNumber = 1 }) {
  if (!lead) return { ok: false, reason: 'no_lead' };
  const pointer = pickPointerFor(lead);
  let sentence, pointer_used, evidence_url, fallback = false;

  if (pointer) {
    sentence = phrasingFor(pointer, lead);
    pointer_used = pointer;
    evidence_url = pointer.evidence_url;
  }
  if (!sentence) {
    sentence = fallbackFor(lead);
    fallback = true;
  }

  // Forbidden-phrase guard
  for (const f of FORBIDDEN) { if (f.test(sentence)) return { ok: false, reason: 'forbidden_phrase', sentence }; }
  // Length sanity
  if (sentence.length > 280) sentence = sentence.slice(0, 277) + '…';

  // Spam-trigger filtering on the FINAL sentence (Phase 4 deliverability lessons)
  const spamFlags = [/\bfree\b/i, /\bguaranteed\b/i, /\bno obligation\b/i, /\b\$\$\$/, /!!!+/];
  for (const f of spamFlags) { if (f.test(sentence)) return { ok: false, reason: 'spam_trigger', sentence }; }

  // Audit URL handling per touch number
  let ps_line = null;
  if (touchNumber >= 2 && lead.audit_url) {
    ps_line = `P.S. I put together a one-page brief on ${lead.domain} if useful: ${lead.audit_url}`;
  } else if (touchNumber === 1) {
    ps_line = `Happy to share the full audit if it would be useful.`;
  }

  return { ok: true, sentence, pointer_used: pointer_used ? { bucket: pointer_used.bucket, severity: pointer_used.severity, quality: pointer_used.quality, citation: pointer_used.citation } : null, evidence_url, fallback, ps_line };
}

// CLI tester
function fetchLead(lead_id) {
  const raw = pg(`SELECT id, domain, sector, jurisdiction, company, personalisation_pointers::text, personalisation_quality_score FROM leads WHERE id=${lead_id}`);
  if (!raw) return null;
  const [id, domain, sector, jurisdiction, company, pointersJson, score] = raw.split('\t');
  return { id: Number(id), domain, sector, country: jurisdiction || 'UK', company, personalisation_pointers: pointersJson, personalisation_quality_score: score === '' ? null : Number(score) };
}

if (require.main === module) {
  const leadId = Number(process.argv[2]);
  const touch = Number(process.argv[3] || 1);
  if (!leadId) { console.error('Usage: personalisation-injector.js <lead_id> [touch_number]'); process.exit(2); }
  const lead = fetchLead(leadId);
  if (!lead) { console.error('lead not found'); process.exit(1); }
  console.log(JSON.stringify(injectorFor({ lead, touchNumber: touch }), null, 2));
}

module.exports = { injectorFor, pickPointerFor };
