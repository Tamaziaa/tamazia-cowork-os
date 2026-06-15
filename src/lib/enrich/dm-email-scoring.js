'use strict';
// Decision-maker email selection. Given everything enrichment found for a company (named decision-makers,
// scraped site emails, register officers, pattern-guessed addresses, generic role inboxes), pick the ONE
// email most likely to belong to the actual DECISION-MAKER (the founder's requirement) and rank the rest as
// secondary contacts (the cc/bcc set → each becomes its own Mystrika prospect downstream).
//
// Pure + deterministic. Score = role weight (who they are) × source weight (how we found it) × verification.
// Website-scraped, NAMED contacts win — that's the founder's "website scraping is the strongest signal".

// Role rank — regulatory principal / owner / managing partner at the top; generic inbox at the bottom.
const ROLE_RULES = [
  [/(\bcolp\b|\bcofa\b|compliance officer|money laundering|\bmlro\b|data protection officer|\bdpo\b|registered manager|nominated individual|responsible (individual|person))/i, 100], // regulatory principal — the person who carries the liability
  [/(owner|founder|co-?founder|proprietor|principal|managing partner|senior partner|managing director|\bmd\b|\bceo\b|chief executive)/i, 95],
  [/(\bpartner\b|director|\bcoo\b|\bcfo\b|\bcmo\b|chief)/i, 80],
  [/(general manager|practice manager|clinic director|office manager|operations manager|head of)/i, 75],
  [/(sales (director|manager)|business development|marketing (director|manager)|commercial (director|manager))/i, 70],
  [/(manager|associate|consultant|adviser|advisor|solicitor|surveyor|accountant|lawyer)/i, 55],
];
function roleWeight(title) {
  const t = String(title || '');
  if (!t) return 0;
  for (const [re, w] of ROLE_RULES) if (re.test(t)) return w;
  return 35; // a named person with an unknown title still beats a generic inbox
}

// Source rank — how trustworthy the email itself is. Website-named is the strongest signal.
const SOURCE_WEIGHTS = {
  site_named: 100,            // scraped from the firm's own site, sitting next to a name+role
  companies_house: 88,        // official register officer + the firm's email pattern
  sra_register: 90, fca_register: 90, cqc_register: 90, rics_register: 88,
  apify_leads: 86, apify_contact: 80, hunter: 80,
  site: 60,                   // scraped from the site, no name attached (often a role inbox)
  serper: 58, linkedin: 58,
  companies_house_pattern: 55, pattern: 45, register_pattern: 55,
  generic: 20,                // info@ / contact@ — last resort
};
function sourceWeight(source) { return SOURCE_WEIGHTS[String(source || '').toLowerCase()] != null ? SOURCE_WEIGHTS[String(source || '').toLowerCase()] : 30; }

// Q4 (B33/B21/B22): share the ONE canonical role/generic-inbox set (lead-quality._ROLE). The local regex stays as
// a fail-open fallback only. Without this, a generic inbox NOT in this thinner list (feedback@, reservations@,
// membership@, editorial@ …) was scored as a named contact and could be picked as the PRIMARY decision-maker.
const GENERIC_LOCAL = /^(info|contact|hello|hi|admin|sales|support|enquir(y|ies)|office|mail|team|reception|help|no-?reply|accounts|marketing|careers|jobs|hr|press|media|bookings?|appointments?)$/i;
let _isRoleLocalCanonical = null;
try { _isRoleLocalCanonical = require('./lead-quality.js').isRoleLocal; } catch (_e) {}
const isGeneric = (email) => {
  const lp0 = String(email || '').split('@')[0] || '';
  if (_isRoleLocalCanonical) { try { if (_isRoleLocalCanonical(lp0)) return true; } catch (_e) {} }
  return GENERIC_LOCAL.test(lp0) || GENERIC_LOCAL.test(lp0.replace(/[._\-+].*$/, ''));
};
const norm = (e) => String(e || '').trim().toLowerCase();

