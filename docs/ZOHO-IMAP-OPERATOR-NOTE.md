# Zoho IMAP poller · operator note

**Status:** built and TLS-verified. Waiting on Zoho mailbox going live (MX flip) + app-password generation.

## What it is
- `src/lib/notify/zoho-imap-client.js` · pure Node IMAP-over-TLS client. No external deps (sandbox blocked npm install). Implements LOGIN, SELECT, UID SEARCH, UID FETCH BODY.PEEK[], LOGOUT. Parses RFC 822 headers + multipart/alternative + multipart/mixed bodies. Decodes quoted-printable + base64. Handles RFC 2047 encoded-word subjects.
- `scripts/zoho-imap-poll.js` · production poll runner. Reads `imap_poll_state.last_uid_seen`, pulls new UIDs from Zoho, hands each message to `handleInbound()` in `src/lib/imap-poll-worker.js` which classifies (HOT_BOOK / NEEDS_AUDIT / OBJECTION_* / OOO / BOUNCE / STOP / MANUAL_FROM_AMAN / etc.), writes to `inbound_emails`, updates `email_sequence_state`, fires Slack + Telegram notifications with the 4-button approval keyboard.

## Three steps to flip it on (post-MX swap)

1. **MX swap completes** (waiting on CF Email Routing dashboard toggle). After `bash scripts/zoho-mx-apply.sh` reports OK, the receive path is live.
2. **Generate Zoho IMAP app-password.** Zoho Mail → Settings → Security → App Passwords → create. Copy the 16-char password.
3. **Add to `.env`:**
   ```
   ZOHO_IMAP_HOST=imap.zoho.eu
   ZOHO_IMAP_PORT=993
   ZOHO_IMAP_USER=founder@tamazia.co.uk
   ZOHO_IMAP_APP_PASSWORD=<the-16-char-app-password>
   ZOHO_IMAP_MAILBOX=INBOX
   ```

## Verify locally
```
node scripts/zoho-imap-poll.js --dry-run
```
Expected output ends with `· processed=N · new_last_uid=M`. Run again — should report 0 new messages.

## Schedule it
Two options. Pick one.

### Option A · launchd (macOS, runs locally when laptop is on)
Create `~/Library/LaunchAgents/co.tamazia.zoho-imap-poll.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>co.tamazia.zoho-imap-poll</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/scripts/zoho-imap-poll.js</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/logs/imap-poll.log</string>
  <key>StandardErrorPath</key><string>/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/logs/imap-poll.err</string>
</dict>
</plist>
```
Then `launchctl load ~/Library/LaunchAgents/co.tamazia.zoho-imap-poll.plist` — runs every 5 min.

### Option B · n8n Schedule node (already wired in the W14 workflow)
Trigger: every 5 min → Execute Command node → `cd /Users/.../COWORK-OS-EXECUTION && node scripts/zoho-imap-poll.js`.

## Self-healing / self-renewing properties

- **Idempotent:** `inbound_emails (mailbox, imap_uid)` has UNIQUE constraint → re-running on same UID is a no-op.
- **State tracked across runs:** `imap_poll_state.last_uid_seen` advances each successful poll.
- **Connection failures retry next cron tick** (exit codes 1-3 distinguish failure mode).
- **Token-free auth:** uses app-password not OAuth, so no refresh cycle to manage. Aman can rotate the password from Zoho dashboard if needed.
- **TLS verified:** connection to imap.zoho.eu:993 + greeting + LOGIN command path validated end-to-end against Zoho during build.

## Smoke-test sequence the moment MX is live

```
# 1. From any other inbox, send a test mail to founder@tamazia.co.uk
# 2. Wait 60s for Zoho to deliver
node scripts/zoho-imap-poll.js
# Expected:  fetched 1 · uid=N from=test@example.com → OTHER (unmatched)
# 3. Confirm in DB
bash scripts/psql "$NEON_URL" -tA -c "SELECT id, from_email, subject, classification FROM inbound_emails ORDER BY id DESC LIMIT 5;"
```

If step 1 lands in Zoho UI but step 2 returns 0 fetched, app-password is wrong or IMAP is disabled on the mailbox (Zoho Mail → Settings → IMAP → Enable).
