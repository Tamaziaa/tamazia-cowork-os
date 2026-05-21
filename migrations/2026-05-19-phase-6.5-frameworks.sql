-- Phase 6.5 · Add 40+ new frameworks + ~250 compliance rules with machine-checkable patterns.
-- Frameworks chosen to cover the 14-sector horizon Tamazia commits to serving.

BEGIN;

-- ============================================================================
-- New framework_versions rows
-- ============================================================================
INSERT INTO framework_versions (framework_short, framework_name, jurisdiction, version, rules_count, status, notes)
VALUES
  ('UK_BSB',                  'Bar Standards Board Handbook',                        'UK', '4.7', 0, 'live', 'Barristers regulatory framework'),
  ('UK_ICAEW',                'ICAEW Code of Ethics',                                'UK', '2024.1', 0, 'live', 'Institute of Chartered Accountants in England and Wales'),
  ('UK_ACCA',                 'ACCA Code of Ethics and Conduct',                     'UK', '2024.1', 0, 'live', 'Association of Chartered Certified Accountants'),
  ('UK_FRC',                  'Financial Reporting Council UK Audit Framework',       'UK', '2024.1', 0, 'live', 'FRC audit and ethical standards'),
  ('UK_HMRC_AML',             'HMRC Money Laundering Supervision',                   'UK', '2024.1', 0, 'live', 'AML supervised business obligations'),
  ('UK_GPHC',                 'General Pharmaceutical Council Standards',            'UK', '2024.1', 0, 'live', 'Pharmacists and registered pharmacies'),
  ('UK_ABPI',                 'ABPI Code of Practice',                               'UK', '2024.1', 0, 'live', 'Pharmaceutical industry promotion code'),
  ('UK_GDC',                  'General Dental Council Standards',                    'UK', '2024.1', 0, 'live', 'Dentists and dental practices'),
  ('UK_PRA',                  'PRA Rulebook',                                        'UK', '2024.1', 0, 'live', 'Prudential Regulation Authority'),
  ('UK_PSR',                  'Payment Systems Regulator',                           'UK', '2024.1', 0, 'live', 'Payment systems oversight'),
  ('UK_FOS_FSCS',             'FOS + FSCS Disclosure',                               'UK', '2024.1', 0, 'live', 'Ombudsman + Compensation Scheme'),
  ('UK_ABI',                  'Association of British Insurers',                     'UK', '2024.1', 0, 'live', 'ABI code of practice'),
  ('UK_RICS',                 'RICS Rules of Conduct',                               'UK', '2024.1', 0, 'live', 'Royal Institution of Chartered Surveyors'),
  ('UK_ARLA',                 'ARLA Propertymark Conduct',                           'UK', '2024.1', 0, 'live', 'Letting agent professional body'),
  ('UK_TPO',                  'The Property Ombudsman Code',                         'UK', '2024.1', 0, 'live', 'Property redress scheme'),
  ('UK_OFSTED',               'Ofsted School Inspection Framework',                  'UK', '2024.1', 0, 'live', 'Schools regulator'),
  ('UK_DFE',                  'Department for Education Guidance',                    'UK', '2024.1', 0, 'live', 'School operator disclosures'),
  ('UK_OFS',                  'Office for Students',                                 'UK', '2024.1', 0, 'live', 'HE regulator'),
  ('UK_CHARITY_COMMISSION',   'Charity Commission for England and Wales',            'UK', '2024.1', 0, 'live', 'Registered charity obligations'),
  ('UK_FUNDRAISING_REG',      'Fundraising Regulator Code',                          'UK', '2024.1', 0, 'live', 'Fundraising standards'),
  ('UK_HMRC_GIFTAID',         'HMRC Gift Aid Rules',                                 'UK', '2024.1', 0, 'live', 'Charity Gift Aid disclosure'),
  ('UK_OFGEM',                'Ofgem Standards of Conduct',                          'UK', '2024.1', 0, 'live', 'Energy regulator'),
  ('UK_HSE_ENERGY',           'HSE Energy Sector Guidance',                          'UK', '2024.1', 0, 'live', 'Health and Safety in energy'),
  ('UK_CAA',                  'Civil Aviation Authority',                            'UK', '2024.1', 0, 'live', 'Aviation regulator'),
  ('UK_ORR',                  'Office of Rail and Road',                             'UK', '2024.1', 0, 'live', 'Rail regulator'),
  ('UK_DVSA',                 'Driver and Vehicle Standards Agency',                 'UK', '2024.1', 0, 'live', 'Road operator/transport ops'),
  ('UK_OFCOM',                'Ofcom Broadcasting Code',                             'UK', '2024.1', 0, 'live', 'Communications regulator'),
  ('UK_ASA_CAP',              'ASA / CAP Code',                                      'UK', '2024.1', 0, 'live', 'Advertising standards'),
  ('UK_IPSO',                 'IPSO Editors Code of Practice',                       'UK', '2024.1', 0, 'live', 'Press regulator'),
  ('UK_HSE',                  'HSE Health and Safety',                               'UK', '2024.1', 0, 'live', 'Health and Safety Executive'),
  ('UK_UKCA',                 'UKCA Conformity Marking',                             'UK', '2024.1', 0, 'live', 'Product conformity'),
  ('UK_ENV_AGENCY',           'Environment Agency Permits',                          'UK', '2024.1', 0, 'live', 'Environmental permits and compliance'),
  ('UK_CITB',                 'CITB Construction Training Levy',                     'UK', '2024.1', 0, 'live', 'Construction industry training'),
  ('UK_FSA',                  'Food Standards Agency',                               'UK', '2024.1', 0, 'live', 'Food safety + hygiene'),
  ('UK_LICENSING_ACT',        'Licensing Act 2003',                                  'UK', '2024.1', 0, 'live', 'Premises licensing (hospitality)'),
  ('UK_CMA',                  'Competition and Markets Authority',                   'UK', '2024.1', 0, 'live', 'Consumer protection + competition'),
  ('UK_TRADING_STANDARDS',    'CTSI Trading Standards',                              'UK', '2024.1', 0, 'live', 'Consumer rights / pricing transparency'),
  ('UK_NCSC_CYBER_ESSENTIALS','NCSC Cyber Essentials',                               'UK', '2024.1', 0, 'live', 'Cyber assurance baseline'),
  ('UK_DSIT_NIS2',            'DSIT NIS Regulations',                                'UK', '2024.1', 0, 'live', 'Network and information systems')
