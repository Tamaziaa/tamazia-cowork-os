// ============================================================================
// MAILBOX POOL · the MailDeck cold-sending fleet (sits under relay-router.js)
// ----------------------------------------------------------------------------
// PURPOSE
//   The §4 relay-router rotates across transactional PROVIDERS (Brevo, Mailjet,
//   SMTP2Go ...). This module rotates across individual MAILBOXES — the 30
//   MailDeck Google-Workspace inboxes on the throwaway lookalike domains. Cold
//   1:1 outreach goes ONLY through these mailboxes; the real brand domains
//   (tamazia.co.uk / tamazia.in) are never the cold cannon (PROJECT-MEMORY §14.4).
//
// WHAT IT DOES (plain language)
//   1. Loads the 30 mailbox credentials from a gitignored file or a base64 env
//      var (so the host needs no file). Passwords never touch the DB or git.
//   2. Computes each mailbox's per-day COLD cap from its age, following the
//      warmup -> cold ramp (PROJECT-MEMORY §14.6): wk1 0, wk2 3, wk3 8, wk4 13,
//      wk5 17, wk6+ 20. A mailbox younger than 7 days sends ZERO cold (warmup only).
//   3. Picks the next mailbox round-robin (least-recently-used) among mailboxes
//      that are active, under cap, and not in error-backoff.
//   4. Enforces SHARED suppression + dedup across the whole fleet: a prospect is
//      only ever cold-contacted by ONE mailbox (no double-touch). Follow-up
//      touches reuse that same mailbox so the thread stays consistent.
//   5. Sends over real SMTP with ZERO npm dependencies (raw SMTP over Node's
//      built-in tls/net), because the engine is dependency-free by design and
//      the GitHub Actions host has no `npm install` step.
//
// SELF-HEALING / SELF-RENEWING
//   - A mailbox that errors repeatedly is auto-paused with backoff and skipped;
//     the fleet routes around it. It re-arms automatically after the backoff.
//   - Caps are derived from age every run, so the ramp advances itself with no
//     manual edits — the fleet "renews" its own send limits week over week.
//
// STATE TABLES (created by migrations/2026-05-23-mailbox-pool.sql)
//   mailbox_pool         one row per mailbox: identity + warmup_started_at + health
//   mailbox_daily_usage  (address, day, sent) per-mailbox daily counter
//   cold_recipient_log   (recipient) -> the mailbox that owns that thread (dedup)
//
// CREDS ARE NOT IN HERE YET — load with: node scripts/load-maildeck-creds.js <csv>
// Until then this module reports an empty fleet and the 'maildeck' provider in
// relay-router returns { ok:false, error:'no_mailboxes_loaded' }, so nothing sends.
// ============================================================================

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_DIR = path.join(ROOT, 'config');

// Real brand domains — NEVER allowed as a cold from-address. Hard line (§14.4).
const REAL_DOMAINS = ['tamazia.co.uk', 'tamazia.in'];

// Per-inbox cold ceiling regardless of ramp (MailDeck Growth safe ceiling, §14.1).
const COLD_CEILING_PER_INBOX = Number(process.env.MAILDECK_COLD_CEILING || 20);

// Warmup -> cold ramp by AGE IN DAYS since warmup start (PROJECT-MEMORY §14.6).
// Each entry: cold/day allowed once age >= maxAgeDaysExclusive boundary.
// days 0-6 -> 0 ; 7-13 -> 3 ; 14-20 -> 8 ; 21-27 -> 13 ; 28-34 -> 17 ; 35+ -> 20
const DEFAULT_RAMP = [
  { fromDay: 0, cap: 0 },    // week 1 — pure warmup, no cold
  { fromDay: 7, cap: 3 },    // week 2
  { fromDay: 14, cap: 8 },   // week 3
  { fromDay: 21, cap: 13 },  // week 4
  { fromDay: 28, cap: 17 },  // week 5
  { fromDay: 35, cap: 20 },  // week 6+
];
function loadRamp() {
  if (process.env.MAILDECK_RAMP) {
    try { const r = JSON.parse(process.env.MAILDECK_RAMP); if (Array.isArray(r) && r.length) return r; } catch (_e) {}
  }
  return DEFAULT_RAMP;
}

