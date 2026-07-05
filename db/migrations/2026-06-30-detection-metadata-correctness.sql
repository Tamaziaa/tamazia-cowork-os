-- Batch 2 — detection-metadata correctness + strengthening (2026-06-30). Reversible (see _pre-detection-metadata-snapshot.csv + below).
-- (1) FIX inverted prohibitions: 6 active rules use rule_type 'prohibited', but the engine recognises ONLY 'prohibit'
--     (compliance.js:589). Mis-typed rules fell to the must_appear default and INVERTED — clearing firms that DO show the
--     banned content and flagging firms that don't. All 6 verified genuine prohibitions (botox-to-minors criminal offence,
--     POM public advertising, banned tenant fees, FTC fake-reviews x2, FTC AI-claims). Normalise to 'prohibit'.
UPDATE compliance_rules SET rule_type='prohibit' WHERE active AND rule_type='prohibited';
-- (2) BACKFILL check_style (descriptive; engine branches behaviourally ONLY on 'element_checklist', so these are inert
--     and safe): fill the thin column from rule_type so the catalogue is self-documenting. Never touches element_checklist.
UPDATE compliance_rules SET check_style = CASE rule_type
    WHEN 'must_appear' THEN 'presence'
    WHEN 'trigger_then_check' THEN 'conditional'
    WHEN 'prohibit' THEN 'absence'
  END
 WHERE active AND (check_style IS NULL OR check_style='') AND rule_type IN ('must_appear','trigger_then_check','prohibit');
-- ROLLBACK: UPDATE compliance_rules SET rule_type='prohibited' WHERE rule_id IN ('UK_BOTOX_FILLERS_CHILDREN_2021','UK_HMR_2012','UK_TENANT_FEES_2019_001','US_FTC_AI_CLAIMS','US_FTC_FAKE_REVIEWS','US_FTC_REVIEWS_RULE');
--           UPDATE compliance_rules SET check_style=NULL WHERE check_style IN ('presence','conditional','absence');
