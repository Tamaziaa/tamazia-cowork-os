'use strict';
// E-256 (v23.1) — THE CANDIDATE VERIFIER. A DISCOVERED LAW MUST BE PROVED TO EXIST BEFORE IT CAN BIND ANYONE.
//
// WHAT I FOUND, and it is the most dangerous thing in the engine:
//   `framework_candidates` holds 151 laws "discovered" by the self-learning loop. They were never promoted, which
//   is the only reason we have not shipped a fabricated statute to a law firm. Because a large share of them ARE
//   FABRICATED, and they carry FABRICATED CITATIONS:
//
//     * "Cookies (Information, Consent and Related Obligations) Regulations 2020"  — THIS LAW DOES NOT EXIST.
//       The UK cookie law is PECR 2003 (as amended). The model invented a plausible-sounding statutory instrument
//       AND invented THREE DIFFERENT legislation.gov.uk URLs for it (uksi/2020/1370, /1400, /1404), one per sector.
//       Three different citations for the same non-existent law is a hallucination fingerprint.
//     * "Disability Discrimination Act 1995" — repealed in Great Britain and replaced by the Equality Act 2010.
//       Citing it against a modern firm is not merely unhelpful, it is WRONG LAW.
//     * "Telecommunications (Security) Act 2021" attached to a HOSPITALITY site — it binds telecoms providers.
//
//   E-229 added an "official-URL resolution gate", but it only checked that a URL STRING WAS PRESENT. It never
//   FETCHED it. A model that will invent a statute will happily invent the URL that proves it.
//
// THE RULE THIS ENFORCES:
//   A discovered law may be promoted ONLY IF its official URL RESOLVES (HTTP 200) on an OFFICIAL legislative
//   domain, AND the page it returns actually IS that law (its title/body carries the law's distinctive terms).
//   Anything else is quarantined as `rejected_unverifiable` with the reason recorded, and can never attach.
//
// This is a fail-CLOSED gate by design. A law we cannot prove exists must never appear in a legal claim we send to
// a solicitor. Silence is free; a fabricated statute costs the whole company its credibility.

const OFFICIAL_HOSTS = [
  /(^|\.)legislation\.gov\.uk$/i,          // UK primary + secondary legislation (authoritative)
  /(^|\.)eur-lex\.europa\.eu$/i,           // EU Official Journal
  /(^|\.)ecfr\.gov$/i, /(^|\.)govinfo\.gov$/i, /(^|\.)congress\.gov$/i, /(^|\.)ftc\.gov$/i,
  /(^|\.)ico\.org\.uk$/i, /(^|\.)sra\.org\.uk$/i, /(^|\.)cqc\.org\.uk$/i, /(^|\.)fca\.org\.uk$/i,
  /(^|\.)gov\.uk$/i, /(^|\.)europa\.eu$/i, /(^|\.)asa\.org\.uk$/i, /(^|\.)cap\.org\.uk$/i,
  /(^|\.)legalombudsman\.org\.uk$/i, /(^|\.)barstandardsboard\.org\.uk$/i,
  /(^|\.)gmc-uk\.org$/i, /(^|\.)gdc-uk\.org$/i, /(^|\.)mhra\.gov\.uk$/i,
  /(^|\.)difc\.ae$/i, /(^|\.)adgm\.com$/i, /(^|\.)sdaia\.gov\.sa$/i, /(^|\.)gesetze-im-internet\.de$/i,
  /(^|\.)legifrance\.gouv\.fr$/i,
];

// A repealed statute is WRONG LAW. Citing it is worse than citing nothing.
const REPEALED = [
  { rx: /disability discrimination act 1995/i, why: 'repealed in Great Britain and replaced by the Equality Act 2010' },
  { rx: /data protection act 1998/i, why: 'repealed and replaced by the Data Protection Act 2018 / UK GDPR' },
  { rx: /distance selling regulations 2000/i, why: 'revoked by the Consumer Contracts Regulations 2013' },
  { rx: /race relations act 1976|sex discrimination act 1975/i, why: 'consolidated into the Equality Act 2010' },
];

function _hostOf(u) { try { return new URL(String(u)).hostname; } catch (_e) { return ''; } }
function _officialHost(u) { const h = _hostOf(u); return !!h && OFFICIAL_HOSTS.some((rx) => rx.test(h)); }

// distinctive terms from a law's name: words a real page for that law would almost certainly contain
function _terms(name) {
  const stop = new Set(['the', 'and', 'of', 'for', 'act', 'law', 'regulation', 'regulations', 'directive', 'rules', 'code', 'no', 'eu', 'uk', 'us']);
  return String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w)).slice(0, 5);
}

