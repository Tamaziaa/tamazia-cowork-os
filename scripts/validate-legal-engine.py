#!/usr/bin/env python3
# Permanent legal-engine validation harness — 17 deterministic checks (zero LLM) over the catalogue + live
# audits. Run anytime to catch regressions; near-zero cost. Each check prints PASS/FAIL + offending rows.
import subprocess, json, re
import os; DB=os.environ.get('NEON_URL') or os.environ.get('NEON_CONNECTION_STRING')
def q(sql):
    r=subprocess.run(['psql',DB,'-tA','-F','|','-c',sql],capture_output=True,text=True)
    return [l for l in r.stdout.strip().split('\n') if l]
fails=0; checks=0
def check(name, rows, show=5):
    global fails, checks; checks+=1
    n=len(rows)
    if n==0: print(f"  [PASS] {name}")
    else:
        fails+=1; print(f"  [FAIL] {name} — {n} offending:"); [print(f"         {r}") for r in rows[:show]]

print("=== LEGAL-ENGINE VALIDATION HARNESS (17 checks) ===")
# 1. statutory max must be >= typical_high (a max below the typical range is incoherent)
check("1. statutory_max >= enforce_typical_high", q("SELECT framework_short||' max='||fine_high_gbp||' typ_high='||enforce_typical_high_gbp FROM compliance_rules WHERE active AND fine_high_gbp IS NOT NULL AND enforce_typical_high_gbp IS NOT NULL AND fine_high_gbp < enforce_typical_high_gbp"))
# 2. non-fining-basis frameworks must have NULL fines
check("2. non_monetary/none/unlimited/per_violation have NULL fine", q("SELECT DISTINCT framework_short FROM compliance_rules WHERE active AND penalty_basis IN ('non_monetary','none','unlimited','per_violation') AND fine_high_gbp IS NOT NULL"))
# 3. every active rule has penalty_basis
check("3. every active rule has penalty_basis", q("SELECT DISTINCT framework_short FROM compliance_rules WHERE active AND COALESCE(penalty_basis,'')=''"))
# 4. every framework has enforcement methodology + context
check("4. every framework has enforcement methodology+context", q("SELECT DISTINCT framework_short FROM compliance_rules WHERE active AND (enforce_methodology IS NULL OR enforce_context IS NULL)"))
# 5. no P0 on non-monetary/none/voluntary frameworks
check("5. no P0 severity on non-monetary/none basis", q("SELECT framework_short||'/'||rule_id FROM compliance_rules WHERE active AND severity='P0' AND penalty_basis IN ('non_monetary','none')"))
# 6. framework code prefix matches framework_versions jurisdiction
check("6. code prefix matches jurisdiction", q("SELECT fv.framework_short||' code-prefix vs juris='||fv.jurisdiction FROM framework_versions fv WHERE EXISTS(SELECT 1 FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active) AND ((fv.framework_short LIKE 'UK\\_%' AND fv.jurisdiction NOT IN ('UK')) OR (fv.framework_short LIKE 'US\\_%' AND fv.jurisdiction NOT IN ('US')) OR (fv.framework_short LIKE 'UAE\\_%' AND fv.jurisdiction NOT IN ('AE')))"))
# 7. every active legal (fining/turnover) rule has a citation_url
check("7. fining rules have citation_url", q("SELECT framework_short||'/'||rule_id FROM compliance_rules WHERE active AND penalty_basis IN ('fixed_gbp','turnover_pct') AND COALESCE(citation_url,'')=''"))
# 8. enforce typical low <= high, both >=0
check("8. enforce typical low<=high", q("SELECT framework_short FROM compliance_rules WHERE active AND enforce_typical_low_gbp IS NOT NULL AND enforce_typical_high_gbp IS NOT NULL AND enforce_typical_low_gbp > enforce_typical_high_gbp"))
# 9. sector_relevance values are known sectors (spot: no obviously bad tokens)
check("9. sector_relevance has no empty-string members", q("SELECT DISTINCT framework_short FROM compliance_rules WHERE active AND '' = ANY(sector_relevance)"))
# 10. DE_/FR_ national laws tagged national not EU (currently EU — known issue, flag)
check("10. national EU laws (DE_/FR_) not mistagged 'EU'", q("SELECT framework_short||'='||jurisdiction FROM framework_versions WHERE (framework_short LIKE 'DE\\_%' OR framework_short LIKE 'FR\\_%') AND jurisdiction='EU'"))
# 11. no framework both turnover_pct AND a fixed fine below £1m (turnover regimes shouldn't carry a tiny fixed fine)
check("11. turnover_pct fixed-limb sanity (>= £1m if set)", q("SELECT DISTINCT framework_short||'='||fine_high_gbp FROM compliance_rules WHERE active AND penalty_basis='turnover_pct' AND fine_high_gbp IS NOT NULL AND fine_high_gbp < 1000000"))
# 12. UK_FSA methodology must not reference FCA/DEPP (regulator confusion guard)
check("12. UK_FSA enforcement not confused with FCA/DEPP", q("SELECT framework_short FROM compliance_rules WHERE active AND framework_short='UK_FSA' AND enforce_methodology ~* 'DEPP|financial conduct'"))
# 13. severity distribution: P0 should be a minority (<30% of active rules)
p0=int(q("SELECT count(*) FILTER (WHERE severity='P0')*100/count(*) FROM compliance_rules WHERE active")[0])
check(f"13. P0 share <30% (currently {p0}%)", [] if p0<30 else [f"P0 is {p0}% of active rules"])
# 14-17: live-audit consistency (recent payloads)
# 14. no audit with a framework that has zero active rules
check("14. audits cite only frameworks that have active rules", q("""
WITH a AS (SELECT DISTINCT jsonb_array_elements_text(payload_json->'applicable_frameworks') f FROM audit_pages WHERE generated_at>now()-interval '3 days')
SELECT a.f FROM a WHERE NOT EXISTS(SELECT 1 FROM compliance_rules cr WHERE cr.framework_short=a.f AND cr.active) AND a.f NOT IN ('GOOGLE_EEAT','SEO','GEO')"""))
# 15. no recent audit pointer with empty framework AND compliance bucket (fabricated)
check("15. no fabricated compliance pointer (empty fw) in recent audits", q("""
SELECT domain FROM audit_pages ap, jsonb_array_elements(ap.payload_json->'pointers') p
WHERE ap.generated_at>now()-interval '3 days' AND p->>'bucket'='compliance' AND COALESCE(p->>'framework_short','')='' LIMIT 10"""))
# 16. recent UK-only audits should not carry US_ national frameworks (jurisdiction bleed) — sample
check("16. no US_ framework on .co.uk audits minted post-fix (sample)", q("""
SELECT ap.domain FROM audit_pages ap
WHERE ap.generated_at>now()-interval '2 days' AND ap.domain LIKE '%.co.uk'
  AND ap.payload_json->'applicable_frameworks' ?| array['US_HIPAA','US_MEDICAL_BOARD','US_FTC','US_CCPA'] LIMIT 10"""))
