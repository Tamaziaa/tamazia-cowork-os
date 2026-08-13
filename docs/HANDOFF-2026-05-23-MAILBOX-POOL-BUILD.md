# HANDOFF — 2026-05-23b · Mailbox-pool build (engine side of §14.8)
Self-contained pickup. Read PROJECT-MEMORY.md §14 (esp. §14.11) first, then this. Compiled 2026-05-23.

This session built and tested the engine side of the MailDeck cold-sending layer. No mail has been
sent (kill-switch `system_state.paused=true`, no creds loaded, real-lead queue unqualified).

---

## 0. DECISIONS RECORDED (D1–D4)
- **D1 = A** — own engine for cold + Manyreach free for warmup. The build below makes this real. PlusVibe kept only as a documented fallback, not a spend.
- **D2 = wait to week 3** — do NOT buy pre-warmed Outlook for week 1. The week-1 bottleneck is copy + qualified leads + approval, not inbox capacity; Outlook is plain-text (breaks the Touch-1 audit link).
- **D3 = buy + PARK 2 reserve lookalikes now** (~£2–4). They are COLD reserve (fast re-warm, not instant). True warm reserve needs MailDeck slots, which are all allocated. One reserve doubles as the Asia-cold domain so real .in is never the cannon.
- **D4 = remove Fasthosts Mail Basic 5** before paying (MX conflict with Google Workspace; reply capture is the free Cloudflare catch-all). Prerequisite: point each lookalike's nameservers to Cloudflare.

## 1. WHAT WAS BUILT (all tested, 33/33)
See PROJECT-MEMORY §14.11 for the file-by-file list. Summary:
- `src/lib/notify/mailbox-pool.js` — the fleet: cred loading, age→ramp caps, LRU round-robin, per-inbox + fleet caps, shared dedup, zero-dependency raw SMTP over TLS, self-healing backoff, real-domain hard-reject.
- `relay-router.js` — `maildeck` provider, no failover to real-domain relays, fleet in capacitySnapshot.
- `S065 send-due.js` — `COLD_RAIL=maildeck` default; cold leaves from lookalikes; run capped by live fleet capacity; real-domain abort.
- `imap-poll-worker.js` — precise sender→lead reply match for lookalikes.
- `migrations/2026-05-23-mailbox-pool.sql` — 3 tables + sends.mailbox_address.
- `scripts/load-maildeck-creds.js`, `scripts/setup-lookalike-catchall.js`, health probes, `config/maildeck-mailboxes.sample.csv`.

Tests: `/tmp` harness — ramp math, round-robin + all guards, real-domain rejection, MIME, dot-stuffing, multiline SMTP parse, LIVE TLS SMTP delivery (handshake + AUTH LOGIN + MAIL/RCPT/DATA), auth-failure handling, and router maildeck path returns clean `no_mailboxes_loaded` with no failover.

## 2. SAFETY POSTURE NOW
- `paused=true` (confirmed live).
- `COLD_RAIL=maildeck` + no creds ⇒ the engine cold-sends NOTHING (by design). Real domains can no longer be the cold cannon even if unpaused.

## 3. WHAT AMAN DOES NEXT (in order)
1. Finish MailDeck warmup running on all 30 → MailDeck **Exports** → save the 30 SMTP/IMAP creds as `config/maildeck-mailboxes.csv`.
2. Point the 6 lookalike nameservers to Cloudflare (D4 prerequisite); remove Fasthosts Mail Basic 5.
3. Buy + park reserve domains 7–8 (D3).
4. SECURITY: rotate the reused admin+SMTP password (still open).

## 4. WHAT CLAUDE DOES WHEN CREDS LAND
1. `node scripts/load-maildeck-creds.js config/maildeck-mailboxes.csv --write-env` (schema + identities + creds file + ENV_B64 line).
2. Re-push ENV_B64 to GitHub Actions (clone-to-/tmp, secret-scan, commit, push).
3. `node scripts/setup-lookalike-catchall.js` (6 catch-alls → Gmail; Aman clicks one verify email).
4. Run `qualify-and-queue` + `verify-contacts` on the 27 real leads → produce qualified, verified, named-where-possible targets.
5. Rewrite Touch-0 copy (draft below), dry-run send-due, paste the first real email for approval.
6. Only then flip `paused=false`.

## 5. CARRIED-FORWARD PENDING
- T-D: GA4 prop 536210909 SA Viewer + Search Console; push GOOGLE_SA_KEY_B64 into ENV_B64.
- T-E: Gmail "Send mail as" founder@ / aman@.
- Brevo activation; rotate reused admin+SMTP password (security, urgent).
- First REAL email approval → release kill-switch (#1 priority once §4 above is done).
- Build backlog: open/click tracking, Touch 4/5, reply approve→auto-send, per-relay reputation bars.

## 6. KNOWN GAP — the 6 existing real drafts are NOT send-ready
Leads 48/78/83/85/88/92 (UK law firms) have Touch-0 drafts but status='new' (not qualified/queued), no quality_score, no verify_status, 3/6 have no email, and the copy is generic ("could enhance your online presence"). Do not send as-is. Qualify + verify + rewrite first.
