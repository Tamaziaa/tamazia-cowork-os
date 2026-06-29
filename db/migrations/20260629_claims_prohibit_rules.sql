-- Phase 3b — claims/prohibit rules: detect prohibited marketing overclaims QUOTED from the firm's own pages (the
-- testimonial guard in corpus-index.js ensures a customer review is never mis-attributed as the firm's claim). One
-- rule per jurisdiction's advertising regulator, sector-gated to the medical/aesthetic sectors where outcome
-- guarantees and unsubstantiated efficacy claims are the classic breach. ADDITIVE (new rule rows; rule_type=prohibit).
-- The shared overclaim pattern: 100% safe/success, guaranteed results/cure, no-risk/risk-free, miracle/permanent cure,
-- completely safe, Harvard-approved. Deliberately narrow so an innocent "satisfaction guarantee" does not trip it.
INSERT INTO compliance_rules
  (framework_short, rule_id, rule_type, regex_pattern, severity, description, citation_url, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('UK_ASA_CAP', 'ASA_HEALTH_OVERCLAIM', 'prohibit',
 '(100\s*%?\s*(safe|success|guaranteed)|guaranteed\s+(results?|outcomes?|cure|success|recovery)|\bno[\s-]?risk\b|\brisk[\s-]?free\b|miracle\s+(cure|treatment|results?)|permanent(ly)?\s+(cured?|results?)|completely\s+safe|totally\s+safe|harvard[\s-]?approved)',
 'P1', 'Prohibited advertising overclaim (guaranteed/100%-safe/miracle/risk-free) on a health or aesthetic service',
 'https://www.asa.org.uk/codes-and-rulings/advertising-codes.html',
 ARRAY['aesthetic','aesthetics','dental','healthcare','cosmetic','plastic-surgery','dermatology','medical-aesthetics','clinic','health'],
 0, 0,
 'Your site makes an absolute health claim (for example a guaranteed result, 100% safe, miracle or risk-free) that the ASA/CAP Code prohibits because outcomes and safety cannot be guaranteed and the claim is not substantiated.',
 'Tamazia rewrites the claim to a substantiated, qualified statement (typical results, named evidence) that meets the CAP Code, and removes absolute guarantees of outcome or safety.',
 TRUE),
('UAE_DHA', 'DHA_HEALTH_OVERCLAIM', 'prohibit',
 '(100\s*%?\s*(safe|success|guaranteed)|guaranteed\s+(results?|outcomes?|cure|success|recovery)|\bno[\s-]?risk\b|\brisk[\s-]?free\b|miracle\s+(cure|treatment|results?)|permanent(ly)?\s+(cured?|results?)|completely\s+safe|totally\s+safe|harvard[\s-]?approved)',
 'P1', 'Prohibited health-advertising overclaim under the UAE health-advertising rules (DHA/MOHAP)',
 'https://www.dha.gov.ae/',
 ARRAY['aesthetic','aesthetics','dental','healthcare','cosmetic','plastic-surgery','dermatology','medical-aesthetics','clinic','health'],
 0, 0,
 'UAE health-advertising rules (DHA/MOHAP) prohibit guaranteed-outcome, 100%-safe, miracle and risk-free claims for medical services; such claims also require prior advertising-permit approval.',
 'Tamazia removes the prohibited absolute claims and rewrites medical marketing to the DHA/MOHAP-permitted, substantiated standard with the advertising-permit reference displayed.',
 TRUE),
('US_FTC', 'FTC_HEALTH_OVERCLAIM', 'prohibit',
 '(100\s*%?\s*(safe|success|guaranteed)|guaranteed\s+(results?|outcomes?|cure|success|recovery)|\bno[\s-]?risk\b|\brisk[\s-]?free\b|miracle\s+(cure|treatment|results?)|permanent(ly)?\s+(cured?|results?)|completely\s+safe|totally\s+safe|harvard[\s-]?approved)',
 'P1', 'Deceptive/unsubstantiated health-efficacy claim under FTC Act Section 5',
 'https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance',
 ARRAY['aesthetic','aesthetics','dental','healthcare','cosmetic','plastic-surgery','dermatology','medical-aesthetics','clinic','health'],
 0, 0,
 'The FTC treats absolute health-efficacy or safety claims (guaranteed results, 100% safe, miracle, risk-free) as deceptive unless backed by competent and reliable scientific evidence.',
 'Tamazia rewrites efficacy and safety claims to be truthful and substantiated, with required qualifications, meeting the FTC health-claims standard.',
 TRUE)
ON CONFLICT (framework_short, rule_id) DO NOTHING;
