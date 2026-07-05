'use strict';
// Phase 2.2 register grounding — turns "the site mentions UK" into "an official register confirms the firm is
// ESTABLISHED here". ADDITIVE + FAIL-OPEN: it can only ever ADD establishment evidence (never remove), so a real
// firm is never dropped if a register is unreachable. Free public registers (researched 2026-07):
//   CQC  — https://api.cqc.org.uk/public/v1  — NO KEY (Open Government Licence); add ?partnerCode=<id>. Healthcare.
//   Companies House — https://api.company-information.service.gov.uk — FREE self-service key (HTTP Basic, key as user).
//   FCA Financial Services Register — https://register.fca.org.uk/services/V0.1 — FREE key (email+key headers). Finance.
//   SRA Data Sharing API — SRA-registered organisations (law firms), JSON. Solicitors.
// Keys (when present) come from env; absent keys => that register is simply skipped (fail-open). No network in tests.
const https = require('https');

const REGISTERS = {
  CQC:  { fam: 'UK', sector: ['healthcare'], keyEnv: null,                base: 'https://api.cqc.org.uk/public/v1' },     // no key
  CH:   { fam: 'UK', sector: null,           keyEnv: 'COMPANIES_HOUSE_KEY', base: 'https://api.company-information.service.gov.uk' },
  FCA:  { fam: 'UK', sector: ['finance','fintech','insurance'], keyEnv: 'FCA_API_KEY', base: 'https://register.fca.org.uk/services/V0.1' },
  SRA:  { fam: 'UK', sector: ['law-firms'],  keyEnv: 'SRA_API_KEY',     base: 'https://data.sra.org.uk' },
};

function _get(url, headers, timeoutMs) {
  return new Promise(resolve => {
    try {
      const req = https.get(url, { headers: headers || {}, timeout: timeoutMs || 4000 }, res => {
        let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (_) { resolve({ status: res.statusCode, json: null }); } });
      });
      req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch (_) { resolve(null); }
  });
}

// Which registers are usable right now (no key needed, OR key present in env). Pure — safe to call in tests.
function availableRegisters(env = process.env) {
  const out = [];
  for (const [name, r] of Object.entries(REGISTERS)) { if (!r.keyEnv || env[r.keyEnv]) out.push(name); }
  return out; // CQC always present (no key)
}

// Ground establishment for a firm. Returns { UK: { established_in:true, source:'CQC', ref } } or {} (fail-open).
// `probe` is injectable for tests (defaults to the live https GET). Never throws.
async function groundEstablishment({ name, companyNumber, sector, env = process.env, probe = null } = {}) {
  const get = probe || _get; const found = {};
  for (const rn of availableRegisters(env)) {
    const r = REGISTERS[rn];
    if (r.sector && sector && !r.sector.includes(String(sector).toLowerCase())) continue;
    try {
      let url = null, headers = {};
      if (rn === 'CH' && companyNumber) { url = `${r.base}/company/${encodeURIComponent(companyNumber)}`; headers = { Authorization: 'Basic ' + Buffer.from((env.COMPANIES_HOUSE_KEY || '') + ':').toString('base64') }; }
      else if (rn === 'CQC' && name) { url = `${r.base}/providers?partnerCode=tamazia&name=${encodeURIComponent(name)}`; }
      else if (rn === 'FCA' && name && env.FCA_API_KEY) { url = `${r.base}/Search?q=${encodeURIComponent(name)}&type=firm`; headers = { 'X-Auth-Email': env.FCA_EMAIL || '', 'X-Auth-Key': env.FCA_API_KEY }; }
      else if (rn === 'SRA' && name) { url = `${r.base}/organisations?name=${encodeURIComponent(name)}`; }
      if (!url) continue;
      const res = await get(url, headers, 4000);
      if (res && res.status === 200 && res.json && (Array.isArray(res.json) ? res.json.length : Object.keys(res.json).length)) {
        found[r.fam] = { established_in: true, source: rn, ref: (res.json.company_number || (res.json[0] && (res.json[0].locationId || res.json[0].id)) || true) };
      }
    } catch (_) { /* fail-open */ }
  }
  return found; // empty => no grounding; caller keeps corpus-based nexus unchanged
}

// Merge register grounding INTO a corpus nexus map — additive only (never clears an established_in the corpus set).
function mergeGrounding(nexusMap, grounding) {
  const out = Object.assign({}, nexusMap || {});
  for (const fam of Object.keys(grounding || {})) {
    out[fam] = Object.assign({}, out[fam] || {}, { established_in: !!(grounding[fam].established_in) || !!(out[fam] && out[fam].established_in), established_source: grounding[fam].source });
  }
  return out;
}
module.exports = { REGISTERS, availableRegisters, groundEstablishment, mergeGrounding };
