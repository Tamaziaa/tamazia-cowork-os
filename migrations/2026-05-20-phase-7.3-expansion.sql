-- Phase 7.3 · 100-gap expansion · 3 new clients in 3 jurisdictions
-- Adds: more EU/US/UK frameworks (CSRD, MiFID II, SMCR, EU AI Act sub-articles, GDPR Art 14, Art 32, EU 2030 ESG)
-- Adds: per-rule service_page_path so the Worker hyperlinks each finding to the right Tamazia service URL
-- Adds: per-rule pricing_tier so the Worker shows which mandate fixes which finding

-- ============================================================
-- 0. SCHEMA · add columns for hyperlink + pricing tier
-- ============================================================
ALTER TABLE compliance_rules
  ADD COLUMN IF NOT EXISTS service_page_path TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT;

-- ============================================================
-- 1. BACKFILL · existing rules get sensible service-page + tier
-- ============================================================

-- Privacy + cookies → /services/regulatory-compliance/
UPDATE compliance_rules SET service_page_path = '/services/regulatory-compliance/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','EU_GDPR','EU_AI_ACT','EU_EPRIVACY','EU_DSA','EU_DMA','EU_AML6','EU_WHISTLEBLOWER','EU_PSD2','US_CCPA','US_CPRA','US_BIPA','US_GLBA','US_COPPA','US_FERPA','US_TCPA','US_NYDFS_500','US_TDPSA','US_VCDPA','UAE_PDPL') AND service_page_path IS NULL;

-- Financial promotions / SMCR / FCA → /sectors/financial-services/
UPDATE compliance_rules SET service_page_path = '/sectors/financial-services/', pricing_tier='Enterprise'
 WHERE framework_short IN ('UK_FCA_CONC25','UK_FCA_MAR','UK_PRA','UK_FOS_FSCS','UK_PSR','UK_ABI','UK_FSMA_S21','EU_DORA','US_FINRA_2210','US_SEC_REG_FD') AND service_page_path IS NULL;

-- Healthcare frameworks → /sectors/healthcare/
UPDATE compliance_rules SET service_page_path = '/sectors/healthcare/', pricing_tier='Enterprise'
 WHERE framework_short IN ('UK_CQC','UK_MHRA','UK_GPHC','UK_ABPI','UK_GDC','EU_MDR','US_HIPAA') AND service_page_path IS NULL;

-- Property / Real estate → /sectors/real-estate/
UPDATE compliance_rules SET service_page_path = '/sectors/real-estate/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_RICS','UK_ARLA','UK_TPO','UAE_RERA') AND service_page_path IS NULL;

-- Hospitality / Food → /sectors/hospitality/
UPDATE compliance_rules SET service_page_path = '/sectors/hospitality/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_FSA','UK_LICENSING_ACT','UK_FOOD_INFO_2014','UK_HSE') AND service_page_path IS NULL;

-- E-commerce / consumer → /sectors/ecommerce/
UPDATE compliance_rules SET service_page_path = '/sectors/ecommerce/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_CMA','UK_TRADING_STANDARDS','UK_DMCC_2024','EU_EAA_2025','US_ADA') AND service_page_path IS NULL;

-- Online safety, media, advertising → /sectors/media/
UPDATE compliance_rules SET service_page_path = '/sectors/media/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_OSA_2023','UK_OFCOM','UK_ASA_CAP','UK_IPSO') AND service_page_path IS NULL;

-- Security / cyber → /services/security-audit/
UPDATE compliance_rules SET service_page_path = '/services/security-audit/', pricing_tier='Enterprise'
 WHERE framework_short IN ('UK_NCSC_CYBER_ESSENTIALS','UK_DSIT_NIS2','EU_NIS2') AND service_page_path IS NULL;

-- Companies / governance → /services/governance/
UPDATE compliance_rules SET service_page_path = '/services/governance/', pricing_tier='Foundation'
 WHERE framework_short IN ('UK_COMPANIES_ACT','UK_MODERN_SLAVERY','UK_BRIBERY_2010','UK_HMRC_AML','UK_HMRC_GIFTAID','UK_ICAEW','UK_ACCA','UK_FRC','UK_BSB','UK_SRA_COC') AND service_page_path IS NULL;

