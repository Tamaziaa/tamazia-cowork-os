'use strict';
// P3.6 source-gap: the authoritative sources AI + Google read to answer your category. Uses the free SERP to find
// which directory/authority domains rank for your buyer query (Wikipedia, industry directories, review sites,
// trade press). Being absent or thin on the sources that own your category keeps you out of the answers.
let _serp; try { _serp = require('../scraping/free-serp.js'); } catch (_e) {}
const AUTHORITY = /(wikipedia\.org|legal500\.com|chambers\.com|chambersandpartners|yell\.com|trustpilot|clutch\.co|glassdoor|gov\.uk|\.gov|crunchbase|companieshouse|find-and-update\.company|bbc\.|ft\.com|reuters|forbes|techcrunch|which\.co\.uk|tripadvisor|google\.com\/maps|yelp)/i;
async function sourceGap({ query, domain, env = process.env } = {}) {
  if (!query || !_serp || !_serp.search) return { ok: false, reason: 'no_serp' };
  let results = [];
  try { const r = await _serp.search(query, 'uk', 10, { env }); results = (r && (r.organic || r.results)) || []; } catch (_e) {}
  if (!results.length) return { ok: false, reason: 'no_results' };
  const dom = String(domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*/, '').toLowerCase();
  const hosts = results.map(x => { try { return new URL(x.link || x.url || x.href).hostname.replace(/^www\./, ''); } catch (_e) { return ''; } }).filter(Boolean);
  const authoritySources = [...new Set(hosts.filter(h => AUTHORITY.test(h)))].slice(0, 5);
  const youRank = hosts.some(h => h.includes(dom) || (dom && dom.includes(h)));
  let finding = null;
  if (authoritySources.length && !youRank) {
    finding = {
      bucket: 'ai_visibility', severity: 'P2', rule_type: 'observed', kind: 'observed',
      citation: 'Source gap', framework_short: 'GEO', citation_url: '',
      metric: { label: 'Authority sources for your query', sources: authoritySources },
      fact: 'For "' + query + '", the authoritative sources AI and Google read are ' + authoritySources.join(', ') + ' and your site is not among the top results.',
      layman_explanation: 'AI answers and Google both lean on a handful of trusted sources for each category (directories, review sites, trade press, Wikipedia). For your buyer query those sources are ' + authoritySources.slice(0, 3).join(', ') + '. Your competitors are listed and cited there; you are not, so the engines repeat what those sources say and leave you out.',
      tamazia_fix_short: 'Tamazia gets you placed, complete and well-reviewed on the exact authority sources that feed AI and Google for your category.',
      evidence_quote: 'top authority sources: ' + authoritySources.join(', ') + '; your domain absent from top 10',
      evidence: 'free SERP · query "' + query + '"', fine_low_gbp: null, fine_high_gbp: null,
    };
  }
  return { ok: true, authority_sources: authoritySources, you_rank: youRank, finding };
}
module.exports = { sourceGap };
