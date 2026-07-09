-- 2026-07-09 (#15, applied live; snapshot _bak_overclaim_20260709). The 3 jurisdiction health-overclaim prohibit
-- rules (ASA/DHA/FTC) already had a shared overclaim regex on main; extended it to catch absolute DISEASE-CURE /
-- prevention claims (cures cancer/diabetes, reverses hair loss/ageing, prevents cancer/disease) which a health
-- regulator would certainly flag. Verified: fires on all overclaims incl. disease-cures, ZERO false positives on
-- legit copy ("helps prevent tooth decay" stays clean), and end-to-end via the prohibit path (overclaim->miss,
-- clean->no_prohibited_pattern). Jurisdiction-gated by connect GATE A so only the applicable regime attaches.
UPDATE compliance_rules SET regex_pattern =
 '(100\s*%?\s*(safe|success|guaranteed)|guaranteed\s+(results?|outcomes?|cure|success|recovery)|\bno[\s-]?risk\b|\brisk[\s-]?free\b|miracle\s+(cure|treatment|results?)|permanent(ly)?\s+(cured?|results?)|completely\s+safe|totally\s+safe|harvard[\s-]?approved|cures?\s+(cancer|diabetes|arthritis|alzheimer|dementia|infertility|baldness|hair\s+loss)|reverses?\s+(ageing|aging|hair\s+loss|diabetes|balding)|prevents?\s+(cancer|disease|illness)\b)'
 WHERE rule_id IN ('ASA_HEALTH_OVERCLAIM','DHA_HEALTH_OVERCLAIM','FTC_HEALTH_OVERCLAIM') AND active;
