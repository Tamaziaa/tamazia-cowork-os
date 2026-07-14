// NEXUS ANCHORING — the ghost-jurisdiction class.
//
// THE BUG (live, v25.11, mills-reeve/0IewxjkR):
//   detectMarkets() said  US: { tier:'C', bound:false }  <- one nav-menu mention: "M&R Global | USA and Canada"
//   detectNexus()  said   USA: { established_in:true }   <- it matched /incorporated in/ inside
//                                                            "incorporated in ENGLAND AND WALES"
//   The ghost-family filter trusts detectNexus. So US_ABA_MODEL_RULES, US_ABA_SPECIALIST, US_ADA and
//   US_ATTORNEY_ADVERTISING attached to a UK law firm — 4 of its 8 compliance findings.
//
// markets.js states the contract in its own return statement:
//     bound,   // NEW: legal nexus — the ONLY set that may attach frameworks
//
// RULE: an establishment regex that does not NAME the country it claims to prove is not evidence.
// SAFE BY CONSTRUCTION: this can only tighten FOREIGN attachment — the registered country is injected as
// establishment unconditionally (E-228), so no firm can lose its home jurisdiction.
const assert = require('assert');
const { NEXUS_PROFILE } = require('../src/lib/compliance/signals.js');

const FOOTERS = {
  'Mills & Reeve (UK)': 'Mills & Reeve LLP is a limited liability partnership incorporated in England and Wales. Company number OC326013. Our office in Cambridge.',
  'Birketts (UK)':      'Birketts LLP is a limited liability partnership registered in England and Wales. SRA Registration No: 441849.',
  'Russell-Cooke (UK)': 'Russell-Cooke LLP is incorporated in England and Wales, registered office 2 Putney Hill, London.',
  'Freeths (UK)':       'Freeths LLP, incorporated in England and Wales with registered number OC304688.',
  'Al Tamimi (UAE)':    'Al Tamimi & Company. Our offices in Dubai and Abu Dhabi. We advise clients on US LLC formation and Delaware incorporation.',
  'Franklin (FR)':      'Cabinet Franklin, based in France. Our office in Paris. Inscrit au Barreau de Paris.',
};
const HOME = { 'Mills & Reeve (UK)':'UK','Birketts (UK)':'UK','Russell-Cooke (UK)':'UK','Freeths (UK)':'UK','Al Tamimi (UAE)':'AE','Franklin (FR)':'EU' };

describe('nexus anchoring — a foreign legal regime needs country-anchored evidence', () => {
  it('no UK/EU/UAE firm is ever judged ESTABLISHED IN THE UNITED STATES', () => {
    const ghosts = [];
    for (const [firm, footer] of Object.entries(FOOTERS)) {
      if (HOME[firm] === 'USA') continue;
      const m = footer.match(NEXUS_PROFILE.USA.estab);
      if (m) ghosts.push(firm + ' -> US establishment via ' + JSON.stringify(m[0]));
    }
    assert.deepStrictEqual(ghosts, [],
      'A non-US firm was judged established in the United States:\n  ' + ghosts.join('\n  ') +
      '\nThat attaches ABA professional-conduct rules, the ADA and US attorney-advertising law to a foreign firm.');
  });

  it('"our office" alone does not establish a firm in the United Kingdom', () => {
    assert.ok(!NEXUS_PROFILE.UK.estab.test('Our office in Palo Alto, California.'),
      '"Our office in Palo Alto" was read as establishment in the UNITED KINGDOM');
    assert.ok(!NEXUS_PROFILE.UK.estab.test('Cooley LLP. Our office is open Monday to Friday.'),
      'A bare "our office" was read as UK establishment');
  });

  it('a bare corporate suffix (LLC / Inc / Ltd) is not proof of establishment anywhere', () => {
    assert.ok(!NEXUS_PROFILE.USA.estab.test('The firm advises on LLC formation and Inc. structures.'),
      'An ARTICLE ABOUT US company forms was read as US establishment');
    assert.ok(!NEXUS_PROFILE.UK.estab.test('Tata Consultancy Services Ltd, Mumbai.'),
      'An Indian "Ltd" was read as UK establishment');
  });

  it('each firm STILL proves establishment in its own home jurisdiction (no over-correction)', () => {
    for (const [firm, footer] of Object.entries(FOOTERS)) {
      const fam = HOME[firm];
      assert.ok(NEXUS_PROFILE[fam].estab.test(footer),
        firm + ' no longer proves establishment in its OWN jurisdiction (' + fam + ') — the fix went too far');
    }
  });

  it('a genuine US firm IS still judged established in the US', () => {
    assert.ok(NEXUS_PROFILE.USA.estab.test('Cooley LLP is headquartered in the United States.'));
    assert.ok(NEXUS_PROFILE.USA.estab.test('Acme Corp, incorporated in Delaware.'));
    assert.ok(NEXUS_PROFILE.USA.estab.test('Registered in New York.'));
    assert.ok(NEXUS_PROFILE.USA.estab.test('Our office in Palo Alto, California.'));
  });

  it('EVERY alternative in EVERY estab regex names a country/state/city/registrar of its own family', () => {
    // THE STRUCTURAL RULE. Read each alternative as PROSE (strip regex metachars) and demand it names its family.
    const ANCHORS = {
      UK:  /england|wales|scotland|northern ireland|companies house|\buk\b|united kingdom|london|manchester|birmingham|edinburgh|glasgow|leeds|bristol|cambridge|norwich|oxford/i,
      EU:  /\beu\b|europe|germany|france|spain|italy|netherlands|ireland|belgium|austria|portugal|poland|sweden|denmark|finland|luxembourg|berlin|munich|frankfurt|paris|madrid|rome|milan|amsterdam|dublin|brussels|vienna|lisbon|warsaw|stockholm|copenhagen|helsinki/i,
      USA: /delaware|nevada|california|new york|texas|florida|illinois|massachusetts|washington|chicago|boston|palo alto|san francisco|los angeles|united states|\busa?\b|ein/i,
      AE:  /uae|dubai|abu dhabi|sharjah|difc|adgm|dmcc|jafza|\bded\b|emirates|trn/i,
    };
    const asProse = (a) => a.replace(/\(\?#[^)]*\)/g, ' ').replace(/\\[bswdBSWD]/g, ' ');
    for (const [fam, prof] of Object.entries(NEXUS_PROFILE)) {
      const alts = prof.estab.source.split(/\|(?![^(]*\))/).map(asProse)
        .filter((a) => a.replace(/[^a-z0-9]/gi, '').length > 1);
      for (const alt of alts) {
        assert.ok(ANCHORS[fam].test(alt),
          fam + '.estab has an UNANCHORED alternative: /' + alt + '/\n' +
          '  It claims to prove establishment in ' + fam + ' without naming ' + fam + '.\n' +
          '  This is how "incorporated in England and Wales" proved establishment in the UNITED STATES.');
      }
    }
  });
});
