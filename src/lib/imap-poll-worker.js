// Phase 6.7 GAP 3 + 4 · IMAP poll worker.
// Polls the 5 Zoho mailboxes every 15 minutes (run via cron / n8n schedule trigger).
// For each NEW message UID:
//   1. Parse From / Subject / In-Reply-To / Message-ID / Body
//   2. Match In-Reply-To to a known send to find the matched lead + alias
//   3. Detect: manual_reply_from_aman (From = Aman alias), OOO, bounce, stop keyword
//   4. Classify with S012 extended classifier (14 categories)
//   5. Write to inbound_emails
//   6. Update email_sequence_state:
//      - If reply from prospect → status='replied', pause sequence
//      - If reply from Aman manually (via Zoho UI) → status='manually_handled', pause sequence
//      - If bounce → status='bounced', cascade alias reputation
//      - If OOO → pause until OOO end date or 7 days
//      - If STOP → add to suppression
//   7. Post Slack + Telegram notification with the 4-button keyboard (gates on Aman's click)
//
// This file is the JS spec for the worker. n8n schedule node calls `node imap-poll-worker.js --poll-all`.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function esc(v) { if (v === null || v === undefined) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const gaps = require('./pipeline-gap-fills.js');

// 5 Zoho mailboxes (from Phase 4)
const ZOHO_MAILBOXES = [
  'mailbox1@tamazia.co.uk',
  'mailbox2@tamazia.co.uk',
  'mailbox3@tamazia.co.uk',
  'mailbox4@tamazia.co.uk',
  'mailbox5@tamazia.co.uk'
];

const AMAN_ALIASES = new Set([
  'aman@tamazia.co.uk',
  'aman.pareek@tamazia.co.uk',
  'apareek@tamazia.co.uk'
]);

// ============================================================================
// pollMailbox · the per-mailbox loop. Uses IMAPFlow via Node (deferred install)
// ============================================================================
async function pollMailbox(mailbox) {
  // Production: connect via IMAPFlow over Zoho imap.zoho.eu:993 with TLS
  // For Phase 6.7 we expose the function interface; the actual IMAP transport is
  // wired in by n8n's IMAP trigger node (or by `npm install imapflow` once enabled).
  // The worker returns the count of new messages processed.

  // Load last UID seen
  const lastUidRaw = pg(`SELECT last_uid_seen FROM imap_poll_state WHERE mailbox=${esc(mailbox)}`);
  const lastUid = lastUidRaw ? Number(lastUidRaw) : 0;
  // FETCH UID > lastUid
  // For each message: extractFields, then handleInbound
  // Returns: { processed: n, errors: [] }
  return { mailbox, last_uid: lastUid, processed: 0, note: 'use n8n IMAP trigger or imapflow npm package once wired' };
}

