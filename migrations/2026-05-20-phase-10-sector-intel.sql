-- Phase 10 · sector intelligence schema

-- News + regulator + brand mention items
CREATE TABLE IF NOT EXISTS intel_items (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,           -- 'regulator_watch' | 'industry_news' | 'company_news' | 'brand_mention' | 'review'
  source_url TEXT,
  source_org TEXT,                 -- e.g. 'ICO', 'FCA', 'CMA', 'reuters.com'
  sector TEXT,                     -- 'law-firms' | 'healthcare' | ...
  jurisdiction TEXT,
  headline TEXT,
  body TEXT,
  ts TIMESTAMPTZ,
  impact_tag TEXT,                 -- 'enforcement' | 'guidance' | 'consultation' | 'ruling' | 'general'
  related_lead_id INTEGER REFERENCES leads(id),
  observed_at TIMESTAMPTZ DEFAULT NOW(),
  fingerprint_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_intel_items_sector ON intel_items (sector, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_items_source ON intel_items (source);

-- Site change history
CREATE TABLE IF NOT EXISTS site_change_log (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  domain TEXT,
  path TEXT DEFAULT '/',
  body_hash TEXT,
  byte_size INTEGER,
  change_type TEXT,                -- 'content_changed' | 'page_added' | 'page_removed' | 'pricing_changed'
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_change_lead ON site_change_log (lead_id, scanned_at DESC);

-- Sector heat snapshot (refreshed daily)
CREATE TABLE IF NOT EXISTS sector_heat (
  id SERIAL PRIMARY KEY,
  sector TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  heat_level TEXT,                 -- 'low' | 'medium' | 'high' | 'critical'
  heat_score INTEGER,              -- 0-100
  driver_summary TEXT,
  contributing_intel_ids INTEGER[],
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sector, jurisdiction, snapshot_at)
);
CREATE INDEX IF NOT EXISTS idx_sector_heat_lookup ON sector_heat (sector, jurisdiction, snapshot_at DESC);
