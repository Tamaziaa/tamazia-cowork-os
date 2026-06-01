#!/usr/bin/env node
// Adversarial regression suite (offline, no live SERP/DB needed). Guards the worst-case scenarios and the
// real bugs found in the 2026-06-01 hardening pass so they stay fixed. Usage: node scripts/adversarial-test.js
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let PASS = 0, FAIL = 0; const fails = [];
const ok = (n, c, e) => { if (c) PASS++; else { FAIL++; fails.push(n + (e ? ' :: ' + e : '')); } };
const scn = async (n, fn) => { try { await fn(); } catch (e) { FAIL++; fails.push('THREW ' + n + ' :: ' + (e && e.message)); } };

const serp = require(path.join(ROOT, 'src/lib/scraping/serp-client.js'));
let SERP = null; serp.search = async () => SERP;
const organic = a => ({ organic: a.map((d, i) => ({ rank: i + 1, domain: d })) });
const ri = require(path.join(ROOT, 'src/lib/touch0/rank-insight.js'));
const markets = require(path.join(ROOT, 'src/lib/sourcing/markets.js'));
const gates = require(path.join(ROOT, 'src/lib/gates.js'));
const render = require(path.join(ROOT, 'src/skills/S064-touch-cadence/scripts/render.js'));
const bs = require(path.join(ROOT, 'scripts/buying-signals.js'));
const ICP = require(path.join(ROOT, 'src/lib/sourcing/icp.js'));
const X = require(path.join(ROOT, 'src/lib/audit/extra-scanners.js'));
const JR = require(path.join(ROOT, 'src/lib/compliance/jurisdiction-router.js'));

(async () => {
  // markets: city + postcode fallback + false-positive resistance + perf
  await scn('markets empty', () => ok('markets empty', markets.detectMarkets({ html: '', domain: 'x.co.uk' }).primary_city === ''));
  await scn('postcode->city', () => ok('postcode', markets.detectMarkets({ html: 'office LE1 7RH', domain: 'x.co.uk' }).primary_city === 'Leicester'));
  await scn('postcode lower', () => ok('pc lower', markets.detectMarkets({ html: 'm1 1ae', domain: 'x.co.uk' }).primary_city === 'Manchester'));
  await scn('no false pc', () => ok('no false pc', markets.detectMarkets({ html: 'Model X1 2024 SET 3 GO', domain: 'x.com' }).primary_city === ''));
  await scn('markets perf', () => { const t = Date.now(); markets.detectMarkets({ html: 'a'.repeat(400000) + ' EC1A 1BB', domain: 'x.co.uk' }); ok('perf<1500', Date.now() - t < 1500); });

  // rank-insight: aggregator filter + real leader pos + no false urgency + fact-check
  await scn('lead#1 no urgency', async () => { SERP = organic(['mine.co.uk', 'b.co.uk', 'c.co.uk']); const r = await ri.buildRankInsight({ domain: 'mine.co.uk', company: 'Mine', sector: 'law-firms', city: 'London' }); ok('lead#1', r.ok === false); });
  await scn('real leader not directory', async () => { SERP = organic(['legal500.com', 'osborneslaw.com', 'b.co.uk', 'c.co.uk', 'd.co.uk', 'e.co.uk', 'mine.co.uk']); const r = await ri.buildRankInsight({ domain: 'mine.co.uk', company: 'Mine', sector: 'law-firms', city: 'London' }); ok('leader', r.ok && r.keywords[0].leader === 'osborneslaw.com' && r.keywords[0].leader_pos === 2); });
  await scn('factcheck catches fabrication', async () => { const fc = await ri.factCheck({ ok: true, domain: 'x.co.uk', keywords: [{ keyword: 'k', leader: 'ghost.com', leader_pos: 1, my_position: null }], evidence: [{ keyword: 'k', ranked: [{ pos: 1, domain: 'real.com' }] }] }); ok('factcheck', fc.pass === false); });

  // gates
  await scn('noDashes keeps hyphen-word', () => ok('hyphen', /co-founder/.test(gates.noDashes('our co-founder')) && !/—/.test(gates.noDashes('a—b'))));
  await scn('placeholders catch', () => ok('ph', gates.validatePlaceholders('in [city]').ok === false && gates.validatePlaceholders('x undefined').ok === false));

  // render: absolute audit URL (relative-link bug) + tabbed-field safety done at SQL layer
  await scn('relative audit -> absolute', () => { const t = render.buildTouch1({ lead: { company: 'X Co', sector: 'law-firms', audit_url: '/audit/x-co/AB12' }, findings: ['y'] }); ok('absAudit', /https:\/\/tamazia\.co\.uk\/audit\/x-co\/AB12/.test(t.body)); });
  await scn('touch0 rankings + no link + sig', () => { const t = render.buildTouch0({ lead: { company: 'M', sector: 'law-firms', first_name: '', rank_insight: { blog_offer: 'B', keywords: [{ keyword: 'k1', my_position: null, leader: 'o.com', leader_pos: 3 }] } }, apolloOrg: null, findings: [] }); ok('t0', /o.com/.test(t.body) && !/https?:\/\//.test(t.body) && /__SIGNATURE__/.test(t.body)); });

  // ICP null safety (crash bug)
  await scn('ICP preFilter null', () => ok('preFilter null', ICP.preFilter(null) && ICP.preFilter(null).pass === false));
  await scn('ICP scoreICP null', () => ok('scoreICP null', ICP.scoreICP(null) && typeof ICP.scoreICP(null).score === 'number'));

  // scanners never throw on hostile HTML
  for (const h of ['', null, '\x00\x01binary', '<h1>' + 'x'.repeat(200000) + '</h1>', '%PDF garbage']) {
    await scn('techStack hostile', () => ok('techStack', !!X.techStack(h, {})));
    await scn('regulatedClaims hostile', () => ok('claims', !!X.regulatedClaims(h, 'law-firms')));
  }
  await scn('JR empty/null', () => ok('JR', !!JR.routeForMarkets({}) && !!JR.routeForMarkets({ markets: null, country: null, sector: null })));

  // buying-signals pure logic
  await scn('bs baseline silent', () => ok('bs baseline', bs.diffSignals(null, { hiring: true }).length === 0));
  await scn('bs hiring transition', () => ok('bs hiring', bs.diffSignals({ hiring: false, pricing: false, title_h: 'a', h1_h: 'b' }, { hiring: true, pricing: false, title_h: 'a', h1_h: 'b' })[0][0] === 'hiring'));

  console.log('\nADVERSARIAL REGRESSION: PASS ' + PASS + '  FAIL ' + FAIL);
  if (fails.length) { fails.forEach(f => console.log('  x ' + f)); process.exitCode = 1; }
  else console.log('All worst-case regression scenarios passed.');
})();
