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

// 3) COOKIE / TRACKER compliance (GDPR/PECR) — named trackers firing without (or ahead of) a consent gate.
// Backed by the Open Cookie Database (Apache-2.0): we name the specific cookies + data controller per tracker.
function cookieCompliance(html, markets) {
  const out = [];
  let det = { trackers: [], consentPlatform: null, hasConsentPlatform: false, hasConsentText: false };
  try { det = require('../compliance/tracker-detect.js').detectTrackers(html || ''); } catch (_e) {}
  const ne = det.trackers.filter(t => /Analytics|Marketing|Advertising/i.test(t.category || ''));
  if (!ne.length) return out;

  const m = markets || { regions: ['UK'], serves_eu: false };
  const regs = [];
  if (m.regions && m.regions.includes('UK')) regs.push('UK PECR + UK GDPR');
  if (m.serves_eu) regs.push('EU GDPR + ePrivacy');
  if (m.regions && m.regions.includes('US')) regs.push('US state privacy law (CCPA/CPRA)');
  if (!regs.length) regs.push('UK PECR + UK GDPR');

  // Name the trackers + the actual cookies they set + the data controller.
  const named = ne.slice(0, 6).map(t => {
    const ck = (t.cookies || []).slice(0, 3).filter(Boolean);
    return t.platform + (ck.length ? ' (sets ' + ck.join(', ') + ' — ' + t.category + ', controller ' + t.controller + ')' : ' (' + t.category + ', controller ' + t.controller + ')');
  });
  const list = named.join('; ');
  const controllers = Array.from(new Set(ne.map(t => t.controller))).slice(0, 5).join(', ');

  if (!det.hasConsentPlatform && !det.hasConsentText) {
    // No consent mechanism at all → clear breach.
    out.push(P('compliance', 'P1', regs.join(' + ') + ' · cookie consent',
      ne.length + ' non-essential tracker(s) load with no detectable consent mechanism: ' + list + '.',
      'These trackers set cookies and share data with ' + controllers + ' the moment the page loads, before the visitor consents. That breaches ' + regs.join(' and ') + '. You serve clients in ' + ((m.regions || ['the UK']).join(', ')) + ', so each of those regimes applies regardless of where the firm is registered. The ICO is actively reviewing the UK\'s top 1,000 sites and the maximum PECR fine is now £17.5M or 4% of global turnover.',
      'Tamazia installs a consent platform that blocks every non-essential tracker until opt-in, with a Reject-All button as prominent as Accept-All.',
      'homepage HTML · ' + ne.length + ' non-essential trackers, no consent gate · controllers: ' + controllers));
  } else {
    // A consent tool/text is present, but we cannot confirm it blocks pre-consent or offers Reject-All parity.
    out.push(P('compliance', 'P2', regs.join(' + ') + ' · consent functionality',
      'Consent signal detected (' + (det.consentPlatform || 'cookie notice') + '), but ' + ne.length + ' non-essential tracker(s) are present and may fire before opt-in: ' + list + '.',
      'A banner alone is not compliance. Under the ICO\'s 2025 standard a Reject-All option must be as prominent and functional as Accept-All, and non-essential tags (' + controllers + ') must not load until consent. The SHEIN and American Express cases both involved cookies set despite a Reject-All click. Verify these tags are genuinely blocked pre-consent.',
      'Tamazia configures the consent platform to block these tags until opt-in and adds an equally prominent, functional Reject-All.',
      'homepage HTML · consent present + ' + ne.length + ' non-essential trackers · verify pre-consent blocking'));
  }
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