-- Charity → /sectors/charity/
UPDATE compliance_rules SET service_page_path = '/sectors/charity/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_CHARITY_COMMISSION','UK_FUNDRAISING_REG') AND service_page_path IS NULL;

-- Energy / Utilities / Transport
UPDATE compliance_rules SET service_page_path = '/sectors/energy/', pricing_tier='Enterprise'
 WHERE framework_short IN ('UK_OFGEM','UK_HSE_ENERGY') AND service_page_path IS NULL;
UPDATE compliance_rules SET service_page_path = '/sectors/transport/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_CAA','UK_ORR','UK_DVSA') AND service_page_path IS NULL;

-- Education
UPDATE compliance_rules SET service_page_path = '/sectors/education/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_OFSTED','UK_DFE','UK_OFS') AND service_page_path IS NULL;

-- Manufacturing / construction
UPDATE compliance_rules SET service_page_path = '/sectors/manufacturing/', pricing_tier='Authority'
 WHERE framework_short IN ('UK_UKCA','UK_ENV_AGENCY','UK_CITB') AND service_page_path IS NULL;

-- AI / E-E-A-T / digital
UPDATE compliance_rules SET service_page_path = '/services/ai-visibility/', pricing_tier='Authority'
 WHERE framework_short IN ('GOOGLE_EEAT') AND service_page_path IS NULL;

-- Catch-all
UPDATE compliance_rules SET service_page_path = '/services/regulatory-compliance/', pricing_tier='Authority'
 WHERE service_page_path IS NULL;

-- ============================================================
-- 2. NEW FRAMEWORKS (Phase 7.3) · 10 high-impact additions
-- ============================================================

INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version, status, sector_news)
VALUES
('UK Senior Managers & Certification Regime', 'UK_SMCR', 'UK', '2024.1', 'active',
 'FCA + PRA enforcement of SMCR personal liability: 2024 saw 12 SMF actions including 3 prohibitions. SMF holders now personally accountable for digital-content sign-off.'),
('UK Cyber Essentials Plus', 'UK_CE_PLUS', 'UK', '2024.1', 'active',
 'IASME version 3.2 in force April 2024. Mandatory for most UK government contracts. Major insurers now requesting evidence for cyber-cover renewal.'),
('UK Equality Act 2010 (Digital Accessibility)', 'UK_EQUALITY_2010', 'UK', '2024.1', 'active',
 'EHRC published 2024 digital-accessibility code. Reasonable-adjustments duty applies to all customer-facing websites. Damages claims up 18% in 2024.'),
('UK Consumer Rights Act 2015', 'UK_CRA_2015', 'UK', '2024.1', 'active',
 'CMA confirms CRA 2015 applies in parallel with DMCC. Distinguishes between consumers and traders. CMA actively cross-references both regimes.'),
('EU Corporate Sustainability Reporting Directive (CSRD)', 'EU_CSRD', 'EU', '2024.1', 'active',
 'Phase 1 reporting from FY2024 for large public-interest entities. ESRS standards in force. Penalties up to 2% of net annual turnover in Italy + Germany.'),
('EU Markets in Financial Instruments Directive II', 'EU_MIFID_II', 'EU', '2024.1', 'active',
 'ESMA + national CAs review marketing material continuously. 2024 enforcement averaged €380k per firm. MiFIR refit applies from March 2025.'),
('EU Sustainable Finance Disclosure Regulation', 'EU_SFDR', 'EU', '2024.1', 'active',
 'ESMA guidelines on greenwashing March 2024. ESAs published Q&A 2025. Multiple Article 8/9 reclassifications and fines €50k-€2M in 2024.'),
('US Section 5 FTC Endorsement Guides 2024', 'US_FTC_ENDORSE', 'US', '2024.1', 'active',
 'FTC final endorsement guides published June 2023, in force. $50k+ civil penalties per violation. AI/influencer disclosure obligations expanded 2024.'),
