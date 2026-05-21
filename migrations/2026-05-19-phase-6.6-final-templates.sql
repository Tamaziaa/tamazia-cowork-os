-- Phase 6.6 · final email templates + per-client email file storage + sequence tracker.
-- Locks the 4 finalised cold-email touches into template_variants.

BEGIN;

-- ============================================================================
-- 1. Clear the legacy template_variants rows for touches 0+1 (we are replacing them)
-- ============================================================================
UPDATE template_variants SET active = FALSE, archived_at = NOW(), archived_reason = 'phase-6.6-replaced-by-final-4-touch-sequence' WHERE active = TRUE;

-- ============================================================================
-- 2. Insert the 4 finalised templates (sector-agnostic; placeholders resolve per lead)
-- ============================================================================
INSERT INTO template_variants (workspace_id, sector, touch, variant_letter, variant_kind, subject_template, body_template, allocation_pct, active)
VALUES
  (1, 'all', 0, 'A', 'permission-to-feature',
   'Permission to feature {firm} on tamazia',
   $body$
{first_name},

We are publishing "Best {sector_niche} in {country} 2026" on Tamazia ({tamazia_url}) this {month}. {firm} is on the shortlist. The pieces in this series typically rank top three on Google and get cited by Claude, ChatGPT, Gemini and Perplexity within 90 days.

The pre-publish review on {firm} produced a complimentary Compliance and SEO audit (£1,500 list price). The audit:

1. Covers 200+ frameworks vetting your online presence through {3_sector_specific_laws}
2. Maps AI search citation gaps across Claude, ChatGPT, Gemini, Perplexity
3. Ten audit dimensions: compliance with regulators, technical SEO, AI SEO, content, security, accessibility, TLS/DNS, solutions, and comparison with competitors' live standing
4. Names the specific regulator for every finding with breach under which sections
5. A quick 12-week implementation plan to clear all errors and shortcomings

Headline items: {2_compliance_pointers_and_2_seo_pointers_in_summary}.

Two questions:
(1) Happy to be featured?
(2) Is {first_name} the right person to coordinate the audit?

The DA 87 backlink stands either way. Point it at the page you most want Google or AI to weigh.

Best,
{alias_first_name}
$body$,
   100, TRUE),

  (1, 'all', 1, 'A', 'audit-delivery-challenge',
   're: feature {firm} in 2026 piece',
   $body$
{first_name},

Following last week. Are you still up for the feature? The DA 87 backlink hyperlinked to your website could directly push your organic ranking by 2-3 places on Google and AI search; the piece publishes this {month}.

The complimentary £1,500 Compliance and SEO audit on {firm} is live:

{audit_url}

Five takeaways:
1. {p0_finding_1}
2. {p0_finding_2}
3. {p0_finding_3}
4. {seo_finding_1}
5. {seo_finding_2}

We request to ask your current agency for its most recent report on {domain}. Compare ours line by line. If theirs covers the same ground, we are not the right fit. If not, you have just identified the blind spot.

Tamazia is a founder-led Compliance and SEO agency. $110M+ generated in client revenue across four continents.

Two numbers worth holding side by side. The {top_p0_compliance_topic} gap unfixed is roughly {compliance_cost_estimate} of regulatory and reputational exposure. The {top_seo_topic} opportunity is roughly {seo_uplift_estimate} of recoverable organic visibility. Thirty minutes with the founder to walk you through the report (Aman Pareek, LLM in International Business Law from King's College London):

cal.com/tamazia/strategy-call

Best,
{alias_first_name}
$body$,
   100, TRUE),

  (1, 'all', 2, 'A', 'binary-question-close',
   're: feature {firm}',
   $body$
{first_name},

One direct question on {firm}. Has {top_p0_compliance_topic} on {page_path} been reviewed and signed off this quarter?

If yes, apologies for the noise. If no, the audit has the fix:

{audit_url}

Stays live for 180 days. Worth comparing line by line against the last report your current agency delivered.

Best,
{alias_first_name}
$body$,
   100, TRUE),

  (1, 'all', 3, 'A', 'breakup-with-founder-line',
   'closing the file on {firm}',
   $body$
{first_name},

Closing the file. The audit at {audit_url} stays live for 180 days.

If {top_p0_compliance_topic} ever lands on the team's desk, the audit has the fix, or the founder's calendar is at cal.com/tamazia/strategy-call.

Best,
{alias_first_name}
$body$,
   100, TRUE);

-- ============================================================================
-- 3. client_email_files · per-lead, per-touch rendered email storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_email_files (
  id            BIGSERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id       INTEGER NOT NULL REFERENCES leads(id),
  touch_number  INTEGER NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  variant_id    BIGINT REFERENCES template_variants(id),
  file_path     TEXT,
  rendered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  send_id       BIGINT,
  UNIQUE (lead_id, touch_number)
);
CREATE INDEX IF NOT EXISTS idx_client_email_files_lead ON client_email_files(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_email_files_pending ON client_email_files(rendered_at) WHERE sent_at IS NULL;

-- ============================================================================
-- 4. email_sequence_state · per-lead sequence position + next-due tracker
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_sequence_state (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id),
  lead_id         INTEGER NOT NULL UNIQUE REFERENCES leads(id),
  current_touch   INTEGER NOT NULL DEFAULT 0,
  last_touch_sent_at TIMESTAMPTZ,
  next_due_at     TIMESTAMPTZ,
  status          VARCHAR(40) NOT NULL DEFAULT 'pending',
  paused_reason   TEXT,
  manually_handled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_sequence_due ON email_sequence_state(next_due_at, status) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_email_sequence_lead ON email_sequence_state(lead_id);

-- ============================================================================
-- 5. sector_template_resolver · per-sector laws + cost estimates
-- Populates the {3_sector_specific_laws}, {compliance_cost_estimate}, {seo_uplift_estimate} placeholders.
-- ============================================================================
CREATE TABLE IF NOT EXISTS sector_template_resolver (
  id                BIGSERIAL PRIMARY KEY,
  sector            VARCHAR(64) NOT NULL UNIQUE,
  sector_niche      VARCHAR(120) NOT NULL,
  laws_summary      TEXT NOT NULL,
  compliance_cost_estimate TEXT NOT NULL,
  seo_uplift_estimate TEXT NOT NULL,
  primary_regulator VARCHAR(80) NOT NULL,
  regulator_consequence TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sector_template_resolver (sector, sector_niche, laws_summary, compliance_cost_estimate, seo_uplift_estimate, primary_regulator, regulator_consequence) VALUES
  ('law-firms',     'law firms',                'SRA Transparency Rules, UK GDPR Article 13, ICO PECR, EU AI Act and GDPR',           '£30k to £200k in fines plus 6 months of remediation legal cost',  '35-55% of recoverable organic visibility on commercial keywords', 'SRA', 'an SRA enforcement notice and an ICO investigation'),
  ('healthcare',    'private healthcare providers', 'CQC fundamental standards, MHRA Blue Guide, ASA Section 12, UK GDPR, EU AI Act',  '£75k to £500k in fines plus paused inspection cycle',             '40-60% of recoverable organic visibility on procedure keywords',  'CQC', 'a CQC inspection trigger and MHRA criminal referral'),
  ('pharma',        'pharmaceutical companies', 'MHRA Blue Guide Appendix 6, GPhC Standards, ABPI Code, UK GDPR, EU AI Act',         '£100k to £1M in fines plus product-listing suspension',          '30-50% of recoverable organic visibility on indication keywords', 'MHRA', 'an MHRA criminal referral and ABPI complaint'),
  ('finance',       'wealth and lending firms', 'FCA CONC 2.5, PRA Senior Managers Regime, Consumer Duty, UK GDPR, EU AI Act',        '£250k to £2M in fines plus Senior Manager personal liability',   '45-70% of recoverable organic visibility on FCA-permitted terms',  'FCA', 'an FCA Section 165 information request and Consumer Duty review'),
  ('fintech',       'fintech and payment firms','FCA, PSR, FOS / FSCS disclosure, UK GDPR, EU AI Act',                                '£500k to £5M in fines plus payment licence at risk',             '40-65% of recoverable organic visibility on regulated-product terms','FCA', 'an FCA enforcement and FOS adverse publication'),
  ('insurance',     'insurance providers',     'FCA, PRA, ABI code, UK GDPR, EU AI Act',                                            '£200k to £1.5M in fines plus PRA capital uplift',                '35-55% of recoverable organic visibility on policy-product terms',  'FCA', 'an FCA s.166 skilled-persons report'),
  ('real-estate',   'estate and lettings agents','RICS Rules of Conduct, ARLA Propertymark, NTSEAT Material Information, Tenant Fees Act, UK GDPR','£20k to £150k in fines plus consumer-redress orders',     '40-60% of recoverable organic visibility on location keywords',     'RICS', 'a RICS regulatory action and Property Ombudsman award'),
  ('charity',       'charities and not-for-profits','Charity Commission, Fundraising Regulator, HMRC Gift Aid rules, UK GDPR',         '£10k to £100k in fines plus public-register notice',             '30-45% of recoverable organic visibility on cause keywords',        'Charity Commission', 'a Charity Commission inquiry and Fundraising Regulator notice'),
  ('education',     'schools and colleges',    'Ofsted Framework, DfE statutory guidance, OfS conditions, UK GDPR, Prevent Duty',     '£25k to £200k in fines plus inspection downgrade',               '30-50% of recoverable organic visibility on programme keywords',   'Ofsted', 'an Ofsted inspection trigger and DfE notice'),
  ('energy',        'energy suppliers',        'Ofgem Standards of Conduct, Energy Ombudsman, HSE energy, UK GDPR',                 '£500k to £10M in fines plus supplier-of-last-resort risk',       '25-40% of recoverable organic visibility on tariff keywords',      'Ofgem', 'an Ofgem enforcement and Energy Ombudsman judgement'),
  ('transport',     'transport operators',     'CAA, ORR, DVSA, UK GDPR',                                                          '£100k to £1M in fines plus operator-licence suspension',         '30-50% of recoverable organic visibility on route keywords',       'CAA', 'a CAA suspension and operator licence review'),
  ('aviation',      'aviation operators',      'CAA, ATOL, EU261/UK261 passenger-rights, UK GDPR',                                  '£250k to £2M in fines plus ATOL bond at risk',                   '35-55% of recoverable organic visibility on route keywords',       'CAA', 'a CAA AOC suspension and ATOL revocation'),
  ('media',         'media and broadcasters',  'Ofcom Broadcasting Code, ASA / CAP, IPSO Editors Code, UK GDPR, Online Safety Act',    '£250k to £2M in fines plus broadcast-licence at risk',           '30-50% of recoverable organic visibility on category keywords',    'Ofcom', 'an Ofcom enforcement and IPSO ruling'),
  ('marketing',     'marketing and creative agencies','ASA / CAP, UK GDPR, ICO PECR, EU AI Act',                                       '£20k to £200k in fines plus campaign-suspension order',         '35-55% of recoverable organic visibility on service keywords',     'ASA', 'an ASA ruling published on the regulator''s sanction page'),
  ('hospitality',   'hotels and restaurants',  'FSA food hygiene, Licensing Act 2003, ASA hospitality rulings, HSE, UK GDPR',         '£25k to £200k in fines plus licence-revocation risk',           '40-60% of recoverable organic visibility on location and cuisine keywords','FSA', 'an FSA enforcement notice and Local Authority licence review'),
  ('food',          'food and beverage operators','FSA food hygiene, Natasha''s Law, allergen labelling, UK GDPR',                     '£25k to £200k in fines plus product-listing recall',            '35-55% of recoverable organic visibility on product keywords',      'FSA', 'an FSA prosecution and Trading Standards action'),
  ('ecommerce',     'e-commerce and direct-to-consumer brands','CMA DMCCA drip-pricing, Trading Standards, ASA / CAP, UK GDPR, EU AI Act','£20k to £500k in fines plus mandatory CMA undertakings',         '40-65% of recoverable organic visibility on product keywords',       'CMA', 'a CMA undertaking and Trading Standards prosecution'),
  ('retail',        'retail brands',           'CMA, Trading Standards, Consumer Rights Act, UK GDPR',                              '£20k to £300k in fines plus voluntary undertakings',             '35-55% of recoverable organic visibility on product keywords',      'CMA', 'a CMA undertaking and Trading Standards prosecution'),
  ('saas',          'SaaS and platform companies','NCSC Cyber Essentials, DSIT NIS Regulations, UK GDPR, EU AI Act, CCPA / CPRA',     '£250k to £5M in fines plus contract-loss to enterprise buyers',  '40-60% of recoverable organic visibility on category keywords',     'ICO', 'an ICO investigation and customer enterprise-contract terminations'),
  ('tech',          'technology firms',        'NCSC Cyber Essentials, UK GDPR, EU AI Act, ICO PECR',                                '£100k to £2M in fines plus reputational fallout',                '40-60% of recoverable organic visibility on product keywords',      'ICO', 'an ICO investigation'),
  ('accounting',    'accounting firms',        'ICAEW Code of Ethics, ACCA Code, FRC standards, HMRC AML, UK GDPR',                  '£50k to £500k in fines plus practice-licence at risk',           '30-50% of recoverable organic visibility on service keywords',      'ICAEW', 'an ICAEW investigation and HMRC AML review'),
  ('construction',  'construction firms',      'HSE, CITB, UKCA marking, UK GDPR',                                                  '£100k to £2M in fines plus HSE enforcement order',               '30-45% of recoverable organic visibility on service keywords',      'HSE', 'an HSE prohibition notice and prosecution'),
  ('manufacturing', 'manufacturers',           'HSE, UKCA marking, Environment Agency, UK GDPR',                                    '£100k to £5M in fines plus product-recall obligations',          '30-45% of recoverable organic visibility on product keywords',      'HSE', 'an HSE prosecution and product recall'),
  ('professional-services','professional services firms','ICAEW, ICO PECR, UK GDPR, EU AI Act',                                       '£25k to £250k in fines plus practice-licence at risk',          '35-55% of recoverable organic visibility on service keywords',      'ICAEW', 'an ICAEW investigation'),
  ('dental',        'dental practices',        'GDC Standards, CQC, MHRA, UK GDPR',                                                '£50k to £300k in fines plus practice-licence at risk',          '40-60% of recoverable organic visibility on procedure keywords',     'GDC', 'a GDC fitness-to-practise referral and CQC inspection trigger'),
  ('barristers',    'barristers and chambers', 'Bar Standards Board Handbook, ICO PECR, UK GDPR',                                  '£25k to £200k in fines plus practice-certificate at risk',      '30-45% of recoverable organic visibility on practice-area keywords','BSB', 'a BSB disciplinary action'),
  ('higher-education','universities and higher education','OfS, DfE, ICO PECR, UK GDPR, EU AI Act',                                 '£100k to £1M in fines plus OfS deregistration risk',            '35-50% of recoverable organic visibility on programme keywords',     'OfS', 'an OfS regulatory intervention')
ON CONFLICT (sector) DO UPDATE SET
  sector_niche = EXCLUDED.sector_niche,
  laws_summary = EXCLUDED.laws_summary,
  compliance_cost_estimate = EXCLUDED.compliance_cost_estimate,
  seo_uplift_estimate = EXCLUDED.seo_uplift_estimate,
  primary_regulator = EXCLUDED.primary_regulator,
  regulator_consequence = EXCLUDED.regulator_consequence,
  updated_at = NOW();

COMMIT;

-- Final verification counts
SELECT 'template_variants' AS table_name, COUNT(*) AS rows FROM template_variants WHERE active = TRUE
UNION ALL
SELECT 'sector_template_resolver', COUNT(*) FROM sector_template_resolver
UNION ALL
SELECT 'client_email_files', COUNT(*) FROM client_email_files
UNION ALL
SELECT 'email_sequence_state', COUNT(*) FROM email_sequence_state;
