-- Ledger 2.1 — quarantine the citation-presence rule (V1 B6 / EXPANDED Loop 2).
-- UK_DPA_2018/S3 "Section 3 personal data definition disclosure" is a must_appear rule that tests for the
-- recital of a statute section number — NOT a website obligation. It produced false breaches (harness G1,
-- golden firm-01/firm-02). Deactivated (reversible), not deleted.
UPDATE compliance_rules SET active = FALSE WHERE framework_short = 'UK_DPA_2018' AND rule_id = 'S3' AND rule_type = 'must_appear';
-- ROLLBACK: UPDATE compliance_rules SET active = TRUE WHERE framework_short = 'UK_DPA_2018' AND rule_id = 'S3';
