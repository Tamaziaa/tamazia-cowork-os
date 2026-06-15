// compose-extensions.js — Phase 3 hardening of S001 compose-body.
// Covers 3.1.3 (variant tracking), 3.1.4 (regional spelling), 3.1.5 (language detect),
// 3.1.6 (title abbreviation), 3.1.7 (company name normalisation), 3.1.8 (time-of-day
// per sector), 3.1.10 (unsubscribe HMAC link).

const crypto = require('crypto');

// ─── 3.1.4 · regional spelling ────────────────────────────────────────────────
const UK_TO_US = {
  // verbs
  organise: 'organize', analyse: 'analyze', optimise: 'optimize',
  personalise: 'personalize', recognise: 'recognize', practise: 'practice',
  customise: 'customize', categorise: 'categorize', summarise: 'summarize',
  prioritise: 'prioritize', utilise: 'utilize', familiarise: 'familiarize',
  // noun forms of those verbs
  organisation: 'organization', organisations: 'organizations',
  optimisation: 'optimization', optimisations: 'optimizations',
  personalisation: 'personalization', personalisations: 'personalizations',
  recognisation: 'recognization',
  categorisation: 'categorization', summarisation: 'summarization',
  prioritisation: 'prioritization', utilisation: 'utilization',
  // -our nouns
  behaviour: 'behavior', behaviours: 'behaviors',
  colour: 'color', colours: 'colors',
  favour: 'favor', favours: 'favors', favourite: 'favorite',
  honour: 'honor', honours: 'honors',
  // -re nouns
  centre: 'center', centres: 'centers', metre: 'meter', metres: 'meters',
  theatre: 'theater', theatres: 'theaters',
  // -ce/-se distinctions
  defence: 'defense', defences: 'defenses', licence: 'license', licences: 'licenses',
  pretence: 'pretense',
  // -mme
  programme: 'program', programmes: 'programs',
};
const UK_TO_US_CAPS = Object.fromEntries(
  Object.entries(UK_TO_US).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v[0].toUpperCase() + v.slice(1)]),
);
Object.assign(UK_TO_US, UK_TO_US_CAPS);
const US_TO_UK = Object.fromEntries(Object.entries(UK_TO_US).map(([uk, us]) => [us, uk]));

function applyRegionalSpelling(text, country) {
  const c = String(country || 'UK').toUpperCase();
  const isUS = c === 'US' || c === 'USA';
  if (!text) return text;
  const map = isUS ? UK_TO_US : US_TO_UK;
  return Object.entries(map).reduce(
    (acc, [from, to]) => acc.replace(new RegExp('\\b' + from + '\\b', 'g'), to),
    text,
  );
}

// ─── 3.1.5 · language detection skip ──────────────────────────────────────────
// Rough but production-safe latin-script detector. If the reply text contains
// significant Cyrillic / Arabic / CJK / Devanagari, return non-en so the
// compose pipeline routes to the manual-review queue.
function detectLanguage(text) {
  if (!text) return 'unknown';
  const s = String(text);
  const hasCJK    = /[一-鿿぀-ヿ]/.test(s);
  const hasArab   = /[؀-ۿ]/.test(s);
  const hasCyr    = /[Ѐ-ӿ]/.test(s);
  const hasDev    = /[ऀ-ॿ]/.test(s);
  if (hasCJK)  return 'cjk';
  if (hasArab) return 'ar';
  if (hasCyr)  return 'ru';
  if (hasDev)  return 'hi';
  return 'en';
}

function shouldSkipForLanguage(text) {
  return detectLanguage(text) !== 'en';
}

// ─── 3.1.6 · title abbreviation correctness ───────────────────────────────────
// UK convention: Dr (no full stop), Mr, Mrs, Ms, Prof.
// US convention: Dr., Mr., Mrs., Ms., Prof.
function normaliseTitle(title, country) {
  if (!title) return title;
  const t = title.trim().replace(/\.$/, '');
  const c = String(country || 'UK').toUpperCase();
  const isUS = c === 'US' || c === 'USA';
  const valid = ['Dr','Mr','Mrs','Ms','Prof','Sir','Dame','Lord','Lady'];
  if (!valid.includes(t)) return title;
  return isUS && ['Dr','Mr','Mrs','Ms','Prof'].includes(t) ? `${t}.` : t;
}