# 17. recent audits: detected_jurisdiction present
check("17. recent audits have a resolved country (not empty)", q("""
SELECT domain FROM audit_pages WHERE generated_at>now()-interval '2 days' AND COALESCE(country,'') IN ('','XX') LIMIT 10"""))

# --- comprehensive gap-scan checks (promoted from adversarial gap discovery) ---
_UNIV="'GOOGLE_EEAT','UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','UK_EQUALITY_2010','UK_DMCC_2024','UK_COMPANIES_ACT','UK_CMA','UK_TRADING_STANDARDS','UK_ASA_CAP','UK_CRA_2015','EU_GDPR','EU_EPRIVACY','EU_AI_ACT','EU_EAA_2025','EU_DSA','US_FTC','US_CPRA','US_CCPA','US_FTC_ENDORSE','US_ADA','US_TCPA','US_VCDPA','US_TDPSA','UAE_PDPL','DIFC_DPL','ADGM_DPR','SAUDI_PDPL','QATAR_PDPPL','DE_BDSG','FR_CNIL_2025'"
check("18. framework w/ rules but unroutable (no sector_relevance, not universal)", q(f"SELECT DISTINCT framework_short FROM compliance_rules cr WHERE active AND framework_short NOT IN ({_UNIV}) AND NOT EXISTS (SELECT 1 FROM compliance_rules c2 WHERE c2.framework_short=cr.framework_short AND c2.active AND array_length(c2.sector_relevance,1)>0)"))
check("19. must_appear rule with an ignored trigger_pattern (over-attach risk)", q("SELECT framework_short||'/'||rule_id FROM compliance_rules WHERE active AND rule_type='must_appear' AND COALESCE(trigger_pattern,'')<>''"))
check("20. P3 severity on a turnover-percentage (major-fine) framework", q("SELECT framework_short||'/'||rule_id FROM compliance_rules WHERE active AND severity='P3' AND penalty_basis='turnover_pct'"))
check("21. framework jurisdiction not routable", q("SELECT framework_short||'='||jurisdiction FROM framework_versions fv WHERE EXISTS(SELECT 1 FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active) AND jurisdiction NOT IN ('UK','US','EU','AE','SA','QA','GLOBAL','DE','FR','GB')"))
check("22. duplicate-statute frameworks (same name key, both active)", q("SELECT string_agg(framework_short,', ') FROM framework_versions fv WHERE EXISTS(SELECT 1 FROM compliance_rules cr WHERE cr.framework_short=fv.framework_short AND cr.active) GROUP BY lower(regexp_replace(framework_name,'[^a-zA-Z]','','g')) HAVING count(*)>1"))

