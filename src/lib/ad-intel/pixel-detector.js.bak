// Ad-pixel detector · the real workaround
// Scans a lead's own homepage HTML for tracking pixels + ad-tags. Detects which
// platforms a company is actively running ads on. Stronger signal than ad-library
// scrapes because: (a) works for every lead, (b) real-time, (c) detects active
// campaigns, (d) no rate limits, (e) no JS rendering needed.
//
// Returns per-platform observations consumable by ad_observations table.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

// Pixel + ad-tech fingerprint patterns
const SIGNATURES = {
  meta: [
    { pattern: /connect\.facebook\.net/i, signal: 'Meta Pixel script' },
    { pattern: /fbq\(['"]init['"]\s*,\s*['"]?(\d{10,18})['"]?/, signal: 'Meta Pixel ID', extract: m => ({ pixel_id: m[1] }) },
    { pattern: /facebook\.com\/tr\?id=(\d+)/, signal: 'Meta Pixel tracker', extract: m => ({ pixel_id: m[1] }) },
    { pattern: /\bfbq\(/, signal: 'Meta Pixel function call' }
  ],
  google: [
    { pattern: /\b(G-[A-Z0-9]{6,12})\b/, signal: 'GA4 tag', extract: m => ({ tag_id: m[1] }) },
    { pattern: /\b(AW-\d{6,12})\b/, signal: 'Google Ads conversion tag', extract: m => ({ ads_id: m[1] }) },
    { pattern: /\b(GTM-[A-Z0-9]{5,9})\b/, signal: 'Google Tag Manager', extract: m => ({ gtm_id: m[1] }) },
    { pattern: /googleadservices\.com\/pagead\/conversion\/(\d+)/, signal: 'Google Ads conversion script', extract: m => ({ ads_id: m[1] }) },
    { pattern: /doubleclick\.net/, signal: 'DoubleClick (Display & Video 360)' }
  ],
  linkedin: [
    { pattern: /snap\.licdn\.com\/li\.lms-analytics/i, signal: 'LinkedIn Insight Tag' },
    { pattern: /_linkedin_partner_id\s*=\s*["']?(\d+)["']?/, signal: 'LinkedIn partner ID', extract: m => ({ partner_id: m[1] }) },
    { pattern: /linkedin\.com\/px\/i\.gif/i, signal: 'LinkedIn tracker pixel' },
    { pattern: /_linkedin_data_partner_id/, signal: 'LinkedIn data partner ID' }
  ],
  tiktok: [
    { pattern: /analytics\.tiktok\.com/i, signal: 'TikTok Pixel script' },
    { pattern: /ttq\.load\(['"]?([A-Z0-9]+)['"]?/, signal: 'TikTok Pixel ID', extract: m => ({ pixel_id: m[1] }) },
    { pattern: /\bttq\.(track|page)\b/, signal: 'TikTok event tracking' }
  ],
  x: [
    { pattern: /static\.ads-twitter\.com\/uwt\.js/i, signal: 'X (Twitter) Ads UWT' },
    { pattern: /twq\(['"]config['"]\s*,\s*['"]?([a-z0-9]+)['"]?/, signal: 'X Pixel ID', extract: m => ({ pixel_id: m[1] }) },
    { pattern: /\btwq\(/, signal: 'X tracking function' }
  ],
  snapchat: [
    { pattern: /sc-static\.net\/scevent\.min\.js/i, signal: 'Snap Pixel script' },
    { pattern: /snaptr\(['"]init['"]\s*,\s*['"]?([\w-]+)['"]?/, signal: 'Snap Pixel ID', extract: m => ({ pixel_id: m[1] }) }
  ],
  reddit: [
    { pattern: /redditstatic\.com\/ads\/pixel\.js/i, signal: 'Reddit Pixel script' },
    { pattern: /rdt\(['"]init['"]\s*,\s*['"]?([\w-]+)['"]?/, signal: 'Reddit Pixel ID', extract: m => ({ pixel_id: m[1] }) }
  ],
  pinterest: [
    { pattern: /s\.pinimg\.com\/ct\/core\.js/i, signal: 'Pinterest Tag script' },
    { pattern: /pintrk\(['"]load['"]\s*,\s*['"]?(\d+)['"]?/, signal: 'Pinterest Tag ID', extract: m => ({ tag_id: m[1] }) }
  ],
  hubspot: [
    { pattern: /js\.hs-(analytics|scripts|forms)\.(com|net)/i, signal: 'HubSpot tracking (B2B intent)' }
  ],
  hotjar: [
    { pattern: /static\.hotjar\.com/i, signal: 'Hotjar (CRO investment signal)' }
  ]
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

async function detect(domain) {
  if (!domain) return [];
  // Single-pass on the root path of www.<domain>; fall back to bare domain only if root failed.
  let body = '';
  const hosts = [`www.${domain}`, domain];
  for (const host of hosts) {
    try {
      const r = await fetchWithRetry(`https://${host}/`, { timeout: 8000, retries: 0, headers: BROWSER_HEADERS });
      if (r.ok && r.body && r.body.length > 1000) { body = r.body; break; }
    } catch (_e) {}
  }
  if (!body) return [];

  const findings = [];
  for (const [platform, sigs] of Object.entries(SIGNATURES)) {
    const platformHits = [];
    for (const sig of sigs) {
      const m = body.match(sig.pattern);
      if (m) {
        const extra = sig.extract ? sig.extract(m) : {};
        platformHits.push({ signal: sig.signal, ...extra });
      }
    }
    if (platformHits.length > 0) {
      // Convert to ad_observations-compatible shape
      findings.push({
        platform: ['hubspot', 'hotjar'].includes(platform) ? 'intent' : platform,
        advertiser_id: platformHits.map(h => h.pixel_id || h.tag_id || h.partner_id || h.ads_id || h.gtm_id || h.dc_id).filter(Boolean)[0] || null,
        advertiser_name: null,
        advertiser_domain: domain.toLowerCase(),
        ad_text: platformHits.map(h => h.signal).join(' · '),
        landing_url: `https://${domain}`,
        landing_domain: domain.toLowerCase(),
        country: null,
        observed_at: new Date().toISOString(),
        confidence: 0.95,
        raw_payload: { _detector: 'pixel', _platform: platform, _signals: platformHits }
      });
    }
  }
  return findings;
}

module.exports = { detect, SIGNATURES };

if (require.main === module) {
  (async () => {
    const samples = ['mishcon.com', 'mayoclinic.org', 'allbirds.com', 'maisonsdumonde.com', 'dishoom.com'];
    for (const d of samples) {
      const r = await detect(d);
      console.log(`${d} → ${r.length} platforms: ${r.map(o => o.platform).join(', ')}`);
    }
  })();
}
