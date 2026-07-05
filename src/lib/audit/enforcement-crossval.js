'use strict';
// Phase 3.4.3 — cross-validate sector tags against enforcement reality. For a framework that HAS enforcement history,
// a rule-claimed sector with ZERO enforcement support is a SOFT review flag (potential over-tag), NOT an auto-drop:
// enforcement data is sparse, so absence is a signal to review, never a hard exclusion. Frameworks with no enforcement
// history are SKIPPED (no signal). Pure + deterministic; produces an audit list for human review. Changes no attachment.
const { execFileSync } = require('child_process'); const path = require('path');
function _q(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return ''; try { return execFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; } }

// enforcement-touched sectors per framework (from compliance_enforcement)
function enforcementSectors() {
  const out = _q("SELECT fw, string_agg(DISTINCT st, '|') FROM (SELECT jsonb_array_elements_text(matched_law_ids) fw, jsonb_array_elements_text(sector_tags) st FROM compliance_enforcement) t GROUP BY fw");
  const m = {}; for (const l of out.split('\n').filter(Boolean)) { const [fw, secs] = l.split('\t'); m[fw] = new Set((secs || '').split('|').filter(Boolean)); }
  return m;
}
// rule-claimed sectors per framework (from compliance_rules.sector_relevance, active)
function claimedSectors() {
  const out = _q("SELECT framework_short, string_agg(DISTINCT s, '|') FROM (SELECT framework_short, unnest(sector_relevance) s FROM compliance_rules WHERE active) t GROUP BY framework_short");
  const m = {}; for (const l of out.split('\n').filter(Boolean)) { const [fw, secs] = l.split('\t'); m[fw] = new Set((secs || '').split('|').filter(Boolean)); }
  return m;
}
// crossValidate(claimed, enforced): returns [{framework, sector, reason}] soft flags. Injectable maps for tests.
function crossValidate(claimed, enforced) {
  const flags = [];
  for (const fw of Object.keys(enforced)) {                     // only frameworks WITH enforcement history give a signal
    const enf = enforced[fw]; const cl = claimed[fw]; if (!cl || !enf || !enf.size) continue;
    for (const sec of cl) if (!enf.has(sec)) flags.push({ framework: fw, sector: sec, reason: 'claimed_sector_no_enforcement_support' });
  }
  return flags.sort((a, b) => (a.framework + a.sector).localeCompare(b.framework + b.sector));
}
function run() { return crossValidate(claimedSectors(), enforcementSectors()); }
module.exports = { crossValidate, claimedSectors, enforcementSectors, run };
