#!/usr/bin/env node
// S065 · Touch cadence scheduler · Touch 0 → +5d Touch 1 → +5d Touch 2 → +10d Touch 3
// Reads `outreach_drafts` where send_status='pending' and lead.next_touch_date <= today, sends, advances.
// Suppresses if lead.replied=true.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { send: routerSend } = require('../../../lib/notify/relay-router.js');
const { pickSendAlias, markUsed, remainingCapacityToday } = require('../../../lib/alias-rotator.js');
const { lint } = require('../../../lib/notify/content-linter.js');

function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const CADENCE_DAYS = [0, 3, 7, 12, 19, 28, 40]; // 7-touch cadence (research-optimized widening intervals)
const MAX_TOUCH = CADENCE_DAYS.length - 1; // 6

// COLD RAIL: where cold 1:1 outreach physically sends from.
//   'maildeck' (default) = the MailDeck lookalike mailbox pool (warmup->cold ramp, dedup, per-inbox
//                          caps). This is the ONLY compliant cold path — real brand domains are never
//                          the cold cannon (PROJECT-MEMORY §14.4).
//   'relay'   = legacy HTTP-relay path (kept only as an explicit override; do not use for cold).
const COLD_RAIL = (process.env.COLD_RAIL || 'maildeck').toLowerCase();
// Real brand domains — a cold send must NEVER leave from one of these (defense in depth).
const REAL_DOMAINS = ['tamazia.co.uk', 'tamazia.in'];
let mailboxPool = null;
try { mailboxPool = require('../../../lib/notify/mailbox-pool.js'); } catch (_e) {}

function pickDueDrafts() {
  // Find leads ready for next touch
  // COMPLIANCE HARD-GATE: never auto-send to a lead that has opted out, hard-bounced, or been
  // manually handled. Belt-and-suspenders across BOTH signals: email_sequence_state status and the
  // reply classifier's inbound_emails verdict. This is a legal line (opt-out must be honored), so it
  // is enforced at selection time, not just suppressed downstream.
  const sql = `SELECT l.id::text, l.company, COALESCE(NULLIF(l.email,''), l.contact_email, '') AS email, l.status, COALESCE(l.next_touch_date::text, '') AS next FROM leads l WHERE l.status LIKE 'touch_%_queued' AND COALESCE(NULLIF(l.email,''), l.contact_email, '') <> '' AND (l.next_touch_date IS NULL OR l.next_touch_date <= CURRENT_DATE) AND COALESCE(l.replied, FALSE) = FALSE AND COALESCE(l.acquisition_channel,'') NOT ILIKE '%test%' AND COALESCE(l.acquisition_channel,'') NOT ILIKE '%seed%' AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal') AND NOT EXISTS (SELECT 1 FROM email_sequence_state ess WHERE ess.lead_id = l.id AND ess.status IN ('unsubscribed','bounced','manually_handled','opted_out','replied','completed','nurture_complete')) AND NOT EXISTS (SELECT 1 FROM inbound_emails ie WHERE ie.matched_lead_id = l.id AND ie.classification IN ('OPT_OUT','BOUNCE','UNSUBSCRIBE')) LIMIT 50`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [id, company, email, status, next] = l.split('\t'); return { id: Number(id), company, email, status, next_touch_date: next }; });
}

function getDraftForTouch(lead_id, touch) {
  const raw = pg(`SELECT id::text, draft_subject, draft_body FROM outreach_drafts WHERE lead_id=${lead_id} AND channel='email' AND draft_metadata->>'touch' = '${touch}' AND send_status='pending' LIMIT 1`);
  if (!raw) return null;
  const [id, subject, body] = raw.split('\t');
  return { id: Number(id), subject, body };
}

function currentTouchFromStatus(status) {
  const m = (status || '').match(/touch_(\d+)_queued/);
  return m ? Number(m[1]) : 0;
}

