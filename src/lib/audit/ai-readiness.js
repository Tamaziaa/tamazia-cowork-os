'use strict';
// P3.7 + P3.10 AI / entity-readiness engine — deterministic, £0, no quota, no key. Measures whether AI answer
// engines CAN identify, crawl, trust and cite the firm. Best-free signals: robots.txt AI-crawler access
// (GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot...), llms.txt presence, Organization+sameAs entity
// schema, and knowledge-graph anchors (Wikidata/Wikipedia). This is the root cause of GEO citability.
let _fetch, _detectSchema, _wikidata;
try { _fetch = require('../../skills/S008-personalisation-engine/lib/http.js').fetchWithRetry; } catch (_e) {}
try { const ss = require('./site-scan.js'); _detectSchema = ss.detectSchemaTypes; _wikidata = ss.wikidataEntity; } catch (_e) {}

// The AI crawlers that read the web for answer engines. Blocking them = invisibility to that engine.
const AI_BOTS = [
  { ua: 'GPTBot', engine: 'ChatGPT (OpenAI training/index)' },
  { ua: 'OAI-SearchBot', engine: 'ChatGPT Search' },
  { ua: 'ChatGPT-User', engine: 'ChatGPT browsing' },
  { ua: 'Google-Extended', engine: 'Google Gemini / AI Overviews' },
  { ua: 'ClaudeBot', engine: 'Claude' },
  { ua: 'anthropic-ai', engine: 'Claude (legacy)' },
  { ua: 'PerplexityBot', engine: 'Perplexity' },
  { ua: 'CCBot', engine: 'Common Crawl (feeds most LLMs)' },
  { ua: 'Bytespider', engine: 'TikTok / Doubao' },
  { ua: 'Applebot-Extended', engine: 'Apple Intelligence' },
];

// Parse robots.txt into UA groups; decide if a given UA is fully blocked (Disallow: /).
function _robotsBlocks(robotsTxt) {
  const lines = String(robotsTxt || '').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const groups = []; let cur = null;
  for (const l of lines) {
    const mUA = l.match(/^user-agent:\s*(.+)$/i);
    const mDis = l.match(/^disallow:\s*(.*)$/i);
    if (mUA) { if (!cur || cur._hasRule) { cur = { agents: [], dis: [], _hasRule: false }; groups.push(cur); } cur.agents.push(mUA[1].trim().toLowerCase()); }
    else if (mDis && cur) { cur._hasRule = true; cur.dis.push(mDis[1].trim()); }
  }
  const fullBlock = (uaLower) => {
    // most specific matching group wins; fall back to '*'
    let g = groups.find(x => x.agents.includes(uaLower)) || groups.find(x => x.agents.includes('*'));
    if (!g) return false;
    return g.dis.includes('/');
  };
  return { fullBlock, hadRobots: lines.length > 0 };
}

async function _get(domain, path) {
  if (!_fetch) return null;
  try { const r = await _fetch('https://' + domain + path, { timeout: 10000 }); return (r && (r.ok || r.status === 200)) ? (r.body || '') : null; } catch (_e) { return null; }
}

