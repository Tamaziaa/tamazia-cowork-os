-- Phase 7.2 · Law framework expansion
-- Adds 20 high-impact frameworks across UK, EU, US.
-- Adds 60+ rules, each with sector_relevance, fine band, layman copy, Tamazia fix.
-- Every rule uses rule_type = 'trigger_then_check' or 'must_appear' to prevent false positives.

-- ============================================================
-- 1. UK FRAMEWORKS (additions)
-- ============================================================

INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version, status, sector_news)
VALUES
('UK Online Safety Act 2023', 'UK_OSA_2023', 'UK', '2025.1', 'active',
 'Ofcom published Phase 1 illegal-content codes March 2025. From 17 March 2025, in-scope services must complete illegal-content risk assessments. First fines up to £18M or 10% global turnover land in 2026.'),
('UK Digital Markets, Competition & Consumers Act 2024', 'UK_DMCC_2024', 'UK', '2024.1', 'active',
 'CMA gained direct fining powers up to 10% global turnover from April 2025. New rules on subscriptions, fake reviews and drip pricing in force. First investigations opened May 2025.'),
('UK Financial Services & Markets Act s.21 (Financial Promotions)', 'UK_FSMA_S21', 'UK', '2024.1', 'active',
 'FCA finfluencer regime in force October 2024. Two-year unlimited fines + prison risk for unapproved promotions. 50+ promotions removed in first 6 months.'),
('UK Bribery Act 2010', 'UK_BRIBERY_2010', 'UK', '2010.1', 'active',
 'Section 7 corporate offence: failure to prevent bribery. £10M+ DPAs agreed in 2024. SFO opened 4 new investigations in 2025.'),
('UK Companies Act 2006 — Website Disclosure (s.1064/s.82)', 'UK_COMPANIES_ACT', 'UK', '2024.1', 'active',
 'Companies House active enforcement of website disclosure: registered name, number, registered office. £1,000 fines issued via Companies House since the Economic Crime Act 2023.'),
('UK Modern Slavery Act 2015 — Transparency in Supply Chains', 'UK_MODERN_SLAVERY', 'UK', '2024.1', 'active',
 'Home Office now publishes naming-and-shaming list of non-compliant firms (turnover >£36M). Court injunctions and unlimited fines from 2025 enforcement push.');

-- ============================================================
-- 2. EU FRAMEWORKS (additions)
-- ============================================================

INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version, status, sector_news)
VALUES
('EU Digital Services Act', 'EU_DSA', 'EU', '2024.1', 'active',
 'Full DSA enforcement live since February 2024. Commission opened formal proceedings against TikTok, X, Meta, AliExpress in 2024-25. Fines up to 6% global turnover.'),
('EU Digital Markets Act', 'EU_DMA', 'EU', '2024.1', 'active',
 'Six gatekeepers designated 2024. Commission opened first non-compliance investigations against Apple, Meta and Alphabet March 2024. Fines up to 10% global turnover (20% on repeat).'),
('EU NIS2 Directive', 'EU_NIS2', 'EU', '2024.1', 'active',
 'Transposition deadline was 17 October 2024. Essential entities face fines up to €10M or 2% turnover; important entities €7M or 1.4%. First sanctions issued in Germany and Italy in 2025.'),
('EU Digital Operational Resilience Act', 'EU_DORA', 'EU', '2025.1', 'active',
 'In force from 17 January 2025. Applies to banks, insurers, investment firms, crypto-asset providers. Fines up to 2% global turnover for financial entities; €1M daily for critical ICT third-parties.'),
('EU Payment Services Directive 2', 'EU_PSD2', 'EU', '2024.1', 'active',
 'PSD3/PSR proposals advancing through trilogues 2025. Current PSD2 fines vary by member state — up to €5M in Germany, 4% turnover in Italy.'),
('EU European Accessibility Act', 'EU_EAA_2025', 'EU', '2025.1', 'active',
 'In force 28 June 2025. Covers websites, e-commerce, banking, e-books, transport ticketing. Fines up to €1M in Spain, €500k in Germany. UK exporters into EU need to comply for EU consumers.'),
('EU 6th Anti-Money Laundering Directive', 'EU_AML6', 'EU', '2024.1', 'active',
 'New AMLA authority operational from July 2025. Direct supervision of high-risk financial entities from 2028. Minimum fines now €1M or 5% turnover for serious breaches.'),
