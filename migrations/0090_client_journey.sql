-- Phase 9 · Client journey / CRM layer
-- Canonical lifecycle + acquisition channel + lead type, plus a unified timeline view.

-- 1. Canonical columns -----------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lifecycle_stage   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_channel TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at   TIMESTAMPTZ;

-- 2. Backfill acquisition_channel from source ------------------------------------
UPDATE leads SET acquisition_channel = CASE
  WHEN source ILIKE 'osm%'              THEN 'local_search_osm'
  WHEN source ILIKE 'companies_house%'  THEN 'uk_company_registry'
  WHEN source ILIKE 'gleif%'            THEN 'global_lei_registry'
  WHEN source ILIKE 'sec_edgar%'        THEN 'us_sec_filings'
  WHEN source ILIKE 'manual_lexquity%'  THEN 'manual_lexquity_seed'
  WHEN source ILIKE 'apollo%'           THEN 'apollo_enrichment'
  WHEN source ILIKE 'ad_intel%' OR source ILIKE '%meta%' OR source ILIKE '%google_ads%' THEN 'ad_intelligence'
  WHEN source ILIKE 'phase%' OR source ILIKE '%test%' THEN 'internal_test'
  ELSE COALESCE(source, 'unknown')
END
WHERE acquisition_channel IS NULL;

-- 3. Backfill lead_type from audience / entity_type / sector ---------------------
UPDATE leads SET lead_type = CASE
  WHEN lead_audience = 'lexquity-investor'        THEN 'investor'
  WHEN lead_audience = 'arbitration-institution'  THEN 'institution'
  WHEN sector = 'lexquity-investor'               THEN 'investor'
  WHEN sector IN ('law-firms','professional-services') THEN 'professional_services'
  WHEN sector = 'internal'                          THEN 'internal'
  WHEN sector IS NOT NULL                           THEN 'commercial_' || sector
  ELSE 'commercial_unknown'
END
WHERE lead_type IS NULL;

-- 4. Backfill lifecycle_stage from status ----------------------------------------
UPDATE leads SET lifecycle_stage = CASE
  WHEN replied = TRUE                              THEN 'replied'
  WHEN status ILIKE 'cadence_complete%'            THEN 'nurture_complete'
  WHEN status ILIKE 'touch_%_queued'               THEN 'in_sequence'
  WHEN status ILIKE '%bounced%'                    THEN 'bounced'
  WHEN status ILIKE '%unsub%' OR status ILIKE '%suppress%' THEN 'suppressed'
  WHEN EXISTS (SELECT 1 FROM sends s WHERE s.lead_id = leads.id) THEN 'contacted'
  WHEN EXISTS (SELECT 1 FROM outreach_drafts od WHERE od.lead_id = leads.id) THEN 'drafted'
  ELSE 'sourced'
END
WHERE lifecycle_stage IS NULL;

-- 5. first_contacted_at / last_activity_at ---------------------------------------
UPDATE leads l SET first_contacted_at = sub.first_sent
FROM (SELECT lead_id, MIN(sent_at) AS first_sent FROM sends GROUP BY lead_id) sub
WHERE sub.lead_id = l.id AND l.first_contacted_at IS NULL;

-- 6. Unified timeline view -------------------------------------------------------
CREATE OR REPLACE VIEW client_journey AS
  -- sourcing event
  SELECT l.id AS lead_id, l.company, l.created_at AS ts, 'sourced' AS event_type,
         l.acquisition_channel AS detail, NULL::text AS channel, NULL::text AS meta
  FROM leads l
  UNION ALL
  -- each outbound send
  SELECT s.lead_id, l.company, s.sent_at AS ts, 'email_sent' AS event_type,
         COALESCE(s.subject_used, s.subject, '(no subject)') AS detail,
         COALESCE(s.relay_used, s.relay_name, s.smtp_relay) AS channel,
         'touch ' || COALESCE(s.touch_number::text, s.sequence_step::text, '?') AS meta
  FROM sends s JOIN leads l ON l.id = s.lead_id
  UNION ALL
  -- each inbound reply
  SELECT ie.matched_lead_id AS lead_id, l.company, ie.received_at AS ts, 'reply_received' AS event_type,
         ie.subject AS detail, ie.classification AS channel,
         ie.from_email AS meta
  FROM inbound_emails ie JOIN leads l ON l.id = ie.matched_lead_id
  WHERE ie.matched_lead_id IS NOT NULL
  UNION ALL
  -- each bounce
  SELECT be.lead_id, l.company, be.received_at AS ts, 'bounce' AS event_type,
         be.reason AS detail, be.bounce_type AS channel, be.recipient_email AS meta
  FROM bounce_events be JOIN leads l ON l.id = be.lead_id;
