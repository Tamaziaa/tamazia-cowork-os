#!/usr/bin/env node
// Renders LinkedIn (S006) + Instagram (S067) drafts for FIT-qualified leads that have a social handle
// and no social draft yet. Wired into the engine cycle. Self-healing: per-lead try/catch.
// Usage: node scripts/render-social-drafts.js [LIMIT]   (default 20)
const path=require('path'); const fs=require('fs'); const {execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');
(()=>{try{const t=fs.readFileSync(path.join(ROOT,'.env'),'utf8');for(const l of t.split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}catch(_e){}})();
function pg(sql){try{return execFileSync(path.join(ROOT,'scripts','psql'),[process.env.NEON_URL,'-tA','-c',sql],{encoding:'utf8'}).toString().trim();}catch(e){return '';}}
let li=null,ig=null;
try{ li=require(path.join(ROOT,'src','skills','S006-linkedin-drafter-v2','scripts','draft.js')); }catch(_e){}
try{ ig=require(path.join(ROOT,'src','skills','S067-instagram-drafter','scripts','draft.js')); }catch(_e){}
const limit=Number(process.argv[2]||20);
const raw=pg(`SELECT id::text FROM leads l WHERE l.quality_fit=TRUE AND COALESCE(l.lifecycle_stage,'')='qualified' AND (COALESCE(l.linkedin_url,'')<>'' OR COALESCE(l.instagram_handle,'')<>'') AND NOT EXISTS (SELECT 1 FROM outreach_drafts od WHERE od.lead_id=l.id AND (od.channel LIKE 'linkedin%' OR od.channel LIKE 'instagram%')) ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST LIMIT ${limit}`);
const ids=(raw||'').split('\n').filter(Boolean).map(x=>Number(x)).filter(Boolean);
let liN=0,igN=0;
for(const id of ids){ try{ if(li) li.buildAll(id); liN++; }catch(e){} try{ if(ig){ const r=ig.buildAll(id); if(r&&r.draft_ids) igN++; } }catch(e){} }
console.log(`render-social-drafts · ${ids.length} FIT leads scanned · linkedin ${liN} · instagram ${igN}`);
