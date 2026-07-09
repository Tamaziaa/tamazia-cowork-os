-- 2026-07-09 (applied live; snapshot _bak_display51_20260709). Completed the DISPLAY-aspect subset of the no-regex
-- rules: authored + verified presence-detection regexes for 16 genuine website-DISPLAY duties (show a licence /
-- registration number, publish the required disclosure). Each tested: compliant phrasings -> pass, genuine gap ->
-- flag, plus a false-positive audit on legit copy; and GPHC verified end-to-end through the scanner
-- (compliant->hit_after_trigger, missing->miss, out-of-scope->trigger_absent).
-- Rules: GPHC_DISTANCE_SELLING, eu-epbd-epc-advert-disclosure, STR-REGISTRATION-NUMBER, UK_CMP_2019_001,
-- FCA_HRI_CRYPTO_PROMO, US_NYC_LL144_001, UAE_HALAL_FOOD_LABELLING_CLAIM, UK_SRA_PUBLICITY_REGULATED_STATUS,
-- UK_NTSELAT_MATERIAL_INFO_001, common-logo-online-sale, casp-authorisation-and-fair-marketing,
-- sustainability-claims-disclosure, UK_ECOMM_REGS_2002_SELLER_INFO, UK_CMA_CARE_HOME_FEE_TRANSPARENCY,
-- US_PAY_TRANSPARENCY_SALARY_RANGE, US_BIPA_AI_BIOMETRIC_CONSENT. (Full patterns in session log / _bak table.)
UPDATE compliance_rules SET regex_pattern='gphc (number|registration|reg)|registered pharmacy|(superintendent|responsible) pharmacist|general pharmaceutical council|registered with the gphc' WHERE rule_id='GPHC_DISTANCE_SELLING' AND active AND coalesce(regex_pattern,'')='';
UPDATE compliance_rules SET regex_pattern='\bepc\b|energy performance (certificate|rating)|energy (efficiency )?rating|epc rating' WHERE rule_id='eu-epbd-epc-advert-disclosure' AND active AND coalesce(regex_pattern,'')='';
UPDATE compliance_rules SET regex_pattern='(authorised|regulated) (and (authorised|regulated) )?by the (sra|solicitors regulation authority)|sra (number|no|id|regulated)|solicitors regulation authority' WHERE rule_id='UK_SRA_PUBLICITY_REGULATED_STATUS' AND active AND coalesce(regex_pattern,'')='';
-- (+13 more; see _bak_display51_20260709 and session log for exact patterns.)
