// Touch-0 rank-insight — the soul. For a lead's sector + operating city, picks 3 high-intent local
// keywords (never the lead's own brand), runs REAL SERP checks, and builds a them-vs-competitors
// positioning insight. Every ranking claim is from a live SERP result or it is dropped. Gated, layered,
// evidence-carrying so the fact-check gate can verify nothing was invented.
'use strict';
const serp = require('../scraping/serp-client.js');
let titleCat = { sectors: {} }; try { titleCat = require('../sector-intel/title-catalogue.json'); } catch (_) {}

const SECTOR_NOUN = {
  'law-firms': 'law firm', 'healthcare': 'clinic', 'dental': 'dental clinic', 'real-estate': 'estate agent',
  'hospitality': 'hotel', 'financial': 'financial adviser', 'finance': 'financial adviser', 'education': 'school',
  'automotive': 'car dealer', 'professional': 'consultancy', 'restaurants': 'restaurant',
};
const clean = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function keywordsFor(sector, city, serviceNoun) {
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const titles = (titleCat.sectors[sector] || []).filter(t => t.intent >= 8).slice(0, 2).map(t => t.title);
  const kws = [`best ${noun} in ${city}`, ...titles.map(t => `${t} ${city}`), `${noun} ${city} 2026`];
  return Array.from(new Set(kws.map(k => k.replace(/\s+/g, ' ').trim())));
}

async function checkKeyword(keyword, domain, country) {
  const r = await serp.search(keyword, country, 20);
  if (!r || r.error || !((r.organic || []).length)) return null; // GATE: unverified → drop
  const ranked = r.organic.map(o => ({ pos: o.rank, domain: o.domain })).filter(x => x.domain);
  const mine = ranked.find(x => x.domain === domain);
  const top3 = ranked.filter(x => x.domain !== domain).slice(0, 3);
  return { keyword, my_position: mine ? mine.pos : null, top3, ranked_seen: ranked.length, verified: true, evidence: ranked.slice(0, 6) };
}

async function buildRankInsight({ domain, company, sector, city, serviceNoun, country = 'UK', env = process.env, max = 3 }) {
  domain = clean(domain);
  if (!domain || !city) return { ok: false, reason: 'missing_domain_or_city', keywords: [] };
  const brand = norm(company || domain.split('.')[0]);
  // GATE: exclude the lead's own brand from keywords
  const kws = keywordsFor(sector, city, serviceNoun).filter(k => brand.length < 4 || !norm(k).includes(brand)).slice(0, max + 1);
  const results = [];
  for (const k of kws) { if (results.length >= max) break; const r = await checkKeyword(k, domain, country); if (r) results.push(r); }
  if (!results.length) return { ok: false, reason: 'no_verified_keywords', keywords: [] };

  // Choose the sharpest angle: a keyword where they are weak (not ranking, or ranked > 3)
  const weak = results.filter(r => r.my_position === null).concat(results.filter(r => r.my_position && r.my_position > 3).sort((a, b) => b.my_position - a.my_position))[0] || results[0];
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const leader = (weak.top3[0] || {}).domain || 'a competitor';
  const youAre = weak.my_position ? `you sit at #${weak.my_position}` : `you are nowhere on page one`;
  const headline = `For "${weak.keyword}", ${leader} owns #1 and ${youAre}.`;
  const urgency = `Every one of those searches in ${city} is a high-intent client picking ${leader} over you, today.`;
  const blog_offer = `We are publishing "Best ${noun}s in ${city} 2026". A feature in it puts you in front of that exact search, and we will build the on-page work to hold the spot.`;
  return {
    ok: true, domain, city, sector,
    keywords: results.map(r => ({ keyword: r.keyword, my_position: r.my_position, leader: (r.top3[0] || {}).domain || null, top3: r.top3.map(t => t.domain) })),
    headline, urgency, blog_offer,
    evidence: results.map(r => ({ keyword: r.keyword, ranked: r.evidence })), // for the fact-check gate
    gated: true,
  };
}
module.exports = { buildRankInsight, keywordsFor, checkKeyword };

// Fact-check gate — every claim (leader domain, my_position) must appear in the carried SERP evidence,
// or the insight is rejected. This is the layer that guarantees the Touch-0 never asserts an invented rank.
const { runGate } = require('../gates.js');
async function factCheck(insight, opts = {}) {
  const checks = [{
    name: 'every_claim_in_evidence',
    fn: (p) => {
      const ins = p.insight; if (!ins || !ins.ok) return { ok: false, reason: 'insight_not_ok' };
      for (const k of ins.keywords) {
        const ev = (ins.evidence || []).find(e => e.keyword === k.keyword);
        if (!ev) return { ok: false, reason: 'no_evidence_for:' + k.keyword };
        const domains = (ev.ranked || []).map(x => x.domain);
        if (k.leader && !domains.includes(k.leader)) return { ok: false, reason: 'leader_not_in_serp:' + k.leader };
        if (k.my_position != null) { const at = (ev.ranked || []).find(x => x.domain === ins.domain); if (!at || at.pos !== k.my_position) return { ok: false, reason: 'my_position_mismatch:' + k.keyword }; }
      }
      return { ok: true };
    },
  }];
  return runGate('touch0_rank_insight', { entity: insight.domain, insight }, checks, opts);
}
module.exports.factCheck = factCheck;
