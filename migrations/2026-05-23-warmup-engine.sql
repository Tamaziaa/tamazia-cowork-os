-- 2026-05-23 · £0 peer-to-peer warmup engine state (src/lib/notify/warmup-engine.js)
-- Our own 30 inboxes warm each other; no external sequencer. Idempotent.

CREATE TABLE IF NOT EXISTS warmup_daily_usage (
  address VARCHAR(320) NOT NULL,
  day     DATE NOT NULL,
  sent    INTEGER DEFAULT 0,
  PRIMARY KEY (address, day)
);

CREATE TABLE IF NOT EXISTS warmup_log (
  id        SERIAL PRIMARY KEY,
  from_addr VARCHAR(320) NOT NULL,
  to_addr   VARCHAR(320) NOT NULL,
  token     VARCHAR(64),
  subject   TEXT,
  sent_at   TIMESTAMPTZ DEFAULT NOW(),
  replied   BOOLEAN DEFAULT FALSE,
  rescued   BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_warmup_log_to ON warmup_log(to_addr, replied);
CREATE INDEX IF NOT EXISTS idx_warmup_log_token ON warmup_log(token);
