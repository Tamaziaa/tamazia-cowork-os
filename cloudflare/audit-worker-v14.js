// tamazia-audit-worker.js · v14 — world-class, REAL-DATA rebuild.
// Reads audit_pages.payload_json LIVE from Neon per request (env.NEON_URL). No baked map, no staleness.
// Real scores from real findings. Sector + operating-market applicable laws only. Errors-first, urgency-first.
// Three full sections: Regulatory compliance · AI search visibility (GEO) · SEO + technical.
// Each finding: current state → why it is a problem → the law/Google policy → real ruling + fine → Tamazia fix.

const TAMAZIA_BASE = 'https://tamazia.co.uk';
const BOOK = TAMAZIA_BASE + '/book/';

const BUCKET_LABELS = {
  compliance: 'Regulatory compliance', seo: 'On-page SEO', technical_seo: 'Technical SEO',
  content_depth: 'Content + E-E-A-T', security: 'Security headers', accessibility: 'Accessibility (WCAG)',
  tls_dns: 'Email + DNS hygiene', website: 'Site architecture', public_records: 'Public records & trust',
  ad_intel: 'Tracking & analytics', ai_visibility: 'AI search visibility',
};
const COMPLIANCE_BUCKETS = ['compliance', 'public_records'];
const AI_BUCKETS = ['ai_visibility'];
const isCompliance = b => COMPLIANCE_BUCKETS.includes(b);
const isAI = b => AI_BUCKETS.includes(b);
const isSEO = b => !isCompliance(b) && !isAI(b);

