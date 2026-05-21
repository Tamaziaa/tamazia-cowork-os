// Commercial-grade email verification · £0. Matches the layer stack paid services (NeverBounce,
// MillionVerifier, ZeroBounce, Bouncer) use, with no per-verification cost.
//
// LAYER STACK (same as the paid tools):
//   L1 Syntax + normalisation (RFC-ish, lowercase, trim)
//   L2 Typo correction        (gmial.com -> gmail.com; surfaced as `suggestion`)
//   L3 Disposable detection   (known temp-mail domains -> invalid)
//   L4 Role detection         (info@/sales@ -> deliverable but lower confidence)
//   L5 Free/webmail flag      (gmail/outlook etc -> personal, noted)
//   L6 MX lookup + A fallback (domain can receive mail at all)
//   L7 SMTP handshake         (connect MX:25, HELO/MAIL FROM/RCPT TO, read code)
//   L8 Greylisting handling   (4xx -> retry once after backoff; not a fail)
//   L9 Catch-all detection    (probe a random address; accept-all -> risky not valid)
//   L10 Scoring model         -> {status: valid|risky|invalid|unknown, score 0-100, reason}
//
// Hunter (you already hold HUNTER_KEY) returns most of L6-L9 server-side with a clean reputation IP,
// so it is used as the PRIMARY signal when available (highest accuracy, free monthly quota). The DIY
// SMTP/catch-all/greylisting stack is the FALLBACK so the engine never blocks when Hunter quota runs
// out and never needs a paid credit. On a host that allows outbound :25 (the Oracle VM) the DIY SMTP
// layer reaches paid-tool accuracy; on hosts that block :25 (GitHub Actions) it degrades gracefully to
// Hunter + MX + heuristics (still better than no verification).

const dns = require('dns').promises;
const net = require('net');

const DISPOSABLE = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','10minutemail.com','tempmail.com','temp-mail.org',
  'throwaway.email','yopmail.com','getnada.com','trashmail.com','sharklasers.com','maildrop.cc','dispostable.com',
  'fakeinbox.com','mailnesia.com','mintemail.com','spam4.me','tempr.email','moakt.com','emailondeck.com','mohmal.com',
  'temp-mail.io','tempmailo.com','luxusmail.org','mailcatch.com','inboxbear.com','tmpmail.org','33mail.com','spambox.us',
  'mailpoof.com','emltmp.com','byom.de','harakirimail.com','dropmail.me','tmail.io','vomoto.com','spamgourmet.com'
]);
const ROLE = new Set([
  'info','admin','sales','support','contact','hello','help','office','team','enquiries','enquiry','marketing',
  'billing','accounts','account','hr','jobs','careers','press','media','no-reply','noreply','do-not-reply','webmaster',
  'postmaster','mail','newsletter','notifications','abuse','privacy','legal','finance','reception','bookings','booking'
]);
const FREE = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','hotmail.co.uk','outlook.com','live.com',
  'msn.com','aol.com','icloud.com','me.com','mac.com','protonmail.com','proton.me','gmx.com','gmx.net','zoho.com',
  'yandex.com','mail.com','ymail.com','rocketmail.com','tutanota.com','fastmail.com'
]);
// Common domain typos -> correct domain (typo correction layer)
const TYPOS = {
  'gmial.com':'gmail.com','gmai.com':'gmail.com','gmal.com':'gmail.com','gnail.com':'gmail.com','gmail.co':'gmail.com',
  'gmaill.com':'gmail.com','gmail.con':'gmail.com','gmailcom':'gmail.com','hotmial.com':'hotmail.com','hotmal.com':'hotmail.com',
  'hotmail.co':'hotmail.com','outlok.com':'outlook.com','outloo.com':'outlook.com','yaho.com':'yahoo.com','yahooo.com':'yahoo.com',
  'yahoo.co':'yahoo.com','iclod.com':'icloud.com','icloud.co':'icloud.com'
};
const SYNTAX = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function parts(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  return { email: e, local: at > 0 ? e.slice(0, at) : '', domain: at > 0 ? e.slice(at + 1) : '' };
}

async function mxHosts(domain) {
  try {
    const recs = await dns.resolveMx(domain);
    if (recs && recs.length) return recs.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
  } catch (_e) {}
  // A-record fallback: some domains accept mail without explicit MX (RFC 5321 §5.1).
  try { const a = await dns.resolve4(domain); if (a && a.length) return [domain]; } catch (_e) {}
  return [];
}

