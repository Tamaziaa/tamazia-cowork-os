-- Phase 2.7 (Branch 8) — SRA complaints: single-regex -> element checklist (no finding-loss).
-- DECISION (verified against live catalogue): A13_ELEMENTS candidate was NOT applied — UK_GDPR_A13 is already
-- decomposed into 12 granular element rules (A13.1.a..A13.2.f), richer than the 8-element candidate; applying it
-- would DOWNGRADE. Only SRA_COMPLAINTS (a genuine single trigger_then_check regex) is upgraded to a 4-element
-- checklist (how-to-complain, timescales, Legal Ombudsman, right-to-SRA). Old phrases are subsumed by elements 1+3,
-- so old-miss => new-miss (proven: eval/sra-complaints-superset.test.js). Idempotent.
INSERT INTO compliance_rules (framework_short, rule_id, rule_type, check_style, trigger_pattern, regex_elements,
  severity, description, sector_relevance, active)
SELECT 'UK_SRA_TRANSPARENCY','SRA_COMPLAINTS_ELEMENTS','must_appear','element_checklist',
  '(solicitor[s]?|(^|[^a-z])sra([^a-z]|$)|solicitors regulation authority|regulated by the sra|law firm|legal practice|conveyanc|licensed conveyanc|our (solicitor|lawyer)[s]?|firm of solicitors)',
  '[]'::jsonb,'P1','Complaints information (4 required elements)','{legal,law-firms}',TRUE
WHERE NOT EXISTS (SELECT 1 FROM compliance_rules WHERE rule_id='SRA_COMPLAINTS_ELEMENTS');
-- (regex_elements payload applied from db/candidates/element-checklist-rules.json in the same batch)
UPDATE compliance_rules SET active=FALSE WHERE framework_short='UK_SRA_TRANSPARENCY' AND rule_id='SRA_COMPLAINTS' AND active=TRUE;
