-- Legal + healthcare sector deep-audit data fixes (idempotent).
-- 1. Resync framework_versions.rules_count from active-rule counts (was stale/0 on ~36 frameworks, hiding dead rules).
UPDATE framework_versions fv SET rules_count = COALESCE((SELECT count(*) FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active),0)
  WHERE rules_count IS DISTINCT FROM COALESCE((SELECT count(*) FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active),0);
-- 2. Activate the dead US FTC Health Breach Notification Rule (a real, enforced rule a US telehealth client must see).
UPDATE compliance_rules SET active=TRUE WHERE framework_short='US_FTC_HEALTH_BREACH_RULE' AND rule_id='ftc-hbnr' AND active=FALSE;
UPDATE framework_versions SET status='active' WHERE framework_short='US_FTC_HEALTH_BREACH_RULE' AND status='pending_rules'
  AND EXISTS (SELECT 1 FROM compliance_rules WHERE framework_short='US_FTC_HEALTH_BREACH_RULE' AND active);
