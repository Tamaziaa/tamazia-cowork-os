'use strict';
// SINGLE shared email-verification status mapping (A4c). Two vocabularies feed this:
//  - free-verify.js / stored verify_status: valid | risky | invalid | unknown (catch-all already folded
//    into 'risky' pre-storage), plus legacy booster rows: deliverable | ok | accept(ed)
//  - Apify michael.g/email-verifier-validator: good | risky | bad
// verified == deliverable & safe. Catch-all / risky / unknown are explicitly EXCLUDED.
// NOTE on 'accept': in THIS stack the canonical verifier maps accept_all -> 'risky' before storage
// (free-verify.js L121), so a bare stored 'accept' means SMTP-accepted (deliverable), NOT catch-all;
// the catch-all spellings (accept_all / accept-all / catch_all / catchall) are matched by RISKY_RE.
const VERIFIED_RE = /^(good|valid|deliverable|ok|accept(ed)?|role_valid)$/i;
const RISKY_RE    = /^(risky|bad|invalid|catch[\s_-]?all|unknown|accept[\s_-]?all)$/i;
const isVerifiedStatus = (s) => { s = String(s == null ? '' : s).trim(); return VERIFIED_RE.test(s) && !RISKY_RE.test(s); };
module.exports = { isVerifiedStatus, VERIFIED_RE, RISKY_RE };
