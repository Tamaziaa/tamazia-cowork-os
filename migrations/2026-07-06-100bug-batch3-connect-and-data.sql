-- 100-bug audit batch 3 (applied live 2026-07-06; snapshots _bak_cr_20260706b, _bak_fv_20260706b).
-- Connect-layer code changes are in src/lib/compliance/{connect.js,jurisdiction-router.js,registry/sector.js}.

-- #13 remaining corrupted \b regexes (case-insensitive) restored
UPDATE compliance_rules SET trigger_pattern=replace(replace(trigger_pattern,'bAIb','\bAI\b'),'bMLb','\bML\b') WHERE rule_id='UK_AI_ICO_001';
UPDATE compliance_rules SET trigger_pattern=replace(trigger_pattern,'bfosb','\bfos\b') WHERE rule_id='FOS_FSCS_SIGNPOST';

-- #18 UK_NMC is a professional code (peer of UK_GMC), not a statute
UPDATE framework_versions SET binding_status='professional_code' WHERE framework_short='UK_NMC' AND binding_status='statute';

-- #19 national member-state privacy law mis-coded EU -> correct ISO (kills FR/DE cross-border leaks #33-35)
UPDATE framework_versions SET jurisdiction='FR' WHERE framework_short='FR_CNIL_2025' AND jurisdiction='EU';
UPDATE framework_versions SET jurisdiction='DE' WHERE framework_short='DE_BDSG'      AND jurisdiction='EU';

-- #28 Gulf PDPL parity: broadened trigger_then_check triggers of SAUDI/QATAR/BAHRAIN/OMAN/EGYPT/JORDAN PDPL
--     to include commerce/collection signals (online shop, checkout, account, order, customers) so a commercial
--     Gulf site binds its home PDPL the same way an EU shop binds GDPR. (done in code above via targeted appends.)

-- #20 CLC (Council for Licensed Conveyancers) framework + 2 website-disclosure rules; gated in connect CAP_GATE
--     so only genuine CLC-regulated firms attach (SRA solicitors excluded).
INSERT INTO framework_versions(framework_name,framework_short,jurisdiction,version,status,binding_status,sector,sub_sector,universal,last_reviewed_at,notes)
SELECT 'Council for Licensed Conveyancers (CLC) Regulatory Framework','UK_CLC','UK','2024','active','regulator_code',
       ARRAY['law-firms','conveyancing'],ARRAY['conveyancing'],false,current_date,'CLC regulates licensed conveyancers; distinct from SRA.'
WHERE NOT EXISTS (SELECT 1 FROM framework_versions WHERE framework_short='UK_CLC');
-- (CLC_PRICE_PUBLISH + CLC_REGULATORY_STATUS rules inserted programmatically; see session log.)
