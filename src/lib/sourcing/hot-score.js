// Intent ("hotness") scorer — orthogonal to ICP fit. Measures how READY-TO-BUY a lead looks
// based on advertising behaviour + freshness + reachable gap. Higher = contact sooner.
'use strict';
function hotScore(s) {
  let h = 0; const why = [];
  if (s.adRunner) { h += 30; why.push('running paid ads'); }
  const plats = (s.adPlatforms || []).length;
  if (plats) { h += Math.min(20, plats * 7); why.push(plats + '-platform advertiser'); }
  if (s.adRecencyDays != null) { if (s.adRecencyDays <= 7) { h += 18; why.push('ad live this week'); } else if (s.adRecencyDays <= 30) { h += 10; why.push('ad live this month'); } }
  if (s.seoGapSeverity) { h += Math.min(15, s.seoGapSeverity * 5); why.push('fixable SEO gap'); }
  if (s.aiVisibilityGap) { h += 8; why.push('invisible to AI search'); }
  if (s.decisionMakerFound) { h += 9; why.push('decision-maker found'); }
  h = Math.max(0, Math.min(100, h));
  return { hot: h, band: h >= 70 ? 'hot' : h >= 45 ? 'warm' : 'cold', why };
}
module.exports = { hotScore };
