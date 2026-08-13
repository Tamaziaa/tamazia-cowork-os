// Test harness for the v15 evidence-first audit worker.
import crypto from 'crypto';
import fs from 'fs';

const SECRET = 'test_secret_key_1234567890abcdef';
const SRC = '/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js';
let src = fs.readFileSync(SRC, 'utf8')
  .replaceAll('__NEON_URL__', 'postgres://u:p@ep-test.neon.tech/db')
  .replaceAll('__TAMAZIA_HMAC_SECRET__', SECRET);
const TMP = '/tmp/worker-test.mjs';
fs.writeFileSync(TMP, src);

const payload = {
  schema_version: 'v1', domain: 'streathers.co.uk', sector: 'law-firms', country: 'UK',
  framework_version: '7.4.0',
  applicable_frameworks: ['UK_SRA_COC', 'UK_EQUALITY_2010', 'UK_GDPR_A13', 'UK_PECR', 'UK_ICO_COOKIES', 'UK_DPA_2018', 'UK_DMCC_2024', 'EU_AI_ACT', 'GOOGLE_EEAT', 'UK_COMPANIES_ACT'],
  rules: [{ framework_short: 'UK_SRA_COC', rule_id: 'T1', severity: 'P0' }],
  sections: { cover: { firm: 'streathers' }, investment_tiers: { tiers: ['Foundation', 'Authority', 'Dominator'], prices_gbp: [1500, 3500, 7500] } }
};
const scraped = [
  { severity: 'P0', citation: 'SEO: mobile', fact: 'no mobile viewport tag, which Google penalises on mobile-first indexing' },
  { severity: 'P1', citation: 'SEO: meta description', fact: 'the homepage has no meta description, so search + AI snippets are auto-generated' },
  { severity: 'P1', citation: 'SEO: structured data', fact: 'no schema.org markup found, so Google and AI assistants cannot parse the firm cleanly' },
  { severity: 'P0', citation: 'UK GDPR / privacy', fact: 'no privacy policy detected, a direct regulatory + trust gap' },
  { severity: 'P1', citation: 'PECR / cookies', fact: 'no cookie consent mechanism detected, a PECR exposure' },
  { severity: 'P1', citation: 'AI/search authority', fact: 'no LinkedIn company presence linked, which weakens entity authority for AI search' }
];
const lead = { company: 'Streathers Solicitors', quality_score: 78, pointers: JSON.stringify(scraped) };

globalThis.fetch = async (urlStr, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(payload), payload.domain, payload.sector, payload.country]];
  else if (/FROM leads/.test(q)) rows = [[lead.company, lead.quality_score, lead.pointers]];
  return { ok: true, json: async () => ({ rows }) };
};

const mod = (await import('file://' + TMP)).default;
function sign(slug, hash, l, x) { return crypto.createHmac('sha256', SECRET).update(`${slug}|${hash}|${l}|${x}`).digest('hex').slice(0, 32); }
async function hit(path) { const r = await mod.fetch(new Request('https://tamazia.co.uk' + path)); const body = await r.text(); return { status: r.status, body }; }

const slug = 'streathers-solicitors', hash = 'YpHBx5lx', l = '48';
const future = Math.floor(Date.now() / 1000) + 86400;
const past = Math.floor(Date.now() / 1000) - 10;

