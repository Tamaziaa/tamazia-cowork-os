// Security headers scanner · Phase 6.5
// Sources:
//   1. Mozilla HTTP Observatory API (no key, ~unlimited polite)
//   2. Raw response headers from home page (cross-check)
// Output: grade, score, missing-headers list, CSP audit, HSTS preload status.

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const SCANNER = 'security_headers';

const RECOMMENDED_HEADERS = {
  'strict-transport-security': { severity: 'P0', desc: 'HSTS prevents protocol downgrade attacks', fix: 'Set Strict-Transport-Security: max-age=31536000; includeSubDomains; preload' },
  'content-security-policy':  { severity: 'P0', desc: 'CSP blocks injected scripts and reduces XSS impact', fix: 'Publish a Content-Security-Policy header restricting sources (start with default-src \\u0027self\\u0027)' },
  'x-frame-options':          { severity: 'P1', desc: 'Prevents clickjacking when CSP frame-ancestors absent', fix: 'Set X-Frame-Options: DENY or use CSP frame-ancestors directive' },
  'x-content-type-options':   { severity: 'P1', desc: 'Stops MIME sniffing on script and style responses', fix: 'Set X-Content-Type-Options: nosniff' },
  'referrer-policy':          { severity: 'P1', desc: 'Limits referrer leaks to third parties', fix: 'Set Referrer-Policy: strict-origin-when-cross-origin' },
  'permissions-policy':       { severity: 'P2', desc: 'Disables unused powerful features (geolocation, camera, etc.)', fix: 'Set Permissions-Policy with the features you do not use' },
  'cross-origin-opener-policy': { severity: 'P2', desc: 'COOP enables crossOriginIsolated and protects against Spectre', fix: 'Set Cross-Origin-Opener-Policy: same-origin' }
};

async function scan({ domain, websiteFacts, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  const isPrivateHost = /^(127\.|10\.|192\.168\.|localhost)/.test(domain) || /^\d/.test(domain);
  let observatory = null;
  if (!isPrivateHost) observatory = await mozObservatory(domain);
  const headers = websiteFacts?.headers_subset || {};

  const issues = [];
  for (const h of Object.keys(RECOMMENDED_HEADERS)) {
    if (!headers[h]) {
      const r = RECOMMENDED_HEADERS[h];
      issues.push({ severity: r.severity, id: `missing_${h.replace(/-/g, '_')}`, evidence_url: `https://${domain}/`, fact: `Home page response is missing the ${h} header.`, recommendation: r.fix, citation_url: 'https://owasp.org/www-project-secure-headers/' });
    }
  }
  // CSP quality check
  if (headers['content-security-policy']) {
    const csp = headers['content-security-policy'];
    if (/unsafe-inline/.test(csp)) issues.push({ severity: 'P1', id: 'csp_unsafe_inline', evidence_url: `https://${domain}/`, fact: 'CSP allows unsafe-inline, which negates most XSS protection.', recommendation: 'Remove unsafe-inline and use nonces or hashes for inline scripts.', citation_url: 'https://content-security-policy.com/' });
    if (/unsafe-eval/.test(csp)) issues.push({ severity: 'P1', id: 'csp_unsafe_eval', evidence_url: `https://${domain}/`, fact: 'CSP allows unsafe-eval, opening the door to JS-from-string attacks.', recommendation: 'Remove unsafe-eval; refactor any libraries that rely on Function() or eval().', citation_url: 'https://content-security-policy.com/' });
  }
  // HSTS preload eligibility check
  let preload = null;
  if (!isPrivateHost) preload = await hstsPreload(domain);

  const payload = {
    domain, ok: true,
    observatory: observatory || { ok: false, reason: isPrivateHost ? 'private_host_skipped' : 'observatory_unavailable' },
    headers_received: headers,
    hsts_preload: preload,
    issues
  };
  writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}

async function mozObservatory(domain) {
  try {
    // Trigger an analysis
    const trig = await fetch(`https://http-observatory.security.mozilla.org/api/v1/analyze?host=${encodeURIComponent(domain)}`, { method: 'POST' });
    if (!trig.ok) return { ok: false, status: trig.status };
    // Poll for result (max 6 attempts, 1s between)
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 1200));
      const poll = await fetch(`https://http-observatory.security.mozilla.org/api/v1/analyze?host=${encodeURIComponent(domain)}`);
      if (!poll.ok) continue;
      const d = await poll.json();
      if (d.state === 'FINISHED' || d.state === 'CACHED' || d.state === 'COMPLETED') {
        return { ok: true, grade: d.grade, score: d.score, state: d.state, scan_id: d.scan_id, end_time: d.end_time, tests_passed: d.tests_passed, tests_failed: d.tests_failed, tests_quantity: d.tests_quantity };
      }
    }
    return { ok: false, reason: 'observatory_timed_out' };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

async function hstsPreload(domain) {
  try {
    const r = await fetchWithRetry(`https://hstspreload.org/api/v2/status?domain=${encodeURIComponent(domain)}`, { timeout: 7000 });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, ...JSON.parse(r.body) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  scan({ domain: dom, websiteFacts: { headers_subset: {} } }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scan };
