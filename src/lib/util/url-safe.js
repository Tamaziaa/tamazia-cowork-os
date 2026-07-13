'use strict';
// D-03 / D-05 - URL PREDICATES THAT CANNOT BE FOOLED BY A SUBSTRING.
//
// js/incomplete-url-scheme-check - the crawler skipped links with href.startsWith('javascript:'). That test is
// case-sensitive and whitespace-naive, so 'JavaScript:', ' javascript:' and 'java\\tscript:' all sail past it while
// browsers still execute them, and vbscript:/data: were never considered at all.
//
// js/incomplete-url-substring-sanitization - url.includes('linkedin.com') is TRUE for
// https://evil.example.com/linkedin.com/in/aman. Deciding what a URL IS by substring is always wrong. The only
// correct test is to parse it and compare the HOSTNAME.

const CTRL = /[\u0000-\u0020\u00a0\u2000-\u200b\ufeff]/g;   // whitespace, control and zero-width chars browsers ignore
const DANGEROUS = /^(javascript|vbscript|data|file|blob):/i;

/** True if the href is a scheme we must never follow or render. Tolerant of case, whitespace and control chars. */
function isDangerousScheme(href) {
  const flat = String(href == null ? '' : href).replace(CTRL, '');
  return DANGEROUS.test(flat);
}

/** True if the href is not a page we should crawl (anchor, mail, phone, or a dangerous scheme). */
function isNonCrawlable(href) {
  const h = String(href == null ? '' : href).trim();
  if (!h) return true;
  if (h.startsWith('#')) return true;
  if (/^(mailto|tel|sms|callto|fax):/i.test(h.replace(CTRL, ''))) return true;
  return isDangerousScheme(h);
}

/** Parse a URL and return its lowercase hostname (www-stripped), or '' if it is not a URL. */
function hostOf(u, base) {
  try { return new URL(String(u), base || undefined).hostname.toLowerCase().replace(/^www\./, ''); }
  catch (_e) { return ''; }
}

/**
 * True when the URL's HOST is domain or a subdomain of it. Never a substring test.
 *   isHost('https://evil.com/linkedin.com/in/x', 'linkedin.com')  -> false   (the old .includes() said TRUE)
 *   isHost('https://uk.linkedin.com/in/x',       'linkedin.com')  -> true
 */
function isHost(u, domain) {
  const h = hostOf(u);
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  if (!h || !d) return false;
  return h === d || h.endsWith('.' + d);
}

/** isHost AND the path starts with prefix (e.g. linkedin.com + '/in/'). */
function isHostPath(u, domain, prefix) {
  if (!isHost(u, domain)) return false;
  try { return new URL(String(u)).pathname.toLowerCase().startsWith(String(prefix).toLowerCase()); }
  catch (_e) { return false; }
}

module.exports = { isDangerousScheme, isNonCrawlable, hostOf, isHost, isHostPath };
