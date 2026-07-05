-- Phase 1.2: additive tagged-law schema columns on framework_versions + the vocab table (all nullable/new; NO consumer yet).
CREATE TABLE IF NOT EXISTS compliance_vocab (vocab_name text, term text, PRIMARY KEY (vocab_name, term));
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS required_nexus jsonb;
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS binding_status text;
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS sector text[];
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS sub_sector text[];
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS universal boolean;
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS effective_to date;
-- ROLLBACK: DROP TABLE compliance_vocab; ALTER TABLE framework_versions DROP COLUMN required_nexus, DROP COLUMN binding_status, DROP COLUMN sector, DROP COLUMN sub_sector, DROP COLUMN universal, DROP COLUMN effective_from, DROP COLUMN effective_to;
