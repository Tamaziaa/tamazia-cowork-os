-- Phase 3.1 — event-sourced feed change log. Config-driven feed registry writes new/updated entries here with a
-- checksum; a legal re-review is BLOCKING on any change. Idempotent.
CREATE TABLE IF NOT EXISTS law_change_events (
  event_id bigserial PRIMARY KEY, source text NOT NULL, jurisdiction text, entry_id text NOT NULL,
  title text, entry_url text, checksum text NOT NULL, change_type text NOT NULL, seen_at timestamptz DEFAULT now(),
  UNIQUE(source, entry_id, checksum));
