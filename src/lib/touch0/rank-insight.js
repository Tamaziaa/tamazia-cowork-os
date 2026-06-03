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
// Directories/aggregators/social/gov — true competitors are filtered apart from these so the email names a real peer firm.
const AGGREGATORS = new Set(['legal500.com','chambers.com','chambersandpartners.com','chambersstudent.co.uk','reviewsolicitors.co.uk','lawsociety.org.uk','solicitors.lawsociety.org.uk','sra.org.uk','yell.com','yelp.com','yelp.co.uk','trustpilot.com','tripadvisor.com','tripadvisor.co.uk','bing.com','wikipedia.org','facebook.com','linkedin.com','instagram.com','twitter.com','x.com','youtube.com','indeed.com','glassdoor.com','glassdoor.co.uk','thelawyer.com','prospects.ac.uk','checkatrade.com','bark.com','clutch.co','g2.com','expertise.com','threebestrated.co.uk','findlaw.com','avvo.com','reddit.com','quora.com','mumsnet.com','which.co.uk','booking.com','expedia.com','hotels.com','opentable.com','rightmove.co.uk','zoopla.co.uk','onthemarket.com','primelocation.com','gov.uk','nhs.uk','apple.com','amazon.com','zocdoc.com','yellowpages.com','yellowpages.co.uk','yell.co.uk','whatclinic.com','whatclinic.co.uk','doctify.com','topdoctors.co.uk','topdoctors.com','healthgrades.com','vitals.com','ratemds.com','treatwell.co.uk','justdial.com','thomsonlocal.com','freeindex.co.uk','hotfrog.co.uk','cylex-uk.co.uk','scoot.co.uk','192.com','bing.co.uk','yahoo.com','duckduckgo.com','pinterest.com','tiktok.com']);
function isAggregator(d){ d = String(d||'').replace(/^www\./,'').toLowerCase(); if (AGGREGATORS.has(d)) return true; return /(^|\.)(wikipedia\.org|facebook\.com|linkedin\.com|youtube\.com|gov\.uk|nhs\.uk)$/.test(d) || /(^|\.)google\./.test(d); }

function keywordsFor(sector, city, serviceNoun) {
  const noun = serviceNoun || SECTOR_NOUN[sector] || String(sector || 'business').replace(/-/g, ' ');
  const titles = (titleCat.sectors[sector] || []).filter(t => t.intent >= 8).slice(0, 3).map(t => t.title);
  // prioritised pool: most-relevant local-intent first, then sector titles, then year/variants
  // Only on-vertical seeds: the firm's own service noun + city. The title-catalogue mixed other healthcare
  // sub-sectors (aesthetic, dermatology) onto e.g. a dental audit, producing irrelevant queries + magazine
  // 'leaders'. Brand/hyperlocal seeds (where the firm actually ranks) are added in buildKeywordMap from company.
  const kws = [
    `${noun} ${city}`, `best ${noun} in ${city}`, `top ${noun} ${city}`,
    `${noun} near me`, `${noun} ${city} reviews`,
  ];
  return Array.from(new Set(kws.map(k => k.replace(/\s+/g, ' ').trim())));
}

async function checkKeyword(keyword, domain, country) {
  const r = await serp.search(keyword, country, 100); // full depth → real live position
  if (!r || r.error || !((r.organic || []).length)) return null; // GATE: unverified → drop
  const ranked = r.organic.map(o => ({ pos: o.rank, domain: o.domain })).filter(x => x.domain);
  const mine = ranked.find(x => x.domain === domain);
  // Name only REAL competitors — exclude the lead itself and directories/aggregators/social/gov.
  const top3 = ranked.filter(x => x.domain !== domain && !isAggregator(x.domain)).slice(0, 3);
  // Evidence must let the fact-check gate verify the named competitors AND the lead's own position.
  const top6 = ranked.slice(0, 6);
  const evMap = new Map();
  for (const x of [...top6, ...top3, ...(mine ? [mine] : [])]) { if (x && x.domain) evMap.set(x.pos + ':' + x.domain, x); }
  const evidence = Array.from(evMap.values());
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
  const wLead = weak.top3[0] || null;
  const leader = wLead ? wLead.domain : 'a competing firm';
  const leaderRank = wLead ? `ranks #${wLead.pos}` : 'ranks on page one';
  const youAre = weak.my_position ? `you sit at #${weak.my_position}` : `you are absent`;
  const sentence = `For "${weak.keyword}", ${leader} ${leaderRank} while ${youAre}. That ${city} demand is going to them, not you.`;
  const headline = `For "${weak.keyword}", ${leader} ${leaderRank} and ${youAre}.`;
  const urgency = `Every one of those searches in ${city} is a high-intent client picking ${leader} over you, today.`;
  const blog_offer = `Best ${noun}s in ${city} 2026`;
  return {
    ok: true, domain, city, sector,
    keywords: results.map(r => ({ keyword: r.keyword, my_position: r.my_position, leader: (r.top3[0] || {}).domain || null, leader_pos: (r.top3[0] || {}).pos || null, top3: r.top3.map(t => t.domain) })),
    sentence, headline, urgency, blog_offer,
    evidence: results.map(r => ({ keyword: r.keyword, ranked: r.evidence })), // for the fact-check gate
    already_strong: strong, // keywords they already rank top-5 for (not pitched, kept for context)
    service_noun: serviceNoun,
    gated: true,
  };
}

