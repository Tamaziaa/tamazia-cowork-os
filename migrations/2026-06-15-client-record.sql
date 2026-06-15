-- WS6 · Client-record lens — end-to-end per-client tracking keyed on lead_ref (TZ-NNNNNN)
-- ADDITIVE + READ-ONLY: a single CREATE OR REPLACE VIEW. Writes no data, creates no table,
-- touches NONE of the off-limits families (audit_*/compliance_*/framework_*/classifier_*/pointer_*/scanner_cache).
-- (audit_pages and audit_intents are agency-owned audit-delivery tables, NOT the off-limits audit_* engine
--  family — they carry lead_id / audit_slug and are the agency side of the chain; safe to read.)
--
-- One row per client. Threads the per-stage facts into a single record:
--   leads (spine)  →  audit_pages (mint)  →  outreach_drafts + sends (touches)  →  inbound_emails (reply)
--                  →  cal_bookings (booking)  →  audit_intents (website visitor journey, slug-keyed)
--
-- Every join is a LEFT JOIN and every roll-up is COALESCE'd, so a lead at ANY stage still returns one row.
-- Column names below were each verified against the LIVE Neon schema on 2026-06-15 (information_schema.columns);
-- no column is referenced without first confirming it exists.
--
-- Apply (safe — additive, no data touched):  psql "$NEON_URL" -f migrations/2026-06-15-client-record.sql
--                                       or:  node scripts/_ws6_sql.mjs "<the CREATE OR REPLACE VIEW ...>"

CREATE OR REPLACE VIEW v_client_record AS
SELECT
  -- ── identity / spine (from leads) ──
  l.lead_ref,                                            -- text, the stable client key TZ-NNNNNN
  l.id                              AS lead_id,           -- integer PK, the hard FK every stage joins on
  l.company,
  l.domain,
  l.sector,
  l.sector_code,
  l.icp_tier,
  l.lifecycle_stage,
  l.quality_score,
  l.contact_name,
  l.contact_email,

  -- ── gate / send-readiness flags (from leads) ──
  l.governor_released_at,
  COALESCE(l.claude_cleared, false)   AS claude_cleared,  -- MASTER Layer-3 send gate
  COALESCE(l.mystrika_pushed, false)  AS mystrika_pushed,
  COALESCE(l.replied, false)          AS replied,
  l.last_reply_received_at,

  -- ── lead's own pointer to its audit (set by the mint path on leads) ──
  l.audit_url,
  l.audit_slug                        AS lead_audit_slug,
  l.audit_hash                        AS lead_audit_hash,

  -- ── MINT: latest audit_pages row for this lead (LEFT JOIN on lead_id; a lead may have many, take newest) ──
  ap.audit_hash                       AS audit_hash,
  ap.audit_slug                       AS audit_slug,
  ap.audit_domain                     AS audit_domain,
  ap.audit_generated_at,
  ap.audit_expires_at,
  ap.audit_payload_domain,                              -- domain stored inside payload_json (link-integrity check)
  ap.audit_open_count,
  COALESCE(ap.audit_count, 0)         AS audit_count,    -- how many audit_pages this lead has

  -- ── TOUCHES: drafts authored (outreach_drafts) ──
  COALESCE(od.draft_count, 0)         AS draft_count,
  od.last_draft_at,

  -- ── TOUCHES: emails actually sent (sends); touch_number is the cadence step ──
  COALESCE(sd.send_count, 0)          AS send_count,
  sd.last_sent_at,
  sd.latest_touch_number,

  -- ── REPLY: inbound emails matched back to this lead (inbound_emails.matched_lead_id) ──
  COALESCE(ie.reply_count, 0)         AS reply_count,
  ie.last_reply_at,

  -- ── BOOKING: cal_bookings rows for this lead (LEFT JOIN on lead_id) ──
  COALESCE(cb.booking_count, 0)       AS booking_count,
  cb.last_booking_at,
  cb.last_booking_status,

  -- ── WEBSITE JOURNEY: audit_intents captured on the minted /audit/<slug> page.
  --    audit_intents has NO lead_id/lead_ref (see ops/CLIENT-TRACKING-MAP.md finding #6), so this
  --    leg is joined on the soft key audit_slug (lead.audit_slug ↔ audit_intents.audit_slug). ──
  COALESCE(ai.intent_count, 0)        AS website_intent_count,
  ai.last_intent_at,
  ai.last_intent_top_finding

FROM leads l

-- MINT: collapse this lead's audit_pages to one row (latest by generated_at) + a count.
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                   AS audit_count,
    (array_agg(ap2.hash        ORDER BY ap2.generated_at DESC))[1] AS audit_hash,
    (array_agg(ap2.slug        ORDER BY ap2.generated_at DESC))[1] AS audit_slug,
    (array_agg(ap2.domain      ORDER BY ap2.generated_at DESC))[1] AS audit_domain,
    max(ap2.generated_at)                                      AS audit_generated_at,
    (array_agg(ap2.expires_at  ORDER BY ap2.generated_at DESC))[1] AS audit_expires_at,
    (array_agg(ap2.payload_json ->> 'domain' ORDER BY ap2.generated_at DESC))[1] AS audit_payload_domain,
    sum(COALESCE(ap2.open_count, 0))                           AS audit_open_count
  FROM audit_pages ap2
  WHERE ap2.lead_id = l.id
) ap ON true

