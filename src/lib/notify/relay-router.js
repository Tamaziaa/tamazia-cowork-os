// Multi-relay router · routes each send to a transactional relay, enforces per-relay daily
// caps, and fails over to the next healthy relay on error. Unified interface:
//   send({ to, from, from_name, subject, text, html, relay }) -> { ok, provider, id, raw }
//
// Transactional relays (cold 1:1 outreach):
//   smtp2go   1,000/mo  (~33/day)
//   brevo     9,000/mo  (300/day)
//   mailjet   6,000/mo  (200/day)
//   sendgrid  3,000/mo  (100/day)  [trial→free 100/day]
//   resend    3,000/mo  (100/day)  [key pending]
//   mailersend 3,000/mo (100/day)  [key pending]
// MailerLite is campaign/subscriber-only (NOT cold-transactional) — excluded from this router;
// reserved for opt-in nurore/newsletter streams.
//
// Daily caps tracked in relay_daily_usage(relay, day, sent). Router skips a relay once capped.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (_e) { return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

// Per-relay daily send caps (conservative, under each provider's free limit)
const DAILY_CAP = { smtp2go: 33, brevo: 300, mailjet: 200, sendgrid: 100, resend: 100, mailersend: 100 };
// Failover order when a relay is capped or errors
const FAILOVER = ['brevo', 'mailjet', 'sendgrid', 'smtp2go', 'resend', 'mailersend'];

function todayUsage(relay) {
  const r = pg(`SELECT COALESCE(sent,0) FROM relay_daily_usage WHERE relay=${esc(relay)} AND day=CURRENT_DATE`);
  return r ? Number(r) : 0;
}
function bumpUsage(relay) {
  pg(`INSERT INTO relay_daily_usage (relay, day, sent) VALUES (${esc(relay)}, CURRENT_DATE, 1)
      ON CONFLICT (relay, day) DO UPDATE SET sent = relay_daily_usage.sent + 1`);
}
function relayHasRoom(relay) {
  const cap = DAILY_CAP[relay] || 0;
  if (!cap) return false;
  return todayUsage(relay) < cap;
}

// ---- Unsubscribe headers (RFC 2369 mailto + RFC 8058 one-click when HTTPS endpoint live) ----
// HTTPS one-click endpoint can be added to the CF audit-worker (/unsub?e=); until then mailto
// gives a working unsubscribe link (two-click) which satisfies the "unsubscribe link" rule.
const UNSUB_HTTPS = process.env.UNSUB_ENDPOINT || ''; // e.g. https://tamazia.co.uk/unsub
function unsubMailto(from) { return `<mailto:${from}?subject=unsubscribe>`; }
function unsubHttps(to, from) { return UNSUB_HTTPS ? `<${UNSUB_HTTPS}?e=${encodeURIComponent(to)}&f=${encodeURIComponent(from)}>` : ''; }
function listUnsubValue(to, from) { const h = unsubHttps(to, from); return h ? `${h}, ${unsubMailto(from)}` : unsubMailto(from); }

