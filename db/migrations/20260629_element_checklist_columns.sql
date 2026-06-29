-- Phase 3a — element-level (checklist) detection. ADDITIVE columns on compliance_rules (no drop/rename).
-- A rule with check_style='element_checklist' requires MULTIPLE named elements on a page type and reports which are
-- present (with a quote) and which are missing, instead of one pass/fail regex. Legacy rules (check_style NULL) are
-- unchanged. regex_elements is a JSON array of {label, pattern}. page_scope is a regex matched against the page URL
-- (e.g. 'fees|pricing|price|cost') so the rule assesses the right page, falling back to the whole site if none exists.
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS check_style    text;
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS regex_elements jsonb;
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS page_scope     text;
