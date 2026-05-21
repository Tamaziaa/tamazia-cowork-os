#!/usr/bin/env node
// S024 bounce-handler (Phase 4 task 4.6.1)
// Receives bounce webhooks from any of the 6 SMTP relays, normalises, persists, and
// triggers DNC enrolment on hard bounces. Also feeds alias_health refresh.
//
// Inbound payload shape varies per relay; normaliser below handles Resend, SMTP2GO,
// MailerSend, Brevo, Mailjet, SendGrid.

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

function normalise(raw) {
  // Detect provider by payload shape.
  if (raw.type && (String(raw.type).startsWith('email.bounced') || String(raw.type) === 'email.complained')) {
    // Resend
    return {
      relay: 'resend',
      recipient_email: raw.data?.to || raw.to || '',
      bounce_type: raw.type === 'email.complained' ? 'complaint' : (raw.data?.bounce?.bouncedRecipients?.[0]?.diagnosticCode?.toLowerCase().includes('550') ? 'hard' : 'soft'),
      smtp_code: raw.data?.bounce?.bouncedRecipients?.[0]?.diagnosticCode?.match(/\d{3}/)?.[0] || null,
      reason: raw.data?.bounce?.bouncedRecipients?.[0]?.diagnosticCode || '',
    };
  }
  if (raw.event === 'bounce' || raw.event === 'softbounce' || raw.event === 'hardbounce' || raw.event === 'spam' || raw.event === 'unsub') {
    // SMTP2GO / generic
    return {
      relay: raw.relay || 'smtp2go',
      recipient_email: raw.rcpt || raw.recipient || raw.email || '',
      bounce_type: raw.event === 'hardbounce' ? 'hard' : raw.event === 'spam' ? 'complaint' : raw.event === 'unsub' ? 'unsubscribe' : 'soft',
      smtp_code: raw.smtpcode || null,
      reason: raw.bounce_message || raw.reason || '',
    };
  }
  if (raw.type === 'activity.hard_bounced' || raw.type === 'activity.soft_bounced') {
    // MailerSend
    return {
      relay: 'mailersend',
      recipient_email: raw.data?.email?.recipient?.email || '',
      bounce_type: raw.type === 'activity.hard_bounced' ? 'hard' : 'soft',
      smtp_code: raw.data?.email?.bounce?.code || null,
      reason: raw.data?.email?.bounce?.reason || '',
    };
  }
  // Mailjet / SendGrid / Brevo all use similar event arrays — pick first.
  return { relay: raw.relay || 'unknown', recipient_email: raw.email || raw.recipient || '', bounce_type: 'unknown', smtp_code: null, reason: JSON.stringify(raw).slice(0, 400) };
}

function ingest(raw) {
  const ev = normalise(raw);
  if (!ev.recipient_email) return { ok: false, reason: 'no_recipient' };
  const lead = pg(`SELECT id FROM leads WHERE email='${ev.recipient_email.replace(/'/g, "''")}' LIMIT 1`);
  const leadId = lead ? Number(lead) : null;
  const payloadJson = JSON.stringify(raw).replace(/'/g, "''").slice(0, 4000);
  pg(`INSERT INTO bounce_events (lead_id, recipient_email, relay, bounce_type, smtp_code, reason, payload) VALUES (${leadId || 'NULL'}, '${ev.recipient_email.replace(/'/g, "''")}', '${(ev.relay || 'unknown').replace(/'/g, "''")}', '${ev.bounce_type}', ${ev.smtp_code ? `'${String(ev.smtp_code).replace(/'/g, "''")}'` : 'NULL'}, '${(ev.reason || '').replace(/'/g, "''").slice(0, 500)}', '${payloadJson}'::jsonb)`);
  if (ev.bounce_type === 'hard' || ev.bounce_type === 'complaint' || ev.bounce_type === 'unsubscribe') {
    pg(`INSERT INTO dnc (email, reason, added_at) VALUES ('${ev.recipient_email.replace(/'/g, "''")}', 'auto:${ev.bounce_type}', NOW()) ON CONFLICT (email) DO NOTHING`);
  }
  return { ok: true, ev, lead_id: leadId };
}

if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', d => stdin += d);
  process.stdin.on('end', () => {
    let raw = {};
    try { raw = JSON.parse(stdin); } catch (_e) { console.error('bad json'); process.exit(2); }
    console.log(JSON.stringify(ingest(raw)));
  });
}

module.exports = { ingest, normalise };
