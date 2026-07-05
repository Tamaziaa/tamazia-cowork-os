'use strict';
// Phase 3.5.3 — typed evidence ledger. Composes the engine's outputs into one defensible record per attached law:
//   { law_ref, binds_because, violated, confidence, review, binding_status, enforcement, advise }
// binds_because makes the attachment auditable (jurisdiction / sector / nexus / universal). violated comes from the
// finding. enforcement is the real fined precedent (3.4.2). Pure + additive: it READS connect()/findings, changes no
// attachment (shadow-identical). This is the detect->render contract the render layer consumes.
const { matchEnforcement } = require('./enforcement-matcher.js');

// connectResult = { frameworks, binding, confidence, review_candidates, jurisdictions } (from connect()).
// findings = [{ framework|framework_short, status, description, tamazia_fix_short, ... }].
function buildEvidenceLedger(connectResult, findings, sector, opts = {}) {
  const c = connectResult || {}; const conf = c.confidence || {}; const bind = c.binding || {};
  const review = new Set(c.review_candidates || []);
  const universal = new Set((opts.universalSet && [...opts.universalSet]) || []);
  const findingByFw = {}; for (const f of (findings || [])) { const k = f.framework || f.framework_short; if (k && (!findingByFw[k] || f.status === 'miss')) findingByFw[k] = f; }
  const matcher = opts.matchEnforcement || matchEnforcement;
  const ledger = [];
  for (const fw of (c.frameworks || [])) {
    const f = findingByFw[fw] || null;
    ledger.push({
      law_ref: fw,
      binds_because: {
        jurisdiction: (c.jurisdictions || []),
        universal: universal.has(fw),
        binding_status: bind[fw] || null,
        sector: sector || null,
      },
      violated: !!(f && f.status === 'miss'),
      status: f ? f.status : 'not_assessed',
      confidence: (conf[fw] !== undefined ? conf[fw] : null),
      review: review.has(fw),
      enforcement: matcher(fw, sector) || null,
      advise: (f && (f.tamazia_fix_short || f.description)) || null,
    });
  }
  // deterministic order: violated first, then by confidence desc, then law_ref
  // FIX-A1: null confidence (not assessed) must sort DISTINCTLY from 0.0 (assessed as zero) -> use ?? -1 so unknown ranks last.
  ledger.sort((a, b) => (Number(b.violated) - Number(a.violated)) || ((b.confidence ?? -1) - (a.confidence ?? -1)) || a.law_ref.localeCompare(b.law_ref));
  return ledger;
}
module.exports = { buildEvidenceLedger };
