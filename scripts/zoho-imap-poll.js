#!/usr/bin/env node
// Production-ready Zoho IMAP poll runner.
// Reads imap_poll_state.last_uid_seen for the mailbox, fetches new messages,
// passes each to handleInbound() (which classifies + saves to inbound_emails + notifies),
// then updates imap_poll_state.
//
// Self-renewing: any IMAP error is logged and the run exits non-zero so cron retries.
// Idempotent: messages keyed by (mailbox, imap_uid) UNIQUE constraint in inbound_emails.
//
// Usage:
//   node scripts/zoho-imap-poll.js                      # poll INBOX since last run
//   node scripts/zoho-imap-poll.js --reset-uid 0        # reset state then poll all
//   node scripts/zoho-imap-poll.js --dry-run            # fetch but don't write to DB
//
// Schedule:  add cron `*/5 * * * *  cd /Users/.../COWORK-OS-EXECUTION && node scripts/zoho-imap-poll.js >> logs/imap-poll.log 2>&1`
//   or run via n8n Schedule node.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// Load .env
try {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch (_e) {}

const { pollMailbox } = require(path.join(ROOT, 'src', 'lib', 'notify', 'zoho-imap-client.js'));
const { handleInbound } = require(path.join(ROOT, 'src', 'lib', 'imap-poll-worker.js'));

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (e) { console.error('pg err:', e.message); return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const MAILBOX = process.env.ZOHO_IMAP_MAILBOX || 'INBOX';
const ACCOUNT = process.env.GMAIL_IMAP_USER || process.env.ZOHO_IMAP_USER || 'founder@tamazia.co.uk';
const STATE_KEY = `${ACCOUNT}::${MAILBOX}`;
const DRY_RUN = process.argv.includes('--dry-run');
const RESET_IDX = process.argv.indexOf('--reset-uid');
const RESET_UID = RESET_IDX !== -1 ? Number(process.argv[RESET_IDX + 1] || 0) : null;

async function main() {
  console.log(`[${new Date().toISOString()}] Zoho IMAP poll · account=${ACCOUNT} · mailbox=${MAILBOX} · dry_run=${DRY_RUN}`);

  // Read or initialize state
  if (RESET_UID !== null) {
    pg(`INSERT INTO imap_poll_state (mailbox, last_uid_seen, last_polled_at, poll_status)
        VALUES (${esc(STATE_KEY)}, ${RESET_UID}, NOW(), 'reset')
        ON CONFLICT (mailbox) DO UPDATE SET last_uid_seen=${RESET_UID}, last_polled_at=NOW(), poll_status='reset', error=NULL`);
    console.log(`  · state reset to last_uid_seen=${RESET_UID}`);
  }

  const lastUidRow = pg(`SELECT COALESCE(last_uid_seen, 0) FROM imap_poll_state WHERE mailbox=${esc(STATE_KEY)}`);
  const sinceUid = Number(lastUidRow || 0);
  console.log(`  · since_uid=${sinceUid}`);

  let result;
  try {
    result = await pollMailbox({ mailbox: MAILBOX, sinceUid, maxFetch: 200 });
  } catch (e) {
    console.error('FATAL IMAP error:', e.message);
    pg(`INSERT INTO imap_poll_state (mailbox, last_uid_seen, last_polled_at, poll_status, error)
        VALUES (${esc(STATE_KEY)}, ${sinceUid}, NOW(), 'error', ${esc(e.message.slice(0, 400))})
        ON CONFLICT (mailbox) DO UPDATE SET last_polled_at=NOW(), poll_status='error', error=${esc(e.message.slice(0, 400))}`);
    process.exit(2);
  }

  if (!result.ok) {
    console.error('Poll error:', result.error);
    pg(`INSERT INTO imap_poll_state (mailbox, last_uid_seen, last_polled_at, poll_status, error)
        VALUES (${esc(STATE_KEY)}, ${sinceUid}, NOW(), 'error', ${esc((result.error || '').slice(0, 400))})
        ON CONFLICT (mailbox) DO UPDATE SET last_polled_at=NOW(), poll_status='error', error=${esc((result.error || '').slice(0, 400))}`);
    process.exit(3);
  }

  console.log(`  · fetched ${result.fetched} messages · mailbox_stats=${JSON.stringify(result.mailbox_stats)}`);

  let processed = 0;
  let maxUid = sinceUid;
  for (const msg of result.messages) {
    if (msg.error) {
      console.warn(`  · uid=${msg.uid} ERROR: ${msg.error}`);
      continue;
    }
    if (msg.uid > maxUid) maxUid = msg.uid;
    if (DRY_RUN) {
      console.log(`  · DRY uid=${msg.uid} from=${msg.from_email} subj="${(msg.subject || '').slice(0, 60)}"`);
      processed++;
      continue;
    }
    try {
      const r = handleInbound({
        mailbox: ACCOUNT,
        uid: msg.uid,
        from_email: msg.from_email,
        to_email: msg.to_email,
        subject: msg.subject,
        in_reply_to: msg.in_reply_to,
        message_id: msg.message_id,
        body_plain: msg.body_plain,
        body_html: msg.body_html
      });
      console.log(`  · uid=${msg.uid} from=${msg.from_email} → ${r.classification} ${r.matched_lead_id ? '(lead ' + r.matched_lead_id + ')' : '(unmatched)'}`);
      processed++;
    } catch (e) {
      console.warn(`  · uid=${msg.uid} handleInbound error: ${e.message}`);
    }
  }

  // Update state with maxUid only when we actually processed something OR mailbox returned UIDNEXT and we're up to date
  const finalUid = result.mailbox_stats?.uidnext ? Math.max(maxUid, result.mailbox_stats.uidnext - 1) : maxUid;
  if (!DRY_RUN) {
    pg(`INSERT INTO imap_poll_state (mailbox, last_uid_seen, last_polled_at, poll_status, error)
        VALUES (${esc(STATE_KEY)}, ${finalUid}, NOW(), 'ok', NULL)
        ON CONFLICT (mailbox) DO UPDATE SET last_uid_seen=${finalUid}, last_polled_at=NOW(), poll_status='ok', error=NULL`);
  }
  console.log(`  · processed=${processed} · new_last_uid=${finalUid}`);
  console.log(`[${new Date().toISOString()}] done`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
