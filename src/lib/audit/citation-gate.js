'use strict';
// Phase 4.1.3 — citation-verification gate. Before a mint ships, every rendered legal claim must be citable:
//   - a compliance breach that asserts a MONETARY exposure must carry a resolvable citation_url OR statutory_citation;
//   - any citation_url present must be a well-formed http(s) URL (a broken/relative cite is worse than none);
//   - a P0/P1 compliance breach must name a framework (never an anonymous "law").
// verifyCitations(findings) -> { ok, violations:[{finding, reason}] }. Pure; the mint blocks when ok=false.
function _isUrl(u) { try { const x = new URL(String(u)); return x.protocol === 'http:' || x.protocol === 'https:'; } catch (_) { return false; } }
function verifyCitations(findings) {
  const violations = [];
  for (const f of (findings || [])) {
    if (!f) continue;
    const compliance = f.bucket === 'compliance';
    const fined = (+f.fine_high_gbp || 0) > 0 || (+f.fine_low_gbp || 0) > 0;
    const fw = String(f.framework_short || f.citation || '').trim();
    const cite = String(f.citation_url || '').trim();
    const statute = String(f.statutory_citation || '').trim();
    if (compliance && (f.severity === 'P0' || f.severity === 'P1') && !fw) violations.push({ finding: f.rule_id || f.code || '(anon)', reason: 'p0p1_compliance_no_framework' });
    if (compliance && fined && !cite && !statute) violations.push({ finding: fw || f.rule_id || '(anon)', reason: 'fined_breach_no_citation' });
    if (cite && !_isUrl(cite)) violations.push({ finding: fw || f.rule_id || '(anon)', reason: 'malformed_citation_url:' + cite.slice(0, 40) });
  }
  return { ok: violations.length === 0, violations };
}
// gateMint(findings): drops the violating findings fail-closed and returns the safe set + a report (never ships a bad cite).
function gateMint(findings) {
  const { violations } = verifyCitations(findings);
  const bad = new Set(violations.map(v => v.finding));
  const safe = (findings || []).filter(f => f && !bad.has(String(f.framework_short || f.citation || f.rule_id || '').trim()));
  return { safe, blocked: violations };
}
module.exports = { verifyCitations, gateMint, _isUrl };
