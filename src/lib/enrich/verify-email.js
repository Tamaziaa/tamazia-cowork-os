'use strict';
// Best-effort, cost-aware email verification. ORGANIC FIRST, Apify for authoritative validation.
// Chain: free MX/syntax/disposable (instant, £0) -> NeverBounce (free key, if present) -> Apify
// email-verifier (authoritative SMTP/MX, michael.g/email-verifier-validator) ONLY when allowApify=true
// AND APIFY_ENABLE AND under the monthly cap. Returns { verified, status, score, provider }.
// Designed so the EXPENSIVE Apify check is spent only on the small set of would-be-Tier-1 DM emails.
const { isVerifiedStatus } = require('./verify-status.js');
let _free = null; try { _free = require('./free-verify.js').verifyEmail; } catch (_e) {}

async function _getJSON(url, ms) {
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 12000); const r = await fetch(url, { signal: c.signal }); clearTimeout(t); if (!r.ok) return null; return await r.json(); } catch (_e) { return null; }
}

async function verifyEmailBest(email, env = process.env, opts = {}) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { verified: false, status: 'invalid_syntax', score: 0, provider: 'syntax' };

  // 1) ORGANIC: free 10-layer (syntax/MX/disposable, no SMTP). Cheap reject of clearly-bad addresses.
  let status = 'unknown', score = 0, provider = 'free', mxOk = true;
  if (_free) {
    try { const r = await _free(email, env || {}); status = r.status || 'unknown'; score = r.score || 0; mxOk = !(r.checks && r.checks.mx === false); if (isVerifiedStatus(status)) return { verified: true, status, score, provider: 'free-verify' }; }
    catch (_e) {}
  }
  // No MX / disposable -> definitively not deliverable; never spend a paid check on it.
  if (!mxOk || /disposable|no_mx|invalid_syntax|nxdomain/i.test(status)) return { verified: false, status, score, provider };

  // 2) NeverBounce (free key present) — catch-all/valid confidence without paid Apify.
  if (env && env.NEVERBOUNCE_KEY) {
    const d = await _getJSON(`https://api.neverbounce.com/v4/single/check?key=${env.NEVERBOUNCE_KEY}&email=${encodeURIComponent(email)}`, 12000);
    if (d && d.result) { const ok = ['valid', 'catchall'].includes(d.result); if (ok) return { verified: true, status: d.result, score: score || 75, provider: 'neverbounce' }; status = d.result; provider = 'neverbounce'; }
  }

  // 3) Apify authoritative email-verifier — ONLY when explicitly allowed (would-be-Tier-1 DM), cost-governed.
  const apifyOn = /^(1|true|yes|on)$/i.test((env && env.APIFY_ENABLE) || '');
  if (opts.allowApify && apifyOn) {
    try {
      const A = require('../apify/client.js');
      const res = await A.verifyEmails({ emails: [email], env });   // governed + 403-safe inside the client
      const hit = (res || [])[0];
      if (hit) { const ok = /^good$/i.test(hit.status || ''); return { verified: ok, status: hit.status || status, score: hit.score || score, provider: 'apify_verify' }; }
    } catch (_e) {}
  }
  return { verified: false, status, score, provider };
}

// Promotion gate: a lead is a TRUE Tier-1 candidate blocked ONLY by verification when it has serious gaps +
// a visibility gap + a decision-maker email that is plausible (MX ok) but not yet verified. Verifying those —
// and ONLY those — via Apify keeps paid spend on the few leads where a 'good' result flips them to auto-send.
function isVerifyWorthIt(scored, lead) {
  if (!scored) return false;
  const dm = lead.primary_email || lead.contact_email || '';
  return !!dm && /@/.test(dm) && !scored.dm_verified && scored.tier === 2 && scored.serious_gaps && scored.visibility_gap;
}

module.exports = { verifyEmailBest, isVerifyWorthIt };
