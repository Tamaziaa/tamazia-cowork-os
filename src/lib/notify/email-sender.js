// Unified email sender · failover across SMTP2Go → Resend → MailerSend → Brevo
// Spam-safe defaults: text + HTML, RFC 8058 unsubscribe headers, no aggressive language flags.
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const { send: smtp2goSend } = require('./smtp2go.js');

function textToHtml(text) {
  return '<html><body style="font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif; color: #1F2937; max-width: 640px; line-height: 1.6;">'
    + text.split('\n\n').map(p => '<p>' + p.replace(/\n/g, '<br>').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>').join('')
    + '<p style="font-size: 0.8em; color: #999; margin-top: 32px;">Tamazia · C1 Barking Wharf Square, London IG11 7ZQ. To stop receiving these, just reply STOP.</p>'
    + '</body></html>';
}

function listUnsubHeaders(reply_to = 'aman@tamazia.co.uk') {
  return [
    { header: 'List-Unsubscribe', value: `<mailto:${reply_to}?subject=unsubscribe>` },
    { header: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' }
  ];
}

async function sendViaResend({ to, from, subject, text, html }) {
  const key = process.env.RESEND_KEY || ''; if (!key) return { ok: false, error: 'no_resend_key' };
  const r = await fetchWithRetry('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html }), timeout: 12000, retries: 1 });
  try { const j = JSON.parse(r.body); return { ok: !!j.id, raw: j, provider: 'resend' }; } catch (e) { return { ok: false, error: e.message }; }
}

async function sendViaMailerSend({ to, from, subject, text, html }) {
  const key = process.env.MAILERSEND_KEY || ''; if (!key) return { ok: false, error: 'no_mailersend_key' };
  const r = await fetchWithRetry('https://api.mailersend.com/v1/email', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: { email: from }, to: [{ email: to }], subject, text, html }), timeout: 12000, retries: 1 });
  return { ok: r.ok, raw: r.body?.slice(0, 200), provider: 'mailersend' };
}

async function sendViaBrevo({ to, from, subject, text, html }) {
  const key = process.env.BREVO_KEY || ''; if (!key) return { ok: false, error: 'no_brevo_key' };
  const r = await fetchWithRetry('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { email: from }, to: [{ email: to }], subject, textContent: text, htmlContent: html }), timeout: 12000, retries: 1 });
  return { ok: r.ok, raw: r.body?.slice(0, 200), provider: 'brevo' };
}

/**
 * Unified send with auto-failover. Returns { ok, provider, raw }.
 * Spam-safe: always provides both text + HTML, includes List-Unsubscribe headers via the provider that supports them.
 */
async function send({ to, from = 'aman@tamazia.co.uk', from_name = 'Aman Pareek', subject, text }) {
  const html = textToHtml(text || '');
  const headers = listUnsubHeaders(from);
  // 1. SMTP2Go (live, best deliverability with verified sender + custom headers)
  let r = await smtp2goSend({ to, from, from_name, subject, text_body: text, html_body: html, custom_headers: headers });
  if (r.ok) return { ok: true, provider: 'smtp2go', email_id: r.raw?.data?.email_id, raw: r.raw };
  // 2. Resend
  r = await sendViaResend({ to, from: `${from_name} <${from}>`, subject, text, html });
  if (r.ok) return r;
  // 3. MailerSend
  r = await sendViaMailerSend({ to, from, subject, text, html });
  if (r.ok) return r;
  // 4. Brevo
  r = await sendViaBrevo({ to, from, subject, text, html });
  return r;
}

module.exports = { send, textToHtml, listUnsubHeaders };

if (require.main === module) {
  send({ to: 'founder@tamazia.co.uk', subject: 'Unified email sender · self-test ' + Date.now(), text: 'Self-test of the unified email sender with HTML + plain + List-Unsubscribe headers.\n\nIf this email landed in Primary inbox with no spam warning, the spam-bypass layer is working.\n\nReply STOP to unsubscribe.\n\nAman' }).then(r => console.log(JSON.stringify(r, null, 2).slice(0, 500)));
}
