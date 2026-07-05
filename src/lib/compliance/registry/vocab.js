'use strict';
// registry/vocab.js — the ONE home for every controlled vocabulary the tagged-law schema uses (Master Framework §7.3;
// Plan 1.2.1). Anti-duplication rule: where a vocabulary already has an SSOT, this file REFERENCES it (nexus types from
// registry/nexus.js; binding-status from registry/framework-intel.js) and only DEFINES the genuinely new enums.
// Fields traced to standards: obligation_type=LegalRuleML deontics; evidence_type=SPEC §5.1 + OSCAL; instrument_type=LKIF
// Legal_Source; in_force_status=ELI; penalty_basis + action_type=GRC/SEC/GDPR-Enforcement-Tracker.
const { NEXUS_TYPES } = require('./nexus.js');
const { BINDING } = require('./framework-intel.js');

const VOCAB = Object.freeze({
  nexus_type:      NEXUS_TYPES,                 // SSOT = nexus.js (referenced, not duplicated)
  binding_status:  Object.values(BINDING),      // SSOT = framework-intel.js (statute/statutory_code/regulator_code/professional_code/statutory_redress/voluntary_code)
  in_force_status: ['in_force', 'not_in_force', 'partially_in_force'],                                   // ELI
  obligation_type: ['obligation', 'prohibition', 'permission', 'right'],                                 // LegalRuleML deontic
  evidence_type:   ['on_page_quote', 'element_present', 'element_absent', 'external_register',           // SPEC §5.1 + OSCAL parts
                    'header_response', 'cookie_behaviour', 'link_present', 'disclosure_text',
                    'record_kept', 'consent_mechanism', 'contact_channel'],
  instrument_type: ['statute', 'regulation', 'directive', 'code', 'decree', 'guidance',                  // LKIF Legal_Source
                    'mandatory_precedent', 'persuasive_precedent', 'international_agreement', 'non_binding_agreement'],
  penalty_basis:   ['fixed', 'per_violation', 'per_day', 'pct_turnover', 'per_record', 'imprisonment', 'injunction'],
  action_type:     ['admin_penalty', 'litigation', 'resolution_agreement', 'injunction', 'warning']      // enforcement precedent
});
const VOCAB_NAMES = Object.keys(VOCAB);
function isValid(vocabName, term) { const set = VOCAB[vocabName]; return Array.isArray(set) && set.includes(term); }
function terms(vocabName) { return (VOCAB[vocabName] || []).slice(); }
module.exports = { VOCAB, VOCAB_NAMES, isValid, terms };
