'use strict';
// src/lib/compliance/registry/obligations.js — the canonical UNIVERSAL legal-obligation layer (V1 §5; SPEC §6.1; V3 UI).
// A 2D taxonomy: universal digital-compliance CONCEPTS × JURISDICTION -> the specific catalogue framework(s).
// One canonical definition per obligation (no duplication); each jurisdiction INSTANCES it. Frameworks are REFERENCED
// by short code (every code verified present in framework_versions, 2026-06-30; none invented). Deterministic detection
// FIRST (the trigger predicate the registry already produces + on-site signals), LLM only as documented fallback.
// Layering: universal concept (here) -> jurisdiction framework -> sector overlay (sector.js). No conflict, no duplication.
const OBLIGATIONS = {
  privacy_notice: {
    label: 'Public-facing privacy notice (purposes, lawful basis, data-subject rights, controller identity)',
    trigger_predicate: 'processes_personal_data',
    detect: { deterministic: ['/privacy or /privacy-policy reachable (200)', 'footer privacy link', 'any form collecting name/email/phone', 'newsletter/contact/account forms'], llm_fallback: 'policy completeness vs Art.13/14 elements' },
    evidence: 'a reachable privacy policy disclosing purposes + lawful basis + rights + controller/DPO identity',
    jurisdictions: { UK:['UK_GDPR_A13','UK_DPA_2018'], EU:['EU_GDPR'], US:['US_CCPA','US_CPRA','US_VCDPA','US_TDPSA'], AE:['UAE_PDPL'], SA:['SAUDI_PDPL'], QA:['QATAR_PDPPL'] },
    regulators: { UK:'ICO', EU:'national DPAs / EDPB', US:'state Attorneys General', AE:'UAE Data Office', SA:'SDAIA', QA:'NCGAA' },
    exclusions: ['no_personal_data_collected'],
    special_category_overlay: { EU:['EU_GDPR_ART9'] },
  },
  cookie_consent: {
    label: 'Prior consent for non-essential cookies/trackers + a consent mechanism with reject-all',
    trigger_predicate: 'sets_cookies',
    detect: { deterministic: ['non-essential trackers fire before consent (Playwright network)', 'no consent banner', '_ga/gtm/fbq/hotjar set on load', 'reject-all absent or less prominent than accept-all'], llm_fallback: null },
    evidence: 'trackers blocked until opt-in; a consent banner with an equally-prominent reject-all',
    jurisdictions: { UK:['UK_PECR','UK_ICO_COOKIES'], EU:['EU_EPRIVACY'] },
    regulators: { UK:'ICO', EU:'national DPAs' },
    exclusions: ['only_strictly_necessary_cookies'],
    note: 'US has no general cookie-consent mandate (notice + opt-out via state privacy instead).',
  },
  accessibility: {
    label: 'Website accessibility to WCAG 2.1 AA / EN 301 549 + an accessibility statement (EU)',
    trigger_predicate: 'public_facing_website',
    detect: { deterministic: ['axe-core / Pa11y / Lighthouse automated scan (catches ~30-57% of WCAG issues)', 'missing alt text', 'low contrast', 'no skip-link', 'EU: no accessibility statement'], llm_fallback: 'manual-review items automation cannot catch' },
    evidence: 'automated WCAG 2.1 AA scan results; EU also a published accessibility statement',
    jurisdictions: { EU:['EU_EAA_2025'], UK:['UK_EQUALITY_2010'], US:['US_ADA','US_ADA_WEB'] },
    regulators: { EU:'national market-surveillance authorities', UK:'EHRC (civil claims)', US:'DOJ + private Title III litigation' },
    exclusions: ['eu_microenterprise_services_under_10_employees_and_2m_turnover','legacy_archived_content'],
    standard: 'WCAG 2.1 AA (EN 301 549 v3.2.1; v4.1.1 -> WCAG 2.2 AA expected 2026)',
  },
  transparent_pricing: {
    label: 'Total price incl. mandatory fees shown at the invitation-to-purchase; no drip pricing',
    trigger_predicate: 'takes_payment',
    detect: { deterministic: ['price shown without a VAT/fees line', 'mandatory fees added only at checkout', 'countdown timers / fake urgency', 'subscription price without total payable'], llm_fallback: 'drip-pricing pattern across the funnel' },
    evidence: 'the displayed price equals the total payable at the invitation-to-purchase stage',
    jurisdictions: { UK:['UK_DMCC_2024','UK_CMA','UK_TRADING_STANDARDS'], EU:['EU_OMNIBUS'], US:['US_FTC'], AE:['UAE_CONSUMER'] },
    regulators: { UK:'CMA (direct fining from 6 Apr 2025)', EU:'national consumer authorities', US:'FTC', AE:'Ministry of Economy' },
    exclusions: ['b2b_only','no_online_pricing'],
  },
  fake_reviews: {
    label: 'No fake/incentivised reviews; disclose how reviews are verified',
    trigger_predicate: 'has_endorsements_or_affiliates',
    detect: { deterministic: ['on-site review widget present', 'testimonials without a verification disclosure', 'incentivised-review language'], llm_fallback: 'authenticity-disclosure assessment' },
    evidence: 'reviews shown with a verification statement; no banned fake-review practices',
    jurisdictions: { UK:['UK_DMCC_2024'], EU:['EU_OMNIBUS'], US:['US_FTC_FAKE_REVIEWS','US_FTC_ENDORSE'] },
    regulators: { UK:'CMA', EU:'national consumer authorities', US:'FTC' },
    exclusions: ['no_reviews_displayed'],
  },
  ai_transparency: {
    label: 'Disclosure of AI interaction (chatbot) + machine-readable marking of AI-generated content/deepfakes',
    trigger_predicate: 'uses_ai_chatbot_or_genai_content',
    detect: { deterministic: ['chatbot / live-chat widget', 'AI-generated content without disclosure', 'undisclosed automated decisioning'], llm_fallback: 'AI-content labelling assessment' },
    evidence: 'a clear AI-interaction disclosure; AI outputs marked',
    jurisdictions: { EU:['EU_AI_ACT'], US:['US_COLORADO_AI_ACT'] },
    regulators: { EU:'national AI authorities', US:'Colorado AG' },
    exclusions: ['no_ai_features'],
    status: { EU: 'pending — AI Act Art.50 transparency applies 2026-08-02' },
  },
  marketing_consent: {
    label: 'Lawful electronic marketing (consent / soft opt-in; opt-out; sender identity)',
    trigger_predicate: 'sends_marketing_email',
    detect: { deterministic: ['newsletter signup without a consent checkbox', 'pre-ticked consent', 'no unsubscribe link', 'SMS opt-in absent'], llm_fallback: null },
    evidence: 'consent / soft-opt-in capture; a working unsubscribe; sender identity + postal address (US)',
    jurisdictions: { UK:['UK_PECR','UK_ASA_CAP'], US:['US_CAN_SPAM','US_TCPA'] },
    regulators: { UK:'ICO / ASA', US:'FTC / FCC' },
    exclusions: ['no_electronic_marketing'],
    note: 'UK/EU = consent / soft opt-in; US CAN-SPAM = opt-OUT (a different model — do not conflate).',
  },
  company_identity: {
    label: 'Registered company identity shown on the website (UK: name, number, registered office)',
    trigger_predicate: 'is_uk_registered_entity',
    detect: { deterministic: ['no company number in footer/legal page', 'no registered office', 'Ltd/LLP/PLC named without registration details'], llm_fallback: null },
    evidence: 'company name, registration number and registered office shown (Companies Act 2006 s.82; SI 2008/495)',
    jurisdictions: { UK:['UK_COMPANIES_ACT'] },
    regulators: { UK:'Companies House' },
    exclusions: ['sole_trader_or_partnership','non_uk_entity'],
  },
};
// resolver: given a firm's jurisdiction codes, which obligations apply and which catalogue frameworks instance them.
function obligationFrameworks(jurisdictionCodes = []) {
  const norm = c => { c=String(c||'').toUpperCase(); if(c.startsWith('MENA-AE'))return 'AE'; if(c.startsWith('MENA-SA'))return 'SA'; if(c.startsWith('MENA-QA'))return 'QA'; if(c==='USA')return 'US'; if(c==='GB'||c==='GBR')return 'UK'; if(c==='UAE')return 'AE'; return c; };
  const jurs = new Set(jurisdictionCodes.map(norm));
  const out = {};
  for (const [concept, o] of Object.entries(OBLIGATIONS)) {
    const fws = new Set();
    for (const [j, codes] of Object.entries(o.jurisdictions)) if (jurs.has(j)) codes.forEach(f=>fws.add(f));
    if (fws.size) out[concept] = { trigger_predicate:o.trigger_predicate, frameworks:[...fws], evidence:o.evidence, status:o.status||null };
  }
  return out;
}
const ALL_REFERENCED = [...new Set(
  Object.values(OBLIGATIONS).flatMap(o => Object.values(o.jurisdictions).flat()
    .concat(Object.values(o.special_category_overlay||{}).flat()))
)].sort();
const TRIGGER_PREDICATES = [...new Set(Object.values(OBLIGATIONS).map(o=>o.trigger_predicate))];
module.exports = { OBLIGATIONS, obligationFrameworks, ALL_REFERENCED, TRIGGER_PREDICATES };
