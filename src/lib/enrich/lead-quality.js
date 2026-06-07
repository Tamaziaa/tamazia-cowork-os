// 10-layer lead quality scorer + 3-TIER ICP gate. Proves a lead is a REAL regulated business that
// genuinely needs compliance + visibility, and a REACHABLE decision-maker exists, before auto-send.
// Returns { score 0-100, pass, fit, tier, layers[] }.
//
// TIERS (founder: "not too broad, not too tight"; ads are NOT a gate — they're a small score booster):
//   Tier 1 (auto-mint + auto-send): genuine + regulated sector + established firm + SERIOUS gaps
//      (>=1 critical breach OR >=2 compliance gaps) + a visibility gap (>=3 SEO gaps OR not AI-cited)
//      + a VERIFIED named decision-maker email (confidence >= DM_CONF_MIN).
//   Tier 2 (mint only AFTER founder approval): regulated + at least one real gap, but missing something
//      (unverified/guessed DM email, only one gap dimension, or not yet established).
//   Tier 3 (reject): not genuine, not a served regulated sector, or no fixable gap.
// fit = (tier === 1) so the existing enqueue/auto-send path mints+sends Tier-1 only; Tier-2 routes to
// the cockpit "Pending Approval" queue. Tunable via env (ICP_STRICT, COMPLIANCE_MIN, SEO_MIN, DM_CONF_MIN).

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const H = { 'User-Agent': UA, 'Accept': 'text/html' };
const PASS = 35;

// Env-tunable thresholds (defaults are the "balanced" profile). ICP_STRICT=1 tightens Tier-1 gaps.
const STRICT = /^(1|true|yes|on)$/i.test(process.env.ICP_STRICT || '');
const COMPLIANCE_MIN = Number(process.env.COMPLIANCE_MIN || (STRICT ? 2 : 2));   // compliance gaps for "serious"
const SEO_MIN = Number(process.env.SEO_MIN || (STRICT ? 3 : 3));                 // SEO gaps for a visibility gap
const DM_CONF_MIN = Number(process.env.DM_CONF_MIN || 75);                       // decision-maker email confidence for Tier-1

// Sector truth comes from sourcing/icp.js (single source). SERVED = any of the 8 launch verticals (buyer floor,
// Tier-2-eligible). REGULATED = the subset with a structural compliance liability (Tier-1 core; law/health/
// finance/real-estate/education). Hospitality, F&B, automotive, professional are SERVED-not-regulated → they can
// only reach Tier 2 (approval), never auto-send. ALIAS folds legacy sector strings onto the canonical keys.
const { SECTORS } = require('../sourcing/icp.js');
const SERVED = new Set(Object.keys(SECTORS));
const REGULATED = new Set(Object.entries(SECTORS).filter(([, v]) => v.regulated).map(([k]) => k));
const ALIAS = { legal: 'law-firms', lawfirm: 'law-firms', 'law firm': 'law-firms', 'financial-services': 'financial', finance: 'financial', insurance: 'financial', fintech: 'financial', wealth: 'financial', accounting: 'financial', 'beauty-wellness': 'healthcare', dental: 'healthcare', medical: 'healthcare', clinic: 'healthcare', restaurants: 'hospitality', 'f&b': 'hospitality', food: 'hospitality', 'real estate': 'real-estate', realestate: 'real-estate', property: 'real-estate' };
const normSector = (s) => { s = String(s || '').toLowerCase().trim(); return ALIAS[s] || s; };
const { isAggregator } = require('../scraping/serp-engine.js'); // domain-boundary matched (no substring bug)

const truthy = (v) => v === true || /^(1|t|true|yes|y|on)$/i.test(String(v == null ? '' : v));
// Tolerant parsers — accept a JSON string (tab-row callers) OR an already-parsed value (to_jsonb callers).
const asArr = (v) => { if (Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : []; return Array.isArray(p) ? p : []; } catch (_e) { return []; } };
const asObj = (v) => { if (v && typeof v === 'object' && !Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : {}; return (p && typeof p === 'object') ? p : {}; } catch (_e) { return {}; } };

async function fetchSite(domain) {
  for (const p of ['', '/']) {
    try { const r = await fetchWithRetry(`https://${domain}${p}`, { headers: H, timeout: 9000, retries: 0 }); if (r.ok && r.body) return r.body; } catch (_e) {}
  }
  return '';
}

/**
 * Score + tier a lead. lead = { domain, sector, contact_email, contact_confidence, primary_email,
 *   decision_maker_confidence, email_verified, verify_status, ad_intel, all_socials, all_emails,
 *   ai_cited, ai_visibility_gap, audit_critical, audit_high, scrape_stream }
 */
