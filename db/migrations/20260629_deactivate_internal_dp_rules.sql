-- Phase 3c follow-up: deactivate INTERNAL data-protection governance rules that are not website-disclosure breaches
-- and should never surface on a website audit (processor CONTRACT terms, Records of Processing Activities, and the
-- s.22 manual-unstructured-data exemption note). They were accidentally suppressed by a missing trigger flag; once the
-- applies_when vocabulary was completed they leaked as "wrong breaches". A website audit cannot assess a firm's internal
-- ROPA or processor contracts. Privacy-NOTICE completeness is still covered by the Article 13 rules. ADDITIVE (active=false).
UPDATE compliance_rules SET active = FALSE
WHERE rule_id IN ('A28','A28UK','A30','A30UK','S22') AND active = TRUE;
