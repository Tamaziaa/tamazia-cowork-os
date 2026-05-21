-- Phase 6 supplement: backfill machine-checkable patterns onto compliance_rules.
-- Phase 2 stored legal text; Phase 6 needs executable detection patterns.
-- Each pattern is a regex tested against the HTML body of the home page or the URL given by url_check.
-- HIT means the page contains the required disclosure; MISS means it's absent (a finding).
-- Patterns are intentionally permissive (case-insensitive, loose word boundaries) to avoid false positives.

BEGIN;

-- ============================================================================
-- UK_GDPR_A13 · Information to be provided where personal data are collected
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(data controller|controller is|controller:|registered office.*for the purposes of)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.1.a';
UPDATE compliance_rules SET regex_pattern = '(data protection officer|dpo[@\\s]|dpo contact|privacy@|dataprotection@|contact (us|the controller))', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.1.b';
UPDATE compliance_rules SET regex_pattern = '(purposes? (of|for) (the )?processing|why we (collect|process)|legal basis|lawful basis)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.1.c';
UPDATE compliance_rules SET regex_pattern = '(legitimate interest|legitimate interests assessment|balancing test)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.1.d';
UPDATE compliance_rules SET regex_pattern = '(recipients?|third parties|service providers|processors|sub[- ]?processors?|we share|with whom we share)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.1.e';
UPDATE compliance_rules SET regex_pattern = '(international transfer|outside the (uk|eea)|transfer.{0,30}third country|standard contractual clauses|sccs?|adequacy)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.1.f';
UPDATE compliance_rules SET regex_pattern = '(retention period|how long we (keep|retain)|data retention|retain.{0,30}years?|for as long as|kept for)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.2.a';
UPDATE compliance_rules SET regex_pattern = '(right to (access|rectification|erasure|restrict|object|portability)|your rights under|exercise your rights|data subject rights)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.2.b';
UPDATE compliance_rules SET regex_pattern = '(withdraw (your )?consent|right to withdraw)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.2.c';
UPDATE compliance_rules SET regex_pattern = '(complain.{0,40}(ico|information commissioner)|ico\\.org\\.uk|supervisory authority)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.2.d';
UPDATE compliance_rules SET regex_pattern = '(statutory|contractual).{0,80}(requirement|obligation|consequence)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.2.e';
UPDATE compliance_rules SET regex_pattern = '(automated decision|profiling|logic involved|significance and the envisaged consequences)', url_check='/privacy' WHERE framework_short='UK_GDPR_A13' AND rule_id='A13.2.f';

-- ============================================================================
-- UK_PECR · Privacy and Electronic Communications Regulations
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(unsubscribe|opt[- ]?out|stop receiving|preferences? centre)' WHERE framework_short='UK_PECR' AND severity='P0' AND rule_id ILIKE '%marketing%' OR rule_id ILIKE '%unsubscribe%';
UPDATE compliance_rules SET regex_pattern = '(soft[- ]?opt[- ]?in|existing customer|previously purchased|negotiations? for a sale)' WHERE framework_short='UK_PECR' AND rule_id ILIKE '%soft%';
UPDATE compliance_rules SET regex_pattern = '(cookie (banner|notice|consent)|we use cookies|this (site|website) uses cookies)' WHERE framework_short='UK_PECR' AND rule_id ILIKE '%cookie%';

