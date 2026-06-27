// Catalogue-driven CONNECTION LAYER (the 400+ framework spine).
// Given the firm's operating jurisdictions + sector + site signals/text, return ONLY the frameworks and
// rules that genuinely bind it, from the FULL compliance_rules + framework_versions catalogue.
// Hard gates, fail-closed, zero jurisdiction leakage. Pure given a loaded catalogue (so it is testable).
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const EU_ISO = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);
function normJuris(j) { j = String(j || '').toUpperCase().trim(); if (j === 'GB' || j === 'GBR') return 'UK'; if (j === 'USA') return 'US'; if (j === 'UAE') return 'AE'; return j; }

// Frameworks that apply to EVERY sector (privacy, cookies, consumer protection, equality, advertising, Google).
const UNIVERSAL_FW = new Set([
  'GOOGLE_EEAT',
  'UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','UK_DMCC_2024','UK_COMPANIES_ACT','UK_EQUALITY_2010','UK_CRA_2015','UK_CMA','UK_TRADING_STANDARDS','UK_ASA_CAP',
  // UK_MODERN_SLAVERY removed from UNIVERSAL: MSA s.54 only binds commercial organisations with UK turnover ≥£36M.
  // It now lives only in the sector map (manufacturing, construction, transport, energy) — so SME clinics/schools/
  // law firms never get it, while large supply-chain sectors still do. (F-1 fix / 5-of-9 false-positive class)
  'EU_GDPR','EU_EPRIVACY','EU_AI_ACT','EU_EAA_2025','EU_DSA',
  'US_FTC','US_CPRA','US_CCPA','US_FTC_ENDORSE','US_ADA','US_TCPA','US_VCDPA','US_TDPSA',
  'US_STATE_PRIVACY','UAE_PDPL','DIFC_DPL','ADGM_DPR','SAUDI_PDPL','QATAR_PDPPL','DE_BDSG','FR_CNIL_2025',
]);
// SECTOR_PARENTS: signals.js SECTOR_RX and jurisdiction-router.js SECTOR_MAP use different vocab for the
// same sector. This bridges them so GATE B0 + GATE B rule matching works correctly end-to-end.
// Also maps child sectors (aesthetics → healthcare) so inherited regulator rules fire correctly.
const SECTOR_PARENTS = {
  // signals.js → SECTOR_MAP canonical name
  'legal':      ['law-firms'],        // signals: 'legal' → SECTOR_MAP: 'law-firms'
  'financial':  ['finance'],          // signals: 'financial' → SECTOR_MAP: 'finance'
  'realestate': ['real-estate'],      // signals: 'realestate' → SECTOR_MAP: 'real-estate'
  'wellness':   ['fitness'],          // signals: 'wellness' → SECTOR_MAP: 'fitness'
  'fb':         ['hospitality', 'food'], // signals: 'fb' → SECTOR_MAP: 'hospitality'/'food'
  // child → parent (inherits parent's regulator stack)
  'aesthetics': ['healthcare'],       // aesthetic clinics inherit CQC/MHRA from healthcare
  'aesthetic':  ['healthcare'],
  'dental':     ['healthcare'],       // dental inherits MHRA/CQC from healthcare
  'barristers': ['law-firms'],        // barristers inherit SRA-adjacent rules
};

let _fwToSectors = null;
function fwToSectors() {
  if (_fwToSectors) return _fwToSectors;
  _fwToSectors = {};
  try { const { SECTOR_MAP } = require('./jurisdiction-router.js'); for (const [sec, fws] of Object.entries(SECTOR_MAP)) for (const fw of fws) (_fwToSectors[fw] = _fwToSectors[fw] || new Set()).add(sec); } catch (_e) {}
  return _fwToSectors;
}
// GATE B0 (framework sector): a framework applies to a sector if it is universal, OR the curated sector map
// lists it for that sector (direct or via parent alias), OR it has a rule whose sector_relevance names the sector.
function fwSectorOK(fw, sector, rulesForFw) {
  if (!sector) return true;                         // unknown sector: do not over-filter
  if (UNIVERSAL_FW.has(fw)) return true;
  const m = fwToSectors()[fw];
  if (m && m.has(sector)) return true;
  // check parent sectors — if 'healthcare' maps to this fw and sector='aesthetics', allow it
  const parents = SECTOR_PARENTS[sector] || [];
  if (parents.some(p => m && m.has(p))) return true;
  if ((rulesForFw || []).some(r => Array.isArray(r.sector_relevance) && (r.sector_relevance.includes(sector) || parents.some(p => r.sector_relevance.includes(p))))) return true;
  return false;                                     // sector-specific framework for a different sector -> excluded
}

