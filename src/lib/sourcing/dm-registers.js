'use strict';
// Regulator-register decision-maker NAMES (the near-free backbone). Dispatches to the right register by
// sector and merges the named role-holders who carry the regulatory liability. Names → the firm's email
// pattern (in enrich.js) → the decision-maker's address. Every fetcher is best-effort + graceful ([]).
//   law-firms  -> SRA "Find a Solicitor"        (sra-register.js, opt-in SRA_REGISTER=1)
//   healthcare -> CQC public API                (cqc-register.js, CQC_API_KEY)
//   financial  -> FCA Register API              (fca-register.js, FCA_API_EMAIL + FCA_API_KEY)
//   (all)      -> Companies House officers       (companies-house.js — already the guaranteed-free backbone)
const { sraOfficers } = require('./sra-register.js');
const { cqcOfficers } = require('./cqc-register.js');
const { fcaOfficers } = require('./fca-register.js');

const SECTOR_FETCHERS = {
  'law-firms': [sraOfficers],
  'legal': [sraOfficers],
  'healthcare': [cqcOfficers],
  'financial': [fcaOfficers],
  'finance': [fcaOfficers],
  'financial-services': [fcaOfficers],
};

// findRegulatedOfficers — returns a deduped [{name, role, source}] of register-named decision-makers.
async function findRegulatedOfficers({ company, domain, sector, env = process.env } = {}) {
  const fns = SECTOR_FETCHERS[String(sector || '').toLowerCase()] || [];
  if (!fns.length) return [];
  const results = await Promise.all(fns.map(fn => fn({ company, domain, env }).catch(() => [])));
  const out = []; const seen = new Set();
  for (const arr of results) for (const o of (arr || [])) {
    const k = (o.name || '').toLowerCase().trim();
    if (o.name && /\s/.test(o.name) && !seen.has(k)) { seen.add(k); out.push(o); }
  }
  return out;
}
module.exports = { findRegulatedOfficers, sraOfficers, cqcOfficers, fcaOfficers };
