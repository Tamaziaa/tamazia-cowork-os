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
    const s = await getJSON(`${BASE}/Search?q=${encodeURIComponent(company)}&type=firm`, H);
    const data = (s && (s.Data || s.data)) || [];
    const firm = data.find(d => /firm/i.test(d.Type || d.type || '')) || data[0] || {};
    const frn = firm.Reference_Number || firm.reference_number || firm.FRN;
    if (!frn) return [];
    const ind = await getJSON(`${BASE}/Firm/${frn}/Individuals`, H);
    const rows = (ind && (ind.Data || ind.data)) || [];
    const out = [];
    for (const i of rows) {
      const name = (i.Name || i.name || '').trim();
      if (name && !/^the\b/i.test(name)) out.push({ name, role: (i.Status || i.role || 'Approved person').toString(), source: 'fca_register' });
    }
    return out.slice(0, 12);
  } catch (_) { return []; }
}
module.exports = { fcaOfficers };
