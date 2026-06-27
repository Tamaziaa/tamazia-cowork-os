#!/usr/bin/env node
// S065 · Touch cadence scheduler · Touch 0 → +3d T1 → +7d T2 → +11d T3 (breakup) → cadence_complete
// Reads `outreach_drafts` where send_status='pending' and lead.next_touch_date <= today, sends, advances.
// Suppresses if lead.replied=true.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// P8 [X22/X23/X24/B5] CANONICAL Art-14 FOOTER. Both send paths inject the same compliant footer (provenance +
// visible unsubscribe + {{privacy_notice_url}} + ICO/company/address placeholders). Source of truth =
// src/templates/email/footer.txt (campaigns/_footer.txt is byte-identical). We take the live block ABOVE the
// '----' doc separator, drop its leading bare-name line (the signature name is the __SIGNATURE__ token), fill the
// privacy-notice + unsubscribe URLs, and LEAVE the founder-blocked {{...}} placeholders (company/ICO/address) so
// nothing fabricated ships. EU rep line is empty for UK/UAE. Cached. Fail-soft: missing file -> no footer (never
// blocks a send). The List-Unsubscribe headers are set separately by relay-router.js.
const PRIVACY_NOTICE_URL = 'https://tamazia.co.uk/legal/cold-outreach-privacy-notice/';
let _footerCache = null;
function complianceFooter({ to, from } = {}) {
  if (_footerCache == null) {
    try {
      const raw = fs.readFileSync(path.join(ROOT, 'src', 'templates', 'email', 'footer.txt'), 'utf8');
      const live = raw.split(/^-{10,}\s*$/m)[0].replace(/\s+$/, '');   // content above the doc separator
      const lines = live.split('\n');
      // drop the leading bare-name line (first non-empty line) — that name is the per-send signature token.
      let i = 0; while (i < lines.length && lines[i].trim() === '') i++; if (i < lines.length) lines.splice(i, 1);
      _footerCache = lines.join('\n').replace(/^\n+/, '');
    } catch (_e) { _footerCache = ''; }
  }
  if (!_footerCache) return '';
  const unsubEndpoint = process.env.UNSUB_ENDPOINT || '';
  const unsubUrl = (unsubEndpoint && to) ? `${unsubEndpoint}?e=${encodeURIComponent(to)}${from ? '&f=' + encodeURIComponent(from) : ''}` : '';
  return _footerCache
    .replace(/\{\{\s*privacy_notice_url\s*\}\}/g, PRIVACY_NOTICE_URL)
    // visible unsubscribe: signed endpoint link when configured, else the reply-"unsubscribe" instruction the
    // footer already states stands alone (never leave an unfilled brace on the wire).
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsubUrl || 'reply "unsubscribe"')
    .replace(/\{\{\s*eu_rep_line\s*\}\}\n?/g, '');   // UK/UAE: no EU Art-27 rep line
}
const { send: routerSend } = require('../../../lib/notify/relay-router.js');
const { pickSendAlias, markUsed, remainingCapacityToday } = require('../../../lib/alias-rotator.js');
const { lint } = require('../../../lib/notify/content-linter.js');
const { verifyAuditUrl } = require('../../../lib/audit/verify-audit-url.js');
let _tg = null; try { _tg = require('../../../lib/notify/telegram.js'); } catch (_) {}

function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

// D1 (founder-locked): EXACTLY 4 touches (0-3) at days [0,3,10,21] from Touch 0, then recycle. This REVERTS the
// 5th touch wrongly added by #50 (CADENCE_DAYS was [0,3,7,12,19], LAST_TOUCH 4). The gaps are touch0->1 = 3d,
// 1->2 = 7d, 2->3 = 11d. Touch 3 is the final touch (the breakup); after it sends the lead is marked
// cadence_complete (see processLead) and recycle.js parks/re-enters it. There is NO touch 4: the scheduler never
// schedules it and S064 render.js does not render it. SEND_GAP env knobs unchanged. SEND stays OFF (master gate).
const LAST_TOUCH = 2; // index of the final touch (T0+T1+T2 = 3 emails total, days 0/3/10). No breakup email.
const CADENCE_DAYS = [0, 3, 10, 21]; // days from Touch 0, matching campaigns/_meta.json interval_days_from_touch0