// Error-backoff: pause a mailbox after this many consecutive send errors, for this long.
const ERROR_PAUSE_THRESHOLD = Number(process.env.MAILDECK_ERR_THRESHOLD || 3);
const ERROR_BACKOFF_MIN = Number(process.env.MAILDECK_ERR_BACKOFF_MIN || 60);

// ---- DB helpers (same pattern as the rest of the engine) -------------------
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (_e) { return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }
function domainOf(addr) { return String(addr || '').split('@')[1] || ''; }
function isRealDomain(addr) { return REAL_DOMAINS.includes(domainOf(addr).toLowerCase()); }

// ============================================================================
// PURE LOGIC (no DB / no network — independently unit-testable)
// ============================================================================

/** Days between an ISO date and now (floored, never negative). */
function ageInDays(isoDate, now = Date.now()) {
  if (!isoDate) return 0;
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/** Cold/day cap for a mailbox of a given age (days), per the ramp. */
function rampCapForAge(days, ramp = loadRamp()) {
  let cap = 0;
  for (const step of ramp) { if (days >= step.fromDay) cap = step.cap; }
  return Math.min(cap, COLD_CEILING_PER_INBOX);
}

/**
 * Choose the next mailbox: least-recently-used among eligible mailboxes.
 * Pure: caller injects the candidate list (already enriched with cap+usage+state).
 * @param {Array} mailboxes [{ address, domain, cap, used, lastUsedAt(ms|0), paused(bool), inBackoff(bool) }]
 * @returns chosen mailbox object or null
 */
function chooseMailbox(mailboxes) {
  const eligible = mailboxes.filter(m =>
    !m.paused && !m.inBackoff && !REAL_DOMAINS.includes((m.domain || '').toLowerCase()) &&
    Number(m.cap) > 0 && Number(m.used) < Number(m.cap)
  );
  if (!eligible.length) return null;
  // LRU: oldest lastUsedAt first (0/never = most stale = picked first) -> even round-robin.
  eligible.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
  return eligible[0];
}

/** RFC-2047 encode a header value only if it contains non-ASCII (keeps subjects clean). */
function encodeHeaderWord(s) {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

/** Dot-stuff a message body for SMTP DATA (lines starting with '.' get an extra '.'). */
function dotStuff(body) {
  return body.replace(/\r?\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..');
}

/**
 * Build a multipart/alternative MIME message (text + html) with deliverability headers.
 * Returns the full RFC-822 message string (headers + CRLF CRLF + body), NOT dot-stuffed.
 */
function buildMime({ from, fromName, to, subject, text, html, messageId, listUnsub, listUnsubOneClick, replyTo, extraHeaders }) {
  const boundary = 'tz_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const date = new Date().toUTCString().replace(/GMT$/, '+0000');
  const fromHeader = fromName ? `${encodeHeaderWord(fromName)} <${from}>` : from;
  const H = [];
  H.push(`From: ${fromHeader}`);
  H.push(`To: ${to}`);
  if (replyTo) H.push(`Reply-To: ${replyTo}`);
  H.push(`Subject: ${encodeHeaderWord(subject || '')}`);
  H.push(`Date: ${date}`);
  if (messageId) H.push(`Message-ID: ${messageId.startsWith('<') ? messageId : '<' + messageId + '>'}`);
  H.push('MIME-Version: 1.0');
  if (listUnsub) H.push(`List-Unsubscribe: ${listUnsub}`);
  if (listUnsubOneClick) H.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  for (const [k, v] of Object.entries(extraHeaders || {})) H.push(`${k}: ${v}`);
  let body;
  if (html) {
    H.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body =
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${text || ''}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${html}\r\n` +
      `--${boundary}--\r\n`;
  } else {
    H.push('Content-Type: text/plain; charset=UTF-8');
    H.push('Content-Transfer-Encoding: 8bit');
    body = (text || '') + '\r\n';
  }
  return H.join('\r\n') + '\r\n\r\n' + body;
}

/** Parse one (possibly multiline) SMTP reply from the head of a buffer. */
function matchSmtpReply(buf) {
  const m = buf.match(/^(?:\d{3}-[^\r\n]*\r\n)*(\d{3}) [^\r\n]*\r\n/);
  if (!m) return null;
  return { code: Number(m[1]), text: m[0], consumed: m[0].length };
}

// ============================================================================
// RAW SMTP CLIENT (zero dependencies — built-in net/tls)
// ============================================================================
/**
 * Deliver one message over SMTP. Supports implicit TLS (465) and STARTTLS (587/25).
 * @returns {Promise<{ok, code, error, transcript}>}
 */
function smtpDeliver({ host, port, secure, user, pass, mailFrom, rcptTo, message, ehloName = 'tamazia.co.uk', timeoutMs = 25000, tlsRejectUnauthorized = true }) {
  return new Promise((resolve) => {
    port = Number(port);
    const implicitTls = secure != null ? !!secure : port === 465;
    let socket = null;
    let reader = null;
    let done = false;
    const transcript = [];

    const timer = setTimeout(() => fin(false, { error: 'timeout' }), timeoutMs);
    function fin(ok, info) {
      if (done) return; done = true; clearTimeout(timer);
      try { if (socket) socket.destroy(); } catch (_e) {}
      resolve({ ok, transcript, ...info });
    }
    function attach(s) {
      let buf = '';
      const waiters = [];
      const onData = d => { buf += d.toString('utf8'); pump(); };
      function pump() {
        while (waiters.length) {
          const r = matchSmtpReply(buf);
          if (!r) break;
          buf = buf.slice(r.consumed);
          transcript.push('S: ' + r.text.trim());
          waiters.shift()(r);
        }
      }
      s.on('data', onData);
      s.on('error', e => fin(false, { error: 'socket_error:' + e.message }));
      s.on('close', () => { if (!done) fin(false, { error: 'connection_closed' }); });
      reader = {
        read: () => new Promise(res => { waiters.push(res); pump(); }),
        write: line => { transcript.push('C: ' + line.replace(/\r\n$/, '')); s.write(line); },
        raw: s,
      };
    }
    async function converse() {
      try {
        let r = await reader.read();                                  // greeting
        if (r.code !== 220) return fin(false, { code: r.code, error: 'bad_greeting' });
        reader.write(`EHLO ${ehloName}\r\n`); r = await reader.read();
        if (r.code !== 250) return fin(false, { code: r.code, error: 'ehlo_failed' });

        if (!implicitTls) {                                           // STARTTLS upgrade
          reader.write('STARTTLS\r\n'); r = await reader.read();
          if (r.code !== 220) return fin(false, { code: r.code, error: 'starttls_refused' });
          const upgraded = await new Promise((res, rej) => {
            const t = tls.connect({ socket, servername: host, rejectUnauthorized: tlsRejectUnauthorized }, () => res(t));
            t.on('error', rej);
          }).catch(e => { fin(false, { error: 'tls_upgrade_failed:' + e.message }); return null; });
          if (!upgraded) return;
          socket = upgraded; attach(socket);
          reader.write(`EHLO ${ehloName}\r\n`); r = await reader.read();
          if (r.code !== 250) return fin(false, { code: r.code, error: 'ehlo2_failed' });
        }

        reader.write('AUTH LOGIN\r\n'); r = await reader.read();
        if (r.code !== 334) return fin(false, { code: r.code, error: 'auth_unsupported' });
        reader.write(Buffer.from(user, 'utf8').toString('base64') + '\r\n'); r = await reader.read();
        if (r.code !== 334) return fin(false, { code: r.code, error: 'auth_user_rejected' });
        reader.write(Buffer.from(pass, 'utf8').toString('base64') + '\r\n'); r = await reader.read();
        if (r.code !== 235) return fin(false, { code: r.code, error: 'auth_failed' });

        reader.write(`MAIL FROM:<${mailFrom}>\r\n`); r = await reader.read();
        if (r.code !== 250) return fin(false, { code: r.code, error: 'mail_from_rejected' });
        reader.write(`RCPT TO:<${rcptTo}>\r\n`); r = await reader.read();
        if (r.code !== 250 && r.code !== 251) return fin(false, { code: r.code, error: 'rcpt_rejected' });
        reader.write('DATA\r\n'); r = await reader.read();
        if (r.code !== 354) return fin(false, { code: r.code, error: 'data_refused' });
        reader.raw.write(dotStuff(message) + '\r\n.\r\n');
        transcript.push('C: <message body> .');
        r = await reader.read();
        if (r.code !== 250) return fin(false, { code: r.code, error: 'message_rejected' });
        const accepted = r.text.trim();
        reader.write('QUIT\r\n'); reader.read().catch(() => {});
        return fin(true, { code: 250, accepted });
      } catch (e) { return fin(false, { error: 'converse_exception:' + (e && e.message) }); }
    }

    try {
      socket = implicitTls
        ? tls.connect({ host, port, servername: host, rejectUnauthorized: tlsRejectUnauthorized }, () => { attach(socket); converse(); })
        : net.connect({ host, port }, () => { attach(socket); converse(); });
      socket.on('error', e => fin(false, { error: 'connect_error:' + e.message }));
    } catch (e) { fin(false, { error: 'connect_exception:' + (e && e.message) }); }
  });
}

// ============================================================================
// CREDENTIAL LOADING (gitignored file or base64 env — passwords never in DB/git)
// ============================================================================
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    // simple CSV (no embedded commas in creds) — MailDeck export is plain
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

/** Normalise a raw cred row (tolerant of MailDeck's column naming) into our shape. */
function normaliseMailbox(row) {
  const g = (...keys) => { for (const k of keys) { if (row[k] != null && row[k] !== '') return row[k]; } return ''; };
  const address = g('address', 'email', 'username', 'login', 'smtp_username', 'smtp_user', 'user').toLowerCase();
  if (!address || !address.includes('@')) return null;
  return {
    address,
    domain: domainOf(address).toLowerCase(),
    persona_name: g('persona_name', 'name', 'display_name', 'full_name'),
    first_name: g('first_name'),
    smtp_host: g('smtp_host', 'smtp_server', 'host', 'outgoing_server') || 'smtp.gmail.com',
    smtp_port: Number(g('smtp_port', 'port', 'outgoing_port') || 587),
    smtp_user: g('smtp_user', 'smtp_username', 'username', 'login') || address,
    smtp_pass: g('smtp_pass', 'smtp_password', 'password', 'app_password', 'pass'),
    imap_host: g('imap_host', 'imap_server', 'incoming_server') || 'imap.gmail.com',
    imap_port: Number(g('imap_port', 'incoming_port') || 993),
    imap_user: g('imap_user', 'imap_username') || address,
    imap_pass: g('imap_pass', 'imap_password', 'password', 'app_password') ,
    added_at: g('added_at', 'warmup_started_at', 'created_at', 'start_date') || null,
  };
}

let _credCache = null;
function loadCredsRaw() {
  if (_credCache) return _credCache;
  let rows = [];
  // 1) base64 env (host-friendly, no file needed)
  if (process.env.MAILDECK_MAILBOXES_B64) {
    try { rows = JSON.parse(Buffer.from(process.env.MAILDECK_MAILBOXES_B64, 'base64').toString('utf8')); } catch (_e) {}
  }
  // 2) JSON file
  if (!rows.length) {
    const jf = path.join(CONFIG_DIR, 'maildeck-mailboxes.json');
    if (fs.existsSync(jf)) { try { rows = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (_e) {} }
  }
  // 3) CSV file (raw MailDeck export)
  if (!rows.length) {
    const cf = path.join(CONFIG_DIR, 'maildeck-mailboxes.csv');
    if (fs.existsSync(cf)) { try { rows = parseCsv(fs.readFileSync(cf, 'utf8')); } catch (_e) {} }
  }
  const out = rows.map(normaliseMailbox).filter(Boolean).filter(m => !isRealDomain(m.address));
  _credCache = out;
  return out;
}

// ============================================================================
// DB-BACKED STATE (usage, last-used, health, dedup) — runs on the host
// ============================================================================
function usageToday(address) {
  const r = pg(`SELECT COALESCE(sent,0) FROM mailbox_daily_usage WHERE address=${esc(address)} AND day=CURRENT_DATE`);
  return r ? Number(r) : 0;
}
function bumpUsage(address) {
  pg(`INSERT INTO mailbox_daily_usage (address, day, sent) VALUES (${esc(address)}, CURRENT_DATE, 1)
      ON CONFLICT (address, day) DO UPDATE SET sent = mailbox_daily_usage.sent + 1`);
}
/** Pull per-mailbox runtime state (warmup_started_at, last_used_at, paused, errors). */
function poolState() {
  const raw = pg(`SELECT address, COALESCE(warmup_started_at::text,''), COALESCE(EXTRACT(EPOCH FROM last_used_at)::bigint,0),
                  COALESCE(status,'active'), COALESCE(consecutive_errors,0), COALESCE(EXTRACT(EPOCH FROM paused_until)::bigint,0)
                  FROM mailbox_pool`);
  const map = {};
  if (raw) for (const line of raw.split('\n').filter(Boolean)) {
    const [address, warm, last, status, errs, pausedUntil] = line.split('\t');
    map[address] = { warmup_started_at: warm || null, lastUsedAt: Number(last) * 1000 || 0, status, consecutive_errors: Number(errs), pausedUntil: Number(pausedUntil) * 1000 || 0 };
  }
  return map;
}
function markUsed(address) { pg(`UPDATE mailbox_pool SET last_used_at=NOW(), consecutive_errors=0 WHERE address=${esc(address)}`); }
function markError(address) {
  pg(`UPDATE mailbox_pool SET consecutive_errors = COALESCE(consecutive_errors,0)+1,
      paused_until = CASE WHEN COALESCE(consecutive_errors,0)+1 >= ${ERROR_PAUSE_THRESHOLD}
                         THEN NOW() + INTERVAL '${ERROR_BACKOFF_MIN} minutes' ELSE paused_until END
      WHERE address=${esc(address)}`);
}
// Shared dedup: which mailbox owns a recipient's thread (so follow-ups reuse it,
// and no two mailboxes cold-touch the same prospect).
function ownerMailbox(recipient) {
  const r = pg(`SELECT mailbox_address FROM cold_recipient_log WHERE recipient=${esc(String(recipient).toLowerCase())} LIMIT 1`);
  return r || null;
}
function claimRecipient(recipient, address, messageId) {
  pg(`INSERT INTO cold_recipient_log (recipient, mailbox_address, message_id, sent_at)
      VALUES (${esc(String(recipient).toLowerCase())}, ${esc(address)}, ${esc(messageId)}, NOW())
      ON CONFLICT (recipient) DO NOTHING`);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Full fleet snapshot (caps from age, usage today, eligibility) — for picking + health. */
function fleetSnapshot() {
  const creds = loadCredsRaw();
  const state = poolState();
  const now = Date.now();
  return creds.map(m => {
    const st = state[m.address] || {};
    const warmStart = st.warmup_started_at || m.added_at || null;
    const age = ageInDays(warmStart, now);
    const cap = rampCapForAge(age);
    const used = usageToday(m.address);
    const paused = (st.status && st.status !== 'active');
    const inBackoff = st.pausedUntil ? st.pausedUntil > now : false;
    return {
      address: m.address, domain: m.domain, persona_name: m.persona_name, first_name: m.first_name,
      age_days: age, cap, used, remaining: Math.max(0, cap - used),
      lastUsedAt: st.lastUsedAt || 0, paused, inBackoff,
      consecutive_errors: st.consecutive_errors || 0,
    };
  });
}

/** Sum of remaining cold capacity across the eligible fleet right now. */
function fleetRemainingToday() {
  return fleetSnapshot().reduce((s, m) => s + (!m.paused && !m.inBackoff && !REAL_DOMAINS.includes(m.domain) ? m.remaining : 0), 0);
}

/**
 * Pick the mailbox to send a given recipient's NEXT touch from.
 *  - Follow-up touches REUSE the mailbox that owns the thread (consistency).
 *  - First touches pick a fresh LRU mailbox with capacity, and claim the recipient.
 * @returns { mailbox(creds), reused(bool) } | { error }
 */
function pickForRecipient(recipient) {
  const creds = loadCredsRaw();
  if (!creds.length) return { error: 'no_mailboxes_loaded' };
  const owner = ownerMailbox(recipient);
  if (owner) {
    const mb = creds.find(c => c.address === owner);
    if (mb && !isRealDomain(mb.address)) return { mailbox: mb, reused: true };
    // owner missing/decommissioned -> fall through to pick a new one (thread will re-anchor)
  }
  const snap = fleetSnapshot();
  const chosen = chooseMailbox(snap);
  if (!chosen) return { error: 'no_mailbox_capacity' };
  const mb = creds.find(c => c.address === chosen.address);
  if (!mb) return { error: 'cred_missing_for_' + chosen.address };
  return { mailbox: mb, reused: false };
}

/**
 * Send a cold email through the pool (pick mailbox -> SMTP -> record usage+dedup).
 * The from-address is ALWAYS a lookalike mailbox; real domains are hard-rejected.
 * @param {object} opts { to, from_name, subject, text, html, messageId, listUnsub, replyTo }
 * @returns { ok, from_used, mailbox, message_id, id, error }
 */
async function sendCold(opts) {
  const pick = pickForRecipient(opts.to);
  if (pick.error) return { ok: false, error: pick.error };
  const mb = pick.mailbox;
  if (isRealDomain(mb.address)) return { ok: false, error: 'refused_real_domain_cold:' + mb.address };
  if (!mb.smtp_pass) return { ok: false, error: 'mailbox_missing_password:' + mb.address };

  const messageId = opts.messageId && opts.messageId.includes('@')
    ? opts.messageId
    : `<tz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@${mb.domain}>`;
  const fromName = opts.from_name || mb.persona_name || mb.first_name || '';
  // Replies must land in the unified Gmail via the lookalike catch-all -> Reply-To = the mailbox itself.
  const replyTo = opts.replyTo || mb.address;
  const listUnsub = opts.listUnsub || `<mailto:${mb.address}?subject=unsubscribe>`;
  const message = buildMime({
    from: mb.address, fromName, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html,
    messageId, replyTo, listUnsub, listUnsubOneClick: false, extraHeaders: opts.extraHeaders,
  });

  const res = await smtpDeliver({
    host: mb.smtp_host, port: mb.smtp_port, user: mb.smtp_user, pass: mb.smtp_pass,
    mailFrom: mb.address, rcptTo: opts.to, message, ehloName: mb.domain,
  });

  if (res.ok) {
    bumpUsage(mb.address); markUsed(mb.address); claimRecipient(opts.to, mb.address, messageId.replace(/[<>]/g, ''));
    return { ok: true, from_used: mb.address, mailbox: mb.address, domain: mb.domain, message_id: messageId, id: res.accepted || null, reused: pick.reused };
  }
  markError(mb.address);
  return { ok: false, error: res.error || 'smtp_failed', code: res.code, from_used: mb.address, mailbox: mb.address };
}

module.exports = {
  // public
  sendCold, pickForRecipient, fleetSnapshot, fleetRemainingToday, loadCredsRaw,
  // pure (exported for tests + loader)
  rampCapForAge, ageInDays, chooseMailbox, buildMime, dotStuff, matchSmtpReply, encodeHeaderWord, smtpDeliver,
  parseCsv, normaliseMailbox, loadRamp,
  REAL_DOMAINS, COLD_CEILING_PER_INBOX, isRealDomain, domainOf,
};

// CLI: inspect fleet without sending
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === '--fleet') console.log(JSON.stringify(fleetSnapshot(), null, 2));
  else if (cmd === '--remaining') console.log('fleet cold capacity remaining today:', fleetRemainingToday());
  else if (cmd === '--creds') console.log(`${loadCredsRaw().length} mailbox creds loaded (passwords hidden)`);
  else console.log('Usage: mailbox-pool.js --fleet | --remaining | --creds');
}