-- TOUCHES (drafts): outreach_drafts is fully lead_id-keyed.
LEFT JOIN LATERAL (
  SELECT count(*) AS draft_count, max(od2.generated_at) AS last_draft_at
  FROM outreach_drafts od2
  WHERE od2.lead_id = l.id
) od ON true

-- TOUCHES (sends): sends carries touch_number (cadence step) and sent_at.
LEFT JOIN LATERAL (
  SELECT count(*) AS send_count, max(s2.sent_at) AS last_sent_at, max(s2.touch_number) AS latest_touch_number
  FROM sends s2
  WHERE s2.lead_id = l.id
) sd ON true

-- REPLY: inbound_emails matched to the lead via matched_lead_id.
LEFT JOIN LATERAL (
  SELECT count(*) AS reply_count, max(ie2.received_at) AS last_reply_at
  FROM inbound_emails ie2
  WHERE ie2.matched_lead_id = l.id
) ie ON true

-- BOOKING: cal_bookings via lead_id (table present; currently 0 rows — webhook writes KV only, see finding #5).
LEFT JOIN LATERAL (
  SELECT
    count(*) AS booking_count,
    max(cb2.start_at) AS last_booking_at,
    (array_agg(cb2.status ORDER BY cb2.start_at DESC))[1] AS last_booking_status
  FROM cal_bookings cb2
  WHERE cb2.lead_id = l.id
) cb ON true

-- WEBSITE JOURNEY: audit_intents joined on the soft key audit_slug (no lead_id on that table — finding #6).
LEFT JOIN LATERAL (
  SELECT
    count(*) AS intent_count,
    max(ai2.created_at) AS last_intent_at,
    (array_agg(ai2.top_finding ORDER BY ai2.created_at DESC))[1] AS last_intent_top_finding
  FROM audit_intents ai2
  WHERE l.audit_slug IS NOT NULL AND ai2.audit_slug = l.audit_slug
) ai ON true;

-- read roles (harmless if a role is absent on this DB; both confirmed present 2026-06-15)
GRANT SELECT ON v_client_record TO tamazia_ro;
GRANT SELECT ON v_client_record TO metabase_ro;

-- NOTE: bounce_events exists and is lead_id-keyed; deliberately omitted here to keep the lens focused on the
-- forward chain (mint→touch→send→reply→book). The existing client_journey view (migrations/0090_client_journey.sql)
-- already surfaces bounces on the per-event timeline.