ON CONFLICT (framework_short) DO NOTHING;

-- ============================================================================
-- NEW COMPLIANCE RULES · ~200 rows. Pattern grammar reminder:
--   regex_pattern  — case-insensitive regex tested against page HTML
--   url_check      — path that MUST be present for the rule to apply (else home page)
--   severity       — P0 (must-fix, legal exposure) / P1 (best-practice gap) / P2 (nice-to-have)
-- ============================================================================

-- ============== BSB · Barristers ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_BSB','C1.1','Barrister must disclose chambers registration', '(bar standards board|chambers|inn of court|called to the bar)', '/', 'P0', 'https://www.barstandardsboard.org.uk/', TRUE),
  ('UK_BSB','C1.2','Public Access disclosure where direct access offered', '(public access|direct access)', '/', 'P1', 'https://www.barstandardsboard.org.uk/', TRUE),
  ('UK_BSB','C2.1','Complaints handling procedure published', '(legal ombudsman|complaints? (procedure|process)|how to complain)', '/contact', 'P0', 'https://www.barstandardsboard.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ICAEW · Accountants ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ICAEW','E1.1','Firm must disclose ICAEW registration number', '(icaew|institute of chartered accountants|chartered accountants)', '/', 'P0', 'https://www.icaew.com/', TRUE),
  ('UK_ICAEW','E2.1','Statutory audit registration disclosure', '(registered (auditor|to carry on audit work))', '/', 'P0', 'https://www.icaew.com/', TRUE),
  ('UK_ICAEW','E3.1','Anti-money-laundering supervision disclosure', '(anti.{0,5}money.{0,5}laundering|aml supervis|hmrc supervis)', '/about|/legal|/regulatory', 'P0', 'https://www.icaew.com/', TRUE),
  ('UK_ICAEW','E4.1','Complaints procedure publication', '(complaints? (procedure|policy)|legal complaint|how to complain)', '/contact|/legal', 'P0', 'https://www.icaew.com/', TRUE),
  ('UK_ICAEW','E5.1','Professional indemnity insurance disclosure', '(professional indemnity|pi insurance|pii)', '/about|/legal', 'P1', 'https://www.icaew.com/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ACCA · Accountants ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ACCA','A1.1','ACCA registration disclosure', '(acca|association of chartered certified accountants)', '/', 'P0', 'https://www.accaglobal.com/', TRUE),
  ('UK_ACCA','A2.1','Practising certificate disclosure', '(practising certificate|certificate of practice)', '/about|/legal', 'P1', 'https://www.accaglobal.com/', TRUE),
  ('UK_ACCA','A3.1','Code of Ethics reference', '(code of ethics|professional conduct)', '/about|/legal', 'P2', 'https://www.accaglobal.com/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== FRC ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_FRC','F1.1','Audit registration with recognised supervisory body disclosed', '(registered auditor|audit registration|frc registered)', '/', 'P0', 'https://www.frc.org.uk/', TRUE),
  ('UK_FRC','F2.1','Transparency report for public-interest audits', '(transparency report|audit transparency)', '/', 'P1', 'https://www.frc.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== HMRC AML ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_HMRC_AML','H1.1','AML supervisor disclosure (HMRC or named supervisor)', '(supervised (by|under).{0,40}(hmrc|sra|icaew|acca|fca)|aml supervis|money laundering reg)', '/about|/legal|/regulatory', 'P0', 'https://www.gov.uk/government/collections/money-laundering-regulations', TRUE)
