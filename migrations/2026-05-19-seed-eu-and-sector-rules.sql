-- Phase 2 Task 2.6.2 + 2.6.3: EU GDPR rules + sector regulator rules.

-- EU_GDPR (15 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('EU_GDPR','A6','Lawful basis must be identifiable for every processing activity','P0','https://gdpr-info.eu/art-6-gdpr/','EDPB various'),
  ('EU_GDPR','A7','Conditions for consent (freely given, specific, informed, unambiguous)','P0','https://gdpr-info.eu/art-7-gdpr/','CJEU Planet49 C-673/17'),
  ('EU_GDPR','A12','Transparent information in concise, intelligible form','P0','https://gdpr-info.eu/art-12-gdpr/','CNIL v Google 2019: €50m'),
  ('EU_GDPR','A13','Information on collection from data subject','P0','https://gdpr-info.eu/art-13-gdpr/','Same'),
  ('EU_GDPR','A14','Information when data not obtained from data subject','P0','https://gdpr-info.eu/art-14-gdpr/','CJEU Bartisz'),
  ('EU_GDPR','A15','Right of access','P0','https://gdpr-info.eu/art-15-gdpr/','Multiple national DPAs'),
  ('EU_GDPR','A17','Right to erasure (right to be forgotten)','P0','https://gdpr-info.eu/art-17-gdpr/','Google Spain'),
  ('EU_GDPR','A20','Right to data portability','P1','https://gdpr-info.eu/art-20-gdpr/','EDPB guidelines'),
  ('EU_GDPR','A21','Right to object to direct marketing','P0','https://gdpr-info.eu/art-21-gdpr/','Various'),
  ('EU_GDPR','A25','Data protection by design and by default','P1','https://gdpr-info.eu/art-25-gdpr/','EDPB 4/2019'),
  ('EU_GDPR','A27','Non-EU controller representative requirement','P0','https://gdpr-info.eu/art-27-gdpr/','CNIL v Locatour 2023'),
  ('EU_GDPR','A28','Processor contract terms required','P0','https://gdpr-info.eu/art-28-gdpr/','EDPB 7/2020'),
  ('EU_GDPR','A32','Security of processing appropriate to risk','P1','https://gdpr-info.eu/art-32-gdpr/','BfDI v Vodafone Germany 2022'),
  ('EU_GDPR','A44','International transfer baseline','P0','https://gdpr-info.eu/art-44-gdpr/','Schrems II'),
  ('EU_GDPR','A46','SCCs or BCRs required for transfers absent adequacy','P0','https://gdpr-info.eu/art-46-gdpr/','EDPB 2021/0914')
ON CONFLICT DO NOTHING;

-- UK_FCA_CONC25 Financial Promotions (6 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_FCA_CONC25','CONC2.5.1','Financial promotion must be clear, fair, not misleading','P0','https://www.handbook.fca.org.uk/handbook/CONC/2/5.html','FCA v multiple credit brokers'),
  ('UK_FCA_CONC25','CONC2.5.2','Risk warnings prominent for high-risk consumer credit','P0','https://www.handbook.fca.org.uk/','FCA Buy Now Pay Later 2024'),
  ('UK_FCA_CONC25','CONC2.5.3','APR disclosed with equal prominence to monthly payment','P0','https://www.handbook.fca.org.uk/','FCA v Klarna communications 2022'),
  ('UK_FCA_CONC25','CONC2.5.4','Comparison claims substantiated','P1','https://www.handbook.fca.org.uk/','Various'),
  ('UK_FCA_CONC25','CONC2.5.5','Limitations and exclusions equally prominent','P0','https://www.handbook.fca.org.uk/','Various'),
  ('UK_FCA_CONC25','CONC2.5.6','Approver firm responsible for non-authorised promotions','P0','https://www.handbook.fca.org.uk/','FCA Section 21 regime 2024')
ON CONFLICT DO NOTHING;

-- UK_SRA_COC Solicitors Code of Conduct (6 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_SRA_COC','TR.1','Price information accessible on all relevant practice areas','P0','https://www.sra.org.uk/solicitors/standards-regulations/transparency-standards/','SRA Transparency Rules 2018'),
  ('UK_SRA_COC','TR.2','SRA-regulated firm digital badge displayed','P1','https://www.sra.org.uk/','SRA guidance'),
  ('UK_SRA_COC','TR.3','Complaints procedure published online','P0','https://www.sra.org.uk/','Multiple SRA fines'),
  ('UK_SRA_COC','TR.4','Solicitor name and SRA number on website footer','P1','https://www.sra.org.uk/','Same'),
  ('UK_SRA_COC','C7.1','Marketing must not be misleading or unfair','P0','https://www.sra.org.uk/solicitors/standards-regulations/code-conduct-solicitors/','SRA v multiple sole practitioners'),
  ('UK_SRA_COC','C7.4','Specialist or expert claims must be substantiated','P0','https://www.sra.org.uk/','Same')
ON CONFLICT DO NOTHING;

-- UK_CQC Care Quality Commission (6 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_CQC','M01','CQC rating displayed prominently on homepage if registered','P0','https://www.cqc.org.uk/guidance-providers/registration/displaying-your-ratings','CQC enforcement notices'),
  ('UK_CQC','M02','Provider name matches CQC registration exactly','P1','https://www.cqc.org.uk/','Same'),
  ('UK_CQC','M03','No misleading claims about clinical outcomes','P0','https://www.cqc.org.uk/','CQC v cosmetic surgery providers'),
  ('UK_CQC','M04','Testimonials must be genuine and dated','P1','https://www.cqc.org.uk/','ASA cross-ruling'),
  ('UK_CQC','M05','Inspector contact details accessible from website','P2','https://www.cqc.org.uk/','Guidance'),
  ('UK_CQC','M06','Pricing on regulated services published when reasonable','P1','https://www.cqc.org.uk/','Guidance')
ON CONFLICT DO NOTHING;

-- UK_MHRA Medicines and Healthcare products Regulatory Agency (5 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_MHRA','BCAP12','POM advertising to public banned','P0','https://www.asa.org.uk/codes-and-rulings/advertising-codes.html','BCAP/CAP Section 12'),
  ('UK_MHRA','MHRA01','Off-label promotion banned','P0','https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency','MHRA v multiple pharma'),
  ('UK_MHRA','MHRA02','Therapeutic claims substantiated by published evidence','P0','https://www.gov.uk/','ASA cross-ruling'),
  ('UK_MHRA','MHRA03','Marketing authorisation number on all product pages','P1','https://www.gov.uk/','Same'),
  ('UK_MHRA','MHRA04','Adverse event reporting link visible','P1','https://www.gov.uk/','Guidance')
ON CONFLICT DO NOTHING;

-- US_FTC CAN-SPAM (5 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('US_FTC','SPAM01','Subject line cannot be deceptive','P0','https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business','FTC v multiple'),
  ('US_FTC','SPAM02','From header must identify sender','P0','https://www.ftc.gov/','Same'),
  ('US_FTC','SPAM03','Postal address required in email','P0','https://www.ftc.gov/','FTC v marketers 2023'),
  ('US_FTC','SPAM04','Opt-out within 10 business days','P0','https://www.ftc.gov/','Same'),
  ('US_FTC','SPAM05','Commercial messages must be labelled if subscriber opted in for transactional only','P1','https://www.ftc.gov/','Guidance')
ON CONFLICT DO NOTHING;

-- Refresh counts
UPDATE framework_versions fv SET rules_count = (
  SELECT COUNT(*) FROM compliance_rules cr WHERE cr.framework_short = fv.framework_short AND cr.active = TRUE
) WHERE fv.framework_short IN ('EU_GDPR','UK_FCA_CONC25','UK_SRA_COC','UK_CQC','UK_MHRA','US_FTC');
