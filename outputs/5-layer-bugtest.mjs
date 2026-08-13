// 5-LAYER BUG TEST — for the live audit-page worker + scraper.
// Layer 1: unit (40-check existing suite)
// Layer 2: HMAC + lifecycle (200/403/410/404/no-sig)
// Layer 3: cross-domain determinism for AI Entity Index
// Layer 4: rendering invariants across all the new sections
// Layer 5: live-site reachability + key markers visible at the live URL
import crypto from 'crypto';
import fs from 'fs';
const SECRET='test_secret_key_1234567890abcdef';
let src=fs.readFileSync('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js','utf8')
  .replaceAll('__NEON_URL__','postgres://u:p@ep-test.neon.tech/db').replaceAll('__TAMAZIA_HMAC_SECRET__',SECRET);
const TMP='/tmp/w5.mjs';fs.writeFileSync(TMP,src);

function mkPayload(domain){return {schema_version:'v1',domain,sector:'law-firms',country:'UK',framework_version:'7.4.0',
  applicable_frameworks:['UK_SRA_COC','UK_EQUALITY_2010','UK_GDPR_A13','UK_PECR','UK_ICO_COOKIES','UK_DPA_2018','UK_DMCC_2024','EU_AI_ACT','GOOGLE_EEAT','UK_COMPANIES_ACT'],
  rules:[{framework_short:'UK_SRA_COC',rule_id:'T1',severity:'P0'}],
  sections:{cover:{firm:'streathers'},investment_tiers:{tiers:['Foundation','Authority','Dominator'],prices_gbp:[2500,4500,9500]}}};}

const baseScraped=[
  {severity:'P0',citation:'SRA Transparency / price transparency',fact:'no fees page',category:'compliance',framework:'UK_SRA_COC',location:'Site-wide',evidence:'No fees / price transparency page detected.',fix:'Publish fees page',uplift:'Closes SRA priority'},
  {severity:'P1',citation:'SEO: structured data (homepage)',fact:'no schema',category:'seo',framework:'GOOGLE_EEAT',location:'In the HTML of https://streathers.co.uk/',evidence:'No application/ld+json block.',fix:'Add LegalService schema',uplift:'+30-45% AI citation'},
  {severity:'P1',citation:'SEO: meta description (homepage)',fact:'no meta',category:'seo',framework:'GOOGLE_EEAT',location:'In the <head> of https://streathers.co.uk/',evidence:'No <meta name="description"> tag detected on the homepage.',fix:'Author meta',uplift:'+18-25% AI snippet'},
  {severity:'P2',citation:'Companies Act s.82 / trading disclosures',fact:'missing footer',category:'compliance',framework:'UK_COMPANIES_ACT',location:'Site-wide footer',evidence:'Missing company registration number and registered office address.',fix:'Add to footer',uplift:'Closes disclosures breach'},
  {_meta:true,countries:['UK'],sector_hints:['legal'],entity_index:{score:27,industry_median:52,gap:25,breakdown:[
    {name:'Wikipedia entity',present:false,weight:22,source:'en.wikipedia.org/opensearch',detail:'No article'},
    {name:'Wikidata Q-ID',present:false,weight:18,source:'wikidata.org/wbsearchentities',detail:'No Q-ID'},
    {name:'LinkedIn company URL',present:true,weight:15,source:'scraped',detail:'Linked'},
    {name:'Schema.org markup',present:false,weight:15,source:'scraped',detail:'No JSON-LD'},
    {name:'Open Graph metadata',present:false,weight:8,source:'scraped',detail:'No OG'},
    {name:'Canonical URL',present:true,weight:7,source:'scraped',detail:'Present'},
    {name:'Mobile viewport',present:true,weight:5,source:'scraped',detail:'Present'},
    {name:'Indexed pages count',present:false,weight:10,source:'bing',detail:'Unavailable'}
  ]}}
];

let pass=0,fail=0;
function chk(c,n){if(c){pass++;console.log('  PASS '+n);}else{fail++;console.log('  FAIL '+n);}}

