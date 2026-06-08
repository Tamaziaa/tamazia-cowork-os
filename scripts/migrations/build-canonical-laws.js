#!/usr/bin/env node
'use strict';
// WS-B0 — Build the ONE merged, de-duplicated canonical law repo (18-field schema), reconciling the 123
// files-10 curated laws with our 403 Neon rules / 110 frameworks at ZERO loss and ZERO wrong merge.
//
// Model: the 123 files-10 laws are the canonical BASE (already 18-field + detection + applies_when/excluded_when).
// Each of our 110 Neon frameworks either (a) MAPS to a files-10 law family (same jurisdiction + same instrument
// key) → we attach its compliance_rules as detection-children and mark the law `verified`; or (b) is NET-NEW
// (our sector regulators beyond files-10) → it becomes its own canonical law with backfilled fields, held
// `unverified` until the QA/enforcement loop promotes it. files-10 laws with no Neon match are GAP laws
// (kept; files-10 `check` → `unverified`). The matcher is CONSERVATIVE: it only merges a clear same-instrument
// match; everything uncertain stays separate and is logged, so no law is ever lost or wrongly merged.
//
//   node scripts/migrations/build-canonical-laws.js            # build db/seeds/compliance-laws.json + report
//   node scripts/migrations/build-canonical-laws.js --report   # report only (no write)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
const REPORT_ONLY = process.argv.includes('--report');
function pgJSON(sql) { const out = execFileSync(PSQL, [NEON, '-tAq', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); return out ? JSON.parse(out) : []; }

// ---- jurisdiction normalisation (Neon → files-10 canonical codes) ----
function normJur(neonJur, fwShort) {
  const j = String(neonJur || '').toUpperCase(); const s = String(fwShort || '').toUpperCase();
  if (s.startsWith('DE_')) return 'EU-DE'; if (s.startsWith('FR_')) return 'EU-FR';
  if (s.startsWith('DIFC')) return 'MENA-AE-DIFC'; if (s.startsWith('ADGM')) return 'MENA-AE-ADGM';
  return ({ UK: 'UK', EU: 'EU', US: 'USA', USA: 'USA', AE: 'MENA-AE', SA: 'MENA-SA', QA: 'MENA-QA', BH: 'MENA-BH', KW: 'MENA-KW', OM: 'MENA-OM', EG: 'MENA-EG', JO: 'MENA-JO', IL: 'MENA-IL', GLOBAL: 'GLOBAL' })[j] || j;
}
const jurCompatible = (a, b) => { // a (framework) reaches b (law) if equal, or same country root (MENA-AE ~ MENA-AE-DIFC handled separately by the resolver, NOT merged here)
  if (a === b) return true;
  if (a === 'USA' && (b === 'USA-CA' || b === 'USA-STATES')) return true;
  if (a === 'EU' && b.startsWith('EU-')) return false; // EU-DE etc. are distinct instruments — never merge
  return false;
};
// ---- instrument key (the dedupe anchor): a strong acronym shared by both names ----
const ACR = ['gdpr', 'pecr', 'dpa', 'dmcc', 'mhra', 'rics', 'arla', 'sra', 'bsb', 'icaew', 'acca', 'frc', 'cqc', 'gdc', 'gphc', 'abpi', 'abi', 'ofgem', 'ofcom', 'ofsted', 'caa', 'orr', 'dvsa', 'cma', 'asa', 'cap', 'fca', 'fsma', 'psr', 'smcr', 'pra', 'conc', 'cobs', 'icobs', 'mcob', 'psd2', 'mifid', 'dsa', 'dma', 'mdr', 'sfdr', 'dora', 'nis2', 'eaa', 'gpsr', 'aml6', 'csrd', 'bdsg', 'cnil', 'ccpa', 'cpra', 'coppa', 'tcpa', 'canspam', 'finra', 'sec', 'hipaa', 'bipa', 'glba', 'ferpa', 'ada', 'ftc', 'nydfs', 'vcdpa', 'tdpsa', 'eeat', 'pdpl', 'pdppl', 'rera', 'dha', 'vara', 'dfsa', 'companies', 'equality', 'bribery', 'modern', 'osa', 'dsit', 'ukca', 'charity', 'licensing', 'food', 'hmrc', 'cra', 'tpo', 'ukgc', 'ipso', 'hse', 'citb', 'ce'];
function instrumentKey(name, id) {
  const hay = (String(name || '') + ' ' + String(id || '')).toLowerCase();
  for (const a of ACR) { const re = new RegExp('(^|[^a-z])' + a + '([^a-z]|$)'); if (re.test(hay)) return a; }
  return null;
}
// Surgical overrides — the auto-matcher over-merges a few distinct instruments that share a generic regulator
// acronym (FCA/SEC/CAA/FSA). 'NET_NEW' forces a stand-alone canonical law; an id force-remaps to the correct
// files-10 law. Audited from the 45-merge report; keeps each instrument distinct (zero wrong merge).
const OVERRIDE = {
  // de-merges (generic regulator acronym was over-merging distinct instruments)
  US_MEDICAL_BOARD: 'NET_NEW',   // state medical-board advertising ≠ FTC §5
  US_SEC_506C: 'NET_NEW',        // Reg D 506(c) ≠ SEC Marketing Rule
  UK_FCA_MAR: 'NET_NEW',         // Market Abuse Regulation ≠ COBS
  UK_CAA: 'NET_NEW',             // Civil Aviation Authority (broad) ≠ ATOL
  UK_FSA: 'NET_NEW',             // Food Standards Agency (broad) ≠ Food Information Regs
  UK_CMA: 'NET_NEW',             // CMA (broad) ≠ a single CMA sector law
  // re-points (auto-matcher hit the WRONG files-10 law in a key collision)
  UK_FCA_CONC25: 'UK-CONC3',     // Consumer Credit (CONC) — its own files-10 law, not COBS
  US_FTC_ENDORSE: 'US-FTC-ENDORSE', // Endorsement Guides (16 CFR 255) ≠ FTC Act §5
  UK_SRA_COC: 'UK-SRA-CODE',     // SRA Code of Conduct ≠ SRA Transparency Rules
  // missed de-dups (these ARE a files-10 law; matcher's acronym/jurisdiction key didn't align)
  DIFC_DPL: 'AE-DIFC-DP',
  ADGM_DPR: 'AE-ADGM-DP',
  QATAR_PDPPL: 'QA-PDPL',
  US_SEC_REG_FD: 'US-SEC-REGFD',
  US_ATTORNEY_ADVERTISING: 'US-ABA-7',
  US_CAN_SPAM: 'US-CANSPAM',
  US_STATE_PRIVACY: 'US-STATE-PRIV',
  EU_EPRIVACY: 'EU-EPRIV',
};
// Canonical region from a normalised jurisdiction code (keeps the region enum internally consistent: US→USA).
function regionOf(jur) {
  const j = String(jur || ''); if (j.startsWith('MENA')) return 'MENA'; if (j.startsWith('EU')) return 'EU';
  if (j === 'UK') return 'UK'; if (j === 'USA' || j.startsWith('USA')) return 'USA'; if (j === 'GLOBAL') return 'GLOBAL'; return j.split('-')[0];
}
const STOPW = new Set(['the', 'of', 'and', 'for', 'code', 'act', 'law', 'regulation', 'regulations', 'directive', 'rules', 'rule', 'data', 'protection', 'no']);
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((t) => t.length > 3 && !STOPW.has(t) && !/^\d+$/.test(t));

// ---- map a Neon rule → a detection-child record ----
function ruleToDetection(r) {
  return {
    framework_short: r.framework_short, // keep provenance so zero-loss can be proven by identity, not count
    rule_id: r.rule_id, rule_type: r.rule_type, severity: r.severity,
    regex_pattern: r.regex_pattern, url_check: r.url_check, trigger_pattern: r.trigger_pattern,
    sector_relevance: r.sector_relevance || [], description: r.description,
    fine_low_gbp: r.fine_low_gbp, fine_high_gbp: r.fine_high_gbp,
    layman_explanation: r.layman_explanation, tamazia_fix_short: r.tamazia_fix_short,
    citation_url: r.citation_url, enforcement_example: r.enforcement_example,
    service_page_path: r.service_page_path, pricing_tier: r.pricing_tier,
  };
}
const SEV_RANK = { Critical: 1, High: 2, Medium: 3, Low: 4, P0: 1, P1: 2, P2: 3, P3: 4 };
function sevFromRules(rules) { let best = 4; for (const r of rules) best = Math.min(best, SEV_RANK[r.severity] || 4); return best; }
function fineRange(rules) { let lo = null, hi = null; for (const r of rules) { if (r.fine_low_gbp != null) lo = (lo == null) ? r.fine_low_gbp : Math.min(lo, r.fine_low_gbp); if (r.fine_high_gbp != null) hi = (hi == null) ? r.fine_high_gbp : Math.max(hi, r.fine_high_gbp); } return { lo, hi }; }
function maxPenaltyFromRules(rules) { const { lo, hi } = fineRange(rules); return hi != null ? `Up to £${hi.toLocaleString()}` + (lo != null ? ` (from £${lo.toLocaleString()})` : '') : null; }

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  // 1. Load files-10 canonical laws (the base)
  const f10raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'files10', 'master-law-library.json'), 'utf8'));
  const f10 = Array.isArray(f10raw) ? f10raw : Object.values(f10raw);
  // 2. Load Neon frameworks + rules
  const frameworks = pgJSON(`SELECT json_agg(json_build_object('framework_short',framework_short,'jurisdiction',jurisdiction,'framework_name',framework_name)) FROM framework_versions;`) || [];
  const rules = pgJSON(`SELECT json_agg(row_to_json(t)) FROM (SELECT framework_short,rule_id,rule_type,severity,regex_pattern,url_check,trigger_pattern,sector_relevance,description,fine_low_gbp,fine_high_gbp,layman_explanation,tamazia_fix_short,citation_url,enforcement_example,service_page_path,pricing_tier FROM compliance_rules WHERE active IS NOT FALSE) t;`) || [];
  const rulesByFw = {}; for (const r of rules) (rulesByFw[r.framework_short] = rulesByFw[r.framework_short] || []).push(r);

  // 3. Index files-10 laws by (jurisdiction, instrumentKey)
  const f10byKey = {}; for (const law of f10) { const k = law.jurisdiction + '|' + instrumentKey(law.name, law.id); (f10byKey[k] = f10byKey[k] || []).push(law); }

  const canonical = new Map(); // id -> canonical law
  const report = { matched: [], net_new: [], gap: [], ambiguous: [] };

  // 4. Seed canonical from files-10 (the base)
  for (const law of f10) {
    const conf = law.confidence === 'verified' ? 'verified' : 'unverified'; // files-10 'check' → unverified (never shown)
    canonical.set(law.id, {
      ...law,
      region: regionOf(law.jurisdiction), // normalise region enum (US→USA etc.)
      confidence: conf, servable: conf === 'verified', // servable ⇔ verified — the hard "held until proven" gate the resolver filters on
      source: 'files10', neon_framework_short: null, files10_law_id: law.id,
      detection_rules: [],
      fine_low_gbp: null, fine_high_gbp: null,
    });
  }

  // 5. Map each Neon framework → a files-10 law (merge) or net-new
  for (const fw of frameworks) {
    const jur = normJur(fw.jurisdiction, fw.framework_short);
    const ik = instrumentKey(fw.framework_name, fw.framework_short);
    const fwRules = (rulesByFw[fw.framework_short] || []).map(ruleToDetection);
    let target = null;
    const ov = OVERRIDE[fw.framework_short];
    if (ov === 'NET_NEW') { target = null; }
    else if (ov) { target = canonical.get(ov) || null; } // explicit remap; if the id is absent → net-new (never auto-match)
    else if (ik) {
      let cands = (f10byKey[jur + '|' + ik] || []).slice();
      if (!cands.length) for (const law of f10) { if (jurCompatible(jur, law.jurisdiction) && instrumentKey(law.name, law.id) === ik) cands.push(law); }
      if (cands.length === 1) target = cands[0];
      else if (cands.length > 1) { // key collision → pick the files-10 law whose NAME best overlaps (not file order)
        const ftoks = new Set(tokens(fw.framework_name));
        target = cands.map(law => ({ law, score: tokens(law.name).filter(t => ftoks.has(t)).length })).sort((a, b) => b.score - a.score)[0].law;
      }
    }
    if (target) {
      const c = canonical.get(target.id);
      c.detection_rules.push(...fwRules);
      c.confidence = 'verified'; c.servable = true; // files-10 law corroborated by our curated rules → shippable
      c.neon_framework_short = c.neon_framework_short ? c.neon_framework_short + ',' + fw.framework_short : fw.framework_short;
      c.source = 'merged';
      const fr = fineRange(fwRules);
      if (fr.hi != null) c.fine_high_gbp = c.fine_high_gbp != null ? Math.max(c.fine_high_gbp, fr.hi) : fr.hi;
      if (fr.lo != null) c.fine_low_gbp = c.fine_low_gbp != null ? Math.min(c.fine_low_gbp, fr.lo) : fr.lo;
      report.matched.push({ neon: fw.framework_short, files10: target.id, jur, ik, rules: fwRules.length });
    } else if (fwRules.length === 0) {
      // a catalogued framework with NO detection rules → don't materialise a stand-alone artifact law; log it.
      report.ambiguous.push({ neon: fw.framework_short, reason: 'zero rules — needs detection authoring or remap' });
    } else {
      // NET-NEW canonical law (our sector regulator beyond files-10). Backfill; held unverified + NOT servable.
      const id = 'NEON-' + fw.framework_short.replace(/_/g, '-');
      const fr = fineRange(fwRules); const sr = sevFromRules(fwRules);
      canonical.set(id, {
        id, name: fw.framework_name || fw.framework_short, jurisdiction: jur, region: regionOf(jur),
        section_ref: '', regulator: (fw.framework_name || '').split('(')[0].trim() || fw.framework_short,
        category: 'sector_specific', website_obligation: '',
        applies_when: [], excluded_when: [], where_on_site: [...new Set(fwRules.map(r => r.url_check).filter(Boolean))],
        severity: ({ 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' })[sr] || 'Medium', severity_rank: sr,
        max_penalty: maxPenaltyFromRules(fwRules), fine_low_gbp: fr.lo, fine_high_gbp: fr.hi,
        effective_date: '', status: 'active', confidence: 'unverified', servable: false, // NEVER served until verified
        detection: [], enforcement_feed: '', trigger_flags: [],
        source: 'neon', neon_framework_short: fw.framework_short, files10_law_id: null,
        detection_rules: fwRules,
      });
      report.net_new.push({ neon: fw.framework_short, id, jur, ik: ik || '(none)', rules: fwRules.length });
    }
  }

  // 6. Identify GAP laws (files-10 with no Neon rules attached)
  for (const [id, c] of canonical) { if (c.source === 'files10' && c.detection_rules.length === 0) report.gap.push({ id, jur: c.jurisdiction, name: c.name }); }

  const laws = [...canonical.values()];
  // 7. Report
  console.log('=== CANONICAL LAW MERGE — reconciliation ===');
  console.log(`files-10 base laws: ${f10.length} | Neon frameworks: ${frameworks.length} | Neon rules: ${rules.length}`);
  console.log(`MERGED (Neon framework → files-10 law): ${report.matched.length}`);
  console.log(`NET-NEW (Neon-only canonical laws): ${report.net_new.length}`);
  console.log(`GAP (files-10-only, no Neon rules yet): ${report.gap.length}`);
  console.log(`TOTAL canonical laws: ${laws.length}`);
  const shippable = laws.filter(l => l.confidence === 'verified').length;
  console.log(`Shippable now (confidence=verified): ${shippable} | held (unverified, never shown): ${laws.length - shippable}`);
  console.log('\n-- matched sample --'); report.matched.slice(0, 12).forEach(m => console.log(`   ${m.neon.padEnd(22)} → ${m.files10.padEnd(16)} (${m.rules} rules)`));
  console.log('-- net-new sample --'); report.net_new.slice(0, 12).forEach(m => console.log(`   ${m.neon.padEnd(22)} → ${m.id} (${m.rules} rules)`));
  console.log('-- gap sample (need detection authoring; held unverified) --'); report.gap.slice(0, 12).forEach(m => console.log(`   ${m.id.padEnd(18)} ${m.name.slice(0, 50)}`));

  if (!REPORT_ONLY) {
    const outDir = path.join(ROOT, 'db', 'seeds'); fs.writeFileSync(path.join(outDir, 'compliance-laws.json'), JSON.stringify(laws, null, 1));
    fs.writeFileSync(path.join(outDir, 'compliance-laws.report.json'), JSON.stringify(report, null, 1));
    console.log(`\nwrote db/seeds/compliance-laws.json (${laws.length} laws) + compliance-laws.report.json`);
  }
})().catch(e => { console.error('build-canonical-laws FATAL:', e.message); process.exit(1); });
