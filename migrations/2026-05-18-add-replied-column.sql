-- Phase 1 Task 1.5.2: add replied + next_touch_date columns + indices on leads.
-- Idempotent via IF NOT EXISTS.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_reply_received_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_touch_date DATE;

CREATE INDEX IF NOT EXISTS idx_leads_replied ON leads(replied) WHERE replied = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_next_touch ON leads(next_touch_date) WHERE replied = FALSE;
