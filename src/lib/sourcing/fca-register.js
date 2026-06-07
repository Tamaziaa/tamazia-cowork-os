'use strict';
// FCA Financial Services Register (financial sector). The Register names the people who hold controlled /
// significant-influence functions at an FCA-authorised firm — i.e. the decision-makers who carry the
// regulatory liability (exactly the founder's ICP). Free API at register.fca.org.uk; needs FCA_API_EMAIL +
// FCA_API_KEY (free signup). Returns [{ name, role, source:'fca_register' }] or [] (always graceful).
const BASE = 'https://register.fca.org.uk/services/V0.1';
async function getJSON(url, headers, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers, signal: c.signal }); if (!r.ok) return null; return await r.json(); }
  catch (_) { return null; } finally { clearTimeout(t); }
}
async function fcaOfficers({ company, env = process.env } = {}) {
  const email = env.FCA_API_EMAIL, key = env.FCA_API_KEY;
  if (!email || !key || !company) return [];
  const H = { 'X-Auth-Email': email, 'X-Auth-Key': key, 'Accept': 'application/json' };
  try {
    const s = await getJSON(`${BASE}/CommonSearch?q=${encodeURIComponent(company)}&type=firm`, H);
    const data = (s && (s.Data || s.data)) || [];
    const firm = data.find(d => /firm/i.test(d['Type of business or Individual'] || d.Type || '')) || data[0] || {};
    const frn = firm['Reference Number'] || firm.Reference_Number || firm.FRN;
    if (!frn) return [];
    const ind = await getJSON(`${BASE}/Firm/${frn}/Individuals`, H);
    const rows = (ind && (ind.Data || ind.data)) || [];
    const out = [];
    for (const i of rows) {
      const name = normalizePersonName(i.Name || i.name || '');
      if (name && !/^the\b/i.test(name)) out.push({ name, role: (i.Status || i.role || 'Approved person').toString(), source: 'fca_register' });
    }
    return out.slice(0, 12);
  } catch (_) { return []; }
}

// Shared register-name normalization: strip honorifics, reorder "Surname, Forename" -> "Forename Surname",
// strip trailing punctuation. Prevents garbled guessed emails like smith,.john@domain.
function normalizePersonName(raw) {
  let n = String(raw || '').trim();
  if (!n) return '';
  n = n.replace(/^\s*(mr|mrs|ms|miss|dr|prof|professor|sir|dame|lord|lady)\.?\s+/i, '');
  if (n.includes(',')) { const [a, b] = n.split(',', 2).map(x => x.trim()); if (a && b) n = `${b} ${a}`; }
  n = n.replace(/[.,;:\s]+$/g, '').replace(/\s{2,}/g, ' ');
  return n;
}
module.exports = { fcaOfficers, normalizePersonName };