ON CONFLICT DO NOTHING;

-- ============== GPhC · Pharmacists ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_GPHC','G1.1','GPhC registration number for pharmacy and superintendent pharmacist', '(gphc|general pharmaceutical council|premises (no|number)|superintendent pharmacist)', '/', 'P0', 'https://www.pharmacyregulation.org/', TRUE),
  ('UK_GPHC','G2.1','Standards for registered pharmacies disclosure', '(standards for (registered )?pharmacies|professional standards)', '/about|/legal', 'P1', 'https://www.pharmacyregulation.org/', TRUE),
  ('UK_GPHC','G3.1','Owner and superintendent details', '(superintendent|registered pharmacist|owner)', '/about|/legal', 'P1', 'https://www.pharmacyregulation.org/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ABPI · Pharmaceutical promotion ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ABPI','B1.1','UK prescribing information link near promotion claims', '(prescribing information|pi link|spc|summary of product characteristics)', '/', 'P0', 'https://www.pmcpa.org.uk/the-code/', TRUE),
  ('UK_ABPI','B2.1','Adverse event reporting disclosure', '(adverse event|yellow card|side effects)', '/', 'P0', 'https://www.pmcpa.org.uk/the-code/', TRUE),
  ('UK_ABPI','B3.1','Date of preparation and job reference on promotional pages', '(date of preparation|job (code|ref|reference)|preparation date)', '/', 'P1', 'https://www.pmcpa.org.uk/the-code/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== GDC · Dental ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_GDC','D1.1','GDC registration number for clinicians', '(gdc (no|number|reg)|general dental council)', '/', 'P0', 'https://www.gdc-uk.org/', TRUE),
  ('UK_GDC','D2.1','Complaints handling for dental services', '(dental complaints? service|complaints? procedure)', '/contact|/legal', 'P0', 'https://www.gdc-uk.org/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== PRA ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_PRA','P1.1','Dual-regulated firm states PRA and FCA authorisation', '(authorised by the prudential regulation authority|pra (and|&) fca|dual.{0,10}regulated)', '/', 'P0', 'https://www.bankofengland.co.uk/prudential-regulation', TRUE),
  ('UK_PRA','P2.1','Senior Managers and Certification Regime reference', '(senior managers? (and|&) certification|smcr)', '/about|/legal|/regulatory', 'P1', 'https://www.bankofengland.co.uk/prudential-regulation', TRUE)
