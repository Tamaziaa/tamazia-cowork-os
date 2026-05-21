-- Phase 3 · production schema for compose-body hardening + reply machinery
-- Multi-tenant aware (workspace_id), immutable variant history, audit trails, dead-letter queue.
-- Idempotent — every CREATE uses IF NOT EXISTS.

-- ============================================================================
-- workspaces  (G1 multi-tenant ground truth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
INSERT INTO workspaces (id, name) VALUES (1, 'tamazia-internal') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('workspaces','id'), GREATEST(2, (SELECT MAX(id) FROM workspaces)+1));

-- ============================================================================
-- template_variants  (3.1.1, G7 immutable history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS template_variants (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      INTEGER  NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  sector            VARCHAR(50)  NOT NULL,
  touch             INTEGER      NOT NULL CHECK (touch >= 0 AND touch <= 6),
  variant_letter    CHAR(1)      NOT NULL CHECK (variant_letter IN ('A','B','C','D')),
  variant_kind      VARCHAR(30)  NOT NULL DEFAULT 'regulatory',
  body_template     TEXT         NOT NULL,
  subject_template  TEXT         NOT NULL,
  allocation_pct    INTEGER      NOT NULL DEFAULT 33 CHECK (allocation_pct BETWEEN 0 AND 100),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  sends_count       INTEGER      NOT NULL DEFAULT 0,
  replies_count     INTEGER      NOT NULL DEFAULT 0,
  reply_rate_7d     NUMERIC(5,4) NOT NULL DEFAULT 0,
  reply_rate_30d    NUMERIC(5,4) NOT NULL DEFAULT 0,
  archived_at       TIMESTAMPTZ,
  archived_reason   TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, sector, touch, variant_letter)
);
CREATE INDEX IF NOT EXISTS idx_tv_active        ON template_variants(workspace_id, sector, touch) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tv_reply_rate    ON template_variants(reply_rate_7d) WHERE active = TRUE;

-- ============================================================================
-- subject_variants  (3.4.1)  -- separate so a subject can rotate independently of a body
-- ============================================================================
CREATE TABLE IF NOT EXISTS subject_variants (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  sector            VARCHAR(50)  NOT NULL,
  touch             INTEGER      NOT NULL,
  variant_letter    CHAR(1)      NOT NULL,
  subject_template  TEXT         NOT NULL,
  allocation_pct    INTEGER      NOT NULL DEFAULT 50 CHECK (allocation_pct BETWEEN 0 AND 100),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  sends_count       INTEGER      NOT NULL DEFAULT 0,
  opens_count       INTEGER      NOT NULL DEFAULT 0,
  replies_count     INTEGER      NOT NULL DEFAULT 0,
  archived_at       TIMESTAMPTZ,
  archived_reason   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, sector, touch, variant_letter)
);
CREATE INDEX IF NOT EXISTS idx_sv_active        ON subject_variants(workspace_id, sector, touch) WHERE active = TRUE;