function pickDueDrafts() {
  // Find leads ready for next touch
  // COMPLIANCE HARD-GATE: never auto-send to a lead that has opted out, hard-bounced, or been
  // manually handled. Belt-and-suspenders across BOTH signals: email_sequence_state status and the
  // reply classifier's inbound_emails verdict. This is a legal line (opt-out must be honored), so it
  // is enforced at selection time, not just suppressed downstream.
  // THIRD signal: the canonical `suppression` table (opt-out registry written by imap-poll on STOP and by
  // recycle.js for repliers). email_sequence_state/inbound only catch opt-outs that resolved to THIS lead;
  // a suppressed address recorded against a colliding lead (or matched by domain only) would otherwise slip
  // through. Gate the lead's own send address against the registry too. (legal opt-out line)
  // CROSS-WORKFLOW GUARD: `status` (touch_N_queued) and `lifecycle_stage` are written by different
  // workflows and can disagree. The engine cycle's qualify-and-queue sets status='touch_0_queued', but
  // v3-rerun / backlog-burst (requalify-all-leads.js) can later flip the SAME lead's lifecycle_stage to
  // 'pending_approval' or 'rejected' (this divergence is already present in the live data). Selecting on
  // status alone would auto-send a lead another workflow has since demoted. Require the lifecycle_stage to
  // still be a sendable one so the two vocabularies must AGREE before any mail goes out.
  // P2-1a CONSENT GATE (legal line): never cold-send to a lead flagged consent_required (sole-trader/
  // ordinary-partnership = individual subscriber under PECR). COALESCE so rows predating the column still send.
  // LAYER-3 CLAUDE CLEARANCE GATE (defence in depth, mirrors push-to-mystrika.js): the direct send path also
  // requires claude_cleared=TRUE so nothing leaves either path until the Claude safeguard has cleared the lead,
  // its audit and its copy. COALESCE so rows predating the column are held (default FALSE), not silently sent.
  const sql = `SELECT l.id::text, l.company, COALESCE(NULLIF(l.email,''), l.contact_email, '') AS email, l.status, COALESCE(l.next_touch_date::text, '') AS next FROM leads l WHERE l.status LIKE 'touch_%_queued' AND COALESCE(l.lifecycle_stage,'') NOT IN ('pending_approval','rejected','duplicate','parked','suppressed','consent_required') AND COALESCE(l.consent_required, FALSE) = FALSE AND COALESCE(l.claude_cleared, FALSE) = TRUE AND COALESCE(NULLIF(l.email,''), l.contact_email, '') <> '' AND (l.next_touch_date IS NULL OR l.next_touch_date <= CURRENT_DATE) AND COALESCE(l.replied, FALSE) = FALSE AND COALESCE(l.acquisition_channel,'') NOT ILIKE '%test%' AND COALESCE(l.acquisition_channel,'') NOT ILIKE '%seed%' AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal') AND NOT EXISTS (SELECT 1 FROM email_sequence_state ess WHERE ess.lead_id = l.id AND ess.status IN ('unsubscribed','bounced','manually_handled','opted_out','replied','completed','nurture_complete')) AND NOT EXISTS (SELECT 1 FROM inbound_emails ie WHERE ie.matched_lead_id = l.id AND ie.classification IN ('OPT_OUT','BOUNCE','UNSUBSCRIBE')) AND NOT EXISTS (SELECT 1 FROM suppression sup WHERE lower(sup.email) = lower(COALESCE(NULLIF(l.email,''), l.contact_email)) AND (sup.expires_at IS NULL OR sup.expires_at > NOW())) LIMIT 50`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [id, company, email, status, next] = l.split('\t'); return { id: Number(id), company, email, status, next_touch_date: next }; });
}

