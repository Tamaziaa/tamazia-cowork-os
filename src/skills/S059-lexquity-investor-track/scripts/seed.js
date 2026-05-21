#!/usr/bin/env node
// S059 LexQuity investor pipeline seed · Phase 9
// Seeds the leads table with LexQuity investor-track entries: pre-seed legaltech VCs,
// sovereign wealth allocators with legaltech mandates, UHNW family offices, ICC/LCIA practitioners
// Cadence is relationship-first, not cold-pitch. Marked lead_audience='lexquity_investor'.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

// Pre-seed legaltech investors (researched from public AngelList + Crunchbase + fund websites)
const INVESTORS = [
  // Pre-seed legaltech VCs
  { name: 'Earlybird Venture Capital', domain: 'earlybird.com', country: 'DE', notes: 'Pre-seed + seed; legaltech + AI/SaaS', stage: 'pre-seed' },
  { name: 'MMC Ventures', domain: 'mmc.vc', country: 'UK', notes: 'Series A focus; legaltech adjacent', stage: 'seed' },
  { name: 'Episode 1 Ventures', domain: 'episode1.com', country: 'UK', notes: 'Pre-seed UK B2B SaaS', stage: 'pre-seed' },
  { name: 'Seedcamp', domain: 'seedcamp.com', country: 'UK', notes: 'Pre-seed European; legaltech portfolio', stage: 'pre-seed' },
  { name: 'Local Globe', domain: 'localglobe.vc', country: 'UK', notes: 'Pre-seed; UK B2B SaaS', stage: 'pre-seed' },
  { name: 'Crane VC', domain: 'crane.vc', country: 'UK', notes: 'Early-stage legaltech experience', stage: 'pre-seed' },
  { name: 'Bain Capital Ventures', domain: 'baincapitalventures.com', country: 'US', notes: 'Legaltech series A+; selective seed', stage: 'seed' },
  { name: 'Atomico', domain: 'atomico.com', country: 'UK', notes: 'Series A+; would be later round', stage: 'series-a' },
  // Legaltech-specific funds
  { name: 'Touchdown Ventures', domain: 'touchdownvc.com', country: 'US', notes: 'Corporate VC arm; legaltech focus', stage: 'seed' },
  { name: 'IronGate Capital', domain: 'irongatecap.com', country: 'US', notes: 'Pre-seed legaltech', stage: 'pre-seed' },
  // Sovereign wealth + family office with legaltech mandates
  { name: 'Mubadala Capital Ventures', domain: 'mubadala.com', country: 'UAE', notes: 'Sovereign wealth with venture arm', stage: 'series-a' },
  { name: 'ADQ', domain: 'adq.ae', country: 'UAE', notes: 'Abu Dhabi sovereign; tech mandate', stage: 'series-a' },
  // UK arbitration practitioner referral network (potential LexQuity buyers + introducers)
  { name: 'International Chamber of Commerce (ICC) Court', domain: 'iccwbo.org', country: 'FR', notes: 'Manuel referral path', stage: 'institutional' },
  { name: 'London Court of International Arbitration (LCIA)', domain: 'lcia.org', country: 'UK', notes: 'Direct institutional buyer / partner', stage: 'institutional' },
  { name: 'Singapore International Arbitration Centre (SIAC)', domain: 'siac.org.sg', country: 'SG', notes: 'Direct institutional', stage: 'institutional' },
  { name: 'Dubai International Arbitration Centre (DIAC)', domain: 'diac.com', country: 'UAE', notes: 'Direct institutional; Manuel link', stage: 'institutional' },
];

function upsert(rec) {
  // Check if already present
  const exists = pg(`SELECT id FROM leads WHERE domain=${pgEsc(rec.domain)} OR lower(company)=${pgEsc(rec.name.toLowerCase())} LIMIT 1`);
  if (exists) return { already_exists: true, id: Number(exists) };
  const sql = `INSERT INTO leads (company, domain, sector, jurisdiction, source, status, imported_at, created_at, updated_at, lead_audience, priority_score, research_dossier)
    VALUES (${pgEsc(rec.name)}, ${pgEsc(rec.domain)}, 'lexquity-investor', ${pgEsc(rec.country)}, 'manual_lexquity_seed', 'new', NOW(), NOW(), NOW(), 'lexquity_investor', 75, ${pgEsc(rec.notes + ' · stage:' + rec.stage)})
    RETURNING id`;
  const id = pg(sql);
  return { inserted: true, id: id ? Number(id) : null };
}

const results = INVESTORS.map(inv => ({ ...inv, ...upsert(inv) }));
console.log(JSON.stringify({
  total: results.length,
  inserted: results.filter(r => r.inserted).length,
  already_exists: results.filter(r => r.already_exists).length,
  sample: results.slice(0, 3)
}, null, 2));