// ============================================================================
// handleInbound · the per-message classifier + dispatcher
// Called from n8n IMAP trigger node OR from imapflow loop.
// ============================================================================
function handleInbound({ mailbox, uid, from_email, to_email, subject, in_reply_to, message_id, body_plain, body_html }) {
  // Phase 6.7 GAP 16 + 17 · match by In-Reply-To to original send
  let matched_lead_id = null, matched_send_id = null, matched_alias_id = null;
  const irt = in_reply_to ? in_reply_to.replace(/[<>]/g, '') : '';
  if (irt) {
    // 1) legacy sends table
    let r = pg(`SELECT lead_id, id, alias_id FROM sends WHERE message_id=${esc(in_reply_to)} OR message_id=${esc(irt)} LIMIT 1`);
    if (r) { const [lid, sid, aid] = r.split('\t'); matched_lead_id = Number(lid) || null; matched_send_id = Number(sid) || null; matched_alias_id = Number(aid) || null; }
    // 2) new touch flow: bit-perfect match against the Message-ID we stored at send time
    if (!matched_lead_id) {
      r = pg(`SELECT lead_id, COALESCE(draft_metadata->>'from_alias_id','') FROM outreach_drafts WHERE draft_metadata->>'rfc_message_id'=${esc(irt)} OR draft_metadata->>'relay_email_id'=${esc(irt)} ORDER BY id DESC LIMIT 1`);
      if (r) { const [lid, aid] = r.split('\t'); matched_lead_id = Number(lid) || null; if (aid) matched_alias_id = Number(aid) || matched_alias_id; }
    }
  }
  // Identify the persona by the address the client replied TO. Works for ALL 90 aliases even when a
  // client strips In-Reply-To, because the To: address IS the persona that must reply back.
  if (to_email && !matched_alias_id) {
    const a = pg(`SELECT id FROM aliases WHERE LOWER(email)=${esc(String(to_email).toLowerCase())} LIMIT 1`);
    if (a) matched_alias_id = Number(a) || null;
  }
  // Fall back to FROM domain matching for replies that broke the In-Reply-To chain
  if (!matched_lead_id) {
    const dom = (from_email || '').split('@').pop()?.toLowerCase();
    if (dom) {
      const r = pg(`SELECT id FROM leads WHERE LOWER(domain)=${esc(dom)} ORDER BY id DESC LIMIT 1`);
      if (r) matched_lead_id = Number(r);
    }
  }

  // Detect category
  const manualFromAman = AMAN_ALIASES.has(String(from_email || '').toLowerCase());
  const ooo = gaps.isOOO(subject, body_plain);
  const bounce = gaps.isBounce(subject, body_plain, from_email);
  const stop = gaps.isStopKeyword(body_plain);

  let classification, confidence;
  if (manualFromAman) { classification = 'MANUAL_FROM_AMAN'; confidence = 0.99; }
  else if (bounce) { classification = 'BOUNCE'; confidence = 0.95; }
  else if (ooo) { classification = 'OOO'; confidence = 0.95; }
  else if (stop) { classification = 'OPT_OUT'; confidence = 0.99; }
  else {
    const c = gaps.classifyInboundReply(subject, body_plain, from_email);
    classification = c.category; confidence = c.confidence;
  }

  // Write inbound_emails
  pg(`INSERT INTO inbound_emails (mailbox, imap_uid, from_email, to_email, subject, in_reply_to, message_id, body_plain, body_html, matched_lead_id, matched_send_id, matched_alias_id, classification, classification_confidence, manual_reply_from_aman, ooo_detected, stop_keyword_detected, bounce_detected) VALUES (${esc(mailbox)}, ${uid || 'NULL'}, ${esc(from_email)}, ${esc(to_email)}, ${esc(subject)}, ${esc(in_reply_to)}, ${esc(message_id)}, ${esc(body_plain)}, ${esc(body_html)}, ${matched_lead_id || 'NULL'}, ${matched_send_id || 'NULL'}, ${matched_alias_id || 'NULL'}, ${esc(classification)}, ${confidence || 0}, ${manualFromAman ? 'TRUE' : 'FALSE'}, ${ooo ? 'TRUE' : 'FALSE'}, ${stop ? 'TRUE' : 'FALSE'}, ${bounce ? 'TRUE' : 'FALSE'}) ON CONFLICT (mailbox, imap_uid) DO NOTHING`);

  // Update sequence state
  if (matched_lead_id) {
    if (manualFromAman) {
      pg(`UPDATE email_sequence_state SET status='manually_handled', manually_handled=TRUE, paused_reason='manual reply by Aman via Zoho', updated_at=NOW() WHERE lead_id=${matched_lead_id}`);
    } else if (stop) {
      pg(`UPDATE email_sequence_state SET status='unsubscribed', paused_reason='STOP keyword in reply', updated_at=NOW() WHERE lead_id=${matched_lead_id}`);
      pg(`INSERT INTO suppression (email, domain, reason, source_send_id) VALUES (${esc(from_email)}, ${esc(String(from_email||'').split('@').pop())}, 'stop_keyword', ${matched_send_id || 'NULL'}) ON CONFLICT DO NOTHING`);
    } else if (bounce) {
      pg(`UPDATE email_sequence_state SET status='bounced', paused_reason='hard bounce', updated_at=NOW() WHERE lead_id=${matched_lead_id}`);
      pg(`INSERT INTO bounce_events (lead_id, alias_id, send_id, recipient_email, bounce_type, reason) VALUES (${matched_lead_id}, ${matched_alias_id || 'NULL'}, ${matched_send_id || 'NULL'}, ${esc(from_email)}, 'hard', ${esc((body_plain || '').slice(0, 240))})`);
    } else if (ooo) {
      pg(`UPDATE email_sequence_state SET next_due_at = NOW() + INTERVAL '7 days', paused_reason='OOO detected', updated_at=NOW() WHERE lead_id=${matched_lead_id}`);
    } else {
      pg(`UPDATE email_sequence_state SET status='replied', paused_reason=${esc(classification)}, updated_at=NOW() WHERE lead_id=${matched_lead_id}`);
      // mark the lead replied so the cadence stops touching them (belt-and-suspenders with the send gate)
      pg(`UPDATE leads SET replied=TRUE, last_reply_received_at=NOW(), updated_at=NOW() WHERE id=${matched_lead_id}`);
      pg(`UPDATE sends SET replied_at=NOW() WHERE lead_id=${matched_lead_id} AND replied_at IS NULL`);
    }
  }

  // Build draft response
  const draft = buildDraftResponse({ classification, lead_id: matched_lead_id, subject, body_plain });
  pg(`UPDATE inbound_emails SET draft_response=${esc(draft.body)}, draft_action=${esc(draft.action)} WHERE mailbox=${esc(mailbox)} AND imap_uid=${uid || 0}`);

  // Notify Slack + Telegram (gated; no auto-send)
  notifyAman({ classification, confidence, from_email, subject, body_plain, draft, matched_lead_id, mailbox, uid, manualFromAman });

  return { classification, manualFromAman, matched_lead_id, draft };
}

