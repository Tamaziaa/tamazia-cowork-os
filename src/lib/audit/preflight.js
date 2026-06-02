'use strict';
// P1.1 Render-quality preflight. Pure + testable. Classifies a fetched page so the engine never
// asserts findings against a bot wall, a JS shell, a soft-404, a login gate, a staging URL, or a redirect stub.
const SPA_MARKERS = [/__NEXT_DATA__/, /id=["']__next["']/, /ng-version=/i, /data-reactroot/i, /window\.__NUXT__/, /data-server-rendered/i, /__remixContext/, /data-sveltekit/i];
const SOFT_404_RX = /\b(404|page not found|not found|page (?:doesn'?t|does not) exist|no longer (?:exists|available)|nothing here|content unavailable|error 404)\b/i;
const LOGIN_TITLE_RX = /\b(log ?in|sign ?in|members? area|password required|access (?:restricted|denied))\b/i;
const STAGING_HOST_RX = /(^|\.)(staging|stage|dev|develop|test|uat|preview|sandbox|demo)\./i;
const STAGING_PLATFORM_RX = /\.(vercel\.app|netlify\.app|pages\.dev|herokuapp\.com|web\.app|firebaseapp\.com|onrender\.com|github\.io|wixsite\.com|myshopify\.com)$/i;

function visibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
function wordCount(html) { const t = visibleText(html); return t ? t.split(' ').filter(Boolean).length : 0; }
function detectLang(html) { const m = String(html || '').match(/<html[^>]+lang=["']?([a-z]{2})/i); return m ? m[1].toLowerCase() : null; }
function ogSiteName(html) { const m = String(html || '').match(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i); return m ? m[1].trim() : null; }
function metaNoindex(html) { return /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(String(html || '')); }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch (_e) { return ''; } }
function redirectTarget(html) {
  const b = String(html || '');
  let m = b.match(/<meta[^>]+http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)/i); if (m) return m[1];
  m = b.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i); if (m) return m[1];
  m = b.match(/location\.replace\(\s*["']([^"']+)["']/i); if (m) return m[1];
  return null;
}

function _verdict(klass, action, info, reasons, suppress) {
  return {
    klass, action,
    visible_words: info.wc || 0,
    lang: info.lang || null,
    is_english: !info.lang || info.lang === 'en',
    brand: info.brand || null,
    spa: !!info.spa,
    target: info.target || null,
    reasons: reasons || [],
    suppress: suppress || {},
  };
}

function classifyRender({ status = 0, body = '', headers = {}, finalUrl = '', challenge = false, domain = '' } = {}) {
  const wc = wordCount(body);
  const lang = detectLang(body);
  const brand = ogSiteName(body);
  const info = { wc, lang, brand };
  const host = hostOf(finalUrl) || String(domain || '').toLowerCase().replace(/^www\./, '');
  const xrobots = String(headers['x-robots-tag'] || '');
  const titleM = String(body || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? titleM[1].trim() : '';
  const lc = String(body || '').toLowerCase();
  const spa = SPA_MARKERS.some(rx => rx.test(body));

  if (status === 0 && !body) return _verdict('UNREACHABLE', 'skip', info, ['no response'], { content_absence: true, thin_content: true, html_structure: true });
  if (challenge || ((status === 403 || status === 503) && wc < 50)) return _verdict('CHALLENGE', 'archive', info, ['bot-challenge wall'], { content_absence: true, thin_content: true, html_structure: true });
  // Redirect stub (apex -> www, geo splash, meta-refresh): follow it, never judge it.
  const rtarget = redirectTarget(body);
  if (wc < 30 && (rtarget || /redirecting/i.test(visibleText(body)))) return _verdict('REDIRECT_STUB', 'follow', { ...info, target: rtarget }, ['redirect stub'], {});
  if (STAGING_HOST_RX.test(host) || STAGING_PLATFORM_RX.test(host) || /noindex/i.test(xrobots) || (metaNoindex(body) && wc < 400)) return _verdict('STAGING', 'flag', info, ['non-production or noindex host'], { content_absence: true });
  const pwInputs = (lc.match(/<input[^>]+type=["']password["']/gi) || []).length;
  if ((/\/(login|signin|sign-in|account|auth)(\b|\/|\?)/i.test(finalUrl) && wc < 400) || (pwInputs >= 1 && wc < 250) || (LOGIN_TITLE_RX.test(title) && wc < 250)) return _verdict('LOGIN', 'flag', info, ['login/paywall gate'], { content_absence: true, thin_content: true });
  if (status >= 200 && status < 400 && (SOFT_404_RX.test(title) || (SOFT_404_RX.test(visibleText(body).slice(0, 200)) && wc < 120))) return _verdict('SOFT_404', 'flag', info, ['soft 404 / placeholder'], { content_absence: true, thin_content: true });
  if (wc < 50 && (spa || /<div[^>]+id=["'](root|app|__next)["'][^>]*>\s*<\/div>/i.test(body))) return _verdict('EMPTY_SPA', 'render', { ...info, spa: true }, ['JS-rendered shell, raw HTML empty'], { content_absence: true, thin_content: true, html_structure: true });
  if (wc >= 50 && wc < 250) return _verdict('TINY', 'audit', info, ['very small / one-page site'], { thin_sitemap: true });
  return _verdict('OK', 'audit', info, ['real content'], {});
}

module.exports = { classifyRender, wordCount, visibleText, detectLang, ogSiteName, redirectTarget };