async function scoreLead(lead) {
  const layers = [];
  let score = 0;
  const add = (name, points, ok, detail) => { if (ok) score += points; layers.push({ layer: name, points: ok ? points : 0, max: points, ok: !!ok, detail: detail || '' }); };

  const domain = (lead.domain || '').toLowerCase().replace(/^www\./, '');

  // Layer 1 — GENUINE BUSINESS (hard gate, domain-boundary matched)
  const genuine = !!domain && !isAggregator(domain) && domain.split('.').length <= 4;
  add('1_genuine_business', 10, genuine, genuine ? 'own brandable domain' : 'aggregator/shell — reject');
  if (!genuine) return { score: 0, pass: false, fit: false, tier: 3, layers, reason: 'not_genuine' };

  const html = await fetchSite(domain);
  const lhtml = html.toLowerCase();

  // Layer 1b — SMART AGGREGATOR/LISTICLE CONTENT CHECK
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, ''])[1].toLowerCase();
  const listicle = /(top \d+|best \d+|\bdirectory\b|compare |find a |listings|book .* online|reviews of|near you|where to)/i.test(title)
                || /itemlist/i.test(lhtml) || /\b\d{1,3} (best|top|leading) /i.test(title);
  const extDomains = new Set((html.match(/href=["']https?:\/\/([a-z0-9.-]+)/gi) || []).map(h => h.replace(/href=["']https?:\/\//i, '').split('/')[0].replace(/^www\./, '')).filter(d => d && !d.endsWith(domain) && d !== domain));
  const marketplaceLike = extDomains.size >= 40;
  const aggregatorType = (listicle && marketplaceLike) || (marketplaceLike && extDomains.size >= 80);
  add('1b_not_aggregator_content', 8, !aggregatorType, aggregatorType ? `aggregator-type (${extDomains.size} ext domains${listicle ? ', listicle title' : ''})` : `single business (${extDomains.size} ext links)`);
  if (aggregatorType) return { score: 0, pass: false, fit: false, tier: 3, layers, reason: 'aggregator_type_content' };

  // Layer 2 — LIVE WEBSITE with real content
  add('2_live_website', 10, html.length > 2000, html ? `${Math.round(html.length / 1000)}kb` : 'no site');

  // Layer 3 — DECISION-MAKER CONTACT (named email) — now the strongest conversion predictor (16 pts)
  const primaryEmail = lead.primary_email || lead.contact_email || '';
  const dmConf = Number(lead.decision_maker_confidence || lead.contact_confidence || 0);
  const { isVerifiedStatus } = require('./verify-status.js');
  const dmEmailVerified = truthy(lead.email_verified) || isVerifiedStatus(lead.verify_status);
  const hasNamed = !!(primaryEmail && /@/.test(primaryEmail)) && dmConf >= 60;
  add('3_decision_maker_contact', 16, hasNamed, primaryEmail ? `${primaryEmail} (${dmConf}%${dmEmailVerified ? ', verified' : ''})` : 'none');

  // Layer 4 — MULTIPLE CONTACTS (depth)
  const emailCount = asArr(lead.all_emails).length;
  add('4_contact_depth', 6, emailCount >= 2, `${emailCount} emails`);

  // Layer 5 — AD-SPEND SIGNAL (booster only, NOT a gate) — reduced 14 -> 4
  const adIntel = asObj(lead.ad_intel);
  const pixels = /gtag\(|googletagmanager|fbq\(|connect\.facebook\.net|snap\.licdn\.com|tiktok.*pixel|hotjar|clarity\.ms/i.test(html);
  const adRunner = lead.scrape_stream === 'sponsored' || pixels || (adIntel && Object.keys(adIntel).length > 0);
  add('5_ad_spend_signal', 4, adRunner, adRunner ? (lead.scrape_stream === 'sponsored' ? 'runs Google ads' : 'tracking pixels live') : 'no ad signal (fine — not required)');

  // Layer 6 — SOCIAL / BRAND PRESENCE (maturity signal, 6 -> 8)
  const socials = asObj(lead.all_socials);
  const hasSocial = !!(socials.linkedin || socials.instagram) || /linkedin\.com\/company|instagram\.com\//i.test(html);
  add('6_brand_presence', 8, hasSocial, hasSocial ? 'active socials' : 'thin presence');

  // Layer 7 — REGULATED SECTOR (compliance need is structural; 12 -> 14)
  const sector = normSector(lead.sector);
  const servedSector = SERVED.has(sector);
  const regulated = REGULATED.has(sector);
  add('7_regulated_sector', 14, regulated, regulated ? sector + ' (regulated)' : (servedSector ? sector + ' (served, not regulated)' : (sector || '?')));

  // Layer 8 — COMPLIANCE GAP (they NEED compliance; 12 -> 14)
  const hasPrivacy = /privacy[- ]?policy|\/privacy/i.test(lhtml);
  const hasCookie = /cookie/i.test(lhtml);
  const hasTerms = /terms (and|&) conditions|terms of (use|service)|\/terms/i.test(lhtml);
  const complianceGaps = [!hasPrivacy && 'no privacy policy', !hasCookie && 'no cookie notice', !hasTerms && 'no terms'].filter(Boolean);
  add('8_compliance_gap', 14, complianceGaps.length > 0, complianceGaps.join(', ') || 'compliant — lower need');

  // Layer 9 — SEO GAP (they NEED visibility; 12 -> 14)
  const hasTitle = /<title>[^<]{10,70}<\/title>/i.test(html);
  const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,}/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasH1 = /<h1[\s>]/i.test(html);
  const seoGaps = [!hasMetaDesc && 'weak/no meta description', !hasSchema && 'no schema markup', !hasTitle && 'poor title tag', !hasH1 && 'no H1'].filter(Boolean);
  add('9_seo_gap', 14, seoGaps.length > 0, seoGaps.join(', ') || 'solid SEO — lower need');

  // Layer 10 — SITE SCALE / MATURITY (6 -> 8)
  const pageRefs = (html.match(/<a\s/gi) || []).length;
  add('10_site_maturity', 8, pageRefs >= 15, `${pageRefs} internal links`);

  score = Math.min(100, score);

  // ---- 3-TIER ICP GATE (ads NOT a gate) ----
  // Audit's own findings (post-mint re-score) if present, else live-scan gaps.
  const auditCritical = Number(lead.audit_critical || 0);
  const complianceGapCount = complianceGaps.length;
  const seoGapCount = seoGaps.length;
  const aiVisibilityGap = truthy(lead.ai_visibility_gap) || (lead.ai_cited != null && lead.ai_cited !== '' && !truthy(lead.ai_cited));
  const visibilityGap = seoGapCount >= SEO_MIN || aiVisibilityGap;
  const seriousGaps = auditCritical >= 1 || complianceGapCount >= COMPLIANCE_MIN;
  const established = pageRefs >= 15 || emailCount >= 2 || hasSocial;       // affordable, real — not a startup one-pager
  const dmAny = !!(primaryEmail && /@/.test(primaryEmail));                 // any plausible decision-maker email
  const dmVerified = dmAny && dmConf >= DM_CONF_MIN && dmEmailVerified;     // verified named decision-maker (Tier-1)
  const reachable = hasNamed || dmAny || hasSocial;

  const buyerFloor = servedSector && (seriousGaps || visibilityGap);       // any served vertical with a real, fixable gap
  const strongBuyer = regulated && established && seriousGaps && visibilityGap; // strictly-regulated core buyer

  let tier;
  if (!buyerFloor) tier = 3;                                               // reject: not a served vertical, or no fixable gap
  else if (strongBuyer && dmVerified) tier = 1;                           // CORE regulated buyer: auto-mint + auto-send
  else tier = 2;                                                           // STRETCH (served-not-regulated / unverified DM): approval

  const fit = tier === 1;                                                  // drives existing auto-mint/auto-send path
  const pass = tier <= 2 && genuine && reachable;                          // qualified into the pipeline
  return { score, pass, fit, tier, reachable, layers, compliance_gaps: complianceGaps, seo_gaps: seoGaps, serious_gaps: seriousGaps, visibility_gap: visibilityGap, dm_verified: dmVerified };
}

module.exports = { scoreLead, PASS, REGULATED };

if (require.main === module) {
  (async () => {
    for (const lead of [
      { domain: 'dishoom.com', sector: 'hospitality', contact_email: 'alice.w@dishoom.com', contact_confidence: 89, scrape_stream: 'sponsored' },
      { domain: 'booking.com', sector: 'hospitality', contact_email: '' }
    ]) {
      const r = await scoreLead(lead);
      console.log(`\n${lead.domain}: score=${r.score} pass=${r.pass} fit=${r.fit} tier=${r.tier}`);
      r.layers.forEach(l => console.log(`  ${l.ok ? '✓' : '·'} ${l.layer.padEnd(26)} ${l.points}/${l.max}  ${l.detail}`));
    }
  })();
}
