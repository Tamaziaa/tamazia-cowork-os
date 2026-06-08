#!/usr/bin/env node
'use strict';
// WS-B2 unit test — proves the word-index flags EVERY offending line on EVERY page (blogs included), not just the
// first. node scripts/migrations/test-corpus-index.js
const path = require('path');
const { buildCorpusIndex, scanRuleGlobal, locateSegment, splitSentences, mightMatch, _stripText } =
  require(path.resolve(__dirname, '..', '..', 'src', 'skills', 'S008-personalisation-engine', 'scanners', 'corpus-index.js'));
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + (d || '')}`); };

// 15-page site. The prohibited phrase "miracle cure for cancer" appears ONLY on page 13 (a deep blog post) AND
// once in a homepage footer line. The legacy first-hit matcher would report at most one; the index must find both.
const corpus = [];
corpus.push({ url: 'https://x.com/', body: '<header>Home Menu About</header><p>We are a trusted clinic helping patients across the country every single day.</p><footer>Some say our remedy is a miracle cure for cancer according to one happy reviewer.</footer>' });
for (let i = 1; i < 13; i++) corpus.push({ url: 'https://x.com/page' + i, body: '<p>This is ordinary marketing copy on page ' + i + ' that talks about our services and our friendly team members.</p>' });
corpus.push({ url: 'https://x.com/blog/old-post', body: '<article><h1>Our 2019 Story</h1><p>In this older blog article we claimed our therapy was a miracle cure for cancer which we no longer say today.</p></article>' });
corpus.push({ url: 'https://x.com/contact', body: '<p>Contact us at our London office to book an appointment with one of our specialists.</p>' });

const index = buildCorpusIndex(corpus);
ok('A1 index built over all 15 pages', index.segments.length > 15 && !index.capped, `segments=${index.segments.length}`);

const occ = scanRuleGlobal(/miracle cure for cancer/i, index, { proseOnly: true });
const urls = [...new Set(occ.map(o => o.url))];
ok('A2 prohibited phrase found on >=2 distinct pages (Defect A fixed)', urls.length >= 2, JSON.stringify(urls));
ok('A3 the DEEP blog post (page 13) is flagged, not just the homepage', urls.includes('https://x.com/blog/old-post'), JSON.stringify(urls));
ok('A4 each occurrence carries a verbatim line (not a template)', occ.every(o => /miracle cure for cancer/i.test(o.line)), JSON.stringify(occ[0]));
ok('A5 occurrence carries page URL + line index', occ.every(o => o.url && Number.isInteger(o.line_index)));

// offset→segment mapping
const mid = index.segments[Math.floor(index.segments.length / 2)];
const seg = locateSegment(index.segments, mid.gStart);
ok('B1 locateSegment maps an offset back to its segment', seg && seg.url === mid.url && seg.text === mid.text);
ok('B2 locateSegment returns null for out-of-range offset', locateSegment(index.segments, index.joined.length + 50) === null);

// pre-filter
const jl = index.joined.toLowerCase();
ok('C1 mightMatch true when longest literal present', mightMatch('miracle cure for cancer', jl) === true);
ok('C2 mightMatch false when literal absent (short-circuits rule)', mightMatch('zzzzunlikelyphrase', jl) === false);
ok('C3 mightMatch true when no usable literal (no false-negative)', mightMatch('\\d{3}', jl) === true);

// strip + split sanity
ok('D1 _stripText removes scripts/styles/tags', !/[<>]/.test(_stripText('<script>x()</script><p>Hello <b>world</b></p>')));
ok('D2 splitSentences breaks on . ! ? and newline', splitSentences('One. Two! Three?\nFour').length === 4);

// no quote bleeds across a page boundary (record separator splits pages)
const bleed = scanRuleGlobal(/team members\.? This is ordinary/i, index, {});
ok('E1 no match bleeds across the page boundary (RS separates pages)', bleed.length === 0);

// ── ruleCheck integration: a prohibit rule lists EVERY offending line across the site (blog included) ──
console.log('\n=== ruleCheck prohibit → occurrences[] (every-word, end-to-end) ===');
const { ruleCheck } = require(path.resolve(__dirname, '..', '..', 'src', 'skills', 'S008-personalisation-engine', 'scanners', 'compliance.js'));
const rcCorpus = [
  { url: 'https://y.com/', body: '<p>We are a friendly wellness studio helping local clients feel their best every day.</p>' },
  { url: 'https://y.com/blog/2019/claims', body: '<article><p>Our signature programme is a guaranteed cure for all chronic diseases and we stand behind it fully.</p></article>' },
  { url: 'https://y.com/testimonials', body: '<p>One reviewer wrote that it was a guaranteed cure for all chronic diseases in their honest opinion piece.</p>' },
];
const rcIndex = buildCorpusIndex(rcCorpus);
const prohibitRule = { id: 7, rule_id: 'NO_CURE_CLAIM', framework_short: 'UK_ASA', severity: 'P1', rule_type: 'prohibit', regex_pattern: 'cure for all chronic diseases', description: 'No unverified medical cure claims (CAP/ASA).', citation_url: 'https://asa.org.uk' };
const rc = ruleCheck(prohibitRule, rcCorpus, 'wellness', rcIndex);
ok('F1 prohibit rule → status miss', rc.status === 'miss', rc.status);
ok('F2 occurrence_count >= 2 (blog + testimonial)', (rc.occurrence_count || 0) >= 2, String(rc.occurrence_count));
ok('F3 occurrences span the deep blog page', (rc.occurrences || []).some(o => o.url.includes('/blog/')), JSON.stringify((rc.occurrences || []).map(o => o.url)));
ok('F4 evidence_quote is a verbatim offending line', /cure for all chronic diseases/i.test(rc.evidence_quote || ''), rc.evidence_quote);
const rcClean = ruleCheck(prohibitRule, [{ url: 'https://z.com/', body: '<p>We offer relaxing massage and yoga classes for our community members.</p>' }], 'wellness', buildCorpusIndex([{ url: 'https://z.com/', body: '<p>We offer relaxing massage and yoga classes for our community members.</p>' }]));
ok('F5 clean site → no_prohibited_pattern (no false positive)', rcClean.status === 'no_prohibited_pattern', rcClean.status);

console.log(`\n=== CORPUS-INDEX TEST: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
