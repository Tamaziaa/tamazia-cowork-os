// SMTP2Go API send · uses SMTP2GO_KEY (sender domain must be verified in SMTP2Go dashboard)
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
function key() { return process.env.SMTP2GO_KEY || ''; }

async function send({ to, from = 'aman@tamazia.co.uk', from_name = 'Aman Pareek', subject, text_body, html_body, custom_headers = [] }) {
  if (!key()) return { ok: false, error: 'no_smtp2go_key' };
  const sender = `${from_name} <${from}>`;
  const body = {
    api_key: key(),
    to: Array.isArray(to) ? to : [to],
    sender,
    subject,
    text_body: text_body || undefined,
    html_body: html_body || undefined,
    custom_headers
  };
  const r = await fetchWithRetry('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Smtp2go-Api-Key': key() },
    body: JSON.stringify(body),
    timeout: 15000,
    retries: 1
  });
  try {
    const json = JSON.parse(r.body);
    return { ok: r.ok && json.data && json.data.succeeded > 0, raw: json };
  } catch (e) { return { ok: false, error: e.message, raw: r.body }; }
}

module.exports = { send };

if (require.main === module) {
  // Smoke test: send a self-test email to founder@tamazia.co.uk
  send({
    to: 'founder@tamazia.co.uk',
    subject: 'SMTP2Go live · Tamazia engine self-test',
    text_body: 'This is a self-test from the Tamazia Cowork OS engine confirming SMTP2Go is wired.\n\nTimestamp: ' + new Date().toISOString()
  }).then(r => console.log('SMTP2Go send:', r.ok, '· response:', JSON.stringify(r.raw).slice(0, 400)));
}
