'use strict';
// Phase 2.3 — single-sourced applicability + deterministic conflict tie-break (lex specialis / lex superior).
// The catalogue's applies_when/excluded_when are FLAT predicate-flag arrays (verified): a law applies iff EVERY
// applies_when flag holds AND NO excluded_when flag holds. This module formalises that (so resolver/overlay/render
// share one tested definition) and adds resolveOverlap(): when two laws cover the same obligation, a deterministic
// order decides which renders — more specific node beats a broader one; a stronger legal instrument beats a weaker
// one; higher severity breaks remaining ties. Pure + deterministic. Additive: changes no attachment output.

// applies_when = AND, excluded_when = none-of. Empty applies_when = applies (universal); a missing flag set = false.
function applies(applies_when, excluded_when, flags) {
  const has = f => (flags instanceof Set ? flags.has(f) : !!(flags && flags[f]));
  if ((applies_when || []).some(f => !has(f))) return false;
  if ((excluded_when || []).some(f => has(f))) return false;
  return true;
}

// lex specialis: a law bound to a specific regulated NODE (node-exclusive) is more specific than a sector law, which
// is more specific than a universal law. Lower rank = wins.
function specificityRank(law) {
  if (law && law.node_exclusive) return 0;
  if (law && law.universal) return 2;
  const sr = law && (law.sector_relevance || law.sector);
  return (Array.isArray(sr) ? sr.length : (sr ? 1 : 0)) ? 1 : 2;
}
// lex superior: legal instrument strength (statute strongest ... voluntary weakest). Lower = stronger = wins.
const BINDING_ORDER = { statute: 0, statutory_code: 1, statutory_redress: 1, regulator_code: 2, professional_code: 2, voluntary_code: 3 };
function bindingRank(law) { const b = law && (law.binding || law.binding_status); return BINDING_ORDER[b] !== undefined ? BINDING_ORDER[b] : 2; }
function severityRank(law) { return (law && (law.severity_rank || (law.severity === 'P1' ? 1 : law.severity === 'P0' ? 0 : law.severity === 'P3' ? 3 : 2))) || 2; }

// total deterministic order: specificity, then instrument strength, then severity, then id (stable).
function compareLaws(a, b) {
  return (specificityRank(a) - specificityRank(b)) || (bindingRank(a) - bindingRank(b))
      || (severityRank(a) - severityRank(b)) || String(a.id || a.framework_short || '').localeCompare(String(b.id || b.framework_short || ''));
}
// resolveOverlap: group laws by obligation key; within each group the first by compareLaws WINS, the rest are suppressed.
function resolveOverlap(laws, keyOf = (l => l.obligation || l.category || l.rule_id || l.id)) {
  const groups = new Map();
  for (const l of (laws || [])) { const k = keyOf(l) || Symbol(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
  const winners = [], suppressed = [];
  for (const [, g] of groups) { g.sort(compareLaws); winners.push(g[0]); for (let i = 1; i < g.length; i++) suppressed.push({ law: g[i], superseded_by: g[0].id || g[0].framework_short }); }
  return { winners, suppressed };
}
module.exports = { applies, specificityRank, bindingRank, severityRank, compareLaws, resolveOverlap };
