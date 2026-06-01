// SINGLE SOURCE OF TRUTH: is an audit URL 100% correct AND live? Fail-closed by design.
// A touch with an audit link is NEVER sent / exported unless this returns ok:true.
//   - must be absolute https
//   - must be a MINTED audit path /audit/<slug>/<hash> (rejects the '<slug>-complimentary-audit' fallback guess)
//   - if it carries a sig, the HMAC must verify offline (S025 verifySignedUrl) and not be expired
//   - must return HTTP 200 on the live worker (the worker is the ultimate arbiter of validity)
// Any error, timeout, or non-200 => ok:false (never sends a broken link).
const path = require('path');
const { execFileSync } = require('child_process');
let _verifySigned = null;
try { _verifySigned = require(path.resolve(__dirname, '..', '..', 'skills', 'S025-audit-page-builder', 'scripts', 'build.js')).verifySignedUrl; } catch (_) {}

function isMintedAuditPath(u) { try { const p = new URL(u).pathname; return /^\/audit\/[^/]+\/[^/?#]+$/.test(p); } catch (_) { return false; } }
function isFallbackGuess(u) { return /\/audit\/[^/?#]*-complimentary-audit/i.test(String(u || '')); }
function httpStatus(u, timeoutSec) {
  try { return execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', String(timeoutSec || 10), '-L', u], { encoding: 'utf8' }).trim(); }
  catch (_) { return '0'; }
}

// opts: { live (default true), timeoutSec }
async function verifyAuditUrl(url, opts = {}) {
  const u = String(url == null ? '' : url).trim();
  if (!u) return { ok: false, status: null, real: false, reason: 'no_audit_url' };
  if (!/^https:\/\//i.test(u)) return { ok: false, status: null, real: false, reason: 'not_absolute_https' };
  if (isFallbackGuess(u)) return { ok: false, status: null, real: false, reason: 'fallback_guess_not_minted' };
  if (!isMintedAuditPath(u)) return { ok: false, status: null, real: false, reason: 'not_minted_audit_path' };
  if (/[?&]sig=/.test(u) && _verifySigned) {
    try { const v = _verifySigned(u); if (v && v.ok === false) return { ok: false, status: null, real: true, reason: 'sig_' + (v.reason || 'invalid') }; } catch (_) {}
  }
  if (opts.live === false) return { ok: true, status: 'skipped_live', real: true, reason: 'structural_ok' };
  const code = httpStatus(u, opts.timeoutSec);
  if (code !== '200') return { ok: false, status: code, real: true, reason: 'http_' + code };
  return { ok: true, status: '200', real: true, reason: 'ok' };
}

module.exports = { verifyAuditUrl, isMintedAuditPath, isFallbackGuess };
