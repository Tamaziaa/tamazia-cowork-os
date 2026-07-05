-- Branch 7 / Phase 2.5 — ONE framework record (unify, no loss). Idempotent.
-- framework_versions (290) is the authoritative spine (connect() reads it). compliance_laws (187, 108 linked)
-- is the rich overlay; law_records (26) the expression tier. We DO NOT collapse-and-lose; we unify via a view.
UPDATE compliance_laws SET neon_framework_short='US_CAN_SPAM' WHERE neon_framework_short='US_CANSPAM,US_CAN_SPAM';
UPDATE compliance_laws SET neon_framework_short='US_CCPA'     WHERE neon_framework_short='US_CPRA,US_CCPA';
UPDATE framework_versions SET status='duplicate_flagged',
  notes=COALESCE(notes,'')||' [DUP of US_CAN_SPAM: 0 rules, 0 code refs; pending Aman approval to remove]'
  WHERE framework_short='US_CANSPAM' AND status IS DISTINCT FROM 'duplicate_flagged';
ALTER TABLE framework_versions ADD COLUMN IF NOT EXISTS canonical_law_id text;
UPDATE framework_versions SET canonical_law_id=framework_short WHERE canonical_law_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fv_canonical_law_id ON framework_versions(canonical_law_id);
DROP VIEW IF EXISTS v_framework_record;
CREATE VIEW v_framework_record AS
  SELECT fv.canonical_law_id, fv.framework_short, fv.framework_name, fv.jurisdiction,
         fv.sector, fv.sub_sector, fv.universal, fv.binding_status, fv.required_nexus,
         fv.effective_from, fv.effective_to, fv.status, fv.version, fv.rules_count,
         cl.id AS rich_id, cl.name AS rich_name, cl.regulator, cl.category,
         cl.severity, cl.severity_rank, cl.max_penalty, cl.fine_low_gbp, cl.fine_high_gbp,
         cl.applies_when, cl.excluded_when, cl.servable, cl.detection_rules,
         cl.files10_law_id, cl.effective_date, cl.source,
         lr.law_id AS expression_law_id, lr.instrument, lr.nexus AS expr_nexus
  FROM framework_versions fv
  LEFT JOIN compliance_laws cl ON cl.neon_framework_short = fv.framework_short
  LEFT JOIN law_records   lr ON lr.framework_short      = fv.framework_short;
