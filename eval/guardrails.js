#!/usr/bin/env node
'use strict';
// eval/guardrails.js — deterministic legal-QA harness (ledger 1.1). Source: SPEC §9; V2 R-list; V3 §6.71.
// 9 assertions: the 8 legal-QA invariants + G9 (emergent jurisdiction-nexus, found 2026-06-30).
// default: writes eval/golden/_baseline.json (the regression oracle) + prints a matrix.
// --check: compares to the committed baseline; exits 1 on any NEW violation (regression).
const fs=require('fs'), path=require('path');
const GOLD=path.join(__dirname,'golden');
const firms=fs.readdirSync(GOLD).filter(f=>/^firm-\d+\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(GOLD,f),'utf8')));
const lc=s=>String(s||'').toLowerCase();

const TOPIC=[['privacy',/gdpr|data protection|\bdpa\b|privacy|personal data|\bico\b|\bpecr\b|cookie|consent|data subject/],
 ['pricing',/pricing|price|\bvat\b|\bfee\b|transparen|drip|total price|disbursement/],
 ['schema_seo',/schema|structured data|\bseo\b|\bh1\b|heading|meta description|sitemap|wikidata|knowledge panel|backlink/],
 ['reviews',/review|testimonial|endorse|fake review/],['accessibility',/accessib|wcag|\bada\b|contrast|screen reader|alt text/],
 ['advertising',/advert|\basa\b|cap code|promo|marketing claim|success rate/],
 ['licensing',/permit|licen|\bsra\b|\bfca\b|\bcqc\b|\brera\b|trakheesi|\bgdc\b/]];
const topicOf=t=>{t=lc(t);for(const[k,rx]of TOPIC)if(rx.test(t))return k;return null;};
const CONFLICT=new Set(['pricing|privacy','privacy|schema_seo','privacy|reviews','licensing|schema_seo','advertising|schema_seo','pricing|schema_seo']);
const conflict=(a,b)=>a&&b&&a!==b&&CONFLICT.has([a,b].sort().join('|'));
const VOLUNTARY=new Set(['UK_ABI','ABI','UK_PORTMAN','PORTMAN_GROUP']);
const FREEZONE=['DIFC_DPL','ADGM_DPR'];
const RARE_MAX=new Set([17500000,20000000]);
const jurOf=c=>{c=lc(c);const o=new Set();
 if(/\buk\b|\bico\b|\bpecr\b|\bsra\b|\bfca\b|\bcqc\b|\bdmcc\b|companies act|equality act|uk gdpr/.test(c))o.add('UK');
 if((/\beu\b|eprivacy|\bdsa\b|\beaa\b/.test(c)||(/gdpr/.test(c)&&!/uk gdpr/.test(c)))&&!/uk/.test(c))o.add('EU');
 if(/\bus\b|\bftc\b|\bccpa\b|\bcpra\b|\bada\b|fair housing/.test(c))o.add('US');
 if(/uae|difc|adgm|rera|\bdha\b|mohap|dtcm|pdpl|gulf/.test(c))o.add('ME');return o;};
const firmJur=f=>{const s=new Set([f.region]);(f.engine_jurisdictions||[]).forEach(j=>{j=String(j).toUpperCase();
 if(['GB','UK'].includes(j))s.add('UK');else if(['AE','UAE'].includes(j))s.add('ME');else if(['US','USA'].includes(j))s.add('US');else s.add('EU');});return s;};