let pass = 0, fail = 0;
const chk = (c, n) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const sig = sign(slug, hash, l, future);
const ok = await hit(`/audit/${slug}/${hash}?l=${l}&x=${future}&sig=${sig}`);
console.log('--- valid render ---');
chk(ok.status === 200, '200 status');
chk(/Personalised regulatory \+ SEO \+ AI visibility audit/.test(ok.body), 'new eyebrow present');
chk(/Your priority three/.test(ok.body), 'priority-three section present');
chk(/The \d+ findings? on streathers\.co\.uk|The single finding on streathers\.co\.uk/.test(ok.body), 'personalised priority headline');
chk(/Streathers Solicitors/.test(ok.body), 'company name');
chk(/King.s College London/.test(ok.body), "King's credentials in footer");
chk(/Aman Pareek/.test(ok.body), 'Aman Pareek named');
chk(/Founder, Tamazia/.test(ok.body), 'founder signature');
chk(/What we found, verbatim/.test(ok.body), 'verbatim evidence block on every finding');
chk(/<mark/.test(ok.body), 'evidence highlighted');
chk(/Where on your site/.test(ok.body), 'location field on findings');
chk(/The law/.test(ok.body), 'law field on findings');
chk(/Exposure/.test(ok.body), 'exposure field on findings');
chk(/Tamazia fix/.test(ok.body), 'fix field on findings');
chk(/If fixed/.test(ok.body), 'uplift field on findings');
chk(/Up to £17\.5M/.test(ok.body), 'concrete £ exposure (UK GDPR max)');
chk(/Up to £500,000/.test(ok.body), 'concrete £ exposure (PECR max)');
chk(/Findings · \d+ frameworks? flagged · one box per regulator/.test(ok.body), 'findings consolidated by framework');
chk(/Framework status · what works · what's missing/.test(ok.body), 'framework status 2-column section');
chk(/Frameworks .* was checked against/.test(ok.body), 'compliance-context section');
chk(/lead regulator/i.test(ok.body) && /SRA/.test(ok.body), 'lead regulator = SRA');
chk(/AI search visibility/.test(ok.body), 'AI visibility section');
chk(/From £2,500/.test(ok.body) && /From £4,500/.test(ok.body) && /From £9,500/.test(ok.body), 'three pricing tiers with live prices');
chk(/Recommended for your profile/.test(ok.body), 'one tier flagged recommended');
chk(/Begin Foundation/.test(ok.body) && /Begin Authority/.test(ok.body) && /Begin Enterprise/.test(ok.body), 'each tier has a Begin CTA');
chk(/cal\.com\/tamazia\/strategy-call/.test(ok.body) && /id="cal-host"/.test(ok.body) && /id="cal-fallback"/.test(ok.body), "founder's cal.com calendar embedded with JS-injected iframe + static fallback (R23-3)");
chk(/Pick a slot directly with Aman Pareek/.test(ok.body), 'calendar section headline');
chk(/onclick="prepPrint\(\)"/.test(ok.body), 'Download PDF button');
chk(/@media print/.test(ok.body), 'print stylesheet present');
chk(/function prepPrint/.test(ok.body), 'prepPrint script present');
chk(/class="mcta no-print"/.test(ok.body), 'mobile sticky CTA + no-print class');
chk(!/three clients · three regulators|THREE CLIENTS · THREE REGULATORS/i.test(ok.body), 'proof band removed per user request');
chk(/normally £1,500/.test(ok.body) && /Complimentary/.test(ok.body), 'value anchor £1,500');
chk(/publicly visible signals only/.test(ok.body), 'data-scanned note');
const scores = [...ok.body.matchAll(/(\d+) \/ 100/g)].map(m => Number(m[1]));
console.log('  scores seen:', scores.join(', '));
chk(scores.length >= 2 && Math.min(...scores) < Math.max(...scores), 'score not inverted (current<after)');
chk(scores[0] >= 24 && scores[0] <= 58, 'current score plausible ' + scores[0]);

// HMAC + lifecycle
const bad = await hit(`/audit/${slug}/${hash}?l=${l}&x=${future}&sig=deadbeefdeadbeefdeadbeefdeadbeef`);
console.log('--- tampered ---'); chk(bad.status === 403, '403 tampered');
const esig = sign(slug, hash, l, past);
const exp = await hit(`/audit/${slug}/${hash}?l=${l}&x=${past}&sig=${esig}`);
console.log('--- expired ---'); chk(exp.status === 410, '410 expired');
const mal = await hit(`/audit/onlyslug`);
console.log('--- malformed ---'); chk(mal.status === 404, '404 malformed');
const nosig = await hit(`/audit/${slug}/${hash}?l=${l}&x=${future}`);
console.log('--- no sig ---'); chk(nosig.status === 200, '200 no-sig preview renders');

console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
fs.writeFileSync('/sessions/great-hopeful-heisenberg/mnt/outputs/audit-preview.html', ok.body);
console.log('HTML bytes:', ok.body.length, '→ outputs/audit-preview.html');
process.exit(fail ? 1 : 0);