-- ============================================================================
-- subject_domain_dedupe  (G8 cross-client subject dedupe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subject_domain_dedupe (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  recipient_domain    VARCHAR(255) NOT NULL,
  subject_normalised  VARCHAR(500) NOT NULL,
  last_used_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (recipient_domain, subject_normalised)
);
CREATE INDEX IF NOT EXISTS idx_sdd_recent ON subject_domain_dedupe(last_used_at DESC);

-- ============================================================================
-- reply_classifications  (3.2.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reply_classifications (
  id                 BIGSERIAL PRIMARY KEY,
  workspace_id       INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id            INTEGER REFERENCES leads(id),
  message_id         VARCHAR(255),
  message_hash       VARCHAR(64)  NOT NULL,
  reply_text_excerpt TEXT,
  category           VARCHAR(40)  NOT NULL,
  confidence         NUMERIC(4,3) NOT NULL,
  reasoning          TEXT,
  classifier_version VARCHAR(20)  NOT NULL DEFAULT 'v1.0.0',
  llm_used           VARCHAR(40),
  classified_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by_aman   BOOLEAN      NOT NULL DEFAULT FALSE,
  review_override    VARCHAR(40),
  UNIQUE (message_hash)
);
CREATE INDEX IF NOT EXISTS idx_rc_lead     ON reply_classifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_rc_category ON reply_classifications(category, classified_at DESC);

-- ============================================================================
-- response_drafts  (3.2.2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS response_drafts (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  reply_classification_id BIGINT REFERENCES reply_classifications(id),
  lead_id             INTEGER REFERENCES leads(id),
  template_id         VARCHAR(80)  NOT NULL,
  draft_body          TEXT         NOT NULL,
  draft_subject       VARCHAR(500),
  word_count          INTEGER,
  forbidden_pass      BOOLEAN      NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'drafted',
  approved_by         VARCHAR(80),
  approved_at         TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  auto_send_eligible  BOOLEAN      NOT NULL DEFAULT FALSE,
  recall_countdown_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rd_lead    ON response_drafts(lead_id);
CREATE INDEX IF NOT EXISTS idx_rd_status  ON response_drafts(status, created_at DESC);

-- ============================================================================
-- response_templates  (3.2.2 — 130 templates seed, 13 categories × 10 sectors)
-- ============================================================================
CREATE TABLE IF NOT EXISTS response_templates (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  template_id     VARCHAR(80) NOT NULL,
  category        VARCHAR(40) NOT NULL,
  sector          VARCHAR(50) NOT NULL,
  body_template   TEXT NOT NULL,
  subject_template VARCHAR(500),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_rt_cat_sector ON response_templates(category, sector) WHERE active = TRUE;

-- ============================================================================
-- classifier_audit_log  (G2 legal defensibility + cost tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS classifier_audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  invocation_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_hash        VARCHAR(64) NOT NULL,
  classifier_version  VARCHAR(20) NOT NULL,
  llm_used            VARCHAR(40),
  llm_latency_ms      INTEGER,
  tokens_in           INTEGER,
  tokens_out          INTEGER,
  cost_usd_micro      INTEGER,
  output_category     VARCHAR(40),
  output_confidence   NUMERIC(4,3),
  fallback_chain      VARCHAR(120),
  cache_hit           BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_cal_hash  ON classifier_audit_log(message_hash, invocation_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_date  ON classifier_audit_log(invocation_at DESC);

-- ============================================================================
-- dead_letter_queue  (G4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  failure_type  VARCHAR(60) NOT NULL,
  payload       JSONB       NOT NULL,
  attempt_count INTEGER     NOT NULL DEFAULT 1,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_dlq_open ON dead_letter_queue(status, last_seen DESC) WHERE status = 'open';

-- ============================================================================
-- send_throttle_state  (G5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS send_throttle_state (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  bucket_hour   TIMESTAMPTZ NOT NULL,
  relay_name    VARCHAR(40) NOT NULL,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  hourly_cap    INTEGER NOT NULL DEFAULT 50,
  daily_cap     INTEGER NOT NULL DEFAULT 500,
  UNIQUE (workspace_id, bucket_hour, relay_name)
);
CREATE INDEX IF NOT EXISTS idx_sts_workspace ON send_throttle_state(workspace_id, bucket_hour DESC);

-- ============================================================================
-- send_aborts  (3.2.4 audit trail for hard-stop guards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS send_aborts (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id       INTEGER REFERENCES leads(id),
  aborted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage         VARCHAR(20) NOT NULL,
  reason        VARCHAR(80) NOT NULL,
  payload       JSONB
);
CREATE INDEX IF NOT EXISTS idx_sa_recent ON send_aborts(aborted_at DESC);

-- ============================================================================
-- sourcing_attribution  (3.6.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sourcing_attribution (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id           INTEGER REFERENCES leads(id),
  source_channel    VARCHAR(40) NOT NULL,
  source_subchannel VARCHAR(80),
  campaign_tag      VARCHAR(80),
  first_touched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_reply_at    TIMESTAMPTZ,
  first_booked_at   TIMESTAMPTZ,
  first_signed_at   TIMESTAMPTZ,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_sa_lead     ON sourcing_attribution(lead_id);
CREATE INDEX IF NOT EXISTS idx_sa_channel  ON sourcing_attribution(source_channel, first_touched_at DESC);

-- ============================================================================
-- variant_reporting view  (3.7.1)
-- ============================================================================
CREATE OR REPLACE VIEW variant_reporting AS
SELECT
  tv.id              AS variant_id,
  tv.workspace_id,
  tv.sector,
  tv.touch,
  tv.variant_letter,
  tv.sends_count,
  tv.replies_count,
  tv.reply_rate_7d,
  tv.reply_rate_30d,
  tv.active,
  COALESCE((
    SELECT COUNT(*) FROM reply_classifications rc
    WHERE rc.workspace_id = tv.workspace_id
      AND rc.classified_at >= NOW() - INTERVAL '30 days'
      AND rc.category IN ('HOT_BOOK','HOT_PRICE')
      AND rc.lead_id IN (
        SELECT s.lead_id FROM sends s
        WHERE s.lead_id IS NOT NULL
      )
  ), 0) AS hot_replies_30d,
  tv.archived_at,
  tv.archived_reason
FROM template_variants tv;

-- Done.