# --- detection-coherence gates (catch sector/jurisdiction mis-detection deterministically, low LLM dependence) ---
check("23. recent regulated-sector audit MISSING its core regulator (detection/mapping mismatch)", q("""
SELECT domain||' ('||(payload_json->>'detected_sector')||')' FROM audit_pages ap
WHERE generated_at>now()-interval '2 days' AND COALESCE(payload_json->>'reachable','')<>'false'
  AND (
   (payload_json->>'detected_sector' ~* 'financ|fintech' AND NOT (payload_json->'applicable_frameworks' ?| array['UK_FCA_CONDUCT','UK_FCA_CONC25','UK_FSMA_S21','UK_SMCR','US_SEC_REG_FD','US_FINRA_2210','EU_MIFID_II','AE_DFSA_COB']))
   OR (payload_json->>'detected_sector' ~* 'healthcare|dental|aesthetic|fertility|pharmacy' AND NOT (payload_json->'applicable_frameworks' ?| array['UK_CQC','UK_GDC','UK_MHRA','UK_HFEA','US_HIPAA','UAE_DHA','UAE_DOH','US_MEDICAL_BOARD','UK_CQC_FUNDAMENTAL_STANDARDS','UK_GPHC']))
   OR (payload_json->>'detected_sector' ~* 'law|legal|solicit' AND NOT (payload_json->'applicable_frameworks' ?| array['UK_SRA_COC','UK_SRA_TRANSPARENCY','UK_BSB','US_ATTORNEY_ADVERTISING']))
  ) LIMIT 12"""))
check("24. recent audit jurisdiction conflicts with domain ccTLD", q("""
SELECT domain||' country='||COALESCE(country,'') FROM audit_pages WHERE generated_at>now()-interval '2 days'
  AND ((domain ILIKE '%.co.uk' AND country NOT IN ('UK','GB','GBR','')) OR (domain ILIKE '%.ae' AND country NOT IN ('AE','UAE','')) OR (domain ILIKE '%.uk' AND country NOT IN ('UK','GB','GBR',''))) LIMIT 12"""))
check("25. recent reachable audit with no detected_sector (classification failure)", q("""
SELECT domain FROM audit_pages WHERE generated_at>now()-interval '2 days' AND COALESCE(payload_json->>'reachable','')='true' AND COALESCE(payload_json->>'detected_sector','')='' LIMIT 12"""))

print(f"\n=== {checks-fails}/{checks} checks PASS, {fails} FAIL ===")
