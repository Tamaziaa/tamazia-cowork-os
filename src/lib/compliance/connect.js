// Catalogue-driven CONNECTION LAYER (the 400+ framework spine).
// Given the firm's operating jurisdictions + sector + site signals/text, return ONLY the frameworks and
// rules that genuinely bind it, from the FULL compliance_rules + framework_versions catalogue.
// Hard gates, fail-closed, zero jurisdiction leakage. Pure given a loaded catalogue (so it is testable).
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const EU_ISO = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);
function normJuris(j) { j = String(j || '').toUpperCase().trim(); if (j === 'GB' || j === 'GBR') return 'UK'; if (j === 'USA') return 'US'; if (j === 'UAE') return 'AE'; return j; }

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
    let anyRule = false, triggerHeld = false, sectorHeld = false;
    for (const r of byFw[fw]) {
      const sectors = Array.isArray(r.sector_relevance) ? r.sector_relevance : [];
      // GATE B · SECTOR: empty sector list = universal; else firm sector must be listed.
      if (sectors.length && sec && !sectors.includes(sec)) { sectorHeld = true; continue; }
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

module.exports = { connect, loadCatalogue, expandJurisdictions, normJuris, EU_ISO };