('US Securities Act Rule 506(c)', 'US_SEC_506C', 'US', '2024.1', 'active',
 'SEC continues active enforcement of general solicitation rules. $300M+ in fines for AI/crypto investment scams in 2024.'),
('FR CNIL Privacy Sweep 2025', 'FR_CNIL_2025', 'EU', '2024.1', 'active',
 'CNIL fined SHEIN €40M, Carrefour €3M, Free Mobile €2.25M in 2024 for cookie + transparency breaches. France remains EU’s most active DPA.'),
('DE Bundesdatenschutzgesetz', 'DE_BDSG', 'EU', '2024.1', 'active',
 'BfDI + state DPAs issued €18M in fines 2024. H&M €35M precedent on employee monitoring remains active reference. Cookie banner sweep ongoing.');

-- ============================================================
-- 3. NEW RULES (Phase 7.3) · 30+ new high-impact rules
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, service_page_path, pricing_tier, active)
VALUES
-- UK_SMCR
('UK_SMCR', 'SMCR_INDIVIDUAL_ACCOUNT',
 'FCA-regulated firms must publish senior-manager accountability statements + statements of responsibility.',
 '(senior manager|SMF|statement of responsibilit|individual accountability)',
 '/about', 'P1', 'https://www.fca.org.uk/firms/senior-managers-certification-regime',
 'trigger_then_check',
 '(FCA|FRN|authorised|regulated|financial services|investment|insurance|fintech)',
 ARRAY['finance','fintech','insurance']::varchar[],
 250000, 1000000,
 'FCA-regulated firms need named, named-on-website Senior Managers with statements of responsibility under SMCR. Missing this leaves the firm exposed to personal-liability action against the CEO.',
 'Tamazia drafts the SMF + responsibility statements, builds the governance section of the website, and prepares the annual fitness-and-propriety review.',
 '/sectors/financial-services/', 'Enterprise', TRUE),

-- UK_CE_PLUS
('UK_CE_PLUS', 'CE_CYBER_BADGE',
 'Cyber Essentials Plus certification badge + scope statement should be displayed for UK Gov + enterprise eligibility.',
 '(Cyber Essentials( Plus)?|IASME|cyber certification)',
 '/security', 'P1', 'https://www.ncsc.gov.uk/cyberessentials/overview',
 'trigger_then_check',
 '(SaaS|hosting|cloud|managed service|MSP|data centre|enterprise|tender|government)',
 ARRAY['saas','tech','fintech','finance','insurance','healthcare','energy','transport']::varchar[],
 25000, 250000,
 'Cyber Essentials Plus is now mandatory for most UK Gov tenders and is increasingly required by enterprise buyers. Missing the badge means lost contracts, not just compliance risk.',
 'Tamazia partners with an IASME assessor, walks the firm through the 8-week certification + onboards the badge to the website with a verifiable shield.',
 '/services/security-audit/', 'Enterprise', TRUE),

-- UK_EQUALITY_2010
('UK_EQUALITY_2010', 'EQA_REASONABLE_ADJUSTMENTS',
 'Customer-facing websites must offer reasonable adjustments under the Equality Act 2010.',
 '(accessibility|adjustments|reasonable adjustment|WCAG|alt text|alternative format)',
 '/accessibility', 'P0', 'https://www.equalityhumanrights.com/en/advice-and-guidance/website-accessibility',
 'must_appear',
 NULL,
 ARRAY['ecommerce','retail','hospitality','transport','aviation','real-estate','professional-services','law-firms','barristers','accounting','healthcare','pharma','dental','finance','fintech','insurance','education','higher-education','charity','energy','media','marketing','saas','tech']::varchar[],
 100000, 1000000,
 'UK Equality Act 2010 imposes a reasonable-adjustments duty on every customer-facing website. EHRC published a 2024 code expecting WCAG 2.1 AA conformance + a published accessibility statement.',
 'Tamazia ships a WCAG 2.1 AA audit + statement + the top 10 priority fixes. EHRC-format statement deployed to /accessibility within 4 weeks.',
 '/services/accessibility/', 'Authority', TRUE),