async function aiReadiness({ domain, company, homeText = null, env = {} } = {}) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const findings = []; let score = 100;
  // 1. robots.txt AI-crawler access
  const robots = await _get(domain, '/robots.txt');
  const blockedBots = [];
  if (robots != null) {
    const { fullBlock } = _robotsBlocks(robots);
    for (const b of AI_BOTS) if (fullBlock(b.ua.toLowerCase())) blockedBots.push(b);
  }
  if (blockedBots.length) {
    const names = blockedBots.map(b => b.ua);
    score -= Math.min(40, blockedBots.length * 8);
    findings.push({
      bucket: 'ai_visibility', severity: blockedBots.some(b => /GPTBot|Google-Extended|PerplexityBot|ClaudeBot/.test(b.ua)) ? 'P1' : 'P2',
      rule_type: 'observed', kind: 'observed', citation: 'AI crawler access', framework_short: 'GEO', citation_url: '',
      fact: 'Your robots.txt blocks ' + blockedBots.length + ' AI crawler(s): ' + names.join(', ') + '.',
      layman_explanation: 'These are the crawlers the AI answer engines use to read the web. By disallowing ' + names.join(', ') + ' you are telling ' + blockedBots.map(b => b.engine).slice(0, 3).join(', ') + ' not to read your site, so they cannot cite you when a buyer asks them for a provider in your field. Your competitors who allow these crawlers get named instead.',
      tamazia_fix_short: 'Tamazia opens the right AI crawlers in robots.txt (while keeping the bots you do not want out) so the answer engines can read and cite you.',
      evidence_quote: 'robots.txt Disallow: / for ' + names.join(', '), evidence: 'GET /robots.txt', fine_low_gbp: null, fine_high_gbp: null,
    });
  }
  // 2. llms.txt presence (emerging AI-content standard)
  const llms = await _get(domain, '/llms.txt');
  const hasLlms = !!(llms && /[a-z]/i.test(llms) && llms.length > 20);
  if (!hasLlms) { score -= 8; }
  // 3. Entity schema (Organization + sameAs)
  let body = homeText; if (body == null) body = await _get(domain, '/') || '';
  let types = []; try { types = (body && _detectSchema) ? Array.from(_detectSchema(body)) : []; } catch (_e) {}
  const hasOrg = types.some(t => /Organization|LocalBusiness|LegalService|MedicalBusiness|ProfessionalService|Corporation/i.test(String(t)));
  // per-type presence (drives the render's structured-data gap checklist with REAL detection, not hardcoded false)
  const _has = (rx) => types.some(t => rx.test(String(t)));
  const hasLocalBusiness = _has(/LocalBusiness|LegalService|MedicalBusiness|Dentist|ProfessionalService/i);
  const hasService = _has(/Service|Offer|Product|OfferCatalog/i);
  const hasFaq = _has(/FAQPage|QAPage/i);
  const hasSameAs = /"sameAs"\s*:/.test(body || '');
  if (!hasOrg) score -= 15;
  if (!hasSameAs) score -= 8;
  // 4. Knowledge-graph anchor (Wikidata) — free
  let wikidata = null; try { if (_wikidata && company) wikidata = await _wikidata(company); } catch (_e) {}
  const inKG = !!(wikidata && (wikidata.id || wikidata.found));
  if (!inKG) score -= 12;
  // Composite readiness finding (entity definition) when weak
  if (!hasOrg || !hasSameAs || !inKG || !hasLlms) {
    const miss = [];
    if (!hasOrg) miss.push('no Organization entity schema');
    if (!hasSameAs) miss.push('no sameAs links to your authoritative profiles');
    if (!inKG) miss.push('no Wikidata knowledge-graph entry');
    if (!hasLlms) miss.push('no llms.txt');
    findings.push({
      bucket: 'ai_visibility', severity: (!hasOrg || !inKG) ? 'P1' : 'P2', rule_type: 'observed', kind: 'observed',
      citation: 'AI entity readiness', framework_short: 'GEO', citation_url: '',
      fact: 'Your AI entity-readiness score is ' + Math.max(0, score) + '/100: ' + miss.join('; ') + '.',
      layman_explanation: 'AI answer engines decide who to cite by first identifying you as a known, trusted entity. They read your Organization schema, the sameAs links that connect you to your verified profiles, and knowledge bases like Wikidata. You are missing ' + miss.length + ' of these anchors, so to an AI engine you are an unknown string rather than a citable provider, and it names the firms it can identify instead.',
      tamazia_fix_short: 'Tamazia builds your machine-readable entity: full Organization schema with sameAs, a Wikidata entry, and an llms.txt, so the answer engines can identify and cite you.',
      evidence_quote: miss.join('; '), evidence: 'entity-readiness check (schema + Wikidata + llms.txt)', fine_low_gbp: null, fine_high_gbp: null,
    });
  }
  score = Math.max(0, Math.min(100, score));
  return { ok: true, score, blocked_ai_bots: blockedBots.map(b => b.ua), has_llms_txt: hasLlms, has_org_schema: hasOrg, has_same_as: hasSameAs, in_wikidata: inKG, schema_types: types, has_localbusiness: hasLocalBusiness, has_service: hasService, has_faq: hasFaq, findings };
}
module.exports = { aiReadiness, AI_BOTS, _robotsBlocks };
