// Telegram Bot · push notifications · uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

function token() { return process.env.TELEGRAM_BOT_TOKEN || ''; }
function chatId() { return process.env.TELEGRAM_CHAT_ID || ''; }

async function send(text, opts = {}) {
  if (!token() || !chatId()) return { ok: false, error: 'no_telegram_creds' };
  const url = `https://api.telegram.org/bot${token()}/sendMessage`;
  const parse_mode = opts.parse_mode === '' ? undefined : (opts.parse_mode || 'HTML');
  const body = { chat_id: chatId(), text, disable_web_page_preview: opts.disable_preview !== false };
  if (parse_mode) body.parse_mode = parse_mode;
  const r = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout: 10000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}

module.exports = { send };

if (require.main === module) {
  (async () => {
    const r = await send('🤖 *Tamazia engine* · Phase 7.5 honest rebuild · Slack Bot + Telegram + Gemini wired live');
    console.log(JSON.stringify(r, null, 2).slice(0, 300));
  })();
}