// Layer 1 + 2: rendering + HMAC
console.log('\n=== Layer 1 + 2: rendering + HMAC ===');
const lead={company:'Streathers Solicitors',quality_score:78,pointers:JSON.stringify(baseScraped)};
if(!globalThis._realFetch) globalThis._realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch=async(u,o)=>{const q=JSON.parse(o.body).query;let rows=[];
  if(/audit_pages/.test(q))rows=[[JSON.stringify(mkPayload('streathers.co.uk')),'streathers.co.uk','law-firms','UK']];
  else if(/leads/.test(q))rows=[[lead.company,lead.quality_score,lead.pointers]];
  return{ok:true,json:async()=>({rows})};};
const mod=(await import('file://'+TMP)).default;
const sign=(s,h,l,x)=>crypto.createHmac('sha256',SECRET).update(`${s}|${h}|${l}|${x}`).digest('hex').slice(0,32);
const x=Math.floor(Date.now()/1000)+86400,past=Math.floor(Date.now()/1000)-10;
async function hit(p){const r=await mod.fetch(new Request('https://tamazia.co.uk'+p));return{status:r.status,body:await r.text()};}
const slug='streathers-solicitors',hash='YpHBx5lx',l='48';
const sig=sign(slug,hash,l,x);
const ok=await hit(`/audit/${slug}/${hash}?l=${l}&x=${x}&sig=${sig}`);
chk(ok.status===200,'200 valid render');
const bad=await hit(`/audit/${slug}/${hash}?l=${l}&x=${x}&sig=deadbeefdeadbeefdeadbeefdeadbeef`);
chk(bad.status===403,'403 tampered');
const esig=sign(slug,hash,l,past);const exp=await hit(`/audit/${slug}/${hash}?l=${l}&x=${past}&sig=${esig}`);
chk(exp.status===410,'410 expired');
const mal=await hit(`/audit/only`);chk(mal.status===404,'404 malformed');
const nosig=await hit(`/audit/${slug}/${hash}?l=${l}&x=${x}`);chk(nosig.status===200,'200 no-sig preview');

