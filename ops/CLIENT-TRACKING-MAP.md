# Client tracking map — end-to-end lens (WS6)

How one client's record threads through every pipeline stage, keyed on **`lead_ref` (TZ-NNNNNN)**, plus
the broken links found while wiring it. Built 2026-06-15. All column names verified against the LIVE Neon
schema (`information_schema.columns`) before use — nothing here is guessed.

Lens artefact: `migrations/2026-06-15-client-record.sql` → view **`v_client_record`** (one row per lead,
created + verified live: 8854 view rows == 8854 leads rows, no fan-out).

---

## The chain (keys that thread it)

```
                        leads.lead_ref  (TZ-NNNNNN, text, UNIQUE — the client key)
                        leads.id        (integer PK — the hard FK every stage joins on)
                              │
   ┌──────────────┬──────────┼───────────────┬────────────────┬───────────────────┐
   │              │          │               │                │                   │
 MINT          TOUCH        TOUCH          REPLY            BOOK              WEBSITE JOURNEY
audit_pages  outreach_drafts sends      inbound_emails    cal_bookings        audit_intents
 .lead_id      .lead_id      .lead_id    .matched_lead_id   .lead_id          (.audit_slug only)
   = leads.id    = leads.id    = leads.id   = leads.id        = leads.id        ↕ leads.audit_slug
```

