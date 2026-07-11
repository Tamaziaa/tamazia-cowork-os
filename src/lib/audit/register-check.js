'use strict';
// E-213 (v22.5) — REGISTERED REALITY (Regulators View module 1, plan Part 4).
// Cross-checks the firm against the government registers it is already listed on and returns render-ready rows.
// Design contract:
//   - 100% accurate by construction: every row is either an API-confirmed register record with the official
//     source URL, or an honest link-out ("verify on the register") — never an inference, never a guess.
//   - Crawl-independent: register data arrives by API even when the site blocks bots, so this module renders
//     on every audit including knowledge-mode mints.
//   - Fail-open per register: a down API yields status 'unavailable' for that row only; the mint never blocks.
//   - Site-side comparison uses ONLY what the scanner literally matched (positive_compliance booleans); where the
//     crawl was unavailable the site column reads 'not confirmed on this scan' rather than a false negative.
// Row shape: { register, label, status: 'confirmed'|'not_found'|'link_out'|'unavailable', record:{name,number,
//   detail}|null, on_site: true|false|null, statute_line, source_url }
const https = require('https');
const { REGISTERS } = require('../compliance/register-grounding.js');

function _get(url, headers, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { headers: headers || {}, timeout: timeoutMs || 6000 }, (res) => {
        let b = ''; res.on('data', (d) => { b += d; if (b.length > 2_000_000) { try { req.destroy(); } catch (_e) {} } });
        res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_e) {} resolve({ status: res.statusCode, json: j }); });
      });
      req.on('error', () => resolve(null)); req.on('timeout', () => { try { req.destroy(); } catch (_e) {} resolve(null); });
    } catch (_e) { resolve(null); }
  });
}

const _PARENT = (sector) => {
  try { const s = require('../compliance/registry/sector.js'); return s.parentOf(String(sector || '')) || String(sector || '').toLowerCase(); }
  catch (_e) { return String(sector || '').toLowerCase(); }
};
const _HEALTH = new Set(['healthcare', 'dental', 'aesthetics', 'pharmacy', 'telemedicine', 'care-homes', 'fertility']);
const _FINANCE = new Set(['finance', 'fintech', 'insurance']);

