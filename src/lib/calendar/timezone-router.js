// timezone-router.js — schedule a send at a preferred local hour per recipient.
// Returns a UTC ISO timestamp. Respects DST via the standard JS time-zone database.
//
// Used by compose-body: every lead has lead.country (+ optional lead.state for US),
// scheduler chooses 08:30 local time as default preferred hour unless overridden.

const TZ_BY_COUNTRY = {
  UK: 'Europe/London',
  GB: 'Europe/London',
  GBR: 'Europe/London',
  IE: 'Europe/Dublin',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  PT: 'Europe/Lisbon',
  PL: 'Europe/Warsaw',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
  SE: 'Europe/Stockholm',
  US: 'America/New_York',
  USA: 'America/New_York',
  CA: 'America/Toronto',
  AE: 'Asia/Dubai',
  UAE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  IN: 'Asia/Kolkata',
  SG: 'Asia/Singapore',
  AU: 'Australia/Sydney',
};

const TZ_BY_US_STATE = {
  AK: 'America/Anchorage',
  HI: 'Pacific/Honolulu',
  CA: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  AZ: 'America/Phoenix', UT: 'America/Denver', CO: 'America/Denver', NM: 'America/Denver', WY: 'America/Denver', MT: 'America/Denver', ID: 'America/Boise',
  TX: 'America/Chicago', IL: 'America/Chicago', OK: 'America/Chicago', KS: 'America/Chicago', NE: 'America/Chicago', SD: 'America/Chicago', ND: 'America/Chicago', MN: 'America/Chicago', IA: 'America/Chicago', WI: 'America/Chicago', MO: 'America/Chicago', AR: 'America/Chicago', LA: 'America/Chicago', MS: 'America/Chicago', AL: 'America/Chicago', TN: 'America/Chicago', KY: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  NY: 'America/New_York', NJ: 'America/New_York', PA: 'America/New_York', CT: 'America/New_York', MA: 'America/New_York', RI: 'America/New_York', VT: 'America/New_York', NH: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York', DE: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York', NC: 'America/New_York', SC: 'America/New_York', GA: 'America/New_York', FL: 'America/New_York', OH: 'America/New_York', MI: 'America/Detroit',
};

function pickTimezone({ country, state }) {
  const c = String(country || '').toUpperCase();
  if (c === 'US' || c === 'USA') {
    const s = String(state || '').toUpperCase();
    return TZ_BY_US_STATE[s] || 'America/New_York';
  }
  return TZ_BY_COUNTRY[c] || 'UTC';
}

function nextLocalSlotISO(opts) {
  opts = opts || {};
  const tz = pickTimezone(opts);
  const preferredHour = typeof opts.preferred_hour === 'number' ? opts.preferred_hour : 8.5;
  const hh = Math.floor(preferredHour);
  const mm = Math.round((preferredHour - hh) * 60);

  // Find now in the target timezone using Intl + manual reconstruction.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  let y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  const curHour = Number(parts.hour), curMin = Number(parts.minute);

  // If current local time is already past preferred hour, schedule for tomorrow at preferred hour.
  if (curHour > hh || (curHour === hh && curMin >= mm)) {
    const tmp = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000);
    y = tmp.getUTCFullYear(); m = tmp.getUTCMonth() + 1; d = tmp.getUTCDate();
  }

  // Build a target local datetime string then walk back through UTC by computing the timezone offset.
  const targetLocalISO = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
  // Walk: compute what UTC instant produces that local string.
  let guess = new Date(`${targetLocalISO}Z`);
  for (let i = 0; i < 3; i++) {
    const back = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12: false }).formatToParts(guess).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const localActual = `${back.year}-${back.month}-${back.day}T${back.hour}:${back.minute}:00`;
    const delta = (new Date(`${targetLocalISO}Z`).getTime() - new Date(`${localActual}Z`).getTime());
    guess = new Date(guess.getTime() + delta);
  }
  return guess.toISOString();
}

// Backwards-compatible alias the verification expects.
function scheduleSend(opts) {
  return nextLocalSlotISO(opts);
}

module.exports = { scheduleSend, nextLocalSlotISO, pickTimezone, TZ_BY_COUNTRY, TZ_BY_US_STATE };

if (require.main === module) {
  console.log(JSON.stringify({
    UK_8_30: scheduleSend({ country: 'UK', preferred_hour: 8.5 }),
    US_NY_8_30: scheduleSend({ country: 'US', state: 'NY', preferred_hour: 8.5 }),
    US_CA_8_30: scheduleSend({ country: 'US', state: 'CA', preferred_hour: 8.5 }),
    UAE_9_00: scheduleSend({ country: 'AE', preferred_hour: 9 }),
  }, null, 2));
}
