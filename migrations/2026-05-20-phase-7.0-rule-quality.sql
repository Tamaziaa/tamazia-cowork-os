-- Phase 7.0 · Stop false positives + add fines + sector relevance + layman explanations.
-- Surfaced gaps: EU AI Act ART6 firing on a restaurant ("high-risk AI: CV screening, credit scoring, medical")
-- when the restaurant doesn't run such systems. Fix: invert the rule logic so trigger-based rules
-- only fire when the trigger phrase IS present, and gate by sector relevance.

BEGIN;

-- ============================================================================
-- 1. Schema extensions
-- ============================================================================
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS rule_type VARCHAR(30) NOT NULL DEFAULT 'must_appear';
  -- Values: must_appear (breach if pattern absent on the policy page)
  --         trigger_then_check (only relevant if the site shows the trigger; require disclosure)
  --         prohibit (breach if pattern IS present)
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS trigger_pattern TEXT;
  -- For trigger_then_check rules: the trigger phrase that activates the rule.
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS sector_relevance TEXT[];
  -- Empty/NULL = universal (applies to every sector). Otherwise list of sectors.
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS fine_low_gbp INTEGER;
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS fine_high_gbp INTEGER;
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS layman_explanation TEXT;
ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS tamazia_fix_short TEXT;

-- ============================================================================
-- 2. Fix EU AI Act rules — these were the worst false positives.
-- Convert ART4 / ART5 / ART6 / ART50 / ART53 to trigger_then_check.
-- They only matter if the site actually mentions AI / chatbot / automated systems.
-- ============================================================================
UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(\bai\b|artificial intelligence|chatbot|machine learning|generative ai|automated decision)',
    sector_relevance = NULL,
    fine_low_gbp = 6500000, fine_high_gbp = 30000000,
    layman_explanation = 'If your site shows AI features to customers, EU law requires a clear notice that AI is being used. Without it, you can be fined up to €35M or 7% of global turnover.',
    tamazia_fix_short = 'Tamazia adds the EU AI Act Article 4 AI-literacy notice and a "How we use AI" page where AI features exist.'
WHERE framework_short = 'EU_AI_ACT' AND rule_id = 'ART4';

UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(social scoring|emotion recognition|biometric categorisation|subliminal techniques)',
    sector_relevance = NULL,
    fine_low_gbp = 6500000, fine_high_gbp = 30000000,
    layman_explanation = 'Some AI uses (social scoring, emotion reading, biometric profiling) are banned in the EU. If your site uses any of these, you face the highest tier of fines.',
    tamazia_fix_short = 'Tamazia audits the AI features against Article 5 prohibitions and removes any banned use case before publication.'
WHERE framework_short = 'EU_AI_ACT' AND rule_id = 'ART5';

UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(cv screening|resume screening|applicant tracking|credit scoring|underwriting|medical (diagnosis|ai|imaging)|biometric (identification|verification)|recidivism|exam scoring|admissions ai)',
    sector_relevance = ARRAY['fintech','finance','insurance','healthcare','pharma','education','higher-education','saas'],
    fine_low_gbp = 6500000, fine_high_gbp = 30000000,
    layman_explanation = 'If you use AI for hiring, credit decisions, insurance underwriting, or medical diagnosis, EU law treats it as high-risk. You must publish a risk-management notice or face very large fines.',
    tamazia_fix_short = 'Tamazia drafts the high-risk AI disclosure, the conformity-assessment route and the CE marking statement where required.'
WHERE framework_short = 'EU_AI_ACT' AND rule_id = 'ART6';

UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(chatbot|virtual assistant|ai assistant|generative ai|ai[- ]?generated|ai content|ai-powered|deepfake)',
    sector_relevance = NULL,
    fine_low_gbp = 1500000, fine_high_gbp = 7500000,
    layman_explanation = 'When you talk to a customer through an AI chatbot or show AI-generated content, EU law says you must tell the customer it is AI. Missing this is a smaller but still material fine.',
    tamazia_fix_short = 'Tamazia injects an "AI-generated content" disclosure label on every output produced by an AI tool, per Article 50.'
WHERE framework_short = 'EU_AI_ACT' AND rule_id = 'ART50';

UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(foundation model|gpai|general[- ]?purpose ai|llm|large language model)',
    sector_relevance = ARRAY['saas','tech','fintech','insurance','media'],
    fine_low_gbp = 1500000, fine_high_gbp = 7500000,
    layman_explanation = 'If your product builds on or trains a general-purpose AI model, EU law requires a public transparency notice. Missing it triggers material fines.',
    tamazia_fix_short = 'Tamazia drafts the GPAI transparency notice covering training-data summary and copyright-respect policy.'
