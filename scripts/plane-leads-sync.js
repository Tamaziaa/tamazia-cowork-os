#!/usr/bin/env node
'use strict';
// Plane lead-pipeline board — makes Plane the human cockpit over the engine. Ensures a "Tamazia Leads" project
// with pipeline states (Sourced -> Contacted -> Replied -> Meeting -> Won), then upserts every Tier-A/B lead as
// an issue and moves it to the state that matches its Neon lifecycle. Idempotent (plane_issue_id on the lead).
const { execFileSync } = require('child_process');
const path = require('path');
const KEY = process.env.PLANE_API_KEY; const SLUG = process.env.PLANE_WORKSPACE_SLUG;
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const BASE = 'https://api.plane.so/api/v1';
function pg(sql){ return execFileSync(path.join(__dirname,'psql'),[NEON,'-tA','-c',sql],{encoding:'utf8'}); }
const q = s=>String(s==null?'':s).replace(/'/g,"''");
async function api(method, p, body){ try { const r=await fetch(BASE+p,{method,headers:{'X-API-Key':KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)}); let j=null; try{j=await r.json();}catch(_){} return {status:r.status,json:j}; } catch(e){ return {status:0,error:String(e.message||e)}; } }
const arr = j => (j && (j.results || j.data || j)) || [];
// lifecycle -> pipeline state
function stageFor(l){ if (l.lifecycle_stage==='meeting'||l.mystrika_status==='meeting_booked') return 'Meeting'; if (l.replied==='t'||l.lifecycle_stage==='replied') return 'Replied'; if (l.mystrika_pushed==='t') return 'Contacted'; return 'Sourced'; }
const STATES = [['Sourced','unstarted'],['Contacted','started'],['Replied','started'],['Meeting','started'],['Won','completed']];
(async()=>{
  if (!KEY || !SLUG) { console.log('Need PLANE_API_KEY + PLANE_WORKSPACE_SLUG.'); return; }
  if (!NEON) { console.log('No NEON_URL'); return; }
  // 1) find/create project
  let proj=null; const pl=await api('GET','/workspaces/'+SLUG+'/projects/');
  if (pl.status===200) proj=arr(pl.json).find(p=>/tamazia leads/i.test(p.name||''));
  if (!proj){ const c=await api('POST','/workspaces/'+SLUG+'/projects/',{name:'Tamazia Leads',identifier:'LEAD'}); if(c.status>=200&&c.status<300) proj=c.json; else { console.log('project create failed '+c.status+' '+JSON.stringify(c.json).slice(0,140)); return; } }
  const pid=proj.id; console.log('Project: Tamazia Leads ('+pid+')');
  // 2) ensure states
  const sl=await api('GET','/workspaces/'+SLUG+'/projects/'+pid+'/states/');
  const have={}; for(const s of arr(sl.json)) have[(s.name||'').toLowerCase()]=s.id;
  for(const [name,group] of STATES){ if(!have[name.toLowerCase()]){ const c=await api('POST','/workspaces/'+SLUG+'/projects/'+pid+'/states/',{name,group,color:'#3D0E0E'}); if(c.status>=200&&c.status<300) have[name.toLowerCase()]=c.json.id; } }
  // 3) Tier-A/B leads
  const raw=pg("SELECT id, company, domain, sector, country, COALESCE(audit_url,''), COALESCE(conversion_tier,''), COALESCE(conversion_score,0), COALESCE(contact_name,''), COALESCE(contact_email,email,''), COALESCE(plane_issue_id,''), COALESCE(lifecycle_stage,''), COALESCE(mystrika_status,''), COALESCE(mystrika_pushed,FALSE)::text, COALESCE(replied,FALSE)::text FROM leads WHERE conversion_tier IN ('A','B') ORDER BY conversion_score DESC NULLS LAST LIMIT 80").trim();
  if(!raw){ console.log('No Tier-A/B leads yet (run sourcing first).'); return; }
  let created=0, moved=0;
  for(const ln of raw.split('\n')){
    const [id,company,domain,sector,country,audit,tier,score,cname,cemail,issueId,life,mstatus,pushed,replied]=ln.split('\t');
    const l={lifecycle_stage:life,mystrika_status:mstatus,mystrika_pushed:pushed,replied};
    const stage=stageFor(l); const stateId=have[stage.toLowerCase()];
    const body='<p><b>'+company+'</b> · '+sector+' · '+country+' · Tier '+tier+' (score '+score+')</p><p>Domain: '+domain+'</p><p>Audit: <a href="'+audit+'">'+audit+'</a></p><p>Contact: '+cname+' '+cemail+'</p>';
    if(!issueId){
      const c=await api('POST','/workspaces/'+SLUG+'/projects/'+pid+'/issues/',{name:(company||domain)+' · Tier '+tier,description_html:body,state:stateId});
      if(c.status>=200&&c.status<300){ pg("UPDATE leads SET plane_issue_id='"+q(c.json.id)+"', plane_state='"+q(stage)+"' WHERE id="+id); created++; }
    } else {
      const c=await api('PATCH','/workspaces/'+SLUG+'/projects/'+pid+'/issues/'+issueId+'/',{state:stateId});
      if(c.status>=200&&c.status<300){ pg("UPDATE leads SET plane_state='"+q(stage)+"' WHERE id="+id); moved++; }
    }
  }
  console.log('Plane leads board synced: '+created+' new issues, '+moved+' state updates.');
})().catch(e=>{ console.error('plane-leads-sync error (non-fatal):',e.message); process.exit(0); });