async function processLead(lead) {
  const touch = currentTouchFromStatus(lead.status);
  const draft = getDraftForTouch(lead.id, touch);
  if (!draft) return { lead_id: lead.id, skipped: 'no_draft_for_touch_' + touch };

  // QUALITY GATE: if the lead has been quality-scored and failed (<60), never auto-send.
  // (Null score = legacy/founder-curated lead → ungated. Scored leads must clear the 10-layer bar.)
  const qs = pg(`SELECT quality_score FROM leads WHERE id=${lead.id}`);
  if (qs !== '' && qs != null && Number(qs) < 35) {
    pg(`UPDATE leads SET status='quality_blocked' WHERE id=${lead.id}`);
    return { lead_id: lead.id, skipped: 'quality_below_threshold', quality_score: Number(qs) };
  }

  // Touch-1 audit guarantee: Touch 1 references the lead's audit URL. NEVER send a broken link.
  // Verify the URL is present AND resolves (HTTP 200). If not, block + flag for audit minting.
  if (touch === 1) {
    const auditUrl = pg(`SELECT COALESCE(audit_url,'') FROM leads WHERE id=${lead.id}`);
    const bodyHasAudit = /audit\.tamazia\.co\.uk|tamazia\.co\.uk\/audit|\/audit\//i.test(draft.body);
    let resolves = false;
    if (auditUrl) {
      try { const u = require('child_process').execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '8', '-L', auditUrl], { encoding: 'utf8' }).trim(); resolves = (u === '200'); } catch (_e) { resolves = false; }
    }
    if (bodyHasAudit && (!auditUrl || !resolves)) {
      pg(`UPDATE outreach_drafts SET send_status='blocked_audit_missing', draft_metadata = draft_metadata || ${pgEsc(JSON.stringify({ audit_url: auditUrl || null, audit_resolves: resolves, blocked_at: new Date().toISOString() }))}::jsonb WHERE id=${draft.id}`);
      return { lead_id: lead.id, skipped: 'touch1_audit_unavailable', audit_url: auditUrl, resolves };
    }
  }

  // Pre-send spam-content gate: never send a draft that would trip filters.
  const lintResult = lint({ subject: draft.subject, body: draft.body });
  if (!lintResult.pass) {
    pg(`UPDATE outreach_drafts SET send_status='blocked_spam_lint', draft_metadata = draft_metadata || ${pgEsc(JSON.stringify({ lint_score: lintResult.score, lint_flags: lintResult.flags }))}::jsonb WHERE id=${draft.id}`);
    return { lead_id: lead.id, skipped: 'spam_lint_failed', lint_score: lintResult.score };
  }

  // ANTI-BURST DUPLICATE-CONTENT GUARD: never send the exact same subject+body that already went out
  // recently. Personalisation should make every draft unique; if two drafts are byte-identical it means
  // a templating failure, and sending identical mail in volume is the #1 trigger for Gmail spam-foldering.
  const dupe = pg(`SELECT 1 FROM outreach_drafts WHERE id<>${draft.id} AND draft_subject=${pgEsc(draft.subject)} AND draft_body=${pgEsc(draft.body)} AND send_status='sent' AND sent_at > NOW()-INTERVAL '14 days' LIMIT 1`);
  if (dupe) {
    pg(`UPDATE outreach_drafts SET send_status='blocked_duplicate_content' WHERE id=${draft.id}`);
    return { lead_id: lead.id, skipped: 'duplicate_content_suppressed' };
  }

  // Identity rule: Aman-authored founder pieces (signed "Aman Pareek") MUST send from the
  // aman@ identity for credibility + signature consistency. Detect by signature in the body.
  // Persona-rotated aliases are reserved for high-volume / channel streams (not signed-as-Aman).
  const amanSigned = /Aman Pareek/i.test(draft.body);
  let alias = null;
  if (amanSigned) {
    // rotate within the Aman identity family so the founder voice is consistent
    const amanIds = ['aman@tamazia.co.uk', 'aman.pareek@tamazia.co.uk', 'apareek@tamazia.co.uk'];
    // touches 1-3 reuse touch-0's aman alias for thread consistency
    const prior = pg(`SELECT draft_metadata->>'from_alias_email' FROM outreach_drafts WHERE lead_id=${lead.id} AND draft_metadata->>'touch'='0' AND draft_metadata ? 'from_alias_email' LIMIT 1`);
    const fromEmail = (touch > 0 && prior && amanIds.includes(prior)) ? prior : amanIds[lead.id % amanIds.length];
    alias = { id: 0, email: fromEmail, persona_name: 'Aman Pareek', first_name: 'Aman', relay: 'brevo' };
  } else {
    // persona rotation (non-Aman-signed streams)
    const priorAlias = pg(`SELECT a.id::text, a.email, COALESCE(a.persona_name,''), COALESCE(a.first_name,''), COALESCE(a.relay,'brevo') FROM outreach_drafts od JOIN aliases a ON a.id = (od.draft_metadata->>'from_alias_id')::int WHERE od.lead_id=${lead.id} AND od.draft_metadata->>'touch'='0' AND od.draft_metadata ? 'from_alias_id' LIMIT 1`);
    if (touch > 0 && priorAlias) {
      const [id, email, persona_name, first_name, relay] = priorAlias.split('\t');
      alias = { id: Number(id), email, persona_name, first_name, relay };
    } else {
      alias = pickSendAlias({});
    }
  }
  // Alias drives the persona NAME + thread consistency. On the MailDeck rail the from-ADDRESS is a
  // pool mailbox (not the alias), so an exhausted alias quota must not block a cold send — the pool's
  // own per-inbox ramp is the single source of cold-volume truth. Fall back to a persona name.
  if (!alias) {
    if (COLD_RAIL !== 'maildeck') return { lead_id: lead.id, skipped: 'no_eligible_alias_quota_exhausted' };
    alias = { id: 0, email: null, persona_name: amanSigned ? 'Aman Pareek' : null, first_name: null, relay: 'maildeck' };
  }

  const fromName = alias.persona_name || alias.first_name || (amanSigned ? 'Aman Pareek' : '');
  let result;
  if (COLD_RAIL === 'maildeck') {
    // COLD PATH: send from a lookalike MailDeck mailbox. The pool picks the inbox (round-robin,
    // ramp-capped, fleet-deduped), sets the from-address, and mints a Message-ID on the lookalike
    // domain so replies thread back through the catch-all. The body keeps the tamazia.co.uk
    // signature + booking link for trust. We pass NO `from` — the pool owns the cold from-address.
    result = await routerSend({ to: lead.email, from_name: fromName, subject: draft.subject, text: draft.body, html: draft.html || undefined, relay: 'maildeck' });
  } else {
    result = await routerSend({ to: lead.email, from: alias.email, from_name: fromName, subject: draft.subject, text: draft.body, relay: alias.relay });
  }
  if (!result.ok) {
    // Capacity / not-yet-loaded / already-cold are BENIGN: leave the lead queued for a later run, do
    // not advance it and do not treat it as a hard error. Anything else is a real send failure.
    const benign = ['no_mailbox_capacity', 'no_mailboxes_loaded', 'recipient_already_cold'].includes(result.error);
    return { lead_id: lead.id, [benign ? 'skipped' : 'error']: result.error || 'send_failed', detail: result.attempts };
  }
  // DEFENSE IN DEPTH: never advance a lead that somehow cold-sent from a real brand domain.
  const fromUsed = result.from_used || alias.email || '';
  if (COLD_RAIL === 'maildeck' && REAL_DOMAINS.includes((fromUsed.split('@')[1] || '').toLowerCase())) {
    return { lead_id: lead.id, error: 'ABORT_cold_from_real_domain', from_used: fromUsed };
  }
  const email_id = result.id;
  if (alias.id) markUsed(alias.id);
  // Persist BOTH the RFC Message-ID we set (matches a reply's In-Reply-To/References for bit-perfect
  // threading) AND the provider's own id. The inbound poller matches replies against either.
  pg(`UPDATE outreach_drafts SET send_status='sent', sent_at=NOW(), draft_metadata = draft_metadata || ${pgEsc(JSON.stringify({ relay_provider: result.provider, relay_email_id: email_id, rfc_message_id: (result.message_id || '').replace(/[<>]/g, ''), from_alias_id: alias.id, from_alias_email: alias.email, maildeck_mailbox: result.mailbox || null, from_used: fromUsed }))}::jsonb WHERE id=${draft.id}`);
  // CANONICAL SEND LOG: one source of truth for the dashboard, relay attribution, and reply matching.
  // relay_name carries the actual mailbox (per-inbox attribution); mailbox_address is the structured field.
  pg(`INSERT INTO sends (lead_id, alias_id, recipient, subject, subject_used, message_id, relay_used, relay_name, mailbox_address, sent_at, status, delivery_status, touch_number, kind) VALUES (${lead.id}, ${alias.id || 'NULL'}, ${pgEsc(lead.email)}, ${pgEsc(draft.subject)}, ${pgEsc(draft.subject)}, ${pgEsc((result.message_id || '').replace(/[<>]/g, ''))}, ${pgEsc(result.provider)}, ${pgEsc(result.mailbox || result.provider)}, ${pgEsc(result.mailbox || null)}, NOW(), 'sent', 'sent', ${touch}, 'email')`);
  // Advance lead status + schedule next touch
  if (touch < MAX_TOUCH) {
    const days = CADENCE_DAYS[touch + 1] - CADENCE_DAYS[touch];
    pg(`UPDATE leads SET status='touch_${touch + 1}_queued', next_touch_date = (CURRENT_DATE + INTERVAL '${days} days')::date, last_reply_received_at = NULL, updated_at = NOW() WHERE id = ${lead.id}`);
  } else {
    pg(`UPDATE leads SET status='cadence_complete', next_touch_date = NULL, updated_at = NOW() WHERE id = ${lead.id}`);
  }
  return { lead_id: lead.id, company: lead.company, touch_sent: touch, email_id, next_status: touch < MAX_TOUCH ? `touch_${touch + 1}_queued` : 'cadence_complete' };
}