WHERE framework_short = 'EU_AI_ACT' AND rule_id = 'ART53';

-- ============================================================================
-- 3. Fix CCPA — only relevant if site sells/processes CA-resident data
-- (For UK-only firms it doesn't apply — DON'T fire it.)
-- ============================================================================
UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(california|ccpa|cpra|us customers|california residents|do not sell)',
    sector_relevance = NULL,
    fine_low_gbp = 2000, fine_high_gbp = 7500,
    layman_explanation = 'If you sell to or track California residents, you must show a "Do Not Sell or Share My Personal Information" link. Each missing link is a per-incident fine.',
    tamazia_fix_short = 'Tamazia adds the CCPA footer link and the privacy-rights webform that resolves within 15 business days.'
WHERE framework_short = 'US_CCPA';

-- ============================================================================
-- 4. Fix HIPAA — only relevant if healthcare/pharma + US presence
-- ============================================================================
UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(patient|phi|protected health information|medical record|us patients|hipaa)',
    sector_relevance = ARRAY['healthcare','pharma','dental','tech'],
    fine_low_gbp = 50000, fine_high_gbp = 1500000,
    layman_explanation = 'If you handle US health data, HIPAA requires a written authorisation for marketing and a Notice of Privacy Practices. Missing these triggers tier-2 to tier-4 fines per incident.',
    tamazia_fix_short = 'Tamazia drafts the HIPAA marketing authorisation form and the Notice of Privacy Practices.'
WHERE framework_short = 'US_HIPAA';

-- ============================================================================
-- 5. Fix SEC Reg FD — only listed companies / pre-IPO
-- ============================================================================
UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(investor relations|nasdaq|nyse|listed company|ipo|sec filings|10-?q|10-?k|annual report|shareholders)',
    sector_relevance = ARRAY['finance','fintech','insurance','tech','saas'],
    fine_low_gbp = 100000, fine_high_gbp = 5000000,
    layman_explanation = 'Listed and pre-IPO companies must give material information to all investors at the same time. Selective disclosure to analysts triggers SEC enforcement.',
    tamazia_fix_short = 'Tamazia builds the investor-relations disclosure workflow and aligns press-release timing to Reg FD.'
WHERE framework_short = 'US_SEC_REG_FD';

UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(investor relations|ipo|listed|sec filings|nasdaq|nyse)',
    sector_relevance = ARRAY['finance','fintech','insurance'],
    fine_low_gbp = 50000, fine_high_gbp = 1000000,
    layman_explanation = 'Broker-dealer communications about past performance must include a disclosure that results may vary. FINRA enforces this on retail-facing content.',
    tamazia_fix_short = 'Tamazia drafts the FINRA 2210 past-performance disclosure block and embeds it on every applicable page.'
WHERE framework_short = 'US_FINRA_2210';

-- ============================================================================
-- 6. RERA / Trakheesi — only UAE real-estate
-- ============================================================================
UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(dubai|uae|abu dhabi|sharjah|listing|property|real estate)',
    sector_relevance = ARRAY['real-estate'],
    fine_low_gbp = 5000, fine_high_gbp = 50000,
    layman_explanation = 'Every Dubai property advert must show a Trakheesi permit number. Listings without it are taken down automatically.',
    tamazia_fix_short = 'Tamazia adds the Trakheesi permit number to every listing template and binds it to the RERA broker registration.'
WHERE framework_short = 'UAE_RERA';

-- ============================================================================
-- 7. ADA Title III — US-facing only
-- ============================================================================
UPDATE compliance_rules
SET rule_type = 'trigger_then_check',
    trigger_pattern = '(us customers|usa|united states|california|new york|texas|us residents)',
    sector_relevance = NULL,
    fine_low_gbp = 5000, fine_high_gbp = 75000,
    layman_explanation = 'US visitors with disabilities can sue you for an inaccessible website. A published accessibility statement and WCAG 2.1 AA conformance shows good faith.',
    tamazia_fix_short = 'Tamazia ships the WCAG 2.1 AA accessibility statement and the conformance test report.'
WHERE framework_short = 'US_ADA';

-- ============================================================================
-- 8. Sector-gate the ASA / CAP rules — apply to consumer-facing, not B2B SaaS
-- ============================================================================
UPDATE compliance_rules
SET sector_relevance = ARRAY['hospitality','food','ecommerce','retail','healthcare','marketing','media','wellness','automotive','pharma','dental','education','real-estate']
WHERE framework_short = 'UK_ASA_CAP';

-- ============================================================================
-- 9. Food Information Regulations — food sector only
-- ============================================================================
UPDATE compliance_rules
SET sector_relevance = ARRAY['food','hospitality','ecommerce']
WHERE framework_short = 'UK_FOOD_INFO_2014';

