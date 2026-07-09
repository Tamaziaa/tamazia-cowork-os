-- 2026-07-09 (sector-audit fix; snapshot _bak_de_fr_dp_20260709). DE_BDSG + FR_CNIL_2025 national data-protection
-- rules were sector-restricted to commercial sectors (ecommerce/retail/saas/...), EXCLUDING law-firms/healthcare/
-- professional-services — so a German or French law firm/clinic processing personal data did NOT get its own
-- national DP law (only EU_GDPR). Data protection is universal; set sector_relevance = NULL (all sectors, matching
-- UK_DPA_2018) and broadened the trigger to data-processing signals so a firm already in DE/FR attaches on any
-- privacy text. Verified: DE law firm -> DE_BDSG+EU_GDPR; FR clinic -> FR_CNIL+EU_GDPR; UK firm -> neither.
UPDATE compliance_rules SET sector_relevance=NULL WHERE framework_short IN ('DE_BDSG','FR_CNIL_2025') AND active;
UPDATE compliance_rules SET trigger_pattern = trigger_pattern || '|personal data|privacy|datenschutz|cookie|we collect|data protection|personenbezogene daten' WHERE framework_short='DE_BDSG' AND active;
UPDATE compliance_rules SET trigger_pattern = trigger_pattern || '|personal data|privacy|données personnelles|cookie|we collect|data protection|politique de confidentialité' WHERE framework_short='FR_CNIL_2025' AND active;
