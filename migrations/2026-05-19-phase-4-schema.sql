-- Phase 4 · Warmup v6 production schema.
-- Multi-tenant (workspace_id default 1), audit-grade, ISP-aware.

-- ============================================================================
-- alias_health · per-alias rolling health score (4.3.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alias_health (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  alias_id            INTEGER NOT NULL,
  alias_email         VARCHAR(120) NOT NULL,
  checked_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  warmup_day          INTEGER      NOT NULL DEFAULT 0,
  sends_7d            INTEGER      NOT NULL DEFAULT 0,
  bounces_7d          INTEGER      NOT NULL DEFAULT 0,
  complaints_7d       INTEGER      NOT NULL DEFAULT 0,
  opens_7d            INTEGER      NOT NULL DEFAULT 0,
  bounce_rate_7d      NUMERIC(5,4) NOT NULL DEFAULT 0,
  complaint_rate_7d   NUMERIC(5,4) NOT NULL DEFAULT 0,
  open_rate_7d        NUMERIC(5,4) NOT NULL DEFAULT 0,
  mail_tester_score   NUMERIC(3,1),
  mail_tester_at      TIMESTAMPTZ,
  health_score        INTEGER      NOT NULL DEFAULT 100,
  status              VARCHAR(20)  NOT NULL DEFAULT 'active',
  status_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_alias_health_status     ON alias_health(workspace_id, status, alias_id);
CREATE INDEX IF NOT EXISTS idx_alias_health_recent     ON alias_health(alias_id, checked_at DESC);

-- ============================================================================
-- warmup_pairs · canonical conversation corpus (4.1.2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS warmup_pairs (
  id             BIGSERIAL PRIMARY KEY,
  category       VARCHAR(40)  NOT NULL,
  subject        TEXT         NOT NULL,
  body           TEXT         NOT NULL,
  reply_subject  TEXT         NOT NULL,
  reply_body     TEXT         NOT NULL,
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warmup_pairs_active     ON warmup_pairs(category) WHERE active = TRUE;

-- ============================================================================
-- warmup_reply_queue · scheduled reply delivery (4.1.3)
-- ============================================================================
CREATE TABLE IF NOT EXISTS warmup_reply_queue (
  id                    BIGSERIAL PRIMARY KEY,
  workspace_id          INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  original_send_id      BIGINT,
  alias_from_id         INTEGER NOT NULL,
  alias_to_id           INTEGER NOT NULL,
  pair_id               BIGINT REFERENCES warmup_pairs(id),
  scheduled_at          TIMESTAMPTZ NOT NULL,
  sent_at               TIMESTAMPTZ,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  jitter_seconds        INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wrq_pending             ON warmup_reply_queue(scheduled_at) WHERE status = 'pending';

-- ============================================================================
-- isp_placement · inbox-placement heat map per ISP (4.5.4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS isp_placement (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  isp             VARCHAR(40) NOT NULL,
  sample_date     DATE NOT NULL,
  inbox_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  promotions_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  updates_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  spam_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  missing_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  sample_size     INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  UNIQUE (workspace_id, isp, sample_date)
);
CREATE INDEX IF NOT EXISTS idx_isp_placement_recent    ON isp_placement(sample_date DESC);

-- ============================================================================
-- bounce_events · structured bounce capture (4.6.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bounce_events (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id         INTEGER,
  recipient_email VARCHAR(255) NOT NULL,
  relay           VARCHAR(40),
  bounce_type     VARCHAR(20) NOT NULL,
  smtp_code       VARCHAR(10),
  reason          TEXT,
  payload         JSONB,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bounce_recipient        ON bounce_events(recipient_email, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounce_recent           ON bounce_events(received_at DESC);

-- ============================================================================
-- ssl_cert_state · cert monitoring (4.7.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ssl_cert_state (
  id              BIGSERIAL PRIMARY KEY,
  hostname        VARCHAR(255) NOT NULL UNIQUE,
  issuer          VARCHAR(255),
  not_before      TIMESTAMPTZ,
  not_after       TIMESTAMPTZ,
  days_to_expiry  INTEGER,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          VARCHAR(20) NOT NULL DEFAULT 'ok'
);

-- ============================================================================
-- dns_health_state · DNS continuous monitoring (4.8.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dns_health_state (
  id              BIGSERIAL PRIMARY KEY,
  hostname        VARCHAR(255) NOT NULL,
  record_type     VARCHAR(10)  NOT NULL,
  expected_value  TEXT,
  actual_value    TEXT,
  last_checked_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  drift           BOOLEAN      NOT NULL DEFAULT FALSE,
  UNIQUE (hostname, record_type)
);
CREATE INDEX IF NOT EXISTS idx_dns_drift               ON dns_health_state(drift) WHERE drift = TRUE;

-- ============================================================================
-- deliverability_dashboard view · aggregate per workspace
-- ============================================================================
CREATE OR REPLACE VIEW deliverability_dashboard AS
SELECT
  ws.id                                             AS workspace_id,
  ws.name                                           AS workspace_name,
  (SELECT COUNT(*) FROM alias_health ah WHERE ah.workspace_id = ws.id AND ah.status = 'active')        AS aliases_active,
  (SELECT COUNT(*) FROM alias_health ah WHERE ah.workspace_id = ws.id AND ah.status = 'warmup_only')    AS aliases_warmup_only,
  (SELECT COUNT(*) FROM alias_health ah WHERE ah.workspace_id = ws.id AND ah.status = 'rest')           AS aliases_rest,
  (SELECT COUNT(*) FROM alias_health ah WHERE ah.workspace_id = ws.id AND ah.status = 'retired')        AS aliases_retired,
  (SELECT ROUND(AVG(bounce_rate_7d) * 100, 2) FROM alias_health ah WHERE ah.workspace_id = ws.id)        AS avg_bounce_pct_7d,
  (SELECT ROUND(AVG(complaint_rate_7d) * 100, 2) FROM alias_health ah WHERE ah.workspace_id = ws.id)     AS avg_complaint_pct_7d,
  (SELECT COUNT(*) FROM bounce_events b WHERE b.workspace_id = ws.id AND b.received_at > NOW() - INTERVAL '24 hours') AS bounces_24h,
  (SELECT COUNT(*) FROM dns_health_state WHERE drift = TRUE) AS dns_drift_open,
  (SELECT MIN(days_to_expiry) FROM ssl_cert_state) AS ssl_days_to_first_expiry
FROM workspaces ws;