-- ============================================================================
-- 10. Add fine + layman + tamazia_fix_short for the BIG rules (top 50)
-- ============================================================================
UPDATE compliance_rules SET fine_low_gbp=17500000, fine_high_gbp=20000000,
  layman_explanation='UK GDPR Article 13 requires you to tell visitors who you are, what you collect, why, and how long you keep it. Without these disclosures the ICO can fine up to £17.5M or 4% of global turnover.',
  tamazia_fix_short='Tamazia drafts the full Article 13 transparency notice with controller details, lawful basis, retention period and subject rights.'
WHERE framework_short='UK_GDPR_A13' AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=500000, fine_high_gbp=17500000,
  layman_explanation='Sending marketing emails or setting tracking cookies without proper consent is a PECR breach. The ICO has issued fines up to £17.5M and warned the largest UK firms in 2024.',
  tamazia_fix_short='Tamazia rebuilds the consent flow with a one-click reject, a category-level preference centre and an opt-out audit log.'
WHERE framework_short IN ('UK_PECR','UK_ICO_COOKIES') AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=10000, fine_high_gbp=500000,
  layman_explanation='SRA Transparency Rules require law firms to publish prices, complaints procedures, and regulatory disclosures. Breach leads to SRA fines and ICO action together.',
  tamazia_fix_short='Tamazia drafts the SRA-compliant price-and-service page and adds the regulatory badge to the footer.'
WHERE framework_short='UK_SRA_COC' AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=250000, fine_high_gbp=5000000,
  layman_explanation='FCA CONC 2.5 requires consumer-credit promotions to be balanced and risk-warnings to be prominent. Missing this is a near-automatic Section 165 information request.',
  tamazia_fix_short='Tamazia rewrites every consumer-credit promotion to lead with the risk warning and the representative APR.'
WHERE framework_short IN ('UK_FCA_CONC25','UK_FCA_MAR','UK_FOS_FSCS','UK_PRA','UK_PSR') AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=20000, fine_high_gbp=500000,
  layman_explanation='CQC and MHRA both regulate how healthcare providers advertise. Cosmetic medicines (botox, GLP-1, Wegovy) on consumer pages have been actioned more than 25 times in 2024-2025.',
  tamazia_fix_short='Tamazia removes prohibited medicine references, adds the CQC registration line and aligns claims to ASA Section 12.'
WHERE framework_short IN ('UK_CQC','UK_MHRA','UK_GPHC','UK_ABPI','UK_GDC') AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=2000, fine_high_gbp=300000,
  layman_explanation='CMA Digital Markets, Competition and Consumers Act 2024 requires you to show total prices without drip-pricing. The CMA has powers to fine 10% of global turnover.',
  tamazia_fix_short='Tamazia redesigns the pricing flow to show total price upfront and removes drip-pricing patterns.'
WHERE framework_short IN ('UK_CMA','UK_TRADING_STANDARDS') AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=5000, fine_high_gbp=150000,
  layman_explanation='Charity Commission requires registered charity number on every page and trustee disclosures. Missing them triggers a public register notice.',
  tamazia_fix_short='Tamazia adds the registered charity number to the footer template and publishes the trustee and annual-report pages.'
WHERE framework_short IN ('UK_CHARITY_COMMISSION','UK_FUNDRAISING_REG','UK_HMRC_GIFTAID') AND fine_low_gbp IS NULL;

UPDATE compliance_rules SET fine_low_gbp=10000, fine_high_gbp=500000,
  layman_explanation='RICS regulates surveyors and estate agents. Tenant Fees Act 2019 and material-information rules require fee transparency. Breach leads to RICS regulatory action.',
  tamazia_fix_short='Tamazia rewrites the listing templates to include the material information and the client-money protection notice.'
WHERE framework_short IN ('UK_RICS','UK_ARLA','UK_TPO') AND fine_low_gbp IS NULL;

-- Universal fallback for any rule without numbers
UPDATE compliance_rules SET fine_low_gbp=2500, fine_high_gbp=250000,
  layman_explanation='This sector law applies to your site; missing the disclosure triggers regulator review and remediation cost.',
  tamazia_fix_short='Tamazia drafts the missing disclosure in week 1 of the engagement and publishes it within seven days.'
WHERE fine_low_gbp IS NULL;

COMMIT;

-- Sanity
SELECT framework_short, COUNT(*) FILTER (WHERE rule_type='trigger_then_check') AS trigger_rules, COUNT(*) AS total
FROM compliance_rules
WHERE active=TRUE GROUP BY framework_short HAVING COUNT(*) FILTER (WHERE rule_type='trigger_then_check') > 0
ORDER BY 1;
