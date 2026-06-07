'use strict';
// SRA "Find a Solicitor" (law-firms sector). The Law Society register lists a firm's solicitors + the
// regulatory role-holders (COLP/COFA — the compliance principals who carry the SRA liability). No official
// API, so this is a best-effort public-page fetch with graceful []; gate with SRA_REGISTER=1 to enable.
// Returns [{ name, role, source:'sra_register' }] or [].
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function getText(url, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: c.signal }); if (!r.ok) return ''; return await r.text(); }
  catch (_) { return ''; } finally { clearTimeout(t); }
}
async function sraOfficers({ company, env = process.env } = {}) {
  if (!/^(1|true|yes|on)$/i.test(env.SRA_REGISTER || '') || !company) return []; // opt-in; scraping is fragile
  try {
    const html = await getText('https://solicitors.lawsociety.org.uk/search/results?Pro=False&Type=0&Name=' + encodeURIComponent(company));
    if (!html) return [];
    const out = []; const seen = new Set();
    // Person result blocks expose a name + their role/position; extract conservatively.
    for (const m of html.matchAll(/class="[^"]*person[^"]*"[\s\S]{0,400}?>([A-Z][A-Za-z'’.\- ]{3,40})</g)) {
      const name = (m[1] || '').trim(); const k = name.toLowerCase();
      if (name && /\s/.test(name) && !seen.has(k)) { seen.add(k); out.push({ name, role: 'Solicitor / COLP/COFA', source: 'sra_register' }); }
      if (out.length >= 10) break;
    }
    return out;
  } catch (_) { return []; }
}
module.exports = { sraOfficers };
