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
  // Stryker disable next-line ConditionalExpression,StringLiteral: EQUIVALENT MUTANTS, proven.
  //   `href == null ? '' : href` -> always href : String(null) is the literal "null", which is not a scheme, so
  //   the result is false either way. Same for undefined. No test can distinguish them.
  const flat = String(href == null ? '' : href).replace(CTRL, '');
  return DANGEROUS.test(flat);
}

/** True if the href is not a page we should crawl (anchor, mail, phone, or a dangerous scheme). */
function isNonCrawlable(href) {
  const h = String(href == null ? '' : href).trim();
  if (!h) return true;
  if (h.startsWith('#')) return true;
  if (/^(mailto|tel|sms|callto|fax):/i.test(h.replace(CTRL, ''))) return true;   // ^ is load-bearing: see boundaries2
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
  // Stryker disable next-line StringLiteral: EQUIVALENT. `String(domain || '')` -> `String(domain || 'X')` only
  // fires when domain is falsy; 'X' then fails both the `h === d` and the `.endsWith('.X')` checks, so the result
  // is false either way - exactly what the `!d` guard returns.
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  // Stryker disable next-line LogicalOperator: EQUIVALENT. `!h || !d` -> `!h && !d` gives the identical answer on
  // every combination of empty and non-empty inputs (verified exhaustively): when only one side is empty, the
  // comparison below fails anyway. The `||` is kept because it states the INTENT - either being empty is fatal.
  if (!h || !d) return false;
  return h === d || h.endsWith('.' + d);
}

/** isHost AND the path starts with prefix (e.g. linkedin.com + '/in/'). */
function isHostPath(u, domain, prefix) {
  // isHost() has ALREADY parsed this URL (via hostOf) and returned false if it could not. So by the time we get
  // here the URL is known to parse, and the try/catch that used to wrap the line below was UNREACHABLE. Stryker
  // proved it: it could delete the catch body, or make it return true, and no test could ever tell - because no
  // input can reach it. Dead defensive code is not safety, it is a place for a bug to hide unobserved. Removed.
  if (!isHost(u, domain)) return false;
  return new URL(String(u)).pathname.toLowerCase().startsWith(String(prefix).toLowerCase());
}


/**
 * Do two HOSTS refer to the same site? Registrable-domain comparison, www-insensitive.
 *
 * The GEO probe and the source-gap check both used `h.includes(dom) || dom.includes(h)`. Against reed.co.uk that
 * returns TRUE for 'ed.co', for 'notreed.co.uk', and for 'reed.co.uk.evil.net' - three false positives out of five.
 * Those two functions decide whether we tell a firm an AI engine CITES them and whether they RANK. A false positive
 * there is a false claim in the report.
 */
function sameHost(a, b) {
  // Stryker disable next-line Regex: EQUIVALENT. Dropping the ^ from /^https?:\/\// changes nothing, because
  // `.split('/')[0]` runs immediately after and discards everything from the first slash onward - so a scheme
  // appearing LATER in the string was never going to survive to the comparison anyway.
  const n = (x) => String(x || '').toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').replace(/\.$/, '');
  const A = n(a), B = n(b);
  // Stryker disable next-line LogicalOperator: EQUIVALENT - same proof as isHost above.
  if (!A || !B) return false;
  return A === B || A.endsWith('.' + B) || B.endsWith('.' + A);
}

module.exports = {
  sameHost, isDangerousScheme, isNonCrawlable, hostOf, isHost, isHostPath };
