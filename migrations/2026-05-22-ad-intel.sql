-- Phase 8.2.1 · ad_intelligence table (spec'd exactly per TAMAZIA-EXECUTION-PHASE-8.md)
CREATE TABLE IF NOT EXISTS ad_intelligence (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  platform VARCHAR(30) NOT NULL,
  advertiser_name VARCHAR(255),
  advertiser_id VARCHAR(255),
  ad_creative_text TEXT,
  ad_creative_url VARCHAR(500),
  ad_format VARCHAR(50),
  date_started DATE,
  date_ended DATE,
  countries TEXT[],
  estimated_spend_range VARCHAR(50),
  raw_data JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fingerprint_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_ad_intel_lead ON ad_intelligence(lead_id);
CREATE INDEX IF NOT EXISTS idx_ad_intel_platform ON ad_intelligence(platform);
CREATE INDEX IF NOT EXISTS idx_ad_intel_advertiser ON ad_intelligence(advertiser_name);
CREATE INDEX IF NOT EXISTS idx_ad_intel_fetched ON ad_intelligence(fetched_at DESC);

-- Also add ad_intel_score column to leads (per spec: 0-10 based on platforms × creative volume × freshness)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_intel_score NUMERIC DEFAULT 0;

-- Compatibility view: keep ad_observations queries working
CREATE OR REPLACE VIEW v_ad_intel_legacy AS
SELECT
  id,
  platform,
  advertiser_name,
  advertiser_id,
  NULL::TEXT AS advertiser_domain,
  ad_creative_text AS ad_text,
  ad_creative_url,
  NULL::TEXT AS landing_url,
  NULL::TEXT AS landing_domain,
  CASE WHEN countries IS NOT NULL AND array_length(countries,1) > 0 THEN countries[1] ELSE NULL END AS country,
  date_started AS started_at,
  date_ended AS ended_at,
  fetched_at AS observed_at,
  fingerprint_hash,
  raw_data
FROM ad_intelligence;
