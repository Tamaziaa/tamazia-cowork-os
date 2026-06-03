'use strict';
// P2.17 backlink/authority gap — powered by OpenPageRank (free, 1000/day, distilled from Common Crawl's
// web graph: the strongest free domain-authority signal in its category). Compares the firm's Domain Rating
// against the exact competitors already surfaced in the keyword map, so the audit can say WHY they outrank you.
const https = require('https');

function _get(url, headers) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers, timeout: 12000 }, (res) => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_e) { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Returns { domain: {dr, rank} } for up to 100 domains in one call.
async function fetchOPR(domains, key) {
  const uniq = [...new Set(domains.map(d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase()).filter(Boolean))].slice(0, 100);
  if (!uniq.length || !key) return {};
  const qs = uniq.map(d => 'domains[]=' + encodeURIComponent(d)).join('&');
  const j = await _get('https://openpagerank.com/api/v1.0/getPageRank?' + qs, { 'API-OPR': key });
  const out = {};
  if (j && Array.isArray(j.response)) for (const r of j.response) {
    if (r && r.domain && r.status_code === 200) out[r.domain.toLowerCase()] = { dr: Number(r.page_rank_decimal) || 0, rank: r.rank ? Number(r.rank) : null };
  }
  out._last_updated = (j && j.last_updated) || null;
  return out;
}

const _norm = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();

async function authorityGap({ domain, competitors = [], env = {} } = {}) {
  const key = env.OPENPAGERANK_API_KEY || env.OPR_KEY || '';
  if (!key) return { ok: false, reason: 'no_key', finding: null };
  const me = _norm(domain);
  const comps = [...new Set(competitors.map(_norm).filter(c => c && c !== me))].slice(0, 9);
  const data = await fetchOPR([me, ...comps], key);
  const you = data[me];
  if (!you) return { ok: true, finding: null, you: null }; // no fabrication: if OPR has no data, emit nothing
  const ranked = comps.map(c => ({ domain: c, ...(data[c] || {}) })).filter(c => typeof c.dr === 'number').sort((a, b) => b.dr - a.dr);
  const top = ranked[0] || null;
  const stamp = 'OpenPageRank · authority as of ' + (data._last_updated || 'latest');
  let finding = null;
  if (top && top.dr - you.dr >= 1) {
    const mult = you.dr > 0 ? (top.dr / you.dr) : null;
    const sev = (top.dr - you.dr) >= 2 ? 'P1' : 'P2';
    finding = {
      bucket: 'seo', severity: sev, rule_type: 'observed', kind: 'observed',
      citation: 'Domain authority', framework_short: 'SEO', citation_url: '',
      fact: 'Your domain authority is ' + you.dr.toFixed(2) + '/10; ' + top.domain + ' is ' + top.dr.toFixed(2) + '/10' + (mult ? ' (' + mult.toFixed(1) + 'x stronger)' : '') + '.',
      layman_explanation: 'Domain authority is the backlink-trust score Google and AI engines use to decide who to rank and cite. ' + top.domain + ' carries ' + (mult ? mult.toFixed(1) + ' times' : 'materially more') + ' of it than you, which is the structural reason they sit above you for your buyer queries and get cited in AI answers while you do not. Closing a rank gap without closing the authority gap rarely holds.',
      tamazia_fix_short: 'Tamazia runs the digital-PR and authority-building programme (earned links, citations, entity coverage) that lifts your domain authority toward the firms outranking you.',
      evidence_quote: 'you ' + you.dr.toFixed(2) + '/10 (global rank ' + (you.rank ? you.rank.toLocaleString() : 'n/a') + ') vs ' + top.domain + ' ' + top.dr.toFixed(2) + '/10',
      evidence: stamp, fine_low_gbp: null, fine_high_gbp: null,
    };
  } else if (you.dr > 0 && you.dr < 1.5 && !ranked.length) {
    finding = {
      bucket: 'seo', severity: 'P2', rule_type: 'observed', kind: 'observed',
      citation: 'Domain authority', framework_short: 'SEO', citation_url: '',
      fact: 'Your domain authority is only ' + you.dr.toFixed(2) + '/10 (global rank ' + (you.rank ? you.rank.toLocaleString() : 'n/a') + ').',
      layman_explanation: 'Domain authority is the backlink-trust score search and AI engines use to decide who to rank and cite. At this level your site has almost no earned-link trust, so it struggles to rank or be cited for competitive buyer queries regardless of on-page work.',
      tamazia_fix_short: 'Tamazia runs the digital-PR and authority-building programme that earns the links and citations to lift your domain authority.',
      evidence_quote: 'domain authority ' + you.dr.toFixed(2) + '/10', evidence: stamp, fine_low_gbp: null, fine_high_gbp: null,
    };
  }
  return { ok: true, you, top, ranked, finding, last_updated: data._last_updated };
}
module.exports = { authorityGap, fetchOPR };
