import { connect } from '../src/lib/compliance/connect.js';
const NEON=process.env.NEON_URL, host=NEON.replace(/.*@([^/]+)\/.*/,'$1');
async function sql(q){const r=await fetch('https://'+host+'/sql',{method:'POST',headers:{'Neon-Connection-String':NEON,'Content-Type':'application/json'},body:JSON.stringify({query:q,params:[]})});return (await r.json()).rows||[];}
// load real catalogue
const fwRows=await sql("SELECT framework_short, COALESCE(jurisdiction,'') jurisdiction FROM framework_versions");
const rRows=await sql("SELECT framework_short, rule_id, COALESCE(rule_type,'must_appear') rule_type, COALESCE(trigger_pattern,'') trigger_pattern, COALESCE(array_to_string(sector_relevance,'|'),'') sectors, COALESCE(severity,'P2') severity FROM compliance_rules WHERE active=TRUE");
const catalogue={frameworks:fwRows, rules:rRows.map(r=>({framework_short:r.framework_short,rule_id:r.rule_id,rule_type:r.rule_type,trigger_pattern:r.trigger_pattern||null,sector_relevance:r.sectors?r.sectors.split('|').filter(Boolean):[],severity:r.severity}))};
const fvJ={}; for(const f of fwRows) fvJ[f.framework_short]=String(f.jurisdiction||'').toUpperCase();
const EU=new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);
function expand(js){const J=new Set(js.map(x=>x==='GB'?'UK':x==='USA'?'US':x==='UAE'?'AE':x));if([...J].some(j=>EU.has(j)))J.add('EU');return J;}

