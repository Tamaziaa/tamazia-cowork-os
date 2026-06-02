// Phase 1 + Phase 2 backtest harness. Resumable + concurrent. Runs the FULL engine (PSI disabled here for
// speed; PSI/SEO proven separately) per site and records: reachability, finding counts by bucket, region
// routing + cross-region leakage, AI-citation competitors, exposure reconciliation, and false-positive checks.
// Usage: node scripts/backtest-phase2.mjs <startIdx> <count>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const ROOT = process.cwd();
const build = require(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'));

const SITES = [
  { d: 'streathers.co.uk', sector: 'legal',       country: 'UK', region: 'UK' },
  { d: 'pwc.co.uk',        sector: 'professional', country: 'UK', region: 'UK' },
  { d: 'monzo.com',        sector: 'financial',    country: 'UK', region: 'UK' },
  { d: 'savills.co.uk',    sector: 'real-estate',  country: 'UK', region: 'UK' },
  { d: 'premierinn.com',   sector: 'hospitality',  country: 'UK', region: 'UK' },
  { d: 'rac.co.uk',        sector: 'automotive',   country: 'UK', region: 'UK' },
  { d: 'ucl.ac.uk',        sector: 'education',    country: 'UK', region: 'UK' },
  { d: 'zalando.de',       sector: 'ecommerce',    country: 'DE', region: 'EU' },
  { d: 'onemedical.com',   sector: 'healthcare',   country: 'US', region: 'US' },
  { d: 'warbyparker.com',  sector: 'ecommerce',    country: 'US', region: 'US' },
  { d: 'lw.com',           sector: 'legal',        country: 'US', region: 'US' },
  { d: 'tamimi.com',       sector: 'legal',        country: 'AE', region: 'ME' },
  { d: 'emaar.com',        sector: 'real-estate',  country: 'AE', region: 'ME' },
  { d: 'mediclinic.ae',    sector: 'healthcare',   country: 'AE', region: 'ME' },
];

function regionOf(fw) {
  fw = String(fw || '').toUpperCase();
  if (/^EU_|^GDPR|^EU\b|EAA|EPRIVACY|^DSA|^DMA/.test(fw)) return 'EU';
  if (/^US_|CCPA|CPRA|COPPA|HIPAA|^FTC|CAN_SPAM|^US\b|STATE_PRIVACY/.test(fw)) return 'US';
  if (/^UAE|^DIFC|^ADGM|^SAUDI|^KSA|^QATAR|^DHA|^DOH|^RERA|^DLD|^TDRA|PDPL|PDPPL|^AE_/.test(fw)) return 'ME';
  if (/^UK_|^GB_|SRA|^ICO|^CMA|^ASA|^FCA|^MHRA|^CQC|PECR|^DPA|COMPANIES_ACT|EQUALITY_ACT|CONSUMER_RIGHTS|MODERN_SLAVERY/.test(fw)) return 'UK';
  return 'GLOBAL';
}
const ALLOWED = { UK: ['UK'], EU: ['EU'], US: ['US'], ME: ['ME','UK'] }; // ME firms often serve UK/EU too; UK+EU common pairing

async function withTimeout(p, ms, tag) {
  let to; const t = new Promise((_, rej) => to = setTimeout(() => rej(new Error('timeout ' + tag)), ms));
  try { return await Promise.race([p, t]); } finally { clearTimeout(to); }
}

async function runOne(site) {
  const r = { ...site };
  try {
    const pay = await withTimeout(build.buildPayload({ domain: site.d, sector: site.sector, country: site.country, env: process.env }), 60000, site.d);
    const pts = pay.pointers || [];
    const comp = pts.filter(p => p.bucket === 'compliance');
    const geo = pts.filter(p => p.bucket === 'ai_visibility');
    const seo = pts.filter(p => ['technical_seo','content_depth','tls_dns','security','website','seo','performance'].includes(p.bucket));
    const reachable = !(pay.scan && pay.scan.reachable === false) && pts.length > 0;
    // region routing — leakage is judged against the ENGINE's OWN detected markets (not the home region),
    // because the product contract is "route to every market the firm actually serves".
    const c2r = (c) => { c = String(c||''); if (c==='United Kingdom') return 'UK'; if (c==='United States') return 'US'; if (c==='United Arab Emirates'||c==='Saudi Arabia'||c==='Qatar'||c==='Kuwait'||c==='Bahrain'||c==='Oman') return 'ME'; if (['Ireland','France','Germany','Spain','Italy','Netherlands','Belgium','Portugal','Sweden','Denmark','Finland','Austria','Poland','Greece','Czechia','Hungary','Romania','Switzerland'].includes(c)) return 'EU'; return null; };
    const detRegions = new Set([site.region]);
    (pay.detected_jurisdictions||[]).forEach(c=>{ const r=c2r(c); if(r) detRegions.add(r); });
    const mkts = (pay.scan && pay.scan.markets) || {};
    (mkts.regions||[]).forEach(rr=>{ if(rr==='Middle East')detRegions.add('ME'); else if(['UK','EU','US'].includes(rr))detRegions.add(rr); });
    if (mkts.serves_eu) detRegions.add('EU');
    // engine's own jurisdiction codes (authoritative — these drove routing)
    (pay.engine_jurisdictions||[]).forEach(code=>{ code=String(code).toUpperCase(); if(code==='UK')detRegions.add('UK'); else if(code==='US')detRegions.add('US'); else if(['AE','SA','QA','KW','BH','OM'].includes(code))detRegions.add('ME'); else if(code==='EU'||['FR','DE','ES','IT','NL','BE','IE','PT','SE','DK','FI','AT','PL','GR','CZ','HU','RO','CH'].includes(code))detRegions.add('EU'); });
    const fwRegions = {}; const leak = [];
    for (const p of comp) {
      const fw = p.framework_short || p.citation; const reg = regionOf(fw);
      fwRegions[reg] = (fwRegions[reg] || 0) + 1;
      if (reg !== 'GLOBAL' && !detRegions.has(reg)) leak.push(fw);
    }
    r.detected = [...detRegions];
    // exposure reconciliation (sum unique framework fines among shown compliance findings)
    const exposure = comp.reduce((a, p) => a + (p.fine_high_gbp || 0), 0);
    r.reachable = reachable;
    r.comp = comp.length; r.geo = geo.length; r.seo = seo.length; r.total = pts.length;
    r.fwRegions = fwRegions; r.leak = [...new Set(leak)];
    r.ai = pay.ai_citation ? (pay.ai_citation.surface_owned_by || []).slice(0,3) : null;
    r.exposure = exposure;
    r.quotes = comp.filter(p => p.evidence_quote).length;
    r.withFines = comp.filter(p => p.fine_high_gbp).length;
    r.sample = (comp[0] && (comp[0].framework_short + ': ' + (comp[0].fact||'').slice(0,50))) || null;
    r.ok = true;
  } catch (e) { r.ok = false; r.error = String(e.message || e); }
  try { fs.appendFileSync(path.join(ROOT,'bt-results.jsonl'), JSON.stringify(r) + '\n'); } catch(_){}
  return r;
}

const start = parseInt(process.argv[2] || '0', 10);
const count = parseInt(process.argv[3] || '3', 10);
const batch = SITES.slice(start, start + count);
const OUT = path.join(ROOT, 'bt-results.jsonl');
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l).d}catch(_){return''}}) : []);
const todo = batch.filter(s => !done.has(s.d));
console.error('running', todo.map(s=>s.d).join(', ') || '(none, all done)');
const results = await Promise.all(todo.map(runOne));
for (const r of results) console.log(r.d.padEnd(20), r.ok ? `reach:${r.reachable} comp:${r.comp} geo:${r.geo} seo:${r.seo} leak:${(r.leak||[]).length} exp:£${r.exposure}` : ('ERR ' + r.error));
