// Catalogue-driven CONNECTION LAYER (the 400+ framework spine).
// Given the firm's operating jurisdictions + sector + site signals/text, return ONLY the frameworks and
// rules that genuinely bind it, from the FULL compliance_rules + framework_versions catalogue.
// Hard gates, fail-closed, zero jurisdiction leakage. Pure given a loaded catalogue (so it is testable).
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const { EU_ISO, normJuris } = require('./registry/jurisdiction.js');

// Frameworks that apply to EVERY sector (privacy, cookies, consumer protection, equality, advertising, Google).
const UNIVERSAL_FW = new Set([
  'GOOGLE_EEAT',
  'UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','UK_DMCC_2024','UK_COMPANIES_ACT','UK_EQUALITY_2010','UK_CRA_2015','UK_CMA','UK_TRADING_STANDARDS','UK_ASA_CAP',
  // UK_MODERN_SLAVERY removed from UNIVERSAL: MSA s.54 only binds commercial organisations with UK turnover ≥£36M.
  // It now lives only in the sector map (manufacturing, construction, transport, energy) — so SME clinics/schools/
  // law firms never get it, while large supply-chain sectors still do. (F-1 fix / 5-of-9 false-positive class)
  'EU_GDPR','EU_EPRIVACY','EU_AI_ACT','EU_EAA_2025','EU_DSA',
  'US_FTC','US_CPRA','US_CCPA','US_FTC_ENDORSE','US_ADA','US_TCPA','US_VCDPA','US_TDPSA',
  // US_STATE_PRIVACY removed (legal-QA P1): non-citable catch-all that duplicated the named state acts
  // (CCPA/CPRA/VCDPA/TDPSA). The named, citable statutes carry the obligation; the catch-all only added noise.
  'UAE_PDPL','DIFC_DPL','ADGM_DPR','SAUDI_PDPL','QATAR_PDPPL','BAHRAIN_PDPL','OMAN_PDPL','EGYPT_PDPL','JORDAN_PDPL','ISRAEL_PPL','DE_BDSG','FR_CNIL_2025',
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
  // NOTE: barristers is DELIBERATELY not bridged. Barristers/chambers are a distinct regulated node (BSB),
  // NOT a child of solicitors (SRA). Bridging them to 'law-firms' made every non-node-exclusive law-firm
  // framework leak onto chambers (a domain error). sector.js (own TREE parent) + jurisdiction-router SECTOR_MAP
  // already treat them separately; this keeps connect() consistent. UK_BSB attaches via its direct 'barristers'
  // sector_relevance; UK_SRA_* are correctly sector-filtered here.
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
  // FREE-ZONE GATING (legal-QA P0): UAE free zones are distinct legal jurisdictions. DIFC DPL No.5/2020 Art.6
  // binds only DIFC-established entities; ADGM DPR 2021 reg.6 only ADGM-licensed entities. A mainland UAE firm is
  // governed solely by Federal PDPL (Decree-Law 45/2021). Without these gates every AE firm wrongly inherited all
  // three (24 false positives in QA). Gate each free-zone regime on an explicit establishment signal; mainland
  // PDPL (UAE_PDPL, no gate) is the default. Saudi/Qatar federal regimes gate on their own national nexus.
  // Free-zone gates require ESTABLISHMENT context, not the bare zone name — a mainland firm that merely SELLS
  // "DIFC company setup" services must NOT inherit DIFC data law (it is not established there). Match an
  // establishment phrase co-located with the zone, a physical DIFC/ADGM address, or zone-registration wording.
  DIFC_DPL:    { sig: null, rx: /(registered|licen[cs]ed|authorised|regulated|based|established|incorporated|headquarter|domiciled|our (office|firm|practice)|principal place)[^.]{0,40}(difc|dubai international financial centre|dfsa)|(difc|dfsa)[^.]{0,40}(registered|licen[cs]ed|authorised|regulated|established|based)|gate (village|district|avenue)|difc[- ]registered/i },
  ADGM_DPR:    { sig: null, rx: /(registered|licen[cs]ed|authorised|regulated|based|established|incorporated|headquarter|domiciled|our (office|firm|practice)|principal place)[^.]{0,40}(adgm|abu dhabi global market|fsra)|(adgm|fsra)[^.]{0,40}(registered|licen[cs]ed|authorised|regulated|established|based)|al maryah island|adgm[- ]registered/i },
  SAUDI_PDPL:  { sig: null, rx: /\b(saudi arabia|\bKSA\b|riyadh|jeddah|dammam|\.sa\b|sdaia|commercial registration .*saudi)\b/i },
  QATAR_PDPPL: { sig: null, rx: /\b(qatar|doha|\.qa\b|qfc|qatar financial centre)\b/i },
  // CONSUMER-NEXUS GATING (legal-QA P0): DMCCA 2024 Part 4, CMA enforcement, CRA 2015 and Trading Standards bind
  // a trader only in a TRADER-TO-CONSUMER transaction. They were universal with no consumer gate, so pure-B2B
  // advisory/institutional firms got the full consumer stack (~30 FPs). Gate on a real B2C commerce signal; a
  // B2B-only firm (no consumer pricing/booking/checkout) no longer inherits consumer law. (UK_CRA already gated.)
  UK_CMA:               { sig: 'payments', rx: /\b(book (online|now|an?|your)|online booking|appointment|consultation|price list|our prices|prices? from|£\s?\d{2,}|per (session|treatment|night|room|month|person)|reservation|table for \d|add to (cart|basket|bag)|checkout|buy now|shop now|subscribe|membership (from|plan|fee)|enrol|admissions|tuition|donate|gift aid|customers?)\b/i },
  UK_DMCC_2024:         { sig: 'payments', rx: /\b(book (online|now|an?|your)|online booking|appointment|consultation|price list|our prices|prices? from|£\s?\d{2,}|per (session|treatment|night|room|month|person)|reservation|table for \d|add to (cart|basket|bag)|checkout|buy now|shop now|subscribe|membership (from|plan|fee)|enrol|admissions|tuition|donate|gift aid|reviews?|countdown|sale ends)\b/i },
  UK_TRADING_STANDARDS: { sig: 'payments', rx: /\b(book (online|now|an?|your)|online booking|appointment|price list|our prices|prices? from|£\s?\d{2,}|per (session|treatment|night|room|month|person)|reservation|add to (cart|basket|bag)|checkout|buy now|shop now|subscribe|membership (from|plan|fee)|enrol|admissions|tuition)\b/i },
};

function secMatches(sectors, sec) {
  if (!sectors.length || !sec) return true;
  if (sectors.includes(sec)) return true;
  const parents = SECTOR_PARENTS[sec] || [];
  return parents.some(p => sectors.includes(p));
}

// catalogue = { frameworks:[{framework_short,jurisdiction}], rules:[{framework_short,sector_relevance[],rule_type,trigger_pattern,...}] }
// FAIL-CLOSED self-test (resolveLaws rigor applied to the live engine, Branch 5): every attached framework MUST be
// jurisdiction-valid (GLOBAL or an operated jurisdiction) and NOT node-excluded. A violation means a gate was bypassed
// -> throw, so the mint path halts with a flag rather than silently shipping a leaked framework.
function connectSelfTest(frameworks, jSet, sec, fvJuris, text) {
  const _sx = require('./registry/sector.js');
  for (const fw of (frameworks || [])) {
    const jz = (fvJuris && fvJuris[fw]) || '';
    if (!(jz === 'GLOBAL' || jSet.has(jz))) { const e = new Error('connect_self_test:jurisdiction_leak:' + fw + '(' + jz + ')'); e.guardrail = 'jurisdiction_leak'; throw e; }
    if (_sx.subSectorExcludes(fw, sec, text || '')) { const e = new Error('connect_self_test:node_exclusion_leak:' + fw); e.guardrail = 'node_exclusion_leak'; throw e; }
  }
  return true;
}

// Phase 2.4 — conformal review band (ADDITIVE, off by default). A cohort-frequency prior calibrated on 9,166 golden
// firms (db/seeds/cohort-frequencies.json, tau at the 10th percentile => ~10% review rate) gives each attachment a
// confidence. UNIVERSAL/GLOBAL frameworks are always high-confidence. review_candidates = attached frameworks whose
// confidence < tau. The `frameworks` (attach) set is UNCHANGED (shadow-identity holds); a renderer may suppress
// review_candidates. Fail-open: no calibration file => no confidence, empty review list, zero behaviour change.
let _cohort = undefined;
function _cohortCal() {
  if (_cohort !== undefined) return _cohort;
  try { _cohort = require('../../../db/seeds/cohort-frequencies.json'); } catch (_e) { _cohort = null; }
  return _cohort;
}
function _confidence(fw, sec, universalSet) {
  if (universalSet.has(fw)) return 1.0;                 // jurisdiction-universal law: always applies
  const cal = _cohortCal(); if (!cal) return 1.0;       // fail-open
  const bySec = (cal.by_sector && cal.by_sector[String(sec||'').toLowerCase()]) || {};
  const p = (bySec[fw] !== undefined) ? bySec[fw] : ((cal.global && cal.global[fw]) || 0);
  return p;
}

function connect({ catalogue, jurisdictions, sector, signals, text }) {
  // Normalise variant sector names before routing so 'aesthetic' → 'aesthetics', 'legal' → 'law-firms', etc.
  // This makes the SECTOR_MAP lookup direct rather than relying only on the SECTOR_PARENTS chain.
  let _rawSec = String(sector || '').toLowerCase().trim();
  try { const { normaliseSector: _ns } = require('./jurisdiction-router.js'); if (_ns) _rawSec = _ns(_rawSec) || _rawSec; } catch (_) {}
  const sec = _rawSec;
  const sig = signals || {};
  const t = String(text || '').toLowerCase();
  const J = expandJurisdictions(jurisdictions);
  const fvJuris = {}; for (const f of (catalogue.frameworks || [])) fvJuris[f.framework_short] = String(f.jurisdiction || '').toUpperCase();
  const fvReq = {}; for (const f of (catalogue.frameworks || [])) if (f.required_nexus) fvReq[f.framework_short] = f.required_nexus;
  // Establishment-nexus map (per family) from the firm's detected signals. FAIL-OPEN: only used to remove an
  // establishment-ONLY framework from a firm proven established in a DIFFERENT family (never on absent evidence).
  const _nx = (sig && sig.nexus) || {};
  const _estabAnywhere = Object.keys(_nx).some(k => _nx[k] && _nx[k].established_in);
  const _FAM_OF = j => { j=String(j||'').toUpperCase(); if(j==='UK')return 'UK'; if(j==='EU'||j.indexOf('EU-')===0)return 'EU'; if(j==='US'||j==='USA')return 'USA'; if(j==='AE'||j.indexOf('MENA-AE')===0||j.indexOf('AE-')===0)return 'AE'; return null; };
  const byFw = {}; for (const r of (catalogue.rules || [])) (byFw[r.framework_short] = byFw[r.framework_short] || []).push(r);

  const gates = { jurisdiction_filtered: [], sector_filtered: [], nexus_filtered: [], trigger_filtered: [], regex_invalid: [] };
  const connectedFw = new Set(); const connectedRules = [];

  for (const fw of Object.keys(byFw)) {
    const juris = fvJuris[fw] || '';
    // GATE A · JURISDICTION: framework must belong to a jurisdiction the firm operates in. GLOBAL always applies.
    const jurOK = juris === 'GLOBAL' || J.has(juris);
    if (!jurOK) { gates.jurisdiction_filtered.push(fw); continue; }
    // GATE B0 · framework-sector applicability (stops pharma/accounting/energy frameworks leaking into, say, a law firm)
    if (!fwSectorOK(fw, sec, byFw[fw])) { gates.sector_filtered.push(fw); continue; }
    if (require('./registry/sector.js').subSectorExcludes(fw, sec, t)) { gates.sector_filtered.push(fw); continue; }
    // NEXUS GATE (Branch 6, fail-open): establishment-ONLY frameworks (required_nexus == ['established_in']) bind only
    // where the firm is actually established. If the firm shows establishment in ANOTHER family but NOT this one, the
    // establishment-only law does not attach (e.g. a US-incorporated law firm serving UK clients is not SRA-regulated).
    // When there is NO establishment evidence anywhere, we fail OPEN and attach as before -- a thin site is never punished.
    { const _req = fvReq[fw];
      if (_estabAnywhere && Array.isArray(_req) && _req.length === 1 && _req[0] === 'established_in') {
        const _fam = _FAM_OF(juris);
        if (_fam) { const _here = !!(_nx[_fam] && _nx[_fam].established_in); if (!_here) { gates.nexus_filtered.push(fw); continue; } }
      } }
    // CAPABILITY GATE: capability-scoped frameworks require a real on-site signal or explicit mention.
    const _cap = CAP_GATE[fw];
    if (_cap && !((_cap.sig && sig[_cap.sig]) || (_cap.rx && _cap.rx.test(t)))) { gates.trigger_filtered.push(fw); continue; }
    let anyRule = false, triggerHeld = false, sectorHeld = false;
    for (const r of byFw[fw]) {
      const sectors = Array.isArray(r.sector_relevance) ? r.sector_relevance : [];
      // GATE B · SECTOR: empty sector list = universal; else firm sector must match (direct or parent alias).
      if (!secMatches(sectors, sec)) { sectorHeld = true; continue; }
      // GATE C · TRIGGER: trigger_then_check AND prohibited rules only connect when their trigger is present
      // (text or signal). Prohibited rules carry a trigger naming the subject area (e.g. botox|filler, review|
      // testimonial); without it the framework was attaching on sector alone — leaking e.g. the Botox-Children
      // Act onto a dental firm or the FTC fake-reviews rule onto a firm with no reviews. Gating both fixes that.
      if ((r.rule_type === 'trigger_then_check' || r.rule_type === 'prohibited') && r.trigger_pattern) {
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
  const _fwArr = Array.from(connectedFw).sort();
  connectSelfTest(_fwArr, J, sec, fvJuris, t);   // fail-closed guardrail
  const _bind = {}; { const _i = require('./registry/framework-intel.js'); for (const _f of _fwArr) { const _b = _i.bindingStatus(_f); if (_b) _bind[_f] = _b; } }
  // conformal review band (additive): confidence per attachment + review candidates; attach set unchanged.
  const _cal = _cohortCal(); const _tau = (_cal && typeof _cal.tau === 'number') ? _cal.tau : 0;
  const _conf = {}; const _review = [];
  for (const _f of _fwArr) { const _c = _confidence(_f, sec, UNIVERSAL_FW); _conf[_f] = _c; if (_cal && _c < _tau) _review.push(_f); }
  return { frameworks: _fwArr, rules: connectedRules, jurisdictions: Array.from(J), gates, binding: _bind, confidence: _conf, review_candidates: _review, review_tau: _tau };
}

// --- Neon catalogue loader (engine use). Cached in-process. ---
let _cat = null;
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return ''; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (_e) { return ''; } }
function loadCatalogue() {
  if (_cat) return _cat;
  const fw = pg("SELECT framework_short, COALESCE(jurisdiction,''), COALESCE(required_nexus::text,'') FROM framework_versions").trim();
  const frameworks = fw ? fw.split('\n').filter(Boolean).map(l => { const [framework_short, jurisdiction, req] = l.split('\t'); let required_nexus=null; try{ required_nexus = req?JSON.parse(req):null; }catch(_){ required_nexus=null; } return { framework_short, jurisdiction, required_nexus }; }) : [];
  const rl = pg("SELECT framework_short, rule_id, COALESCE(rule_type,'must_appear'), COALESCE(trigger_pattern,''), COALESCE(array_to_string(sector_relevance,'|'),''), COALESCE(severity,'P2') FROM compliance_rules WHERE active=TRUE").trim();
  const rules = rl ? rl.split('\n').filter(Boolean).map(l => { const [framework_short, rule_id, rule_type, trigger_pattern, sectors, severity] = l.split('\t'); return { framework_short, rule_id, rule_type, trigger_pattern: trigger_pattern || null, sector_relevance: sectors ? sectors.split('|').filter(Boolean) : [], severity }; }) : [];
  _cat = { frameworks, rules };
  return _cat;
}

module.exports = { connect, connectSelfTest, loadCatalogue, expandJurisdictions, normJuris, EU_ISO, UNIVERSAL_FW, fwToSectors };
