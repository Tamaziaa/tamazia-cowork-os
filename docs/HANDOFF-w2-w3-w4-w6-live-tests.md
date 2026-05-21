# Handoff · W2/W3/W4/W6 live workflow rewires
**Phase 1 tasks**: 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5, 1.5.1
**Status**: overridden in Phase 1 pending live n8n editor work + ZeptoMail admin

## Why these are overridden
The verifications need to run against the LIVE n8n instance at `https://modest-magpie.pikapod.net` and the live ZeptoMail account (Zoho inbound parser). The COWORK-OS-EXECUTION folder is a planning + scaffolding repo; the actual workflow edits happen in the n8n editor with the n8n MCP plugin or Aman's browser session.

Everything is pre-specified and ready to execute as a single Aman session (~90 minutes total).

## 1.2.1 — ZeptoMail webhook → n8n W3 (pivot off broken IMAP)
1. Aman: login to mailadmin.zoho.eu → Inbound Parser → add route for `founder@tamazia.co.uk` → POST to `https://modest-magpie.pikapod.net/webhook/zeptomail-inbound`.
2. Claude (in next n8n session): open W3 (id `terWywZi5b1ClnVp`) → replace IMAP trigger with HTTP Webhook node at path `/webhook/zeptomail-inbound` → parse payload (`from`, `to`, `subject`, `text`, `html`, `headers.in-reply-to`) → pass to existing classifier subflow.
3. Test: from any external account, send a reply to `founder@tamazia.co.uk` referencing a known thread. W3 should fire within 30 seconds and mark `leads.replied = TRUE` for the matching lead.

## 1.2.2 — 10 test leads with friendly inboxes
Per 0.1.13 the Gmail seedlist was deferred to Phase 4. For Phase 1 live test, use Aman's two personal Gmails + create 8 throwaway ProtonMail addresses via http://protonmail.com (Free tier; 1 per session, ~5 min each). Insert:
```sql
INSERT INTO leads (company, domain, email, contact_first, sector, jurisdiction, entity_type, status, test_lead, created_at)
VALUES
  ('Apex Test Hotels', 'example-test-1.co.uk', '<friendly-inbox-1>', 'Aman', 'hospitality', 'uk-eng-wales', 'Ltd', 'test', TRUE, NOW()),
  ('Briar Test Healthcare', 'example-test-2.co.uk', '<friendly-inbox-2>', 'Aman', 'healthcare', 'uk-eng-wales', 'Ltd', 'test', TRUE, NOW()),
  ...  -- 10 total, varied sectors
ON CONFLICT (email) DO UPDATE SET status='test', test_lead=TRUE;
```
Then Phase 4 Warmup spec will reset these / use them.

## 1.2.3 — W2 manual trigger
After 1.2.2 seeded:
```bash
curl -X POST "https://modest-magpie.pikapod.net/webhook/tamazia-send" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual","limit":10,"status":"test"}'
```
Wait 2 minutes. Confirm in Neon: `SELECT COUNT(*) FROM sends WHERE lead_id IN (SELECT id FROM leads WHERE status='test') AND touch=0` returns 10.

## 1.2.4 — W4 follow-up trigger
```sql
UPDATE leads SET next_touch_date = CURRENT_DATE WHERE status='test';
```
Manually trigger W4 from n8n editor (the cron schedule). Wait 2 minutes. Verify 10 touch=1 rows in `sends`.

## 1.2.5 — Reply terminates sequence
1. From any friendly inbox, reply to the last touch=0 email.
2. W3 → ZeptoMail webhook → marks `leads.replied = TRUE` and `leads.status = 'replied'`.
3. Advance the replied lead's `next_touch_date` to today.
4. Trigger W4. The replied lead must receive ZERO further sends.

Hard safety property. Must pass.

## 1.5.1 — W2 guard against replied leads
In n8n W2 (`O16GNYrt3cOLEfMA`), update node 2.2 (lead selection) SELECT to:
```sql
SELECT * FROM leads
WHERE status = 'pending'
  AND replied = FALSE
  AND email NOT IN (SELECT email FROM dnc)
  AND domain NOT IN (SELECT domain FROM dnc_domains)
  AND next_touch_date <= CURRENT_DATE
LIMIT 20
```
Defensive: even if W4 logic regresses, W2 won't accidentally send to replied. The new index `idx_leads_replied` (already created by migration 2026-05-18-add-replied-column.sql) keeps this query fast.

## Verification once Aman applies the above
From COWORK-OS-EXECUTION:
```bash
bash scripts/verify-task.sh 1.2.1
bash scripts/verify-task.sh 1.2.2
bash scripts/verify-task.sh 1.2.3
bash scripts/verify-task.sh 1.2.4
bash scripts/verify-task.sh 1.2.5
bash scripts/verify-task.sh 1.5.1
```
All should flip to VERIFIED.
