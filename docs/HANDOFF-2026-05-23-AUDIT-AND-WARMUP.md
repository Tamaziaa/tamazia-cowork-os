# HANDOFF — 2026-05-23c · Live audit + warmup engine + touch fix + final emails
Read PROJECT-MEMORY.md §14.12 first (full detail). This is the quick pickup.

## GROUND TRUTH (audited live via Chrome — MailDeck + PlusVibe)
- Real 6 domains: tamazia.info, tamazia.online, tamazia.store, tamazia.uk, tamaziatop100.com, tamaziaworld.uk. 30 inboxes (5/domain), Delivered.
- 30 inboxes = female personas (firstName.lastName@domain). Roster: config/maildeck-roster.json.
- MailDeck SMTP = "coming soon". Credential export = not functional (addresses+names exposed via /api/orders, but NO passwords). Order detail stuck loading.
- MailDeck Prewarm = a marketplace, not our-inbox warmup. PlusVibe connected but EMPTY (0 inboxes, 0 profiles) → nothing is warming.

## THE ONE BLOCKER
The 30 inbox app-passwords are not retrievable from MailDeck yet. Warmup + cold + first-send all wait on this. It is a vendor blocker, not code.
ACTION: message MailDeck support (Intercom, bottom-right in app) — draft:
  "Order cc8f4328 (Google Workspace, 30 inboxes) shows Delivered and 'credentials available for export', but Exports is empty, the order-details view is stuck loading, and the SMTP page is 'coming soon'. Please send the per-inbox SMTP/IMAP credentials (or app passwords) so I can connect them. Thanks."

## BUILT THIS SESSION (tested)
- src/lib/notify/warmup-engine.js — £0 peer-to-peer warmup (our 30 inboxes warm each other; ramp + reply + spam-rescue). Runs when creds load. migrations/2026-05-23-warmup-engine.sql.
- scripts/qualify-and-queue.js — eligibility broadened; touch cadence now fires for real leads (0 → 32 emailable unlocked). Root cause of "touches not working".
- templates/FINAL-SEQUENCE-PROFESSIONAL-SERVICES.md — final persona-sent Touch 0-3 for UK law firms (King's anchor, real pains/USPs/hooks, deliverability-safe).
- scripts/setup-lookalike-catchall.js — real-6-domains default.
- config/maildeck-roster.json — 30-inbox identity roster.
- Verified: pool suite 33/33, warmup pure-logic 6/6, all syntax clean.

## WHEN CREDS ARRIVE (one path, sequencer-free, £0)
1. Save the creds CSV → config/maildeck-mailboxes.csv → node scripts/load-maildeck-creds.js --write-env → re-push ENV_B64.
2. Apply migrations (mailbox-pool + warmup) — the loader ensures the pool schema; run the warmup SQL too.
3. Start warmup: node src/lib/notify/warmup-engine.js --send / --receive (add to the cycle). ~15 days.
4. Reply capture: point lookalike nameservers to Cloudflare → node scripts/setup-lookalike-catchall.js (one verify click).
5. Run enrich + qualify on the 32 leads → load FINAL-SEQUENCE Touch 0 → dry-run → approve first email → flip system_state.paused=false.

## DEFERRED (next session)
- Fasthosts: confirm lookalike nameservers are on Cloudflare (catch-all prerequisite).
- 30 GitHub repos + prior-chat transcript deep sync.
- Live qualify/enrich run on the 32 unlocked leads.
- Carried-forward: GA4/GSC SA grant, Gmail send-as, Brevo activation, rotate reused admin+SMTP password.