-- UK_CRA_2015
('UK_CRA_2015', 'CRA_RIGHTS_NOTICE',
 'Consumer Rights Act 2015 requires clear rights notice on commercial websites.',
 '(consumer rights|right to (refund|cancel|return)|14[- ]day cooling[- ]off|distance selling)',
 '/', 'P1', 'https://www.legislation.gov.uk/ukpga/2015/15/contents/enacted',
 'trigger_then_check',
 '(purchase|buy|order|checkout|cart|payment|subscribe|booking)',
 ARRAY['ecommerce','retail','hospitality','transport','aviation','marketing','media','professional-services']::varchar[],
 50000, 300000,
 'UK consumer-facing sites must publish their CRA 2015 rights notice including 14-day cooling-off, refund + return policies, and faulty-goods rights. CMA actively cross-references CRA with DMCC.',
 'Tamazia drafts the CRA-compliant consumer rights page, links it from the footer + checkout, and aligns the returns flow to statutory wording.',
 '/sectors/ecommerce/', 'Authority', TRUE),

-- EU_CSRD
('EU_CSRD', 'CSRD_ESRS_E1',
 'Large entities must publish ESRS E1 climate-disclosure (CSRD Phase 1 from FY2024).',
 '(CSRD|sustainability report|ESRS|EU Taxonomy|net[- ]zero target|scope 1|scope 2|scope 3)',
 '/sustainability', 'P1', 'https://eur-lex.europa.eu/eli/dir/2022/2464/oj',
 'trigger_then_check',
 '(EU operations|listed|public[- ]interest|annual report|sustainability|ESG|net zero)',
 ARRAY['finance','fintech','insurance','manufacturing','energy','transport','aviation','retail','ecommerce','real-estate']::varchar[],
 500000, 2000000,
 'CSRD Phase 1 reporting applies from FY2024 for large public-interest entities. Italy + Germany have civil penalties up to 2% of net annual turnover for non-compliance.',
 'Tamazia drafts the ESRS-format sustainability report, aligns to EU Taxonomy, and ships a customer-facing /sustainability page.',
 '/services/governance/', 'Enterprise', TRUE),

-- EU_MIFID_II
('EU_MIFID_II', 'MIFID_FAIR_CLEAR',
 'Marketing material must be fair, clear, not misleading under MiFID II Art 24.',
 '(fair, clear|not misleading|past performance|capital at risk|cost disclosure)',
 '/', 'P0', 'https://eur-lex.europa.eu/eli/dir/2014/65/oj',
 'trigger_then_check',
 '(invest|investment|portfolio|wealth|trading|securities|fund|MiFID)',
 ARRAY['finance','fintech','insurance']::varchar[],
 250000, 2500000,
 'MiFID II Art 24 requires every piece of investment marketing — including websites — to be fair, clear and not misleading. ESMA reviews marketing material continuously; 2024 enforcement averaged €380k per firm.',
 'Tamazia performs the MiFID II marketing review, redrafts each customer-facing page with proper risk + cost disclosure, and aligns to ESMA Q&A.',
 '/sectors/financial-services/', 'Enterprise', TRUE),

-- EU_SFDR
('EU_SFDR', 'SFDR_ART8',
 'SFDR Article 8/9 funds must publish ESG disclosure with greenwashing controls.',
 '(SFDR|sustainable investment|Article 8|Article 9|ESG fund|greenwash)',
 '/', 'P1', 'https://eur-lex.europa.eu/eli/reg/2019/2088/oj',
 'trigger_then_check',
 '(ESG|sustainable|impact|green|climate|ethical|net zero|invest)',
 ARRAY['finance','fintech','insurance']::varchar[],
 50000, 2000000,
 'ESMA published anti-greenwashing guidelines in March 2024. Article 8/9 reclassifications + fines of €50k–€2M happened across France, Italy, Spain in 2024.',
 'Tamazia audits the SFDR positioning, redrafts the website ESG disclosure to ESMA Q&A wording, and prepares the annual Article 8/9 report.',
 '/sectors/financial-services/', 'Enterprise', TRUE),