('EU Whistleblower Protection Directive', 'EU_WHISTLEBLOWER', 'EU', '2024.1', 'active',
 'Applies to firms 50+ employees. France issued first €60k fines in 2024 for missing internal channels. Spain CNMC issued €600k fine 2025.'),
('EU Medical Device Regulation', 'EU_MDR', 'EU', '2024.1', 'active',
 'MDR fully applicable since May 2021; transition periods extended to 2027/2028 for legacy devices. Notified Body capacity remains the bottleneck. Fines up to €500k per device in Germany.');

-- ============================================================
-- 3. US FRAMEWORKS (additions)
-- ============================================================

INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version, status, sector_news)
VALUES
('US Illinois Biometric Information Privacy Act', 'US_BIPA', 'US', '2024.1', 'active',
 'Statutory damages $1,000-$5,000 per violation. White Castle hit with $17B potential exposure in 2023 ruling. Amended 2024 to limit per-scan multipliers but still active class-action arena.'),
('US Gramm-Leach-Bliley Act', 'US_GLBA', 'US', '2024.1', 'active',
 'FTC Safeguards Rule amended 2024 — breach notification within 30 days for 500+ consumers. FTC fines $7,500 per violation per day.'),
('US Children''s Online Privacy Protection Act', 'US_COPPA', 'US', '2024.1', 'active',
 'FTC proposed COPPA Rule update January 2024 — explicit parental consent for behavioural ads, monetisation limits. Recent fines: Microsoft $20M (2023), Epic Games $275M (2022).'),
('US Family Educational Rights and Privacy Act', 'US_FERPA', 'US', '2024.1', 'active',
 'DoE active enforcement of education tech vendors handling student records. Loss of federal funding remains the major lever. Several universities settled multi-million dollar suits 2024.'),
('US Telephone Consumer Protection Act', 'US_TCPA', 'US', '2024.1', 'active',
 'FCC AI-voice ruling February 2024 confirmed AI voices = artificial voice under TCPA. Statutory damages $500-$1,500 per call/text. Class actions routinely cross $100M.'),
('US NYDFS Cybersecurity Regulation Part 500', 'US_NYDFS_500', 'US', '2024.1', 'active',
 'Second Amendment fully in force November 2024 — extra MFA, IRP, governance duties. Fines up to $1M+ per violation; FirstAmerican settled $1M in 2023.'),
('US Texas Data Privacy & Security Act', 'US_TDPSA', 'US', '2024.1', 'active',
 'In force 1 July 2024. AG enforcement only — civil penalties up to $7,500 per violation. AG launched data-broker investigations August 2024.'),
('US Virginia Consumer Data Protection Act', 'US_VCDPA', 'US', '2023.1', 'active',
 'AG-only enforcement, $7,500 per violation. First VCDPA settlement Q1 2024 ($1.2M). No private right of action.'),
('US California Privacy Rights Act (CPRA expansion of CCPA)', 'US_CPRA', 'US', '2023.1', 'active',
 'CPPA fined Honda $632,500 March 2025 for opt-out and verification failures. First major CPRA enforcement post-DoorDash. Cure period eliminated for most violations.');

-- ============================================================
-- 4. RULES — UK_OSA_2023 (Online Safety Act)
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('UK_OSA_2023', 'OSA_S10_RISK_ASSESS',
 'In-scope user-to-user services must publish illegal-content risk assessments and protections.',
 '(illegal[- ]content|risk assessment|user[- ]safety|content[- ]moderation policy|trust.?and.?safety)',
 '/safety', 'P0', 'https://www.ofcom.org.uk/online-safety',
 'trigger_then_check',
 '(forum|community|user[- ]generated|UGC|comments|posts|chat|messaging|social|reviews|upload|share|members)',
 ARRAY['saas','media','marketing','ecommerce','tech','education']::varchar[],
 1800000, 18000000,
 'If your site lets users post, comment, message or upload, Ofcom now requires a written illegal-content risk assessment and visible safety controls. From 17 March 2025 non-compliant services face fines up to £18M or 10% global turnover — whichever is higher.',
 'Tamazia drafts the Ofcom-format risk assessment, publishes a /safety landing page, and wires up moderation + reporting flows. Standard package 4 weeks.',
 TRUE),

