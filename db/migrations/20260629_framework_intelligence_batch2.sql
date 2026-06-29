-- Phase 4.1 follow-up, additional curated framework-intelligence rows for golden-set coverage gaps
-- (DIFC data protection, FOS/FSCS disclosure, FCA high-risk-investment promotions, UAE ICT/health-data law).
-- ADDITIVE; same table as 20260629_framework_intelligence.sql. recent_enforcement filled by the verified pass.
INSERT INTO framework_intelligence (framework_short, key_obligations, regulator_focus, recent_guidance, reviewed_at) VALUES

('DIFC_DPL',
'Publish a privacy notice with the controller''s identity, processing purposes and lawful basis.
Honour data-subject rights of access, rectification, erasure and objection.
Appoint a DPO and register processing operations with the Commissioner where required.
Ensure adequacy or appropriate safeguards for cross-border personal-data transfers.
Notify the DIFC Commissioner of Data Protection of qualifying personal-data breaches.',
'The DIFC Commissioner of Data Protection enforces the DIFC Data Protection Law 2020 (GDPR-aligned), focusing on accountability, transfers and breach notification.',
'The DIFC has updated its Data Protection Regulations, including provisions on transfers, high-risk processing and the use of personal data in AI systems.',
'2026-06-29'),

('UK_FOS_FSCS',
'Signpost the Financial Ombudsman Service, with its contact details, in complaints communications.
Disclose Financial Services Compensation Scheme protection and its limits where the product is eligible.
Operate and publish a clear complaints-handling procedure.
State the firm''s FCA-regulated status and reference number.
Avoid implying protection or redress that does not apply to the product.',
'The FCA expects clear, accurate FOS signposting and FSCS disclosure in retail communications, and acts where firms misstate protection.',
'The FSCS deposit-protection limit is GBP 85,000 per eligible person per firm, with the FCA keeping the limit under periodic review.',
'2026-06-29'),

('UK_FCA_HRI_PROMO',
'Apply the high-risk investment classification and the required risk warnings to promotions.
Use the prescribed risk-warning wording and personalised risk warnings for restricted-mass-market investments.
Apply a positive-frictions journey, including cooling-off and appropriateness assessments.
Do not offer incentives to invest in high-risk investments.
Ensure promotions are approved by an authorised person with the relevant approver permission.',
'The FCA closely supervises high-risk-investment and cryptoasset promotions, requiring prominent risk warnings and frictions before consumers can proceed.',
'The FCA''s high-risk-investment marketing rules and the cryptoasset financial-promotions regime (from October 2023) require standardised risk warnings and a 24-hour cooling-off for first-time investors.',
'2026-06-29'),

('UAE_HEALTH_DATA_LAW',
'Store and process patient health data inside the UAE unless a specific exemption applies (data localisation).
Obtain consent before processing personal health information.
Keep health data confidential and secured against unauthorised access.
Do not transfer health data outside the UAE without the competent health authority''s approval.
Retain electronic health records for the statutory period and ensure their integrity.',
'MOHAP and the emirate health authorities enforce health-data localisation, patient confidentiality and restrictions on cross-border transfer of health information.',
'UAE Cabinet resolutions have eased cross-border health-data restrictions for specified approved entities, but in-country storage remains the default rule.',
'2026-06-29'),

('UAE_ICT_HEALTH_LAW',
'Store and process patient health data inside the UAE unless a specific exemption applies (data localisation).
Obtain consent before processing personal health information.
Keep health data confidential and secured against unauthorised access.
Do not transfer health data outside the UAE without the competent health authority''s approval.
Retain electronic health records for the statutory period and ensure their integrity.',
'MOHAP and the emirate health authorities enforce health-data localisation, patient confidentiality and restrictions on cross-border transfer of health information.',
'UAE Cabinet resolutions have eased cross-border health-data restrictions for specified approved entities, but in-country storage remains the default rule.',
'2026-06-29')

ON CONFLICT (framework_short) DO UPDATE SET
  key_obligations = EXCLUDED.key_obligations,
  regulator_focus = EXCLUDED.regulator_focus,
  recent_guidance = EXCLUDED.recent_guidance,
  reviewed_at     = EXCLUDED.reviewed_at,
  updated_at      = now();
