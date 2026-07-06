-- 100-bug deep audit — DB data fixes (already applied live 2026-07-06; snapshots:
-- _bak_compliance_rules_20260706, _bak_framework_versions_20260706). Idempotent re-statement.

-- #7 UK_ASA_CAP / AS1.1: inverted logic (must_appear flagged honest firms, passed banned puffery)
UPDATE compliance_rules SET rule_type='prohibit'
 WHERE rule_id='AS1.1' AND rule_type='must_appear';

-- #13 six trigger_patterns had \b collapsed to bare b (bXXb) — restored word boundaries
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bLEPb','\bLEP\b')  WHERE rule_id='US_TITLE_VI_001';
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bRAKb','\bRAK\b')  WHERE rule_id='UAE_MOHAP_AD_PERMIT';
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bPOMb','\bPOM\b')  WHERE rule_id='UK_HMR_2012_POM_PUBLIC_AD';
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bAIb','\bAI\b')    WHERE rule_id='EU_AI_ACT_HIGHRISK_MEDICAL';
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bAUHb','\bAUH\b')  WHERE rule_id='UAE_DOH_AD_PERMIT';
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bCAb','\bCA\b')    WHERE rule_id='US_CA_UNRUH_001';

-- #17 GOOGLE_EEAT is Google search guidance, not statute
UPDATE framework_versions SET binding_status='voluntary_code'
 WHERE framework_code='GOOGLE_EEAT' AND binding_status='statute';
