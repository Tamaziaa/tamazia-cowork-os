-- Phase 1.5.1: calibration/regression baseline — snapshot each golden firm's current attachment set as ground-truth
-- reference for conformal calibration + regression (catches unintended attachment changes during the P2.6 repoint / re-mint).
CREATE TABLE IF NOT EXISTS calibration_labels (
  hash text PRIMARY KEY, domain text, sector text, country text, frameworks text[], captured_at timestamptz DEFAULT now());
INSERT INTO calibration_labels (hash, domain, sector, country, frameworks)
  SELECT hash, domain, sector, COALESCE(country,'XX'),
         ARRAY(SELECT jsonb_array_elements_text(payload_json->'applicable_frameworks'))
  FROM audit_pages WHERE payload_json ? 'applicable_frameworks' AND hash IS NOT NULL
  ON CONFLICT (hash) DO NOTHING;
-- ROLLBACK: DROP TABLE calibration_labels;