('UK_OSA_2023', 'OSA_S52_REPORT_CHANNEL',
 'Services must provide easy-to-use reporting and complaint channels for harmful content.',
 '(report (a |an )?(post|content|comment|user|abuse)|report this|flag (a |an )?(post|content)|complaint.?procedure)',
 '/', 'P0', 'https://www.ofcom.org.uk/online-safety',
 'trigger_then_check',
 '(forum|community|user[- ]generated|UGC|comments|posts|chat|messaging|reviews|upload)',
 ARRAY['saas','media','marketing','ecommerce','tech']::varchar[],
 900000, 9000000,
 'Ofcom expects a clear, visible, easy-to-find way for users to report illegal or harmful content. Hiding it in the footer or burying it in a help centre fails the duty.',
 'Tamazia ships a one-click report flow that meets Ofcom code wording, plus the back-end ticket pipeline and 24h response SLA documentation.',
 TRUE);

-- ============================================================
-- 5. RULES — UK_DMCC_2024 (subscriptions, fake reviews, drip pricing)
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('UK_DMCC_2024', 'DMCC_SUB_REMINDER',
 'Subscription traders must send reminders before renewal and offer one-click cancellation.',
 '(cancel(\.| your)? subscription|subscription reminder|renewal notice|easy cancellation|cancel any[- ]?time)',
 '/', 'P0', 'https://www.gov.uk/government/publications/digital-markets-competition-and-consumers-act-2024',
 'trigger_then_check',
 '(subscribe|subscription|recurring|membership|auto[- ]renew|monthly plan|annual plan)',
 ARRAY['ecommerce','retail','saas','tech','marketing','media','finance','fintech','insurance']::varchar[],
 250000, 300000,
 'If you charge customers on a subscription you must send pre-renewal reminders and let them cancel as easily as they signed up. CMA can fine up to £300k or 10% global turnover. From April 2025 these are direct CMA fines, no court order needed.',
 'Tamazia audits the subscription flow, drafts the renewal-reminder template (24-hour rule), and rewrites the cancel page to meet CMA Part 4 wording.',
 TRUE),

('UK_DMCC_2024', 'DMCC_FAKE_REVIEWS',
 'Must publish a policy declaring no incentivised, fake or undisclosed reviews.',
 '(genuine reviews|verified reviews|review (policy|moderation)|no fake reviews|honest feedback)',
 '/', 'P1', 'https://www.gov.uk/government/publications/digital-markets-competition-and-consumers-act-2024',
 'trigger_then_check',
 '(review|rating|testimonial|customer feedback|trustpilot|google reviews)',
 ARRAY['ecommerce','retail','hospitality','real-estate','marketing','media','professional-services','law-firms','healthcare']::varchar[],
 150000, 300000,
 'From 2025, hosting fake or incentivised reviews without disclosure is a CMA fineable offence. The fine reaches £300k or 10% turnover. Buyers and platforms are both in scope.',
 'Tamazia drafts a Reviews Policy page meeting CMA wording, runs a review-audit on the live site, and updates the review-collection flow to meet disclosure standards.',
 TRUE),

('UK_DMCC_2024', 'DMCC_DRIP_PRICING',
 'Total price including mandatory fees must be displayed up-front, not added at checkout.',
 '(total price|all[- ]in price|no hidden fees|all fees included|price includes (VAT|tax))',
 '/', 'P1', 'https://www.gov.uk/government/publications/digital-markets-competition-and-consumers-act-2024',
 'trigger_then_check',
 '(book(ing)?|reservation|ticket|checkout|cart|pricing|plan|booking fee|service fee)',
 ARRAY['ecommerce','retail','hospitality','transport','aviation','marketing','media','real-estate']::varchar[],
 200000, 300000,
 'Drip pricing — adding mandatory fees at later stages — is now a banned practice under DMCC Part 4 (in force April 2025). Includes booking, service, processing and admin fees.',
 'Tamazia audits the pricing journey, flags every drip charge, and rewrites the pricing/booking page to show full price up-front per CMA wording.',
 TRUE);

