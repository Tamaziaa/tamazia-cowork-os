'use strict';
// RC-2 (E17) — JURISDICTION IS AN EVIDENCE MATRIX, NOT A THRESHOLD.
// The old detector called a market "strong" at any signals summing to >= 3, so "DIFC" named in advisory prose (2)
// plus the word "Dubai" (1) minted a PHANTOM UAE market for Kingsley Napley, a London-only firm — and a phantom
// jurisdiction attaches phantom law to a client's legal report.
// A jurisdiction now attaches ONLY on: one Tier-A signal, OR two INDEPENDENT Tier-B signals. Tier-C never attaches.
const assert = require('assert');
const mk = require('../src/lib/sourcing/markets.js');

const row = (m, c) => (m.jurisdiction_evidence || []).find((j) => j.country === c) || null;

// ── 1. THE KINGSLEY NAPLEY PHANTOM: Tier-C marketing prose alone must NOT attach a UAE jurisdiction ──
{
  const html = `<html><body>
    <h2>Middle East</h2>
    <p>We advise clients across the UAE and throughout the Middle East on extradition, and we appear in DIFC disputes.</p>
    <p>Our Dubai case studies are available on request.</p>
    <p>Authorised and regulated by the Solicitors Regulation Authority, SRA number 500204.</p>
    <p>Registered office: Knights Quarter, 14 St Johns Lane, London EC1M 4AJ. Tel +44 20 7814 1200.</p>
  </body></html>`;
  const m = mk.detectMarkets({ html, domain: 'kingsleynapley.co.uk' });
  assert(!m.bound.includes('United Arab Emirates'), 'PHANTOM: marketing prose about the UAE must not bind UAE law');
  assert(!m.operating_countries.includes('United Arab Emirates'), 'and it must not leak through the legacy field either');
  assert(!m.strong_markets.includes('United Arab Emirates'), 'nor through strong_markets (what the router reads)');
  assert(!m.regions.includes('Middle East'), 'no Middle East region on a London-only firm');
  // ...but the marketing reach is still recorded, separately (E-228: serves != bound)
  assert(m.serves.includes('United Arab Emirates'), 'the firm DOES market to the UAE — that is `serves`, not `bound`');
  const uae = row(m, 'United Arab Emirates');
  assert.strictEqual(uae.tier, 'C', 'UAE evidence is Tier-C only');
  assert.strictEqual(uae.bound, false);
  assert(uae.signals.every((s) => s.tier === 'C'), 'a named regulator with no authorisation verb is advisory prose, not nexus');
  assert(uae.signals.some((s) => s.type === 'regulator_named_in_prose'), '"DIFC" in prose is recorded — and it is Tier C');
  // the UK, meanwhile, attaches on Tier-A and SHOWS why
  const uk = row(m, 'United Kingdom');
  assert.strictEqual(uk.bound, true);
  assert.strictEqual(uk.tier, 'A');
  assert.strictEqual(uk.attached_by, 'tier_a_dispositive');
  assert(uk.signals.some((s) => s.type === 'regulator_authorisation' && /Solicitors Regulation Authority/i.test(s.quote)), 'the SRA authorisation statement is quoted verbatim as the reason');
}

// ── 2. ONE Tier-A signal DOES attach ────────────────────────────────────────────────────────────
{
  // regulator authorisation, alone, on a .com with no other UAE signal
  const m = mk.detectMarkets({ html: '<p>Regulated by the DFSA. We are a boutique advisory practice.</p>', domain: 'example.com' });
  const uae = row(m, 'United Arab Emirates');
  assert.strictEqual(uae.tier, 'A', 'a DFSA authorisation statement is dispositive');
  assert(m.bound.includes('United Arab Emirates'), 'one Tier-A signal attaches the jurisdiction');
  assert.strictEqual(uae.attached_by, 'tier_a_dispositive');
  assert.strictEqual(uae.signals.filter((s) => s.tier === 'B').length, 0, 'and it needed no Tier-B corroboration');
}
{
  // s.82 trading-disclosure block, alone
  const m = mk.detectMarkets({ html: '<footer>Registered office: 1 Fleet Place, London EC4M 7RD. Registered in England and Wales no. 01234567.</footer>', domain: 'example.com' });
  assert(m.bound.includes('United Kingdom'), 'a registered office in a s.82 disclosure block is Tier-A');
  assert.strictEqual(row(m, 'United Kingdom').tier, 'A');
}
{
  // an official register entry (Companies House), folded in after the keyless scan
  const base = mk.detectMarkets({ html: '<p>Nothing to see here.</p>', domain: 'example.com' });
  assert(!base.bound.includes('United Kingdom'), 'no signals -> no jurisdiction');
  const m = mk.attachRegisterEvidence(base, { country: 'United Kingdom', register: 'Companies House', name: 'ACME LIMITED', number: '01234567', url: 'https://find-and-update.company-information.service.gov.uk/company/01234567' });
  assert(m.bound.includes('United Kingdom'), 'a confirmed Companies House record is a Tier-A register entry');
  const uk = row(m, 'United Kingdom');
  assert.strictEqual(uk.tier, 'A');
  assert(uk.signals.some((s) => s.type === 'register_entry' && /01234567/.test(s.quote) && s.url), 'the register row carries its official source URL');
  assert(m.regions.includes('UK'), 'and the region follows');
}