const AI_TEXT='we use an ai chatbot and automated decision making to assist clients';
const PAY_TEXT='add to basket and checkout, monthly subscription billing via card';
// 50 unconventional scenarios
const S=[
 ['UK-only law, no signals',['UK'],'law-firms',{},''],
 ['US-only ecommerce',['US'],'ecommerce',{},''],
 ['EU(DE) saas + AI text',['DE'],'saas',{},AI_TEXT],
 ['UAE real-estate',['AE'],'real-estate',{},''],
 ['Global saas UK+EU+US + AI + pay',['UK','FR','US'],'saas',{uses_ai:true,payments:true},AI_TEXT+' '+PAY_TEXT],
 ['UK charity',['UK'],'charity',{},''],
 ['UK+US healthcare',['UK','US'],'healthcare',{},''],
 ['no sector, UK',['UK'],'',{},''],
 ['empty jurisdiction',[],'law-firms',{},''],
 ['US ecommerce + biometrics',['US'],'ecommerce',{biometrics:true},'facial recognition login'],
 ['UK+EU fintech',['UK','IE'],'fintech',{payments:true},PAY_TEXT],
 ['UK law serving EU (no AI)',['UK','DE'],'law-firms',{},''],
 ['UK law serving EU WITH AI',['UK','DE'],'law-firms',{uses_ai:true},AI_TEXT],
 ['France-only ecommerce',['FR'],'ecommerce',{payments:true},PAY_TEXT],
 ['Germany-only saas',['DE'],'saas',{},''],
 ['UAE+UK law',['AE','UK'],'law-firms',{},''],
 ['Singapore-only (not in catalogue)',['SG'],'saas',{},''],
 ['UK pharma',['UK'],'pharma',{},''],
 ['UK+EU+US pharma',['UK','FR','US'],'pharma',{},''],
 ['US-only healthcare (HIPAA)',['US'],'healthcare',{},''],
 ['UK education',['UK'],'education',{},''],
 ['US education (COPPA-ish)',['US'],'education',{},''],
 ['UK hospitality',['UK'],'hospitality',{},''],
 ['UK manufacturing',['UK'],'manufacturing',{},''],
 ['UK energy',['UK'],'energy',{},''],
 ['UK transport',['UK'],'transport',{},''],
 ['UK media + UGC',['UK'],'media',{ugc:true},'leave a comment on our forum'],
 ['UK marketing no UGC',['UK'],'marketing',{},''],
 ['UK insurance',['UK'],'insurance',{},''],
 ['UK accounting',['UK'],'accounting',{},''],
 ['EU(IT)-only finance',['IT'],'finance',{payments:true},PAY_TEXT],
 ['UK+EU+US+UAE conglomerate saas AI',['UK','FR','US','AE'],'saas',{uses_ai:true},AI_TEXT],
 ['UK dental',['UK'],'dental',{},''],
 ['US-only saas no signals',['US'],'saas',{},''],
 ['EU(NL) ecommerce + payments',['NL'],'ecommerce',{payments:true},PAY_TEXT],
 ['UK law + AI signal but UK-only (no EU)',['UK'],'law-firms',{uses_ai:true},AI_TEXT],
 ['US fintech',['US'],'fintech',{payments:true},PAY_TEXT],
 ['UK retail + subscription',['UK'],'retail',{payments:true},PAY_TEXT],
 ['UK construction',['UK'],'construction',{},''],
 ['UK food',['UK'],'food',{},''],
 ['UK barristers',['UK'],'barristers',{},''],
 ['UK higher-education',['UK'],'higher-education',{},''],
 ['UK aviation',['UK'],'aviation',{},''],
 ['EU(ES) media UGC',['ES'],'media',{ugc:true},'community forum reviews'],
 ['US ecommerce no biometrics',['US'],'ecommerce',{},PAY_TEXT],
 ['UK+US fintech AI payments',['UK','US'],'fintech',{uses_ai:true,payments:true},AI_TEXT+' '+PAY_TEXT],
 ['UK tech UGC',['UK'],'tech',{ugc:true},'user reviews and comments'],
 ['contradiction: sector=law text=ecommerce',['UK'],'law-firms',{payments:true},PAY_TEXT],
 ['UAE-only saas AI',['AE'],'saas',{uses_ai:true},AI_TEXT],
 ['UK+EU+US healthcare AI (MDR/HIPAA/AI Act)',['UK','DE','US'],'healthcare',{uses_ai:true},AI_TEXT],
];
let PASS=0,FAIL=0; const fails=[];
function inv(name, cond, extra){ if(cond)PASS++; else {FAIL++; fails.push(name+(extra?' :: '+extra:''));} }
for(const [name,js,sector,sig,text] of S){
  const res=connect({catalogue, jurisdictions:js, sector, signals:sig, text});
  const J=expand(js);
  // INVARIANT 1: zero jurisdiction leakage
  const leak=res.frameworks.filter(fw=>{const jr=fvJ[fw]||''; return jr!=='GLOBAL' && !J.has(jr);});
  inv('['+name+'] no jurisdiction leakage', leak.length===0, 'leaked='+leak.join(','));
  // INVARIANT 2: EU_AI_ACT only when EU served AND (AI signal or AI text)
  const euAi=res.frameworks.includes('EU_AI_ACT');
  const aiExpectedPossible = J.has('EU') && (sig.uses_ai || /\bai\b|automated decision|chatbot/i.test(text));
  if(euAi) inv('['+name+'] EU_AI_ACT only when EU+AI', aiExpectedPossible, 'EU_AI_ACT present without EU+AI');
  if(J.has('EU') && !aiExpectedPossible) inv('['+name+'] EU_AI_ACT absent when no AI', !euAi, 'present without AI trigger');
  // INVARIANT 3: never-empty for a firm with a real jurisdiction
  if(js.length && js.some(j=>['UK','US','AE'].includes(j==='GB'?'UK':j)||EU.has(j))) inv('['+name+'] non-empty', res.frameworks.length>0, 'empty result');
}
// targeted checks
const get=(js,sector,sig,text)=>connect({catalogue,jurisdictions:js,sector,signals:sig,text}).frameworks;
inv('US-only ecommerce excludes UK_CMA', !get(['US'],'ecommerce',{},'').includes('UK_CMA'));
inv('UK-only law excludes EU_GDPR', !get(['UK'],'law-firms',{},'').includes('EU_GDPR'));
inv('UK-only law excludes US_HIPAA', !get(['UK'],'healthcare',{},'').includes('US_HIPAA'));
inv('US healthcare WITH patient/PHI text includes US_HIPAA', get(['US'],'healthcare',{},'we protect patient records and protected health information').includes('US_HIPAA'));
inv('US healthcare with NO PHI text excludes US_HIPAA (trigger gate)', !get(['US'],'healthcare',{},'').includes('US_HIPAA'));
inv('UK law includes UK_SRA_COC', get(['UK'],'law-firms',{},'').includes('UK_SRA_COC'));
inv('UK-only law no EU_AI_ACT even with AI', !get(['UK'],'law-firms',{uses_ai:true},AI_TEXT).includes('EU_AI_ACT'));
inv('UK+EU law with AI HAS EU_AI_ACT', get(['UK','DE'],'law-firms',{uses_ai:true},AI_TEXT).includes('EU_AI_ACT'));
inv('Singapore-only => GLOBAL-only (no UK/EU/US frameworks)', get(['SG'],'saas',{},'').every(fw=>(fvJ[fw]||'')==='GLOBAL'));

console.log('\n===== 50-SCENARIO CONNECTION TEST =====');
console.log('PASS '+PASS+'  FAIL '+FAIL+'  (scenarios '+S.length+')');
if(fails.length){console.log('\nFAILURES:');fails.slice(0,40).forEach(f=>console.log('  x '+f));}
else console.log('All invariants held across 50 unconventional scenarios.');
