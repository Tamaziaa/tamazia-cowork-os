-- Research-report cross-reference (2026-06-30), verified against authoritative sources. TWO corrections APPLIED:
-- (1) DUPLICATE FRAMEWORK CODES flagged deprecated (physical removal deferred to branch 7 — blocked by FK from
--     INACTIVE compliance_rules + references in compliance-laws.json/.report.json):
--       US_CANSPAM   -> canonical US_CAN_SPAM        (US_CANSPAM has 0 active rules)
--       US_CO_AI_ACT -> canonical US_COLORADO_AI_ACT (US_CO_AI_ACT has 0 active rules)
UPDATE framework_versions SET notes = COALESCE(notes,'')||' | DEPRECATED-DUPLICATE 2026-06-30 canonical='||
  CASE WHEN framework_short='US_CANSPAM' THEN 'US_CAN_SPAM' ELSE 'US_COLORADO_AI_ACT' END||' (physical merge=branch7)'
  WHERE framework_short IN ('US_CANSPAM','US_CO_AI_ACT');
-- branch-7 physical merge: UPDATE compliance_rules SET framework_short=<canonical> WHERE framework_short=<dup>;
--                          then DELETE the dup framework_versions row + reconcile compliance-laws.json.
--
-- (2) LEGAL CORRECTION — FTC Click-to-Cancel vacated. The FTC's 2024 amendments to the Negative Option Rule
--     (16 CFR Part 425) were VACATED by the 8th Cir. on 2025-07-08 (verified: WilmerHale, Latham, Sidley, Cooley,
--     Steptoe, Crowell, Womble, Wiley, Brown Rudnick). ROSCA (15 USC 8403) + FTC Act s.5 remain operative with the
--     same disclosure / express-consent / simple-cancellation duties. Authority reframed to ROSCA. [APPLIED]
UPDATE compliance_rules SET
  statutory_citation = 'ROSCA, 15 U.S.C. § 8403; FTC Act § 5; state auto-renewal laws (e.g. California ARL). NOTE: the FTC 2024 Click-to-Cancel amendments to the Negative Option Rule (16 CFR Part 425) were vacated by the 8th Cir. on 2025-07-08 — ROSCA is the operative authority.',
  description = 'Auto-renewal / negative-option offers to US consumers must clearly disclose all material terms, obtain express informed consent before charging, and provide a simple cancellation mechanism (ROSCA, 15 USC 8403; the FTC interprets ROSCA to require cancellation at least as easy as sign-up).'
WHERE rule_id = 'ftc-click-to-cancel';