// ─── 3.1.7 · company name normalisation ───────────────────────────────────────
// Strip locale-specific corporate suffixes when used inside running prose.
function normaliseCompanyName(name, country) {
  if (!name) return name;
  const c = String(country || 'UK').toUpperCase();
  let n = String(name).trim();
  // Order matters: longer suffixes first.
  const stripPatterns = [
    /\bLimited\b\.?$/i, /\bLtd\b\.?$/i, /\bPlc\b\.?$/i, /\bLLP\b\.?$/i,
    /\bInc\b\.?$/i, /\bCorp\b\.?$/i, /\bCorporation\b\.?$/i, /\bLLC\b\.?$/i,
    /\bGmbH\b\.?$/i, /\bAG\b\.?$/i, /\bS\.?A\.?\b\.?$/i, /\bS\.?L\.?\b\.?$/i,
    /\bB\.?V\.?\b\.?$/i, /\bSARL\b\.?$/i, /\bPte\b\.?\s*Ltd\.?$/i, /\bPvt\b\.?\s*Ltd\.?$/i,
    /\bSdn Bhd\b\.?$/i, /\bOyj\b\.?$/i, /\bAB\b\.?$/i,
  ];
  for (const p of stripPatterns) n = n.replace(p, '').trim().replace(/,$/, '').trim();
  // collapse double spaces
  return n.replace(/\s+/g, ' ');
}

// ─── 3.1.8 · time-of-day per sector ───────────────────────────────────────────
const SECTOR_PREFERRED_LOCAL_HOUR = {
  'hospitality':              9.0,
  'healthcare':              10.5,
  'real-estate':              9.25,
  'law-firms':                9.5,
  'finance':                  8.25,
  'retail':                  10.0,
  'e-commerce':              10.25,
  'professional-services':    9.0,
  'manufacturing':            8.5,
  'education':               10.5,
};
function preferredLocalHour(sector) {
  return SECTOR_PREFERRED_LOCAL_HOUR[String(sector || '').toLowerCase()] || 9.0;
}

// ─── 3.1.10 · unsubscribe HMAC link ───────────────────────────────────────────
// Builds a signed unsubscribe URL pinned to lead_id + email + send_id + 180-day exp.
// Uses TAMAZIA_HMAC_SECRET (already in TAMAZIA-OS/.env). 180-day TTL per MASTER 0.1.
function buildUnsubscribeUrl({ lead_id, email, send_id }) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  const exp = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
  const payload = `${lead_id || 0}|${email || ''}|${send_id || 0}|${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  const params = new URLSearchParams({
    l: String(lead_id || 0),
    e: String(email || ''),
    s: String(send_id || 0),
    x: String(exp),
    sig,
  });
  return `https://tamazia.co.uk/api/unsubscribe?${params.toString()}`;
}

function verifyUnsubscribeUrl(url) {
  const secret = process.env.TAMAZIA_HMAC_SECRET || 'NOT_CONFIGURED';
  // FAIL-CLOSED on a missing secret (see note in S025 verifySignedUrl): the 'NOT_CONFIGURED' fallback is a
  // public, in-source constant, so honouring it would let anyone forge an unsubscribe (or, since this is the
  // opt-out token, spoof opt-outs). Refuse rather than validate against a guessable key.
  if (secret === 'NOT_CONFIGURED') return { ok: false, reason: 'hmac_secret_not_configured' };
  try {
    const u = new URL(url);
    const l = u.searchParams.get('l');
    const e = u.searchParams.get('e');
    const s = u.searchParams.get('s');
    const x = u.searchParams.get('x');
    const sig = u.searchParams.get('sig') || '';
    const expected = crypto.createHmac('sha256', secret).update(`${l}|${e}|${s}|${x}`).digest('hex').slice(0, 32);
    // constant-time compare (avoid a timing side-channel); reject unequal lengths before the crypto compare.
    const _a = Buffer.from(String(sig || ''), 'utf8'); const _b = Buffer.from(String(expected || ''), 'utf8');
    const _eq = _a.length === _b.length && (() => { try { return crypto.timingSafeEqual(_a, _b); } catch (_e) { return false; } })();
    if (!_eq) return { ok: false, reason: 'sig_mismatch' };
    if (Number(x) < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
    return { ok: true, lead_id: Number(l), email: e, send_id: Number(s), exp: Number(x) };
  } catch (_e) { return { ok: false, reason: 'parse_error' }; }
}

module.exports = {
  applyRegionalSpelling,
  detectLanguage,
  shouldSkipForLanguage,
  normaliseTitle,
  normaliseCompanyName,
  preferredLocalHour,
  buildUnsubscribeUrl,
  verifyUnsubscribeUrl,
  SECTOR_PREFERRED_LOCAL_HOUR,
};
