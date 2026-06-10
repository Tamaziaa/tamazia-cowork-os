// Tamazia audit · real, evidence-tied site scanner.
// Produces findings tied to the prospect's ACTUAL homepage + headers, never fabricated.
// Zero-dependency (Node 20 global fetch). PageSpeed/CWV layered in only when PAGESPEED_API_KEY is set.
// Self-healing: every probe is independently try/caught and times out; a failure degrades to fewer
// findings, never an exception. Output pointers match the audit renderer's pointer shape.

'use strict';

let _http = null;
try { _http = require(require('path').resolve(__dirname, '..', '..', 'skills', 'S008-personalisation-engine', 'lib', 'http.js')); } catch (_) {}
const UA = (_http && _http.UA) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BH = (_http && _http.BROWSER_HEADERS) || { 'User-Agent': UA };
const _detectChallenge = (_http && _http.detectChallenge) || (() => false);

async function timed(fetchPromise, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetchPromise(ctrl.signal); }
  finally { clearTimeout(t); }
}

async function getHtml(url) {
  // Converged onto S008 fetchWithRetry (shared retry + UA + header-map); falls back to global fetch.
  if (_http && _http.fetchWithRetry) {
    try {
      const r = await _http.fetchWithRetry(url, { timeout: 20000, retries: 2 });
      const headers = {}; for (const [k, v] of Object.entries(r.headers || {})) headers[k.toLowerCase()] = v;
      return { ok: r.ok, status: r.status, headers, body: r.body || '', finalUrl: url, challenge: !!r.challenge };
    } catch (_e) { /* fall through */ }
  }
  try {
    const r = await timed((signal) => fetch(url, { redirect: 'follow', headers: BH, signal }), 20000);
    const headers = {};
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const body = await r.text();
    const challenge = _detectChallenge(r.status, body);
    return { ok: (r.ok && !challenge), status: r.status, headers, body, finalUrl: r.url || url, challenge };
  } catch (_e) { return { ok: false, status: 0, headers: {}, body: '', finalUrl: url }; }
}

async function exists(url) {
  try {
    const r = await timed((signal) => fetch(url, { redirect: 'follow', headers: BH, signal }), 12000);
    return r.ok;
  } catch (_e) { return null; } // null = could not determine
}

