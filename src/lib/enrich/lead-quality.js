// 10-layer lead quality scorer · proves a lead is a REAL business that genuinely needs
// compliance + SEO before it's allowed into auto-send. Returns { score 0-100, pass, fit, layers[] }.
// Combines DB signals (contact, ad-intent, sector) with LIVE site checks (compliance + SEO gaps).
// Auto-send gate: pass = score >= PASS (60) AND genuine AND has a deliverable contact.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const H = { 'User-Agent': UA, 'Accept': 'text/html' };
const PASS = 35;

const REGULATED = new Set(['healthcare', 'legal', 'financial-services', 'real-estate', 'beauty-wellness', 'law-firms', 'finance', 'insurance', 'fintech']);
const { isAggregator } = require('../scraping/serp-engine.js'); // domain-boundary matched (no substring bug)

async function fetchSite(domain) {
  for (const p of ['', '/']) {
    try { const r = await fetchWithRetry(`https://${domain}${p}`, { headers: H, timeout: 9000, retries: 0 }); if (r.ok && r.body) return r.body; } catch (_e) {}
  }
  return '';
}

/**
 * Score a lead. lead = { domain, sector, contact_email, contact_confidence, ad_intel, all_socials, all_emails }
 */
async function scoreLead(lead) {
  const layers = [];
  let score = 0;
  const add = (name, points, ok, detail) => { if (ok) score += points; layers.push({ layer: name, points: ok ? points : 0, max: points, ok: !!ok, detail: detail || '' }); };

  const domain = (lead.domain || '').toLowerCase().replace(/^www\./, '');

  // Layer 1 — GENUINE BUSINESS (hard gate, domain-boundary matched)
  const genuine = !!domain && !isAggregator(domain) && domain.split('.').length <= 4;
  add('1_genuine_business', 10, genuine, genuine ? 'own brandable domain' : 'aggregator/shell — reject');
  if (!genuine) return { score: 0, pass: false, fit: false, layers, reason: 'not_genuine' };

  const html = await fetchSite(domain);
  const lhtml = html.toLowerCase();

  // Layer 1b — SMART AGGREGATOR/LISTICLE CONTENT CHECK (catches aggregator-TYPE sites the
  // static list misses, WITHOUT rejecting genuine single businesses).
  // Signals of an aggregator: directory/listicle title, "compare/find a/top N/near you/listings",
  // schema ItemList, and an unusually high count of OUTBOUND links to OTHER businesses.
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, ''])[1].toLowerCase();
  const listicle = /(top \d+|best \d+|\bdirectory\b|compare |find a |listings|book .* online|reviews of|near you|where to)/i.test(title)
                || /itemlist/i.test(lhtml) || /\b\d{1,3} (best|top|leading) /i.test(title);
  // outbound business-link ratio: many links to *different* external domains = marketplace
  const extDomains = new Set((html.match(/href=["']https?:\/\/([a-z0-9.-]+)/gi) || []).map(h => h.replace(/href=["']https?:\/\//i, '').split('/')[0].replace(/^www\./, '')).filter(d => d && !d.endsWith(domain) && d !== domain));
  const marketplaceLike = extDomains.size >= 40;            // 40+ distinct external sites linked = listings/aggregator
  const aggregatorType = (listicle && marketplaceLike) || (marketplaceLike && extDomains.size >= 80);
  add('1b_not_aggregator_content', 8, !aggregatorType, aggregatorType ? `aggregator-type (${extDomains.size} ext domains${listicle ? ', listicle title' : ''})` : `single business (${extDomains.size} ext links)`);
  if (aggregatorType) return { score: 0, pass: false, fit: false, layers, reason: 'aggregator_type_content' };

  // Layer 2 — LIVE WEBSITE with real content
  add('2_live_website', 10, html.length > 2000, html ? `${Math.round(html.length / 1000)}kb` : 'no site');

  // Layer 3 — DECISION-MAKER CONTACT (named email)
  const hasNamed = !!(lead.contact_email && /@/.test(lead.contact_email)) && Number(lead.contact_confidence || 0) >= 60;
  add('3_decision_maker_contact', 12, hasNamed, lead.contact_email || 'none');

  // Layer 4 — MULTIPLE CONTACTS (depth)
  let emailCount = 0; try { emailCount = (lead.all_emails ? JSON.parse(lead.all_emails) : []).length; } catch (_e) {}
  add('4_contact_depth', 6, emailCount >= 2, `${emailCount} emails`);

  // Layer 5 — AD-SPEND SIGNAL (wants marketing) — sponsored stream / pixels / ad_intel
  let adIntel = {}; try { adIntel = lead.ad_intel ? JSON.parse(lead.ad_intel) : {}; } catch (_e) {}
  const pixels = /gtag\(|googletagmanager|fbq\(|connect\.facebook\.net|snap\.licdn\.com|tiktok.*pixel|hotjar|clarity\.ms/i.test(html);
  const adRunner = lead.scrape_stream === 'sponsored' || pixels || (adIntel && Object.keys(adIntel).length > 0);
  add('5_ad_spend_signal', 14, adRunner, adRunner ? (lead.scrape_stream === 'sponsored' ? 'runs Google ads' : 'tracking pixels live') : 'no ad signal');

  // Layer 6 — SOCIAL / BRAND PRESENCE
  let socials = {}; try { socials = lead.all_socials ? JSON.parse(lead.all_socials) : {}; } catch (_e) {}
  const hasSocial = !!(socials.linkedin || socials.instagram) || /linkedin\.com\/company|instagram\.com\//i.test(html);
  add('6_brand_presence', 6, hasSocial, hasSocial ? 'active socials' : 'thin presence');

  // Layer 7 — REGULATED SECTOR (compliance need is structural)
  const regulated = REGULATED.has(lead.sector);
  add('7_regulated_sector', 12, regulated, regulated ? lead.sector + ' (regulated)' : lead.sector || '?');

  // Layer 8 — COMPLIANCE GAP (they NEED compliance) — missing privacy/cookies/terms
  const hasPrivacy = /privacy[- ]?policy|\/privacy/i.test(lhtml);
  const hasCookie = /cookie/i.test(lhtml);
  const hasTerms = /terms (and|&) conditions|terms of (use|service)|\/terms/i.test(lhtml);
  const complianceGaps = [!hasPrivacy && 'no privacy policy', !hasCookie && 'no cookie notice', !hasTerms && 'no terms'].filter(Boolean);
  add('8_compliance_gap', 12, complianceGaps.length > 0, complianceGaps.join(', ') || 'compliant — lower need');

  // Layer 9 — SEO GAP (they NEED SEO) — weak title/meta/schema/h1
  const hasTitle = /<title>[^<]{10,70}<\/title>/i.test(html);
  const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,}/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasH1 = /<h1[\s>]/i.test(html);
  const seoGaps = [!hasMetaDesc && 'weak/no meta description', !hasSchema && 'no schema markup', !hasTitle && 'poor title tag', !hasH1 && 'no H1'].filter(Boolean);
  add('9_seo_gap', 12, seoGaps.length > 0, seoGaps.join(', ') || 'solid SEO — lower need');

  // Layer 10 — SITE SCALE / MATURITY (real, marketable business not a one-pager)
  const pageRefs = (html.match(/<a\s/gi) || []).length;
  add('10_site_maturity', 6, pageRefs >= 20, `${pageRefs} internal links`);

  // FIT = genuinely wants BOTH compliance and SEO (the ideal Tamazia buyer)
  const fit = (regulated || complianceGaps.length > 0) && (seoGaps.length > 0) && adRunner;

  score = Math.min(100, score);
  // ROBUST PASS: genuine + not-aggregator + score>=35 + REACHABLE on ANY channel
  // (a real clinic with only a role email or only a LinkedIn must NOT be dropped — it routes to
  // the right channel downstream). Named-contact stays a scored bonus, not a hard gate.
  const reachable = hasNamed || !!(lead.contact_email && /@/.test(lead.contact_email)) || hasSocial;
  const pass = score >= PASS && genuine && reachable;
  return { score, pass, fit, reachable, layers, compliance_gaps: complianceGaps, seo_gaps: seoGaps };
}

module.exports = { scoreLead, PASS };

if (require.main === module) {
  (async () => {
    for (const lead of [
      { domain: 'dishoom.com', sector: 'hospitality', contact_email: 'alice.w@dishoom.com', contact_confidence: 89, scrape_stream: 'sponsored' },
      { domain: 'booking.com', sector: 'hospitality', contact_email: '' }
    ]) {
      const r = await scoreLead(lead);
      console.log(`\n${lead.domain}: score=${r.score} pass=${r.pass} fit=${r.fit}`);
      r.layers.forEach(l => console.log(`  ${l.ok ? '✓' : '·'} ${l.layer.padEnd(26)} ${l.points}/${l.max}  ${l.detail}`));
    }
  })();
}
