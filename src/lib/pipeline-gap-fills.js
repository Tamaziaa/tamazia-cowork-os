// Phase 6.7 · pipeline-gap-fills.js
// Code for the 50 gaps from the cold-email review. Pure functions, no side effects unless noted.
//
// Exports:
//   suppressionCheck(email, domain)            -> { suppressed: bool, reason?, expires_at? }
//   normaliseFirstName(s)                      -> Priya/PRIYA/priya → "Priya"
//   normaliseFirmName(s)                       -> "Monzo Bank Ltd" → display + legal forms
//   normaliseCity(rawCity, jurisdiction)       -> "London" with fallback to country name
//   fixDomainTypo(domain)                      -> "monzo.co" → "monzo.com"
//   classifyInboundReply(subject, body, from)  -> 14-category S012 classifier extended
//   isOOO(subject, body)                       -> true if out-of-office
//   isBounce(subject, body, from)              -> true if bounce notification
//   isStopKeyword(body)                        -> true if STOP / UNSUBSCRIBE / REMOVE
//   isBusinessDay(date)                        -> respects UK bank holidays
//   nextBusinessDays(date, n)                  -> add n business days skipping holidays
//   sendWindowOk(date, tz)                     -> within 08:00-11:00 local
//   selectAlias(opts)                          -> picks the alias for this send
//   computeMessageId(domain, leadId, touch)    -> RFC-5322 Message-ID for threading
//   computeInReplyTo(threadRoot)               -> for follow-up threading
//   trackSend(opts)                            -> writes to sends + email_sequence_state + lia_register

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function esc(v) { if (v === null || v === undefined) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

// ============================================================================
// GAP 6 + 27 · suppression check (STOP keyword + spam complaint + opt-out)
// ============================================================================
function suppressionCheck(email, domain) {
  if (!email && !domain) return { suppressed: false };
  const e = String(email || '').toLowerCase();
  const d = String(domain || '').toLowerCase();
  const sql = `SELECT email, domain, reason, expires_at FROM suppression
    WHERE (email = ${esc(e)} OR domain = ${esc(d)})
    AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1`;
  const raw = pg(sql);
  if (!raw) return { suppressed: false };
  const [email_, domain_, reason, expires_at] = raw.split('\t');
  return { suppressed: true, email: email_, domain: domain_, reason, expires_at };
}

// ============================================================================
// GAP 22 + 23 · normalisation
// ============================================================================
function normaliseFirstName(s) {
  s = String(s || '').trim();
  if (!s) return 'team';
  // Strip honorifics
  s = s.replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i, '');
  // Title case first word only
  const first = s.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
function normaliseFirmName(s) {
  const full = String(s || '').trim();
  if (!full) return { display: 'your firm', legal: 'your firm' };
  // For body / subject: strip legal suffix
  const display = full.replace(/\b(Limited|Ltd\.?|LLP|PLC|Plc|Inc\.?|Incorporated|Co\.?|Corporation|Pvt\.?|Private Limited)\b/gi, '').replace(/\s+,?\s*$/, '').trim();
  return { display: display || full, legal: full };
}
function normaliseCity(rawCity, jurisdiction) {
  const c = String(rawCity || '').trim();
  if (c) return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  // Fallback to country
  const map = { 'UK': 'the UK', 'GB': 'the UK', 'GBR': 'the UK', 'US': 'the US', 'USA': 'the US', 'AE': 'the UAE', 'UAE': 'the UAE' };
  return map[String(jurisdiction || '').toUpperCase()] || 'the UK';
}

// ============================================================================
// GAP 50 · domain typo autocorrect
// ============================================================================
function fixDomainTypo(domain) {
  if (!domain) return domain;
  const d = String(domain).toLowerCase().trim();
  const raw = pg(`SELECT corrected FROM domain_typo_map WHERE typo = ${esc(d)}`);
  return raw || d;
}

// ============================================================================
// GAP 14 · OOO detector
// ============================================================================
function isOOO(subject, body) {
  const s = `${subject || ''} ${body || ''}`.toLowerCase();
  const patterns = [
    /\bout of office\b/, /\boutofoffice\b/, /\bautomatic reply\b/, /\bauto.?reply\b/,
    /\bautoresponder\b/, /\bvacation\b/, /\bannual leave\b/, /\bon leave\b/,
    /\bi am away\b/, /\bi'm away\b/, /\bi will be (out|away)\b/, /\bmaternity leave\b/,
    /\bparental leave\b/, /\bback in the office\b/, /\bback on\b.*\b(monday|tuesday|wednesday|thursday|friday)\b/
  ];
  return patterns.some(p => p.test(s));
}

// ============================================================================
// GAP 5 + 7 · bounce detector
// ============================================================================
function isBounce(subject, body, from) {
  const subj = String(subject || '').toLowerCase();
  const sender = String(from || '').toLowerCase();
  if (/mailer-daemon|mailerdaemon|postmaster|bounces?@|delivery-status|undeliverable|noreply-bounce/.test(sender)) return true;
  if (/delivery (status|failed|failure)|undeliverable|undelivered|mail delivery|message not delivered|message wasn.{1,3}t delivered/.test(subj)) return true;
  if (/Diagnostic-Code:|Final-Recipient:|Status:\s*[45]\.\d\.\d/.test(body || '')) return true;
  return false;
}

// ============================================================================
// GAP 6 · STOP keyword detector
// ============================================================================
function isStopKeyword(body) {
  const lower = String(body || '').toLowerCase();
  return /^(stop|unsubscribe|remove|optout|opt[ -]?out|no thanks|never contact|do not contact|do not email)$/m.test(lower)
    || /\b(please\s+)?(stop|unsubscribe|remove me|opt me out|don.{1,3}t contact|do not contact)\b/.test(lower);
}

// ============================================================================
// GAP 33 + 34 · business day calculator with UK bank holidays
// ============================================================================
function loadHolidays() {
  const raw = pg(`SELECT holiday_date::text FROM uk_holidays WHERE holiday_date >= CURRENT_DATE`);
  if (!raw) return new Set();
  return new Set(raw.split('\n').filter(Boolean));
}
function isBusinessDay(date, holidays) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (holidays && holidays.has(date.toISOString().slice(0, 10))) return false;
  return true;
}
function nextBusinessDays(start, n) {
  const holidays = loadHolidays();
  const result = new Date(start.getTime());
  let added = 0;
  while (added < n) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isBusinessDay(result, holidays)) added++;
  }
  // Snap to 09:00 UTC
  result.setUTCHours(9, 0, 0, 0);
  return result;
}
function sendWindowOk(date, tz) {
  // Default Europe/London business window 08:00-11:00 local. Hot UK fallback.
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz || 'Europe/London' });
  const hour = Number(fmt.format(date));
  return hour >= 8 && hour <= 11;
}

