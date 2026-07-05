'use strict';
// Phase 3.5.1 — coverage contract. Declares the page-classes an audit REQUIRES to make a fair compliance judgement,
// measures which were actually fetched, and returns a tri-state render_class: 'assessable' (enough coverage -> render
// breaches), or 'screened' (too little coverage -> render NOT-ASSESSED, never a breach on content we could not read).
// This turns the binary reachable flag into a graded, auditable contract. Pure + deterministic.

// Required page-classes. Privacy + homepage are load-bearing everywhere; some sectors add class-specific pages.
const BASE_REQUIRED = ['homepage', 'privacy'];
const SECTOR_REQUIRED = {
  'law-firms': ['complaints', 'pricing'], 'barristers': ['complaints'], 'finance': ['terms'], 'insurance': ['terms'],
  'ecommerce': ['terms', 'returns'], 'retail': ['terms'], 'healthcare': ['privacy'], 'real-estate': ['fees'],
};
function requiredClasses(sector) { return [...new Set([...BASE_REQUIRED, ...((SECTOR_REQUIRED[String(sector || '').toLowerCase()]) || [])])]; }

// classify a fetched page URL/type into a class (cheap heuristic; the scanner may also pass explicit types).
function classify(page) {
  const raw = String((page && (page.url || page.type || page)) || '').toLowerCase();
  // FIX-A1: match on PATH SEGMENTS with word boundaries, not loose substrings, so /feedback does not credit 'fees',
  // /cost-of-living-blog does not credit 'pricing', /returning-customers does not credit 'returns'.
  const path = raw.replace(/^https?:\/\/[^/]+/, '');
  const seg = '/' + path.replace(/[?#].*$/, '').replace(/^\/+/, '');   // normalised path, leading slash
  const has = (re) => re.test(seg);
  if (has(/\b(privacy|data[-_ ]?protection|gdpr|cookie)\b/)) return 'privacy';
  if (has(/\b(complaints?|ombudsman)\b/)) return 'complaints';
  if (has(/\bfees?\b/)) return 'fees';
  if (has(/\b(pricing|prices?|tariff|cost[-_ ]?(of[-_ ]?service|guide|schedule)?|charges)\b/) && !/\bcost[-_ ]?of[-_ ]?living\b/.test(seg)) return 'pricing';
  if (has(/\b(terms|t-and-c|t&c|conditions)\b/)) return 'terms';
  if (has(/\b(returns?|refunds?)\b/)) return 'returns';
  if (/^\/?$/.test(seg) || has(/\b(home|index)\b/)) return 'homepage';
  return 'other';
}
// computeCoverage(fetchedPages, sector, opts) -> { required, fetched_classes, missing, ratio, render_class }
function computeCoverage(fetchedPages, sector, opts = {}) {
  const required = requiredClasses(sector);
  const fetched = new Set((fetchedPages || []).map(classify));
  // homepage counts as present if ANY page was read (you always land somewhere).
  if ((fetchedPages || []).length) fetched.add('homepage');
  const missing = required.filter(c => !fetched.has(c));
  const ratio = required.length ? (required.length - missing.length) / required.length : 0;
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0.5;   // need >=50% of required classes
  const reachable = (fetchedPages || []).length > 0;
  const render_class = (!reachable) ? 'screened' : (ratio >= threshold ? 'assessable' : 'screened');
  return { required, fetched_classes: [...fetched].sort(), missing, ratio: Math.round(ratio * 100) / 100, render_class, reachable };
}
// gate findings by the contract: screened => no breaches survive (not-assessed), assessable => findings pass through.
function applyCoverage(findings, coverage) {
  if (!coverage || coverage.render_class === 'assessable') return findings || [];
  return (findings || []).filter(f => f && f.status !== 'miss');   // screened: drop breach findings (not-assessed)
}
module.exports = { requiredClasses, classify, computeCoverage, applyCoverage, BASE_REQUIRED, SECTOR_REQUIRED };
