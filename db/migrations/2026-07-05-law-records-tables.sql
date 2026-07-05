-- Phase 1.2.8-1.2.11: the three-tier law tables (Work=framework_versions / Expression=law_records / checks=compliance_rules). Additive + reversible.
CREATE TABLE IF NOT EXISTS law_records (
  law_id text PRIMARY KEY, framework_short text, regulator text, instrument text,
  binding_status text, jurisdiction text[], nexus jsonb, universal boolean DEFAULT false,
  sector text[], sub_sector text[], source_note text, updated date);
CREATE TABLE IF NOT EXISTS law_obligations (
  obligation_id serial PRIMARY KEY, law_id text, obligation_type text, verbatim_text text,
  plain_text text, evidence_type text, detect_rule_ids text[], UNIQUE(law_id, plain_text));
CREATE TABLE IF NOT EXISTS law_enforcement (
  enforcement_id serial PRIMARY KEY, law_id text, authority text, action_date date, respondent text,
  sector text, violated_provisions text[], violation_type text, fine_amount numeric, currency text,
  action_type text, summary text, source_url text, concept_uri text, source_note text, UNIQUE(law_id, summary));
CREATE TABLE IF NOT EXISTS statute_chunks (chunk_id serial PRIMARY KEY, law_id text, section text, chunk_text text);
CREATE INDEX IF NOT EXISTS idx_law_records_jur ON law_records USING gin(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_law_records_sector ON law_records USING gin(sector);
-- ROLLBACK: DROP TABLE law_records, law_obligations, law_enforcement, statute_chunks;