-- For PECR rules not covered above, set a permissive default so they evaluate
UPDATE compliance_rules SET regex_pattern = '(unsubscribe|opt[- ]?out|cookie|consent|withdraw)' WHERE framework_short='UK_PECR' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- UK_ICO_COOKIES · ICO cookie guidance
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(cookie (banner|bar|notice|popup|consent))', url_check='/' WHERE framework_short='UK_ICO_COOKIES' AND severity='P0' AND rule_id ILIKE '%banner%';
UPDATE compliance_rules SET regex_pattern = '(reject all|decline all|deny all|refuse all|only necessary|essential only)', url_check='/' WHERE framework_short='UK_ICO_COOKIES' AND severity='P0' AND rule_id ILIKE '%reject%';
UPDATE compliance_rules SET regex_pattern = '(cookie (policy|list)|cookies we use|types of cookies|cookie categories)' WHERE framework_short='UK_ICO_COOKIES' AND rule_id ILIKE '%policy%';
UPDATE compliance_rules SET regex_pattern = '(strictly necessary|functional|analytics|marketing|advertising|targeting) cookies?' WHERE framework_short='UK_ICO_COOKIES' AND rule_id ILIKE '%category%';
-- Default for any remaining
UPDATE compliance_rules SET regex_pattern = '(cookie|consent|reject|accept)' WHERE framework_short='UK_ICO_COOKIES' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- UK_SRA_COC · Solicitors Regulation Authority Code of Conduct
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(authorised and regulated by the (sra|solicitors regulation authority)|sra (id|number|no\\.?)|sra\\s*\\d{4,})' WHERE framework_short='UK_SRA_COC' AND severity='P0' AND rule_id ILIKE '%regulated%';
UPDATE compliance_rules SET regex_pattern = '(price (transparency|information)|pricing|fees? (information|guide|range)|our fees|cost of)' WHERE framework_short='UK_SRA_COC' AND severity='P0' AND rule_id ILIKE '%price%';
UPDATE compliance_rules SET regex_pattern = '(complaints? (procedure|policy|process)|how to complain|legal ombudsman)' WHERE framework_short='UK_SRA_COC' AND severity='P0' AND rule_id ILIKE '%complaint%';
UPDATE compliance_rules SET regex_pattern = '(client care|terms of engagement|engagement letter|retainer)' WHERE framework_short='UK_SRA_COC' AND rule_id ILIKE '%client%';
-- Default for remaining SRA rules
UPDATE compliance_rules SET regex_pattern = '(sra|solicitors regulation|authorised and regulated|complaints procedure)' WHERE framework_short='UK_SRA_COC' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- UK_CQC · Care Quality Commission
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(cqc|care quality commission|registered with cqc|cqc registration|provider id)' WHERE framework_short='UK_CQC' AND severity='P0' AND rule_id ILIKE '%register%';
UPDATE compliance_rules SET regex_pattern = '(cqc rating|inspection report|good|outstanding|requires improvement|inadequate)' WHERE framework_short='UK_CQC' AND rule_id ILIKE '%rating%';
UPDATE compliance_rules SET regex_pattern = '(duty of candour|being open|safeguarding|safe.{0,30}care)' WHERE framework_short='UK_CQC' AND rule_id ILIKE '%duty%';
UPDATE compliance_rules SET regex_pattern = '(cqc|care quality|registered manager|nominated individual)' WHERE framework_short='UK_CQC' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- UK_MHRA · Medicines & Healthcare products Regulatory Agency
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(mhra|medicines and healthcare products regulatory|gphc|general pharmaceutical council)' WHERE framework_short='UK_MHRA' AND rule_id ILIKE '%mhra%' OR rule_id ILIKE '%authority%';
UPDATE compliance_rules SET regex_pattern = '(prescription[- ]?only|pom|p medicine|gsl|general sales list|black triangle)' WHERE framework_short='UK_MHRA' AND rule_id ILIKE '%medicine%';
UPDATE compliance_rules SET regex_pattern = '(side effect|adverse reaction|yellow card|patient information leaflet|pil)' WHERE framework_short='UK_MHRA' AND rule_id ILIKE '%side%';
UPDATE compliance_rules SET regex_pattern = '(mhra|medicines and healthcare|gphc|pharmacy)' WHERE framework_short='UK_MHRA' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- UK_FCA_CONC25 · FCA Consumer Credit (financial promotions)
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(fca|financial conduct authority|authorised by the fca|fca\\s*(no|id|number)|firm reference number|frn[\\s:]?\\d)' WHERE framework_short='UK_FCA_CONC25' AND severity='P0' AND rule_id ILIKE '%authorised%';
UPDATE compliance_rules SET regex_pattern = '(representative apr|apr[\\s:]?\\d|total amount repayable|cost of credit|interest rate)' WHERE framework_short='UK_FCA_CONC25' AND rule_id ILIKE '%apr%';
UPDATE compliance_rules SET regex_pattern = '(consumer credit|loan.{0,40}(secured|unsecured)|missed payments|debt management)' WHERE framework_short='UK_FCA_CONC25' AND rule_id ILIKE '%consumer%';
UPDATE compliance_rules SET regex_pattern = '(risk warning|your home may be at risk|capital at risk|representative example)' WHERE framework_short='UK_FCA_CONC25' AND rule_id ILIKE '%risk%';
UPDATE compliance_rules SET regex_pattern = '(fca|financial conduct|frn|representative apr)' WHERE framework_short='UK_FCA_CONC25' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- EU_GDPR · GDPR (mirrors A13 + Art 28 processor + Art 32 security)
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(data protection officer|dpo|dataprotection@|privacy@)' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%dpo%';
UPDATE compliance_rules SET regex_pattern = '(article 28|data processing agreement|dpa|processor)' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%processor%';
UPDATE compliance_rules SET regex_pattern = '(security of processing|article 32|encryption|pseudonymisation|integrity and confidentiality)' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%security%';
UPDATE compliance_rules SET regex_pattern = '(international transfers?|chapter v|adequacy|sccs?|standard contractual clauses)' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%transfer%';
UPDATE compliance_rules SET regex_pattern = '(data subject rights|right to access|right to (rectification|erasure|portability))' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%rights%';
UPDATE compliance_rules SET regex_pattern = '(data protection authority|dpa|cnil|garante|aepd|datatilsynet|supervisory authority)' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%supervisory%';
UPDATE compliance_rules SET regex_pattern = '(consent|withdraw consent|opt[- ]?out|lawful basis)' WHERE framework_short='EU_GDPR' AND rule_id ILIKE '%consent%';
UPDATE compliance_rules SET regex_pattern = '(personal data|data subject|controller|processor|gdpr)' WHERE framework_short='EU_GDPR' AND (regex_pattern IS NULL OR regex_pattern = '');

