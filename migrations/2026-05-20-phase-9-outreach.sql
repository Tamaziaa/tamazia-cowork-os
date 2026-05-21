-- Phase 9 · outreach + Cal.com webhook + LexQuity track

-- Outreach drafts (per lead, per channel)
CREATE TABLE IF NOT EXISTS outreach_drafts (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  channel TEXT NOT NULL,             -- 'email' | 'linkedin_connect' | 'linkedin_message' | 'linkedin_voice' | 'linkedin_comment' | 'instagram_dm' | 'instagram_voice'
  draft_subject TEXT,
  draft_body TEXT,
  draft_metadata JSONB,              -- {mutual_connection: ..., post_id: ..., voice_script: ...}
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  send_status TEXT DEFAULT 'pending', -- 'pending' | 'queued' | 'sent' | 'replied' | 'opt_out' | 'failed'
  reply_received_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_lead ON outreach_drafts (lead_id, channel);
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_status ON outreach_drafts (send_status, generated_at DESC);

-- Cal.com bookings
CREATE TABLE IF NOT EXISTS cal_bookings (
  id SERIAL PRIMARY KEY,
  cal_event_id TEXT UNIQUE,
  event_type TEXT,                    -- 'tamazia_discovery' | 'lexquity_investor'
  lead_id INTEGER REFERENCES leads(id),
  attendee_name TEXT,
  attendee_email TEXT,
  attendee_company TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT DEFAULT 'confirmed',    -- 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  pre_call_brief_url TEXT,
  outcome TEXT,                       -- 'go' | 'follow_up' | 'no_go' | 'pending'
  next_step TEXT,
  next_step_due DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cal_bookings_lead ON cal_bookings (lead_id);
CREATE INDEX IF NOT EXISTS idx_cal_bookings_start ON cal_bookings (start_at);

-- Known warm intros (Tamazia clients + LexQuity advisors + accelerator alum)
CREATE TABLE IF NOT EXISTS known_warm_intros (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  linkedin_url TEXT,
  company TEXT,
  affiliation TEXT,                   -- 'tamazia_client' | 'lexquity_advisor' | 'kings_alum' | 'other'
  network_strength INTEGER,           -- 1-10
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with known references
INSERT INTO known_warm_intros (name, company, affiliation, network_strength, notes) VALUES
('Manuel Penadés Fons', 'King''s College London', 'lexquity_advisor', 10, 'LexQuity co-founder; ICC/LCIA proximity; arbitration academic'),
('Kamat Hotels', 'NSE-listed', 'tamazia_client', 9, 'Hospitality reference; multi-property direct-bookings'),
('CG Oncology', 'Nasdaq: CGON', 'tamazia_client', 9, 'Healthcare/IPO reference; SEC Reg FD precedent'),
('Meraas', 'Dubai Holding', 'tamazia_client', 10, 'UAE real-estate; Dubai Holding standard')
ON CONFLICT DO NOTHING;