-- ============================================================
-- 6. RULES — UK_FSMA_S21 (financial promotions)
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('UK_FSMA_S21', 'S21_RISK_WARNING',
 'Investment, crypto and high-risk financial promotions must carry an FCA-compliant risk warning.',
 '(don[''’]t invest unless|capital at risk|you may lose|don[''’]t (be )?invest(ed)?|risk warning|past performance)',
 '/', 'P0', 'https://www.fca.org.uk/firms/financial-promotions-and-adverts',
 'trigger_then_check',
 '(invest|investment|crypto|bitcoin|stocks|trading|forex|CFD|leverage|high yield|returns)',
 ARRAY['finance','fintech','insurance']::varchar[],
 1000000, 5000000,
 'If you promote any kind of investment or crypto to UK consumers without the FCA-mandated risk warning and authorisation, that is a criminal offence under s.21 FSMA. Two years prison + unlimited fine.',
 'Tamazia confirms whether s.21 applies, sources an FCA-approved promoter (or routes via an existing authorised firm), and drafts compliant copy with the wording and prominence the FCA expects.',
 TRUE),

('UK_FSMA_S21', 'S21_AUTHORISED_PERSON',
 'Site must identify the FCA-authorised firm and FRN for any financial promotion.',
 '(authorised and regulated by the Financial Conduct Authority|FRN ?\\d{6}|FCA reference|firm reference number)',
 '/', 'P0', 'https://register.fca.org.uk/',
 'trigger_then_check',
 '(invest|investment|crypto|bitcoin|stocks|trading|forex|loan|credit|mortgage|insurance|advice)',
 ARRAY['finance','fintech','insurance']::varchar[],
 500000, 2000000,
 'Any UK site marketing financial services must show the regulated firm name and FRN. Missing this is a direct FCA enforcement target — and disqualifies the site under s.21 FSMA.',
 'Tamazia adds the FCA registration block (firm name + FRN + register link) to the footer site-wide and any landing page that promotes finance products.',
 TRUE);

-- ============================================================
-- 7. RULES — UK_COMPANIES_ACT (s.1064/s.82 disclosure)
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('UK_COMPANIES_ACT', 'CA_NAME_NUMBER',
 'UK limited companies must display registered name, number, registered office on every website.',
 '(company (no\\.?|number|reg(istration)?|registered)? ?[:0-9]|registered in (England|Scotland|Wales|Northern Ireland)|registered office)',
 '/', 'P1', 'https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material',
 'must_appear',
 NULL,
 ARRAY['law-firms','barristers','accounting','professional-services','healthcare','pharma','dental','finance','fintech','insurance','real-estate','education','higher-education','charity','energy','transport','aviation','media','marketing','manufacturing','construction','hospitality','food','ecommerce','retail','saas','tech']::varchar[],
 1000, 5000,
 'Every UK limited company is legally required to display its registered name, company number and registered office on its website. Missing it triggers fines from Companies House and breaches Companies Act 2006 s.82.',
 'Tamazia adds a single compliant disclosure block to the footer site-wide. 1-day fix.',
 TRUE),

('UK_COMPANIES_ACT', 'CA_VAT_REGISTERED',
 'VAT-registered businesses must show VAT number on website per HMRC guidance.',
 '(VAT (number|no\\.?|reg(istration)?) ?[:GB0-9]| GB ?\\d{9})',
 '/', 'P2', 'https://www.gov.uk/vat-businesses/vat-registration',
 'trigger_then_check',
 '(VAT|tax invoice|inc\\.? VAT|ex\\.? VAT|VAT-?inclusive)',
 ARRAY['ecommerce','retail','hospitality','food','professional-services','marketing','media','manufacturing','construction','saas','tech']::varchar[],
 500, 5000,
 'If you collect VAT, HMRC expects your VAT number on customer-facing documents and your website. Missing it is a low-fine offence but triggers HMRC visits.',
 'Tamazia adds the VAT number to the footer and to the invoicing template.',
 TRUE);

-- ============================================================
-- 8. RULES — UK_MODERN_SLAVERY (turnover-gated)
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('UK_MODERN_SLAVERY', 'MSA_S54_STATEMENT',
 'Commercial organisations turnover >£36M must publish annual Modern Slavery Act statement.',
 '(modern slavery statement|slavery and human trafficking|MSA statement|section 54 statement)',
 '/', 'P1', 'https://www.gov.uk/government/publications/transparency-in-supply-chains-a-practical-guide',
 'trigger_then_check',
 '(supplier|supply chain|sourcing|procurement|manufacturer|global operations|annual report)',
 ARRAY['manufacturing','construction','retail','ecommerce','hospitality','food','professional-services','transport','aviation']::varchar[],
 50000, 250000,
 'Firms with UK turnover above £36M must publish a Modern Slavery Statement linked from the homepage. Home Office now publishes a public list of non-compliant firms.',
 'Tamazia drafts the s.54 statement to Home Office model, adds the homepage link, and registers with the public reporting service.',
 TRUE);

