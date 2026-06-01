// Phase B audit scanners — Node-native, no Chrome, no host, fail-open. Each returns evidence-tied
// pointers in the engine's standard shape. Attached to the converged scanSite. Every check degrades
// to an empty result on failure, never throws.
'use strict';
const dns = require('dns').promises;
const UA = 'Mozilla/5.0 (compatible; TamaziaAuditBot/1.0; +https://tamazia.co.uk)';
function P(bucket, severity, citation, fact, layman, fix, evidence) {
  return { bucket, severity, citation, fact, layman_explanation: layman, tamazia_fix_short: fix, recommendation: fix, evidence };
}

// 1) EMAIL-AUTH (SPF/DKIM/DMARC) — a compliance + deliverability finding about THEIR domain.
async function emailAuth(domain) {
  const out = [];
  let spf = null, dmarc = null, dmarcPolicy = '';
  try { const txt = await dns.resolveTxt(domain); spf = txt.flat().find(r => /v=spf1/i.test(r)) || null; } catch (_) {}
  try { const d = await dns.resolveTxt('_dmarc.' + domain); const rec = d.flat().join(''); if (/v=DMARC1/i.test(rec)) { dmarc = rec; const m = rec.match(/p=(\w+)/i); dmarcPolicy = m ? m[1].toLowerCase() : ''; } } catch (_) {}
  // DKIM selectors are arbitrary and cannot be reliably enumerated via DNS, so we do not assert its absence.
  if (!spf) out.push(P('email_security', 'P1', 'SPF record', 'No SPF record on the domain.', 'Anyone can send email that appears to come from your domain, and your own mail is more likely to land in spam. SPF is the baseline anti-spoofing control, and clients who run security checks will flag its absence.', 'Tamazia publishes a correct SPF record.', 'DNS TXT · no v=spf1'));
  if (!dmarc) out.push(P('email_security', 'P1', 'DMARC record', 'No DMARC record.', 'Without DMARC there is no policy telling receivers what to do with spoofed mail, so impersonation of your firm goes unchecked. This is a direct brand-protection and deliverability gap.', 'Tamazia deploys DMARC (start at p=none for monitoring, then enforce).', 'DNS TXT _dmarc · absent'));
  else if (dmarcPolicy === 'none') out.push(P('email_security', 'P2', 'DMARC policy', 'DMARC is set to p=none (monitor only, not enforcing).', 'You can see spoofing reports but receivers are not told to reject impostor mail, so the protection is not actually active.', 'Tamazia moves you to p=quarantine then p=reject after monitoring.', 'DNS TXT _dmarc · p=none'));
  return out;
}

// 2) TECH-STACK detection (fingerprint HTML + headers) — finding + personalisation hook.
function techStack(html, headers) {
  const out = []; const b = (html || '').toLowerCase(); const h = headers || {};
  let stack = null;
  if (/wp-content|wp-includes|\/wp-json/.test(b)) stack = 'WordPress';
  else if (/wixsite|_wix|wix\.com/.test(b)) stack = 'Wix';
  else if (/cdn\.shopify|myshopify/.test(b)) stack = 'Shopify';
  else if (/squarespace/.test(b)) stack = 'Squarespace';
  else if (/webflow/.test(b)) stack = 'Webflow';
  else if ((h['x-powered-by'] || '').toLowerCase().includes('php')) stack = 'PHP (custom)';
  if (stack === 'Wix' || stack === 'Squarespace') out.push(P('tech', 'P2', 'Website platform', `Site is built on ${stack}, a closed DIY builder.`, `${stack} caps technical SEO control (server config, schema injection, Core Web Vitals tuning) and is a common reason regulated firms plateau in search. A move to a controllable stack unlocks the fixes below.`, 'Tamazia advises on a migration path that preserves rankings.', 'HTML fingerprint · ' + stack));
  else if (stack) out.push(P('tech', 'P3', 'Website platform', `Detected platform: ${stack}.`, `Identified your stack as ${stack}; the SEO and compliance fixes are tailored to it.`, 'Tamazia tailors fixes to your platform.', 'HTML fingerprint · ' + stack));
  return out;
}