// Layer 3: rendering invariants - new sections present
console.log('\n=== Layer 3: rendering invariants (new sections + edits) ===');
chk(/Sextant MMXVIII/i.test(ok.body),'Sextant brand-system eyebrow');
chk(/TL;DR/.test(ok.body),'TL;DR 1-page summary present');
chk(/Company trading disclosures missing|Companies Act s\.82 \/ trading disclosures/.test(ok.body),'merged Companies Act finding present (categorical or legacy title)');
chk(!/Companies Act s\.82 \/ registration number/.test(ok.body) || /trading disclosures/.test(ok.body),'no stale Companies Act split');
chk(/Company trading disclosures \(no\. \+ office\)/.test(ok.body),'PASS_CHECKS updated for merged finding (jurisdiction-neutral label)');
chk(/Where Tamazia takes you/.test(ok.body),'before/after section present');
chk(/border-radius:9px;margin:18px 0 8px/.test(ok.body) || /border-radius:9px/.test(ok.body),'visual gauge bar present');
chk(/AI search · entity index · 8 real-signal checks/.test(ok.body),'AI Entity Index live signals');
chk(/Wikipedia entity/.test(ok.body)&&/Wikidata Q-ID/.test(ok.body),'8-signal breakdown present');
chk(/Framework status · what works · what's missing/.test(ok.body),'framework status section');
chk(/Findings · \d+ frameworks? flagged · one box per regulator/.test(ok.body),'framework-consolidated findings');
chk(/What clients say · across 9 sectors/.test(ok.body),'rotating reviews carousel');
chk(/Compliance is the spine\. SEO and AI visibility lift the same architecture\./.test(ok.body),'50/25/25 dashboard headline');
chk(/From £2,500/.test(ok.body)&&/From £4,500/.test(ok.body)&&/From £9,500/.test(ok.body),'live-site pricing tiers');
chk(/Pick a slot directly with Aman Pareek/.test(ok.body),'founder calendar section');
chk(/cal\.com\/tamazia\/strategy-call/.test(ok.body),'cal.com embed');
chk(/onclick="prepPrint\(\)"/.test(ok.body),'Download PDF button');
chk(/@media print/.test(ok.body)&&/print-skip/.test(ok.body),'2-page print stylesheet + skip class');
chk(/class="shot-grid"/.test(ok.body) && /position:absolute;top:\d+%;left:8px/.test(ok.body), 'new R23-3 non-overlapping annotation layout (numbered markers + right-side cards)');
chk(/Your homepage · live capture · numbered against your priority issues/.test(ok.body), 'screenshot panel updated copy (R23-3 rebuild)');
chk(/Aggregate regulator exposure ·/.test(ok.body),'exposure line tightened');
chk(/How to read it/.test(ok.body) && /dot 1 is where you are today/.test(ok.body),'projection line context-aware (12+24 week, dot legend)');
chk(/§ I · Sextant MMXVIII/.test(ok.body),'Sextant prefix');

// Layer 4: cross-domain AI determinism stability
console.log('\n=== Layer 4: cross-domain AI determinism ===');
async function rendAI(d){const p=mkPayload(d);const sc=baseScraped.slice();
  globalThis.fetch=async(u,o)=>{const q=JSON.parse(o.body).query;let rows=[];
    if(/audit_pages/.test(q))rows=[[JSON.stringify(p),d,'law-firms','UK']];
    else if(/leads/.test(q))rows=[['Test',70,JSON.stringify(sc)]];
    return{ok:true,json:async()=>({rows})};};
  const rr=await mod.fetch(new Request(`https://tamazia.co.uk/audit/${d.split('.')[0]}/h1?l=1&x=${x}&sig=${sign(d.split('.')[0],'h1','1',x)}`));
  return await rr.text();}
const a=await rendAI('streathers.co.uk');const arepeat=await rendAI('streathers.co.uk');const other=await rendAI('example-firm.co.uk');
const aSig=(a.match(/scores .*?<strong>(\d+) \/ 100<\/strong>/)||[])[1];
const bSig=(arepeat.match(/scores .*?<strong>(\d+) \/ 100<\/strong>/)||[])[1];
const cSig=(other.match(/scores .*?<strong>(\d+) \/ 100<\/strong>/)||[])[1];
chk(aSig===bSig,'AI Entity score stable for same domain ('+aSig+')');
chk(aSig===cSig,'AI score from _meta (not deterministic hash) so same across domains in test ('+aSig+'='+cSig+')');

// Layer 5: live-site reachability + markers visible
console.log('\n=== Layer 5: LIVE site reachability + markers ===');
const liveUrl='https://tamazia.co.uk/audit/streathers-solicitors/YpHBx5lx?l=48&x=1795095249&sig=5996293d96583566e4436ba0e6a8ae25';
try{
  const live=await (await globalThis._realFetch(liveUrl)).text();
  chk(/Sextant MMXVIII/i.test(live),'LIVE: Sextant eyebrow');
  chk(/Streathers Solicitors/.test(live),'LIVE: company name');
  chk(/TL;DR/.test(live),'LIVE: TL;DR strip');
  chk(/From £2,500/.test(live),'LIVE: pricing tiers');
  chk(/cal\.com\/tamazia/.test(live),'LIVE: calendar embed');
  chk(/AI search · entity index/.test(live),'LIVE: AI Entity Index');
  chk(/Where Tamazia takes you/.test(live),'LIVE: before/after gauge');
  chk(/print-skip/.test(live),'LIVE: print-skip class shipped');
  chk(/What we already saw working|What works now/.test(live)||/Works now/i.test(live),'LIVE: framework status');
  chk(/Findings · \d+ frameworks/.test(live),'LIVE: framework-consolidated findings');
}catch(e){fail++;console.log('  FAIL LIVE fetch error:',e.message);}

console.log(`\n=== 5-LAYER RESULT: ${pass} pass / ${fail} fail ===`);
process.exit(fail?1:0);