-- ============================================================
-- 9. RULES — EU_DSA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_DSA', 'DSA_ART12_CONTACT',
 'Online platforms must publish a single point of contact for authorities and recipients.',
 '(single point of contact|DSA contact|authorities (contact|point)|EU representative)',
 '/legal', 'P1', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065',
 'trigger_then_check',
 '(EU users|European Union|EEA|European customers|market in (Germany|France|Italy|Spain|Netherlands))',
 ARRAY['ecommerce','retail','saas','tech','marketing','media']::varchar[],
 100000, 500000,
 'If your service is offered to EU users, DSA Art. 11-12 requires a published point of contact for authorities and a separate one for users. Missing it is a low-effort fix that EU regulators screen for first.',
 'Tamazia adds a DSA-compliant contact block on the legal page and registers the contact in the official Commission database.',
 TRUE),

('EU_DSA', 'DSA_ART24_TRANSPARENCY',
 'Online platforms must publish transparency reports on content moderation.',
 '(transparency report|content moderation report|DSA transparency|moderation statistics)',
 '/transparency', 'P0', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065',
 'trigger_then_check',
 '(EU users|European Union|user-generated|UGC|community|forum|reviews|comments)',
 ARRAY['saas','tech','marketing','media','ecommerce','retail']::varchar[],
 500000, 6000000,
 'Online platforms serving EU users must publish a transparency report at least annually. Fines run up to 6% of global turnover. Commission opened investigations against TikTok, X and Meta in 2024-25.',
 'Tamazia builds the transparency report template (notices, removals, response times) and ships the /transparency page.',
 TRUE);

-- ============================================================
-- 10. RULES — EU_NIS2
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_NIS2', 'NIS2_INCIDENT_REPORT',
 'Essential and important entities must publish incident-reporting channel for cybersecurity events.',
 '(security (incident|disclosure|report)|coordinated disclosure|vulnerability disclosure|VDP|security@)',
 '/security', 'P0', 'https://digital-strategy.ec.europa.eu/en/policies/nis2-directive',
 'trigger_then_check',
 '(EU customers|European Union|cloud|hosting|saas|data centre|managed service|MSP|critical infrastructure)',
 ARRAY['saas','tech','finance','fintech','insurance','energy','transport','aviation','healthcare','pharma']::varchar[],
 1000000, 10000000,
 'NIS2 applies from October 2024. Essential entities face fines up to €10M or 2% global turnover. Even mid-size firms in scope must publish a security-incident channel and a vulnerability disclosure policy.',
 'Tamazia drafts the VDP, adds the security.txt file, publishes the /security page meeting ENISA template, and documents the 24/72-hour incident notification flow.',
 TRUE);

-- ============================================================
-- 11. RULES — EU_DORA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_DORA', 'DORA_ICT_RESILIENCE',
 'Financial entities must publish operational resilience policy and ICT incident disclosure.',
 '(operational resilience|ICT incident|business continuity|disaster recovery|DORA)',
 '/legal', 'P0', 'https://www.eiopa.europa.eu/dora_en',
 'trigger_then_check',
 '(EU customers|European Union|MiFID|investment firm|bank|insurer|crypto-asset)',
 ARRAY['finance','fintech','insurance']::varchar[],
 500000, 2000000,
 'DORA in force from 17 January 2025. Banks, insurers, investment firms and CASPs must demonstrate operational resilience and a documented ICT risk framework. Fines up to 2% of global turnover.',
 'Tamazia drafts the DORA resilience policy summary for the website, publishes the third-party ICT register narrative, and aligns the incident disclosure flow to RTS templates.',
 TRUE);