function getDraftForTouch(lead_id, touch) {
  // ATOMIC CLAIM (idempotency / anti-double-send): GitHub Actions runs this every ~30m and a run can exceed
  // that (live audit-verify curl + relay calls + paced gaps), so two runs can overlap and both select the same
  // due lead. Flip the ONE matching pending draft to 'sending' in a single UPDATE ... RETURNING so exactly one
  // worker claims it; a concurrent worker's UPDATE matches no row and it skips. Prevents sending the same touch
  // twice to a prospect. The claim is released back to 'pending' on a soft skip (see releaseDraft) and advanced
  // to 'sent' on success. Uses a CTE so we lock+update+return atomically (psql shim takes no params).
  const raw = pg(`WITH c AS (
      SELECT id FROM outreach_drafts
      WHERE lead_id=${lead_id} AND channel='email' AND draft_metadata->>'touch' = '${touch}' AND send_status='pending'
      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
    UPDATE outreach_drafts od SET send_status='sending'
    FROM c WHERE od.id=c.id
    RETURNING od.id::text, od.draft_subject, od.draft_body`);
  if (!raw) return null;
  const [id, subject, body] = raw.split('\t');
  if (!id) return null;
  return { id: Number(id), subject, body };
}
// Release a claimed-but-not-sent draft back to 'pending' so a later run can retry it (used on soft skips that
// are transient: no eligible alias / quota exhausted / send error). Terminal skips set their own explicit
// send_status. (outreach_drafts has no updated_at column — do not reference one.)
function releaseDraft(draft_id) { pg(`UPDATE outreach_drafts SET send_status='pending' WHERE id=${draft_id} AND send_status='sending'`); }

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
    pg(`UPDATE outreach_drafts SET send_status='blocked_quality' WHERE id=${draft.id} AND send_status='sending'`); // release the claim (terminal)
    return { lead_id: lead.id, skipped: 'quality_below_threshold', quality_score: Number(qs) };
  }

  // AUDIT-LINK GUARANTEE (any touch that references an audit): NEVER send unless the URL is a real,
  // minted, signed audit that resolves HTTP 200. Fail-closed + flag the founder. No frivolous emails.
  // D4.3: Touch-1 specific — if the audit URL is not live, mark needs_remint=true on the lead so the
  // mint queue can pick it up and remint before the next retry. All other touches are gated identically.
  const bodyHasAudit = /\/audit\//i.test(draft.body);
  if (bodyHasAudit) {
    const auditUrl = pg(`SELECT COALESCE(audit_url,'') FROM leads WHERE id=${lead.id}`);
    const v = await verifyAuditUrl(auditUrl);
    if (!v.ok) {
      pg(`UPDATE outreach_drafts SET send_status='blocked_audit_missing', draft_metadata = draft_metadata || ${pgEsc(JSON.stringify({ audit_url: auditUrl || null, audit_check: v, blocked_at: new Date().toISOString() }))}::jsonb WHERE id=${draft.id}`);
      // D4.3: mark needs_remint so the mint queue can re-mint the audit page before next retry.
      pg(`UPDATE leads SET status='audit_unverified', needs_remint=true, updated_at=NOW() WHERE id=${lead.id}`);
      console.log(`  D4.3 audit-verify: Touch-${touch} BLOCKED for ${lead.company || lead.domain || ('lead ' + lead.id)} — audit URL not live (${v.reason}). needs_remint=true set. [lead ${lead.id}]`);
      try { if (_tg) await _tg.send(`ABORTED Touch-${touch} for ${lead.company || lead.domain || ('lead ' + lead.id)}: audit link not verified (${v.reason}). No email sent. Mint or fix the audit and it will resend. needs_remint flagged. [lead ${lead.id}]`, { parse_mode: '' }); } catch (_) {}
      return { lead_id: lead.id, skipped: 'audit_unverified', audit_url: auditUrl, check: v, needs_remint: true };
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
  if (!alias) { releaseDraft(draft.id); return { lead_id: lead.id, skipped: 'no_eligible_alias_quota_exhausted' }; } // transient — release claim to retry next run

  const fromName = alias.persona_name || alias.first_name || 'Aman Pareek';
  // Signature MUST match the sending alias. Fill the __SIGNATURE__ token with the alias's first name,
  // and scrub any stray dash one last time before the wire.
  let _nd = (x) => x; try { _nd = require('../../../lib/gates.js').noDashes; } catch (_) {}
  const sigName = alias.first_name || (alias.persona_name || '').split(' ')[0] || 'Aman';
  // P8: __SIGNATURE__ -> the sender's name FOLLOWED BY the canonical Art-14 compliance footer (Founder/credential
  // + Tamazia Ltd entity + ICO/company/address placeholders + "how we found you" provenance + visible unsubscribe).
  // Was: just the name (no footer at all -> non-compliant cold mail). Footer is appended AFTER the spam-lint gate
  // above, so its founder-blocked {{...}} placeholders never trip the gate. SEND is OFF regardless.
  const _footer = complianceFooter({ to: lead.email, from: alias.email });
  const _sig = _footer ? (sigName + '\n\n' + _footer) : sigName;
  const sendBody = _nd(String(draft.body).replace(/__SIGNATURE__/g, _sig));
  const sendSubject = _nd(String(draft.subject));
  // Send via the multi-relay router (routes by alias.relay, fails over, enforces daily caps)
  const result = await routerSend({ to: lead.email, from: alias.email, from_name: fromName, subject: sendSubject, text: sendBody, relay: alias.relay });
  if (!result.ok) { releaseDraft(draft.id); return { lead_id: lead.id, error: 'send_failed', detail: result.attempts }; } // transient — release claim to retry
  const email_id = result.id;
  markUsed(alias.id);
  // Persist BOTH the RFC Message-ID we set (matches a reply's In-Reply-To/References for bit-perfect
  // threading) AND the provider's own id. The inbound poller matches replies against either.
  pg(`UPDATE outreach_drafts SET send_status='sent', sent_at=NOW(), draft_metadata = draft_metadata || ${pgEsc(JSON.stringify({ relay_provider: result.provider, relay_email_id: email_id, rfc_message_id: (result.message_id || '').replace(/[<>]/g, ''), from_alias_id: alias.id, from_alias_email: alias.email }))}::jsonb WHERE id=${draft.id}`);
  // CANONICAL SEND LOG: one source of truth for the dashboard, relay attribution, and reply matching.
  // The new touch flow previously only updated outreach_drafts, so new sends were invisible in `sends`.
  // lead_id is REQUIRED for per-source / per-sector reporting (a NULL lead_id groups as 'unknown'); this is
  // a lead-directed touch so we MUST always attribute it. Guard against a non-numeric id (would otherwise
  // interpolate the literal `undefined`/`NULL` and orphan the row) and skip the log rather than write junk.
  // Stamp sector + jurisdiction straight from the lead so reports that read sends.sector work without a join.
  const leadIdNum = Number(lead.id);
  if (Number.isInteger(leadIdNum) && leadIdNum > 0) {
    pg(`INSERT INTO sends (lead_id, alias_id, recipient, subject, subject_used, message_id, relay_used, relay_name, sent_at, status, delivery_status, touch_number, kind, sector, jurisdiction)
        SELECT ${leadIdNum}, ${alias.id || 'NULL'}, ${pgEsc(lead.email)}, ${pgEsc(draft.subject)}, ${pgEsc(draft.subject)}, ${pgEsc((result.message_id || '').replace(/[<>]/g, ''))}, ${pgEsc(result.provider)}, ${pgEsc(result.provider)}, NOW(), 'sent', 'sent', ${touch}, 'email', NULLIF(l.sector,''), NULLIF(l.jurisdiction,'')
        FROM leads l WHERE l.id=${leadIdNum}`);
  } else {
    console.log(`  WARN: lead ${JSON.stringify(lead.id)} has no integer id — skipped sends log row (would orphan reporting)`);
  }
  // P3 [X12] FIRST-CONTACT STAMP: on the FIRST touch (touch 0) record first_contacted_at=NOW() if not already
  // set. recycle.js parks no-reply leads at first_contacted_at + RECYCLE_NOREPLY_DAYS, but nothing wrote the
  // column (live: 0 rows), so the park step was dead and no lead ever recycled. COALESCE-guard so a re-send /
  // out-of-order touch never moves the original contact date. Additive column, NULL-safe. (SEND OFF; correct
  // for when the founder flips it.)
  if (touch === 0) pg(`UPDATE leads SET first_contacted_at = COALESCE(first_contacted_at, NOW()) WHERE id = ${lead.id}`);
  // Advance lead status + schedule next touch. D1 (founder-locked): cadence runs 0->1->2->3; cadence_complete is
  // set ONLY after the final touch (LAST_TOUCH = 3, the breakup) has sent. The gap to the next touch is read from
  // CADENCE_DAYS [0,3,10,21] — only touches 0/1/2 fire (days 0, 3, 10). Touch 3 (day 21) is not sent.
  if (touch < LAST_TOUCH) {
    const days = CADENCE_DAYS[touch + 1] - CADENCE_DAYS[touch];
    pg(`UPDATE leads SET status='touch_${touch + 1}_queued', next_touch_date = (CURRENT_DATE + INTERVAL '${days} days')::date, last_reply_received_at = NULL, updated_at = NOW() WHERE id = ${lead.id}`);
  } else {
    pg(`UPDATE leads SET status='cadence_complete', next_touch_date = NULL, updated_at = NOW() WHERE id = ${lead.id}`);
  }
  return { lead_id: lead.id, company: lead.company, touch_sent: touch, email_id, next_status: touch < LAST_TOUCH ? `touch_${touch + 1}_queued` : 'cadence_complete' };
}

async function run() {
  // SEND_ENABLED MASTER GATE (P2): cold sending is OFF unless SEND_ENABLED is explicitly truthy. This is the
  // top-level switch the founder flips to go live; until then nothing is sent regardless of queue state. It
  // sits ABOVE the kill-switch (system_state.paused) so the default posture is "off" even with no DB row.
  if (!/^(1|true|yes|on)$/i.test(process.env.SEND_ENABLED || '')) {
    console.log('HALT: SEND_ENABLED is not set — cold sending is OFF (master gate). No mail sent.');
    return [{ halted: true, reason: 'send_disabled' }];
  }
  // SATURDAY PAUSE (P2-5): no cold sends on Saturday (UK day). Env SEND_SATURDAY_PAUSE=0 disables.
  try {
    const { sendingPausedToday } = require('../../../lib/send-pacing.js');
    const sp = sendingPausedToday();
    if (sp.paused) { console.log(`HALT: ${sp.reason} — no cold sends today.`); return [{ halted: true, reason: sp.reason }]; }
  } catch (_e) {}
  // RANDOMISED HOURLY JITTER (P2-5): small random delay so the every-30-min cron does not fire at a fixed
  // second each cycle (a robotic cadence is a spam signal). Skipped in fast/test runs via SEND_JITTER_MAX_S=0.
  try { const { startupJitter } = require('../../../lib/send-pacing.js'); const j = await startupJitter(); if (j) console.log(`  jitter · delayed ${(j / 1000).toFixed(0)}s before run`); } catch (_e) {}
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
  // PHASE D · daily warmup-aware budget on TOP of the per-run cap. Only enforced when we can read real
  // inbox/warmup capacity (cap>0); otherwise we fall back to the per-run cap so we never wrongly halt sends.
  let dayRemaining = Infinity;
  try { const { sendBudget } = require('../../../lib/send-pacing.js'); const b = await sendBudget(); if (b && b.cap > 0) { dayRemaining = b.remaining; console.log(`  daily budget: ${b.remaining}/${b.cap} remaining (inboxes ${b.inboxes}, warmup day ${b.warmup_day})`); } } catch (_e) {}
  const effectiveCap = Math.max(0, Math.min(MAX_PER_RUN, dayRemaining));
  const batch = due.slice(0, effectiveCap);
  console.log(`Touch scheduler · ${due.length} due · sending up to ${batch.length} this run (per-run ${MAX_PER_RUN}, daily ${dayRemaining === Infinity ? 'n/a' : dayRemaining}, gap ${GAP_MIN_S}-${GAP_MAX_S}s) · ${new Date().toISOString()}`);
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