// ── 3. TWO INDEPENDENT Tier-B signals DO attach ─────────────────────────────────────────────────
{
  // ccTLD (B) + local dialling code (B) — two DIFFERENT signal types
  const m = mk.detectMarkets({ html: '<p>Speak to our team on +971 4 123 4567.</p>', domain: 'lawyerdubai.ae' });
  const uae = row(m, 'United Arab Emirates');
  assert(m.bound.includes('United Arab Emirates'), 'two independent Tier-B signals attach');
  assert.strictEqual(uae.attached_by, 'two_independent_tier_b');
  assert(uae.independent_tier_b >= 2, 'and the count of INDEPENDENT Tier-B types is recorded');
  assert.strictEqual(uae.tier, 'B');
}
{
  // stated office (B) + postcode-bearing address (B) for a .com UK firm
  const m = mk.detectMarkets({ html: '<p>Our head office is in Leeds. Visit us at 12 Park Row, Leeds LS1 5HD.</p>', domain: 'example.com' });
  assert(m.bound.includes('United Kingdom'), 'stated office + country-valid postcode = two independent Tier-B');
  assert.strictEqual(row(m, 'United Kingdom').attached_by, 'two_independent_tier_b');
}

// ── 4. ONE Tier-B signal ALONE does NOT attach ──────────────────────────────────────────────────
{
  const m = mk.detectMarkets({ html: '<p>Call +971 4 123 4567</p>', domain: 'example.com' });
  const uae = row(m, 'United Arab Emirates');
  assert(!m.bound.includes('United Arab Emirates'), 'a lone dialling code is not a legal nexus');
  assert.strictEqual(uae.bound, false);
  assert.strictEqual(uae.independent_tier_b, 1, 'one Tier-B type is not two');
  assert(!m.strong_markets.includes('United Arab Emirates'), 'and nothing leaks into the router via strong_markets');
}
{
  // the same Tier-B type twice (two phone numbers) is still ONE independent signal
  const m = mk.detectMarkets({ html: '<p>Call +971 4 123 4567 or +971 4 765 4321</p>', domain: 'example.com' });
  assert(!m.bound.includes('United Arab Emirates'), 'repeating one signal type does not manufacture independence');
  assert.strictEqual(row(m, 'United Arab Emirates').independent_tier_b, 1);
}

// ── 5. Tier-C can never accumulate its way in, however loud it is ───────────────────────────────
{
  const loud = '<p>' + 'We advise clients across the UAE. Our Dubai practice is renowned. See our Abu Dhabi case study. '.repeat(20) + '</p>';
  const m = mk.detectMarkets({ html: loud, domain: 'example.com' });
  assert(!m.bound.includes('United Arab Emirates'), 'twenty repetitions of Tier-C prose is still Tier-C');
  assert.strictEqual(row(m, 'United Arab Emirates').tier, 'C');
}
{
  // a lawyer's bar admission abroad is Tier-C: it is the LAWYER's qualification, not the FIRM's legal seat
  const m = mk.detectMarkets({ html: '<p>Jane Doe was admitted to the bar in New York and is qualified in France.</p>', domain: 'example.co.uk' });
  assert(!m.bound.includes('United States'), 'a bar admission does not bind the firm to US law');
  assert(!m.bound.includes('France'), 'nor to French law');
}

// ── 6. serves and bound stay SEPARATE, and the evidence travels with the verdict ────────────────
{
  const html = `<html><head><link rel="alternate" hreflang="de-de" href="/de/"></head><body>
    <p>Preise ab 200 EUR. Our German office: Friedrichstrasse 10, 10117 Berlin, Germany. Tel +49 30 123456.</p>
    <p>We also work with clients throughout Australia.</p></body></html>`;
  const m = mk.detectMarkets({ html, domain: 'example.com' });
  assert(m.bound.includes('Germany'), 'Germany has several independent Tier-B signals');
  assert(!m.bound.includes('Australia'), 'Australia is marketing prose only');
  assert(m.serves.includes('Australia'), 'and it is reported as SERVED, not BOUND');
  assert(m.serves_eu === true, 'an EU member with real nexus puts the firm in scope of EU law');
  const de = row(m, 'Germany');
  assert(de.signals.length >= 2 && de.signals.every((s) => s.quote), 'every attaching signal ships a quote the audit can show the client');
  assert(de.signals.some((s) => s.type === 'hreflang'), 'the site declared a German locale itself');
}

// ── 7. Backward compatibility: the shape the rest of the engine reads is intact ─────────────────
{
  const m = mk.detectMarkets({ html: '<p>Registered office: 1 Fleet Place, London EC4M 7RD.</p>', domain: 'x.co.uk' });
  for (const k of ['regions', 'strong_markets', 'currencies', 'confidence', 'operating_countries', 'eu_countries', 'serves_eu', 'cities', 'primary_city', 'evidence', 'international']) {
    assert(Object.prototype.hasOwnProperty.call(m, k), 'legacy field preserved: ' + k);
  }
  assert(Array.isArray(m.strong_markets) && Array.isArray(m.regions) && Array.isArray(m.currencies));
  assert(typeof m.confidence === 'object' && m.confidence !== null);
  // detectMarkets is still callable with the old two-arg object (no `registers`)
  assert.doesNotThrow(() => mk.detectMarkets({ html: '', domain: '' }));
  assert.deepStrictEqual(mk.detectMarkets({ html: '', domain: '' }).bound, [], 'empty page binds nothing');
}

console.log('RC-2 jurisdiction-matrix: OK');