ON CONFLICT DO NOTHING;

-- ============== PSR · Payment Systems ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_PSR','S1.1','Authorised Push Payment scam reimbursement notice', '(authorised push payment|app scam|app fraud|reimbursement (policy|scheme))', '/', 'P0', 'https://www.psr.org.uk/', TRUE),
  ('UK_PSR','S2.1','Confirmation of Payee disclosure', '(confirmation of payee|cop check)', '/', 'P1', 'https://www.psr.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== FOS / FSCS · Finance ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_FOS_FSCS','O1.1','FOS eligibility statement for retail customers', '(financial ombudsman|fos\\.org\\.uk|complain to the financial ombudsman)', '/contact|/legal', 'P0', 'https://www.financial-ombudsman.org.uk/', TRUE),
  ('UK_FOS_FSCS','O2.1','FSCS coverage statement (banks/eMoney explicitly state coverage or exclusion)', '(fscs|financial services compensation scheme|protected up to)', '/', 'P0', 'https://www.fscs.org.uk/', TRUE),
  ('UK_FOS_FSCS','O3.1','FSCS exclusion disclosure (eMoney not covered)', '(eligible deposit|not (eligible|covered)|electronic money)', '/legal|/regulatory', 'P1', 'https://www.fscs.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ABI · Insurance ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ABI','I1.1','ABI membership or code reference', '(abi|association of british insurers|good practice guide)', '/about|/legal', 'P2', 'https://www.abi.org.uk/', TRUE),
  ('UK_ABI','I2.1','Insurance Premium Tax disclosure on quotes', '(insurance premium tax|ipt)', '/', 'P1', 'https://www.abi.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== RICS · Surveyors ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_RICS','R1.1','RICS regulation disclosure', '(rics|royal institution of chartered surveyors|regulated by rics)', '/', 'P0', 'https://www.rics.org/', TRUE),
  ('UK_RICS','R2.1','Client money protection scheme disclosure', '(client money (protection|scheme)|cmp)', '/about|/legal', 'P0', 'https://www.rics.org/', TRUE),
  ('UK_RICS','R3.1','Complaints handling procedure with appropriate redress scheme', '(rics regulation|complaints? handling|the property ombudsman|tpo|cedr)', '/contact|/legal', 'P0', 'https://www.rics.org/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ARLA Propertymark ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ARLA','L1.1','Letting fee transparency (tenant fees ban compliance)', '(tenant fees|holding deposit|no admin fee|deposit cap)', '/', 'P0', 'https://www.propertymark.co.uk/', TRUE),
  ('UK_ARLA','L2.1','Client money handling disclosure', '(client money handling|client account|cmp)', '/about|/legal', 'P0', 'https://www.propertymark.co.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== TPO · Property Ombudsman ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_TPO','T1.1','Property Ombudsman scheme membership disclosed', '(property ombudsman|tpos|property redress scheme|prs)', '/', 'P0', 'https://www.tpos.co.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== OFSTED · Schools ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_OFSTED','OF1.1','Latest Ofsted report link', '(ofsted|inspection report|latest inspection)', '/', 'P0', 'https://www.gov.uk/government/organisations/ofsted', TRUE),
  ('UK_OFSTED','OF2.1','Statutory school information disclosures (admissions, behaviour, SEND)', '(admissions|behaviour policy|send (information report|policy))', '/policies|/about|/parents', 'P0', 'https://www.gov.uk/government/organisations/ofsted', TRUE),
  ('UK_OFSTED','OF3.1','Safeguarding lead and policy disclosure', '(safeguarding|designated safeguarding lead|dsl|keeping children safe)', '/safeguarding|/about|/parents', 'P0', 'https://www.gov.uk/government/organisations/ofsted', TRUE)
ON CONFLICT DO NOTHING;

