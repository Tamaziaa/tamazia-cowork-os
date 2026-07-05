-- Phase 2.3 completeness fix: a framework marked 'active' but with no active detection rule and not universal
-- can NEVER attach (dead law). Reclassify such rows to 'pending_rules' so 'active' is truthful. Idempotent.
UPDATE framework_versions SET status='pending_rules',
  notes=COALESCE(notes,'')||' [no active detection rules yet; cannot attach until authored]'
  WHERE status='active' AND NOT COALESCE(universal,false)
  AND NOT EXISTS (SELECT 1 FROM compliance_rules cr WHERE cr.framework_short=framework_versions.framework_short AND cr.active);
