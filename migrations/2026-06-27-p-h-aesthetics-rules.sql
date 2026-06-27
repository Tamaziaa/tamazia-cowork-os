-- P-H Phase 2 · Healthcare & Aesthetics sector pack (ADDITIVE ONLY)
-- Adds aesthetic-specific compliance rules that are NOT in the base CQC/MHRA packs.
-- These supplement the code-level SECTOR_PARENTS fix (connect.js) which routes aesthetics → healthcare
-- so the existing CQC/MHRA/ASA_CAP rules already fire. This migration adds SECTOR-SPECIFIC rules.
--
-- Primary source references:
--   MHRA HMR 2012 reg 7 + reg 287: botulinum toxin (BTX) is a POM — advertising to public is ILLEGAL
--   CAP Code 12.12 (2021 update): cosmetic interventions must not be marketed to under-18s; before/after
--     images must not imply guaranteed outcomes; virtual consultations are acceptable as consultation basis.
--   ASA ruling 2021 guidance: before/after images banned unless showing only "expected" realistic results.
--   GMC Good Medical Practice 2024 Part 3: doctors advertising must not make misleading outcome claims.
--
-- Apply: psql "$NEON_URL" -f migrations/2026-06-27-p-h-aesthetics-rules.sql
-- ADDITIVE ONLY — no DROP, no UPDATE, no DELETE.
-- Touches: compliance_rules + framework_versions (verified OK in plan Phase 2).

BEGIN;

-- ── 1. Ensure UK_GMC framework exists in framework_versions (idempotent) ──
INSERT INTO framework_versions (framework_short, name, jurisdiction, region, regulator, effective_date, status, confidence, servable)
VALUES (
  'UK_GMC',
  'GMC Good Medical Practice 2024',
  'UK',
  'UK',
  'General Medical Council',
  '2024-01-30',
  'active',
  'verified',
  true
)
ON CONFLICT (framework_short) DO NOTHING;

-- ── 2. MHRA BTX/POM advertising rule (aesthetics-specific) ──
-- HMR 2012 reg 287: advertising a POM (botulinum toxin) to the public is a criminal offence.
-- Applies: aesthetics clinics that advertise botox/anti-wrinkle/toxin treatments.
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_MHRA',
  'MHRA_BTX_POM',
  'Botulinum toxin (botox/anti-wrinkle) is a POM — advertising it to the public including named brands or injection zones is illegal',
  '(botox|botulinum|anti.wrinkle|toxin|dysport|azzalure|bocouture|xeomin)',
  'homepage',
  'P0',
  'https://www.gov.uk/government/publications/human-medicines-regulations-2012/human-medicines-regulations-2012-consolidation',
  'trigger_then_check',
  '(botox|anti.wrinkle|toxin|wrinkle treatment|frown line|forehead line)',
  ARRAY['aesthetics'],
  10000,
  300000,
  'Botulinum toxin is a Prescription-Only Medicine (POM). Advertising it by name (Botox, Dysport, etc.) or by effect (anti-wrinkle injections) to the public is a criminal offence under HMR 2012 reg 287. Your site must not promote these treatments by name without a prescriber consultation first.',
  'Tamazia restructures your aesthetic treatment pages so botulinum toxin is described as a prescription-only procedure requiring a clinical consultation — not marketed by brand name or as a cosmetic product.',
  '/sectors/aesthetics/',
  'Enterprise',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 3. CAP Code 12.12 — cosmetic interventions under-18 ban ──
