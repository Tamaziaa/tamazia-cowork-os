'use strict';
// registry/nexus.js — the CANONICAL nexus dimension (Master Framework §7.1; SPEC §5.3 rule 2; Cowork Bible §5 Cat.3;
// GDPR Art 3 + EDPB Guidelines 3/2018). A law attaches to a firm in a jurisdiction only when at least one of its
// REQUIRED nexus relations genuinely holds — never on bare membership. This module is the SSOT for the three typed
// relations, the EDPB targeting-signal lists used to DETECT each from a website, and the per-category required_nexus
// defaults. Additive: no consumer yet (connect.js GATE A will read it), so it changes no behaviour today.

// The three relations (GDPR Art 3(1) / 3(2)(a) / 3(2)(b)).
const NEXUS_TYPES = Object.freeze(['established_in', 'serves_customers_in', 'processes_residents_of']);

// EDPB targeting-signal templates. Detection is a COMBINATION of factors; negatives are NEVER sufficient alone.
// The detector in signals.js consumes these per jurisdiction J (with J's language/currency/ccTLD substituted).
const EDPB_SIGNALS = Object.freeze({
  established_in: {
    positive: ['registered office / incorporation in J', 'company/registration number issued in J',
               'physical J address on contact page', 'native J regulator number (SRA/FCA/CQC/DIFC/ADGM licence)',
               'J ccTLD as the primary domain with a J address'],
    negative_guards: ['service-offer phrasing ("we help you set up in J") is NOT establishment']
  },
  serves_customers_in: { // GDPR Art 3(2)(a) — require >=2 corroborating factors
    positive: ["J currency in prices", "J language not used in home country", 'ships/delivers to J',
               'names J customers/clientele', 'J-targeted marketing', 'international phone with J country code',
               'J ccTLD'],
    min_factors: 2,
    negative_guards: ['mere accessibility from J', 'bare email/address without international code', 'incidental English on a non-EN home site']
  },
  processes_residents_of: { // GDPR Art 3(2)(b) — tracking AND a J nexus
    positive: ['tracking/profiling (cookies, analytics, behavioural ads, geolocation)'],
    requires_also: ['serves_customers_in[J] OR an explicit J-audience statement'],
    negative_guards: ['a purely-local firm with generic Analytics does NOT process every jurisdiction']
  }
});

// Per-category required_nexus defaults (any_of). Privacy/universal = all three; establishment/registration/corporate/
// free-zone = established_in only; consumer = serves_customers_in; monitoring = processes_residents_of.
const CATEGORY_REQUIRED_NEXUS = Object.freeze({
  privacy:        ['established_in', 'serves_customers_in', 'processes_residents_of'],
  data_protection:['established_in', 'serves_customers_in', 'processes_residents_of'],
  universal:      ['established_in', 'serves_customers_in', 'processes_residents_of'],
  establishment:  ['established_in'],
  registration:   ['established_in'],
  corporate:      ['established_in'],
  free_zone:      ['established_in'],
  consumer:       ['serves_customers_in'],
  advertising:    ['serves_customers_in'],
  monitoring:     ['processes_residents_of']
});

function requiredNexusFor(category) {
  const set = CATEGORY_REQUIRED_NEXUS[String(category || '').toLowerCase()];
  return { any_of: (set || NEXUS_TYPES).slice() }; // safe default = all three (fail toward the privacy baseline)
}

// Does the firm's nexus map for a jurisdiction satisfy a framework's required_nexus? (pure any_of match)
function nexusHolds(required, nexusMapForJurisdiction) {
  if (!required || !Array.isArray(required.any_of)) return false;
  const nx = nexusMapForJurisdiction || {};
  return required.any_of.some(t => nx[t] === true);
}

const CATEGORIES = Object.freeze(Object.keys(CATEGORY_REQUIRED_NEXUS));
module.exports = { NEXUS_TYPES, EDPB_SIGNALS, CATEGORY_REQUIRED_NEXUS, CATEGORIES, requiredNexusFor, nexusHolds };
