// Audit eval harness (P1.9) — the Phase-1 integrity gate. FAILS the run (exit 1) on any correctness breach:
// a held/unreadable site that produced findings (fabrication), cross-region leakage, a compliance finding with no
// citation, any rendered pointer that is not CONFIRMED, or any fine on a non-CONFIRMED finding. Coverage is a WARN,
// never a hard fail, so a genuinely clean site is not falsely failed. 10 brands across sector / region / edge case.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const build = require(path.join(process.cwd(), 'src/skills/S025-audit-page-builder/scripts/build.js'));
const HOLDOUT = [
  { d: 'streathers.co.uk',       sector: 'legal',       country: 'UK', region: 'UK', tag: 'UK law' },
  { d: 'thelondonclinic.co.uk',  sector: 'healthcare',  country: 'UK', region: 'UK', tag: 'UK clinic' },
  { d: 'altamimi.com',           sector: 'legal',       country: 'AE', region: 'ME', tag: 'UAE law' },
  { d: 'mediclinic.ae',          sector: 'healthcare',  country: 'AE', region: 'ME', tag: 'UAE clinic' },
  { d: 'cooley.com',             sector: 'legal',       country: 'US', region: 'US', tag: 'US law' },
  { d: 'noerr.com',              sector: 'legal',       country: 'DE', region: 'EU', tag: 'EU/DE law' },
  { d: 'knightfrank.co.uk',      sector: 'real_estate', country: 'UK', region: 'UK', tag: 'UK real estate' },
  { d: 'roccofortehotels.com',   sector: 'hospitality', country: 'UK', region: 'UK', tag: 'hospitality' },
  { d: 'gymshark.com',           sector: 'ecommerce',   country: 'UK', region: 'UK', tag: 'global ecommerce (no-city)' },
  { d: 'specsavers.co.uk',       sector: 'healthcare',  country: 'UK', region: 'UK', tag: 'challenge-walled (archive)' },
];
const regionOf = (fw) => { fw = String(fw || '').toUpperCase(); if (/^EU_|GDPR$|^EU\b|EAA|EPRIVACY|^DSA|^DMA/.test(fw)) return 'EU'; if (/^US_|CCPA|CPRA|HIPAA|^FTC|^US\b/.test(fw)) return 'US'; if (/^UAE|^DIFC|^ADGM|^SAUDI|^QATAR|^DHA|^DOH|^RERA|PDPL|PDPPL/.test(fw)) return 'ME'; if (/^UK_|SRA|^ICO|^CMA|^ASA|^FCA|^MHRA|PECR|^DPA|COMPANIES_ACT/.test(fw)) return 'UK'; return 'GLOBAL'; };
const start = parseInt(process.argv[2] || '0', 10), count = parseInt(process.argv[3] || String(HOLDOUT.length), 10);
const fails = [], warns = [], rows = [];
for (const site of HOLDOUT.slice(start, start + count)) {
  let pay; try { pay = await build.buildPayload({ domain: site.d, sector: site.sector, country: site.country, env: process.env }); }
  catch (e) { fails.push(site.d + ': buildPayload threw ' + e.message); continue; }
  const pts = pay.pointers || []; const comp = pts.filter(p => p.bucket === 'compliance'); const geo = pts.filter(p => p.bucket === 'ai_visibility');
  const reachable = pts.length > 0 && (!!pay.via_archive || !(pay.scan && pay.scan.reachable === false));
  const det = new Set([site.region]); (pay.engine_jurisdictions || []).forEach(c => { c = String(c).toUpperCase(); if (c === 'UK') det.add('UK'); else if (c === 'US') det.add('US'); else if (['AE', 'SA', 'QA'].includes(c)) det.add('ME'); else if (c === 'EU' || ['FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'IE'].includes(c)) det.add('EU'); });
  const leak = comp.map(p => regionOf(p.framework_short || p.citation)).filter(r => r !== 'GLOBAL' && !det.has(r));
  const noCite = comp.filter(p => !p.citation_url && !p.citation).length;
  const notConfirmed = pts.filter(p => p.state && p.state !== 'CONFIRMED').length;
  const fineNotConfirmed = pts.filter(p => (p.fine_high_gbp || p.fine_low_gbp) && p.state && p.state !== 'CONFIRMED').length;
  rows.push({ d: site.d, tag: site.tag, reachable, comp: comp.length, geo: geo.length, leak: leak.length, nc: notConfirmed, fnc: fineNotConfirmed });
  if (!reachable) { if (comp.length > 0) fails.push(site.d + ': HELD/unreadable but produced ' + comp.length + ' findings (fabrication!)'); continue; }
  if (leak.length) fails.push(site.d + ': cross-region leakage ' + [...new Set(leak)].join(','));
  if (noCite) fails.push(site.d + ': ' + noCite + ' compliance findings missing a citation');
  if (notConfirmed) fails.push(site.d + ': ' + notConfirmed + ' rendered pointers not CONFIRMED (only CONFIRMED may render)');
  if (fineNotConfirmed) fails.push(site.d + ': ' + fineNotConfirmed + ' fines on non-CONFIRMED findings (evidence-lock breach)');
  if (comp.length < 3) warns.push(site.d + ': low compliance coverage (' + comp.length + ')');
  if (geo.length < 2) warns.push(site.d + ': low GEO coverage (' + geo.length + ')');
}
for (const r of rows) console.log(`${r.d.padEnd(24)} ${String(r.tag).padEnd(26)} reach:${r.reachable} comp:${r.comp} geo:${r.geo} leak:${r.leak} notConfirmed:${r.nc} fineUnverified:${r.fnc}`);
if (warns.length) { console.log('\nWARN (coverage, non-fatal):'); warns.forEach(w => console.log('  · ' + w)); }
if (fails.length) { console.log('\nEVAL FAIL (' + fails.length + '):'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('\nEVAL PASS — integrity held on all ' + rows.length + ' holdout sites (0 fabrication, 0 leakage, 0 uncited, 0 non-confirmed, 0 unverified fines).');