// ============================================================================
// GAP 8 + 9 · alias selection
// Rules:
//  - cold_eligible / cold phase only for unsolicited
//  - lowest sent_today first (fairness)
//  - bounce_count_7d < 3 (reputation)
//  - relay rotation across the 6 SMTP relays (Resend / SMTP2GO / MailerSend / Mailjet / SendGrid / Brevo)
//  - sticky-by-lead: if a lead has been touched before, reuse the same alias to keep threading
// ============================================================================
function selectAlias({ lead_id, allow_relays }) {
  // Check if this lead already has an alias bound
  if (lead_id) {
    const existing = pg(`SELECT last_alias_id FROM email_sequence_state WHERE lead_id=${Number(lead_id)} AND last_alias_id IS NOT NULL`);
    if (existing) {
      const a = pg(`SELECT id, email, persona_name, first_name, relay FROM aliases WHERE id=${existing} AND COALESCE(bounce_count_7d,0) < 3 AND COALESCE(sent_today,0) < COALESCE(day_quota,2)`);
      if (a) {
        const [id, email, persona_name, first_name, relay] = a.split('\t');
        return { id: Number(id), email, persona_name, first_name, relay, reused: true };
      }
    }
  }
  // Fresh selection
  let where = `WHERE warmup_phase IN ('cold','cold_eligible') AND COALESCE(bounce_count_7d,0) < 3 AND COALESCE(sent_today,0) < COALESCE(day_quota,2)`;
  if (allow_relays && allow_relays.length) {
    where += ` AND relay IN (${allow_relays.map(r => `'${r.replace(/'/g, "''")}'`).join(',')})`;
  }
  const raw = pg(`SELECT id, email, persona_name, first_name, relay FROM aliases ${where} ORDER BY COALESCE(sent_today,0) ASC, COALESCE(bounce_count_7d,0) ASC, id ASC LIMIT 1`);
  if (!raw) return null;
  const [id, email, persona_name, first_name, relay] = raw.split('\t');
  return { id: Number(id), email, persona_name, first_name, relay, reused: false };
}

// ============================================================================
// GAP 8 + 31 · Message-ID + In-Reply-To for threading
// ============================================================================
function computeMessageId(sendDomain, leadId, touch) {
  const hash = crypto.randomBytes(8).toString('hex');
  return `<${leadId}.t${touch}.${Date.now()}.${hash}@${sendDomain || 'tamazia.co.uk'}>`;
}
function computeInReplyTo(threadRootMessageId) { return threadRootMessageId || null; }

