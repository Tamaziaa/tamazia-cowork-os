'use strict';
// E-259 (v23.2) — THE ICO REGISTER OF DATA CONTROLLERS. THE FIRST BINARY, UN-ARGUABLE BREACH WE CAN PROVE.
//
// WHY THIS MATTERS MORE THAN ANOTHER REGEX:
//   Every finding we have ever made is, at bottom, an INTERPRETATION: does this text satisfy this obligation. A
//   partner can argue with an interpretation. Nobody can argue with a public register.
//
//   Under the Data Protection (Charges and Information) Regulations 2018, made under s.137 DPA 2018, a controller
//   that processes personal data must PAY A FEE AND BE ON THE ICO REGISTER. Failure is enforceable by the ICO and
//   carries a fixed monetary penalty of up to GBP 4,350 (Tier 3 fee x 150%). A law firm with a contact form, a
//   client portal and analytics cookies is unquestionably a controller.
//
//   So: firm processes personal data + firm is NOT on the register (or its registration HAS LAPSED) = a breach that
//   requires NO judgement, NO regex, and NO model. The evidence is the register row itself, or its absence, and the
//   register is published by the regulator, daily, under the Open Government Licence.
//
// THE FINDING WE COULD NOT PREVIOUSLY MAKE, and the one partners will react to hardest:
//   AN EXPIRED REGISTRATION. A firm can be "on the register" and still be in breach today because its annual fee
//   lapsed. That is invisible to a website scan and obvious from the register. `End_date_of_registration` gives it
//   to us for free.
//
// DATA: https://ico.org.uk/.../download-the-register/ — a 76 MB ZIP (272 MB CSV, 1.42M controllers) refreshed DAILY,
// Open Government Licence v3.0. The download link carries a ROTATING HASH, so it must be scraped from the page and
// never hardcoded. Mirrored into Neon (`ico_register`) by scripts/load-ico-register.js on a weekly schedule.
//
// FAIL-OPEN BY DESIGN: if the register is unavailable or the firm's name cannot be matched with confidence, we
// return `unknown` and assert NOTHING. Accusing a registered firm of not being registered would be far worse than
// staying silent, and a fuzzy name match is not evidence.

const MIN_CONFIDENT_LEN = 6;   // a name stem shorter than this matches too many controllers to be evidence

