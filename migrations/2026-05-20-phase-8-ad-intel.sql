-- Phase 8 · ad intelligence schema
-- ad_observations table for cross-platform ad records, ad_scraping_runs for cron observability.

CREATE TABLE IF NOT EXISTS ad_observations (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL, -- 'meta' | 'google' | 'linkedin' | 'tiktok' | 'x' | 'snapchat' | 'reddit'
  advertiser_name TEXT,
  advertiser_id TEXT, -- platform-specific ID
  advertiser_domain TEXT, -- canonicalised landing-page domain
  ad_text TEXT,
  ad_creative_url TEXT, -- image/video URL if available
  landing_url TEXT,
  landing_domain TEXT, -- redundant for fast joins
  country TEXT, -- target country code
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ DEFAULT NOW(),
  fingerprint_hash TEXT UNIQUE NOT NULL,
  confidence NUMERIC DEFAULT 0.8,
  raw_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_ad_obs_advertiser ON ad_observations (advertiser_domain);
CREATE INDEX IF NOT EXISTS idx_ad_obs_platform ON ad_observations (platform, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_obs_country ON ad_observations (country);

CREATE TABLE IF NOT EXISTS ad_scraping_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  platform TEXT NOT NULL,
  query TEXT,
  country TEXT,
  records_found INTEGER DEFAULT 0,
  records_new INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error TEXT
);

-- Ad intel summary view for fast joins with leads
CREATE OR REPLACE VIEW v_ad_intel_summary AS
SELECT
  advertiser_domain,
  COUNT(*) AS total_ads,
  COUNT(DISTINCT platform) AS platforms_count,
  array_agg(DISTINCT platform ORDER BY platform) AS platforms,
  array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS countries,
  MAX(observed_at) AS latest_observed_at,
  MIN(observed_at) AS first_observed_at
FROM ad_observations
WHERE advertiser_domain IS NOT NULL
GROUP BY advertiser_domain;
