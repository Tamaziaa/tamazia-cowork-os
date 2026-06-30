#!/usr/bin/env node
'use strict';
// eval/build-golden.js — builds the golden-set regression fixtures (ledger 1.2) from real audits.
// Privacy posture: committed fixtures are STRUCTURAL ONLY (no domain, no exec_summary, firm pseudonymised,
// fact truncated + scrubbed). Full raw payloads (shadow oracle, ledger 1.2.2) go to eval/golden/.raw/ (gitignored).
// Input: /tmp/golden_raw.tsv (domain \t sector \t country \t payload_json). Source: SPEC §9; V3 §7-G; INV500.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'golden'); const RAW = path.join(OUT, '.raw');
fs.mkdirSync(RAW, { recursive: true });
const region = c => { c = String(c||'').toUpperCase(); if (['GB','UK'].includes(c)) return 'UK';
  if (['AE','UAE'].includes(c)) return 'ME'; if (['US','USA'].includes(c)) return 'US';
  if (['IE','DE','FR','NL','ES','IT'].includes(c)) return 'EU'; return 'OTHER'; };
function scrub(t, dom) { if (!t) return t; const base = String(dom||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'');
  const stem = base.split('.')[0]; let s = String(t);
  if (base) s = s.split(base).join('[FIRM]'); if (stem && stem.length>2) s = new RegExp(stem,'ig')[Symbol.replace](s,'[FIRM]'); return s; }
const trunc = (t,n)=> t==null?t:(String(t).length>n?String(t).slice(0,n)+'…':String(t));

const lines = fs.readFileSync('/tmp/golden_raw.tsv','utf8').split('\n').filter(Boolean);
const cands = [];
for (const ln of lines) { const parts = ln.split('\t'); if (parts.length<4) continue;
  const [domain,sector,country] = parts; let p; try{ p = JSON.parse(parts.slice(3).join('\t')); }catch(_){ continue; }
  cands.push({ domain, sector, country, p }); }

// balanced selection across regions, dedupe domain
const want = { UK:5, ME:5, US:4, EU:5 }; const picked = []; const seen = new Set();
for (const reg of Object.keys(want)) { let n=0;
  for (const c of cands) { if (region(c.country)!==reg) continue; const d=c.domain.toLowerCase(); if(seen.has(d))continue;
    seen.add(d); picked.push(c); if(++n>=want[reg]) break; } }

const manifest = []; const identities = {};
picked.forEach((c,i) => {
  const id = 'firm-' + String(i+1).padStart(2,'0'); const p = c.p;
  const findings = [...(p.pointers||[]).filter(x=>x.bucket==='compliance'), ...(p.needs_review||[])]
    .map(f => ({ citation:f.citation, kind:f.kind, state:f.state, severity:f.severity,
      fine_low_gbp:f.fine_low_gbp ?? null, fine_high_gbp:f.fine_high_gbp ?? null, fine_withheld:!!f.fine_withheld,
      fix: trunc(scrub(f.tamazia_fix_short||f.recommendation, c.domain),160),
      fact: trunc(scrub(f.fact, c.domain),160), enforcement_example: f.enforcement_example?true:false }));
  const js = p.jurisdiction_statement||{};
  const fixture = { id, region:region(c.country), sector:p.sector||c.sector, detected_sector:p.detected_sector,
    country:c.country, registered:js.registered||null, operating_regions:js.operating_regions||[],
    engine_jurisdictions:p.engine_jurisdictions||[], applicable_frameworks:p.applicable_frameworks||[],
    jurisdiction_regimes:(js.regimes||[]).map(r=>r.regime), framework_intel_keys:Object.keys(p.framework_intel||{}),
    counts:(p.scan&&p.scan.counts)||null, compliance_findings:findings, trap:null /* assign in 1.5 */ };
  fs.writeFileSync(path.join(OUT, id+'.json'), JSON.stringify(fixture,null,1));
  fs.writeFileSync(path.join(RAW, id+'.json'), JSON.stringify(p)); // shadow oracle, gitignored
  identities[id] = { domain:c.domain, sector:c.sector, country:c.country };
  manifest.push({ id, region:fixture.region, sector:fixture.sector, country:c.country,
    frameworks:fixture.applicable_frameworks.length, findings:findings.length });
});
fs.writeFileSync(path.join(OUT,'_manifest.json'), JSON.stringify(manifest,null,1));
fs.writeFileSync(path.join(OUT,'_identities.local.json'), JSON.stringify(identities,null,1));
console.log('golden fixtures written:', picked.length);
console.table(manifest);
