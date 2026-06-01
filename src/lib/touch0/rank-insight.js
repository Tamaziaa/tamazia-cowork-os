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
// Sub-sector detection from the firm's name/site → a precise, relevant service noun (dental vs aesthetic vs GP).
const SUBSECTOR = {
  healthcare: [[/dental|dentist|orthodont|implant|invisalign/i,'dental clinic'],[/aesthetic|cosmetic|botox|filler|skin/i,'aesthetic clinic'],[/dermatolog/i,'dermatology clinic'],[/\bgp\b|general practi|private doctor/i,'private GP'],[/physio|chiropract|osteopath/i,'physiotherapy clinic'],[/fertility|ivf/i,'fertility clinic'],[/hair (transplant|clinic)/i,'hair transplant clinic'],[/eye|optician|optometr|lasik/i,'eye clinic'],[/veterinary|\bvet\b/i,'veterinary clinic']],
  'law-firms': [[/personal injury|accident/i,'personal injury solicitor'],[/family|divorce/i,'family law solicitor'],[/employment/i,'employment solicitor'],[/conveyanc|property law/i,'conveyancing solicitor'],[/immigration/i,'immigration solicitor'],[/criminal/i,'criminal defence solicitor'],[/commercial|corporate/i,'commercial solicitor']],
  'real-estate': [[/letting|rental/i,'letting agent'],[/commercial property/i,'commercial estate agent'],[/develop/i,'property developer'],[/luxury|prime|prestige/i,'luxury estate agent']],
  hospitality: [[/spa|wellness/i,'spa'],[/restaurant|dining|brasserie/i,'restaurant'],[/boutique/i,'boutique hotel']],
  financial: [[/wealth/i,'wealth manager'],[/mortgage/i,'mortgage adviser'],[/account/i,'accountant'],[/tax/i,'tax adviser'],[/pension/i,'pension adviser']],
};
function deriveServiceNoun(company, sector, html) {
  const hay = ((company || '') + ' ' + (html || '')).toLowerCase();
  for (const [rx, noun] of (SUBSECTOR[sector] || [])) { if (rx.test(hay)) return noun; }
  return SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
}
const clean = d => String(d || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function keywordsFor(sector, city, serviceNoun) {
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const titles = (titleCat.sectors[sector] || []).filter(t => t.intent >= 8).slice(0, 3).map(t => t.title);
  // prioritised pool: most-relevant local-intent first, then sector titles, then year/variants
  const kws = [
    `best ${noun} in ${city}`, `${noun} ${city}`, `top ${noun} ${city}`,
    ...titles.map(t => `best ${t} ${city}`), ...titles.map(t => `${t} ${city}`),
    `${noun} near ${city}`, `${noun} ${city} 2026`,
  ];
  return Array.from(new Set(kws.map(k => k.replace(/\s+/g, ' ').trim())));
}

async function checkKeyword(keyword, domain, country) {
  const r = await serp.search(keyword, country, 100); // full depth → real live position
  if (!r || r.error || !((r.organic || []).length)) return null; // GATE: unverified → drop
  const ranked = r.organic.map(o => ({ pos: o.rank, domain: o.domain })).filter(x => x.domain);
  const mine = ranked.find(x => x.domain === domain);
  const top3 = ranked.filter(x => x.domain !== domain).slice(0, 3);
  // Evidence must let the fact-check gate verify BOTH the top competitors AND the lead's own position,
  // so include the top 6 PLUS the lead's own row when they rank beyond 6.
  const top6 = ranked.slice(0, 6);
  const evidence = (mine && mine.pos > 6) ? [...top6, mine] : top6;
  return { keyword, my_position: mine ? mine.pos : null, top3, ranked_seen: ranked.length, verified: true, evidence };
}

async function buildRankInsight({ domain, company, sector, city, serviceNoun, html, country = 'UK', env = process.env, max = 3 }) {
  domain = clean(domain);
  if (!domain || !city) return { ok: false, reason: 'missing_domain_or_city', keywords: [] };
  const brand = norm(company || domain.split('.')[0]);
  const noun0 = serviceNoun || deriveServiceNoun(company, sector, html);
  // GATE: exclude the lead's own brand from keywords
  const candidates = keywordsFor(sector, city, noun0).filter(k => brand.length < 4 || !norm(k).includes(brand));
  const weakSet = []; const strong = []; let checked = 0;
  for (const k of candidates) {
    if (weakSet.length >= max || checked >= 8) break; // SERP-quota guard
    const r = await checkKeyword(k, domain, country); checked++;
    if (!r) continue;                                   // unverified → drop
    if (r.my_position === null || r.my_position > 5) weakSet.push(r); // GATE: only below-top-5 (a real gap)
    else strong.push({ keyword: r.keyword, position: r.my_position }); // already top-5 → never shown (no urgency)
  }
  if (!weakSet.length) return { ok: false, reason: 'no_below_top5_keywords', keywords: [], already_strong: strong };
  const results = weakSet.slice(0, max);
  serviceNoun = noun0;

  // Sharpest angle = the absolute weakest (not ranking beats a deep position)
  const weak = results.filter(r => r.my_position === null)[0] || [...results].sort((a, b) => (b.my_position || 999) - (a.my_position || 999))[0];
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const leader = (weak.top3[0] || {}).domain || 'a competitor';
  const youAre = weak.my_position ? `you sit at #${weak.my_position}` : `you are absent`;
  const sentence = `For "${weak.keyword}", ${leader} owns #1 while ${youAre} — that ${city} demand is going to them, not you.`;
  const headline = `For "${weak.keyword}", ${leader} owns #1 and ${youAre}.`;
  const urgency = `Every one of those searches in ${city} is a high-intent client picking ${leader} over you, today.`;
  const blog_offer = `Best ${noun}s in ${city} 2026`;
  return {
    ok: true, domain, city, sector,
    keywords: results.map(r => ({ keyword: r.keyword, my_position: r.my_position, leader: (r.top3[0] || {}).domain || null, top3: r.top3.map(t => t.domain) })),
    sentence, headline, urgency, blog_offer,
    evidence: results.map(r => ({ keyword: r.keyword, ranked: r.evidence })), // for the fact-check gate
    already_strong: strong, // keywords they already rank top-5 for (not pitched, kept for context)
    service_noun: serviceNoun,
    gated: true,
  };
}
module.exports = { buildRankInsight, keywordsFor, checkKeyword, deriveServiceNoun };

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

// Compose the gated, email-ready Touch-0 personalization block for a lead. Returns ok:false unless the
// rank-insight is built AND passes the fact-check gate, so a draft can never carry an unverified claim.
async function composeRankBlock(lead = {}, opts = {}) {
  const env = opts.env || process.env;
  let city = lead.city || '';
  if (!city && lead.html) { try { city = (require('../sourcing/markets.js').detectMarkets({ html: lead.html, domain: lead.domain }).primary_city) || ''; } catch (_) {} }
  if (!city) return { ok: false, reason: 'no_operating_city' };
  const insight = await buildRankInsight({ domain: lead.domain, company: lead.company || lead.firm, sector: lead.sector, city, html: lead.html, country: lead.country || 'UK', env, max: 3 });
  if (!insight.ok) return { ok: false, reason: insight.reason };
  const gate = await factCheck(insight, opts);
  if (!gate.pass) return { ok: false, reason: 'fact_check_failed', failed: gate.reasons };
  return { ok: true, sentence: insight.sentence, blog_offer: insight.blog_offer, keywords: insight.keywords, insight };
}
module.exports.composeRankBlock = composeRankBlock;
