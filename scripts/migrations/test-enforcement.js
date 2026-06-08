#!/usr/bin/env node
'use strict';
// WS-B3 unit test — penalty calibration (real fines, not statutory max), the 5-part per-breach panel (honest when
// empty, never fabricated), and the official-source allowlist guard. node scripts/migrations/test-enforcement.js
const path = require('path'); const ROOT = path.resolve(__dirname, '..', '..');
const { buildBreachPanel, calibratePenalty, _amount } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'enforcement.js'));
const { isAllowed, contentHash, matchLaws } = require(path.join(ROOT, 'scripts', 'enforcement-sync.js'));
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + (d || '')}`); };

const law = { id: 'UK-GDPR-01', regulator: 'Information Commissioner', jurisdiction: 'UK', severity: 'High', neon_framework_short: 'UK_GDPR_A13', servable: true, website_obligation: 'Provide Article 13 privacy information', max_penalty: '£17.5M' };
const records = [
  { matched_law_ids: ['UK-GDPR-01'], jurisdiction: 'UK', penalty: '£450,000', entity_named: 'Acme Ltd', ruling_date: '2025-03-01', source_url: 'https://ico.org.uk/x', one_line_summary: 'ICO fined Acme for marketing emails', classifier: 'pecr', source_feed: 'ICO_UK' },
  { matched_law_ids: ['UK-GDPR-01'], jurisdiction: 'UK', penalty: '£1.2M', entity_named: 'Beta Plc', ruling_date: '2025-05-10', source_url: 'https://ico.org.uk/y', one_line_summary: 'ICO fined Beta for a data breach', classifier: 'gdpr', source_feed: 'ICO_UK' },
];

console.log('=== [B] penalty calibration (real fines, NOT the statutory max) ===');
const cp = calibratePenalty({ law, records });
ok('A1 basis = calibrated_recent_fines when records exist', cp.basis === 'calibrated_recent_fines', cp.basis);
ok('A2 headline uses the MEDIAN real fine, not £17.5M max', /825k|825,000|0\.8M|825/.test(cp.headline) && !/17\.5M/.test(cp.headline), cp.headline);
ok('A3 most_recent = the latest-dated case (Beta 2025-05-10) with source_url', cp.most_recent && cp.most_recent.entity === 'Beta Plc' && cp.most_recent.source_url, JSON.stringify(cp.most_recent));
ok('A4 statutory_max preserved separately (labelled, not shown as "your fine")', /17\.5M/.test(cp.statutory_max || ''), cp.statutory_max);
const cpEmpty = calibratePenalty({ law, records: [] });
ok('A5 no records → basis statutory_only, headline labelled "Statutory maximum"', cpEmpty.basis === 'statutory_only' && /Statutory maximum/.test(cpEmpty.headline), cpEmpty.headline);

console.log('\n=== per-breach panel (5 parts, honest, source-traced) ===');
const finding = { framework: 'UK_GDPR_A13', severity: 'High', evidence_url: 'https://firm.com/privacy', evidence_quote: 'We collect your personal data.', occurrence_count: 1, description: 'Article 13 privacy information not provided' };
const panel = buildBreachPanel({ law, finding, records });
ok('B1 [A] where = the page + verbatim quote', panel.where.page === 'https://firm.com/privacy' && /personal data/.test(panel.where.quote), JSON.stringify(panel.where));
ok('B2 [B] penalty is the calibrated object', panel.penalty && panel.penalty.basis === 'calibrated_recent_fines');
ok('B3 [C] recent_ruling has a real official source_url', panel.recent_ruling.source_url && /ico\.org\.uk/.test(panel.recent_ruling.source_url), JSON.stringify(panel.recent_ruling));
ok('B4 [D] recent_news honest when none collected (no fabrication)', /No recent enforcement news/.test(panel.recent_news.summary) && panel.recent_news.source_url === null);
ok('B5 [E] impact is a factual statement (no invented number)', typeof panel.impact === 'string' && !/£|\$|EUR/.test(panel.impact), panel.impact);
const panelEmpty = buildBreachPanel({ law, finding, records: [] });
ok('B6 empty records → recent_ruling honestly says none found, source_url null', /No recent published ruling/.test(panelEmpty.recent_ruling.summary) && panelEmpty.recent_ruling.source_url === null);
ok('B7 panel still gives [A] where + [B] statutory penalty even with no records', panelEmpty.where.page && panelEmpty.penalty.basis === 'statutory_only');

console.log('\n=== source-authority allowlist (reputability guard) ===');
ok('C1 official regulator allowed (ico.org.uk)', isAllowed('https://ico.org.uk/action-weve-taken/enforcement/abc') === true);
ok('C2 official subdomain allowed (www.fca.org.uk)', isAllowed('https://www.fca.org.uk/news/x') === true);
ok('C3 random SEO blog REJECTED', isAllowed('https://best-gdpr-fines-blog.com/post') === false);
ok('C4 lookalike host REJECTED (ico.org.uk.evil.com)', isAllowed('https://ico.org.uk.evil.com/x') === false);
ok('C5 contentHash deterministic + 64 chars', contentHash('u', 't', '2025-01-01') === contentHash('u', 't', '2025-01-01') && contentHash('u', 't', '2025-01-01').length === 64);
const { buildFwToId } = require(path.join(ROOT, 'scripts', 'enforcement-sync.js'));
const fwToId = buildFwToId([{ id: 'UK-GDPR-01', neon_framework_short: 'UK_GDPR_A13,UK_DPA_2018' }, { id: 'US-FTC', neon_framework_short: 'US_FTC' }]);
ok('C6 matchLaws resolves a feed to its canonical law ids (ICO_UK → UK-GDPR-01)', matchLaws('ICO_UK', fwToId).includes('UK-GDPR-01'));
ok('C7 matchLaws is feed-scoped — a US feed never returns a UK law', !matchLaws('FTC_US', fwToId).includes('UK-GDPR-01') && matchLaws('FTC_US', fwToId).includes('US-FTC'));
ok('C8 _amount parses £1.2M', _amount('£1.2M') === 1200000);

console.log('\n=== penalty-parse hardening (no poisoned median, correct rounding) ===');
const { _fmt } = require(path.join(ROOT, 'src', 'lib', 'compliance', 'enforcement.js'));
ok('D1 _amount rejects turnover-% ("10% of global turnover")', _amount('10% of global turnover') === null);
ok('D2 _amount rejects per-violation ("£1,000 per violation")', _amount('£1,000 per violation') === null);
ok('D3 _amount rejects a bare number with no currency ("2,500")', _amount('2,500') === null);
ok('D4 _amount still parses real fines (USD 100,000 / EUR 20M)', _amount('USD 100,000') === 100000 && _amount('EUR 20M') === 20000000);
ok('D5 _fmt keeps the decimal at >=£10M (17.5M not 18M)', _fmt(17500000) === '17.5M' && _fmt(20000000) === '20M');
// median is NOT poisoned by a % or per-violation record mixed in
const mixed = [
  { matched_law_ids: ['UK-GDPR-01'], jurisdiction: 'UK', penalty: '£500,000', ruling_date: '2025-02-01', source_url: 'https://ico.org.uk/a' },
  { matched_law_ids: ['UK-GDPR-01'], jurisdiction: 'UK', penalty: '4% of annual turnover', ruling_date: '2025-04-01', source_url: 'https://ico.org.uk/b' },
  { matched_law_ids: ['UK-GDPR-01'], jurisdiction: 'UK', penalty: '£1,000 per violation', ruling_date: '2025-05-01', source_url: 'https://ico.org.uk/c' },
];
const cpMixed = calibratePenalty({ law, records: mixed });
ok('D6 median uses ONLY the real fine (1 case), not the % / per-violation noise', cpMixed.calibrated_from === 1 && /500k|500,000/.test(cpMixed.headline), `from=${cpMixed.calibrated_from} headline=${cpMixed.headline}`);

console.log(`\n=== ENFORCEMENT TEST: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
