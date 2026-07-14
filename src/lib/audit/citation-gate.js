'use strict';
// CITATION GATE. Before a mint ships, every rendered legal claim must be citable:
//   - a compliance breach asserting a MONETARY exposure must carry a resolvable citation_url OR statutory_citation;
//   - any citation_url present must be a well-formed http(s) URL (a broken cite is worse than none);
//   - a P0/P1 compliance breach must name a framework (never an anonymous "law").
//
// ─── WHY THIS FILE WAS DEAD FOR MONTHS, AND WHY IT WAS RIGHT TO LEAVE IT DEAD ───────────────────────────────
// The old gateMint() DELETED VALID FINDINGS. verifyCitations() keyed a violation TWO different ways:
//     one branch:  finding = f.rule_id || f.code            <- a RULE identity
//     another:     finding = framework_short || f.rule_id   <- a FRAMEWORK identity
// and the filter then keyed by  framework_short || citation || rule_id  — framework FIRST.
// So ONE uncited UK_PECR rule put "UK_PECR" in the blocked set and the filter dropped EVERY UK_PECR finding,
// including fully-cited P0s. A gate built to protect the client would have silently deleted the client's breaches.
//
// THE FIX: one STABLE FINDING IDENTITY, used on BOTH sides. A violation can now only ever remove the exact
// finding that caused it. eval/citation-gate.test.js FAILS on the old keying — calibrated, not assumed.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function _isUrl(u) { try { const x = new URL(String(u)); return x.protocol === 'http:' || x.protocol === 'https:'; } catch (_e) { return false; } }

// THE ONE DOOR for a finding's identity. NEVER a framework — a framework has MANY findings.
// rule_id is the natural key. When a finding carries none, fall back to a composite still unique PER FINDING
// (framework + severity + fact text), never shared with the framework's other findings.
// CodeRabbit (#340): rule_id is NOT globally unique. MEASURED against the live catalogue: `A16` and `A6` each
// appear in TWO different frameworks. Keying on rule_id alone would let one uncited UK_GDPR/A16 delete a fully
// cited EU_GDPR/A16 — the very collateral-damage bug this module was rewritten to kill, one level down.
// The identity is therefore FRAMEWORK + RULE, and falls back to a per-finding composite when there is no rule_id.
function findingId(f) {
  if (!f) return '';
  const fw = String(f.framework_short || f.citation || '').trim();
  const rid = String(f.rule_id || f.code || '').trim();
  if (rid) return 'fw:' + fw + '|rule:' + rid;
  const fact = String(f.fact || f.desc || f.description || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return 'fw:' + fw + '|sev:' + String(f.severity || '') + '|fact:' + fact;
}

// verifyCitations(findings) -> { ok, violations:[{ id, label, framework, reason }] }. Pure. No side effects.
function verifyCitations(findings) {
  const violations = [];
  for (const f of (findings || [])) {
    if (!f) continue;
    if (f.bucket !== 'compliance') continue;          // an SEO pointer carries no statute; never judge it
    const fined = (+f.fine_high_gbp || 0) > 0 || (+f.fine_low_gbp || 0) > 0;
    const fw = String(f.framework_short || f.citation || '').trim();
    const cite = String(f.citation_url || '').trim();
    const statute = String(f.statutory_citation || '').trim();
    const id = findingId(f);
    const label = fw ? (fw + '/' + (f.rule_id || f.code || '?')) : (f.rule_id || f.code || '(anon)');
    const push = (reason) => violations.push({ id, label, framework: fw, reason });

    if ((f.severity === 'P0' || f.severity === 'P1') && !fw) push('p0p1_compliance_no_framework');
    if (fined && !cite && !statute) push('fined_breach_no_citation');
    if (cite && !_isUrl(cite)) push('malformed_citation_url:' + cite.slice(0, 40));
  }
  return { ok: violations.length === 0, violations };
}

// gateMint(findings): drops ONLY the findings that violate, and reports them. Never collateral.
function gateMint(findings) {
  const { violations } = verifyCitations(findings);
  const bad = new Set(violations.map((v) => v.id));
  const safe = (findings || []).filter((f) => f && !bad.has(findingId(f)));
  return { safe, blocked: violations, dropped: (findings || []).length - safe.length };
}

module.exports = { verifyCitations, gateMint, findingId, _isUrl };
