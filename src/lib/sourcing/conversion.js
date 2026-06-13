'use strict';
// Conversion-likelihood tier — decides WHO to email first. Tamazia only spends a send on leads we are very
// sure about: FIT + a VERIFIED email (else unreachable) + intent + a real audit to show. Tier A = email now.
// Pure + deterministic (unit-testable, identical across sources).
function conversionScore(s) {
  s = s || {}; const why = [];
  if (!s.fit) return { tier: 'C', score: 0, emailable: false, why: ['not FIT'] };
  // gap-fix: a VERIFIED email is best, but a CATCH-ALL / deliverable-shaped email (own-domain, MX accepts all) is
  // still contactable — established firms commonly run catch-all servers. Route it to Tier B (lower priority), not
  // unreachable Tier C. Caller sets has_deliverable_email for catch-all/MX-clean addresses; absent => prior behavior.
  const reachableEmail = s.has_verified_email || s.has_deliverable_email;
  if (!reachableEmail) return { tier: 'C', score: 0, emailable: false, why: ['no verified email — cannot contact'] };
  let v = 0;
  v += Math.round((s.fit_score || 0) * 0.35); if (s.fit_score) why.push('fit ' + s.fit_score);
  v += Math.round((s.hot_score || 0) * 0.30); if (s.hot_score) why.push('intent ' + s.hot_score);
  if (s.decision_maker) { v += 12; why.push('decision-maker reachable'); }
  if (s.has_linkedin) { v += 5; why.push('LinkedIn found'); }
  if (s.audit_verified) { v += 10; why.push('audit verified-live'); }
  if (s.hiring_signal) { v += 6; why.push('actively hiring'); }
  if (s.ad_runner) { v += 4; why.push('ad-runner'); }
  v = Math.max(0, Math.min(100, v));
  let tier = v >= 70 ? 'A' : v >= 50 ? 'B' : 'C';
  // gap-fix: a catch-all/deliverable-only lead (no hard-verified email) never auto-sends at top priority — cap at Tier B.
  if (!s.has_verified_email && s.has_deliverable_email && tier === 'A') { tier = 'B'; why.push('catch-all email — capped at B'); }
  return { tier, score: v, emailable: true, why };
}
// Send-order helper: A first, then B; C never auto-emailed (nurture/social only).
const SEND_TIERS = new Set(['A', 'B']);
module.exports = { conversionScore, SEND_TIERS };
