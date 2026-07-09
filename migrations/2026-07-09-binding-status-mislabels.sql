-- 2026-07-09 (#77, applied live; snapshot _bak_binding_20260709). Reclassified professional/voluntary codes that
-- were wrongly marked binding_status='statute' — presenting an industry self-regulation code as a statute on a
-- legal audit is a credibility defect (same class as #17 GOOGLE_EEAT, #18 UK_NMC). Only clear cases changed;
-- statutory instruments (PSBAR 2018 regs, HSE energy, PECR-backed ICO cookies) left as statute.
UPDATE framework_versions SET binding_status='professional_code' WHERE framework_short IN ('UK_ABPI','UK_ACCA','UK_ICAEW','EU_BAR_CONDUCT','US_BAR_ADVERTISING') AND binding_status='statute';
UPDATE framework_versions SET binding_status='voluntary_code'    WHERE framework_short IN ('UK_IPSO','UK_AI_ICO') AND binding_status='statute';
