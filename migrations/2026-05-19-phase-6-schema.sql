-- Phase 6 · personalisation engine production schema
-- Multi-tenant. Cost-tracked. Cache-aware. Hallucination-guarded.

-- Leads columns for the engine output
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalisation_pointers JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalisation_quality_score NUMERIC(4,3);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalisation_generated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_pers_quality ON leads(personalisation_quality_score) WHERE personalisation_quality_score >= 0.7;

-- ============================================================================
-- scanner_cache · idempotent results per (domain, scanner, scanned_at)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scanner_cache (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  domain          VARCHAR(255) NOT NULL,
  scanner         VARCHAR(40)  NOT NULL,
  scanned_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  payload         JSONB        NOT NULL,
  ttl_seconds     INTEGER      NOT NULL DEFAULT 86400,
  fetch_ms        INTEGER,
  http_status     INTEGER,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_scanner_cache_fresh ON scanner_cache(domain, scanner, scanned_at DESC);

-- ============================================================================
-- llm_cost_ledger · every LLM invocation across all clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS llm_cost_ledger (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id         INTEGER REFERENCES leads(id),
  scan_id         BIGINT,
  provider        VARCHAR(40) NOT NULL,
  model           VARCHAR(80) NOT NULL,
  prompt_tokens   INTEGER     NOT NULL DEFAULT 0,
  completion_tokens INTEGER   NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  cost_usd_micro  INTEGER     NOT NULL DEFAULT 0,
  ok              BOOLEAN     NOT NULL DEFAULT TRUE,
  error           TEXT,
  called_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_llm_ledger_lead     ON llm_cost_ledger(lead_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_ledger_workspace_day ON llm_cost_ledger(workspace_id, ((called_at AT TIME ZONE 'UTC')::date));

-- ============================================================================
-- personalisation_scans · one row per S008 full run
-- ============================================================================
CREATE TABLE IF NOT EXISTS personalisation_scans (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id             INTEGER REFERENCES leads(id),
  domain              VARCHAR(255) NOT NULL,
  sector              VARCHAR(50),
  country             VARCHAR(8) DEFAULT 'UK',
  framework_version   VARCHAR(20),
  pointer_count       INTEGER NOT NULL DEFAULT 0,
  pointer_count_p0    INTEGER NOT NULL DEFAULT 0,
  specificity_score   NUMERIC(4,3) NOT NULL DEFAULT 0,
  total_cost_usd_micro INTEGER NOT NULL DEFAULT 0,
  total_latency_ms    INTEGER NOT NULL DEFAULT 0,
  buckets             JSONB,
  status              VARCHAR(20) NOT NULL DEFAULT 'ok',
  error               TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pers_scans_lead    ON personalisation_scans(lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pers_scans_quality ON personalisation_scans(specificity_score DESC);

-- ============================================================================
-- pointer_hallucination_log · audit trail of guard rejections
-- ============================================================================
CREATE TABLE IF NOT EXISTS pointer_hallucination_log (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  scan_id         BIGINT REFERENCES personalisation_scans(id),
  lead_id         INTEGER REFERENCES leads(id),
  bucket          VARCHAR(40),
  rejected_text   TEXT,
  rejection_reason VARCHAR(120),
  rejected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hallucination_recent ON pointer_hallucination_log(rejected_at DESC);

-- ============================================================================
-- scanner_budget_state · per-workspace daily spend ceiling
-- ============================================================================
CREATE TABLE IF NOT EXISTS scanner_budget_state (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  bucket_day      DATE NOT NULL DEFAULT CURRENT_DATE,
  spent_usd_micro INTEGER NOT NULL DEFAULT 0,
  daily_cap_usd_micro INTEGER NOT NULL DEFAULT 500000,
  UNIQUE (workspace_id, bucket_day)
);