// 3) COOKIE / TRACKER compliance (GDPR/PECR) — trackers firing without a consent mechanism.
function cookieCompliance(html, markets) {
  const out = []; const b = (html || '').toLowerCase();
  const trackers = [];
  if (/gtag\(|google-analytics|googletagmanager|ga\.js/.test(b)) trackers.push('Google Analytics');
  if (/fbq\(|connect\.facebook\.net/.test(b)) trackers.push('Meta Pixel');
  if (/hotjar/.test(b)) trackers.push('Hotjar');
  if (/clarity\.ms/.test(b)) trackers.push('Microsoft Clarity');
  if (/doubleclick|googleadservices/.test(b)) trackers.push('Google Ads');
  const hasConsent = /cookiebot|onetrust|cookieconsent|cookie-consent|usercentrics|termly|iubenda|we use cookies|cookie policy|cookie settings/.test(b);
  // Which consent regime applies depends on the markets the firm SERVES, not where it is registered.
  const m = markets || { regions: ['UK'], serves_eu: false };
  const regs = []; if (m.regions && m.regions.includes('UK')) regs.push('UK PECR'); if (m.serves_eu) regs.push('EU GDPR/ePrivacy'); if (m.regions && m.regions.includes('US')) regs.push('US state privacy law'); if (!regs.length) regs.push('UK PECR');
  if (trackers.length && !hasConsent) out.push(P('compliance', 'P1', regs.join(' + ') + ' cookie consent', `${trackers.length} tracker(s) load with no detectable consent banner (${trackers.join(', ')}).`, `Non-essential trackers fire before consent, which breaches ${regs.join(' and ')}. Because you serve clients in ${(m.regions||['the UK']).join(', ')}, each of those regimes applies regardless of where the firm is registered. Regulators have fined exactly this, and for a regulated firm it is avoidable exposure.`, 'Tamazia implements a consent gate sized to every market you serve.', 'HTML · trackers present, no consent mechanism · markets: ' + (m.regions||[]).join('+')));
  return out;
}

// Multi-jurisdiction compliance — a UK-registered firm serving EU/US/Gulf must meet each market's regime.
function marketsCompliance(markets, html) {
  const out = []; const b = (html || '').toLowerCase();
  const m = markets || { regions: [], serves_eu: false, eu_countries: [] };
  const hasPrivacy = /privacy policy|privacy notice|data protection|gdpr/.test(b);
  const hasConsent = /cookiebot|onetrust|cookieconsent|usercentrics|we use cookies|cookie policy/.test(b);
  if (m.serves_eu && !hasConsent) out.push(P('compliance', 'P1', 'EU GDPR + ePrivacy (cross-border)', 'Serves EU clients but has no detectable EU-grade consent mechanism.', `You serve clients in the EU (${(m.eu_countries||[]).slice(0,4).join(', ') || 'European markets'}), so EU GDPR and the ePrivacy Directive apply to those visitors even though the firm is UK-registered. The current site does not meet that bar for your European clients.`, 'Tamazia implements an EU-grade consent gate and data-protection notice.', 'markets · serves EU, no EU-grade consent'));
  if ((m.regions || []).includes('US') && !hasPrivacy) out.push(P('compliance', 'P2', 'US CCPA/CPRA', 'Serves US clients with no clear privacy/opt-out notice.', 'California CCPA/CPRA grant US consumers data and opt-out rights; serving them without a compliant notice is an avoidable exposure.', 'Tamazia adds a CCPA-compliant notice and opt-out.', 'markets · serves US, no privacy notice'));
  if ((m.regions || []).length >= 3) out.push(P('compliance', 'P2', 'Multi-jurisdiction posture', `Operates across ${m.regions.length} regions (${m.regions.join(', ')}) on one-size-fits-all compliance.`, `Operating across ${m.regions.join(', ')} means several data-protection and advertising regimes apply at once. A single generic policy rarely satisfies all of them, which is the most common compliance gap for international firms and a direct credibility risk in regulated sectors.`, 'Tamazia maps each market to its regime and closes the gaps.', 'markets · ' + m.regions.join('+')));
  return out;
}

// 4) REGULATED-CLAIMS detection (sector-aware: ASA/MHRA/FCA/SRA).
function regulatedClaims(html, sector) {
  const out = []; const text = (html || '').replace(/<[^>]+>/g, ' ').toLowerCase();
  const rules = {
    healthcare: { rx: /(guaranteed results|100% safe|completely safe|cure[sd]?\b|miracle|pain[- ]free guarantee|no risk|permanent results)/, reg: 'MHRA/ASA', law: 'medical advertising rules (ASA CAP code, MHRA)' },
    financial: { rx: /(guaranteed returns?|risk[- ]free|guaranteed income|guaranteed profit|double your|get rich)/, reg: 'FCA/ASA', law: 'FCA financial promotion rules' },
    'law-firms': { rx: /(guaranteed to win|we guarantee|100% success|guaranteed outcome|guaranteed compensation)/, reg: 'SRA/ASA', law: 'SRA Code + advertising rules' },
    'real-estate': { rx: /(guaranteed sale|guaranteed rental|guaranteed returns?|risk[- ]free investment)/, reg: 'ASA/NTSELAT', law: 'property advertising rules' },
  };
  const r = rules[sector]; if (!r) return out;
  const m = text.match(r.rx);
  if (m) out.push(P('compliance', 'P1', r.reg + ' advertising claims', `Potentially non-compliant claim detected: "${m[0]}".`, `This phrasing risks breaching ${r.law}. Unsubstantiated guarantees in a regulated sector draw complaints and regulator action, and for a firm that sells trust it is a direct credibility exposure.`, 'Tamazia rewrites claims to a compliant, evidence-based form.', 'page text · matched "' + m[0] + '"'));
  return out;
}

// 5) BROKEN LINKS + reachable internal pages (sample, SEO).
async function brokenLinks(domain, html, fetchFn) {
  const out = [];
  const links = new Set();
  for (const m of (html || '').matchAll(/href=["'](\/[^"'#?]+|https?:\/\/[^"'#?]+)["']/gi)) {
    let href = m[1];
    try { const u = new URL(href, 'https://' + domain); if (u.hostname.replace(/^www\./, '') === domain.replace(/^www\./, '')) links.add(u.href); } catch (_) {}
  }
  const sample = Array.from(links).slice(0, 6);
  let broken = 0;
  for (const url of sample) {
    try { const r = await fetchFn(url); if (r && (r.status === 404 || r.status === 410 || (r.status >= 500))) broken++; } catch (_) {}
  }
  if (broken > 0) out.push(P('technical_seo', 'P2', 'Broken internal links', `${broken} of ${sample.length} sampled internal links are broken (404/5xx).`, 'Broken links waste crawl budget, frustrate visitors, and signal neglect to search engines. A full crawl typically finds more.', 'Tamazia runs a full crawl and fixes or redirects every broken link.', 'sampled internal links · ' + broken + ' failing'));
  return out;
}

module.exports = { emailAuth, techStack, cookieCompliance, marketsCompliance, regulatedClaims, brokenLinks };
