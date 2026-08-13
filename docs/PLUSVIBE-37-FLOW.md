# MailDeck + PlusVibe $37 — full operating flow (no-API workaround)
How the whole machine runs on the cheapest plan. The engine is the brain; PlusVibe is the sending arm.

## THE HARD TRUTH ABOUT $37 (no API)
PlusVibe Personal $37/mo has NO API and NO webhooks (those are Business $77). So we CANNOT pull
replies/stats out of PlusVibe every 15 minutes programmatically. The data flow is push-based:
- ENGINE → PlusVibe: a CSV we upload (one click, ~2 min/day).
- PlusVibe → us: replies live in PlusVibe's Unified Inbox; we work them there (or upgrade to $77 for webhooks).
If you want fully automated reply ingestion into the cockpit, that needs PlusVibe Business $77 OR Smartlead.

## CAPACITY CHECK (verified in-app)
- $37 Personal = 25,000 sends/mo + warmup + UNLIMITED email accounts → covers 30 inboxes and our
  ~13–18k/mo cold volume with headroom. ENOUGH for capacity. (Free trial = 3 inboxes/1,000 emails = NOT enough.)

## BEFORE (engine, runs 24/7 on GitHub Actions every 30 min — already wired, 17 steps)
1. resolve-domains → finds a website for every name-only lead (SERP).
2. scrape-intel → 10-param scrape per firm: all emails, people (names+titles), LinkedIn, Instagram, socials,
   phone, SEO + compliance signals, news, services + derives audit pointers. Sets the contact name.
3. verify-contacts → free email verification.
4. qualify-and-queue → 10-layer score, gate at 60 → lifecycle_stage=qualified.
5. build-audit-pages → real signed /audit/ URL per lead.
6. render-due-leads → S064 renders the 7 personalised touches (named contact, real audit hook, branded footer).
   Result: leads at status=touch_0_queued, each with 7 touches.

## HAND-OFF (one command, then one upload)
7. `node scripts/export-to-plusvibe.js` → writes exports/plusvibe-<stamp>.csv (email leads) and
   *-social.csv (email-hidden leads → LinkedIn/Instagram). Columns: email, names, company, domain,
   linkedin, instagram, all_emails, audit_url, and touch0_subject/body … touch6_subject/body.
8. In PlusVibe (one-time): create a campaign, connect the 30 MailDeck inboxes (rotation on), build a
   7-step sequence where step N = subject {{touchN_subject}} / body {{touchN_body}}, spacing 0/3/7/12/19/28/40 days.
9. Upload the CSV to that campaign. PlusVibe merges each lead's columns → every recipient gets the exact
   body the engine rendered. Turn warmup ON for all inboxes first; only start cold after ~15 days warmed.

## AFTER (replies + tracking)
- Opens/clicks: PlusVibe tracks natively (leave our pixel OFF on plain-text cold — it hurts deliverability).
- Replies: worked in PlusVibe's Unified Inbox. (To mirror into our cockpit automatically → $77 webhooks.)
- Suppression: PlusVibe auto-handles unsubscribes; our footer also offers reply-"stop".

## SENDER IDENTITY (decision)
MailDeck inboxes are female personas. PlusVibe rotates the from-address across them. Our copy signs
"Aman Pareek (King's)". Either (a) accept persona-from + Aman-as-founder-in-body (works, set now), or
(b) set SENDER_SIGNATURE/SENDER_SHORT env to the persona to sign as her. One business call.

## DAILY OPERATING LOOP (your ~5 min/day)
1. Engine runs itself (sourcing → scrape → score → audit → render) 24/7.
2. Once/day: run export-to-plusvibe.js (or schedule it), download the CSV, upload to PlusVibe.
3. Skim PlusVibe Unified Inbox for replies; hot ones → book.
4. Watch deliverability in PlusVibe (bounces <2%, complaints <0.1%); the engine's health-check mirrors infra.

## SCALE NOTE (honest)
"500 leads/day per scraper × 10 sources" = ~5,000 sourced + 5,000 full scrapes/day. GitHub Actions free
minutes (2,000/mo) CANNOT sustain that. Realistic on the free host: a few hundred fully-processed leads/day.
For true 5k/day, move the cycle to a cheap always-on VPS (~$5/mo Hetzner/Pikapod) or paid Actions. Batch
sizes are env-driven (RESOLVE_BATCH, SCRAPE_BATCH, etc.) so you scale by raising them on better hardware.
