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
  // CATCH-ALL POLICY (compliance-led, deliverability-safe, REVERSIBLE — CLAUDE.md: "catch-all = do-not-send").
  // A catch-all / deliverable-only lead has has_deliverable_email=true but has_verified_email=false: the MX accepts
  // mail but no real mailbox was hard-confirmed, so the address is RISKY. While we are warming brand-new sending
  // domains, auto-sending to risky addresses raises bounce + spam-complaint rates and burns the new domains'
  // reputation — exactly the opposite of what a compliance-led UK agency wants. So by DEFAULT we DO NOT auto-send
  // these: cap them at Tier C, which excludes them from SEND_TIERS (auto-send) while keeping them fully QUALIFIED
  // and reachable via the manual approval queue (icp_tier / qualification are untouched — only AUTO-send is gated).
  // REVERSIBLE: set SEND_CATCHALL=1 once the domains are warmed to restore the prior Tier-B (auto-send) behaviour.
  // Hard-verified emails (Tier A/B) are never affected by this flag.
  const SEND_CATCHALL = /^(1|true|yes|on)$/i.test(String(process.env.SEND_CATCHALL || '').trim());
  if (!s.has_verified_email && s.has_deliverable_email) {
    if (SEND_CATCHALL) {
      // Domains warmed: keep the prior behaviour — catch-all never auto-sends at TOP priority, cap at Tier B.
      if (tier === 'A') { tier = 'B'; why.push('catch-all email — capped at B (SEND_CATCHALL on)'); }
    } else {
      // DEFAULT: catch-all is excluded from auto-send — cap at Tier C (stays qualified for manual approval).
      if (tier === 'A' || tier === 'B') { tier = 'C'; why.push('catch-all email — held for manual approval (SEND_CATCHALL off)'); }
    }
  }
  return { tier, score: v, emailable: true, why };
}
// Send-order helper: A first, then B; C never auto-emailed (nurture/social only).
const SEND_TIERS = new Set(['A', 'B']);
module.exports = { conversionScore, SEND_TIERS };
