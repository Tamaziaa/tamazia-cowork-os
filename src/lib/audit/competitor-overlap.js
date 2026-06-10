'use strict';
// §5 — REAL organic-competitor set from free SERP-overlap.
// A real competitor is a domain that REPEATEDLY co-ranks with the firm across its buyer queries and is NOT a
// directory / aggregator / social / gov. We reuse the existing free SERP cascade (serp-client → free-serp → SERPER,
// query-cached in Neon) and the shared isAggregator() blocklist, so this adds ZERO new keys. Optionally, when
// HF_TOKEN is set, we embed each survivor's title/snippet vs the firm description and drop low-cosine false
// neighbours (a personal-injury firm co-ranking on a generic term). The output is ONE canonical peer set that
// feeds DR (authority-gap), the keyword finding (named leaders) and AI-visibility — replacing single-keyword guesses.
// Fail-open: any error → return whatever we have (possibly []), never throw.
const serp = require('../scraping/serp-client.js');
let _ri = {}; try { _ri = require('../touch0/rank-insight.js'); } catch (_e) {}
let _hf = null; try { _hf = require('./hf-ml.js'); } catch (_e) {}

const _clean = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
const isAggregator = _ri.isAggregator || ((d) => { d = _clean(d); return /(^|\.)(google|bing|yahoo|facebook|linkedin|youtube|wikipedia|instagram|twitter|x|tiktok|pinterest|reddit|gov|nhs)\.|(^|\.)(yell|yelp|trustpilot|tripadvisor)\./.test(d + '.'); });

// Drop the firm's own domain (incl. subdomain/registrable variants) and obvious non-firm hosts.
function _isSelf(d, me) {
  if (!d || !me) return false;
  return d === me || d.endsWith('.' + me) || me.endsWith('.' + d);
}

// Build the canonical organic-competitor set.
//   keyword_map : output of buildKeywordMap (we read .keywords[].keyword and any already-found leaders)
//   llmPeers    : names from geo_probe.top_competitors / ai_citation (peer firms named by the LLM) — string[] or {name}/{domain}[]
//   firmText    : the firm's own description (title+meta / corpus) for the optional HF relevance filter
//   want        : how many peers to return (default 9)
async function organicCompetitors({ keyword_map = {}, domain, llmPeers = [], firmText = '', country = 'UK', sector = '', env = process.env, want = 9 } = {}) {
  const me = _clean(domain);
  const kws = ((keyword_map && keyword_map.keywords) || []).map(k => k && k.keyword).filter(Boolean);
  const freq = new Map();   // domain -> { count:Set(keywords), title }
  const bump = (d, kw, title) => {
    d = _clean(d);
    if (!d || _isSelf(d, me) || isAggregator(d, sector, country)) return;   // per-sector blocklist: drop directories/news, keep only real operating rivals
    if (!freq.has(d)) freq.set(d, { kws: new Set(), title: title || '' });
    const e = freq.get(d); e.kws.add(kw); if (!e.title && title) e.title = title;
  };

  // 1) SERP-overlap across the firm's own buyer queries (cap to keep it fast + within free quota).
  const seedKws = Array.from(new Set(kws)).slice(0, 6);
  for (const kw of seedKws) {
    let r = null; try { r = await serp.search(kw, country, 20); } catch (_e) {}
    const organic = (r && r.organic) || [];
    for (const o of organic.slice(0, 12)) bump(o.domain, kw, o.title);
  }

  // 2) ∪ the LLM-named peers (geo_probe.top_competitors / ai_citation). These arrive as NAMES (no domain) or
  //    as {domain}. A name without a domain can't be DR-looked-up, so we resolve it to a domain via one SERP
  //    lookup of the name itself, taking the first non-aggregator result that isn't the firm.
  const peerList = (Array.isArray(llmPeers) ? llmPeers : []).map(p => (typeof p === 'string' ? { name: p } : p)).filter(Boolean);
  for (const p of peerList.slice(0, 8)) {
    if (p.domain) { bump(p.domain, '__llm_peer__', p.name || ''); continue; }
    const nm = String(p.name || '').trim(); if (!nm || nm.length < 3) continue;
    let r = null; try { r = await serp.search(nm, country, 5); } catch (_e) {}
    const organic = (r && r.organic) || [];
    const hit = organic.find(o => { const d = _clean(o.domain); return d && !_isSelf(d, me) && !isAggregator(d, sector, country); });
    if (hit) bump(hit.domain, '__llm_peer__', hit.title || nm);
  }

  // 3) Frequency-rank. SERP co-occurrence across ≥2 of the firm's keywords is the strongest signal; an LLM-named
  //    peer (even at 1 keyword) is corroborated by the model, so it also qualifies. Single-keyword SERP-only
  //    domains are kept only to backfill if we're short.
  const scored = Array.from(freq.entries()).map(([d, e]) => {
    const overlap = Array.from(e.kws).filter(k => k !== '__llm_peer__').length;
    const llm = e.kws.has('__llm_peer__');
    return { domain: d, overlap, llm, title: e.title, score: overlap * 2 + (llm ? 3 : 0) };
  });
  let strong = scored.filter(c => c.overlap >= 2 || c.llm).sort((a, b) => b.score - a.score);
  const weak = scored.filter(c => !(c.overlap >= 2 || c.llm)).sort((a, b) => b.score - a.score);
  let picks = strong.length ? strong : weak;       // prefer overlap/LLM-proven; fall back to single-keyword neighbours

  // 4) OPTIONAL HF relevance filter — drop SERP-only false neighbours whose description is off-topic vs the firm.
  //    Never applied to LLM-named peers (the model already vouched). Fail-open: no HF / no vectors → keep all.
  if (_hf && _hf.enabled && _hf.enabled(env) && String(firmText || '').trim().length > 20) {
    const cand = picks.filter(c => !c.llm && c.title);                  // only SERP-only survivors with a title
    if (cand.length) {
      try {
        const vecs = await _hf.embed([String(firmText).slice(0, 400), ...cand.map(c => c.title.slice(0, 200))], { env });
        if (vecs && vecs.length === cand.length + 1) {
          const base = vecs[0];
          const kept = new Set();
          cand.forEach((c, i) => { const sim = _hf.cosine(base, vecs[i + 1]); c._sim = sim; if (sim == null || sim >= 0.28) kept.add(c.domain); });
          picks = picks.filter(c => c.llm || kept.has(c.domain));
        }
      } catch (_e) { /* fail-open: keep all */ }
    }
  }

  return picks.slice(0, want).map(c => c.domain);
}

module.exports = { organicCompetitors, isAggregator };