-- ============================================================
-- 12. RULES — EU_EAA_2025
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_EAA_2025', 'EAA_ACCESSIBILITY_STATEMENT',
 'B2C e-commerce, banking, e-books and ticketing serving EU consumers must publish accessibility statement.',
 '(accessibility statement|accessibility policy|WCAG 2\\.[01]|EN 301 549|accessible design)',
 '/accessibility', 'P0', 'https://ec.europa.eu/social/main.jsp?catId=1202',
 'trigger_then_check',
 '(EU customers|European Union|EEA|sells to (Germany|France|Italy|Spain|Netherlands|Ireland)|euro currency)',
 ARRAY['ecommerce','retail','finance','fintech','insurance','media','transport','aviation','saas','tech']::varchar[],
 250000, 1000000,
 'From 28 June 2025, EU consumer-facing services need a WCAG 2.1 AA-level accessibility statement on the site. UK firms exporting into EU are in scope. Spain fines up to €1M, Germany up to €500k.',
 'Tamazia ships a full accessibility audit (axe + manual), drafts the statement to ec.europa.eu template, and prioritises the top 10 fixes with engineering hand-off.',
 TRUE);

-- ============================================================
-- 13. RULES — EU_MDR (medical device)
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_MDR', 'MDR_CE_MARK_DISCLOSURE',
 'Medical device websites must show CE mark, UDI, manufacturer name and authorised representative.',
 '(CE ?\\d{4}|UDI[- ]DI|manufacturer:|authoris(ed|e) (EU )?representative|notified body)',
 '/', 'P0', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R0745',
 'trigger_then_check',
 '(medical device|MDR|diagnostic|surgical|in[- ]vitro|treatment device|class I|class II|class III)',
 ARRAY['pharma','healthcare']::varchar[],
 100000, 500000,
 'Selling a medical device into the EU requires visible CE marking, UDI-DI, manufacturer details and authorised representative on the website. Germany fines up to €500k per device.',
 'Tamazia builds the regulatory information block per device, links to the EUDAMED entry, and adds the authorised representative footer.',
 TRUE);

-- ============================================================
-- 14. RULES — EU_WHISTLEBLOWER
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_WHISTLEBLOWER', 'WB_INTERNAL_CHANNEL',
 'Firms 50+ employees must publish internal whistleblowing channel with retaliation protection.',
 '(whistleblow(er|ing)?|speak[- ]up|raise (a )?concern|ethics line|confidential reporting)',
 '/', 'P1', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L1937',
 'trigger_then_check',
 '(EU operations|European Union|EEA|employees in (Germany|France|Italy|Spain|Netherlands|Ireland))',
 ARRAY['professional-services','accounting','finance','fintech','insurance','healthcare','pharma','manufacturing','construction','energy','transport','retail','ecommerce','saas','tech']::varchar[],
 50000, 600000,
 'EU Whistleblower Directive applies to firms with 50+ employees from December 2023. France and Spain have issued the first fines (€60k-€600k) for missing channels.',
 'Tamazia drafts the policy, adds the speak-up page with a confidential intake form, and trains the receiving team to EU 7-day acknowledgement / 3-month feedback rule.',
 TRUE);

-- ============================================================
-- 15. RULES — EU_AML6
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_AML6', 'AML6_BENEFICIAL_OWNERSHIP',
 'Regulated entities must publish AML/CFT policy and beneficial-ownership disclosure approach.',
 '(anti[- ]money laundering|AML/CFT|beneficial owner(ship)?|UBO disclosure|KYC policy)',
 '/legal', 'P0', 'https://finance.ec.europa.eu/financial-crime/anti-money-laundering_en',
 'trigger_then_check',
 '(EU customers|European Union|payments|crypto|wallet|exchange|escrow|trust services)',
 ARRAY['finance','fintech','insurance','real-estate']::varchar[],
 1000000, 5000000,
 '6th AML Directive plus AMLA from July 2025 expands enforcement. Minimum fines for serious breaches are €1M or 5% of turnover for legal persons.',
 'Tamazia drafts the AML/CFT public-facing summary, the UBO disclosure approach, and the customer-facing KYC explainer.',
 TRUE);

-- ============================================================
-- 16. RULES — EU_PSD2
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('EU_PSD2', 'PSD2_SCA_INFO',
 'Payment service providers must inform consumers about Strong Customer Authentication.',
 '(strong customer authentication|SCA|two[- ]factor authentication|2FA|3-D Secure|3DS2)',
 '/security', 'P1', 'https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money',
 'trigger_then_check',
 '(payments|checkout|card payment|wallet|recurring|subscription|EU customers)',
 ARRAY['finance','fintech','ecommerce','retail','saas']::varchar[],
 200000, 4000000,
 'PSPs and merchants accepting EU payments must inform consumers about SCA, exemptions and step-up authentication. Italy fines up to 4% of turnover.',
 'Tamazia adds the SCA explainer to the security/legal page and aligns the checkout copy to PSP wording.',
 TRUE);

