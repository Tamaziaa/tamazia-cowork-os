-- 2026-05-23 · PHASE 14 · POST-SIGNATURE LIFECYCLE / REVENUE OPS (foundation)
-- Core tables for the post-signature client lifecycle: client accounts, invoicing + payment
-- tracking, structured onboarding, client-success scoring, renewals, upsell, referrals,
-- case studies, win/loss capture and weekly pipeline forecasting.
--
-- Idempotent: every object uses IF NOT EXISTS. leads.id is INTEGER, so all lead/client FKs
-- are INTEGER REFERENCES leads(id). No data mutation beyond reference rows (none required here).
-- This is the schema FOUNDATION the phase doc specifies; the integrations that fill these tables
-- (Zoho Invoice, Documenso/DocuSeal, Slack/Telegram cadences) are wired incrementally on top.

-- ---------------------------------------------------------------------------------------------
-- 14.x · client_accounts — a lead that has become a paying client (the post-signature entity)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_accounts (
  id                SERIAL PRIMARY KEY,
  lead_id           INTEGER REFERENCES leads(id),
  client_slug       VARCHAR(160) UNIQUE,            -- url-safe key used in file paths / case-study urls
  legal_name        VARCHAR(320),
  tier              VARCHAR(40),                     -- e.g. starter | growth | scale (from PURCHASES tiers)
  deal_value        DECIMAL(12,2),                   -- annual contract value
  currency          VARCHAR(3) DEFAULT 'GBP',
  contract_start    DATE,
  contract_end      DATE,                            -- renewal automation reads this
  status            VARCHAR(30) DEFAULT 'active',     -- active | churned | paused | alumni
  health_score      INTEGER,                         -- 0-100, written by S041 client-success-tracker
  account_manager   VARCHAR(120) DEFAULT 'Aman',
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_accounts_lead ON client_accounts(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_accounts_status ON client_accounts(status);
CREATE INDEX IF NOT EXISTS idx_client_accounts_contract_end ON client_accounts(contract_end);

-- ---------------------------------------------------------------------------------------------
-- 14.2 · invoices — schema mirrors the phase doc (Zoho Invoice integration target)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER REFERENCES leads(id),   -- doc specifies REFERENCES leads(id)
  client_account_id INTEGER REFERENCES client_accounts(id),
  zoho_invoice_id   VARCHAR(100),
  invoice_number    VARCHAR(60),
  invoice_kind      VARCHAR(40) DEFAULT 'setup_fee', -- setup_fee | monthly_retainer | milestone
  amount            DECIMAL(10,2),
  currency          VARCHAR(3) DEFAULT 'GBP',
  due_date          DATE,
  sent_at           TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  status            VARCHAR(30) DEFAULT 'draft',     -- draft | sent | paid | overdue | void
  payment_method    VARCHAR(50),
  invoice_url       TEXT,
  line_items        JSONB DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);

-- ---------------------------------------------------------------------------------------------
-- 14.2.2 · payments — payment events against invoices (Zoho payment webhook target)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                SERIAL PRIMARY KEY,
  invoice_id        INTEGER REFERENCES invoices(id),
  amount            DECIMAL(10,2),
  currency          VARCHAR(3) DEFAULT 'GBP',
  paid_at           TIMESTAMPTZ DEFAULT NOW(),
  payment_method    VARCHAR(50),
  external_ref      VARCHAR(120),                    -- gateway / bank reference
  raw_webhook       JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- ---------------------------------------------------------------------------------------------
-- 14.3 · onboarding_tasks — the 30-day structured onboarding flow (S040)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER REFERENCES leads(id),
  client_account_id INTEGER REFERENCES client_accounts(id),
  day_offset        INTEGER NOT NULL,                -- 0,1,7,14,21,30
  title             VARCHAR(200) NOT NULL,
  description       TEXT,
  due_date          DATE,
  status            VARCHAR(30) DEFAULT 'pending',   -- pending | sent | done | overdue | skipped
  needs_aman        BOOLEAN DEFAULT FALSE,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_tasks(status);

-- ---------------------------------------------------------------------------------------------
-- 14.4 · client_health_snapshots — weekly health scoring history (S041)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_health_snapshots (
  id                SERIAL PRIMARY KEY,
  client_account_id INTEGER REFERENCES client_accounts(id),
  client_id         INTEGER REFERENCES leads(id),
  health_score      INTEGER,                         -- 0-100
  band              VARCHAR(10),                     -- green | amber | red
  risk_factors      JSONB DEFAULT '[]'::jsonb,
  upsell_signals    JSONB DEFAULT '[]'::jsonb,
  computed_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_account ON client_health_snapshots(client_account_id);

-- ---------------------------------------------------------------------------------------------
-- 14.5 · renewal_outreach — renewal cadence tracking (S042); doc verifies this table by name
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS renewal_outreach (
  id                SERIAL PRIMARY KEY,
  client_account_id INTEGER REFERENCES client_accounts(id),
  client_id         INTEGER REFERENCES leads(id),
  days_to_renewal   INTEGER,                         -- 60 | 30 | 14 | 7
  stage             VARCHAR(40),                     -- email_60d | reminder_30d | escalation_14d | p0_7d
  channel           VARCHAR(30),                     -- email | slack | telegram
  status            VARCHAR(30) DEFAULT 'scheduled', -- scheduled | sent | responded
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_renewal_account ON renewal_outreach(client_account_id);

-- ---------------------------------------------------------------------------------------------
-- 14.6 · upsell_opportunities — upsell engine output (S043); doc verifies this table by name
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upsell_opportunities (
  id                SERIAL PRIMARY KEY,
  client_account_id INTEGER REFERENCES client_accounts(id),
  client_id         INTEGER REFERENCES leads(id),
  opportunity       VARCHAR(200),
  rationale         TEXT,
  proposed_value    DECIMAL(10,2),
  status            VARCHAR(30) DEFAULT 'identified', -- identified | proposed | won | lost
  converted         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_upsell_account ON upsell_opportunities(client_account_id);

-- ---------------------------------------------------------------------------------------------
-- 14.7 · referrals — referral capture (S044)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referrals (
  id                SERIAL PRIMARY KEY,
  referred_by_lead  INTEGER REFERENCES leads(id),    -- the client who referred
  new_lead_id       INTEGER REFERENCES leads(id),    -- the created lead (if confirmed)
  referred_name     VARCHAR(200),
  referred_company  VARCHAR(320),
  source            VARCHAR(50),                     -- client_comms | refer_form | calendar
  confidence        NUMERIC(4,3),
  status            VARCHAR(30) DEFAULT 'detected',  -- detected | confirmed | converted | dismissed
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_by ON referrals(referred_by_lead);

-- ---------------------------------------------------------------------------------------------
-- 14.8 · case_studies — case study drafts at 90 days (S045)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_studies (
  id                SERIAL PRIMARY KEY,
  client_account_id INTEGER REFERENCES client_accounts(id),
  client_id         INTEGER REFERENCES leads(id),
  slug              VARCHAR(160),
  title             VARCHAR(240),
  narrative         TEXT,
  metrics           JSONB DEFAULT '{}'::jsonb,
  status            VARCHAR(40) DEFAULT 'draft_pending_approval', -- draft_pending_approval | approved | published | declined | anonymous
  published_url     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------------------------
-- 14.9 · win_loss_records — win/loss capture (S021); doc verifies this table by name
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS win_loss_records (
  id                SERIAL PRIMARY KEY,
  lead_id           INTEGER REFERENCES leads(id),
  outcome           VARCHAR(10),                     -- won | lost
  time_to_close_days INTEGER,
  touches_count     INTEGER,
  channels_used     JSONB DEFAULT '[]'::jsonb,
  decisive_factor   TEXT,
  sector_pitch      VARCHAR(120),
  competed_against  VARCHAR(200),
  pricing_tier      VARCHAR(60),
  learnings         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_winloss_outcome ON win_loss_records(outcome);

-- ---------------------------------------------------------------------------------------------
-- 14.10 · forecasts — weekly weighted pipeline forecast snapshots (S022); doc verifies by name
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forecasts (
  id                SERIAL PRIMARY KEY,
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  pipeline_value    DECIMAL(12,2),                   -- raw sum of deal_value across open pipeline
  weighted_value    DECIMAL(12,2),                   -- sum(value × stage probability)
  best_case         DECIMAL(12,2),
  likely_case       DECIMAL(12,2),
  worst_case        DECIMAL(12,2),
  open_deals        INTEGER,
  stage_breakdown   JSONB DEFAULT '{}'::jsonb,       -- {stage: {count, value, weighted}}
  quota             DECIMAL(12,2),
  gap_to_quota      DECIMAL(12,2),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecasts_date ON forecasts(snapshot_date);