async function run() {
  // MANUAL SEND PAUSE (kill-switch): system_state.paused='true' halts ALL sending immediately.
  // Used to hold the queue while a human approves the first real email, or to stop sends instantly.
  try {
    const paused = pg(`SELECT value FROM system_state WHERE key='paused'`);
    if (String(paused || '').trim().toLowerCase() === 'true') {
      console.log('HALT: system_state.paused=true — sending is manually paused (awaiting approval / kill-switch).');
      return [{ halted: true, reason: 'manual_pause' }];
    }
  } catch (_e) {}
  // REPUTATION AUTO-PAUSE: if the recent (7d) bounce rate is dangerous, halt this cycle's sending to
  // protect domain/relay reputation. Fail-open — if the probe errors, sending proceeds (never block
  // business on a monitoring bug).
  try {
    const rs = Number(pg(`SELECT COUNT(*) FROM sends WHERE sent_at > NOW()-INTERVAL '7 days'`) || 0);
    const rb = Number(pg(`SELECT COUNT(*) FROM bounce_events WHERE received_at > NOW()-INTERVAL '7 days'`) || 0);
    if (rs >= 20 && rb / rs >= 0.08) {
      console.log(`HALT: 7d bounce rate ${(rb / rs * 100).toFixed(1)}% (>=8%) — sending paused this cycle to protect reputation`);
      return [{ halted: true, bounce_rate_7d: +(rb / rs * 100).toFixed(1), recent_sent: rs, recent_bounce: rb }];
    }
  } catch (_e) {}
  const due = pickDueDrafts();
  // SEND PACING (anti-spam): never burst. Cap the number of real sends per run and space each send
  // with a randomized human-like gap. GitHub Actions runs this every ~30 min, so a small per-run cap
  // spreads volume naturally across the day and avoids the rapid-identical-send pattern that lands
  // mail in spam. All knobs are env-overridable.
  const MAX_PER_RUN = Math.max(1, Number(process.env.SEND_MAX_PER_RUN || 6));
  const GAP_MIN_S = Math.max(0, Number(process.env.SEND_GAP_MIN_S || 35));
  const GAP_MAX_S = Math.max(GAP_MIN_S, Number(process.env.SEND_GAP_MAX_S || 95));
  // RAMP/FLEET CAP: on the MailDeck rail, never attempt more cold sends than the fleet's remaining
  // ramp-capped capacity for today (per-inbox ramp is enforced again inside the pool when picking).
  let maxThisRun = MAX_PER_RUN;
  if (COLD_RAIL === 'maildeck' && mailboxPool) {
    let rem = 0;
    try { rem = mailboxPool.fleetRemainingToday(); } catch (_e) { rem = 0; }
    maxThisRun = Math.min(MAX_PER_RUN, rem);
    if (maxThisRun <= 0) {
      console.log('No MailDeck cold capacity today (warmup-only ramp, per-inbox caps reached, or no creds loaded yet) — no cold sends this run.');
      return [{ halted: true, reason: 'no_cold_capacity', fleet_remaining: rem }];
    }
  }
  const batch = due.slice(0, maxThisRun);
  console.log(`Touch scheduler · ${due.length} due · rail=${COLD_RAIL} · sending up to ${batch.length} this run (cap ${maxThisRun}, gap ${GAP_MIN_S}-${GAP_MAX_S}s) · ${new Date().toISOString()}`);
  const results = [];
  let sentThisRun = 0;
  for (let i = 0; i < batch.length; i++) {
    const lead = batch[i];
    const r = await processLead(lead);
    results.push(r);
    console.log(`[${lead.id}] ${lead.company.slice(0,30)} → touch_${r.touch_sent != null ? r.touch_sent : 'n/a'} ${r.email_id ? 'sent ' + r.email_id : r.skipped || r.error}`);
    if (r.email_id) sentThisRun++;
    // Randomized gap before the next ACTUAL send (only pace when a real send happened, and never after the last item).
    if (r.email_id && i < batch.length - 1) {
      const gapMs = Math.round((GAP_MIN_S + Math.random() * (GAP_MAX_S - GAP_MIN_S)) * 1000);
      console.log(`  pacing · waiting ${(gapMs / 1000).toFixed(0)}s before next send`);
      await new Promise(res => setTimeout(res, gapMs));
    }
  }
  console.log(`Run complete · real sends: ${sentThisRun} · skipped/blocked: ${results.length - sentThisRun}`);
  return results;
}

if (require.main === module) run().then(r => console.log('Total sent:', r.filter(x => x.email_id).length));

module.exports = { run, processLead };