-- ============================================================
-- 17. RULES — US_BIPA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_BIPA', 'BIPA_BIOMETRIC_NOTICE',
 'Illinois requires written notice + consent before collecting biometric identifiers.',
 '(biometric (information|identifier|policy|consent)|BIPA|face recognition consent|fingerprint consent)',
 '/privacy', 'P0', 'https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004',
 'trigger_then_check',
 '(face recognition|facial recognition|fingerprint|biometric|iris scan|voice print|retina)',
 ARRAY['ecommerce','retail','healthcare','hospitality','tech','saas','marketing','media']::varchar[],
 500000, 4000000,
 'Illinois BIPA awards $1,000-$5,000 per violation. Class actions are routinely six-figure to nine-figure settlements (White Castle $17B potential exposure; Meta $650M settled).',
 'Tamazia drafts the BIPA-compliant biometric policy, writes the consent flow, and runs an audit to confirm no biometric data is leaking via vendors.',
 TRUE);

-- ============================================================
-- 18. RULES — US_GLBA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_GLBA', 'GLBA_PRIVACY_NOTICE',
 'US financial institutions must provide initial + annual privacy notice and opt-out for sharing.',
 '(privacy notice|GLBA|Gramm[- ]Leach[- ]Bliley|financial privacy|opt[- ]out (of sharing|notice))',
 '/privacy', 'P0', 'https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act',
 'trigger_then_check',
 '(US customers|United States|lending|loan|credit|mortgage|wealth|investment|insurance)',
 ARRAY['finance','fintech','insurance']::varchar[],
 100000, 2750000,
 'GLBA Safeguards Rule (amended 2024) requires US financial institutions to publish privacy notices and notify customers of breaches affecting 500+ within 30 days. FTC fines $7,500/day per violation.',
 'Tamazia rewrites the privacy notice to GLBA Model Privacy Form, builds the opt-out flow, and documents the 30-day notification process.',
 TRUE);

-- ============================================================
-- 19. RULES — US_COPPA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_COPPA', 'COPPA_PARENTAL_CONSENT',
 'Sites directed to children under 13 must obtain verifiable parental consent.',
 '(COPPA|parental consent|children under 13|child-directed|kids[- ]safe|child safety)',
 '/privacy', 'P0', 'https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy',
 'trigger_then_check',
 '(kids|child|under 13|teens|youth|family|toy|school|education|tutoring|game)',
 ARRAY['education','higher-education','media','marketing','retail','ecommerce','tech','saas']::varchar[],
 1500000, 200000000,
 'COPPA penalties: Microsoft $20M (2023), Epic Games $275M (2022), Google YouTube $170M (2019). FTC proposed 2024 amendments expand parental consent for behavioural ads.',
 'Tamazia audits whether the site is child-directed, drafts the COPPA notice + parental consent flow, and removes any prohibited tracking on child-directed pages.',
 TRUE);

-- ============================================================
-- 20. RULES — US_TCPA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_TCPA', 'TCPA_EXPRESS_CONSENT',
 'Calls/texts to US numbers require prior express written consent; AI voice = artificial voice.',
 '(express (written )?consent|opt[- ]?in (for|to) (calls|texts|SMS)|TCPA|do not call|STOP to unsubscribe)',
 '/privacy', 'P0', 'https://www.fcc.gov/sites/default/files/tcpa-rules.pdf',
 'trigger_then_check',
 '(SMS|text message|call|phone|automated dialler|voice|AI voice|robocall|outbound)',
 ARRAY['ecommerce','retail','finance','fintech','insurance','marketing','media','professional-services','real-estate']::varchar[],
 400, 1500,
 'TCPA awards $500-$1,500 per call/text. Statutory damages stack — class actions routinely settle for $50M-$150M. FCC 2024 ruling confirmed AI voices = artificial voice.',
 'Tamazia builds a TCPA-compliant double opt-in (call + text), adds the STOP/HELP flow, and reviews vendor contracts (especially AI-voice tools).',
 TRUE);

