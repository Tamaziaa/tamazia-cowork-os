-- MAR: gate to a genuine listed-ISSUER's own market-conduct/IR context, not any mention of securities/shares
-- (every wealth/investment site mentions those). Targets RNS/primary-listing/AGM/IR-disclosure language.
UPDATE compliance_rules SET trigger_pattern =
 '(regulatory news service|\brns\b (announcement|reach)|inside information.{0,25}(policy|procedure|controls|disclosure)|investor relations|primary listing|premium listing|admitted to trading on|our (ordinary )?shares? (are )?(admitted|listed|traded|quoted) on|annual general meeting|\bagm\b|preliminary results announcement)'
 WHERE framework_short='UK_FCA_MAR' AND rule_id='1.3';
-- Children's/Age-Appropriate Design: require a genuinely CHILD-DIRECTED service or child-user context, not the bare
-- word "children" (which appears in family-law, children's-trusts, etc.) or "education".
UPDATE compliance_rules SET trigger_pattern =
 '(for (kids|children|teens)|children''?s (account|login|app|game|club|menu|class|programme|zone)|kids''? (club|zone|menu|account|app|corner)|under.1[38] (users|account|s)|nursery|kindergarten|childcare|day.?care|primary school|secondary school|\bpupils\b|school children|toys for|games for (kids|children)|child.directed service|likely to be accessed by children)'
 WHERE framework_short='UK_DPA_2018' AND rule_id='DPA_CHILDRENS_CODE';