// ============================================================================
// GAP 13 · LIA register write per send
// ============================================================================
function writeLiaEntry({ lead_id, send_id, sector }) {
  const purpose = 'B2B outreach offering a featured editorial mention on tamazia.co.uk and a complimentary Compliance and SEO audit to professionally relevant decision-makers.';
  const necessity = 'Direct contact is the most efficient route to reach the decision-maker at a regulated firm in the sector listed; no equally effective alternative exists at this scale.';
  const balancing = 'Recipient is a corporate subscriber under UK PECR; recipient interest in receiving sector-relevant editorial and compliance information is presumed; opt-out provided via reply STOP and List-Unsubscribe header (RFC 8058); all data minimised; no special-category data processed.';
  const minimisation = 'Only business contact data (name, role, business email, registered firm details, public regulatory citations) processed. No personal special-category data.';
  pg(`INSERT INTO lia_register (workspace_id, lead_id, send_id, purpose, necessity, balancing_test, data_minimisation, retention_period, lia_signed_by) VALUES (1, ${lead_id || 'NULL'}, ${send_id || 'NULL'}, ${esc(purpose)}, ${esc(necessity)}, ${esc(balancing)}, ${esc(minimisation)}, '180 days', 'Aman Pareek')`);
}

// ============================================================================
// GAP 19 · audit quality gate
// ============================================================================
function auditQualityOk(lead_id, floor) {
  const raw = pg(`SELECT specificity_score FROM personalisation_scans WHERE lead_id=${Number(lead_id)} AND status='ok' ORDER BY id DESC LIMIT 1`);
  if (!raw) return { ok: false, reason: 'no_scan' };
  const score = Number(raw);
  return { ok: score >= (floor || 0.70), score, floor: floor || 0.70 };
}

// ============================================================================
// GAP 18 · subject domain dedup
// ============================================================================
function subjectAlreadySent({ domain, touch, subject }) {
  const hash = crypto.createHash('sha1').update(String(subject || '').toLowerCase().trim()).digest('hex').slice(0, 32);
  const raw = pg(`SELECT 1 FROM subject_domain_dedupe WHERE domain=${esc(domain)} AND touch=${Number(touch)} AND subject_hash=${esc(hash)}`);
  return !!raw;
}
function recordSubject({ domain, touch, subject }) {
  const hash = crypto.createHash('sha1').update(String(subject || '').toLowerCase().trim()).digest('hex').slice(0, 32);
  // Pre-existing table also requires recipient_domain + subject_normalised; we fill both for compatibility.
  pg(`INSERT INTO subject_domain_dedupe (domain, touch, subject_hash, recipient_domain, subject_normalised) VALUES (${esc(domain)}, ${Number(touch)}, ${esc(hash)}, ${esc(domain)}, ${esc(String(subject || '').toLowerCase().trim())}) ON CONFLICT (domain, touch) DO UPDATE SET subject_hash = EXCLUDED.subject_hash, recorded_at = NOW()`);
}

// ============================================================================
// GAP 11 · lead state machine
// ============================================================================
const VALID_TRANSITIONS = {
  pending: ['queued', 'manually_handled', 'suppressed'],
  queued: ['t0_sent', 'suppressed', 'manually_handled', 'bounced'],
  t0_sent: ['t1_due', 'replied', 'bounced', 'unsubscribed', 'manually_handled'],
  t1_due: ['t1_sent', 'replied', 'manually_handled', 'unsubscribed'],
  t1_sent: ['t2_due', 'replied', 'bounced', 'unsubscribed', 'manually_handled'],
  t2_due: ['t2_sent', 'replied', 'manually_handled', 'unsubscribed'],
  t2_sent: ['t3_due', 'replied', 'bounced', 'unsubscribed', 'manually_handled'],
  t3_due: ['t3_sent', 'replied', 'manually_handled', 'unsubscribed'],
  t3_sent: ['closed', 'replied'],
  closed: [],
  replied: [],
  unsubscribed: [],
  bounced: [],
  manually_handled: [],
  suppressed: []
};
function transitionLeadState({ lead_id, from, to, reason, alias_id }) {
  if (!VALID_TRANSITIONS[from] || !VALID_TRANSITIONS[from].includes(to)) {
    return { ok: false, error: `invalid_transition_${from}_to_${to}` };
  }
  const entry = JSON.stringify({ from, to, at: new Date().toISOString(), reason: reason || null });
  pg(`UPDATE email_sequence_state SET status=${esc(to)}, state_history = state_history || ${esc(entry)}::jsonb${alias_id ? `, last_alias_id=${alias_id}` : ''}, updated_at=NOW() WHERE lead_id=${Number(lead_id)}`);
  return { ok: true, from, to };
}

