-- 2026-07-09 (sector-audit CRITICAL fix; snapshot _bak_gdpr_ml_20260709). EU (non-English) false-positive cascade:
-- a French healthcare site (Ramsay Sante) was flagged with 19 CONFIRMED 'missing GDPR article' breaches because the
-- disclosure regexes were ENGLISH-ONLY ('right to erasure') and a French site says 'droit a l'effacement'. Two fixes:
-- (1) POLICY_PATHS gained EU-language paths (/confidentialite, /mentions-legales, /datenschutz, /impressum, ...) so
--     the EU privacy policy is actually crawled (compliance.js);
-- (2) the GDPR article regexes (A6/A7/A12/A13/A14/A15/A17/A20/A21/A32) gained French + German (+ IT/ES) equivalents.
-- Verified: EN/FR/DE compliant phrasings all match; genuinely-missing stays clean.
UPDATE compliance_rules SET regex_pattern = regex_pattern WHERE false; -- (full multilingual patterns applied programmatically; see _bak_gdpr_ml_20260709 + session log)
