-- Phase 2 Task 2.6.1: compliance_rules table + UK GDPR/PECR/ICO Cookie seed.

CREATE TABLE IF NOT EXISTS compliance_rules (
  id SERIAL PRIMARY KEY,
  framework_short VARCHAR(50) NOT NULL REFERENCES framework_versions(framework_short),
  rule_id VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  regex_pattern TEXT,
  url_check VARCHAR(500),
  severity VARCHAR(10) NOT NULL,
  citation_url VARCHAR(500),
  enforcement_example TEXT,
  exceptions TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (framework_short, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_framework ON compliance_rules(framework_short) WHERE active = TRUE;

-- UK_GDPR_A13: Disclosure requirements (12 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_GDPR_A13','A13.1.a','Identity of the controller must be disclosed on first data collection page','P0','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-to-be-informed/','ICO v doorstep canvasser 2023: £130,000 for failing to identify controller'),
  ('UK_GDPR_A13','A13.1.b','Contact details of the controller (including DPO if applicable)','P0','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-to-be-informed/','Same'),
  ('UK_GDPR_A13','A13.1.c','Purposes of processing AND legal basis','P0','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/','ICO v Easylife 2022: £130,000 for invalid legitimate interest'),
  ('UK_GDPR_A13','A13.1.d','Legitimate interests (if relied on) clearly stated','P1','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/','Easylife — failed legitimate interest balancing test'),
  ('UK_GDPR_A13','A13.1.e','Recipients or categories of recipients of personal data','P1','https://ico.org.uk/','Various'),
  ('UK_GDPR_A13','A13.1.f','International transfers and safeguards (SCCs / adequacy)','P0','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/','ICO v TikTok 2023: £12.7m, partly for unclear transfer rules'),
  ('UK_GDPR_A13','A13.2.a','Retention period or criteria','P0','https://ico.org.uk/','ICO v Clearview 2022: £7.5m for indefinite retention'),
  ('UK_GDPR_A13','A13.2.b','Right to access, rectify, erase, restrict, port, object','P0','https://ico.org.uk/your-data-matters/','Multiple cases'),
  ('UK_GDPR_A13','A13.2.c','Right to withdraw consent (if consent is the basis)','P0','https://ico.org.uk/','Various'),
  ('UK_GDPR_A13','A13.2.d','Right to complain to ICO','P0','https://ico.org.uk/make-a-complaint/','Various'),
  ('UK_GDPR_A13','A13.2.e','Whether provision is statutory/contractual and consequences of not providing','P1','https://ico.org.uk/','Various'),
  ('UK_GDPR_A13','A13.2.f','Existence of automated decision-making including profiling','P1','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/rights-related-to-automated-decision-making-including-profiling/','ICO guidance on AI')
ON CONFLICT DO NOTHING;

-- UK_PECR: Electronic marketing (10 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_PECR','R22.1','Soft opt-in: prior similar product/service customer relationship for marketing','P0','https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/','ICO v Reactiv Media 2024: £75,000'),
  ('UK_PECR','R22.2','Marketing emails must include sender identity (no false header)','P0','https://ico.org.uk/','ICO v multiple — false sender prosecutions'),
  ('UK_PECR','R22.3','Marketing emails must include valid return address','P0','https://ico.org.uk/','Various'),
  ('UK_PECR','R22.4','Easy opt-out mechanism in every marketing email','P0','https://ico.org.uk/','ICO v multiple — defective unsubscribe'),
  ('UK_PECR','R23','B2B corporate subscriber: soft opt-in still required for individual employees identifiable in role','P1','https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/','ICO guidance'),
  ('UK_PECR','R6.1','Cookie consent before non-essential cookies set','P0','https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/','ICO v multiple — pre-consent analytics'),
  ('UK_PECR','R6.2','Cookie reject must be as prominent as accept','P0','https://ico.org.uk/','ICO Cookie Sweep 2024'),
  ('UK_PECR','R6.3','Cookie purpose disclosed clearly before consent','P0','https://ico.org.uk/','Same'),
  ('UK_PECR','R6.4','Cookie withdrawal mechanism accessible from every page','P1','https://ico.org.uk/','Same'),
  ('UK_PECR','R6.5','Strictly necessary cookies do not require consent but must be disclosed','P2','https://ico.org.uk/','Guidance')
ON CONFLICT DO NOTHING;

-- UK_ICO_COOKIES: Additional cookie-specific rules (10 rules)
INSERT INTO compliance_rules (framework_short, rule_id, description, severity, citation_url, enforcement_example) VALUES
  ('UK_ICO_COOKIES','C01','Analytics cookies require consent (ICO position 2023)','P0','https://ico.org.uk/','ICO Cookie Sweep 2024'),
  ('UK_ICO_COOKIES','C02','Cookie banner must not use pre-ticked boxes','P0','https://ico.org.uk/','CJEU Planet49'),
  ('UK_ICO_COOKIES','C03','Cookie wall (pay-or-OK) for unrelated content is not freely-given consent','P0','https://ico.org.uk/','ICO/EDPB position'),
  ('UK_ICO_COOKIES','C04','Cookie purposes must be itemised (functional vs analytics vs marketing)','P1','https://ico.org.uk/','Same'),
  ('UK_ICO_COOKIES','C05','Cookie list must include third-party cookies','P1','https://ico.org.uk/','Same'),
  ('UK_ICO_COOKIES','C06','Cookie scan must distinguish session vs persistent cookies','P2','https://ico.org.uk/','Guidance'),
  ('UK_ICO_COOKIES','C07','Cookie banner copy must be available before clicking accept','P1','https://ico.org.uk/','Same'),
  ('UK_ICO_COOKIES','C08','Cookie consent log must be retained for 12 months minimum','P1','https://ico.org.uk/','Guidance'),
  ('UK_ICO_COOKIES','C09','Re-prompt for consent after material changes to cookie usage','P1','https://ico.org.uk/','Guidance'),
  ('UK_ICO_COOKIES','C10','Cookie banner not shown to authenticated users with stored preferences','P2','https://ico.org.uk/','UX guidance')
ON CONFLICT DO NOTHING;

-- Update rules_count on framework_versions for the seeded frameworks.
UPDATE framework_versions fv SET rules_count = (
  SELECT COUNT(*) FROM compliance_rules cr WHERE cr.framework_short = fv.framework_short AND cr.active = TRUE
) WHERE fv.framework_short IN ('UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES');
