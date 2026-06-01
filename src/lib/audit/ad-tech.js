// Keyless ad-intent — a prospect running advertising pixels/conversion tags is PROVABLY advertising on
// that platform. The strongest hot signal, extracted from the site we already fetch. No API, no scraping.
// Distinguishes conversion/remarketing tags (active paid campaigns) from plain analytics.
'use strict';
function detectAdTech(html) {
  const b = (html || '').toLowerCase();
  const platforms = []; const signals = [];
  // Google Ads (conversion / remarketing) — AW- id or conversion endpoints = paid campaigns, not just GA4
  if (/aw-\d{9,}|googleadservices\.com|google_conversion|\/pagead\/conversion|googleads\.g\.doubleclick/.test(b)) { platforms.push('google-ads'); signals.push('Google Ads conversion/remarketing tag'); }
  // Meta / Facebook pixel
  if (/connect\.facebook\.net\/[a-z_]+\/fbevents\.js|fbq\(\s*['"]track|facebook\.com\/tr\?/.test(b)) { platforms.push('meta-ads'); signals.push('Meta Pixel'); }
  // LinkedIn Insight tag
  if (/snap\.licdn\.com|_linkedin_partner_id|linkedin\.com\/li\.lms-analytics/.test(b)) { platforms.push('linkedin-ads'); signals.push('LinkedIn Insight Tag'); }
  // TikTok pixel
  if (/analytics\.tiktok\.com|ttq\.load|ttq\.track/.test(b)) { platforms.push('tiktok-ads'); signals.push('TikTok Pixel'); }
  // X / Twitter pixel
  if (/static\.ads-twitter\.com|twq\(\s*['"]|t\.co\/i\/adsct/.test(b)) { platforms.push('x-ads'); signals.push('X/Twitter Pixel'); }
  // Microsoft / Bing UET
  if (/bat\.bing\.com|uetq|uet_/.test(b)) { platforms.push('bing-ads'); signals.push('Microsoft/Bing UET'); }
  // DoubleClick / display
  if (/fls\.doubleclick\.net|\.doubleclick\.net\/(?!.*pagead)/.test(b)) { platforms.push('display-ads'); signals.push('DoubleClick/Display'); }
  // Native ads
  if (/criteo|taboola|outbrain/.test(b)) { platforms.push('native-ads'); signals.push('Native (Criteo/Taboola/Outbrain)'); }
  const uniq = Array.from(new Set(platforms));
  return { platforms: uniq, runs_ads: uniq.length > 0, count: uniq.length, signals };
}
module.exports = { detectAdTech };