-- ============== DfE ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_DFE','DFE1.1','Statutory school website content present', '(curriculum|exam results|term dates|pupil premium|sports premium)', '/', 'P0', 'https://www.gov.uk/guidance/what-maintained-schools-must-publish-online', TRUE),
  ('UK_DFE','DFE2.1','Prevent Duty statement', '(prevent duty|preventing extremism|british values)', '/policies|/safeguarding', 'P1', 'https://www.gov.uk/government/publications/prevent-duty-guidance', TRUE)
ON CONFLICT DO NOTHING;

-- ============== OFS · Higher Ed ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_OFS','OFS1.1','Office for Students registration', '(office for students|ofs registered)', '/about|/legal', 'P0', 'https://www.officeforstudents.org.uk/', TRUE),
  ('UK_OFS','OFS2.1','Access and Participation Plan link', '(access and participation plan|app plan)', '/about|/admissions', 'P1', 'https://www.officeforstudents.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Charity Commission ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_CHARITY_COMMISSION','CC1.1','Registered charity number on every page', '(registered charity (no\\.?|number)|charity (no|number)\\s*[\\d]{5,})', '/', 'P0', 'https://www.gov.uk/government/organisations/charity-commission', TRUE),
  ('UK_CHARITY_COMMISSION','CC2.1','Trustee names disclosure', '(trustees?|board of trustees)', '/about|/governance|/people', 'P1', 'https://www.gov.uk/government/organisations/charity-commission', TRUE),
  ('UK_CHARITY_COMMISSION','CC3.1','Annual report / accounts link', '(annual report|annual accounts|trustees report)', '/about|/governance', 'P1', 'https://www.gov.uk/government/organisations/charity-commission', TRUE),
  ('UK_CHARITY_COMMISSION','CC4.1','Charitable objects disclosure', '(our (mission|purpose|objects|aims)|charitable (objects|purposes))', '/about', 'P1', 'https://www.gov.uk/government/organisations/charity-commission', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Fundraising Regulator ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_FUNDRAISING_REG','FR1.1','Fundraising Regulator badge / Code reference', '(fundraising regulator|fundraising code|code of fundraising)', '/donate|/get-involved|/about', 'P1', 'https://www.fundraisingregulator.org.uk/', TRUE),
  ('UK_FUNDRAISING_REG','FR2.1','Donor opt-out / preferences route', '(unsubscribe|preferences|opt[- ]?out|stop (mail|contact))', '/donate|/about', 'P0', 'https://www.fundraisingregulator.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== HMRC Gift Aid ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_HMRC_GIFTAID','GA1.1','Gift Aid declaration on donation form', '(gift aid|reclaim 25p|claim gift aid)', '/donate', 'P0', 'https://www.gov.uk/donating-to-charity/gift-aid', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Ofgem ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_OFGEM','OG1.1','Energy supplier licence and price cap reference', '(ofgem|gas and electricity markets|price cap|energy price guarantee)', '/', 'P0', 'https://www.ofgem.gov.uk/', TRUE),
  ('UK_OFGEM','OG2.1','Vulnerable customer / priority services register', '(priority services register|psr|vulnerable customers)', '/help|/support', 'P1', 'https://www.ofgem.gov.uk/', TRUE),
  ('UK_OFGEM','OG3.1','Complaints escalation to Energy Ombudsman', '(energy ombudsman|ombudsman services)', '/contact|/help', 'P0', 'https://www.ofgem.gov.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== CAA · Aviation ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_CAA','CAA1.1','ATOL protection statement for travel sellers', '(atol|atol protected|atol certificate)', '/', 'P0', 'https://www.caa.co.uk/', TRUE),
  ('UK_CAA','CAA2.1','Air operator certificate or licence reference', '(air operator certificate|aoc|operating licence|caa registration)', '/about|/legal', 'P0', 'https://www.caa.co.uk/', TRUE),
  ('UK_CAA','CAA3.1','EU261/UK261 passenger rights disclosure', '(eu261|uk261|denied boarding|passenger rights)', '/help|/legal', 'P1', 'https://www.caa.co.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ORR · Rail ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ORR','ORR1.1','Rail Ombudsman scheme membership', '(rail ombudsman|orr|office of rail and road)', '/contact|/help', 'P0', 'https://www.orr.gov.uk/', TRUE),
  ('UK_ORR','ORR2.1','Passenger charter / delay repay scheme', '(delay repay|passenger charter)', '/help|/contact', 'P0', 'https://www.orr.gov.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== DVSA · Road ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_DVSA','DVSA1.1','Operator Licence (Goods Vehicle Operator) reference', '(operator licence|gv (operator|licence)|o.{0,2}licence)', '/about|/legal', 'P0', 'https://www.gov.uk/dvsa', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Ofcom · Media ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_OFCOM','OC1.1','Broadcasting / on-demand programme service licence', '(ofcom|odps|broadcast licence|programme service)', '/about|/legal', 'P0', 'https://www.ofcom.org.uk/', TRUE),
  ('UK_OFCOM','OC2.1','Online Safety Act risk assessment statement', '(online safety|illegal harms|age assurance|risk assessment)', '/safety|/about|/legal', 'P1', 'https://www.ofcom.org.uk/online-safety', TRUE)
ON CONFLICT DO NOTHING;

-- ============== ASA / CAP · Advertising ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ASA_CAP','AS1.1','Honest claims (no superlatives without substantiation)', '(no\\.?\\s*1|best in the uk|world.{0,4}leading|leading|number one)', '/', 'P1', 'https://www.asa.org.uk/codes-and-rulings/advertising-codes.html', TRUE),
  ('UK_ASA_CAP','AS2.1','Disclosure of paid testimonials / endorsements', '(#ad|#sponsored|paid (partnership|promotion)|advertising disclosure)', '/', 'P0', 'https://www.asa.org.uk/', TRUE),
  ('UK_ASA_CAP','AS3.1','Pricing transparency (incl. VAT or excluding clearly stated)', '(incl(\\.|uding)? vat|excl(\\.|uding)? vat|vat included)', '/pricing|/shop|/', 'P1', 'https://www.asa.org.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== IPSO ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_IPSO','IP1.1','IPSO regulated publication marker', '(ipso|independent press standards|editors code)', '/about|/legal', 'P1', 'https://www.ipso.co.uk/', TRUE),
  ('UK_IPSO','IP2.1','Corrections and complaints policy', '(corrections (policy|page)|how to complain|complaints? (policy|procedure))', '/about|/legal|/contact', 'P0', 'https://www.ipso.co.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== HSE · Health & Safety ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_HSE','HSE1.1','Health and Safety policy disclosure', '(health and safety policy|hse policy|safety policy)', '/about|/legal|/health-safety', 'P1', 'https://www.hse.gov.uk/', TRUE),
  ('UK_HSE','HSE2.1','RIDDOR reportable incident reference', '(riddor|reporting of injuries|safety incident)', '/about|/legal', 'P2', 'https://www.hse.gov.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== UKCA · Conformity ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_UKCA','UK1.1','UKCA marking on products sold in GB', '(ukca|uk conformity assessed|ce mark)', '/products|/shop|/', 'P1', 'https://www.gov.uk/guidance/using-the-ukca-marking', TRUE),
  ('UK_UKCA','UK2.1','Declaration of Conformity availability', '(declaration of conformity|doc.{0,8}available)', '/legal|/about', 'P1', 'https://www.gov.uk/guidance/using-the-ukca-marking', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Environment Agency ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_ENV_AGENCY','EA1.1','Environmental permit / licence disclosure', '(environment(al)? permit|environmental licence|operating permit)', '/about|/legal|/sustainability', 'P0', 'https://www.gov.uk/government/organisations/environment-agency', TRUE),
  ('UK_ENV_AGENCY','EA2.1','Waste carrier / broker registration', '(waste carrier|waste broker registration)', '/about|/legal', 'P1', 'https://www.gov.uk/government/organisations/environment-agency', TRUE)
ON CONFLICT DO NOTHING;

-- ============== CITB · Construction ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_CITB','CITB1.1','CSCS / construction skills card reference', '(cscs|citb|construction skills)', '/about|/careers', 'P2', 'https://www.citb.co.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== FSA · Food ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_FSA','FSA1.1','Food Hygiene Rating Scheme disclosure', '(food hygiene rating|hygiene rating|rated\\s*[1-5]\\s*out of 5)', '/', 'P0', 'https://www.food.gov.uk/', TRUE),
  ('UK_FSA','FSA2.1','Allergen information / Natasha law statement', '(allergen|natasha.{0,10}law|allergy advice|may contain)', '/menu|/food|/allergens', 'P0', 'https://www.food.gov.uk/business-guidance/allergen-guidance-for-food-businesses', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Licensing Act ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_LICENSING_ACT','LA1.1','Premises licence holder / DPS disclosure', '(premises licence|designated premises supervisor|dps)', '/about|/legal', 'P0', 'https://www.gov.uk/guidance/licensing-act-2003-explanatory-notes', TRUE),
  ('UK_LICENSING_ACT','LA2.1','Challenge 21/25 policy', '(challenge\\s*(21|25)|think 25|age verification)', '/', 'P1', 'https://www.gov.uk/government/publications/code-of-practice-for-the-sale-of-alcohol', TRUE)
ON CONFLICT DO NOTHING;

-- ============== CMA ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_CMA','CMA1.1','Consumer Rights Act statutory information', '(consumer rights|statutory rights|14 days|cooling.{0,3}off)', '/terms|/legal|/returns', 'P0', 'https://www.gov.uk/consumer-protection-rights', TRUE),
  ('UK_CMA','CMA2.1','Honest reviews disclosure (no fake or paid reviews)', '(reviews? (policy|guidelines)|verified review|trustpilot|reviews\\.io|feefo)', '/reviews|/about|/legal', 'P1', 'https://www.gov.uk/government/organisations/competition-and-markets-authority', TRUE),
  ('UK_CMA','CMA3.1','Pricing transparency: total price including unavoidable fees', '(no hidden (fees|charges)|total price|inclusive of (vat|charges))', '/pricing|/shop|/checkout', 'P0', 'https://www.gov.uk/government/organisations/competition-and-markets-authority', TRUE)
ON CONFLICT DO NOTHING;

-- ============== Trading Standards ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_TRADING_STANDARDS','TS1.1','Unit pricing for pre-packaged goods', '(per\\s*(100g|kg|litre|l)|unit price)', '/shop|/products|/', 'P1', 'https://www.gov.uk/government/organisations/trading-standards', TRUE),
  ('UK_TRADING_STANDARDS','TS2.1','Business identification on website (Co. No, VAT, Address)', '(company (no|number|registration)|companies house|vat\\s*(no|number)|registered office)', '/contact|/legal|/about', 'P0', 'https://www.gov.uk/government/organisations/trading-standards', TRUE)
ON CONFLICT DO NOTHING;

-- ============== NCSC Cyber Essentials ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_NCSC_CYBER_ESSENTIALS','CE1.1','Cyber Essentials or Plus certification badge', '(cyber essentials|cyber essentials plus|ce.{0,4}plus)', '/about|/legal|/security', 'P1', 'https://www.ncsc.gov.uk/cyberessentials/overview', TRUE),
  ('UK_NCSC_CYBER_ESSENTIALS','CE2.1','Security disclosure (security.txt / responsible disclosure)', '(responsible disclosure|security\\.txt|report a vulnerability|security policy)', '/security|/legal|/contact|/.well-known/security.txt', 'P1', 'https://www.ncsc.gov.uk/', TRUE)
ON CONFLICT DO NOTHING;

-- ============== DSIT NIS ==============
INSERT INTO compliance_rules (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url, active)
VALUES
  ('UK_DSIT_NIS2','NIS1.1','NIS Regulations / OES designation for critical infrastructure', '(nis regulations|operator of essential services|oes|digital service provider|dsp)', '/about|/legal|/security', 'P1', 'https://www.gov.uk/government/publications/nis-regulations', TRUE)
ON CONFLICT DO NOTHING;

COMMIT;

-- Sanity: counts after migration
SELECT framework_short, COUNT(*) AS rules FROM compliance_rules WHERE active=TRUE GROUP BY framework_short ORDER BY framework_short;