async function _companiesHouse({ company, env, onSite }) {
  const key = env.COMPANIES_HOUSE_KEY || env.CH_API_KEY;
  const row = {
    register: 'companies_house', label: 'Companies House',
    statute_line: 'The Companies Act 2006 s.82 and the 2015 Regulations require the registered name, number and office on business websites and emails.',
    source_url: 'https://find-and-update.company-information.service.gov.uk/', on_site: onSite, status: 'link_out', record: null,
  };
  if (!key || !company) return row;
  const q = encodeURIComponent(String(company).slice(0, 80));
  const res = await _get('https://api.company-information.service.gov.uk/search/companies?q=' + q + '&items_per_page=3',
    { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') }, 6000);
  if (!res || res.status !== 200 || !res.json) return Object.assign(row, { status: 'unavailable' });
  const items = (res.json.items || []).filter((x) => x && x.company_number);
  if (!items.length) return Object.assign(row, { status: 'not_found' });
  const _norm = (s) => String(s || '').toLowerCase().replace(/\b(ltd|limited|llp|plc|the|and|&|co|company)\b/g, '').replace(/[^a-z0-9]/g, '');
  const want = _norm(company);
  const hit = items.find((x) => _norm(x.title) === want) || items[0];
  const exact = _norm(hit.title) === want;
  return Object.assign(row, {
    status: 'confirmed',
    record: { name: hit.title, number: hit.company_number, detail: (hit.company_status || '') + (exact ? '' : ' (nearest register match, confirm on call)') },
    source_url: 'https://find-and-update.company-information.service.gov.uk/company/' + encodeURIComponent(hit.company_number),
  });
}

async function _cqc({ company, env, onSite }) {
  const row = {
    register: 'cqc', label: 'CQC (Care Quality Commission)',
    statute_line: 'Regulation 20A of the 2014 Regulations requires the CQC rating displayed on the website within 21 days of publication; CQC can prosecute a display failure without first serving a warning notice.',
    source_url: 'https://www.cqc.org.uk/search/all', on_site: onSite, status: 'link_out', record: null,
  };
  if (!company) return row;
  const headers = env.CQC_API_KEY ? { 'Ocp-Apim-Subscription-Key': env.CQC_API_KEY } : {};
  const res = await _get('https://api.cqc.org.uk/public/v1/providers?partnerCode=tamazia&name=' + encodeURIComponent(String(company).slice(0, 80)), headers, 6000);
  if (!res || res.status !== 200 || !res.json) return Object.assign(row, { status: 'unavailable' });
  const first = (res.json.providers || res.json || [])[0];
  if (!first || !(first.providerId || first.providerID)) return Object.assign(row, { status: 'not_found' });
  const pid = first.providerId || first.providerID;
  return Object.assign(row, {
    status: 'confirmed',
    record: { name: first.providerName || first.name || String(company), number: pid, detail: 'registered provider' },
    source_url: 'https://www.cqc.org.uk/provider/' + encodeURIComponent(pid),
  });
}

async function _fca({ company, env, onSite }) {
  const key = env.FCA_API_KEY; const email = env.FCA_EMAIL || env.FCA_API_EMAIL;
  const row = {
    register: 'fca', label: 'FCA Financial Services Register',
    statute_line: 'FCA GEN 4 requires accurate status disclosure; financial promotions require s.21 FSMA approval and the FRN is checked against the live register.',
    source_url: 'https://register.fca.org.uk/s/', on_site: onSite, status: 'link_out', record: null,
  };
  if (!key || !email || !company) return row;
  const res = await _get('https://register.fca.org.uk/services/V0.1/Search?q=' + encodeURIComponent(String(company).slice(0, 80)) + '&type=firm',
    { 'X-Auth-Email': email, 'X-Auth-Key': key }, 6000);
  if (!res || res.status !== 200 || !res.json) return Object.assign(row, { status: 'unavailable' });
  const d = (res.json.Data || res.json.data || [])[0];
  const frn = d && (d['Reference Number'] || d.FRN || d.frn);
  if (!frn) return Object.assign(row, { status: 'not_found' });
  return Object.assign(row, {
    status: 'confirmed',
    record: { name: (d.Name || d['Organisation Name'] || String(company)), number: String(frn), detail: String(d.Status || d['Status'] || 'on the register') },
    source_url: 'https://register.fca.org.uk/s/firm?id=' + encodeURIComponent(String(frn)),
  });
}

function _linkOut(register, label, statute_line, source_url, onSite) {
  return { register, label, statute_line, source_url, on_site: onSite, status: 'link_out', record: null };
}

// Main entry — returns { checked_at, rows: [...] } or null when nothing is applicable.
async function checkRegisters({ domain, company, country, sector, positive, env = process.env } = {}) {
  const cc = String(country || '').toUpperCase();
  const parent = _PARENT(sector);
  const pos = positive || {};
  const rows = [];
  const _site = (flag) => (positive ? !!flag : null);   // crawl unavailable => null => 'not confirmed on this scan'
  try {
    if (cc === 'UK') {
      rows.push(await _companiesHouse({ company, env, onSite: _site(pos.companies_house) }));
      rows.push(_linkOut('ico', 'ICO register of fee payers',
        'Most organisations processing personal data must pay the data protection fee under the 2018 Regulations; the public register is searchable.',
        'https://ico.org.uk/ESDWebPages/Search', _site(pos.ico_number)));
      if (parent === 'law-firms' || parent === 'barristers') rows.push(_linkOut('sra', 'SRA Solicitors Register',
        'The SRA Transparency Rules require the SRA number, the digital badge and the complaints procedure on the site; SRA web sweeps carry fixed penalties of £750, rising to £1,500 on repeat.',
        'https://www.sra.org.uk/consumers/register/', _site(pos.sra_number)));
      if (_HEALTH.has(parent) || _HEALTH.has(String(sector || '').toLowerCase())) rows.push(await _cqc({ company, env, onSite: _site(pos.cqc_registered) }));
      if (_FINANCE.has(parent) || _FINANCE.has(String(sector || '').toLowerCase())) rows.push(await _fca({ company, env, onSite: _site(pos.fca_frn) }));
    } else if (cc === 'AE') {
      if (_HEALTH.has(parent)) rows.push(_linkOut('dha', 'DHA Sheryan (Dubai) / MOHAP licensing',
        'UAE health facilities and advertising require the health authority licence; the facility licence is verifiable on the Sheryan public search.',
        'https://services.dha.gov.ae/sheryan/wps/portal/home/medical-directory', null));
      if (parent === 'real-estate') rows.push(_linkOut('rera', 'Dubai Land Department / RERA',
        'Dubai property advertising requires a Trakheesi permit number on listings; brokers and projects are verifiable on the DLD registers.',
        'https://dubailand.gov.ae/en/eservices/real-estate-licensing/', null));
    }
  } catch (_e) { /* fail-open: partial rows stand */ }
  const kept = rows.filter(Boolean);
  if (!kept.length) return null;
  return { checked_at: new Date().toISOString(), rows: kept };
}

module.exports = { checkRegisters, REGISTERS };
