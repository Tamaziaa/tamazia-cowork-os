import { renderV21 } from './cloudflare/render-v21.mjs';
import { adapt, assessDimensions, scoreFromDims } from './cloudflare/audit-worker-v14.js';
import fs from 'fs';
const gradeOf=s=>s>=60?'D':s>=40?'D-':s>=25?'F':'F-';
const wk12=n=>Math.min(100,Math.round(n+(100-n)*0.45)), proj=n=>Math.min(100,Math.round(n+(100-n)*0.80));
const pj=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/harley_final.json','utf8'));
const a=adapt({payload_json:pj,company:'Harley Street Dental Clinic',domain:'harleystreetdentalclinic.co.uk',sector:'healthcare',country:'UK'});
const dims=assessDimensions(a.pointers,a.signals,a.ai_readiness); const score=scoreFromDims(dims);
const expBy={}; for(const p of a.pointers){if(!p.fine_high_gbp)continue;const k=p.framework_short||(p.citation||'').split(/\s+/)[0]||'?';expBy[k]=Math.max(expBy[k]||0,p.fine_high_gbp);}
const exposure_total=Object.values(expBy).reduce((x,n)=>x+n,0), exposure_frameworks=Object.keys(expBy).length;
const top3=[...a.pointers].sort((x,y)=>{const r=s=>s==='P0'?0:s==='P1'?1:2;return r(x.severity)-r(y.severity)||(y.fine_high_gbp||0)-(x.fine_high_gbp||0);}).slice(0,3);
const ctx={dims,score,wk12:wk12(score),projected:proj(score),grade:gradeOf(score),exposure_total,exposure_frameworks,top3};
const html=renderV21(a,ctx); fs.writeFileSync('/tmp/render_v21.html',html);
console.log('score',score,'grade',ctx.grade,'exposure',exposure_total,'fw',exposure_frameworks,'bytes',html.length);
console.log('top3',top3.map(t=>t.severity+':'+(t.desc||t.citation||'').slice(0,34)));