// --- Audit keyword map: ungated full picture (where they rank now vs the top-3 target) + free autocomplete expansion ---
async function autocomplete(seed) {
  try {
    const r = await fetch('https://google.com/complete/search?output=toolbar&gl=uk&hl=en&q=' + encodeURIComponent(seed), { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const t = await r.text();
    return [...t.matchAll(/data="([^"]+)"/g)].map(m => m[1]).filter(Boolean).slice(0, 8);
  } catch (_e) { return []; }
}
const _catCache = {};
// Derive the real buyer search-category for ANY site (local or global) using the free NIM LLM; cached per domain,
// always falls back to the heuristic noun. This makes the keyword map + citation probe accurate for ecommerce/
// global sites where the bare sector word ("ecommerce") would otherwise produce meaningless competitors.
async function deriveCategoryNoun({ company, sector, html, domain }) {
  const fallback = deriveServiceNoun(company, sector, html);
  const dom = clean(domain || '');
  if (dom && _catCache[dom]) return _catCache[dom];
  const key = process.env.NIM_API_KEY || process.env.GROQ_API_KEY;
  if (!key) return fallback;
  try {
    const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const prompt = 'A business website. Title/snippet: "' + text + '" (company: ' + (company || dom) + ', sector: ' + sector + '). In 2 to 4 words, give the exact phrase a buyer types into Google or an AI assistant to find this kind of provider. Reply with ONLY the phrase, lowercase, no punctuation, no quotes.';
    const base = process.env.NIM_API_KEY ? 'https://integrate.api.nvidia.com/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
    const model = process.env.NIM_API_KEY ? (process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct') : 'llama-3.3-70b-versatile';
    const r = await fetch(base, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 20, temperature: 0.1 }), signal: AbortSignal.timeout(20000) });
    if (r.ok) { const j = await r.json(); let c = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim().toLowerCase().replace(/["'.\n]/g, '').replace(/\s+/g, ' ').trim();
      if (c && c.split(' ').length <= 5 && c.length > 2 && c.length < 40) { if (dom) _catCache[dom] = c; return c; } }
  } catch (_e) {}
  return fallback;
}

async function buildKeywordMap({ domain, company, sector, city, html, country = 'UK', env = process.env, max = 8 }) {
  const dom = clean(domain); if (!dom) return { ok: false, keywords: [] };
  const noun = await deriveCategoryNoun({ company, sector, html, domain: dom });
  const brand = norm(company || dom.split('.')[0]);
  const ctyLabel = ({ UK: 'UK', US: 'USA', AE: 'UAE', SA: 'Saudi Arabia', QA: 'Qatar' })[String(country).toUpperCase()] || country || '';
  let seeds;
  if (city) {
    seeds = keywordsFor(sector, city, noun);
    try { const ac = await autocomplete(noun + ' ' + city); seeds = Array.from(new Set([...seeds, ...ac])); } catch (_e) {}
  } else {
    // No city (global / ecommerce): category-level buyer queries so the ranking ladder still populates.
    seeds = [noun, 'best ' + noun, 'top ' + noun, (noun + ' ' + ctyLabel).trim(), 'best ' + noun + ' online'];
    try { const ac = await autocomplete('best ' + noun); seeds = Array.from(new Set([...seeds, ...ac])); } catch (_e) {}
  }
  seeds = seeds.map(k => String(k).replace(/\s+/g, ' ').trim()).filter(Boolean).filter(k => brand.length < 4 || !norm(k).includes(brand)).slice(0, max);
  const out = [];
  for (const kw of seeds) {
    let r = null; try { r = await checkKeyword(kw, dom, country); } catch (_e) {}
    if (!r) continue;
    const leader = r.top3[0] || {};
    out.push({ keyword: kw, my_position: r.my_position, leader: leader.domain || null, leader_pos: leader.pos || null, target: (r.my_position && r.my_position <= 3) ? r.my_position : 3 });
  }
  if (!out.length) return { ok: false, keywords: [] };
  return { ok: true, service_noun: noun, city: city || ctyLabel, keywords: out };
}

// ── Real AI-citation probe (free path) ────────────────────────────────────────────────────────────────────
// When a buyer asks AI/search for the firm's category, who actually gets surfaced and cited, and is the firm
// among them? AI answer engines (ChatGPT, Perplexity, Google AI, Gemini) synthesise answers from the top-ranked,
// entity-recognised sources, so the live category SERP + entity presence is a real, verifiable proxy for AI
// citation. We name the exact competitor firms that own that surface today. No key beyond the wired SERPER.
const _PROBE_ALIAS = { legal: 'solicitors', law: 'solicitors', 'law-firm': 'solicitors', 'law-firms': 'law firm', solicitor: 'solicitors', healthcare: 'clinic', dental: 'dentist', 'real-estate': 'estate agents', realestate: 'estate agents', property: 'estate agents', financial: 'financial advisers', finance: 'financial advisers', wellness: 'wellness clinic', automotive: 'car dealer', education: 'school', hospitality: 'hotel', professional: 'consultants', ecommerce: 'online store' };
function _probeNoun(company, sector, html) {
  let noun = deriveServiceNoun(company, sector, html);
  const sec = String(sector || '').toLowerCase();
  if (!noun || noun === sec || noun.length < 4) noun = _PROBE_ALIAS[sec] || noun || sec;
  const h = String(html || '').toLowerCase();
  if (sec === 'legal' || sec === 'law' || /solicitor|barrister|litigation|conveyanc/.test(h)) {
    if (/litigation|dispute/.test(h)) noun = 'litigation solicitors';
    else if (/conveyanc|property law/.test(h)) noun = 'conveyancing solicitors';
    else if (/family law|divorce/.test(h)) noun = 'family law solicitors';
    else if (/solicitor|barrister/.test(h) || sec === 'legal' || sec === 'law') noun = noun.includes('solicitor') ? noun : 'solicitors';
  }
  return noun;
}
function parseLlmCompetitors(answer, company) {
  const self = String(company || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/)[0];
  return String(answer || '').split(/[,\n]/)
    .map(x => x.replace(/^\s*\d+[\.\)]\s*/, '').replace(/[*"']/g, '').trim())
    .filter(x => x && x.length > 1 && x.length < 60 && !/^(here|the|top|firms?|providers?|sure|certainly|some|popular)\b/i.test(x))
    .filter(x => { const n = x.toLowerCase().replace(/[^a-z0-9 ]/g, ''); return self ? !n.includes(self) : true; })
    .slice(0, 5);
}
async function aiCitationProbe({ domain, company, sector, city, html, country = 'UK', wikidata = null }) {
  domain = clean(domain);
  const noun = await deriveCategoryNoun({ company, sector, html, domain });
  // Use the same real-buyer query construction as the keyword map (no superlative skew): the plain "noun city" form.
  let q;
  if (city) { const kws = keywordsFor(sector, city, noun).filter(k => !/^best |^top /i.test(k) && !/\d{4}$/.test(k)); q = kws[0] || (noun + ' ' + city); }
  else { q = noun + ' ' + country; }
  let r = null; try { r = await serp.search(q, country, 20); } catch (_e) {}
  if (!r || r.error || !((r.organic || []).length)) {
    // SERP unavailable: fall back to the FREE NIM-only probe so the AI-visibility section still populates at GBP 0.
    let llm = null; try { llm = await llmCitationProbe({ query: q, company }); } catch (_e) {}
    if (llm && llm.ran) {
      const names = parseLlmCompetitors(llm.answer, company);
      const competitors = names.map(n => ({ name: n, domain: null, pos: null }));
      return { ok: true, source: 'llm_only', query: q, country, firm_position: null, competitors, surface_owned_by: names.slice(0, 3), checked: 0, entity_known: !!(wikidata && wikidata.found), llm };
    }
    return { ok: false, reason: 'serp_unavailable', query: q };
  }
  const ranked = r.organic.map(o => ({ pos: o.rank, domain: clean(o.domain) })).filter(x => x.domain);
  const mine = ranked.find(x => x.domain === domain || x.domain.endsWith('.' + domain) || domain.endsWith('.' + x.domain));
  const competitors = []; const seen = new Set();
  for (const x of ranked) {
    if (!x.domain || x.domain === domain) continue;
    if (isAggregator(x.domain)) continue;
    if (seen.has(x.domain)) continue;
    seen.add(x.domain); competitors.push({ domain: x.domain, pos: x.pos });
    if (competitors.length >= 5) break;
  }
  let llm = null; try { llm = await llmCitationProbe({ query: q, company }); } catch (_e) {}
  return {
    ok: true, source: 'serp', query: q, country,
    firm_position: mine ? mine.pos : null,
    competitors, surface_owned_by: competitors.slice(0, 3).map(c => c.domain),
    checked: ranked.length, entity_known: !!(wikidata && wikidata.found),
    llm: llm || { ran: false, reason: 'no_key' },
  };
}

// ── Optional live-LLM answer probe (paid top-up, OFF by default) ─────────────────────────────────────────────
// The free probe above always runs. THIS only fires if a key is present; otherwise it reports no_key so the
// audit can say "free signals used; live LLM probe available." Cost when enabled: ~GBP 0.01-0.03 per audit.
// Try a list of models in order; return the first that yields content (self-healing if one is unprovisioned/rate-limited).
async function _chatComplete({ url, key, models, prompt }) {
  for (const model of models) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 220, temperature: 0.2 }), signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const j = await res.json();
      const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (text && text.trim()) return { model, text };
    } catch (_e) { /* try next model */ }
  }
  return null;
}
async function llmCitationProbe({ query, company }) {
  // Priority: NVIDIA NIM (free, strongest available) -> Groq (free) -> Perplexity -> OpenAI.
  const nim = process.env.NIM_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  const key = groq || nim || process.env.PERPLEXITY_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return { ran: false, reason: 'no_key', note: 'FREE: set NIM_API_KEY (build.nvidia.com) for a live AI-answer probe at GBP0; GROQ_API_KEY also works.' };
  const prompt = 'List the top 8 firms or providers a buyer would consider for "' + query + '". Reply as a plain comma-separated list of names only, no preamble or numbering.';
  let provider, url, models;
  if (groq) { provider = 'groq'; url = 'https://api.groq.com/openai/v1/chat/completions'; models = ['llama-3.3-70b-versatile']; } // Groq first: ~15x faster than NIM at identical accuracy (same Llama 3.3 70B)
  else if (nim) {
    provider = 'nvidia-nim'; url = 'https://integrate.api.nvidia.com/v1/chat/completions';
    models = (process.env.NIM_MODEL ? [process.env.NIM_MODEL] : []).concat(['meta/llama-3.3-70b-instruct', 'abacusai/dracarys-llama-3.1-70b-instruct', 'meta/llama-3.1-70b-instruct']);
  }
  else if (process.env.PERPLEXITY_API_KEY) { provider = 'perplexity'; url = 'https://api.perplexity.ai/chat/completions'; models = ['sonar']; }
  else { provider = 'openai'; url = 'https://api.openai.com/v1/chat/completions'; models = ['gpt-4o-mini']; }
  try {
    const out = await _chatComplete({ url, key, models, prompt });
    if (!out) return { ran: false, reason: 'no_response', provider };
    const base = String(company || '').replace(/[^a-z0-9 ]/gi, '').trim().split(/\s+/).slice(0, 2).join('.{0,3}');
    const cited = !!base && new RegExp(base, 'i').test(out.text);
    return { ran: true, provider, model: out.model, cited, answer: out.text.slice(0, 400) };
  } catch (e) { return { ran: false, reason: 'error', error: String(e.message || e) }; }
}

module.exports = { buildRankInsight, keywordsFor, checkKeyword, deriveServiceNoun, buildKeywordMap, autocomplete, aiCitationProbe, llmCitationProbe };

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
        if (k.leader) { const lr = (ev.ranked || []).find(x => x.domain === k.leader); if (!lr) return { ok: false, reason: 'leader_not_in_serp:' + k.leader }; if (k.leader_pos != null && lr.pos !== k.leader_pos) return { ok: false, reason: 'leader_pos_mismatch:' + k.leader }; }
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