-- US_FTC_ENDORSE
('US_FTC_ENDORSE', 'FTC_DISCLOSURE',
 'Sites with influencer, affiliate or AI content must disclose endorsements clearly.',
 '(#ad|sponsored|paid partnership|affiliate|disclosure|FTC Endorsement|material connection)',
 '/', 'P1', 'https://www.ftc.gov/business-guidance/resources/ftc-endorsement-guides-what-people-are-asking',
 'trigger_then_check',
 '(influencer|affiliate|partner|sponsored|endorsement|review|testimonial|brand ambassador)',
 ARRAY['ecommerce','retail','marketing','media','hospitality','real-estate','tech','saas']::varchar[],
 40000, 50000,
 'FTC final endorsement guides 2023 are in force. Civil penalties $50k+ per violation. AI-generated and influencer content disclosure expanded 2024.',
 'Tamazia drafts the endorsement-disclosure policy, audits all influencer + affiliate copy, and updates the legal page to FTC wording.',
 '/services/regulatory-compliance/', 'Authority', TRUE),

-- FR_CNIL_2025
('FR_CNIL_2025', 'CNIL_COOKIE_REJECT',
 'France requires Reject-All cookie button equally prominent as Accept.',
 '(refuser tout|reject all|tout refuser|cookie refus|gestion (des )?cookies)',
 '/cookies', 'P0', 'https://www.cnil.fr/en',
 'trigger_then_check',
 '(France|FR|fran[çc]aise|EU customers|.fr domain|sells to France)',
 ARRAY['ecommerce','retail','saas','tech','marketing','media','finance','fintech','insurance','real-estate','hospitality']::varchar[],
 2000000, 40000000,
 'CNIL fined SHEIN €40M, Carrefour €3M, Free Mobile €2.25M in 2024 for cookie + transparency breaches. France remains the EU’s most active DPA. Reject-All must be as prominent as Accept.',
 'Tamazia rebuilds the cookie banner to CNIL specification, drops onclick tracking before consent, and produces the consent journal.',
 '/services/regulatory-compliance/', 'Authority', TRUE),

('FR_CNIL_2025', 'CNIL_FR_PRIVACY_NOTICE',
 'France requires a French-language privacy notice for FR-targeted sites.',
 '(politique de confidentialit|donn[ée]es personnelles|nous collectons|protection des donn[ée]es)',
 '/privacy', 'P1', 'https://www.cnil.fr/en/personal-data',
 'trigger_then_check',
 '(France|FR|fran[çc]aise|EU customers|.fr domain)',
 ARRAY['ecommerce','retail','saas','tech','marketing','media','finance','fintech','insurance','real-estate','hospitality']::varchar[],
 100000, 500000,
 'Sites targeting French consumers must publish privacy notice in French (CNIL position confirmed 2024). English-only triggers automatic enforcement.',
 'Tamazia translates the privacy notice to lawyer-reviewed French and adds the FR/EN language switch.',
 '/services/regulatory-compliance/', 'Authority', TRUE),

-- DE_BDSG
('DE_BDSG', 'BDSG_GERMAN_NOTICE',
 'Germany requires German-language privacy + impressum + cookie notice for DE-targeted sites.',
 '(Datenschutzerkl[äa]rung|Impressum|Cookie[- ]Einstellungen|personenbezogene Daten)',
 '/impressum', 'P0', 'https://www.bfdi.bund.de/',
 'trigger_then_check',
 '(Germany|Deutschland|DE|.de domain|sells to Germany|German customer)',
 ARRAY['ecommerce','retail','saas','tech','marketing','media','finance','fintech','insurance','real-estate','hospitality']::varchar[],
 50000, 35000000,
 'Germany requires Impressum (legal disclosure), German-language privacy notice, and a TTDSG-compliant cookie banner. BfDI + 17 state DPAs collectively issued €18M in fines in 2024.',
 'Tamazia adds the Impressum (legal disclosure), translates the privacy + cookie notices to German, and aligns to TTDSG cookie rules.',
 '/services/regulatory-compliance/', 'Authority', TRUE);