-- ============================================================================
-- US_FTC · Federal Trade Commission (truth in advertising + endorsements + COPPA)
-- ============================================================================
UPDATE compliance_rules SET regex_pattern = '(testimonial.{0,50}(typical|individual|not typical|results may vary)|individual results may vary)' WHERE framework_short='US_FTC' AND rule_id ILIKE '%testimonial%';
UPDATE compliance_rules SET regex_pattern = '(paid (partnership|promotion|advertisement)|#ad|#sponsored|disclosure|material connection)' WHERE framework_short='US_FTC' AND rule_id ILIKE '%endorse%';
UPDATE compliance_rules SET regex_pattern = '(children.{0,20}under 13|coppa|parental consent|verifiable parental)' WHERE framework_short='US_FTC' AND rule_id ILIKE '%child%';
UPDATE compliance_rules SET regex_pattern = '(privacy (policy|notice)|do not sell.{0,20}personal|opt[- ]?out of sale)' WHERE framework_short='US_FTC' AND rule_id ILIKE '%privacy%';
UPDATE compliance_rules SET regex_pattern = '(ftc|federal trade commission|consumer protection|truth in advertising)' WHERE framework_short='US_FTC' AND (regex_pattern IS NULL OR regex_pattern = '');

COMMIT;

-- Sanity: how many rules still lack patterns?
SELECT framework_short, COUNT(*) AS missing FROM compliance_rules WHERE active=TRUE AND (regex_pattern IS NULL OR regex_pattern = '') GROUP BY framework_short ORDER BY 1;
