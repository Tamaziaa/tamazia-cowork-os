'use strict';
// P2.11/P2.12 SEO depth: turn the live keyword map (now powered by free-serp) into the share-worthy
// "you vs your competitor + the fix" finding. Pure + testable. No new dependency: consumes keyword_map.
function seoDeepFindings({ keyword_map } = {}) {
  if (!keyword_map || !keyword_map.ok || !Array.isArray(keyword_map.keywords) || !keyword_map.keywords.length) return [];
  const kws = keyword_map.keywords;
  // The gap that matters: a real buyer query where the firm is below the fold (not top-10 or not ranking) and a named leader owns the top.
  const gaps = kws.filter(k => (!k.my_position || k.my_position > 10) && k.leader).sort((a, b) => (a.my_position ? a.my_position : 999) - (b.my_position ? b.my_position : 999));
  if (!gaps.length) return [];
  const g = gaps[gaps.length - 1]; // the worst (least visible) gap = the most striking reveal
  const youTxt = g.my_position ? 'ranked #' + g.my_position : 'not visible in the top 100';
  const leaderPos = g.leader_pos || 1;
  const sev = (!g.my_position || g.my_position > 20) ? 'P1' : 'P2';
  return [{
    bucket: 'seo', severity: sev, rule_type: 'observed', kind: 'observed',
    citation: 'SEO', framework_short: 'SEO', citation_url: '',
    fact: 'For "' + g.keyword + '" you are ' + youTxt + '; ' + g.leader + ' owns position #' + leaderPos + '.',
    layman_explanation: 'When your buyers search "' + g.keyword + '", they find ' + g.leader + ', not you. Page two and below is effectively zero clicks, so this exact query hands its high-intent traffic to a competitor every day, and AI answers cite the top-ranked pages, so being invisible here also keeps you out of the AI results.',
    tamazia_fix_short: 'Tamazia builds the page depth and authority to move "' + g.keyword + '" into the top three, where the clicks and the AI citations are.',
    evidence_quote: 'live SERP: you ' + youTxt + ' vs ' + g.leader + ' #' + leaderPos,
    evidence: 'live SERP (free-serp) · query "' + g.keyword + '"',
    fine_low_gbp: null, fine_high_gbp: null,
  }];
}
module.exports = { seoDeepFindings };
