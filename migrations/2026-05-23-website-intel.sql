-- 2026-05-23 · website-intel structured columns (10-param scraper output)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_intel JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS people JSONB;
