-- 2026-07-09 (#14, applied live; snapshot _bak_gdpr_20260709). 14 EU_GDPR articles shared ONE regex
-- (personal data|data subject|controller|processor|gdpr) so they fired identical, indistinguishable dupes.
-- Gave the website-detectable articles distinct, broad, tested regexes (compliant phrasings -> hit, genuine gap -> miss):
--   A6 lawful basis, A7 consent, A12 transparency, A13/A14 notice info, A15 access, A17 erasure,
--   A20 portability, A21 objection, A32 security.
-- Converted the international-transfer articles A44/A46 to trigger_then_check gated on an actual transfer signal
-- (outside the EEA / SCCs / third country) so they no longer false-fire on domestic-only firms.
-- A25 (by design) and A27 (non-EU representative) are operational and stay on the generic pattern (fire only when
-- the site has no privacy text at all). Verified end-to-end: a policy with access+erasure but no portability now
-- flags A20/A21 specifically while A13/A6/A15/A17/A32 pass.
UPDATE compliance_rules SET regex_pattern='right to (erasure|be forgotten)|(request|ask).{0,20}(delet|eras|remov)|delete your (personal )?(data|information)|erase' WHERE rule_id='A17' AND framework_short='EU_GDPR' AND active;
UPDATE compliance_rules SET regex_pattern='data portability|portable (format|copy)|machine[- ]readable|transfer your (personal )?data to another' WHERE rule_id='A20' AND framework_short='EU_GDPR' AND active;
UPDATE compliance_rules SET regex_pattern='right to object|object to (the )?(processing|direct marketing)|opt[- ]?out of (marketing|direct)' WHERE rule_id='A21' AND framework_short='EU_GDPR' AND active;
-- (+ A6,A7,A12,A13,A14,A15,A32 distinct regexes; A44/A46 -> trigger_then_check. Full set in session log.)