async function getText(url) {
  try { const r = await timed((signal) => fetch(url, { redirect: 'follow', headers: BH, signal }), 10000); if (!r.ok) return ''; return await r.text(); } catch (_e) { return ''; }
}
// --- AI crawler access (GEO): is the site blocking the bots that feed ChatGPT/Claude/Perplexity/Google AI? ---
function aiCrawlerPointers(robotsBody) {
  const out = []; const b = String(robotsBody || '');
  const bots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended', 'Bytespider'];
  const blocked = bots.filter(bot => new RegExp('user-agent:\\s*' + bot + '[\\s\\S]{0,300}?disallow:\\s*/', 'i').test(b));
  if (blocked.length) out.push(P('ai_visibility', 'P1', 'AI crawler access', 'Your robots.txt blocks AI crawlers: ' + blocked.slice(0, 6).join(', ') + '.', 'These are the exact bots that let ChatGPT, Claude, Perplexity and Google AI read and cite your site. Blocking them guarantees you are absent from AI answers in your category while competitors who allow them get named.', 'Tamazia opens the right AI crawlers (and blocks only what should stay private) so AI engines can read and cite you.', 'robots.txt · Disallow for ' + blocked.join(', ')));
  return out;
}
// --- CrUX real-user field data (free, same Google key) ---
async function cruxField(domain, key) {
  if (!key) return null;
  try {
    const r = await timed((signal) => fetch('https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=' + key, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ origin: 'https://' + domain }), signal }), 12000);
    if (!r || !r.ok) return null;
    const d = await r.json(); const m = (d.record && d.record.metrics) || {};
    const p75 = (k) => (m[k] && m[k].percentiles) ? m[k].percentiles.p75 : null;
    return { lcp: p75('largest_contentful_paint'), inp: p75('interaction_to_next_paint'), cls: p75('cumulative_layout_shift') };
  } catch (_e) { return null; }
}
function cruxPointers(crux) {
  const out = []; if (!crux) return out;
  if (crux.lcp && crux.lcp > 2500) out.push(P('technical_seo', crux.lcp > 4000 ? 'P1' : 'P2', 'Core Web Vitals · real-user LCP', 'Real Chrome users experience an LCP of ' + (crux.lcp / 1000).toFixed(1) + 's (Google target under 2.5s).', 'This is field data from real visitors in Google\'s Chrome UX Report, the exact data Google uses for ranking. Slow real-world load is the single most common reason buyers bounce before reading anything.', 'Tamazia brings real-user LCP under 2.5s.', 'CrUX field data · p75 LCP ' + Math.round(crux.lcp) + 'ms'));
  if (crux.inp && crux.inp > 200) out.push(P('technical_seo', crux.inp > 500 ? 'P1' : 'P2', 'Core Web Vitals · real-user INP', 'Real users experience an INP of ' + Math.round(crux.inp) + 'ms (Google target under 200ms).', 'Interaction to Next Paint is a Core Web Vital and a ranking factor. High INP means the site feels sluggish when users click or type.', 'Tamazia reduces INP below 200ms.', 'CrUX field data · p75 INP ' + Math.round(crux.inp) + 'ms'));
  if (crux.cls != null && crux.cls > 0.1) out.push(P('technical_seo', 'P2', 'Core Web Vitals · real-user CLS', 'Real users experience a CLS of ' + Number(crux.cls).toFixed(2) + ' (target under 0.1).', 'Layout shift frustrates real visitors and is a Google ranking factor.', 'Tamazia eliminates layout shift.', 'CrUX field data · p75 CLS ' + Number(crux.cls).toFixed(3)));
  return out;
}
// --- HTML signal extraction (real, from the fetched page) ---
function extractSignals({ body, headers }) {
  const b = (body || '');
  const lc = b.toLowerCase();
  const titleMatch = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = b.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const h1Count = (lc.match(/<h1[\s>]/g) || []).length;
  // #17 keyword spine: a bounded plain-text corpus of the homepage so the category-noun classifier reads the
  // firm's ACTUAL body copy (what it sells), not just the <title>. Additive — nothing read signals.corpus before.
  const _corpus = b.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  return {
    corpus: _corpus,
    title: titleMatch ? titleMatch[1].trim() : '',
    title_len: titleMatch ? titleMatch[1].trim().length : 0,
    meta_description: !!descMatch,
    meta_description_len: descMatch ? descMatch[1].trim().length : 0,
    json_ld: lc.includes('application/ld+json'),
    open_graph: /property=["']og:/i.test(b),
    twitter_card: /name=["']twitter:card["']/i.test(b),
    canonical: /rel=["']canonical["']/i.test(b),
    viewport: /name=["']viewport["']/i.test(b),
    lang: /<html[^>]+lang=/i.test(b),
    h1_count: h1Count,
    favicon: /rel=["'][^"']*icon/i.test(b),
    hsts: !!headers['strict-transport-security'],
    csp: !!headers['content-security-policy'],
    xcto: !!headers['x-content-type-options'],
    xfo: !!headers['x-frame-options'],
    refpol: !!headers['referrer-policy'],
    permpol: !!headers['permissions-policy'],
    html_bytes: b.length,
    // CONNECTION-LAYER trigger signals (wappalyzer-style fingerprints) — drive which laws actually attach
    uses_ai: /intercom|drift\.com|tidio|tawk\.to|crisp\.chat|livechatinc|live ?chat|botpress|voiceflow|dialogflow|api\.openai|openai|chatgpt|gpt-?4|anthropic|claude\.ai|perplexity|ai[- ]?(assistant|chatbot|powered|widget)|chatbot|kommunicate|manychat/i.test(b),
    payments: /js\.stripe\.com|checkout\.stripe|stripe\.com\/v3|paypal\.com\/sdk|paypalobjects|braintreegateway|worldpay|opayo|sagepay|gocardless|klarna|adyen|squareup|\/checkout\b|add[- ]to[- ](cart|basket)|data-add-to-cart/i.test(b),
    biometrics: /face[- ]?(id|recognition|scan)|facial[- ]recognition|fingerprint(ing)?|biometric|retina scan|voiceprint/i.test(b),
    ugc: /\/forum|community\.|leave a (review|comment)|post a (comment|review)|user[- ]reviews|discussion board|disqus|message board|comment-section|comments\b.{0,20}section/i.test(b),
    has_forms: /<form[\s>]/i.test(b),
  };
}

// --- Optional PageSpeed (full Lighthouse, mobile + desktop) — only if a free key is configured ---
// Google PSI fetches the site ITSELF (real Chrome), so it returns real metrics even when our own scraper is
// bot-challenged. We call BOTH strategies and extract the COMPLETE Lighthouse result per strategy so the render
// can always populate desktop AND mobile metric boxes for performance / CWV / SEO / accessibility / best-practices.

// Brand-tone, urgent, one-line fix synthesised from a Lighthouse audit (e.g. "Defer 3 render-blocking scripts —
// 1.8s off first paint"). Uses the audit's own savings (ms/bytes) + element count so each line is specific + real.
function _psiFixLine(au) {
  const id = au.id || '';
  const ms = (au.savings_ms != null && au.savings_ms >= 50) ? Math.round(au.savings_ms) : null;
  const kb = (au.savings_bytes != null && au.savings_bytes >= 1024) ? Math.round(au.savings_bytes / 1024) : null;
  const n = au.node_count || au.items || 0;
  const saved = ms ? `— ${(ms / 1000).toFixed(ms >= 1000 ? 1 : 2)}s faster` : (kb ? `— ${kb} KB lighter` : '');
  const T = {
    'render-blocking-resources': `Defer ${n || ''} render-blocking resource${n === 1 ? '' : 's'}`.replace('  ', ' '),
    'render-blocking-insight': 'Strip render-blocking requests from first paint',
    'unused-javascript': `Cut unused JavaScript${n ? ` across ${n} file${n === 1 ? '' : 's'}` : ''}`,
    'unused-css-rules': 'Remove unused CSS from the critical path',
    'unminified-javascript': 'Minify JavaScript bundles',
    'unminified-css': 'Minify CSS',
    'modern-image-formats': 'Serve images as WebP/AVIF',
    'uses-optimized-images': 'Compress oversized images',
    'uses-responsive-images': 'Ship correctly-sized responsive images',
    'efficient-animated-content': 'Replace heavy GIFs with video',
    'offscreen-images': 'Lazy-load offscreen images',
    'total-byte-weight': 'Trim total page weight',
    'uses-text-compression': 'Enable Brotli/gzip text compression',
    'server-response-time': 'Cut server response time (TTFB)',
    'redirects': 'Remove redirect chains before first byte',
    'uses-long-cache-ttl': 'Set long cache lifetimes on static assets',
    'cache-insight': 'Cache static assets aggressively',
    'largest-contentful-paint': 'Pull LCP under 2.5s',
    'first-contentful-paint': 'Speed first paint',
    'cumulative-layout-shift': 'Lock layout to kill CLS',
    'total-blocking-time': 'Split JS to cut main-thread blocking',
    'interactive': 'Reach interactive sooner',
    'speed-index': 'Speed visual completion',
    'mainthread-work-breakdown': 'Reduce main-thread work',
    'bootup-time': 'Cut JavaScript execution time',
    'unsized-images': `Set width/height on ${n || ''} image${n === 1 ? '' : 's'} to stop shift`.replace('  ', ' '),
    'image-alt': `Add alt text to ${n || ''} image${n === 1 ? '' : 's'}`.replace('  ', ' '),
    'color-contrast': `Fix contrast on ${n || ''} element${n === 1 ? '' : 's'} (WCAG AA)`.replace('  ', ' '),
    'label': `Label ${n || ''} form control${n === 1 ? '' : 's'} for screen readers`.replace('  ', ' '),
    'link-name': `Give ${n || ''} link${n === 1 ? '' : 's'} an accessible name`.replace('  ', ' '),
    'heading-order': 'Fix the heading hierarchy',
    'html-has-lang': 'Set the page language attribute',
    'meta-description': 'Add a compelling meta description',
    'document-title': 'Write a unique, keyword-led title',
    'is-crawlable': 'Unblock indexing so Google can rank you',
    'structured-data': 'Ship Schema.org so search + AI parse you',
    'tap-targets': 'Size mobile tap targets so users can act',
    'font-size': 'Fix illegible mobile font sizes',
    'errors-in-console': 'Clear the JavaScript console errors',
    'deprecations': 'Remove deprecated browser APIs',
  };
  const base = T[id] || (au.title ? String(au.title).replace(/\s+/g, ' ').trim() : 'Resolve this Lighthouse issue');
  return saved ? `${base} ${saved}` : base;
}

// Extract ONE audit (failing / opportunity / diagnostic) into the render shape, with savings + element pinpoint.
function _psiAudit(x) {
  const _it = Array.isArray(x.details && x.details.items) ? x.details.items : [];
  const _n = _it.map(q => q && q.node).filter(Boolean)[0] || null;
  const _ov = (x.details && typeof x.details.overallSavingsMs === 'number') ? x.details.overallSavingsMs : null;
  const _ob = (x.details && typeof x.details.overallSavingsBytes === 'number') ? x.details.overallSavingsBytes : null;
  const _ms = (x.metricSavings && (x.metricSavings.LCP || x.metricSavings.FCP || x.metricSavings.TBT)) || null;
  const a = {
    id: x.id,
    title: x.title || '',
    description: String(x.description || '').replace(/\s*\[[^\]]*\]\([^)]*\)/g, '').trim(),
    score: x.score,
    scoreDisplayMode: x.scoreDisplayMode || '',
    displayValue: x.displayValue || '',
    numericValue: (typeof x.numericValue === 'number') ? x.numericValue : null,
    savings_ms: (_ov != null ? _ov : _ms),
    savings_bytes: _ob,
    items: _it.length || 0,
    node_snippet: (_n && _n.snippet) ? String(_n.snippet) : '',
    node_selector: (_n && _n.selector) ? String(_n.selector) : '',
    node_count: _it.filter(q => q && q.node).length,
  };
  a.fix = _psiFixLine(a);
  return a;
}

// Parse ONE strategy's raw PSI JSON into { scores, cwv, audits[] } + the legacy flat fields the current render reads.
function _parsePsiStrategy(d) {
  const lr = (d && d.lighthouseResult) || {};
  const cats = lr.categories || {};
  const a = lr.audits || {};
  const le = (d && d.loadingExperience && d.loadingExperience.metrics) || {};
  const num = (id) => (a[id] && typeof a[id].numericValue === 'number') ? a[id].numericValue : null;
  const cat = (k) => (cats[k] && typeof cats[k].score === 'number') ? cats[k].score : null;
  const field = (k) => (le[k] && typeof le[k].percentile === 'number') ? le[k].percentile : null;
  const scores = {
    performance: cat('performance'),
    accessibility: cat('accessibility'),
    'best-practices': cat('best-practices'),
    seo: cat('seo'),
    pwa: cat('pwa'),
  };
  // CWV: prefer real-user FIELD data (loadingExperience) where available, else Lighthouse LAB. Flag the source.
  const f_lcp = field('LARGEST_CONTENTFUL_PAINT_MS'), f_cls = field('CUMULATIVE_LAYOUT_SHIFT_SCORE'),
        f_fcp = field('FIRST_CONTENTFUL_PAINT_MS'), f_inp = field('INTERACTION_TO_NEXT_PAINT'),
        f_ttfb = field('EXPERIMENTAL_TIME_TO_FIRST_BYTE');
  const cwv = {
    lcp_ms: f_lcp != null ? f_lcp : num('largest-contentful-paint'),
    cls: f_cls != null ? (f_cls / 100) : num('cumulative-layout-shift'),   // CrUX CLS percentile is x100
    fcp_ms: f_fcp != null ? f_fcp : num('first-contentful-paint'),
    tbt_ms: num('total-blocking-time'),
    si_ms: num('speed-index'),
    tti_ms: num('interactive'),
    inp_ms: f_inp != null ? f_inp : num('interaction-to-next-paint'),
    ttfb_ms: f_ttfb != null ? f_ttfb : num('server-response-time'),
    source: (f_lcp != null || f_cls != null) ? 'field+lab' : 'lab',
  };
  // ALL failing / opportunity / diagnostic audits (score present and < 0.9), richest-first by savings.
  const audits = Object.values(a)
    .filter(x => x && x.score !== null && x.score < 0.9 && ['binary', 'numeric', 'metricSavings'].includes(x.scoreDisplayMode))
    .map(_psiAudit)
    .sort((p, q) => (q.savings_ms || 0) - (p.savings_ms || 0) || (q.savings_bytes || 0) - (p.savings_bytes || 0));
  return { scores, cwv, audits };
}

// Back-compat: the current site render reads scan.psi.{perf,seo,cls,lcp_ms,tbt_ms,fcp_ms,audits}. Project a parsed
// strategy onto those flat fields so an unchanged renderer keeps working (we default these from MOBILE downstream).
function _flatFromStrategy(s) {
  if (!s) return null;
  return {
    perf: s.scores.performance,
    seo: s.scores.seo,
    lcp_ms: s.cwv.lcp_ms,
    cls: s.cwv.cls,
    tbt_ms: s.cwv.tbt_ms,
    fcp_ms: s.cwv.fcp_ms,
    audits: s.audits,
  };
}

// Legacy single-arg parser kept for back-compat (and the dev cache path / exported API).
function _parsePsi(d) {
  try { return _flatFromStrategy(_parsePsiStrategy(d)); } catch (_e) { return null; }
}

// Resilient single-strategy fetch → RAW PSI JSON. >=3 attempts w/ backoff (PSI intermittently 429s / returns an
// empty run); validates lighthouseResult is present; per-strategy write-through dev cache. Returns null on failure.
async function _fetchPsiRaw(domain, key, strategy) {
  const tag = strategy === 'desktop' ? '.desktop' : '';   // mobile cache file keeps the legacy <domain>.json name
  try {
    const dir = process.env.PSI_CACHE_DIR;
    if (dir) { const fs = require('fs'); const f = dir + '/' + domain + tag + '.json'; if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); }
  } catch (_e) {}
  if (!key) return null;
  const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&strategy=${strategy}` +
    `&category=performance&category=seo&category=accessibility&category=best-practices&key=${key}`;
  for (let i = 0; i < 3; i++) {
    try {
      // Per-attempt cap 45s: PSI runs a full Lighthouse pass on the live site, and our audit targets are SLOW
      // sites — exactly the ones whose run exceeds a tight cap and times out to a false "not assessed". 45s clears
      // the slow-site tail; the retry+backoff loop and write-through cache still bound total wait + recover fail-soft.
      const r = await timed((signal) => fetch(u, { signal }), 45000);
      if (r.ok) {
        const j = await r.json();
        if (j && j.lighthouseResult && j.lighthouseResult.audits) {
          try { const dir = process.env.PSI_CACHE_DIR; if (dir) { const fs = require('fs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(dir + '/' + domain + tag + '.json', JSON.stringify(j)); } } catch (_e) {}
          return j;
        }
      }
    } catch (_e) { /* transient: retry */ }
    if (i < 2) await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}

// Top-level PSI: fetch BOTH strategies in parallel, attach scan.psi.mobile + scan.psi.desktop (each {scores,cwv,
// audits[]}), and keep the legacy flat fields populated from MOBILE (falling back to desktop) so the existing
// render is unchanged. Robust: if one strategy fails we still return the other; null only when BOTH fail
// (URL genuinely unreachable to Google's own crawler).
async function pageSpeed(domain, key) {
  const [rawM, rawD] = await Promise.all([
    _fetchPsiRaw(domain, key, 'mobile'),
    _fetchPsiRaw(domain, key, 'desktop'),
  ]);
  if (!rawM && !rawD) return null;
  let mobile = null, desktop = null;
  try { mobile = rawM ? _parsePsiStrategy(rawM) : null; } catch (_e) {}
  try { desktop = rawD ? _parsePsiStrategy(rawD) : null; } catch (_e) {}
  // Legacy flat fields default from mobile (Google's ranking strategy), else desktop.
  const flat = _flatFromStrategy(mobile) || _flatFromStrategy(desktop) || {};
  return Object.assign({}, flat, { mobile, desktop });
}

function P(bucket, severity, citation, fact, layman, fix, evidence) {
  return { bucket, severity, citation, fact, layman_explanation: layman, tamazia_fix_short: fix, recommendation: fix, evidence };
}

// Map real signals -> evidence-tied pointers. Only emits a finding where the evidence supports it.
function pointersFromSignals(sig, psi, sector) {
  const out = [];
  // AI visibility — the headline Tamazia USP. Structured data is what AI engines parse.
  if (!sig.meta_description) {
    out.push(P('seo', 'P2', 'Meta description',
      'Homepage is missing a meta description.',
      'Search engines fall back to scraping random page text for your result snippet, which suppresses click-through. A deliberate description is a basic, high-leverage SEO control your site is missing.',
      'Tamazia writes sector-tuned meta descriptions across the site.',
      'fetched homepage · no <meta name="description">'));
  } else if (sig.meta_description_len < 70) {
    out.push(P('seo', 'P2', 'Meta description',
      'Meta description is very short (' + sig.meta_description_len + ' chars).',
      'A thin description under-uses the snippet space Google gives you, lowering click-through versus competitors with a full, benefit-led description.',
      'Tamazia rewrites descriptions to the optimal 140-160 characters.',
      'fetched homepage · description length ' + sig.meta_description_len));
  }
  if (!sig.open_graph || !sig.twitter_card) {
    out.push(P('content_depth', 'P2', 'Open Graph / Twitter cards',
      'Social share tags are incomplete (' + (sig.open_graph ? '' : 'no Open Graph; ') + (sig.twitter_card ? '' : 'no Twitter card') + ').',
      'When your pages are shared on LinkedIn or X, they render as a bare link with no title, image, or description, which kills engagement on the channel where professional referrals actually happen.',
      'Tamazia adds Open Graph + Twitter card tags with branded preview images.',
      'fetched homepage · og/twitter meta absent'));
  }
  if (sig.h1_count === 0) {
    out.push(P('seo', 'P1', 'Heading structure',
      'No <h1> heading on the homepage.',
      'The H1 is the strongest on-page ranking signal for what a page is about. Without one, search and AI engines must guess your primary topic, weakening every keyword you want to rank for.',
      'Tamazia restructures page headings to a clean H1-H2-H3 hierarchy.',
      'fetched homepage · zero h1 elements'));
  }
  if (!sig.canonical) {
    out.push(P('technical_seo', 'P2', 'Canonical tag',
      'No canonical URL declared.',
      'Without a canonical tag, duplicate URL variants (www, trailing slash, query strings) compete against each other and split your ranking authority.',
      'Tamazia sets canonical tags site-wide to consolidate authority.',
      'fetched homepage · no rel="canonical"'));
  }
  if (!sig.hsts) {
    out.push(P('security', 'P2', 'HSTS header',
      'No HTTP Strict-Transport-Security header.',
      'Connections can be downgraded from HTTPS, and enterprise procurement and security questionnaires routinely check for HSTS. Its absence is an avoidable trust gap with corporate clients.',
      'Tamazia enables HSTS at the edge.',
      'response headers · strict-transport-security absent'));
  }
  if (!sig.csp) {
    out.push(P('security', 'P2', 'Content-Security-Policy',
      'No Content-Security-Policy header.',
      'A missing CSP leaves the site more exposed to script-injection and is another item flagged in client security reviews.',
      'Tamazia ships a tuned CSP.',
      'response headers · content-security-policy absent'));
  }
  if (!sig.xfo && !sig.csp) {
    out.push(P('security', 'P2', 'Clickjacking protection', 'No X-Frame-Options or CSP frame-ancestors directive.', 'The site can be embedded in a hostile iframe (clickjacking), and corporate-client security questionnaires check for this. An avoidable trust gap.', 'Tamazia sets X-Frame-Options and CSP frame-ancestors.', 'response headers · x-frame-options absent'));
  }
  if (!sig.refpol) {
    out.push(P('security', 'P3', 'Referrer-Policy', 'No Referrer-Policy header.', 'Full URLs (which can carry sensitive query parameters) leak to third parties on outbound navigation without a Referrer-Policy.', 'Tamazia sets a strict Referrer-Policy.', 'response headers · referrer-policy absent'));
  }
  if (!sig.permpol) {
    out.push(P('security', 'P3', 'Permissions-Policy', 'No Permissions-Policy header.', 'Powerful browser features (camera, microphone, geolocation) are not restricted, widening the attack surface a security review will flag.', 'Tamazia sets a least-privilege Permissions-Policy.', 'response headers · permissions-policy absent'));
  }
  // CWV findings now come from psiPointers() (lab) + cruxPointers() (real-user field data) — deduped, no double-count here.
  return out;
}

// PageSpeed/Lighthouse audit -> Tamazia finding map (word-by-word SEO + technical + accessibility bracket).
const PSI_MAP = {
  'is-crawlable': ['seo','P0','Tamazia removes the indexing blockers so Google can rank these pages at all.'],
  'http-status-code': ['seo','P1','Tamazia fixes the non-200 status codes that stop pages being indexed.'],
  'document-title': ['seo','P1','Tamazia writes unique, keyword-led title tags for every page.'],
  'meta-description': ['seo','P1','Tamazia writes a compelling meta description for every page to lift click-through.'],
  'link-text': ['seo','P2','Tamazia rewrites generic link text into descriptive, keyword-rich anchors.'],
  'crawlable-anchors': ['seo','P1','Tamazia makes every link crawlable so equity and discovery flow.'],
  'robots-txt': ['seo','P2','Tamazia publishes a valid robots.txt pointing crawlers at the sitemap.'],
  'hreflang': ['seo','P2','Tamazia adds correct hreflang for each market you serve.'],
  'canonical': ['seo','P2','Tamazia sets correct canonical tags to consolidate ranking signals.'],
  'image-alt': ['seo','P2','Tamazia adds descriptive alt text to every image (SEO + accessibility).'],
  'font-size': ['seo','P2','Tamazia fixes mobile font legibility.'],
  'tap-targets': ['seo','P2','Tamazia sizes mobile tap targets so users can act.'],
  'structured-data': ['ai_visibility','P1','Tamazia ships full Schema.org structured data so search and AI engines can parse you.'],
  'largest-contentful-paint': ['technical_seo','P1','Tamazia cuts LCP below 2.5s (image, server and render-path optimisation).'],
  'first-contentful-paint': ['technical_seo','P2','Tamazia speeds first paint via critical CSS and render-path fixes.'],
  'cumulative-layout-shift': ['technical_seo','P1','Tamazia eliminates layout shift with sized media and reserved space.'],
  'total-blocking-time': ['technical_seo','P2','Tamazia reduces main-thread blocking via JS splitting and deferral.'],
  'speed-index': ['technical_seo','P2','Tamazia speeds visual completion of the page.'],
  'interactive': ['technical_seo','P2','Tamazia reduces time-to-interactive.'],
  'render-blocking-resources': ['technical_seo','P2','Tamazia removes render-blocking CSS and JavaScript.'],
  'render-blocking-insight': ['technical_seo','P2','Tamazia removes render-blocking requests.'],
  'unused-javascript': ['technical_seo','P2','Tamazia strips unused JavaScript from the critical path.'],
  'unused-css-rules': ['technical_seo','P2','Tamazia removes unused CSS.'],
  'total-byte-weight': ['technical_seo','P2','Tamazia compresses and trims total page weight.'],
  'server-response-time': ['technical_seo','P2','Tamazia improves server response time (TTFB).'],
  'uses-text-compression': ['technical_seo','P2','Tamazia enables text compression.'],
  'modern-image-formats': ['technical_seo','P2','Tamazia serves modern image formats (WebP/AVIF).'],
  'uses-responsive-images': ['technical_seo','P2','Tamazia serves correctly sized responsive images.'],
  'redirects': ['technical_seo','P2','Tamazia removes redirect chains that slow first load.'],
  'cache-insight': ['technical_seo','P2','Tamazia sets efficient cache lifetimes for static assets.'],
  'image-delivery-insight': ['technical_seo','P2','Tamazia optimises image delivery (size, format, compression).'],
  'document-latency-insight': ['technical_seo','P2','Tamazia reduces document request latency.'],
  'lcp-discovery-insight': ['technical_seo','P2','Tamazia fixes LCP resource discovery so the main content loads sooner.'],
  'network-dependency-tree-insight': ['technical_seo','P2','Tamazia flattens the network dependency chain.'],
  'unsized-images': ['technical_seo','P2','Tamazia adds explicit width and height to images to stop layout shift.'],
  'color-contrast': ['accessibility','P1','Tamazia fixes colour contrast to WCAG 2.1 AA (also an Equality Act / EAA exposure).'],
  'select-name': ['accessibility','P2','Tamazia labels every form control for screen readers.'],
  'frame-title': ['accessibility','P2','Tamazia titles all iframes.'],
  'target-size': ['accessibility','P2','Tamazia sizes touch targets to WCAG 2.5.5.'],
  'label': ['accessibility','P1','Tamazia associates labels with every input.'],
  'link-name': ['accessibility','P2','Tamazia gives every link an accessible name.'],
  'heading-order': ['accessibility','P2','Tamazia fixes the heading hierarchy.'],
  'html-has-lang': ['accessibility','P2','Tamazia sets the page language attribute.'],
  'deprecations': ['technical_seo','P2','Tamazia removes deprecated browser APIs.'],
  'errors-in-console': ['technical_seo','P2','Tamazia clears the JavaScript console errors.'],
};
function _escClip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length > n) s = s.slice(0, n) + '\u2026'; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function psiPointers(psi) {
  if (!psi || !Array.isArray(psi.audits)) return [];
  const out = [];
  for (const au of psi.audits) {
    const map = PSI_MAP[au.id] || ['technical_seo', 'P2', 'Tamazia resolves this as part of the technical SEO workstream.'];
    const [bucket, baseSev, fix] = map;
    const sev = au.score === 0 ? baseSev : (baseSev === 'P0' ? 'P1' : baseSev === 'P1' ? (au.score < 0.5 ? 'P1' : 'P2') : 'P2');
    const ev = au.displayValue ? au.displayValue : (au.items ? au.items + ' element(s) affected' : 'measured by Google PageSpeed (mobile)');
    const ptr = P(bucket, sev, au.title,
      au.title,
      (au.description || '') + ' Measured live by Google PageSpeed Insights on your mobile site.',
      fix,
      'Google PageSpeed (mobile) · ' + au.id + ' · ' + ev);
    // P2.10 element pinpointing: Lighthouse's own failing DOM node (real Chrome) -> exact element + CSS selector. No false positives.
    if (au.node_snippet) { ptr.evidence_html = _escClip(au.node_snippet, 220); ptr.element_count = au.node_count || 1; }
    if (au.node_selector) ptr.locator = _escClip(au.node_selector, 120);
    out.push(ptr);
  }
  return out;
}
// ---- GEO / AI search visibility bracket ----
function detectSchemaTypes(html) {
  const types = new Set();
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const walk = (o) => { if (!o) return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o === 'object') { if (o['@type']) (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).forEach(t => types.add(String(t))); if (o['@graph']) walk(o['@graph']); } };
      walk(JSON.parse(m[1].trim()));
    } catch (_e) {}
  }
  return types;
}
async function wikidataEntity(domain) {
  try {
    const dom = String(domain || '').replace(/^www\./, '').toLowerCase();
    const name = dom.split('.')[0];
    if (!name) return { checked: false, present: false };
    const su = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=' + encodeURIComponent(name);
    const sr = await timed((sig) => fetch(su, { headers: { 'user-agent': UA, 'accept': 'application/json' }, signal: sig }), 8000);
    if (!sr || !sr.ok) return { checked: false, present: false };
    const sd = await sr.json();
    const ids = (sd.search || []).map(x => x.id).filter(Boolean).slice(0, 7);
    if (!ids.length) return { checked: true, present: false };
    const gu = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=' + ids.join('|');
    const gr = await timed((sig) => fetch(gu, { headers: { 'user-agent': UA, 'accept': 'application/json' }, signal: sig }), 8000);
    if (!gr || !gr.ok) return { checked: false, present: false };
    const gd = await gr.json();
    const ents = gd.entities || {};
    for (const qid of ids) {
      const p856 = ents[qid] && ents[qid].claims && ents[qid].claims.P856;
      if (p856) for (const c of p856) { const url = String((((c.mainsnak || {}).datavalue || {}).value) || '').toLowerCase(); if (url.includes(dom)) return { checked: true, present: true, qid }; }
    }
    // also check Wikipedia (complementary knowledge-graph signal)
    let wiki = false;
    try {
      const wu = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&titles=' + encodeURIComponent(name.charAt(0).toUpperCase() + name.slice(1));
      const wr = await timed((sig) => fetch(wu, { headers: { 'user-agent': UA, 'accept': 'application/json' }, signal: sig }), 7000);
      if (wr && wr.ok) { const wd = await wr.json(); const pages = (wd.query && wd.query.pages) || {}; wiki = Object.values(pages).some(pg => pg && pg.pageprops && pg.pageprops.wikibase_item); }
    } catch (_e) {}
    return { checked: true, present: false, wikipedia: wiki };
  } catch (_e) { return { checked: false, present: false }; }
}
function geoPointers({ html, signals, sector, wikidata, domain }) {
  const out = []; const s = signals || {}; const b = html || '';
  const types = detectSchemaTypes(b);
  const has = (t) => types.has(t);
  const orgish = has('Organization') || has('LocalBusiness') || has('LegalService') || has('Corporation') || has('ProfessionalService') || has('MedicalBusiness') || has('Dentist');
  const local = /dental|clinic|salon|restaurant|cafe|law|solicit|estate|property|agency|shop|store|retail|garage|gym|spa|hotel|hospitality|medical|health|veterinar/i.test(sector || '') || has('LocalBusiness');
  if (!orgish) out.push(P('ai_visibility', 'P1', 'Organization schema', 'No Organization or LocalBusiness schema in your structured data.', 'AI engines (ChatGPT, Claude, Perplexity, Google AI) read Schema.org to know who you are. With no Organization entity they cannot reliably identify, trust or cite your firm when a buyer asks for a provider in your field.', 'Tamazia ships full Organization/LocalBusiness schema with name, logo, sameAs and contact points.', 'homepage JSON-LD · no Organization type detected'));
  if (local && !has('LocalBusiness') && !has('LegalService') && !has('Dentist') && !has('MedicalBusiness') && !has('ProfessionalService')) out.push(P('ai_visibility', 'P2', 'LocalBusiness schema', 'No LocalBusiness schema (address, opening hours, geo).', 'Local and map AI results depend on LocalBusiness schema with verified NAP and geo. Without it you are invisible to "near me" and local AI answers your competitors win.', 'Tamazia adds LocalBusiness schema with verified NAP, hours and geo-coordinates.', 'homepage JSON-LD · no LocalBusiness'));
  if (!has('Service') && !has('Offer') && !has('Product') && !has('OfferCatalog')) out.push(P('ai_visibility', 'P2', 'Service schema', 'No Service or Offer schema describing what you sell.', 'AI engines extract Service/Offer schema to answer "who offers X". Without it your services are not machine-readable and you are left out of those answers.', 'Tamazia marks up each service with Service schema and clear offers.', 'homepage JSON-LD · no Service/Offer'));
  if (!has('FAQPage') && !has('QAPage')) out.push(P('ai_visibility', 'P2', 'FAQ schema', 'No FAQPage schema or structured Q&A.', 'Answer engines preferentially quote structured Q&A. With no FAQPage you miss the single format LLMs cite most when answering buyer questions.', 'Tamazia builds an FAQ programme with FAQPage schema targeting real buyer questions.', 'homepage JSON-LD · no FAQPage'));
  if (!has('Review') && !has('AggregateRating')) out.push(P('ai_visibility', 'P2', 'Review schema', 'No Review or AggregateRating schema.', 'Star ratings shown in AI and search answers come from Review/AggregateRating schema. Without it your reputation is invisible to the engines buyers now ask first.', 'Tamazia adds compliant Review/AggregateRating schema (DMCC-safe, genuine reviews only).', 'homepage JSON-LD · no Review schema'));
  if (!has('BreadcrumbList')) out.push(P('ai_visibility', 'P2', 'Breadcrumb schema', 'No BreadcrumbList schema.', 'Breadcrumb schema helps search and AI understand your site structure and surface deep service pages, not just the homepage.', 'Tamazia adds BreadcrumbList schema sitewide.', 'homepage JSON-LD · no BreadcrumbList'));
  if (wikidata && wikidata.checked && !wikidata.present && !wikidata.wikipedia) out.push(P('ai_visibility', 'P1', 'Knowledge Graph presence', 'Your firm has no Wikidata entity and no Wikipedia article, so it is absent from the public knowledge graph.', 'ChatGPT, Google AI, Gemini and Perplexity lean on Wikidata and Wikipedia to decide who is a real, citable entity. With neither, you are structurally invisible to those answers, while competitors who have an entity get named.', 'Tamazia establishes your Wikidata and Knowledge-Graph entity (and a notability-backed Wikipedia presence where eligible) with sourced references.', 'Wikidata + Wikipedia · no entity found for ' + (domain || 'your domain')));
  if (!s.author && !has('Person') && !/rel=["\x27]?author|byline|written by|author/i.test(b)) out.push(P('ai_visibility', 'P2', 'E-E-A-T author signals', 'No bylined author or Person schema establishing expertise.', 'Google E-E-A-T and LLM trust models reward demonstrable Experience, Expertise, Authority and Trust. Anonymous content is discounted and rarely cited in AI answers.', 'Tamazia ships a bylined expert-author programme with Person schema, credentials and sameAs.', 'homepage · no author / Person markup'));
  return out;
}

// Spelling/grammar on the client's live site (LanguageTool en-GB, free). Hardened allowlist so legal/regulatory
// acronyms (GDPR, PECR, DIFC, ADGM, RERA, etc.), the brand, and proper nouns are NEVER flagged as typos
// (those were silent false positives). Returns only genuine misspellings. Fail-soft.
const _SPELL_ALLOW = new Set(['gdpr','ukgdpr','pecr','ico','sra','fca','cqc','ofcom','ofsted','dpa','dpia','ccpa','cpra','vcdpa','tdpsa','hipaa','ferpa','coppa','glba','finra','nydfs','sec','ftc','difc','adgm','dfsa','rera','dld','trakheesi','tdra','pdpl','pdppl','sdaia','mhra','asa','cap','cma','dmcc','eaa','dsa','dma','nis2','eidas','psd2','psd','aml','kyc','llp','ltd','plc','vat','seo','geo','ai','llm','llms','faq','url','cta','nap','ux','ui','b2b','b2c','saas','api','crm','roi','kpi','tamazia','lexquity']);
async function spellCheck(html){
  try {
    const text=String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0,1600);
    if(text.length<120) return [];
    const r=await timed((sig)=>fetch('https://api.languagetool.org/v2/check',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'language=en-GB&text='+encodeURIComponent(text),signal:sig}),12000);
    if(!r.ok) return [];
    const j=await r.json();
    const out=[]; const seen=new Set();
    for(const m of (j.matches||[])){
      const rid=(m.rule&&m.rule.id)||''; if(!/MORFOLOGIK|SPELL|TYPO/i.test(rid)) continue;       // spelling only
      const bad=(m.context.text||'').substr(m.context.offset, m.length).trim(); if(!bad) continue;
      const low=bad.toLowerCase();
      if(_SPELL_ALLOW.has(low)) continue;                        // known legal/brand term
      if(/^[A-Z0-9.&'-]{2,8}$/.test(bad)) continue;              // ALL-CAPS acronym / abbreviation
      if(/\d/.test(bad)) continue;                               // contains a digit
      if(/^[A-Z][a-z]+$/.test(bad) && m.context.offset>0) continue; // mid-sentence proper noun (name/place)
      if(low.length<4) continue;                                  // too short to be a confident typo
      const sug=(m.replacements&&m.replacements[0]&&m.replacements[0].value)||''; if(!sug||sug.toLowerCase()===low) continue;
      if(seen.has(low)) continue; seen.add(low);
      out.push({ bad, suggestion: sug });
      if(out.length>=8) break;
    }
    return out;
  } catch(_e){ return []; }
}
async function scanSite({ domain, sector, env }) {
  const { classifyRender } = require('./preflight.js');
  const clean = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  // P1.1 best-fetch: try apex + www, follow redirect stubs (apex->www, geo splash), keep the most real render.
  let page, preflight;
  {
    const rank = { OK: 5, TINY: 4, EMPTY_SPA: 3, SOFT_404: 2, LOGIN: 2, STAGING: 2, REDIRECT_STUB: 1, CHALLENGE: 1, UNREACHABLE: 0 };
    for (const u of ['https://' + clean, 'https://www.' + clean]) {
      let pg = await getHtml(u);
      let pre = classifyRender({ status: pg.status, body: pg.body, headers: pg.headers, finalUrl: pg.finalUrl || u, challenge: pg.challenge, domain: clean });
      if (pre.klass === 'REDIRECT_STUB' && pre.target) {
        let t = pre.target; if (t.startsWith('/')) t = 'https://' + clean + t; if (!/^https?:/i.test(t)) t = 'https://' + t;
        try { const pg2 = await getHtml(t); if ((pg2.body || '').length) { pg = pg2; pre = classifyRender({ status: pg2.status, body: pg2.body, headers: pg2.headers, finalUrl: pg2.finalUrl || t, challenge: pg2.challenge, domain: clean }); } } catch (_e) {}
      }
      if (!preflight || (rank[pre.klass] || 0) > (rank[preflight.klass] || 0)) { page = pg; preflight = pre; }
      if (preflight.klass === 'OK' || preflight.klass === 'TINY') break;
    }
  }
  let via_render = false, via_archive = false;
  if (preflight.action === 'render' || preflight.action === 'archive') {
    try {
      const rd = await getText('https://r.jina.ai/https://' + clean);
      const rwc = rd ? rd.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length : 0;
      if (rwc >= 120) {
        via_render = preflight.action === 'render'; via_archive = preflight.action === 'archive';
        page = Object.assign({}, page, { ok: true, rendered_text: rd });
        preflight = Object.assign({}, preflight, { klass: via_archive ? 'CHALLENGE_ARCHIVED' : 'SPA_RENDERED', recovered_words: rwc, reasons: preflight.reasons.concat('content recovered via reader render (' + rwc + ' words)') });
      }
    } catch (_e) { /* fail-open */ }
  }
  // Credibility guard: never fabricate HTML-derived findings for a dead site or an unrecovered wall.
  if (preflight.klass === 'UNREACHABLE' || (preflight.klass === 'CHALLENGE' && !via_archive) || !(page.body || '').length) {
    let mail = []; try { mail = await require('./extra-scanners.js').emailAuth(clean); } catch (_) {}
    const walled = preflight.klass === 'CHALLENGE';
    const fact = walled ? 'Your live site is behind a bot-challenge wall, so it could not be read live for on-page assessment.' : 'The website could not be loaded for audit.';
    const lay = walled ? 'A bot-protection wall (Cloudflare/Akamai-style) blocks automated reading of the live HTML. Compliance is still assessed from the public web archive; live on-page SEO signals could not be read.' : 'We could not reach the site to assess it, which may be a server, DNS, or blocking issue worth checking first. No on-page findings are asserted because the page did not load.';
    const pts = [P('website', 'P1', 'Site reachability', fact, lay, 'Tamazia confirms reachability then re-audits.', 'GET / · ' + (walled ? 'bot-challenge wall' : 'not reachable')), ...mail];
    return { scanned_at: new Date().toISOString(), final_url: page.finalUrl, reachable: false, render_class: preflight.klass, preflight, via_archive: walled, signals: {}, psi: null, pointers: pts, counts: { total: pts.length, p0: 0, p1: pts.filter(p => p.severity === 'P1').length, p2: pts.filter(p => p.severity !== 'P1').length } };
  }
  const sig = extractSignals(page);
  try { sig.ad_tech = require('./ad-tech.js').detectAdTech(page.body); } catch (_) { sig.ad_tech = { runs_ads: false, platforms: [] }; }
  try { sig.trackers = require('../compliance/tracker-detect.js').detectTrackers(page.body).trackers; } catch (_) { sig.trackers = []; }
  const key = (env && (env.PAGESPEED_API_KEY || env.PSI_KEY)) || process.env.PAGESPEED_API_KEY || null;
  const psi = await pageSpeed(clean, key);
  const [robots, sitemap, llms] = await Promise.all([
    exists('https://' + clean + '/robots.txt'),
    exists('https://' + clean + '/sitemap.xml'),
    exists('https://' + clean + '/llms.txt'),
  ]);
  let pointers = pointersFromSignals(sig, psi, sector || '');
  for (const pp of psiPointers(psi)) pointers.push(pp);
  // AI crawler access (GEO) from robots.txt body
  try { const robotsBody = await getText('https://' + clean + '/robots.txt'); for (const pp of aiCrawlerPointers(robotsBody)) pointers.push(pp); } catch (_e) {}
  // CrUX real-user field data (free, same key)
  try { const crux = await cruxField(clean, key); for (const pp of cruxPointers(crux)) pointers.push(pp); } catch (_e) {}
  let wikidata = { checked: false, present: false };
  try { wikidata = await wikidataEntity(clean); } catch (_e) {}
  for (const gp of geoPointers({ html: page.body, signals: sig, sector: sector || '', wikidata, domain: clean })) pointers.push(gp);
  // content depth (thin content = poor ranking + nothing for AI to cite)
  try {
    const vw = String(page.body || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    if (vw < 600) pointers.push(P('content_depth', vw < 300 ? 'P1' : 'P2', 'Thin page content', 'The homepage has only ' + vw + ' words of crawlable text; competitive ranking pages average 1,200+.', 'Thin content gives Google and AI engines little to rank or cite and signals low authority. Depth on the topic wins both the rankings and the AI citations.', 'Tamazia expands the homepage and key service pages with substantive, E-E-A-T-rich content targeting your buyer queries.', 'homepage - ' + vw + ' words of visible text'));
  } catch (_e) {}
  if (robots === false) pointers.push(P('technical_seo', 'P2', 'robots.txt', 'No robots.txt found.', 'Search and AI crawlers have no crawl directives, and you cannot point them at your sitemap, slowing how fast new pages get indexed.', 'Tamazia publishes a robots.txt that points crawlers at the sitemap.', 'GET /robots.txt · 404'));
  if (sitemap === false) pointers.push(P('technical_seo', 'P2', 'XML sitemap', 'No sitemap.xml found.', 'Without a sitemap, search engines discover pages slowly and may miss deep content entirely.', 'Tamazia generates and submits an XML sitemap.', 'GET /sitemap.xml · 404'));
  if (llms === false) pointers.push(P('ai_visibility', 'P2', 'llms.txt', 'No llms.txt file.', 'llms.txt is the emerging standard that tells AI assistants how to represent your firm. Publishing one puts you ahead of peers who have not.', 'Tamazia publishes a curated llms.txt.', 'GET /llms.txt · 404'));

  // Operating-markets: the countries this firm actually serves drive which compliance regimes apply
  // (a UK-registered firm serving the EU must meet EU GDPR). Computed once from the site, fail-open.
  let markets = { operating_countries: [], regions: [], serves_eu: false, eu_countries: [] };
  try { markets = require('../sourcing/markets.js').detectMarkets({ html: page.body, domain: clean }); } catch (_) {}

  // Phase B/C deep scanners (email-auth, tech, market-aware cookies, multi-jurisdiction, claims, links) — fail-open.
  try {
    const extra = require('./extra-scanners.js');
    const fetchFn = async (u) => { try { const r = await timed(sg => fetch(u, { method: 'GET', redirect: 'follow', headers: BH, signal: sg }), 9000); return { status: r.status }; } catch (_) { return { status: 0 }; } };
    const deep = await Promise.all([
      extra.emailAuth(clean).catch(() => []),
      Promise.resolve(extra.techStack(page.body, page.headers)),
      Promise.resolve(extra.cookieCompliance(page.body, markets)),
      Promise.resolve(extra.marketsCompliance(markets, page.body)),
      Promise.resolve(extra.regulatedClaims(page.body, sector || '')),
      extra.brokenLinks(clean, page.body, fetchFn).catch(() => []),
      extra.dnssec(clean).catch(() => []),
      extra.sitemapFreshness(clean, getText).catch(() => []),
    ]);
    for (const d of deep) pointers.push(...d);
  } catch (_) { /* fail-open: audit still mints with the base scan */ }

  // Spelling + grammar on the client's own live site (concrete, credibility-led)
  try {
    const typos = await spellCheck(page.body);
    if (typos.length) pointers.push(P('content_depth', typos.length >= 4 ? 'P1' : 'P2', 'Spelling & grammar errors on your live site', typos.length + ' likely spelling or grammar error(s) are published on your homepage right now.', 'Visible errors on a professional firm\'s website quietly erode trust with high-value clients and signal low quality to Google\'s helpful-content systems. For a firm selling expertise, typos on the live site are an avoidable credibility leak.', 'Tamazia proofreads and corrects every page, then sets an editorial QA gate so it does not recur.', 'homepage - ' + typos.map(t => '"' + t.bad + '" to "' + t.suggestion + '"').slice(0, 8).join(', ')));
  } catch (_e) {}

  // P1.1 suppression: drop findings we cannot trust for this render class (e.g. 'thin content' on a JS shell),
  // keeping transport/endpoint findings (headers, DNS, robots, sitemap, PSI, CrUX) which are render-independent.
  const _supClassOf = (p) => {
    const c = ((p.citation || '') + ' ' + (p.fact || '')).toLowerCase();
    if (/thin page content|thin content/.test(c)) return 'thin_content';
    if (/spelling|grammar/.test(c)) return 'content_absence';
    if (/\bh1\b|meta description|title tag|open graph|twitter card|schema|json-?ld/.test(c)) return 'html_structure';
    if (/sitemap freshness|no blog|few pages/.test(c)) return 'thin_sitemap';
    return null;
  };
  if (preflight && preflight.suppress) pointers = pointers.filter(p => { const k = _supClassOf(p); return !(k && preflight.suppress[k]); });
  if (['STAGING', 'SOFT_404', 'LOGIN'].includes(preflight.klass)) {
    const noteMap = { STAGING: 'This appears to be a staging or non-production URL, so it was assessed as-is and not as the live brand site.', SOFT_404: 'This URL returned a placeholder or not-found page, so on-page content findings were withheld.', LOGIN: 'This URL is behind a login or paywall, so only publicly visible signals were assessed.' };
    pointers.unshift(P('website', 'P2', 'Assessment scope', noteMap[preflight.klass], 'We flag this so every finding below is read in context and nothing is asserted that we could not fairly verify.', 'Tamazia re-audits the production URL on request.', 'preflight: ' + preflight.klass));
  }
  const p0 = pointers.filter(p => p.severity === 'P0').length;
  const p1 = pointers.filter(p => p.severity === 'P1').length;
  return {
    scanned_at: new Date().toISOString(),
    final_url: page.finalUrl,
    reachable: page.ok,
    render_class: preflight.klass,
    preflight,
    via_render, via_archive,
    lang: preflight.lang, is_english: preflight.is_english, brand: preflight.brand,
    signals: sig,
    psi: psi || null,
    markets,
    pointers,
    counts: { total: pointers.length, p0, p1, p2: pointers.length - p0 - p1 },
  };
}

module.exports = { scanSite, extractSignals, pointersFromSignals, psiPointers, pageSpeed, geoPointers, detectSchemaTypes, wikidataEntity };
