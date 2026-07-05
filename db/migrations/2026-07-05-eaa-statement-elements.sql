-- Phase 2.7.8 — EAA accessibility statement -> 5-element checklist (EN 301 549), no finding-loss.
-- Element 1 supersets the old single-regex check; elements 2-5 add conformance/limitations/feedback/enforcement.
-- Same trigger + sector_relevance => framework attachment unchanged (shadow-identity holds). Idempotent.
INSERT INTO compliance_rules (framework_short, rule_id, rule_type, check_style, trigger_pattern, regex_elements,
  severity, description, sector_relevance, active)
SELECT 'EU_EAA_2025','EAA_STATEMENT_ELEMENTS','trigger_then_check','element_checklist',
  '(EU customers|European Union|EEA|sells to (Germany|France|Italy|Spain|Netherlands|Ireland)|euro currency)',
  '[]'::jsonb,'P2','Accessibility statement must contain the EN 301 549 required elements','{ecommerce,retail,finance,fintech,insurance,media,transport,aviation,saas,tech}',TRUE
WHERE NOT EXISTS (SELECT 1 FROM compliance_rules WHERE rule_id='EAA_STATEMENT_ELEMENTS');
-- (regex_elements payload applied in the same batch; 5 elements)
UPDATE compliance_rules SET active=FALSE WHERE framework_short='EU_EAA_2025' AND rule_id='EAA_ACCESSIBILITY_STATEMENT' AND active=TRUE;
