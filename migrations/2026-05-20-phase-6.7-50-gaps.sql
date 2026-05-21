-- Phase 6.7 · Fill the 50 pipeline gaps surfaced in the cold-email review.
-- Schema-only changes. Code wiring happens in src/lib/* in the same phase.

BEGIN;

-- ============================================================================
-- GAP 6 · STOP keyword suppression + GAP 27 · spam complaint suppression
-- Extend suppression with broader categories.
-- ============================================================================
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'email';
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE INDEX IF NOT EXISTS idx_suppression_email ON suppression(email);
CREATE INDEX IF NOT EXISTS idx_suppression_expires ON suppression(expires_at);
CREATE INDEX IF NOT EXISTS idx_suppression_domain ON suppression(domain) WHERE domain IS NOT NULL;

-- Seed common stop-keyword suppressions inline at runtime (no static seed needed).
-- Suppression check function reused across the engine.

-- ============================================================================
-- GAP 11 · Lead state machine
-- States: pending -> queued -> t0_sent -> t1_due -> t1_sent -> t2_due -> t2_sent -> t3_sent -> closed
-- Terminal: replied, unsubscribed, bounced, manually_handled, suppressed
-- ============================================================================
ALTER TABLE email_sequence_state ADD COLUMN IF NOT EXISTS state_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE email_sequence_state ADD COLUMN IF NOT EXISTS last_alias_id INTEGER REFERENCES aliases(id);
ALTER TABLE email_sequence_state ADD COLUMN IF NOT EXISTS last_message_id VARCHAR(255);
ALTER TABLE email_sequence_state ADD COLUMN IF NOT EXISTS thread_root_message_id VARCHAR(255);

-- ============================================================================
-- GAP 3, 4 · Manual reply detection via IMAP poll (worker writes here)
-- ============================================================================
CREATE TABLE IF NOT EXISTS imap_poll_state (
  id              BIGSERIAL PRIMARY KEY,
  mailbox         VARCHAR(120) NOT NULL UNIQUE,
  last_uid_seen   BIGINT,
  last_polled_at  TIMESTAMPTZ,
  poll_status     VARCHAR(30) DEFAULT 'pending',
  error           TEXT,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS inbound_emails (
  id                 BIGSERIAL PRIMARY KEY,
  workspace_id       INTEGER NOT NULL DEFAULT 1,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mailbox            VARCHAR(120),
  imap_uid           BIGINT,
  from_email         VARCHAR(255) NOT NULL,
  to_email           VARCHAR(255) NOT NULL,
  subject            TEXT,
  in_reply_to        VARCHAR(255),
  message_id         VARCHAR(255),
  thread_id          VARCHAR(255),
  body_plain         TEXT,
  body_html          TEXT,
  matched_lead_id    INTEGER REFERENCES leads(id),
  matched_send_id    BIGINT,
  matched_alias_id   INTEGER REFERENCES aliases(id),
  classification     VARCHAR(40),
  classification_confidence NUMERIC(4,3),
  manual_reply_from_aman BOOLEAN NOT NULL DEFAULT FALSE,
  ooo_detected       BOOLEAN NOT NULL DEFAULT FALSE,
  stop_keyword_detected BOOLEAN NOT NULL DEFAULT FALSE,
  bounce_detected    BOOLEAN NOT NULL DEFAULT FALSE,
  spam_complaint     BOOLEAN NOT NULL DEFAULT FALSE,
  draft_response     TEXT,
  draft_action       VARCHAR(60),
  slack_notification_sent_at TIMESTAMPTZ,
  aman_action        VARCHAR(40),
  aman_action_at     TIMESTAMPTZ,
  UNIQUE (mailbox, imap_uid)
);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_lead ON inbound_emails(matched_lead_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_unactioned ON inbound_emails(received_at DESC) WHERE aman_action IS NULL;

-- ============================================================================
-- GAP 5, 25, 26, 27 · Bounce + spam-complaint tracking per alias
-- ============================================================================
-- bounce_events already exists from Phase 4; extend with alias_id + send_id
ALTER TABLE bounce_events ADD COLUMN IF NOT EXISTS alias_id INTEGER REFERENCES aliases(id);
ALTER TABLE bounce_events ADD COLUMN IF NOT EXISTS send_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_bounce_alias ON bounce_events(alias_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_lead ON bounce_events(lead_id);

-- ============================================================================
-- GAP 13 · LIA register (Legitimate Interest Assessment per send)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lia_register (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      INTEGER NOT NULL DEFAULT 1,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lead_id           INTEGER REFERENCES leads(id),
  send_id           BIGINT,
  purpose           TEXT NOT NULL,
  necessity         TEXT NOT NULL,
  balancing_test    TEXT NOT NULL,
  data_minimisation TEXT NOT NULL,
  retention_period  VARCHAR(60) NOT NULL DEFAULT '180 days',
  lia_signed_by     VARCHAR(120) NOT NULL DEFAULT 'Aman Pareek'
);
CREATE INDEX IF NOT EXISTS idx_lia_lead ON lia_register(lead_id);

-- ============================================================================
-- GAP 18 · Subject A/B allocation with dedup
-- Already supported by template_variants.allocation_pct; add per-domain dedup table.
-- ============================================================================
CREATE TABLE IF NOT EXISTS subject_domain_dedupe (
  domain      VARCHAR(255) NOT NULL,
  touch       INTEGER NOT NULL,
  subject_hash VARCHAR(40) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, touch)
);

-- ============================================================================
-- GAP 33, 34 · Timezone-aware send window + holiday skip
-- ============================================================================
CREATE TABLE IF NOT EXISTS uk_holidays (
  holiday_date DATE PRIMARY KEY,
  title VARCHAR(120),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seed 2026 UK bank holidays (gov.uk source, England & Wales)
INSERT INTO uk_holidays (holiday_date, title) VALUES
  ('2026-01-01', 'New Years Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-06', 'Easter Monday'),
  ('2026-05-04', 'Early May bank holiday'),
  ('2026-05-25', 'Spring bank holiday'),
  ('2026-08-31', 'Summer bank holiday'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-28', 'Boxing Day (substitute)')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- GAP 32 · R2 email archive (Cloudflare) — metadata index only; blobs in R2
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_archive_index (
  id            BIGSERIAL PRIMARY KEY,
  send_id       BIGINT,
  lead_id       INTEGER REFERENCES leads(id),
  alias_id      INTEGER REFERENCES aliases(id),
  direction     VARCHAR(20) NOT NULL,
  r2_key        VARCHAR(255) NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- GAP 50 · Domain typo autocorrect
-- ============================================================================
CREATE TABLE IF NOT EXISTS domain_typo_map (
  typo            VARCHAR(255) PRIMARY KEY,
  corrected       VARCHAR(255) NOT NULL,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.95,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO domain_typo_map (typo, corrected) VALUES
  ('zaryaclinic.co', 'zaryaclinic.com'),
  ('monzo.co', 'monzo.com'),
  ('weightmans.co', 'weightmans.com')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- GAP 47 · Reply velocity dashboard view
-- ============================================================================
CREATE OR REPLACE VIEW reply_velocity_24h AS
SELECT
  COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours') AS replies_24h,
  COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '7 days') AS replies_7d,
  COUNT(*) FILTER (WHERE manual_reply_from_aman = TRUE AND received_at >= NOW() - INTERVAL '24 hours') AS manual_24h,
  COUNT(*) FILTER (WHERE ooo_detected = TRUE AND received_at >= NOW() - INTERVAL '24 hours') AS ooo_24h,
  COUNT(*) FILTER (WHERE bounce_detected = TRUE AND received_at >= NOW() - INTERVAL '24 hours') AS bounces_24h,
  COUNT(*) FILTER (WHERE stop_keyword_detected = TRUE AND received_at >= NOW() - INTERVAL '24 hours') AS stops_24h,
  AVG(EXTRACT(EPOCH FROM (aman_action_at - slack_notification_sent_at))/60.0)
    FILTER (WHERE aman_action_at IS NOT NULL AND slack_notification_sent_at IS NOT NULL AND received_at >= NOW() - INTERVAL '7 days')
    AS avg_aman_response_minutes_7d
FROM inbound_emails;

COMMIT;

-- Summary
SELECT 'tables_created' AS metric, COUNT(*) AS value FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('imap_poll_state','inbound_emails','bounce_events','lia_register','subject_domain_dedupe','uk_holidays','email_archive_index','domain_typo_map');