// One SMTP RCPT conversation. Returns {code, greylisted, ok} for the probed address, or null if blocked.
function smtpOnce(mxHost, addr, { from = 'verify@tamazia.in', helo = 'tamazia.in', timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    let sock, stage = 0, buf = '', finished = false;
    const fin = (r) => { if (finished) return; finished = true; try { sock.write('QUIT\r\n'); sock.end(); sock.destroy(); } catch (_e) {} resolve(r); };
    try { sock = net.createConnection(25, mxHost); } catch (_e) { return resolve(null); }
    const t = setTimeout(() => fin(null), timeout);
    sock.setEncoding('utf8');
    sock.on('error', () => { clearTimeout(t); fin(null); });
    sock.on('data', (d) => {
      buf += d; if (!/\r\n/.test(buf)) return;
      const line = buf.trim().split('\r\n').pop(); const code = Number(line.slice(0, 3)); buf = '';
      try {
        if (stage === 0) { if (code !== 220) return fin(null); sock.write(`EHLO ${helo}\r\n`); stage = 1; }
        else if (stage === 1) { sock.write(`MAIL FROM:<${from}>\r\n`); stage = 2; }
        else if (stage === 2) { if (code >= 400) return fin(null); sock.write(`RCPT TO:<${addr}>\r\n`); stage = 3; }
        else if (stage === 3) { clearTimeout(t); fin({ code, greylisted: code === 450 || code === 451 || code === 421, ok: code >= 250 && code < 260 }); }
      } catch (_e) { clearTimeout(t); fin(null); }
    });
  });
}

// Full SMTP layer: real-address probe + catch-all probe + greylisting retry.
async function smtpVerify(mxHost, email) {
  const domain = parts(email).domain;
  let real = await smtpOnce(mxHost, email);
  if (real && real.greylisted) { await new Promise(r => setTimeout(r, 3000)); real = await smtpOnce(mxHost, email); }
  if (!real) return null;
  // catch-all probe: a guaranteed-nonexistent address; if it's accepted, the domain accepts everything.
  const rand = `zz-nope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
  let ca = await smtpOnce(mxHost, rand);
  if (ca && ca.greylisted) { await new Promise(r => setTimeout(r, 3000)); ca = await smtpOnce(mxHost, rand); }
  const catchAll = !!(ca && ca.ok);
  return { realOk: real.ok, realCode: real.code, catchAll };
}

async function verifyViaHunter(email) {
  const key = process.env.HUNTER_KEY; if (!key) return null;
  try {
    const r = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${key}`);
    if (!r.ok) return null;
    const j = await r.json(); const d = j && j.data; if (!d) return null;
    return d; // status, score, smtp_check, accept_all, gibberish, disposable, webmail, block, mx_records
  } catch (_e) { return null; }
}

function scoreFromHunter(d, role) {
  // Use Hunter's full signal set, not just status.
  if (d.disposable) return { status: 'invalid', score: 0, reason: 'disposable' };
  if (d.gibberish) return { status: 'invalid', score: 5, reason: 'gibberish_local' };
  if (d.block) return { status: 'invalid', score: 5, reason: 'blocked' };
  if (d.status === 'invalid' || d.status === 'undeliverable') return { status: 'invalid', score: 5, reason: 'smtp_undeliverable' };
  let score = typeof d.score === 'number' ? d.score : 50;
  if (d.accept_all || d.status === 'accept_all') { score = Math.min(score, 60); return { status: 'risky', score, reason: 'catch_all_domain' }; }
  if (d.status === 'unknown') return { status: 'unknown', score: Math.max(45, Math.min(score, 60)), reason: 'smtp_unknown' };
  if (role && score > 60) score = 60;
  return { status: score >= 70 ? 'valid' : score >= 40 ? 'risky' : 'invalid', score, reason: d.smtp_check ? 'smtp_ok' : 'scored' };
}

/**
 * Verify one email, commercial-grade, £0.
 * @param {string} email
 * @param {{smtp?:boolean}} opts  smtp=true enables the DIY SMTP layer (use on hosts allowing :25)
 * @returns {Promise<{email,status,score,reason,source,role,webmail,catchAll,suggestion,checks}>}
 */
