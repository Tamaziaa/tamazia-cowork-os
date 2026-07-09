-- 2026-07-09 (applied live; snapshots _bak_cr_20260709_triggers, _bak_cr_20260709_disclosure).
-- SYSTEMIC BUG (extends #13): 27 trigger_patterns had \s collapsed to 's' and \b collapsed to 'b', so the trigger
-- did NOT match its own target tokens (e.g. \b(bank...) stored as b(bank...) never matched "bank"; law\s*firm stored
-- as laws*firm never matched "law firm"). Each rule silently failed to activate on the very firms it targets.
-- Reconstructed and verified every fixed pattern matches its intended tokens (present->hit, absent->miss).
-- Representative examples (full 27 applied programmatically; see _bak_cr_20260709_triggers for exact before/after):
--   UK_MLR_2017_LEGAL_SECTOR:        (...|laws*firm|...)            -> (...|law\s*firm|...)
--   US_CMS_LTC_REQUIREMENTS_01:      b(nursings+(home|facility)...)b -> \b(nursing\s+(home|facility)...)\b
--   AE_AML_2018_FI_OBLIGATIONS_01:   b(bank|...moneys+(transfer)...) -> \b(bank|...money\s+(transfer)...)
--   UK_ECOMM_REGS_2002_SELLER_INFO:  (adds*tos*(cart|basket)...)     -> (add\s*to\s*(cart|basket)...)
--   EU_PSD2_SCA_RTS, EU_GDPR_ART22_ADM_DPIA_AI, US_DENTAL_BOARD_ADVERTISING_01, UK_HFEA_CONSENT_INFO_01, etc.
-- NOTE: US_SECTION_504_IDEA_001 (disab(led|ility)/accessib(le|ility)) is NOT corruption (word prefixes) — left intact.

-- #8/#9: authored PRESENCE-detection regex_pattern for 9 genuine WEBSITE-DISCLOSURE rules that previously had a
-- trigger but no regex (attached but never surfaced a finding). Each verified present->hit / absent->miss. The
-- remaining ~236 no-regex rules are OPERATIONAL/licensing duties (do X, not publish X) and correctly stay
-- attachment-seeds — authoring detection for those would fabricate.
UPDATE compliance_rules SET regex_pattern='financial ombudsman( service)?|\bfscs\b|financial services compensation scheme' WHERE rule_id='FOS_FSCS_SIGNPOST' AND active;
UPDATE compliance_rules SET regex_pattern='legal ombudsman' WHERE rule_id='UK_LEGAL_OMBUDSMAN_SIGNPOST' AND active;
UPDATE compliance_rules SET regex_pattern='\bhfea\b|human fertilisation (and|&) embryology|centre (number|no)\.?\s*\d|licen[cs]ed by the hfea' WHERE rule_id='HFEA_LICENCE' AND active;
UPDATE compliance_rules SET regex_pattern='accessibility statement' WHERE rule_id='PSBAR_WCAG' AND active;
-- (+ HFEA_ADDONS, FIC-ALLERGEN-DECLARE, irs-501c3-disclosure-substantiation, STATE_CONTRACTOR_LICENSE_DISCLOSURE,
--  glba-privacy-safeguards — see session log for exact patterns.)