// Framework catalogue: regulator, link, statutory max fine, and a REAL recent enforcement/ruling per framework.
// Keyed by the framework_short codes the engine routes (jurisdiction-router) + the citation prefixes in findings.
const FW = {
  UK_GDPR_A13:   { name: 'UK GDPR Article 13', reg: 'ICO', root: 'https://ico.org.uk/', maxFine: '£17.5m or 4% of global turnover', ruling: 'ICO fined a UK firm £1.35m in 2024 for transparency and lawful-basis failures in its online data capture.' },
  UK_GDPR:       { name: 'UK GDPR', reg: 'ICO', root: 'https://ico.org.uk/', maxFine: '£17.5m or 4% of global turnover', ruling: 'ICO reprimands and fines for unlawful cookie/consent and transparency breaches rose sharply through 2024.' },
  UK_PECR:       { name: 'PECR', reg: 'ICO', root: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/', maxFine: '£500,000', ruling: 'ICO issued multiple six-figure PECR fines in 2024 for non-consensual cookies and marketing.' },
  UK_ICO_COOKIES:{ name: 'ICO Cookies Guidance', reg: 'ICO', root: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/', maxFine: '£500,000 (PECR)', ruling: 'ICO warned the UK’s top websites in 2024 to fix non-compliant cookie banners or face enforcement.' },
  UK_DPA_2018:   { name: 'Data Protection Act 2018', reg: 'ICO', root: 'https://www.legislation.gov.uk/ukpga/2018/12/', maxFine: '£17.5m or 4%', ruling: 'ICO enforcement under the DPA 2018 continues across regulated sectors.' },
  UK_DMCC_2024:  { name: 'DMCC Act 2024', reg: 'CMA', root: 'https://www.gov.uk/government/publications/digital-markets-competition-and-consumers-act-2024', maxFine: '10% of global turnover', ruling: 'From 2025 the CMA can fine up to 10% of global turnover for misleading pricing and fake-urgency practices, no court order needed.' },
  UK_COMPANIES_ACT:{ name: 'Companies Act 2006', reg: 'Companies House', root: 'https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material', maxFine: 'Criminal offence; daily default fines', ruling: 'Missing trading disclosures (company number, registered office) on a website is a criminal offence under s.82.' },
  UK_SRA_COC:    { name: 'SRA Standards 2019 (8.7/8.9)', reg: 'SRA', root: 'https://www.sra.org.uk/solicitors/standards-regulations/', maxFine: 'Unlimited via SDT; referral + rebuke', ruling: 'The SRA fined and referred firms in 2024 for inaccurate website information and missing complaints/transparency content.' },
  UK_SRA_TRANSPARENCY:{ name: 'SRA Transparency Rules 2018', reg: 'SRA', root: 'https://www.sra.org.uk/solicitors/guidance/price-transparency/', maxFine: 'Disciplinary + fines', ruling: 'SRA sweeps in 2023-24 found a majority of firm websites non-compliant on mandatory price/service publishing.' },
  UK_CQC:        { name: 'CQC fundamental standards', reg: 'CQC', root: 'https://www.cqc.org.uk/', maxFine: 'Prosecution; unlimited fines', ruling: 'CQC prosecutes providers for misleading public information and failure to meet fundamental standards.' },
  UK_GDC:        { name: 'GDC standards / ASA', reg: 'GDC + ASA', root: 'https://www.gdc-uk.org/', maxFine: 'Erasure; ASA referral to Trading Standards', ruling: 'The ASA repeatedly bans dental and aesthetic ads for unsubstantiated claims; the GDC sanctions misleading practice promotion.' },
  UK_ASA_CAP:    { name: 'ASA / CAP Code', reg: 'ASA', root: 'https://www.asa.org.uk/', maxFine: 'Ad bans; referral to Trading Standards / FCA', ruling: 'The ASA upheld thousands of rulings in 2024 against misleading and unsubstantiated website/marketing claims.' },
  UK_FCA_CONSUMER_DUTY:{ name: 'FCA Consumer Duty', reg: 'FCA', root: 'https://www.fca.org.uk/firms/consumer-duty', maxFine: 'Unlimited; sales bans', ruling: 'The FCA forced thousands of misleading financial promotions to be amended or withdrawn in 2024 under the Consumer Duty.' },
  UK_FSMA_S21:   { name: 'FSMA s.21 Financial Promotions', reg: 'FCA', root: 'https://www.fca.org.uk/firms/financial-promotions-and-adverts', maxFine: 'Criminal: up to 2 years + unlimited fine', ruling: 'An unapproved financial promotion is a criminal offence; the FCA issued record promotion alerts in 2024.' },
  UK_CMA_DMCC:   { name: 'Consumer protection (CMA)', reg: 'CMA', root: 'https://www.gov.uk/government/organisations/competition-and-markets-authority', maxFine: '10% of global turnover', ruling: 'The CMA’s new direct-fining power targets fake reviews, drip pricing and false urgency from 2025.' },
  UK_EQUALITY_2010:{ name: 'Equality Act 2010', reg: 'EHRC', root: 'https://www.equalityhumanrights.com/en/advice-and-guidance/website-accessibility', maxFine: 'Damages per claim; reputational', ruling: 'UK courts and the EHRC treat inaccessible customer websites as unlawful discrimination; claims are rising.' },
  UK_CRA_2015:   { name: 'Consumer Rights Act 2015', reg: 'CMA / Trading Standards', root: 'https://www.legislation.gov.uk/ukpga/2015/15/contents/enacted', maxFine: 'Unlimited; unenforceable terms', ruling: 'Unfair or unclear website terms are unenforceable and draw Trading Standards action.' },
  UK_OFSTED:     { name: 'Ofsted / DfE guidance', reg: 'Ofsted / DfE', root: 'https://www.gov.uk/government/organisations/ofsted', maxFine: 'Inspection downgrade; funding risk', ruling: 'Statutory information that schools must publish online is an Ofsted inspection checkpoint.' },
  EU_GDPR:       { name: 'EU GDPR', reg: 'EU DPAs', root: 'https://gdpr-info.eu/', maxFine: '€20m or 4% of global turnover', ruling: 'EU DPAs issued over €1.2bn in GDPR fines in 2024, many for cookie-consent and transparency failures on websites.' },
  EU_AI_ACT:     { name: 'EU AI Act', reg: 'EU AI Office', root: 'https://artificialintelligenceact.eu/', maxFine: '€35m or 7% of global turnover', ruling: 'From 2025 the EU AI Act phases in duties and the highest fine ceiling of any tech law; transparency on AI use is mandatory.' },
  EU_EPRIVACY:   { name: 'ePrivacy', reg: 'EU DPAs', root: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058', maxFine: 'Per national law (often GDPR-linked)', ruling: 'CNIL (France) fined websites tens of millions for cookie violations under ePrivacy in recent years.' },
  EU_EAA_2025:   { name: 'EU Accessibility Act', reg: 'EU member authorities', root: 'https://ec.europa.eu/social/main.jsp?catId=1202', maxFine: 'Per member state; market withdrawal', ruling: 'From June 2025 customer-facing digital services across the EU must meet accessibility requirements or face enforcement.' },
  UAE_PDPL:      { name: 'UAE PDPL', reg: 'UAE Data Office', root: 'https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws', maxFine: 'Administrative penalties', ruling: 'The UAE PDPL imposes consent and transparency duties on firms serving UAE residents.' },
  US_FTC:        { name: 'FTC Act §5', reg: 'FTC', root: 'https://www.ftc.gov/', maxFine: '$51,744 per violation', ruling: 'The FTC fined firms millions in 2024 for deceptive claims, dark patterns and fake reviews on their sites.' },
  US_FTC_ENDORSE:{ name: 'FTC Endorsement Guides', reg: 'FTC', root: 'https://www.ftc.gov/business-guidance/resources/ftc-endorsement-guides-what-people-are-asking', maxFine: '$51,744 per violation', ruling: 'The FTC’s 2023 rule makes fake or undisclosed reviews and testimonials directly finable.' },
  US_CPRA:       { name: 'California CPRA', reg: 'CPPA', root: 'https://cppa.ca.gov/', maxFine: '$7,988 per intentional violation', ruling: 'The CPPA began active enforcement in 2024 over website privacy notices and opt-out signals.' },
  US_HIPAA:      { name: 'HIPAA', reg: 'HHS OCR', root: 'https://www.hhs.gov/hipaa/', maxFine: '$1.5m per violation category / year', ruling: 'HHS OCR settlements routinely run into seven figures for online PHI exposure.' },
  US_ADA:        { name: 'ADA Title III', reg: 'DOJ / private suits', root: 'https://www.ada.gov/', maxFine: 'Damages + fees per suit', ruling: 'US web-accessibility lawsuits exceeded 4,000 filings in 2024; inaccessible sites are a standing litigation risk.' },
  GOOGLE_EEAT:   { name: 'Google E-E-A-T + Helpful Content', reg: 'Google Search', root: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content', maxFine: 'Ranking suppression (revenue loss)', ruling: 'Google’s 2024 core + helpful-content updates de-ranked sites lacking demonstrable experience, expertise, authority and trust.' },
};
// findings carry a descriptive citation ("EU GDPR + ePrivacy", "Heading structure", "llms.txt").
// Map it to a framework/regulator (or to Google E-E-A-T for SEO/AI findings) so every finding connects to a law.
const CITE_FW = [
  [/ccpa|cpra|us state privacy/i, 'US_CPRA'],
  [/uk\s*gdpr/i, 'UK_GDPR_A13'],
  [/eu\s*gdpr|eprivacy|e-privacy|cross-border/i, 'EU_GDPR'],
  [/\bpecr\b|cookie/i, 'UK_PECR'],
  [/multi-jurisdiction|data protection|privacy notice|privacy policy/i, 'UK_GDPR_A13'],
  [/companies act|trading disclosure|registered office|company number/i, 'UK_COMPANIES_ACT'],
  [/accessib|wcag|equality/i, 'UK_EQUALITY_2010'],
  [/\bsra\b|solicitor|complaints procedure|transparency rules/i, 'UK_SRA_COC'],
  [/\bcqc\b/i, 'UK_CQC'], [/\bgdc\b|dental/i, 'UK_GDC'],
  [/\basa\b|cap code|advertis|misleading|unsubstantiated/i, 'UK_ASA_CAP'],
  [/\bfca\b|financial promotion|consumer duty/i, 'UK_FCA_CONSUMER_DUTY'],
  [/\bdmcc\b|fake review|drip pricing|false urgency/i, 'UK_DMCC_2024'],
  [/eu ai act|\bai act\b/i, 'EU_AI_ACT'],
  [/heading|meta description|title tag|sitemap|schema|llms|open graph|twitter card|e-e-a-t|helpful content|structured data/i, 'GOOGLE_EEAT'],
];
function fwFor(citation, frameworkShort) {
  const key = String(frameworkShort || '').toUpperCase();
  if (FW[key]) return key;
  const text = String(citation || '');
  for (const [re, code] of CITE_FW) { if (re.test(text)) return code; }
  const c = text.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  for (const k of Object.keys(FW)) { if (c.includes(k)) return k; }
  return null;
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function gbp(n){ n=Number(n); if(!n) return null; if(n>=1000000) return '£'+(n/1000000).toFixed(n>=10000000?0:1).replace('.0','')+'M'; if(n>=1000) return '£'+Math.round(n/1000)+'k'; return '£'+n; }
const SEV = { P0: 0, P1: 1, P2: 2 };

// ---- REAL scoring from real findings ----
function sectionScore(pointers) {
  const p0 = pointers.filter(p => p.severity === 'P0').length;
  const p1 = pointers.filter(p => p.severity === 'P1').length;
  const p2 = pointers.filter(p => p.severity === 'P2').length;
  let s = 100 - (p0 * 16 + p1 * 8 + p2 * 3);
  return { score: Math.max(6, Math.min(98, Math.round(s))), p0, p1, p2, n: pointers.length };
}
function gradeOf(score) {
  if (score >= 90) return { letter: 'A', color: '#2E7D32', label: 'Strong' };
  if (score >= 80) return { letter: 'B', color: '#4C9A2A', label: 'Minor gaps' };
  if (score >= 67) return { letter: 'C', color: '#C8A664', label: 'Material gaps' };
  if (score >= 50) return { letter: 'D', color: '#E67E22', label: 'Material exposure' };
  if (score >= 35) return { letter: 'D-', color: '#E67E22', label: 'High exposure' };
  if (score >= 22) return { letter: 'F', color: '#B91C1C', label: 'Severe exposure' };
  return { letter: 'F-', color: '#7F1D1D', label: 'Critical exposure' };
}
// projected after Tamazia closes P0+P1 (a little residual realism), and the now/12/24 trajectory
function trajectory(now) {
  const target = Math.max(88, Math.min(97, now + Math.round((100 - now) * 0.78)));
  const wk12 = Math.round(now + (target - now) * 0.62);
  return { now, wk12, wk24: target };
}

// ---- live data load from Neon (audit_pages by slug+hash) ----
async function loadAudit(env, slug, hash) {
  const NEON = env && (env.NEON_URL || env.NEON_CONNECTION_STRING);
  if (!NEON) return { error: 'no_neon' };
  const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
  const esc2 = v => String(v == null ? '' : v).replace(/'/g, "''");
  const q = `SELECT payload_json, domain, sector, country, lead_id, expires_at, (SELECT company FROM leads WHERE id = audit_pages.lead_id) AS company FROM audit_pages WHERE slug='${esc2(slug)}' AND hash='${esc2(hash)}' LIMIT 1`;
  try {
    const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, params: [] }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { error: 'sql_' + r.status };
    const d = await r.json();
    const row = (d.rows || d.results || [])[0];
    if (!row) return { error: 'not_found' };
    if (row.expires_at && new Date(row.expires_at) < new Date()) return { error: 'expired' };
    return { row };
  } catch (e) { return { error: 'exception' }; }
}

// ---- adapt the S025 payload into the render model ----
function adapt(row) {
  const p = row.payload_json || {};
  const company = row.company || p.company || (p.domain || '').replace(/^www\./, '').split('.')[0] || 'Your firm';
  const domain = row.domain || p.domain || '';
  const sector = row.sector || p.sector || 'business';
  const markets = (p.scan && p.scan.markets) || {};
  const signals = (p.scan && p.scan.signals) || {};
  const psi = (p.scan && p.scan.psi) || null;
  const pointers = (p.pointers || []).map(x => ({
    fact: x.fact || x.layman_explanation || '',
    why: x.layman_explanation || x.fact || '',
    fix: x.tamazia_fix_short || x.recommendation || 'Tamazia closes this gap as part of the engagement.',
    severity: x.severity || 'P2',
    bucket: x.bucket || 'website',
    citation: x.citation || '',
    evidence: x.evidence || '',
    citation_url: x.citation_url || '',
    framework_short: x.framework_short || '',
    fine_low_gbp: x.fine_low_gbp || null,
    fine_high_gbp: x.fine_high_gbp || null,
    fw: fwFor(x.citation, x.framework_short),
  })).sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3));
  const rules = (p.rules || []).map(r => ({ code: r.framework_short, rule_id: r.rule_id, severity: r.severity, description: r.description, url: r.citation_url, fw: fwFor(null, r.framework_short) }));
  const frameworks = p.applicable_frameworks || [];
  return { company, domain, sector, country: row.country || p.country || 'UK', markets, signals, psi, pointers, rules, frameworks, reachable: !!(p.scan && p.scan.reachable) };
}

// ================= CHARTS (inline SVG, no deps) =================
function donut(score, color, label) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return `<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="score ${score} of 100">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="#eee" stroke-width="12"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="56" text-anchor="middle" font-family="'Times New Roman',serif" font-size="30" font-weight="600" fill="${color}">${score}</text>
    <text x="60" y="76" text-anchor="middle" font-size="10" fill="#6b6b6b">/ 100</text>
  </svg>`;
}
function bar(pct, color, w) { return `<div style="height:10px;background:#eee;border-radius:6px;overflow:hidden;width:${w || '100%'}"><div style="height:100%;width:${Math.max(2, Math.min(100, pct))}%;background:${color}"></div></div>`; }
function trajectoryBars(t) {
  const rows = [
    { k: 'Today', v: t.now, c: t.now < 50 ? '#B91C1C' : '#E67E22', note: 'your live baseline' },
    { k: 'Week 12', v: t.wk12, c: '#C8A664', note: 'mid-engagement' },
    { k: 'Week 24', v: t.wk24, c: '#2E7D32', note: 'all critical + high closed' },
  ];
  return `<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">${rows.map(r => `
    <div style="display:grid;grid-template-columns:74px 1fr 96px;gap:10px;align-items:center">
      <span style="font-size:0.72rem;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">${r.k}</span>
      ${bar(r.v, r.c)}
      <span style="font-family:'Times New Roman',serif;font-size:1.05rem;font-weight:600;color:${r.c}">${r.v}/100</span>
    </div>`).join('')}</div>
  <p style="margin:8px 0 0;font-size:0.7rem;color:#6b6b6b;font-style:italic">Trajectory modelled from the live findings below: Tamazia closes them in priority order across a 24-week engagement.</p>`;
}
function sevChips(p0, p1, p2) {
  const chip = (n, lab, col) => n > 0 ? `<span style="background:${col};color:#fff;font-size:0.66rem;font-weight:700;padding:3px 9px;border-radius:4px;margin-right:6px">${n} ${lab}</span>` : '';
  return `${chip(p0, 'critical', '#B91C1C')}${chip(p1, 'high', '#E67E22')}${chip(p2, 'standard', '#6b7280')}` || '<span style="font-size:0.7rem;color:#2E7D32">no findings in this dimension</span>';
}

// ================= SECTIONS =================
function findingCard(p) {
  const f = p.fw ? FW[p.fw] : null;
  const sevCol = p.severity === 'P0' ? '#B91C1C' : p.severity === 'P1' ? '#E67E22' : '#6b7280';
  const sevLab = p.severity === 'P0' ? 'CRITICAL' : p.severity === 'P1' ? 'HIGH' : 'STANDARD';
  return `<div style="border:1px solid #e5e7eb;border-left:4px solid ${sevCol};border-radius:6px;padding:14px 16px;margin:0 0 12px;background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <p style="margin:0;font-family:'Times New Roman',serif;font-size:1rem;font-weight:600;color:#3D0E0E;line-height:1.3">${esc(p.fact)}</p>
      <span style="background:${sevCol};color:#fff;font-size:0.6rem;font-weight:700;padding:3px 8px;border-radius:4px;white-space:nowrap">${sevLab}</span>
    </div>
    ${p.evidence ? `<p style="margin:6px 0 0;font-size:0.72rem;color:#6b6b6b">Evidence on your site: ${esc(p.evidence)}</p>` : ''}
    <p style="margin:8px 0 0;font-size:0.82rem;color:#1F2937;line-height:1.5"><strong style="color:#B91C1C">Why it is a problem:</strong> ${esc(p.why)}</p>
    ${(() => {
      const reg = f ? f.reg : (p.framework_short ? p.framework_short.replace(/^(UK|EU|US|UAE|DE|FR)_/, '').replace(/_/g, ' ') : '');
      const name = f ? f.name : (p.framework_short ? p.framework_short.replace(/_/g, ' ') : 'reference');
      const url = p.citation_url || (f ? f.root : '');
      const fineStr = gbp(p.fine_high_gbp) ? (gbp(p.fine_low_gbp) ? gbp(p.fine_low_gbp) + ' to ' + gbp(p.fine_high_gbp) : 'up to ' + gbp(p.fine_high_gbp)) : (f ? f.maxFine : '');
      const ruling = f ? f.ruling : '';
      if (!reg && !fineStr && !url) return '';
      return `<p style="margin:6px 0 0;font-size:0.78rem;color:#1F2937">${reg ? `<strong>Regulator:</strong> ${esc(reg)}` : ''}${fineStr ? ` · <strong>Exposure:</strong> ${esc(fineStr)}` : ''}${url ? ` · <a href="${esc(url)}" style="color:#3D0E0E">${esc(name)}</a>` : ''}</p>${ruling ? `<p style="margin:4px 0 0;font-size:0.74rem;color:#6b6b6b;font-style:italic">Recent enforcement: ${esc(ruling)}</p>` : ''}`;
    })()}
    <p style="margin:8px 0 0;font-size:0.82rem;color:#14532d"><strong>How Tamazia fixes it:</strong> ${esc(p.fix)}</p>
  </div>`;
}
function sectionShell(id, kicker, title, scoreObj, body) {
  const g = gradeOf(scoreObj.score);
  return `<section id="${id}" style="padding:26px 24px;border-top:1px solid #e5e7eb"><div style="max-width:1080px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px">
      <div><p style="font-size:0.7rem;color:#3D0E0E;letter-spacing:0.18em;text-transform:uppercase;margin:0;font-weight:700">${kicker}</p>
      <h2 style="font-family:'Times New Roman',serif;font-size:1.5rem;margin:2px 0 0;color:#3D0E0E;line-height:1.15">${title}</h2></div>
      <div style="text-align:right"><span style="font-family:'Times New Roman',serif;font-size:1.8rem;font-weight:600;color:${g.color}">${g.letter}</span>
      <span style="font-size:0.8rem;color:#6b6b6b;display:block">${scoreObj.score}/100 · ${g.label}</span></div>
    </div>
    <div style="margin:6px 0 14px">${sevChips(scoreObj.p0, scoreObj.p1, scoreObj.p2)}</div>
    ${body}
  </div></section>`;
}

function renderRegulatory(m) {
  const cps = m.pointers.filter(p => COMPLIANCE_BUCKETS.includes(p.bucket));
  const sc = sectionScore(cps);
  // applicable laws (sector+market routed) the prospect must meet — the catalogue, deduped to known FW
  const appCodes = Array.from(new Set([...(m.frameworks || []), ...m.rules.map(r => r.fw).filter(Boolean)]));
  const known = appCodes.map(c => fwFor(null, c) || c).filter(c => FW[c]);
  const lawChips = Array.from(new Set(known)).map(c => `<a href="${FW[c].root}" style="text-decoration:none"><span style="display:inline-block;background:#F8F5EF;border:1px solid #e5e7eb;color:#3D0E0E;font-size:0.72rem;padding:4px 10px;border-radius:20px;margin:0 6px 6px 0">${esc(FW[c].name)} · ${esc(FW[c].reg)}</span></a>`).join('');
  const body = `
    <p style="font-size:0.84rem;color:#1F2937;line-height:1.55;margin:0 0 12px">These are the regulators and laws that apply to a <strong>${esc(m.sector)}</strong> serving <strong>${esc((m.markets.regions || ['UK']).join(', ') || 'UK')}</strong>. Only laws that bind you are shown. Every published word on ${esc(m.domain)} is read against them.</p>
    <div style="margin:0 0 16px">${lawChips || '<span style="font-size:0.74rem;color:#6b6b6b">Framework catalogue loading from your operating markets.</span>'}</div>
    ${cps.length ? `<p style="font-size:0.7rem;color:#3D0E0E;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin:0 0 8px">Where you are exposed today</p>${cps.map(findingCard).join('')}`
      : `<p style="font-size:0.82rem;color:#6b6b6b">No compliance gaps were extractable on this scan. The re-scan at engagement start runs the full catalogue word-by-word.</p>`}`;
  return sectionShell('regulatory', 'Section 1 · Regulatory compliance', `${esc(m.company)} against the laws that bind it`, sc, body);
}

function renderAI(m) {
  // REAL GEO readiness from live signals (not hardcoded). Missing structured data / llms.txt / author E-E-A-T => AI can't cite you.
  const s = m.signals || {};
  const hasSchema = !!(s.json_ld || s.schema || s.structured_data);
  const hasLlms = !!(s.llms_txt);
  const hasAuthor = !!(s.author || s.eeat || s.byline);
  const checks = [
    { k: 'Structured data (Schema.org)', ok: hasSchema, why: 'Without schema, AI engines cannot reliably parse who you are or what you offer, so they omit you from answers.' },
    { k: 'llms.txt / AI access file', ok: hasLlms, why: 'No llms.txt means no explicit signal to AI crawlers about your canonical content.' },
    { k: 'Author + E-E-A-T signals', ok: hasAuthor, why: 'No bylined expertise means Google and LLMs cannot establish Experience, Expertise, Authority, Trust.' },
  ];
  const okN = checks.filter(c => c.ok).length;
  const geo = Math.round((okN / checks.length) * 100);
  const aiF = m.pointers.filter(p => isAI(p.bucket)); const sc = { score: Math.min(geo, sectionScore(aiF).score), p0: aiF.filter(x=>x.severity==='P0').length + (hasSchema?0:1), p1: aiF.filter(x=>x.severity==='P1').length + (hasLlms?0:1)+(hasAuthor?0:1), p2: aiF.filter(x=>x.severity==='P2').length, n: checks.length + aiF.length };
  const aiFindings = m.pointers.filter(p => isAI(p.bucket));
  const body = `
    <p style="font-size:0.84rem;color:#1F2937;line-height:1.55;margin:0 0 12px">Buyers increasingly ask ChatGPT, Claude, Perplexity, Gemini and Google’s AI overview for a <strong>${esc(m.sector)}</strong>. To be cited, an AI engine must be able to read and trust your site. Here is what it finds on ${esc(m.domain)}:</p>
    ${aiFindings.map(findingCard).join('')}
    <div style="display:grid;gap:10px">${checks.map(c => `
      <div style="display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start;background:${c.ok ? '#F2F8F2' : '#FBF1F0'};border-radius:6px;padding:10px 12px">
        <span style="font-size:1.1rem;color:${c.ok ? '#2E7D32' : '#B91C1C'}">${c.ok ? '✓' : '✕'}</span>
        <div><p style="margin:0;font-weight:600;font-size:0.84rem;color:#3D0E0E">${esc(c.k)} ${c.ok ? '<span style="color:#2E7D32;font-size:0.7rem">present</span>' : '<span style="color:#B91C1C;font-size:0.7rem">missing</span>'}</p>
        ${c.ok ? '' : `<p style="margin:3px 0 0;font-size:0.78rem;color:#1F2937">${esc(c.why)}</p>`}</div>
      </div>`).join('')}</div>
    <p style="margin:12px 0 0;font-size:0.82rem;color:#14532d"><strong>How Tamazia fixes it:</strong> we ship full Schema.org markup, an llms.txt, and a bylined E-E-A-T author programme so the AI engines can read, trust and cite ${esc(m.company)}.</p>`;
  return sectionShell('ai-visibility', 'Section 2 · AI search visibility (GEO)', `${esc(m.company)} is ${geo < 50 ? 'largely invisible' : 'partially visible'} to AI search`, sc, body);
}

function renderSEO(m) {
  const sps = m.pointers.filter(p => isSEO(p.bucket));
  const sc = sectionScore(sps);
  const psi = m.psi;
  const cwv = psi ? `<div style="display:flex;gap:14px;flex-wrap:wrap;margin:0 0 14px">
      ${psi.lcp_ms ? `<div style="background:#F8F5EF;border-radius:6px;padding:10px 14px"><p style="margin:0;font-size:0.68rem;color:#6b6b6b;text-transform:uppercase">LCP</p><p style="margin:2px 0 0;font-family:'Times New Roman',serif;font-size:1.3rem;color:${psi.lcp_ms > 2500 ? '#B91C1C' : '#2E7D32'}">${(psi.lcp_ms / 1000).toFixed(1)}s</p></div>` : ''}
      ${psi.cls != null ? `<div style="background:#F8F5EF;border-radius:6px;padding:10px 14px"><p style="margin:0;font-size:0.68rem;color:#6b6b6b;text-transform:uppercase">CLS</p><p style="margin:2px 0 0;font-family:'Times New Roman',serif;font-size:1.3rem;color:${psi.cls > 0.1 ? '#B91C1C' : '#2E7D32'}">${psi.cls}</p></div>` : ''}
    </div>` : '';
  const body = `
    <p style="font-size:0.84rem;color:#1F2937;line-height:1.55;margin:0 0 12px">What search engines and buyers hit when they land on ${esc(m.domain)}, and what it costs you in rankings and revenue.</p>
    ${cwv}
    ${sps.length ? sps.map(findingCard).join('') : '<p style="font-size:0.82rem;color:#6b6b6b">No on-page or technical SEO gaps were extractable on this scan.</p>'}`;
  return sectionShell('seo', 'Section 3 · SEO + technical', `What is costing ${esc(m.company)} rankings and revenue`, sc, body);
}

function renderHero(m, overall, grade, t, topRegs) {
  return `<section style="background:#3D0E0E;color:#F8F5EF;padding:30px 24px"><div style="max-width:1080px;margin:0 auto">
    <p style="font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:#C8A664;margin:0 0 14px;font-weight:700">Tamazia · Personalised regulatory + AI visibility + SEO audit · ${esc(m.country)}</p>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center">
      <div style="text-align:center">${donut(overall, grade.color)}<p style="margin:6px 0 0;font-family:'Times New Roman',serif;font-size:2rem;font-weight:600;color:${grade.color}">${grade.letter}</p><p style="margin:0;font-size:0.74rem;color:rgba(248,245,239,0.7)">${grade.label}</p></div>
      <div>
        <h1 style="font-family:'Times New Roman',serif;font-size:1.9rem;margin:0 0 4px;line-height:1.1">${esc(m.company)}</h1>
        <p style="margin:0 0 14px;font-size:0.84rem;color:rgba(248,245,239,0.75)">${esc(m.sector)} · ${esc(m.domain)} · markets: ${esc((m.markets.regions || ['UK']).join(', ') || 'UK')} · 400+ framework catalogue</p>
        <div style="background:rgba(248,245,239,0.06);border-radius:8px;padding:14px 16px">${trajectoryBars(t)}</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;align-items:center">
      <a href="${BOOK}" style="display:inline-block;padding:12px 20px;background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:700;border-radius:4px;font-size:0.84rem">Book the founder call →</a>
      <span style="font-size:0.78rem;color:rgba(248,245,239,0.8)">Lead regulators exposing you: <strong style="color:#fff">${topRegs.join(' · ') || 'sector regulators'}</strong></span>
    </div>
  </div></section>`;
}

function renderPage(m) {
  const reg = m.pointers.filter(p => COMPLIANCE_BUCKETS.includes(p.bucket));
  const seo = m.pointers.filter(p => isSEO(p.bucket));
  const overallScore = sectionScore(m.pointers).score;
  const grade = gradeOf(overallScore);
  const t = trajectory(overallScore);
  const topRegs = Array.from(new Set(reg.map(p => p.fw && FW[p.fw] ? FW[p.fw].reg : null).filter(Boolean))).slice(0, 3);
  const title = `${m.company} · Regulatory + AI + SEO audit · Tamazia`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;color:#1F2937;background:#fff;line-height:1.5}h1,h2{font-family:'Times New Roman',serif;font-weight:500}a:hover{opacity:0.85}</style>
</head><body>
${renderHero(m, overallScore, grade, t, topRegs)}
${renderRegulatory(m)}
${renderAI(m)}
${renderSEO(m)}
<section style="padding:30px 24px;background:#3D0E0E;color:#F8F5EF;text-align:center"><div style="max-width:760px;margin:0 auto">
  <h2 style="font-family:'Times New Roman',serif;font-size:1.5rem;margin:0 0 8px">Aman Pareek reviews every onboarding personally.</h2>
  <p style="font-size:0.84rem;color:rgba(248,245,239,0.8);margin:0 0 16px">A 30-minute confidential conversation with the founder. The lawyer reads it before the algorithm sees it.</p>
  <a href="${BOOK}" style="display:inline-block;padding:13px 24px;background:#C8A664;color:#3D0E0E;text-decoration:none;font-weight:700;border-radius:4px">Open the founder's calendar →</a>
</div></section>
<section style="padding:16px 24px;background:#1F2937;color:rgba(248,245,239,0.6);font-size:0.7rem;line-height:1.55"><div style="max-width:1080px;margin:0 auto">
  <p style="margin:0">Produced by the Tamazia regulatory + AI + SEO audit engine against a 400+ framework catalogue. Marketing diagnostic, not legal advice; where regulatory risk is identified, consult a regulated solicitor. Tamazia Ltd, London. Every finding above is tied to live evidence on ${esc(m.domain)}.</p>
</div></section>
</body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/audit\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)\/?$/);
    if (!m) {
      const legacy = url.pathname.match(/^\/audit\/([a-z0-9-]+?)(?:-complimentary-audit)?\/?$/i);
      return new Response('Audit links are personalised. Please use the full link from your email.', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    const slug = m[1], hash = m[2];
    const res = await loadAudit(env, slug, hash);
    if (res.error === 'expired') return Response.redirect(TAMAZIA_BASE + '/expired', 302);
    if (res.error) return new Response('Audit not found or not yet minted (' + res.error + ').', { status: 404, headers: { 'content-type': 'text/plain' } });
    let html;
    try { html = renderPage(adapt(res.row)); }
    catch (e) { return new Response('Audit render error.', { status: 500, headers: { 'content-type': 'text/plain' } }); }
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'public,max-age=120', 'x-tamazia-audit': 'v14-live' } });
  }
};

export { adapt, renderPage, sectionScore, loadAudit };