function _norm(s) {
  return String(s || '').toLowerCase()
    .replace(/\b(limited|ltd|llp|plc|the|and)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function _pg() {
  try { return require('../../skills/S008-personalisation-engine/lib/db.js').pg; } catch (_e) { /* fall through */ }
  try {
    const { execFileSync } = require('child_process');
    const path = require('path');
    const ROOT = path.resolve(__dirname, '../../..');
    return (sql) => {
      try {
        return execFileSync(path.join(ROOT, 'scripts', 'psql'),
          [process.env.NEON_URL || process.env.NEON_CONNECTION_STRING, '-tA', '-c', sql], { encoding: 'utf8' }).trim();
      } catch (_e) { return ''; }
    };
  } catch (_e) { return null; }
}

/**
 * checkRegistration({ company, domain, postcode })
 *  -> { status: 'registered' | 'expired' | 'not_registered' | 'unknown',
 *       registration_number, organisation_name, end_date, evidence, reason }
 *
 * `not_registered` is only ever returned when the firm's name is long and distinctive enough for its ABSENCE to be
 * meaningful. Otherwise: `unknown`, and we say nothing.
 */
function checkRegistration(opts) {
  const pg = _pg();
  if (!pg) return { status: 'unknown', reason: 'register_unavailable' };
  const company = String((opts && opts.company) || '').trim();
  if (!company) return { status: 'unknown', reason: 'no_company_name' };

  const stem = _norm(company);
  if (stem.length < MIN_CONFIDENT_LEN) {
    return { status: 'unknown', reason: 'company name too short to match the register safely ("' + company + '")' };
  }

  const esc = (s) => String(s).replace(/'/g, "''");
  // Exact normalised match first. Then a prefix match, which catches "Russell-Cooke LLP" vs "Russell Cooke Solicitors".
  const sql = "SELECT registration_number, organisation_name, COALESCE(end_date::text,''), COALESCE(postcode,'') "
    + "FROM ico_register WHERE name_norm = '" + esc(stem) + "' "
    + "OR name_norm LIKE '" + esc(stem) + "%' "
    + "ORDER BY (name_norm = '" + esc(stem) + "') DESC, end_date DESC NULLS LAST LIMIT 1";
  let raw = '';
  try { raw = pg(sql) || ''; } catch (_e) { return { status: 'unknown', reason: 'register_query_failed' }; }

  if (!String(raw).trim()) {
    // ABSENCE. Only meaningful if the register itself is actually loaded — otherwise every firm looks unregistered,
    // which would be a catastrophic false accusation across every audit we ship.
    let n = 0;
    try { n = Number(String(pg('SELECT count(*) FROM ico_register') || '0').trim()) || 0; } catch (_e) { n = 0; }
    if (n < 500000) return { status: 'unknown', reason: 'ico_register not loaded (' + n + ' rows) — refusing to assert absence' };
    return {
      status: 'not_registered',
      reason: 'no entry on the ICO Register of Data Controllers for "' + company + '"',
      evidence: 'Searched the ICO Register of Data Controllers (' + n.toLocaleString('en-GB') + ' controllers, published by the ICO under the Open Government Licence). No registration found for this organisation.',
      source_url: 'https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/',
    };
  }

  const [regNo, orgName, endDate] = String(raw).split('\t');
  const end = endDate ? new Date(endDate) : null;
  const expired = !!(end && !isNaN(end.getTime()) && end.getTime() < Date.now());
  return {
    status: expired ? 'expired' : 'registered',
    registration_number: regNo,
    organisation_name: orgName,
    end_date: endDate || null,
    evidence: expired
      ? ('ICO registration ' + regNo + ' for "' + orgName + '" EXPIRED on ' + endDate + '. The register is published daily by the ICO.')
      : ('ICO registration ' + regNo + ' for "' + orgName + '" is current' + (endDate ? ' to ' + endDate : '') + '.'),
    source_url: 'https://ico.org.uk/ESDWebPages/Entry/' + encodeURIComponent(regNo),
  };
}

/**
 * Turn a register check into a compliance FINDING, but only when the firm demonstrably processes personal data.
 * A brochure site with no form, no cookies and no login is not obviously a controller, and we do not guess.
 */
function registrationFinding(reg, signals) {
  if (!reg || (reg.status !== 'not_registered' && reg.status !== 'expired')) return null;
  const s = signals || {};
  const processes = !!(s.has_form || s.has_contact_form || s.trackers || s.cookies || s.has_login || s.newsletter);
  if (!processes) return null;   // we cannot show they process personal data, so we assert nothing

  const expired = reg.status === 'expired';
  return {
    status: 'miss',
    severity: 'P0',
    framework: 'UK_ICO_REGISTRATION',
    code: expired ? 'ICO_REG_EXPIRED' : 'ICO_REG_ABSENT',
    rule_type: 'must_appear',
    statutory_citation: 'Data Protection Act 2018 s.137; Data Protection (Charges and Information) Regulations 2018',
    citation_url: 'https://www.legislation.gov.uk/uksi/2018/480/made',
    description: expired
      ? 'The organisation’s registration with the Information Commissioner has expired, while the site continues to collect personal data'
      : 'The organisation collects personal data but does not appear on the ICO Register of Data Controllers',
    layman_explanation: expired
      ? 'Paying the annual data protection fee is a legal requirement for any organisation processing personal data. This firm’s registration has lapsed while its website continues to collect personal data through forms and tracking.'
      : 'Any organisation processing personal data must pay the data protection fee and appear on the ICO’s public register. This website collects personal data and no registration was found.',
    tamazia_fix_short: 'Register (or renew) with the ICO and publish the registration number in the privacy notice.',
    // THE EVIDENCE IS A PUBLIC REGISTER, NOT AN INTERPRETATION OF THE PAGE. This is the point of the whole module.
    evidence_quote: null,
    absence_evidence: { state: 'public_register_checked', requirement: reg.reason, nearest_quote: reg.evidence, pages_checked: 0 },
    evidence_url: reg.source_url,
    fine_low_gbp: 0,
    fine_high_gbp: 4350,
    enforce_typical_low_gbp: 400,
    enforce_typical_high_gbp: 4350,
    penalty_note: 'fixed monetary penalty up to £4,350 (ICO, Tier 3 fee × 150%)',
    enforcement_example: 'The ICO issues fixed monetary penalties for non-payment of the data protection fee and publishes the actions taken.',
    ico_registration: reg,
  };
}

module.exports = { checkRegistration, registrationFinding, _norm };