| Stage | Table | Link key → `leads` | Live rows | Linked to a lead? |
|------|-------|--------------------|-----------|-------------------|
| Spine | `leads` | `lead_ref` / `id` | 8,854 (8,806 with `lead_ref`) | — |
| Mint | `audit_pages` | `lead_id = leads.id` | 335 | 222 leads linked; **84 rows have `lead_id IS NULL`** (finding #1) |
| Touch (draft) | `outreach_drafts` | `lead_id = leads.id` | 516 | **516/516 linked — INTACT** |
| Touch (send) | `sends` | `lead_id = leads.id` | 184 | **0/184 linked** (finding #2) |
| Reply | `inbound_emails` | `matched_lead_id = leads.id` | 834 | **0/834 matched** (finding #3) |
| Book | `cal_bookings` | `lead_id = leads.id` | 0 | table empty — webhook writes KV only (finding #5) |
| Website journey | `audit_intents` | `audit_slug` (soft) | 0 | **no `lead_id`/`lead_ref` column** (finding #6) |

The lead's own forward pointers also carry the mint link: `leads.audit_url`, `leads.audit_slug`,
`leads.audit_hash` (set by the mint path). `v_client_record` exposes both the lead-side pointer
(`lead_audit_slug`/`lead_audit_hash`) and the authoritative `audit_pages` side (`audit_slug`/`audit_hash`)
so the two can be reconciled.

---

## `v_client_record` columns (one row per `lead_ref`)

- **identity/spine** (leads): `lead_ref`, `lead_id`, `company`, `domain`, `sector`, `sector_code`, `icp_tier`, `lifecycle_stage`, `quality_score`, `contact_name`, `contact_email`
- **gate/readiness** (leads): `governor_released_at`, `claude_cleared`, `mystrika_pushed`, `replied`, `last_reply_received_at`
- **lead-side audit pointer** (leads): `audit_url`, `lead_audit_slug`, `lead_audit_hash`
- **mint** (audit_pages, latest of N): `audit_hash`, `audit_slug`, `audit_domain`, `audit_generated_at`, `audit_expires_at`, `audit_payload_domain` (`payload_json->>'domain'`), `audit_open_count`, `audit_count`
- **touches** (outreach_drafts): `draft_count`, `last_draft_at` · (sends): `send_count`, `last_sent_at`, `latest_touch_number`
- **reply** (inbound_emails): `reply_count`, `last_reply_at`
- **booking** (cal_bookings): `booking_count`, `last_booking_at`, `last_booking_status`
- **website journey** (audit_intents, slug-keyed): `website_intent_count`, `last_intent_at`, `last_intent_top_finding`

All non-spine columns come through `LEFT JOIN LATERAL` aggregates + `COALESCE`, so a lead at any stage
(even `sourced` with nothing downstream) returns exactly one row with zeros, never disappears.

`bounce_events` (exists, `lead_id`-keyed) is intentionally omitted — the forward-chain lens stays focused
on mint→touch→send→reply→book; the existing `client_journey` view (`migrations/0090_client_journey.sql`)
already carries bounces on the per-event timeline.

---

## BROKEN LINKS (numbered findings)

### #1 — `audit_pages`: 84 of 335 rows have `lead_id IS NULL` (audits not tied back to a lead)
- **Evidence:** `SELECT count(*) FROM audit_pages WHERE lead_id IS NULL` → 84. Distinct linked leads = 222.
- **Impact:** ~25% of minted audits cannot be attributed to a client in `v_client_record`. The audit exists (hash/slug/domain) but floats free of the pipeline.
- **Where minted:** `cowork-os/scripts/*mint*` / the mint path. The fix is to always stamp `audit_pages.lead_id` (and ideally `lead_ref`) at mint time. Recommend a one-off backfill matching the 84 orphans to leads by `audit_pages.domain ↔ leads.domain` / `audit_pages.slug ↔ leads.audit_slug`, then enforce non-null going forward.

### #2 — `sends`: all 184 rows have `lead_id IS NULL` (sends not tied to a lead)
- **Evidence:** `SELECT count(*) FROM sends WHERE lead_id IS NOT NULL` → 0. All 184 sends are dated **2026-05-13 → 2026-05-16**, kinds `cold`/`warmup` — legacy/warm-up traffic predating the current lead-aware send path.
- **Not even email-matchable:** `recipient` matches no current `leads.contact_email/email/primary_email` (0 hits) — these recipients aren't in the live lead set.
- **Code is correct going forward:** both `cowork-os/scripts/push-to-mystrika.js:329` and `cowork-os/src/skills/S065-touch-scheduler/scripts/send-due.js:209` `INSERT INTO sends (lead_id, …)`. So new sends WILL carry `lead_id`. The gap is purely the legacy backlog + the fact that SEND is OFF so no new linked rows exist yet.
- **Impact:** `v_client_record.send_count` is 0 for every lead today. It will populate correctly once sending resumes. No schema change needed — the link is by design, just unpopulated.

### #3 — `inbound_emails`: all 834 rows have `matched_lead_id IS NULL` (replies not matched to leads)
- **Evidence:** `SELECT count(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL` → 0; `matched_send_id` also 0; email-based fallback to leads = 0 hits.
- **Matcher exists but was never run on the backlog:** `cowork-os/scripts/match-inbound-replies.js` (M1 in-reply-to→send, M2 from_email→sends.recipient→lead_id, M3 from_email→lead email) is built, idempotent, ADDITIVE (`scripts/match-inbound-replies.js:82-85`), and only fills rows where `matched_lead_id IS NULL`. It has simply not been executed against the existing 834 rows (all still `match_method IS NULL`).
- **Impact:** the reply leg of the chain is dark — `reply_count`/`last_reply_at` are 0 for all leads, and `leads.replied` reflects only what the matcher would set. **FIX: run `node scripts/match-inbound-replies.js`** (read-mostly, additive) to backfill, then schedule it after each IMAP poll. Note M2 depends on #2 (sends.lead_id), so M3 (direct email match) is the load-bearing path until sends are linked.

### #4 — lead-side audit pointer vs `audit_pages` can diverge
- `leads.audit_slug`/`audit_hash` (forward pointer, set by mint) and `audit_pages.slug`/`hash` (the row itself) are two independent writes. `v_client_record` surfaces both (`lead_audit_slug`/`lead_audit_hash` vs `audit_slug`/`audit_hash`) precisely so a reconcile job can flag mismatches (e.g. lead points at a slug with no `audit_pages` row, or vice-versa). Not yet reconciled — observational finding.

### #5 — `cal_bookings` is empty: the cal.com webhook writes KV only, never Neon (website repo)
- See website finding W-3 below. `cal_bookings` table exists and is `lead_id`-keyed, but 0 rows because nothing writes it. Booking leg of the chain is structurally present but unfed.

### #6 — `audit_intents` has no `lead_id`/`lead_ref` (website→audit→lead link is soft only)
- See website finding W-2 below. `v_client_record` joins it on `audit_slug` as a stopgap; a hard key is needed.

---

## WEBSITE FOLLOW-UPS (cross-repo — coordinator to action; website is READ-ONLY here)

The website is `tamazia-website` (Cloudflare Pages Functions). It writes leads to Neon via one shared
helper. Reviewed: `functions/_lib/neon-sync.js`, `functions/api/contact.js`, `functions/api/briefings.js`,
`functions/api/audit.js`, `functions/api/intent.js`, `functions/api/cal-webhook.js`.

### W-1 — website form leads land with NO `lead_ref` and NO audit link-back
- **File:** `tamazia-website/functions/_lib/neon-sync.js:16` — the only `INSERT INTO leads` from the site.
  Columns inserted: `company, domain, contact_email, sector, acquisition_channel, lead_type, lifecycle_stage, status, contact_first, personalisation_pointers, created_at, updated_at`.
- **Gaps:**
  1. **No `lead_ref`** — a website-originated lead has no stable client key until something downstream mints one. It will show in `v_client_record` with `lead_ref = NULL` (48 such leads exist today).
  2. **No audit link-back** — when a cold recipient who was sent a minted `/audit/<slug>` later submits `contact`/`briefings`, the insert captures **none** of `audit_slug` / `audit_hash` / `audit_domain` / `top_finding`. `domain` is derived heuristically from the audit-input or the email domain (`neon-sync.js:11`), which is not the audit key. So a website conversion cannot be tied to the audit that drove it.
- **Exact change needed (coordinator):** in `neon-sync.js`, read `body['audit-slug']` / `body.audit_slug` / `body.top_finding` (and the `tamazia_last_request_id` cookie set at `contact.js:99` / `briefings.js:107`) and either (a) add them to the INSERT into existing `leads` columns (`audit_slug`, `audit_hash`, `top_finding` all exist on `leads`), or (b) write an `audit_intents` row (see W-2). The minted audit pages must also surface the slug into the form payload (hidden field) so the browser actually posts it.

### W-2 — `audit_intents` (the website's real audit-capture table) has no lead key
- **File:** `tamazia-website/functions/api/intent.js:92` (table DDL) + `:165` (INSERT). It records `audit_domain, audit_slug, top_finding, buyer_role, timeline, revenue_band, …` — i.e. it DOES capture the audit the visitor came from. But there is **no `lead_id` / `lead_ref` column**, so intent → lead is only joinable on the soft `audit_slug`.
- **Exact change needed (coordinator):** add `lead_ref text` (and/or `lead_id`) to the `audit_intents` DDL in `intent.js` and populate it — resolve `lead_ref` server-side from `audit_slug` (look up `audit_pages.slug → lead_id → leads.lead_ref`) before the INSERT at `intent.js:165`. Then `v_client_record` can join `audit_intents` on the hard key instead of the slug. (Neon change is ADDITIVE — a new nullable column.)

### W-3 — cal.com booking webhook never writes the Neon `cal_bookings` table
- **File:** `tamazia-website/functions/api/cal-webhook.js` — persists the booking to **KV only** (`bookings:`, `cal-uid:`, `cal-bid:`, `cal-ical:`, `email-bookings:` keys at `:129`–`:144`). There is **no Neon code in the file at all** (zero `NEON`/`/sql` references) and no `lead_id`/`lead_ref` capture.
- **Impact:** `cal_bookings` stays at 0 rows, so the booking leg of `v_client_record` is permanently empty even when bookings happen. Matches the known CLAUDE.md note "cal_bookings=0 (webhook writes KV only → fix)".
- **Exact change needed (coordinator):** in `cal-webhook.js`, after the KV writes, add a fail-open `INSERT INTO cal_bookings (cal_event_id, event_type, attendee_name, attendee_email, attendee_company, start_at, end_at, status, lead_id, created_at)` via the Neon `/sql` endpoint (same pattern as `neon-sync.js`), resolving `lead_id` from `attendee_email ↔ leads.contact_email/email/primary_email`. The booking's `request_id` already links it to the originating form submission in KV, which can carry the audit slug forward (ties booking → audit → lead end-to-end).

---

## Verification commands (read-only)

```bash
# columns of any table (the verify-before-use rule)
node scripts/_ws6_sql.mjs "SELECT * FROM v_client_record LIMIT 0"

# the WS6 acceptance query
node scripts/_ws6_sql.mjs "SELECT lead_ref, company, lifecycle_stage, claude_cleared FROM v_client_record LIMIT 5"

# row integrity (must equal leads count — proves one row per client, no fan-out)
node scripts/_ws6_sql.mjs "SELECT (SELECT count(*) FROM v_client_record) AS v, (SELECT count(*) FROM leads) AS l"

# stage coverage today
node scripts/_ws6_sql.mjs "SELECT count(*) FILTER (WHERE audit_count>0) audits, count(*) FILTER (WHERE draft_count>0) drafts, count(*) FILTER (WHERE send_count>0) sends, count(*) FILTER (WHERE reply_count>0) replies FROM v_client_record"
```
