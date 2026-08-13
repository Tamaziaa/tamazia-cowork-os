-- 2026-05-23 · MailDeck mailbox-pool layer (PROJECT-MEMORY §14.8)
-- The cold-sending fleet: 30 Google-Workspace mailboxes on the throwaway lookalike domains.
-- SECURITY: passwords are NOT stored here. They live only in config/maildeck-mailboxes.*
-- (gitignored) or the MAILDECK_MAILBOXES_B64 env var. This table holds identity + ramp + health.
-- Idempotent: safe to run repeatedly (CREATE/ALTER ... IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS mailbox_pool (
  address            VARCHAR(320) PRIMARY KEY,          -- the lookalike from-address (cold only)
  domain             VARCHAR(255) NOT NULL,
  persona_name       VARCHAR(255),
  first_name         VARCHAR(120),
  smtp_host          VARCHAR(255),
  smtp_port          INTEGER,
  imap_host          VARCHAR(255),
  imap_port          INTEGER,
  warmup_started_at  TIMESTAMPTZ DEFAULT NOW(),          -- ramp clock: age in days -> cold/day cap
  status             VARCHAR(30)  DEFAULT 'active',      -- active | paused | retired
  last_used_at       TIMESTAMPTZ,                        -- LRU round-robin key
  consecutive_errors INTEGER      DEFAULT 0,             -- error-backoff counter
  paused_until       TIMESTAMPTZ,                        -- self-renewing backoff window
  paused_reason      TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_pool_domain ON mailbox_pool(domain);
CREATE INDEX IF NOT EXISTS idx_mailbox_pool_status ON mailbox_pool(status);

-- Per-mailbox per-day cold counter (enforces the ramp/ceiling).
CREATE TABLE IF NOT EXISTS mailbox_daily_usage (
  address VARCHAR(320) NOT NULL,
  day     DATE NOT NULL,
  sent    INTEGER DEFAULT 0,
  PRIMARY KEY (address, day)
);

-- Shared fleet dedup: exactly one mailbox "owns" each prospect, so no two inboxes cold-touch the
-- same recipient and follow-up touches always thread from the same inbox.
CREATE TABLE IF NOT EXISTS cold_recipient_log (
  recipient        VARCHAR(320) PRIMARY KEY,
  mailbox_address  VARCHAR(320) NOT NULL,
  message_id       VARCHAR(255),
  sent_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cold_recipient_mailbox ON cold_recipient_log(mailbox_address);

-- Per-inbox attribution on the canonical send log (which physical mailbox sent each cold email).
ALTER TABLE sends ADD COLUMN IF NOT EXISTS mailbox_address VARCHAR(320);
