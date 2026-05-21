-- Phase 5 · audit micro-site data layer.
-- Multi-tenant (workspace_id), HMAC-signed URLs, full engagement audit trail,
-- versioned proposals, performance-budget enforcement.

-- ============================================================================
-- audit_pages · one row per generated /audit/{slug}/{hash} page
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_pages (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        INTEGER     NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id             INTEGER     REFERENCES leads(id),
  slug                VARCHAR(120) NOT NULL,
  hash                VARCHAR(16)  NOT NULL,
  domain              VARCHAR(255) NOT NULL,
  sector              VARCHAR(50)  NOT NULL,
  country             VARCHAR(8)   NOT NULL DEFAULT 'UK',
  framework_version   VARCHAR(20)  NOT NULL,
  payload_json        JSONB        NOT NULL,
  generated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  status              VARCHAR(20)  NOT NULL DEFAULT 'live',
  archived_at         TIMESTAMPTZ,
  pdf_url             VARCHAR(500),
  share_card_url      VARCHAR(500),
  open_count          INTEGER      NOT NULL DEFAULT 0,
  last_opened_at      TIMESTAMPTZ,
  high_intent_at      TIMESTAMPTZ,
  UNIQUE (slug, hash)
);
CREATE INDEX IF NOT EXISTS idx_audit_pages_lead     ON audit_pages(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_pages_active   ON audit_pages(status, expires_at) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_audit_pages_workspace ON audit_pages(workspace_id, generated_at DESC);

-- ============================================================================
-- audit_events · client-side telemetry per audit page (5.5.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  audit_page_id   BIGINT  NOT NULL REFERENCES audit_pages(id) ON DELETE CASCADE,
  hash            VARCHAR(16) NOT NULL,
  event_type      VARCHAR(40) NOT NULL,
  section_id      VARCHAR(40),
  dwell_ms        INTEGER,
  scroll_pct      INTEGER,
  user_agent      VARCHAR(500),
  ip_hash         VARCHAR(64),
  referer         VARCHAR(500),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_page    ON audit_events(audit_page_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type    ON audit_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_recent  ON audit_events(occurred_at DESC);

-- ============================================================================
-- proposal_versions · versioned proposal PDFs per audit (5.9.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS proposal_versions (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  audit_page_id   BIGINT  REFERENCES audit_pages(id),
  lead_id         INTEGER REFERENCES leads(id),
  version         INTEGER NOT NULL DEFAULT 1,
  template_id     VARCHAR(80) NOT NULL,
  pdf_url         VARCHAR(500),
  total_value_gbp NUMERIC(10,2),
  tier_chosen     VARCHAR(40),
  body_text       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at   TIMESTAMPTZ,
  notes           TEXT,
  UNIQUE (audit_page_id, version)
);
CREATE INDEX IF NOT EXISTS idx_pv_audit ON proposal_versions(audit_page_id, version DESC);

-- ============================================================================
-- performance_budgets · per-page Lighthouse-style budgets (5.10.1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS performance_budgets (
  id              BIGSERIAL PRIMARY KEY,
  page_path       VARCHAR(120) NOT NULL,
  metric          VARCHAR(40)  NOT NULL,
  target_value    NUMERIC(10,2) NOT NULL,
  last_observed   NUMERIC(10,2),
  last_checked_at TIMESTAMPTZ,
  status          VARCHAR(20)  NOT NULL DEFAULT 'ok',
  UNIQUE (page_path, metric)
);

-- Seed performance budgets for the audit page path
INSERT INTO performance_budgets (page_path, metric, target_value) VALUES
  ('/audit/{slug}/{hash}', 'LCP_ms',        2500),
  ('/audit/{slug}/{hash}', 'INP_ms',        200),
  ('/audit/{slug}/{hash}', 'CLS',           0.10),
  ('/audit/{slug}/{hash}', 'JS_kb',         180),
  ('/audit/{slug}/{hash}', 'CSS_kb',        80),
  ('/audit/{slug}/{hash}', 'TBT_ms',        300),
  ('/audit/{slug}/{hash}', 'A11Y_score',    95),
  ('/audit/{slug}/{hash}', 'SEO_score',     95)
ON CONFLICT (page_path, metric) DO NOTHING;

-- ============================================================================
-- audit_dashboard view · pipeline-style aggregation
-- ============================================================================
CREATE OR REPLACE VIEW audit_dashboard AS
SELECT
  ap.id, ap.lead_id, ap.workspace_id, ap.slug, ap.hash, ap.domain, ap.sector, ap.country,
  ap.generated_at, ap.expires_at, ap.status, ap.open_count, ap.last_opened_at, ap.high_intent_at,
  (SELECT COUNT(*) FROM audit_events ae WHERE ae.audit_page_id = ap.id)                                AS total_events,
  (SELECT COUNT(*) FROM audit_events ae WHERE ae.audit_page_id = ap.id AND ae.event_type = 'open')      AS opens,
  (SELECT COUNT(*) FROM audit_events ae WHERE ae.audit_page_id = ap.id AND ae.event_type = 'pdf_download') AS pdf_downloads,
  (SELECT COUNT(*) FROM audit_events ae WHERE ae.audit_page_id = ap.id AND ae.event_type = 'cta_click')    AS cta_clicks,
  (SELECT COUNT(*) FROM audit_events ae WHERE ae.audit_page_id = ap.id AND ae.event_type = 'cal_iframe_open') AS calendar_opens,
  (SELECT MAX(occurred_at) FROM audit_events ae WHERE ae.audit_page_id = ap.id)                          AS last_activity_at,
  (SELECT COUNT(*) FROM proposal_versions pv WHERE pv.audit_page_id = ap.id)                            AS proposal_versions_count
FROM audit_pages ap;
