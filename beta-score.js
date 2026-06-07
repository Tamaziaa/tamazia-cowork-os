'use strict';
const path=require('path'); const ROOT=__dirname;
const { scoreLead } = require(path.join(ROOT,'src/lib/enrich/lead-quality.js'));
const NEON=process.env.NEON_URL; const host=NEON.replace(/.*@([^/]+)\/.*/,'$1');
process.on('unhandledRejection',()=>{});
async function q(query){const r=await fetch('https://'+host+'/sql',{method:'POST',headers:{'Neon-Connection-String':NEON,'Content-Type':'application/json'},body:JSON.stringify({query,params:[]})});const d=await r.json();return d.rows||d.results||[];}
const wt=(p,ms,fb)=>{const s=Promise.resolve().then(()=>p).catch(()=>fb);return Promise.race([s,new Promise(r=>setTimeout(()=>r(fb),ms))]);};
(async()=>{
  const rows=await q(`SELECT id,domain,sector,primary_email,decision_maker_confidence,email_verified,verify_status,all_emails,all_socials FROM leads WHERE enriched_at > NOW() - INTERVAL '90 minutes' AND primary_email IS NOT NULL ORDER BY id DESC LIMIT 12`);
  console.log('Scoring '+rows.length+' live-enriched prospects:\n');
  const tally={1:0,2:0,3:0};
  for(const L of rows){
    const lead={domain:L.domain,sector:L.sector,primary_email:L.primary_email,contact_email:L.primary_email,decision_maker_confidence:L.decision_maker_confidence,email_verified:L.email_verified,verify_status:L.verify_status,all_emails:L.all_emails||[],all_socials:L.all_socials||{}};
    let s; try{ s=await wt(scoreLead(lead),15000,{tier:3,score:0,_to:true}); }catch(e){ s={tier:3,score:0}; }
    tally[s.tier||3]++;
    console.log(`  ${L.domain} (${L.sector}) DM:${L.primary_email} conf:${L.decision_maker_confidence} ver:${L.email_verified} -> score:${s.score} TIER:${s.tier}${s._to?' (score-timeout)':''}`);
  }
  console.log(`\nTIER RESULT: T1(auto-send)=${tally[1]} T2(approval)=${tally[2]} T3(reject)=${tally[3]}`);
  console.log(`=> Tier-1 auto-send candidates: ${tally[1]} (so ZERO would auto-send even with push enabled)`);
})();