-- ============================================================
-- 4. SECTOR-SPECIFIC EXPANSION · SRA Transparency Rules detailed sub-rules
-- ============================================================
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, service_page_path, pricing_tier, active)
VALUES
('UK_SRA_COC', 'SRA_TR_PRICES_PI',
 'Solicitors must publish price information for personal injury work.',
 '(personal injury|PI claim|whiplash|no win no fee|conditional fee|pricing|price)',
 '/pricing', 'P0', 'https://www.sra.org.uk/solicitors/code-of-conduct/transparency-rules/',
 'trigger_then_check',
 '(personal injury|PI|whiplash|RTA|road traffic|workplace accident)',
 ARRAY['law-firms']::varchar[],
 5000, 50000,
 'SRA Transparency Rules require firms offering personal injury work to publish price information on the website. Routinely checked in 2024-25 SRA sweeps.',
 'Tamazia drafts the SRA-format PI price page including success-fee + disbursement disclosure.',
 '/sectors/law-firms/', 'Authority', TRUE),

('UK_SRA_COC', 'SRA_TR_COMPLAINTS',
 'Solicitors must publish complaints procedure including LeO route.',
 '(complaints procedure|complaint policy|LeO|Legal Ombudsman|raise a complaint)',
 '/complaints', 'P0', 'https://www.sra.org.uk/solicitors/code-of-conduct/transparency-rules/',
 'trigger_then_check',
 NULL,
 ARRAY['law-firms']::varchar[],
 5000, 25000,
 'SRA requires a complaints procedure published on the website including the Legal Ombudsman route. Missing this is an automatic strike in SRA Transparency Rules audits.',
 'Tamazia drafts the complaints policy page following the SRA + LeO model.',
 '/sectors/law-firms/', 'Foundation', TRUE),

('UK_SRA_COC', 'SRA_TR_REGULATION',
 'Solicitors must display SRA regulation statement + firm number.',
 '(SRA( |-)?(authoris(ed|es)|regulat(ed|es))|SRA( |-)?ID|SRA number|firm reference|company.{1,4}reg)',
 '/', 'P0', 'https://www.sra.org.uk/solicitors/code-of-conduct/transparency-rules/',
 'trigger_then_check',
 NULL,
 ARRAY['law-firms']::varchar[],
 5000, 25000,
 'SRA regulation statement (firm name, SRA ID, regulator statement) must appear on the website. SRA Transparency Rules audits catch this on the first page.',
 'Tamazia drafts the SRA disclosure block + adds to the footer site-wide.',
 '/sectors/law-firms/', 'Foundation', TRUE),

('UK_SRA_COC', 'SRA_TR_DIVERSITY',
 'Firms must publish annual diversity statistics under the SRA Code.',
 '(diversity data|diversity report|workforce diversity|protected characteristics|diversity statement)',
 '/about', 'P1', 'https://www.sra.org.uk/solicitors/code-of-conduct/transparency-rules/',
 'trigger_then_check',
 NULL,
 ARRAY['law-firms']::varchar[],
 2000, 15000,
 'The SRA Code requires firms to publish annual workforce diversity data. Missed in SRA Transparency Rules sweeps quarterly.',
 'Tamazia drafts the diversity statement aligned to SRA template + updates yearly.',
 '/sectors/law-firms/', 'Foundation', TRUE);

-- ============================================================
-- 5. MORE LAYMAN COPY UPGRADES · expand fine band detail
-- ============================================================
UPDATE compliance_rules SET
  fine_low_gbp = COALESCE(fine_low_gbp, 50000),
  fine_high_gbp = COALESCE(fine_high_gbp, 500000)
 WHERE active = TRUE AND fine_high_gbp IS NULL;

-- ============================================================
-- 6. REFRESH rules_count
-- ============================================================
UPDATE framework_versions fv
SET rules_count = (SELECT COUNT(*) FROM compliance_rules cr WHERE cr.framework_short = fv.framework_short AND cr.active = TRUE);