module.exports = {
  suppressionCheck, normaliseFirstName, normaliseFirmName, normaliseCity,
  fixDomainTypo, classifyInboundReply, isOOO, isBounce, isStopKeyword,
  isBusinessDay, nextBusinessDays, sendWindowOk, selectAlias,
  computeMessageId, computeInReplyTo, writeLiaEntry, auditQualityOk,
  subjectAlreadySent, recordSubject, transitionLeadState, VALID_TRANSITIONS
};

// ============================================================================
// GAP 2 + 14 + 15 + 39 · extended S012 inbound reply classifier
// 14 categories: HOT_BOOK, HOT_PRICE, HOT_AGENCY_COMPARE, NEEDS_INFO,
//   NEEDS_AUDIT, OBJECTION_BUDGET, OBJECTION_TIMING, OBJECTION_INCUMBENT,
//   WARM_TIMING, WRONG_PERSON, OOO, OPT_OUT, HOSTILE, OTHER
// ============================================================================
function classifyInboundReply(subject, body, from) {
  const text = `${subject || ''}\n${body || ''}`.toLowerCase();
  // HOSTILE outranks OPT_OUT — "stop emailing me, this is harassment" needs the legal flag, not a quiet unsubscribe.
  if (/\b(harass(ment)?|harassed|legal action|report.{1,10}(spam|ico|ftc)|sue you|cease and desist|abusive|threaten(ing)?|defamation)\b/.test(text)) return { category: 'HOSTILE', confidence: 0.95 };
  if (isBounce(subject, body, from)) return { category: 'BOUNCE', confidence: 0.95 };
  if (isOOO(subject, body)) return { category: 'OOO', confidence: 0.95 };
  if (isStopKeyword(body)) return { category: 'OPT_OUT', confidence: 0.99 };

  const rules = [
    // NEEDS_AUDIT must outrank HOT_BOOK when both match (explicit "send the audit" is a clearer signal than generic "happy to be featured")
    { cat: 'NEEDS_AUDIT',       re: /\b(send (it|the audit|over)|share the audit|where('s| is) the audit|can you send the audit|please send|attach the audit|send.{0,15}(the )?audit)\b/, c: 0.94 },
    { cat: 'HOT_BOOK',          re: /\b(yes|happy|sure|sounds (good|great))\b.*\b(featured|feature|coordinate|interested|let's chat|book|call|meeting|calendar|cal\.com)\b/, c: 0.92 },
    { cat: 'HOT_BOOK',          re: /\b(book a (call|meeting|slot)|put time on|grab time|schedule)\b/, c: 0.92 },
    { cat: 'HOT_AGENCY_COMPARE',re: /\b(compare|comparison|side[- ]?by[- ]?side|our (current )?agency)\b/, c: 0.88 },
    { cat: 'HOT_PRICE',         re: /\b(how much|what.{0,5} (the )?cost|pricing|investment|retainer|engagement fee)\b/, c: 0.88 },
    { cat: 'OBJECTION_INCUMBENT', re: /\b(we (already )?have\b[^.]{0,40}\bagency|we work with[^.]{0,40}\bagency|our (current )?agency|in[- ]?house team|we already use|incumbent (agency|partner))\b/i, c: 0.85 },
    { cat: 'OBJECTION_BUDGET',  re: /\b(no budget|not the right time|q[1-4] budget|next (year|quarter)|fiscal|frozen budget)\b/, c: 0.85 },
    { cat: 'OBJECTION_TIMING',  re: /\b(not (now|right now)|wrong time|too busy|maybe later|revisit|circle back)\b/, c: 0.85 },
    { cat: 'WARM_TIMING',       re: /\b(check back|q[1-4] 202[6-9]|next (month|quarter|year)|after the (launch|raise|round))\b/, c: 0.80 },
    { cat: 'NEEDS_INFO',        re: /\b(more (info|details)|can you (tell|share|explain)|what does the audit cover|what['s ]+ included)\b/, c: 0.82 },
    { cat: 'WRONG_PERSON',      re: /\b(wrong person|not (my|the right) (area|person|remit)|forward(ed|ing)? this to|copy in|right (point of )?contact)\b/, c: 0.88 },
    { cat: 'HOSTILE',           re: /\b(stop emailing|harass|legal action|report.{1,10}(spam|ico|ftc)|abusive|unprofessional|cease)\b/, c: 0.95 }
  ];
  for (const r of rules) { if (r.re.test(text)) return { category: r.cat, confidence: r.c }; }
  return { category: 'OTHER', confidence: 0.4 };
}
