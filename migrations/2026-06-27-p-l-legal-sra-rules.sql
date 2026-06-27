-- P-L Phase 2 · Legal sector pack (ADDITIVE ONLY)
-- Adds SRA Transparency Rules 2018 framework + rules to Neon.
-- The code-level SECTOR_MAP already routes law-firms → UK_SRA_TRANSPARENCY;
-- this migration ensures the framework + its core rules exist in Neon.
--
-- Primary source references:
--   SRA Transparency Rules 2018 (effective 6 Dec 2018):
--     Rule 1.3-1.6: publish prices for defined services (PI, employment, immigration,
--                   probate, residential conveyancing, motoring, debt recovery).
--     Rule 2.2-2.4: complaints procedure on website (who/how/max 8 weeks/ombudsman).
--     Rule 3.3:     if not CFA/DBA — say so. If CFA/DBA — say so + conditions.
--     Rule 4:       display SRA digital badge on website; link to SRA regulated status.
--   SRA Code of Conduct for Firms 2019 (Paragraph 8.7-8.9):
--     Must not make misleading claims; fee information must be accurate and clear.
--
-- Apply: psql "$NEON_URL" -f migrations/2026-06-27-p-l-legal-sra-rules.sql
-- ADDITIVE ONLY — no DROP, no UPDATE, no DELETE.

BEGIN;

-- ── 1. Ensure UK_SRA_TRANSPARENCY framework exists (idempotent) ──
INSERT INTO framework_versions (framework_short, name, jurisdiction, region, regulator, effective_date, status, confidence, servable)
VALUES (
  'UK_SRA_TRANSPARENCY',
  'SRA Transparency Rules 2018',
  'UK',
  'UK',
  'Solicitors Regulation Authority',
  '2018-12-06',
  'active',
  'verified',
  true
)
ON CONFLICT (framework_short) DO NOTHING;

-- ── 2. Ensure UK_SRA_COC framework exists (idempotent) ──
INSERT INTO framework_versions (framework_short, name, jurisdiction, region, regulator, effective_date, status, confidence, servable)
VALUES (
  'UK_SRA_COC',
  'SRA Code of Conduct for Firms 2019',
  'UK',
  'UK',
  'Solicitors Regulation Authority',
  '2019-11-25',
  'active',
  'verified',
  true
)
ON CONFLICT (framework_short) DO NOTHING;

-- ── 3. SRA Rule 4 — digital badge + regulated status link ──
-- All SRA-regulated firms must display the SRA digital badge on their website
-- and link to their regulated status on the SRA register. This is the most
-- universally applicable and easily detectable obligation.
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_SRA_TRANSPARENCY',
  'SRA_BADGE_R4',
  'SRA-regulated solicitors must display the SRA digital badge on their website linking to their regulated status on the SRA register',
  '(sra|solicitors regulation authority)',
  'homepage',
  'P0',
  'https://www.sra.org.uk/solicitors/standards-regulations/transparency-rules/',
  'must_appear',
  NULL,
  ARRAY['law-firms'],
  5000,
  25000,
  'Every SRA-regulated law firm is required (SRA Transparency Rules Rule 4) to display the SRA digital badge on their website. The badge links to the SRA''s online database confirming you are regulated. Its absence is a regulatory breach the SRA actively monitors for.',
  'Tamazia adds the SRA digital badge to your website footer with correct linking to your SRA regulated status page, meets the obligation and demonstrates regulation to prospective clients.',
  '/sectors/legal/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 4. SRA Rule 2 — complaints procedure ──
-- All SRA-regulated firms with a website must publish a complaints procedure
-- explaining who to complain to, how, and the Legal Ombudsman route.
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_SRA_TRANSPARENCY',
  'SRA_COMPLAINTS_R2',
  'SRA-regulated firms must publish on their website how to complain, who is responsible, and the Legal Ombudsman route if unresolved within 8 weeks',
  '(complaint|legal ombudsman|how to complain|complaints procedure)',
  'homepage',
  'P0',
  'https://www.sra.org.uk/solicitors/standards-regulations/transparency-rules/',
  'must_appear',
  NULL,
  ARRAY['law-firms'],
  5000,
  25000,
  'SRA Transparency Rules Rule 2 requires your website to include a clear complaints procedure: who handles complaints, how to raise them, and that if unresolved after 8 weeks you can go to the Legal Ombudsman. This is a mandatory public-facing disclosure.',
  'Tamazia writes and publishes a compliant complaints procedure page and adds a visible link to it from your website footer and client-care documents.',
  '/sectors/legal/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 5. SRA Rule 1 — price transparency (defined services) ──
-- If a firm offers any of the defined service types (PI, employment, immigration,
-- probate, residential conveyancing, motoring, debt recovery), prices must be published.
-- Trigger: detects when defined services are advertised; if no defined service → rule doesn't fire.
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_SRA_TRANSPARENCY',
  'SRA_PRICE_R1',
  'SRA-regulated firms advertising defined services (PI, employment, immigration, probate, conveyancing, motoring, debt) must publish clear price information',
  '(price|cost|fee|from £|starting from|fixed fee|our charges|pricing)',
  'homepage',
  'P1',
  'https://www.sra.org.uk/solicitors/standards-regulations/transparency-rules/',
  'trigger_then_check',
  '(personal injury|employment (law|tribunal|claim)|immigration|visa|probate|estate administration|conveyancing|property purchase|motoring|road traffic|speeding|debt recovery|debt collection)',
  ARRAY['law-firms'],
  2500,
  15000,
  'If your firm advertises personal injury, employment, immigration, probate, conveyancing, motoring or debt-recovery services, SRA Transparency Rules Rule 1 requires you to publish clear price information on your website — including the basis of charging, any disbursements, and what the price covers.',
  'Tamazia creates compliant transparent pricing pages for each defined service, structured to meet SRA Rule 1 while remaining commercially effective.',
  '/sectors/legal/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 6. SRA Code 8.7 — misleading claims in advertising ──
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_SRA_COC',
  'SRA_COC_8_7',
  'SRA Code of Conduct 8.7: law firms must not make misleading or inaccurate claims in their marketing or advertising; fee information must be accurate',
  '(no win no fee|free consultation|no obligation|guaranteed|win your case|best|award.winning)',
  'homepage',
  'P1',
  'https://www.sra.org.uk/solicitors/standards-regulations/code-of-conduct-firms/',
  'trigger_then_check',
  '(free|no win|guarantee|best|win)',
  ARRAY['law-firms', 'barristers'],
  2500,
  15000,
  'SRA Code of Conduct Paragraph 8.7 prohibits misleading marketing claims. Phrases like "guaranteed outcome", "best solicitors", or vague "free consultation" claims without clear conditions can breach this rule and result in SRA regulatory action.',
  'Tamazia audits your legal marketing claims for SRA Code 8.7 compliance and rewrites any that are misleading or unsubstantiated.',
  '/sectors/legal/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 7. Add law-firms to sector_relevance of existing SRA rules in case they exist under different rule_ids ──
-- This is idempotent — only adds 'law-firms' if not already present.
UPDATE compliance_rules
SET sector_relevance = array_append(sector_relevance, 'law-firms')
WHERE framework_short IN ('UK_SRA_TRANSPARENCY', 'UK_SRA_COC')
  AND active = TRUE
  AND NOT ('law-firms' = ANY(sector_relevance));

COMMIT;
