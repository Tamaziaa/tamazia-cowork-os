// Cal.com v2 API · CALCOM_API_KEY
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const API = 'https://api.cal.com/v2';

function key() { return process.env.CALCOM_API_KEY || ''; }
function headers() { return { 'Authorization': `Bearer ${key()}`, 'Content-Type': 'application/json', 'cal-api-version': '2024-08-13' }; }

async function me() {
  if (!key()) return { ok: false };
  const r = await fetchWithRetry(`${API}/me`, { headers: headers(), timeout: 10000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}
async function listEventTypes() {
  if (!key()) return { ok: false };
  const r = await fetchWithRetry(`${API}/event-types`, { headers: headers(), timeout: 10000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}
async function listBookings({ status, take = 50 } = {}) {
  if (!key()) return { ok: false };
  const q = status ? `?status=${status}&take=${take}` : `?take=${take}`;
  const r = await fetchWithRetry(`${API}/bookings${q}`, { headers: headers(), timeout: 10000 });
  return r.body ? JSON.parse(r.body) : { ok: false };
}

module.exports = { me, listEventTypes, listBookings };

if (require.main === module) {
  (async () => {
    console.log('=== Cal.com me ===');
    console.log(JSON.stringify(await me(), null, 2).slice(0, 500));
    console.log('=== event types ===');
    const et = await listEventTypes();
    console.log(JSON.stringify(et, null, 2).slice(0, 800));
  })();
}
