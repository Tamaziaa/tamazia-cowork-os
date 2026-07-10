'use strict';
// BLIND-SEND VERIFIER — blueprint E-101..E-110. Fail-closed: any red => verified=false with reasons.
const DATA_ME = ['UAE_PDPL', 'DIFC_DPL', 'ADGM_DPR'];
const THRESHOLD_US = ['US_CPRA', 'US_CCPA', 'US_VCDPA', 'US_TDPSA'];
function verifyPayload(p) {
  p = p || {};
  const R = []; const ok = (c, code, detail) => { if (!c) R.push({ code, detail: String(detail == null ? '' : detail).slice(0, 200) }); };
  const fams = ((p.jurisdiction_families && p.jurisdiction_families.families) || (p.engine_jurisdictions || [])).map(x => String(x).toUpperCase());
  const nexus = p.nexus || {};
  const binding = Object.keys(p.binding || {});
  const fp = p.firm_profile || {};
  const shipped = (p.pointers || []).filter(x => x && x.state !== 'NEEDS_REVIEW');
  ok(!(fp.sector_confident === false) || !binding.some(f => /SRA|HIPAA|FCA_|DHA|CQC|GDC|SMCR|RICS|ARLA/i.test(f)), 'V01_sector_laws_on_unconfident_sector', binding.join(','));
  const me = binding.filter(f => DATA_ME.includes(f)); ok(me.length <= 1, 'V02_multiple_me_data_regimes', me.join(','));
  ok(!(binding.includes('EU_GDPR') && !fams.includes('EU')), 'V02_eu_gdpr_without_eu_family', '');
  ok(!(binding.some(f => /^UK_/.test(f)) && !fams.includes('UK')), 'V02_uk_law_without_uk_family', binding.filter(f => /^UK_/.test(f)).join(','));
  ok(!(binding.some(f => /^(UAE_|AE_)/.test(f)) && !fams.includes('AE')), 'V02_ae_law_without_ae_family', binding.filter(f => /^(UAE_|AE_)/.test(f)).join(','));
  ok(!(binding.some(f => /^SAUDI_/.test(f)) && !fams.includes('SA')), 'V02_sa_law_without_sa_family', '');
  ok(!(binding.some(f => /^QATAR_/.test(f)) && !fams.includes('QA')), 'V02_qa_law_without_qa_family', '');
  for (const t of THRESHOLD_US) ok(!binding.includes(t) || !!(p.threshold_evidence && p.threshold_evidence[t]) || fams.includes('US'), 'V03_threshold_law_unevidenced', t);
  ok(!shipped.some(x => x.gate_reason), 'V04_gated_finding_shipped', (shipped.find(x => x.gate_reason) || {}).gate_reason);
  ok(!shipped.some(x => (x.kind === 'absence' || x.status === 'miss') && !(x.absence_evidence && (x.absence_evidence.target_url || x.absence_evidence.pages_checked)) && !(x.checked_urls || []).length), 'V05_absence_without_proof', '');
  ok(!shipped.some(x => String(x.regulator || '') === 'Sector regulator'), 'V06_placeholder_regulator', '');
  const NXC = { UK: ['UK'], EU: ['EU'], US: ['USA', 'US'], AE: ['AE'], SA: ['SA'], QA: ['QA'], ME: ['AE', 'SA', 'QA'] };
  for (const f of fams) { const ks = NXC[f] || [f];
    ok(ks.some(k => nexus[k] && (nexus[k].established_in || nexus[k].serves_customers_in || nexus[k].serves)), 'V07_family_without_nexus_evidence', f); }
  const sec = String(p.detected_sector || '');
  const foreign = { 'law-firms': /HIPAA|CQC|DHA_|GDC/i, healthcare: /\bSRA_|FCA_COND|SMCR|ARLA/i, 'real-estate': /HIPAA|SRA_|GDC/i, finance: /\bSRA_|CQC|GDC|DHA_/i, accounting: /HIPAA|DHA_|CQC/i };
  ok(!(foreign[sec] && binding.some(f => foreign[sec].test(f))), 'V08_foreign_sector_law', binding.filter(f => foreign[sec] && foreign[sec].test(f)).join(','));
  ok(!/statutory max|maximum fine|17\.5M or 4%/i.test(String((p.exec_summary && (p.exec_summary.headline || p.exec_summary.title)) || '')), 'V09_statutory_max_in_headline', '');
  // V-11 (blind-send hard floor): an audit that could not assess the live site is NEVER outreach-eligible,
  // whatever laws the catalogue attaches from registered-country metadata. Kills the unassessed-green blind spot.
  const _unassessed = p.compliance_unassessed === true || String(p.compliance_unassessed) === 'true'
    || (p.scan && p.scan.reachable === false) || ((p.pages_crawled || []).length === 0);
  ok(!_unassessed, 'V11_unassessed_crawl', (p.pages_crawled || []).length + ' pages');
  ok(!!p.domain && !!p.detected_sector, 'V10_missing_core_fields', '');
  ok(!shipped.some(x => x.citation === ''), 'V10_empty_citation', '');
  return { verified: R.length === 0, reasons: R, checked_at: new Date().toISOString(), verifier: 'v1-blueprint-E101-E110' };
}
module.exports = { verifyPayload };