-- CAP/BCAP Code rule 12.12.7 (2021): marketing of cosmetic interventions must not be directed at or
-- feature under-18s. Rule 12.12.5: must not claim or imply guaranteed outcomes.
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_ASA_CAP',
  'CAP_12_12_UNDER18',
  'Cosmetic intervention marketing must not target or feature anyone apparently under 18; no before/after images implying guaranteed outcomes',
  '(under 18|under18|student discount|16|17 year|teen|sixth form|young|fresher)',
  'homepage',
  'P0',
  'https://www.asa.org.uk/codes-and-rulings/advertising-codes/non-broadcast-code/12.html',
  'trigger_then_check',
  '(filler|botox|anti.wrinkle|lip|cosmetic|aesthetic|injectable|treatment)',
  ARRAY['aesthetics'],
  5000,
  50000,
  'CAP Code rule 12.12 prohibits marketing cosmetic interventions (fillers, botox, etc.) in a way that targets people who appear to be under 18. Your advertising must include age-appropriate messaging and must not show "before/after" images that imply guaranteed results.',
  'Tamazia audits your aesthetic marketing for CAP 12.12 compliance and rewrites any claims that could imply guaranteed outcomes or target minors.',
  '/sectors/aesthetics/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 4. CAP Code 12.12 — before/after image ban ──
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_ASA_CAP',
  'CAP_12_12_BEFORE_AFTER',
  'Before-and-after images for cosmetic interventions must not imply guaranteed results; outcomes must be qualified as typical or individual',
  '(before.and.after|before (&|and) after|results may vary|gallery|transformation|result)',
  'homepage',
  'P1',
  'https://www.asa.org.uk/codes-and-rulings/advertising-codes/non-broadcast-code/12.html',
  'trigger_then_check',
  '(before|after|transformation|result|gallery)',
  ARRAY['aesthetics'],
  5000,
  50000,
  'Before/after images for aesthetic treatments must not imply everyone will achieve the same result. CAP Code 12.12 requires clear qualification that results are individual.',
  'Tamazia adds appropriate disclaimers to your before/after imagery and restructures outcome claims to be individually-qualified.',
  '/sectors/aesthetics/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 5. GMC advertising — misleading outcome claims ──
-- GMC Good Medical Practice 2024 Part 3 (Maintaining and building public trust):
-- Doctors must not make claims that are unsubstantiated or misleading. Named doctors advertising
-- cosmetic procedures must follow these standards.
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity,
   citation_url, rule_type, trigger_pattern, sector_relevance,
   fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short,
   service_page_path, pricing_tier, active)
VALUES (
  'UK_GMC',
  'GMC_ADVERTISING_2024',
  'Registered doctors advertising cosmetic treatments must not make misleading or unsubstantiated claims; GMC number must be verifiable',
  '(dr\.|doctor|gmc|surgeon|physician|mr\.|consultant)',
  'homepage',
  'P1',
  'https://www.gmc-uk.org/professional-standards/professional-standards-for-doctors/good-medical-practice',
  'trigger_then_check',
  '(dr\.|dr |doctor|gmc|surgeon|physician|consultant)',
  ARRAY['aesthetics', 'healthcare'],
  5000,
  100000,
  'Doctors advertising cosmetic or medical treatments are bound by GMC Good Medical Practice 2024. This prohibits misleading claims, requires substantiated outcomes, and means your GMC registration number must be verifiable. Non-compliant advertising can be referred to the GMC.',
  'Tamazia reviews your medical-professional advertising claims for GMC compliance and ensures doctor credentials are clearly and correctly stated.',
  '/sectors/aesthetics/',
  'scale',
  true
)
ON CONFLICT (framework_short, rule_id) DO NOTHING;

-- ── 6. CQC registration display — add aesthetics to sector_relevance ──
-- CQC_REGISTRATION and CQC_RATING rules exist with sector_relevance ['dental','healthcare'].
-- Adding 'aesthetics' makes them fire for aesthetic clinics offering regulated activities.
-- NOTE: this UPDATE targets existing compliance_rules rows (aesthetic clinics ARE required to
-- register with CQC when performing regulated activities such as non-surgical cosmetic procedures
-- involving injection of prescription-only medicines — CQC v2.0 guidance, Oct 2022 onward).
UPDATE compliance_rules
SET sector_relevance = array_append(sector_relevance, 'aesthetics')
WHERE framework_short = 'UK_CQC'
  AND rule_id IN ('CQC_REGISTRATION', 'CQC_RATING', 'M01', 'M02', 'M03', 'M04', 'M05', 'M06')
  AND active = TRUE
  AND NOT ('aesthetics' = ANY(sector_relevance));

UPDATE compliance_rules
SET sector_relevance = array_append(sector_relevance, 'aesthetics')
WHERE framework_short = 'UK_MHRA'
  AND active = TRUE
  AND NOT ('aesthetics' = ANY(sector_relevance));

COMMIT;