// Build a flat candidate list from the enrichment record's emails[] + decisionMakers[].
// When the same address appears from multiple sources, keep the richest info (a real name/title
// over blanks, the stronger source, verified=true over false).
function buildCandidates({ emails = [], decisionMakers = [] }) {
  const byEmail = new Map();
  const upsert = (email, f) => {
    const v = norm(email); if (!v || !/@/.test(v)) return;
    const cur = byEmail.get(v) || { email: v, name: '', title: '', source: '', verified: false, verify_status: '', generic: isGeneric(v) };
    if (!cur.name && f.name) cur.name = f.name;
    if (!cur.title && f.title) cur.title = f.title;
    if (f.source && sourceWeight(f.source) > sourceWeight(cur.source)) cur.source = f.source;
    else if (!cur.source && f.source) cur.source = f.source;
    cur.verified = cur.verified || !!f.verified;
    if (!cur.verify_status && f.verify_status) cur.verify_status = f.verify_status;
    byEmail.set(v, cur);
  };
  for (const e of emails) upsert(e.value || e.email, { name: e.name || '', title: e.position || e.title || '', source: e.source || (e.guessed ? 'pattern' : 'site'), verified: !!e.verified, verify_status: e.verify_status || '' });
  for (const d of decisionMakers) if (d.email) upsert(d.email, { name: d.name || [d.first_name, d.last_name].filter(Boolean).join(' '), title: d.title || '', source: d.source || 'pattern', verified: !!d.verified });
  return [...byEmail.values()];
}

function scoreCandidate(c) {
  const rw = c.generic ? 10 : roleWeight(c.title) || (c.name ? 35 : 15);
  const sw = sourceWeight(c.source);
  // gap-fix: the old test `/(valid|catchall|role_valid)/` matched 'invalid' as a SUBSTRING, so a KNOWN-INVALID
  // address got the 0.8 "deliverable" confidence multiplier (vs 0.55) and could outrank a real contact for
  // primary DM selection. Anchor on the whole status: deliverable-ish = valid/catchall/role_valid only; a
  // confirmed-bad status (invalid/bad/disposable/no_mx/nxdomain) is DEMOTED below the neutral 0.55.
  const _vstat = String(c.verify_status || '').trim().toLowerCase();
  const _deliverableish = /^(valid|catchall|catch[\s_-]?all|role_valid)$/.test(_vstat);
  const _confirmedBad = /^(invalid|bad|disposable|no_mx|nxdomain|invalid_syntax|undeliverable)$/.test(_vstat);
  const vf = c.verified ? 1.0 : (_deliverableish ? 0.8 : (_confirmedBad ? 0.3 : 0.55));
  // 50% who-they-are, 30% how-we-found-it, 20% deliverability. Generic inboxes are capped low by rw=10.
  const confidence = Math.round((rw * 0.5 + sw * 0.3) * vf + (c.verified ? 20 : 0) * 0.2);
  return Math.max(0, Math.min(100, confidence));
}

/**
 * selectDecisionMaker(rec) -> { primary, secondary[], all[] }
 *   primary  = { email, name, role, source, confidence, verified } — the decision-maker (best NAMED, prefer verified)
 *   secondary = the remaining emails, ranked desc (each → its own Mystrika prospect downstream)
 */
function selectDecisionMaker(rec) {
  const cands = buildCandidates(rec || {}).map(c => ({ ...c, confidence: scoreCandidate(c) }));
  if (!cands.length) return { primary: null, secondary: [], all: [] };
  // Rank by confidence (which already blends role + source + verification), verified as the tiebreaker.
  // This keeps NAMED people ahead of generic inboxes in the secondary cc/bcc set.
  cands.sort((a, b) => (b.confidence - a.confidence) || (Number(b.verified) - Number(a.verified)));
  // Primary = the best NAMED, non-generic person; prefer a verified one. Fall back to best overall.
  const named = cands.filter(c => c.name && !c.generic);
  const primaryCand = (named.find(c => c.verified) || named[0] || cands.find(c => c.verified) || cands[0]);
  const primary = primaryCand ? { email: primaryCand.email, name: primaryCand.name || '', role: primaryCand.title || '', source: primaryCand.source || '', confidence: primaryCand.confidence, verified: !!primaryCand.verified } : null;
  const secondary = cands.filter(c => !primary || c.email !== primary.email)
    .map(c => ({ email: c.email, name: c.name || '', role: c.title || '', source: c.source || '', confidence: c.confidence, verified: !!c.verified, verify_status: c.verify_status || '' }));
  return { primary, secondary, all: cands };
}

module.exports = { selectDecisionMaker, buildCandidates, scoreCandidate, roleWeight, sourceWeight, isGeneric, ROLE_RULES };