// ---- Provider send implementations ----------------------------------------------
async function viaSmtp2go({ to, from, from_name, subject, text, html, messageId }) {
  const key = process.env.SMTP2GO_KEY; if (!key) return { ok: false, error: 'no_key' };
  const ch = [{ header: 'List-Unsubscribe', value: listUnsubValue(to, from) }];
  if (UNSUB_HTTPS) ch.push({ header: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' });
  if (messageId) ch.push({ header: 'Message-ID', value: messageId });
  const r = await fetchWithRetry('https://api.smtp2go.com/v3/email/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Smtp2go-Api-Key': key },
    body: JSON.stringify({ api_key: key, to: [to], sender: `${from_name} <${from}>`, subject, text_body: text, html_body: html, custom_headers: ch }),
    timeout: 15000, retries: 1
  });
  try { const j = JSON.parse(r.body); return { ok: r.ok && j.data && j.data.succeeded > 0, id: j.data?.email_id, raw: j }; }
  catch (e) { return { ok: false, error: e.message }; }
}
async function viaBrevo({ to, from, from_name, subject, text, html, messageId }) {
  const key = process.env.BREVO_KEY; if (!key) return { ok: false, error: 'no_key' };
  const headers = { 'List-Unsubscribe': listUnsubValue(to, from) };
  if (UNSUB_HTTPS) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  if (messageId) headers['Message-ID'] = messageId;
  const r = await fetchWithRetry('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ sender: { email: from, name: from_name }, to: [{ email: to }], subject, textContent: text, htmlContent: html || undefined, headers }),
    timeout: 15000, retries: 1
  });
  try { const j = JSON.parse(r.body); return { ok: r.ok && !!j.messageId, id: j.messageId, raw: j }; }
  catch (e) { return { ok: r.ok, id: null, raw: r.body?.slice(0, 200) }; }
}
async function viaMailjet({ to, from, from_name, subject, text, html, messageId }) {
  const key = process.env.MAILJET_KEY, secret = process.env.MAILJET_SECRET;
  if (!key || !secret) return { ok: false, error: 'no_key' };
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const Headers = { 'List-Unsubscribe': listUnsubValue(to, from) };
  if (UNSUB_HTTPS) Headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  // NOTE: Mailjet rejects Message-ID in the Headers collection (send-0011: "Header cannot be
  // customized using the Headers collection"). Mailjet sets its own Message-ID; reply matching for
  // Mailjet sends falls back to the returned Mailjet MessageID (relay_email_id) + In-Reply-To/References.
  const r = await fetchWithRetry('https://api.mailjet.com/v3.1/send', {
    method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Messages: [{ From: { Email: from, Name: from_name }, To: [{ Email: to }], Subject: subject, TextPart: text, HTMLPart: html || undefined, Headers }] }),
    timeout: 15000, retries: 1
  });
  try { const j = JSON.parse(r.body); const m = j.Messages?.[0]; return { ok: m?.Status === 'success', id: m?.To?.[0]?.MessageID, raw: j }; }
  catch (e) { return { ok: false, error: e.message, raw: r.body?.slice(0, 200) }; }
}
async function viaSendgrid({ to, from, from_name, subject, text, html, messageId }) {
  const key = process.env.SENDGRID_KEY; if (!key) return { ok: false, error: 'no_key' };
  const content = [{ type: 'text/plain', value: text }];
  if (html) content.push({ type: 'text/html', value: html });
  const headers = { 'List-Unsubscribe': listUnsubValue(to, from) };
  if (UNSUB_HTTPS) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  if (messageId) headers['Message-ID'] = messageId;
  const r = await fetchWithRetry('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from, name: from_name }, subject, content, headers }),
    timeout: 15000, retries: 1
  });
  // SendGrid returns 202 with empty body on success; message id is in X-Message-Id header
  const id = r.headers && (r.headers['x-message-id'] || r.headers['X-Message-Id']);
  return { ok: r.status === 202 || r.ok, id: id || null, raw: r.status };
}
async function viaResend({ to, from, from_name, subject, text, html, messageId }) {
  const key = process.env.RESEND_KEY; if (!key) return { ok: false, error: 'no_key' };
  const r = await fetchWithRetry('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${from_name} <${from}>`, to: [to], subject, text, html: html || undefined, headers: messageId ? { 'Message-ID': messageId } : undefined }),
    timeout: 15000, retries: 1
  });
  try { const j = JSON.parse(r.body); return { ok: !!j.id, id: j.id, raw: j }; } catch (e) { return { ok: false, error: e.message }; }
}
async function viaMailersend({ to, from, from_name, subject, text, html }) {
  const key = process.env.MAILERSEND_KEY; if (!key) return { ok: false, error: 'no_key' };
  const r = await fetchWithRetry('https://api.mailersend.com/v1/email', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: { email: from, name: from_name }, to: [{ email: to }], subject, text, html: html || undefined }),
    timeout: 15000, retries: 1
  });
  const id = r.headers && (r.headers['x-message-id'] || r.headers['X-Message-Id']);
  return { ok: r.status === 202 || r.ok, id: id || null, raw: r.status };
}

const PROVIDERS = { smtp2go: viaSmtp2go, brevo: viaBrevo, mailjet: viaMailjet, sendgrid: viaSendgrid, resend: viaResend, mailersend: viaMailersend };

/**
 * Send via the requested relay; on cap/error, fail over through FAILOVER order.
 * @param {object} opts { to, from, from_name, subject, text, html, relay }
 */
async function send(opts) {
  const preferred = (opts.relay || 'brevo').toLowerCase();
  // Stable RFC Message-ID for bit-perfect reply threading. Caller may pass opts.messageId so it can
  // persist the exact value; otherwise we mint one here. Same ID is reused across failover attempts.
  if (!opts.messageId) { const dom = (opts.from || 'tamazia.in').split('@')[1] || 'tamazia.in'; opts.messageId = `<tz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@${dom}>`; }
  // Build attempt order: preferred first, then failover (deduped), only providers with keys + room
  const order = [preferred, ...FAILOVER.filter(r => r !== preferred)];
  const attempts = [];
  for (const relay of order) {
    const fn = PROVIDERS[relay];
    if (!fn) continue;
    if (!relayHasRoom(relay)) { attempts.push({ relay, skipped: 'capped_or_no_key' }); continue; }
    const r = await fn(opts);
    if (r.ok) {
      bumpUsage(relay);
      // message_id = the RFC Message-ID we set (matches replies' In-Reply-To); id = provider's own id.
      return { ok: true, provider: relay, id: r.id, message_id: opts.messageId, raw: r.raw, attempts };
    }
    attempts.push({ relay, error: r.error || r.raw });
  }
  return { ok: false, error: 'all_relays_failed', attempts };
}

function capacitySnapshot() {
  const out = {};
  let total = 0;
  for (const [relay, cap] of Object.entries(DAILY_CAP)) {
    const hasKey = relay === 'mailjet' ? !!(process.env.MAILJET_KEY && process.env.MAILJET_SECRET) : !!process.env[`${relay.toUpperCase()}_KEY`];
    const used = hasKey ? todayUsage(relay) : 0;
    out[relay] = { has_key: hasKey, daily_cap: cap, used_today: used, remaining: hasKey ? cap - used : 0 };
    if (hasKey) total += cap - used;
  }
  out._total_remaining_today = total;
  out._monthly_capacity = '~25k/mo across live transactional relays (50k needs opt-in nurture stream or paid top-up)';
  return out;
}

module.exports = { send, capacitySnapshot, DAILY_CAP, PROVIDERS, relayHasRoom };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === '--capacity') console.log(JSON.stringify(capacitySnapshot(), null, 2));
  else console.log('Usage: relay-router.js --capacity');
}