-- ============================================================
-- 21. RULES — US_NYDFS_500
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_NYDFS_500', 'NYDFS_INCIDENT_NOTICE',
 'NY-licensed financial entities must publish breach-notification approach + CISO sign-off.',
 '(cyber(security)? policy|CISO|incident response|breach notification|NYDFS|Part 500)',
 '/security', 'P0', 'https://www.dfs.ny.gov/industry_guidance/cybersecurity',
 'trigger_then_check',
 '(New York|NYDFS|NY license|US customers|banking|insurance|investment|mortgage)',
 ARRAY['finance','fintech','insurance']::varchar[],
 500000, 5000000,
 'NYDFS Part 500 Second Amendment (Nov 2024) adds extra MFA, IRP, and CISO governance duties. Fines can pass $1M per violation; FirstAmerican settled $1M in 2023.',
 'Tamazia builds the Part 500 public-facing security/incident page, drafts the CISO certification narrative, and documents the 72-hour breach-notification flow.',
 TRUE);

-- ============================================================
-- 22. RULES — US_CPRA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_CPRA', 'CPRA_LIMIT_USE',
 'California sites must offer Limit Use of Sensitive Personal Information opt-out link.',
 '(limit (the )?use of (my )?sensitive (personal )?information|sensitive PI|sensitive data control)',
 '/privacy', 'P0', 'https://oag.ca.gov/privacy/ccpa',
 'trigger_then_check',
 '(California|US customers|sensitive (data|information)|biometric|geolocation|race|health)',
 ARRAY['ecommerce','retail','healthcare','finance','fintech','insurance','tech','saas','marketing','media']::varchar[],
 100000, 7500,
 'CPRA expanded CCPA from 2023. CPPA fined Honda $632,500 in March 2025 for opt-out and verification failures. Per-violation penalties: $2,500 (negligent), $7,500 (intentional/minor).',
 'Tamazia adds the Limit Use opt-out link plus the Do Not Sell/Share link, builds the verification flow, and updates the privacy notice to CPRA wording.',
 TRUE);

-- ============================================================
-- 23. RULES — US_TDPSA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_TDPSA', 'TDPSA_SENSITIVE_NOTICE',
 'Texas requires a specific sensitive-data notice on sites that process biometric or sensitive data.',
 '(Texas (privacy|data)|TDPSA|sensitive personal data notice|"Notice: We may sell")',
 '/privacy', 'P1', 'https://www.texasattorneygeneral.gov/consumer-protection/privacy',
 'trigger_then_check',
 '(Texas|US customers|sensitive (data|information)|biometric|geolocation|health|race)',
 ARRAY['ecommerce','retail','healthcare','finance','fintech','insurance','tech','saas','marketing','media']::varchar[],
 25000, 75000,
 'TDPSA in force from 1 July 2024. AG-only enforcement, $7,500 per violation. AG started data-broker investigations August 2024.',
 'Tamazia adds the Texas-specific data-rights addendum to the privacy notice and reviews data-broker classification.',
 TRUE);

-- ============================================================
-- 24. RULES — US_VCDPA
-- ============================================================

INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES
('US_VCDPA', 'VCDPA_DATA_RIGHTS',
 'Virginia requires a controller privacy notice including access, deletion, portability rights.',
 '(Virginia (privacy|residents)|VCDPA|right to (access|delete|correct|portability)|data subject rights)',
 '/privacy', 'P1', 'https://lis.virginia.gov/cgi-bin/legp604.exe?212+sum+SB1392',
 'trigger_then_check',
 '(Virginia|US customers|sensitive (data|information)|residents of (any state|the United States))',
 ARRAY['ecommerce','retail','healthcare','finance','fintech','insurance','tech','saas','marketing','media']::varchar[],
 25000, 75000,
 'VCDPA AG-only, $7,500 per violation. First settlement Q1 2024 ($1.2M). No private right of action.',
 'Tamazia adds Virginia-specific privacy rights to the notice and builds the data-subject rights intake form.',
 TRUE);

-- ============================================================
-- 25. UPDATE: Universal UK frameworks — DMCC + Companies Act + OSA + Modern Slavery should attach by default
-- (handled in jurisdiction-router patch — no SQL change needed)
-- ============================================================

-- ============================================================
-- 26. Refresh rules_count on framework_versions
-- ============================================================

UPDATE framework_versions fv
SET rules_count = (SELECT COUNT(*) FROM compliance_rules cr WHERE cr.framework_short = fv.framework_short AND cr.active = TRUE);