async function verifyEmail(email, opts = {}) {
  let { local, domain, email: e } = parts(email);
  const checks = { syntax: false, typo: false, disposable: false, role: false, webmail: false, mx: false, hunter: null, smtp: null };
  let suggestion = null;

  // L1 syntax
  if (!e || !SYNTAX.test(e) || !domain) return { email: e, status: 'invalid', score: 0, reason: 'bad_syntax', source: 'syntax', checks };
  checks.syntax = true;
  // L2 typo correction
  if (TYPOS[domain]) { suggestion = `${local}@${TYPOS[domain]}`; checks.typo = true; domain = TYPOS[domain]; e = suggestion; }
  // L3 disposable
  if (DISPOSABLE.has(domain)) { checks.disposable = true; return { email: e, status: 'invalid', score: 0, reason: 'disposable', source: 'disposable', suggestion, checks }; }
  // L4 role, L5 webmail
  checks.role = ROLE.has(local);
  checks.webmail = FREE.has(domain);
  // L6 MX
  const mx = await mxHosts(domain); checks.mx = mx.length > 0;
  if (!checks.mx) return { email: e, status: 'invalid', score: 8, reason: 'no_mx', source: 'mx', role: checks.role, webmail: checks.webmail, suggestion, checks };

  // PRIMARY: Hunter (server-side SMTP + catch-all + reputation IP)
  const h = await verifyViaHunter(e);
  if (h) {
    checks.hunter = h.status;
    const s = scoreFromHunter(h, checks.role);
    return { email: e, ...s, source: 'hunter', role: checks.role, webmail: checks.webmail, catchAll: !!(h.accept_all), suggestion, checks };
  }

  // FALLBACK: DIY SMTP layer (L7-L9) when Hunter unavailable and :25 allowed
  if (opts.smtp) {
    const sv = await smtpVerify(mx[0], e);
    if (sv) {
      checks.smtp = sv;
      if (sv.catchAll) return { email: e, status: 'risky', score: 55, reason: 'catch_all_domain', source: 'smtp', role: checks.role, webmail: checks.webmail, catchAll: true, suggestion, checks };
      if (sv.realOk) { const sc = checks.role ? 60 : 82; return { email: e, status: checks.role ? 'risky' : 'valid', score: sc, reason: 'smtp_rcpt_ok', source: 'smtp', role: checks.role, webmail: checks.webmail, catchAll: false, suggestion, checks }; }
      if (sv.realCode >= 500) return { email: e, status: 'invalid', score: 8, reason: 'smtp_rcpt_rejected', source: 'smtp', role: checks.role, webmail: checks.webmail, suggestion, checks };
    }
  }
  // Domain receives mail; address not provably good/bad (free webmail like gmail can't be SMTP-probed reliably).
  const base = checks.webmail ? 60 : 55;
  return { email: e, status: 'unknown', score: checks.role ? 45 : base, reason: 'mx_only', source: 'mx', role: checks.role, webmail: checks.webmail, suggestion, checks };
}

// Auto-send gate: accept valid + risky (deliverable), reject invalid. 'unknown' is caller's choice.
function deliverable(result, { allowUnknown = false } = {}) {
  if (!result) return false;
  if (result.status === 'valid' || result.status === 'risky') return true;
  return allowUnknown && result.status === 'unknown';
}

module.exports = { verifyEmail, deliverable, mxHosts, smtpVerify };

if (require.main === module) {
  (async () => {
    const list = process.argv.slice(2);
    const tests = list.length ? list : ['alice.w@dishoom.com', 'info@dishoom.com', 'someone@gmial.com', 'x@mailinator.com', 'nope@thisdomaindoesnotexist123zzz.com', 'ceo@gmail.com'];
    for (const em of tests) {
      const r = await verifyEmail(em, { smtp: process.env.SMTP_PROBE === '1' });
      console.log(`${em.padEnd(42)} ${r.status.padEnd(8)} score=${String(r.score).padEnd(3)} ${r.reason.padEnd(20)} via=${r.source}${r.role ? ' [role]' : ''}${r.webmail ? ' [webmail]' : ''}${r.suggestion ? ' ->' + r.suggestion : ''}`);
    }
  })();
}