function buildDraftResponse({ classification, lead_id, subject, body_plain }) {
  if (classification === 'MANUAL_FROM_AMAN') return { body: '(no draft; you replied manually)', action: 'log_only' };
  if (classification === 'BOUNCE') return { body: '(no reply; bounce auto-handled)', action: 'log_only' };
  if (classification === 'OOO') return { body: '(no reply; OOO detected, sequence paused 7 days)', action: 'pause' };
  if (classification === 'OPT_OUT') return { body: '(no reply; added to suppression)', action: 'suppress' };

  const lead = lead_id ? pg(`SELECT company, COALESCE(contact_first,''), COALESCE(audit_url,'') FROM leads WHERE id=${lead_id}`) : null;
  let firm = '', first = '', audit_url = '';
  if (lead) { const parts = lead.split('\t'); firm = parts[0]; first = parts[1]; audit_url = parts[2]; }
  const auditLine = audit_url ? `Audit: ${audit_url}` : '';

  const tplByCat = {
    HOT_BOOK: `${first || 'there'},\n\nGreat. The audit is live: ${audit_url || '[mint audit URL]'}\n\nGrab any 30 minutes that work: cal.com/tamazia/strategy-call\n\nAman`,
    HOT_PRICE: `${first || 'there'},\n\nThree tiers depending on scope. The audit at ${audit_url || '[mint audit URL]'} sits next to the pricing detail. Quick 30-minute call to walk through which fits ${firm}: cal.com/tamazia/strategy-call\n\nAman`,
    HOT_AGENCY_COMPARE: `${first || 'there'},\n\nThat is the right call. Pull your current agency's last report and put it next to ours: ${audit_url || '[mint audit URL]'}. If theirs is sharper, no offence. If ours is, the gap is yours to act on. 30 minutes to walk through: cal.com/tamazia/strategy-call\n\nAman`,
    NEEDS_AUDIT: `${first || 'there'},\n\nHere it is, no need to wait. ${auditLine}\n\nGrab time if useful: cal.com/tamazia/strategy-call\n\nAman`,
    NEEDS_INFO: `${first || 'there'},\n\nHappy to share more. The audit at ${audit_url || '[mint audit URL]'} has the full ten dimensions and per-finding fix cost. What specifically would help to walk through?\n\nAman`,
    OBJECTION_INCUMBENT: `${first || 'there'},\n\nUnderstood. Most firms at ${firm}'s level have one. The offer was a second-opinion document you can put next to your agency's last report. Audit at ${audit_url || '[mint audit URL]'} stays open 180 days.\n\nAman`,
    OBJECTION_BUDGET: `${first || 'there'},\n\nUnderstood. The audit at ${audit_url || '[mint audit URL]'} is yours regardless. If anything changes in the next quarter, the line stays open.\n\nAman`,
    OBJECTION_TIMING: `${first || 'there'},\n\nMarking the file for ${firm} as revisit in 90 days. Audit at ${audit_url || '[mint audit URL]'} stays open 180 days. If anything shifts earlier, just reply.\n\nAman`,
    WARM_TIMING: `${first || 'there'},\n\nNoted. Audit stays open 180 days: ${audit_url || '[mint audit URL]'}. I will circle back when you said.\n\nAman`,
    WRONG_PERSON: `${first || 'there'},\n\nThanks for flagging. One-line intro to whoever owns SEO and compliance at ${firm}? I will take it from there.\n\nAman`,
    HOSTILE: `${first || 'there'},\n\nApologies for the interruption. You are removed from all Tamazia outreach effective immediately.\n\nAman`,
    OTHER: `${first || 'there'},\n\nThanks for the reply. The audit at ${audit_url || '[mint audit URL]'} stays open. Happy to set up a 30-min call: cal.com/tamazia/strategy-call.\n\nAman`
  };
  return { body: tplByCat[classification] || tplByCat.OTHER, action: 'approve_or_edit' };
}

