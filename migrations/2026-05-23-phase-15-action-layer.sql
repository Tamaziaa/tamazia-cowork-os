-- 2026-05-23 · PHASE 15 · OPERATIONS RESILIENCE / ACTION LAYER (foundation)
-- Core tables for the human action layer + disaster-recovery scaffolding:
--   - aman_actions       : the legal/compliance trail of every significant human action in Cowork
--                          (the human action QUEUE + audit log). Schema mirrors the phase doc exactly.
--   - api_key_rotations  : log of API-key rotations (S046 api-key-rotator)
--   - audit_trail_exports: log of generated audit-trail exports (S049, GDPR/SAR/regulator requests)
--   - dr_drills          : quarterly disaster-recovery drill results (15.3.2)
--   - decision_rollbacks : reversed decisions trail (15.7.2)
--
-- Idempotent: every object uses IF NOT EXISTS. No data mutation. leads.id is INTEGER.

-- ---------------------------------------------------------------------------------------------
-- 15.7.1 · aman_actions — every significant Aman action in Cowork (legal/compliance trail).
-- Schema mirrors the phase doc EXACTLY (action_type / context jsonb / performed_at / source /
-- outcome), with a few additive columns to make it usable as a human ACTION QUEUE: a status so
-- an item can be open/done, an optional lead reference, and an importance/priority for triage.
-- The additive columns are nullable / defaulted so the doc's exact INSERT shape still works.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aman_actions (
  id            SERIAL PRIMARY KEY,
  action_type   VARCHAR(50)  NOT NULL,              -- approve_reply | approve_audit | override_task | ...
  context       JSONB        NOT NULL,              -- full payload: content, reasoning, ids, etc.
  performed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  source        VARCHAR(50)  NOT NULL,              -- slack | telegram | cowork | dashboard | system
  outcome       VARCHAR(30),                        -- approved | rejected | done | pending | cancelled
  -- additive (action-queue) columns ----------------------------------------------------------
  status        VARCHAR(20)  DEFAULT 'open',        -- open | done | dismissed
  priority      VARCHAR(10)  DEFAULT 'normal',      -- p0 | p1 | normal | low
  lead_id       INTEGER REFERENCES leads(id),       -- optional subject lead
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aman_actions_status ON aman_actions(status);
CREATE INDEX IF NOT EXISTS idx_aman_actions_type   ON aman_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_aman_actions_lead   ON aman_actions(lead_id);

-- ---------------------------------------------------------------------------------------------
-- 15.1 · api_key_rotations — log of every credential rotation (S046 api-key-rotator)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_key_rotations (
  id            SERIAL PRIMARY KEY,
  service       VARCHAR(60) NOT NULL,               -- resend | smtp2go | hunter | slack | telegram | ...
  rotated_at    TIMESTAMPTZ DEFAULT NOW(),
  grace_until   TIMESTAMPTZ,                         -- 24h dual-key grace window
  old_key_fingerprint VARCHAR(64),                   -- sha256 of old key (NEVER the key itself)
  new_key_fingerprint VARCHAR(64),
  rotated_by    VARCHAR(60) DEFAULT 'system',        -- system | aman
  method        VARCHAR(30) DEFAULT 'manual',        -- api | manual
  status        VARCHAR(30) DEFAULT 'rotated',        -- rotated | grace | revoked | manual_pending
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_keyrot_service ON api_key_rotations(service);

-- ---------------------------------------------------------------------------------------------
-- 15.4 · audit_trail_exports — log of generated audit-trail exports (S049)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail_exports (
  id            SERIAL PRIMARY KEY,
  scope         VARCHAR(40),                          -- lead | all
  lead_id       INTEGER REFERENCES leads(id),
  period_start  DATE,
  period_end    DATE,
  reason        VARCHAR(60),                          -- dpia | sar | regulator | subpoena | internal
  export_file   TEXT,
  row_count     INTEGER,
  signature     VARCHAR(128),                         -- cryptographic signature of the output
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------------------------
-- 15.3.2 · dr_drills — quarterly disaster-recovery drill results
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dr_drills (
  id            SERIAL PRIMARY KEY,
  quarter       VARCHAR(10),                          -- 2026-Q2
  scenario      VARCHAR(120),
  target_minutes INTEGER,
  actual_minutes INTEGER,
  passed        BOOLEAN,
  gaps          JSONB DEFAULT '[]'::jsonb,
  report_file   TEXT,
  ran_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------------------------
-- 15.7.2 · decision_rollbacks — reversed decisions trail
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_rollbacks (
  id            SERIAL PRIMARY KEY,
  decision_id   INTEGER,                              -- references decisions(id) when that table exists
  reversed_at   TIMESTAMPTZ DEFAULT NOW(),
  reversal_reason TEXT,
  downstream_impact JSONB DEFAULT '[]'::jsonb,
  reversed_by   VARCHAR(60) DEFAULT 'aman',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