// Expand a set of detected jurisdiction codes into the full set the firm is bound by.
function expandJurisdictions(list) {
  const J = new Set((list || []).map(normJuris).filter(Boolean));
  if ([...J].some(j => EU_ISO.has(j))) J.add('EU');       // any EU member => EU-level law applies
  return J;
}

// signal-aware trigger: structured signals can satisfy a rule trigger even if the literal phrase is absent.
function signalSatisfiesTrigger(triggerPattern, signals) {
  const tp = String(triggerPattern || '').toLowerCase(); const s = signals || {};
  if (s.uses_ai && /\bai\b|artificial intelligence|model|chatbot|automated decision|algorithm/.test(tp)) return true;
  if (s.payments && /pay|subscrip|checkout|card|recurring|billing|basket|cart/.test(tp)) return true;
  if (s.biometrics && /biometric|facial|fingerprint|face/.test(tp)) return true;
  if (s.ugc && /review|comment|user[- ]generated|forum|post|upload/.test(tp)) return true;
  return false;
}

// CAPABILITY GATE (Aman directive): some frameworks bind ONLY if the firm actually exhibits the capability
// on its live site — a real structured signal OR an explicit on-page mention. A clinic with no AI system is
// not subject to the EU AI Act; a firm that markets no medical device is not subject to EU MDR. This stops
// universal/jurisdiction attachment from inflating exposure (e.g. the AI Act's GBP30m ceiling) with no basis.
// F-4 fix: UK_CRA_2015 (Consumer Rights Act) applies ONLY to B2C traders — pure B2B advisory firms are
// legally exempt. Detect B2C via payment signals OR consumer-facing language. Removes false positives on
// law firms, finance advisers, B2B SaaS platforms etc.
const CAP_GATE = {
  EU_AI_ACT:   { sig: 'uses_ai',  rx: /\b(automated decision[- ]?making|\bA\.?I\.? system|machine learning model|generative a\.?i\.?|large language model|recommendation engine|facial recognition|biometric (identification|categorisation)|predictive analytics|virtual assistant|chatbot)\b/i },
  EU_MDR:      { sig: null,       rx: /\b(medical device|ce[- ]?mark(ed|ing)?|in[- ]vitro|implantable|class ii[ab]|software as a medical device|\bSaMD\b|notified body)\b/i },
  UK_CRA_2015:      { sig: 'payments', rx: /\b(consumer|checkout|cart|buy now|add to (cart|basket)|subscribe|order online|shop now|statutory rights|consumer rights|14.{0,3}day|cooling.{0,3}off|refund policy|returns policy|membership plan|pricing plan|subscription plan)\b/i },
  // F-5 fix: UK Companies Act s.82 registration-display obligations apply ONLY to incorporated entities
  // (Ltd/LLP/PLC/CIC). Sole traders, partnerships, and non-UK entities have no registered company number.
  // Gate on detecting a corporate entity signal in the corpus — if the firm is not a registered company,
  // the absence-of-number finding is a false positive.
  UK_COMPANIES_ACT: { sig: null, rx: /\b(ltd\.?|limited|llp\b|plc\b|incorporated|co\.? reg\.?|company (no|number|reg|registration)|registered (in|with) (england|scotland|wales|northern ireland)|registered office|companies house)\b/i },
};

function secMatches(sectors, sec) {
  if (!sectors.length || !sec) return true;
  if (sectors.includes(sec)) return true;
  const parents = SECTOR_PARENTS[sec] || [];
  return parents.some(p => sectors.includes(p));
}

