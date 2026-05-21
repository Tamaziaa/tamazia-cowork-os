// Slack Bot API integration · uses SLACK_BOT_TOKEN (chat:write, channels:read, channels:manage, im:write)
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const API = 'https://slack.com/api';

function token() { return process.env.SLACK_BOT_TOKEN || ''; }
function headers() { return { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json; charset=utf-8' }; }

async function authTest() {
  if (!token()) return { ok: false, error: 'no_slack_token' };
  const r = await fetchWithRetry(`${API}/auth.test`, { headers: headers(), timeout: 10000 });
  return { ok: r.ok, body: r.body && JSON.parse(r.body) };
}
async function postMessage({ channel, text, blocks }) {
  if (!token()) return { ok: false, error: 'no_slack_token' };
  const body = { channel, text, ...(blocks ? { blocks } : {}) };
  const r = await fetchWithRetry(`${API}/chat.postMessage`, { method: 'POST', headers: headers(), body: JSON.stringify(body), timeout: 12000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}
async function listChannels() {
  if (!token()) return { ok: false };
  const r = await fetchWithRetry(`${API}/conversations.list?exclude_archived=true&limit=200`, { headers: headers(), timeout: 12000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}
async function createChannel(name) {
  if (!token()) return { ok: false };
  const r = await fetchWithRetry(`${API}/conversations.create`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, is_private: false }), timeout: 12000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}

module.exports = { authTest, postMessage, listChannels, createChannel };

if (require.main === module) {
  (async () => {
    console.log('=== auth test ===');
    console.log(JSON.stringify(await authTest(), null, 2));
    console.log('=== channels ===');
    const ch = await listChannels();
    console.log('Public channels visible to bot:', (ch.channels || []).map(c => '#' + c.name).slice(0, 10));
  })();
}