function notifyAman({ classification, confidence, from_email, subject, body_plain, draft, matched_lead_id, mailbox, uid, manualFromAman }) {
  if (manualFromAman) return; // no notification for our own outbound
  const slack = path.resolve(ROOT, 'scripts', 'notify-slack.sh');
  const tg = path.resolve(ROOT, 'scripts', 'notify-telegram.sh');
  const subjectLine = String(subject || '(no subject)').slice(0, 120);
  const bodyExcerpt = String(body_plain || '').replace(/\s+/g, ' ').slice(0, 600);
  const draftExcerpt = String(draft.body || '').replace(/\s+/g, ' ').slice(0, 600);
  const slackText = `:incoming_envelope: REPLY · ${classification} · ${Number(confidence).toFixed(2)}\n*From:* ${from_email}\n*To:* ${mailbox}\n*Subject:* ${subjectLine}\n*Lead:* ${matched_lead_id || 'unmatched'}\n\n*They wrote:*\n${bodyExcerpt}\n\n*Draft reply (${draft.action}):*\n${draftExcerpt}\n\nActions: \`/tamazia approve ${uid}\` · \`/tamazia send-audit ${uid}\` · \`/tamazia edit ${uid}\` · \`/tamazia close ${uid}\``;
  try { execFileSync(slack, ['all-tamazia', slackText], { stdio: 'pipe' }); } catch (_e) {}
  try { execFileSync(tg, [`Reply ${classification} from ${from_email} on lead ${matched_lead_id || '?'}: ${bodyExcerpt.slice(0, 300)}\n\nDraft:\n${draftExcerpt.slice(0, 400)}\n\nReply with: /approve ${uid} or /audit ${uid} or /edit ${uid} or /close ${uid}`], { stdio: 'pipe' }); } catch (_e) {}
  pg(`UPDATE inbound_emails SET slack_notification_sent_at=NOW() WHERE mailbox=${esc(mailbox)} AND imap_uid=${uid || 0}`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--poll-all')) {
    (async () => { for (const m of ZOHO_MAILBOXES) console.log(JSON.stringify(await pollMailbox(m))); })();
  } else if (argv.includes('--test-classifier')) {
    const fixtures = [
      { subject: 'Out of Office', body: 'I am on annual leave until Friday', from: 'priya@monzo.com', expect: 'OOO' },
      { subject: 'Unsubscribe', body: 'stop', from: 'priya@monzo.com', expect: 'OPT_OUT' },
      { subject: 'Re: Monzo Bank for our 2026 piece', body: 'Yes happy to be featured, please send the audit', from: 'priya@monzo.com', expect: 'NEEDS_AUDIT' },
      { subject: 'Re: Monzo Bank for our 2026 piece', body: 'We already have an SEO agency', from: 'priya@monzo.com', expect: 'OBJECTION_INCUMBENT' },
      { subject: 'Delivery Status Notification (Failure)', body: 'Final-Recipient: priya@monzo.com', from: 'mailer-daemon@google.com', expect: 'BOUNCE' }
    ];
    for (const f of fixtures) {
      const r = handleInbound({ mailbox: 'test', uid: 0, from_email: f.from, to_email: 'test@tamazia.co.uk', subject: f.subject, body_plain: f.body });
      console.log(`${f.expect.padEnd(20)} | got: ${r.classification.padEnd(20)} | ${r.classification === f.expect ? 'PASS' : 'FAIL'}`);
    }
  } else {
    console.error('Usage: imap-poll-worker.js --poll-all | --test-classifier');
  }
}

module.exports = { pollMailbox, handleInbound, buildDraftResponse, notifyAman, ZOHO_MAILBOXES, AMAN_ALIASES };