// catalogue = { frameworks:[{framework_short,jurisdiction}], rules:[{framework_short,sector_relevance[],rule_type,trigger_pattern,...}] }
function connect({ catalogue, jurisdictions, sector, signals, text }) {
  const sec = String(sector || '').toLowerCase().trim();
  const sig = signals || {};
  const t = String(text || '').toLowerCase();
  const J = expandJurisdictions(jurisdictions);
  const fvJuris = {}; for (const f of (catalogue.frameworks || [])) fvJuris[f.framework_short] = String(f.jurisdiction || '').toUpperCase();
  const byFw = {}; for (const r of (catalogue.rules || [])) (byFw[r.framework_short] = byFw[r.framework_short] || []).push(r);

  const gates = { jurisdiction_filtered: [], sector_filtered: [], trigger_filtered: [], regex_invalid: [] };
  const connectedFw = new Set(); const connectedRules = [];

  for (const fw of Object.keys(byFw)) {
    const juris = fvJuris[fw] || '';
    // GATE A · JURISDICTION: framework must belong to a jurisdiction the firm operates in. GLOBAL always applies.
    const jurOK = juris === 'GLOBAL' || J.has(juris);
    if (!jurOK) { gates.jurisdiction_filtered.push(fw); continue; }
    // GATE B0 · framework-sector applicability (stops pharma/accounting/energy frameworks leaking into, say, a law firm)
    if (!fwSectorOK(fw, sec, byFw[fw])) { gates.sector_filtered.push(fw); continue; }
    // CAPABILITY GATE: capability-scoped frameworks require a real on-site signal or explicit mention.
    const _cap = CAP_GATE[fw];
    if (_cap && !((_cap.sig && sig[_cap.sig]) || (_cap.rx && _cap.rx.test(t)))) { gates.trigger_filtered.push(fw); continue; }
    let anyRule = false, triggerHeld = false, sectorHeld = false;
    for (const r of byFw[fw]) {
      const sectors = Array.isArray(r.sector_relevance) ? r.sector_relevance : [];
      // GATE B · SECTOR: empty sector list = universal; else firm sector must match (direct or parent alias).
      if (!secMatches(sectors, sec)) { sectorHeld = true; continue; }
      // GATE C · TRIGGER: trigger_then_check rules only connect when the trigger is present (text or signal).
      if (r.rule_type === 'trigger_then_check' && r.trigger_pattern) {
        let trig = false;
        try { trig = new RegExp(r.trigger_pattern, 'i').test(t); } catch (_e) { gates.regex_invalid.push(r.rule_id); }
        if (!trig) trig = signalSatisfiesTrigger(r.trigger_pattern, sig);
        if (!trig) { triggerHeld = true; continue; }
      }
      anyRule = true; connectedRules.push(r);
    }
    if (anyRule) connectedFw.add(fw);
    else if (triggerHeld) gates.trigger_filtered.push(fw);
    else if (sectorHeld) gates.sector_filtered.push(fw);
  }
  return { frameworks: Array.from(connectedFw).sort(), rules: connectedRules, jurisdictions: Array.from(J), gates };
}

// --- Neon catalogue loader (engine use). Cached in-process. ---
let _cat = null;
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return ''; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (_e) { return ''; } }
function loadCatalogue() {
  if (_cat) return _cat;
  const fw = pg("SELECT framework_short, COALESCE(jurisdiction,'') FROM framework_versions").trim();
  const frameworks = fw ? fw.split('\n').filter(Boolean).map(l => { const [framework_short, jurisdiction] = l.split('\t'); return { framework_short, jurisdiction }; }) : [];
  const rl = pg("SELECT framework_short, rule_id, COALESCE(rule_type,'must_appear'), COALESCE(trigger_pattern,''), COALESCE(array_to_string(sector_relevance,'|'),''), COALESCE(severity,'P2') FROM compliance_rules WHERE active=TRUE").trim();
  const rules = rl ? rl.split('\n').filter(Boolean).map(l => { const [framework_short, rule_id, rule_type, trigger_pattern, sectors, severity] = l.split('\t'); return { framework_short, rule_id, rule_type, trigger_pattern: trigger_pattern || null, sector_relevance: sectors ? sectors.split('|').filter(Boolean) : [], severity }; }) : [];
  _cat = { frameworks, rules };
  return _cat;
}

module.exports = { connect, loadCatalogue, expandJurisdictions, normJuris, EU_ISO, UNIVERSAL_FW, fwToSectors };