// legislation.gov.uk generates pages ON DEMAND and answers HTTP 202 WITH AN EMPTY BODY while it does so. You must
// poll. This bit us hard: a single fetch returned 202/0 bytes for the REAL Equality Act 2010 AND for a fabricated
// SI number, which made them indistinguishable and produced FALSE ACCUSATIONS of fabrication against real statutes.
// It also throttles datacentre IPs, so from a CI runner a 202 may never clear. A 202 therefore means UNKNOWN, and
// UNKNOWN is not the same as FABRICATED. We refuse to promote either, but we only ACCUSE on real evidence.
async function _fetchText(url, timeoutMs, polls) {
  const max = Math.max(1, Number(polls || 4));
  let last = 0;
  for (let i = 0; i < max; i++) {
    try {
      const r = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'TamaziaComplianceBot/1.0 (+https://tamazia.co.uk)' },
        signal: AbortSignal.timeout(timeoutMs || 12000),
      });
      last = r.status;
      if (r.status === 202) { await new Promise((res) => setTimeout(res, 2500 + i * 2500)); continue; }  // generating
      if (!r.ok) return { ok: false, status: r.status, definitive: r.status === 404 || r.status === 410 };
      const t = (await r.text()).slice(0, 120000);
      return { ok: true, status: r.status, text: t, finalHost: _hostOf(r.url || url) };
    } catch (e) { last = 0; return { ok: false, status: 0, err: String((e && e.name) || e), definitive: false }; }
  }
  return { ok: false, status: last, pending: true };   // still 202 after every poll: UNKNOWN, never "fabricated"
}

/**
 * Verify ONE candidate. Returns { verdict, reason }.
 *   verdict: 'verified' | 'rejected'
 * FAIL CLOSED: anything we cannot prove is rejected.
 */
async function verifyCandidate(c, opts) {
  const name = String((c && c.name) || '').trim();
  const url = String((c && c.official_url) || '').trim();
  if (!name) return { verdict: 'rejected', reason: 'no name' };

  for (const r of REPEALED) {
    if (r.rx.test(name)) return { verdict: 'rejected', reason: 'REPEALED LAW: ' + r.why };
  }
  if (!url) return { verdict: 'rejected', reason: 'no official_url — a law we cannot cite is a law we cannot send' };
  if (!/^https?:\/\//i.test(url)) return { verdict: 'rejected', reason: 'official_url is not a URL' };
  if (!_officialHost(url)) return { verdict: 'rejected', reason: 'official_url is not on an official legislative domain (' + (_hostOf(url) || '?') + ')' };

  const r = await _fetchText(url, (opts && opts.timeoutMs) || 12000, (opts && opts.polls) || 4);
  // THREE STATES, and the distinction matters enormously.
  //  * pending / network error  -> UNVERIFIABLE. We cannot prove it, so we do NOT promote it. But we do NOT call a
  //                                real statute fabricated because a government server throttled us.
  //  * 404 / 410                -> FABRICATED. The citation points at a law that does not exist.
  //  * 200 + wrong content      -> FABRICATED. The page is not this law.
  if (r.pending) return { verdict: 'unverifiable', reason: 'official_url still returns HTTP 202 (page is generated on demand / the host is throttling us). Cannot prove it exists, and will not accuse it of not existing.' };
  if (!r.ok && r.definitive) return { verdict: 'rejected', reason: 'official_url returns HTTP ' + r.status + ' — THE CITATION IS FABRICATED, this law does not exist at the URL the model produced' };
  if (!r.ok) return { verdict: 'unverifiable', reason: 'official_url could not be fetched (' + (r.err || ('http ' + r.status)) + ')' };
  if (!_officialHost('https://' + (r.finalHost || ''))) return { verdict: 'rejected', reason: 'redirected off the official domain to ' + r.finalHost };

  // The page must actually BE this law. A 200 from legislation.gov.uk proves a page exists, not that it is the law
  // the model named: legislation.gov.uk serves a "page not found" style body at many invented SI numbers.
  const body = r.text.toLowerCase();
  if (/page (cannot be found|not found)|no results found|does not exist/i.test(body.slice(0, 4000))) {
    return { verdict: 'rejected', reason: 'official_url returns a NOT-FOUND page — the citation is fabricated' };
  }
  // an empty/near-empty body proves nothing either way
  if (body.replace(/\s+/g, '').length < 400) return { verdict: 'unverifiable', reason: 'official_url returned an empty body; cannot confirm or deny' };
  const terms = _terms(name);
  const hit = terms.filter((t) => body.includes(t)).length;
  if (terms.length && hit < Math.max(1, Math.ceil(terms.length / 2))) {
    return { verdict: 'rejected', reason: 'the page at official_url is NOT this law (matched only ' + hit + '/' + terms.length + ' distinctive terms: ' + terms.join(', ') + ')' };
  }
  return { verdict: 'verified', reason: 'resolves on ' + r.finalHost + ' and the page carries ' + hit + '/' + terms.length + ' distinctive terms' };
}

module.exports = { verifyCandidate, _officialHost, _terms, OFFICIAL_HOSTS, REPEALED };
