-- Phase 7 · sourcing schema
-- Extends leads with source-attribution + verification metadata
-- New tables: lead_sources (canonical source registry), sourcing_runs (cron observability),
-- verification_log (3-stage email verification trail), disposable_domains (deny-list)

-- 1. Extend leads (idempotent)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source_query TEXT,
  ADD COLUMN IF NOT EXISTS source_payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_raw JSONB,
  ADD COLUMN IF NOT EXISTS dormant BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS instagram_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS ad_intel JSONB,
  ADD COLUMN IF NOT EXISTS lead_audience TEXT DEFAULT 'tamazia',
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC DEFAULT 50;

-- 2. Source registry
CREATE TABLE IF NOT EXISTS lead_sources (
  id SERIAL PRIMARY KEY,
  source TEXT UNIQUE NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  rate_limit_per_min INTEGER,
  rate_limit_per_day INTEGER,
  has_api_key BOOLEAN DEFAULT FALSE,
  api_key_env_var TEXT,
  workaround TEXT,
  cost_per_month_gbp NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO lead_sources (source, description, has_api_key, api_key_env_var, workaround, rate_limit_per_min, rate_limit_per_day, cost_per_month_gbp) VALUES
('companies_house_uk', 'UK company registry · public search + API', FALSE, 'CH_API_KEY', 'HTML scrape of find-and-update.company-information.service.gov.uk', 120, 600, 0),
('opencorporates', 'Global registry · free tier', FALSE, 'OPENCORPORATES_KEY', 'No key needed for basic search', 30, 17, 0),
('sec_edgar', 'SEC EDGAR US public filings · no key', FALSE, NULL, 'No key required ever', 10, 100000, 0),
('hunter', 'Email finder · free tier', FALSE, 'HUNTER_KEY', 'Email pattern + SMTP probe', 5, 25, 0),
('snov', 'Email finder · free tier', FALSE, 'SNOV_USER_ID', 'Email pattern + SMTP probe', 5, 50, 0),
('apollo', 'Lead enrichment · free tier', FALSE, 'APOLLO_KEY', 'Common Room MCP plugin (already connected)', 30, 50, 0),
('common_room', 'Common Room MCP · already connected', TRUE, 'COMMON_ROOM_PLUGIN', NULL, NULL, NULL, 0),
('google_places', 'Google Places API', FALSE, 'GOOGLE_PLACES_KEY', 'OSM Overpass + Nominatim', 60, 5000, 0),
('yelp', 'Yelp Fusion · free key', FALSE, 'YELP_KEY', 'OSM Overpass + public listing fallback', 100, 5000, 0),
('osm_overpass', 'OpenStreetMap Overpass · free no key', FALSE, NULL, 'No key ever', 60, 10000, 0),
('linkedin_google_site_search', 'Google site:linkedin.com/in/ search', FALSE, NULL, 'No key, ranked candidate list', 30, 1000, 0),
('instagram_google_site_search', 'Google site:instagram.com search', FALSE, NULL, 'No key, ranked candidate list', 30, 1000, 0)
ON CONFLICT (source) DO NOTHING;

-- 3. Sourcing runs (cron observability)
CREATE TABLE IF NOT EXISTS sourcing_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  source TEXT NOT NULL,
  sector TEXT,
  jurisdiction TEXT,
  query TEXT,
  records_found INTEGER DEFAULT 0,
  records_new INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error TEXT,
  payload_summary JSONB
);

CREATE INDEX IF NOT EXISTS idx_sourcing_runs_source_date ON sourcing_runs (source, started_at DESC);

-- 4. Email verification log
CREATE TABLE IF NOT EXISTS verification_log (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  email TEXT NOT NULL,
  stage TEXT NOT NULL, -- 'pattern_match' | 'smtp_probe' | 'neverbounce'
  result TEXT NOT NULL, -- 'pass' | 'fail' | 'unknown' | 'risky'
  confidence NUMERIC,
  raw_response JSONB,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_log_email ON verification_log (email);
CREATE INDEX IF NOT EXISTS idx_verification_log_lead ON verification_log (lead_id);

-- 5. Disposable email domain deny-list (seeded with common ones)
CREATE TABLE IF NOT EXISTS disposable_domains (
  domain TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO disposable_domains (domain) VALUES
('mailinator.com'),('guerrillamail.com'),('10minutemail.com'),('temp-mail.org'),('throwaway.email'),
('yopmail.com'),('trashmail.com'),('sharklasers.com'),('getnada.com'),('mintemail.com'),
('maildrop.cc'),('mailcatch.com'),('spambox.us'),('mt2015.com'),('emailondeck.com'),
('mailnesia.com'),('mailtemp.info'),('dispostable.com'),('fakeinbox.com'),('mailtothis.com')
ON CONFLICT (domain) DO NOTHING;

-- 6. Generic role-based local-part deny-list (used by find-every-email)
CREATE TABLE IF NOT EXISTS generic_local_parts (
  local_part TEXT PRIMARY KEY
);

INSERT INTO generic_local_parts (local_part) VALUES
('info'),('contact'),('hello'),('sales'),('marketing'),('support'),('help'),('admin'),
('webmaster'),('postmaster'),('noreply'),('no-reply'),('mail'),('office'),('enquiries'),
('inquiries'),('reception'),('team'),('jobs'),('careers'),('press'),('media'),('pr')
ON CONFLICT (local_part) DO NOTHING;
