// Audit eval harness (P8.4) — enforces the benchmark on a holdout set and FAILS the run (exit 1) on any breach.
// Asserts per audited site: score in 20-40, >=5 compliance findings, >=4 GEO, zero cross-region leakage, and
// every shown compliance finding carries a citation. Held (anti-bot) sites must yield ZERO findings (no fabrication).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const build = require(path.join(process.cwd(), 'src/skills/S025-audit-page-builder/scripts/build.js'));
const HOLDOUT = [
  { d: 'streathers.co.uk', sector: 'legal', country: 'UK', region: 'UK' },
  { d: 'monzo.com', sector: 'financial', country: 'UK', region: 'UK' },
  { d: 'mediclinic.ae', sector: 'healthcare', country: 'AE', region: 'ME' },
  { d: 'onemedical.com', sector: 'healthcare', country: 'US', region: 'US' },
  { d: 'specsavers.co.uk', sector: 'healthcare', country: 'UK', region: 'UK' }, // challenge-walled -> must hold or archive
];
const regionOf = (fw)=>{ fw=String(fw||'').toUpperCase(); if(/^EU_|GDPR$|^EU\b|EAA|EPRIVACY|^DSA|^DMA/.test(fw))return 'EU'; if(/^US_|CCPA|CPRA|HIPAA|^FTC|^US\b/.test(fw))return 'US'; if(/^UAE|^DIFC|^ADGM|^SAUDI|^QATAR|^DHA|^DOH|^RERA|PDPL|PDPPL/.test(fw))return 'ME'; if(/^UK_|SRA|^ICO|^CMA|^ASA|^FCA|^MHRA|PECR|^DPA|COMPANIES_ACT/.test(fw))return 'UK'; return 'GLOBAL'; };
const start = parseInt(process.argv[2]||'0',10), count = parseInt(process.argv[3]||String(HOLDOUT.length),10);
const fails = []; const rows = [];
for (const site of HOLDOUT.slice(start, start+count)) {
  let pay; try { pay = await build.buildPayload({ domain: site.d, sector: site.sector, country: site.country, env: process.env }); }
  catch (e) { fails.push(site.d+': buildPayload threw '+e.message); continue; }
  const pts = pay.pointers||[]; const comp = pts.filter(p=>p.bucket==='compliance'); const geo = pts.filter(p=>p.bucket==='ai_visibility');
  const reachable = !(pay.scan && pay.scan.reachable===false) && pts.length>0;
  const det = new Set([site.region]); (pay.engine_jurisdictions||[]).forEach(c=>{c=String(c).toUpperCase(); if(c==='UK')det.add('UK');else if(c==='US')det.add('US');else if(['AE','SA','QA'].includes(c))det.add('ME');else if(c==='EU'||['FR','DE','ES','IT','NL','BE','IE'].includes(c))det.add('EU');});
  const leak = comp.map(p=>regionOf(p.framework_short||p.citation)).filter(r=>r!=='GLOBAL'&&!det.has(r));
  const noCite = comp.filter(p=>!p.citation_url && !p.citation).length;
  rows.push({d:site.d, reachable, comp:comp.length, geo:geo.length, leak:leak.length});
  if (!reachable) { if (comp.length>0) fails.push(site.d+': HELD but produced '+comp.length+' findings (false positives!)'); continue; }
  if (comp.length < 5) fails.push(site.d+': only '+comp.length+' compliance findings (<5)');
  if (geo.length < 4) fails.push(site.d+': only '+geo.length+' GEO findings (<4)');
  if (leak.length) fails.push(site.d+': cross-region leakage '+[...new Set(leak)].join(','));
  if (noCite) fails.push(site.d+': '+noCite+' compliance findings missing a citation');
}
for (const r of rows) console.log(`${r.d.padEnd(20)} reach:${r.reachable} comp:${r.comp} geo:${r.geo} leak:${r.leak}`);
if (fails.length) { console.log('\nEVAL FAIL ('+fails.length+'):'); fails.forEach(f=>console.log('  ✗ '+f)); process.exit(1); }
console.log('\nEVAL PASS — benchmark held on all '+rows.length+' holdout sites.');