const A={
 G1_citation_presence:f=>(f.compliance_findings||[]).filter(x=>/section\s*\d+|\bs\.?\s?\d+\b.*(definition|disclosure|exemption)|personal data definition|manual unstructured|recite/i.test(lc(x.fact)+' '+lc(x.citation))).map(x=>({detail:'citation-presence: '+lc(x.citation).slice(0,50)})),
 G2_fix_keyed:f=>(f.compliance_findings||[]).filter(x=>conflict(topicOf(x.citation+' '+x.fact),topicOf(x.fix))).map(x=>({detail:`fix[${topicOf(x.fix)}]!=finding[${topicOf(x.citation+' '+x.fact)}]`})),
 G3_one_establishment:f=>{const n=FREEZONE.filter(z=>(f.applicable_frameworks||[]).includes(z));return n.length>1?[{detail:'free-zone regimes: '+n.join('+')}]:[];},
 G4_no_voluntary_law:f=>(f.applicable_frameworks||[]).filter(fw=>VOLUNTARY.has(fw)).map(fw=>({detail:'voluntary-as-law: '+fw})),
 G6_dim_findings:f=>{const fw=(f.applicable_frameworks||[]).length,fi=(f.compliance_findings||[]).length;return(fw>0&&fi===0)?[{detail:fw+' frameworks, 0 findings'}]:[];},
 G7_no_rare_max:f=>(f.compliance_findings||[]).filter(x=>x.fine_high_gbp&&RARE_MAX.has(x.fine_high_gbp)&&!x.fine_low_gbp&&!x.fine_withheld).map(x=>({detail:'lone rare-max: '+x.fine_high_gbp})),
 G8_no_dup_framework:f=>{const a=f.applicable_frameworks||[],s={},d=[];a.forEach(fw=>{s[fw]=(s[fw]||0)+1;if(s[fw]===2)d.push(fw);});return d.map(fw=>({detail:'dup: '+fw}));},
 G9_finding_nexus:f=>{const fj=firmJur(f);return(f.compliance_findings||[]).flatMap(x=>{const cj=[...jurOf(x.citation)].filter(j=>!fj.has(j));return cj.length?[{detail:`cites ${cj.join(',')} vs nexus ${[...fj].join(',')}: ${lc(x.citation).slice(0,30)}`}]:[];});},
};
const RULES=Object.keys(A);
const DETAIL={};
function runAll(){const viol={};let total=0;
 for(const f of firms)for(const[rule,fn]of Object.entries(A)){const vs=fn(f);if(vs.length){(viol[f.id]=viol[f.id]||{})[rule]=vs.length;total+=vs.length;(DETAIL[f.id]=DETAIL[f.id]||[]).push(...vs.map(v=>({rule,...v})));}}
 let g5;const _l=console.log;console.log=()=>{};try{g5=require('./predicate-gate.js').run();}catch(e){g5={ok:false,orphans:[e.message]};}console.log=_l;
 return{viol,total,g5};}
const r=runAll();
console.log('\nLEGAL-QA HARNESS (ledger 1.1) — golden set: '+firms.length+' firms');
console.log('firm      '+RULES.map(x=>x.split('_')[0]).join(' '));
for(const f of firms){const row=RULES.map(rl=>String((r.viol[f.id]&&r.viol[f.id][rl])||'·').padStart(2));console.log(f.id.padEnd(9),row.join('  '));}
console.log('\nG5 predicate gate: '+(r.g5.ok?'PASS':'FAIL ('+r.g5.orphans.length+' orphans)'));
console.log('baseline assertion hits: '+r.total+'  (these capture CURRENT behaviour incl. known defects)');
const BL=path.join(GOLD,'_baseline.json');
if(process.argv.includes('--check')){const prev=JSON.parse(fs.readFileSync(BL,'utf8'));let reg=0;
 for(const f of firms)for(const rl of RULES){const now=(r.viol[f.id]&&r.viol[f.id][rl])||0,was=(prev.perFirm[f.id]&&prev.perFirm[f.id][rl])||0;if(now>was){reg++;console.log(`REGRESSION ${f.id}/${rl}: ${was}->${now}`);}}
 console.log(reg?`\nFAIL: ${reg} regression(s).`:'\nPASS: no new violations vs baseline.');process.exit(reg?1:0);
}else{fs.writeFileSync(BL,JSON.stringify({generated:new Date().toISOString().slice(0,10),firms:firms.length,total:r.total,g5_orphans:r.g5.orphans?r.g5.orphans.length:null,perFirm:r.viol,detail:DETAIL},null,1));console.log('baseline written -> eval/golden/_baseline.json');}
