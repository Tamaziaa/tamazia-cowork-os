-- 100-bug batch 8 (applied live 2026-07-06). #76: backfill statutory_citation for frameworks whose statutory
-- instrument is an unambiguous public fact. Frameworks with uncertain/professional-code bases left NULL (no guessing).
-- Full framework->instrument map applied programmatically (35 frameworks, ~115 rules); representative subset:
UPDATE compliance_rules SET statutory_citation='Regulation (EU) 2016/679 (General Data Protection Regulation)' WHERE framework_short='EU_GDPR' AND active AND statutory_citation IS NULL;
UPDATE compliance_rules SET statutory_citation='California Consumer Privacy Act, Cal. Civ. Code sec. 1798.100 et seq.' WHERE framework_short='US_CCPA' AND active AND statutory_citation IS NULL;
UPDATE compliance_rules SET statutory_citation='Regulation (EU) 2024/1689 (Artificial Intelligence Act)' WHERE framework_short='EU_AI_ACT' AND active AND statutory_citation IS NULL;
UPDATE compliance_rules SET statutory_citation='Saudi Personal Data Protection Law (Royal Decree M/19 of 1443H, as amended)' WHERE framework_short='SAUDI_PDPL' AND active AND statutory_citation IS NULL;
-- (+31 more frameworks: EU_EPRIVACY/DSA/EAA/OMNIBUS/CRD/GPSR, US_CPRA/VCDPA/TDPSA/FTC/ADA/TCPA,
--  UK_DPA_2018/PECR/EQUALITY_2010/CRA_2015/COMPANIES_ACT/CHARITY_COMMISSION/GDC/GPHC/OFCOM/OFGEM/CAA/OFS/OFSTED/GDPR_A13,
--  QATAR/BAHRAIN/OMAN/UAE_PDPL, GOOGLE_EEAT=voluntary. See session log for the full map.)
