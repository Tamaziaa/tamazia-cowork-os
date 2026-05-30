#!/usr/bin/env node
// S067 Instagram DM drafter · the social twin of S006 (LinkedIn). Insta-relevant sectors only
// (hospitality, F&B, real estate, aesthetics/healthcare, retail, wellness). Finding-led, NO client
// names, 400+ frameworks line, NO em dashes. Saves to outreach_drafts (channel instagram_dm /
// instagram_dm_followup / instagram_comment). Instagram has no compliant bulk-DM path, so the social
// CSV hands you handle + DM for MANUAL sending by design.
// Usage: node src/skills/S067-instagram-drafter/scripts/draft.js [LEAD_ID]
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql){ const url=process.env.NEON_URL||process.env.NEON_CONNECTION_STRING; if(!url) return null; try{ return execFileSync(path.join(ROOT,'scripts','psql'),[url,'-tA','-c',sql],{encoding:'utf8'}).toString().trim(); }catch(_e){ return null; } }
function pgEsc(v){ if(v==null) return 'NULL'; return `'${String(v).replace(/'/g,"''")}'`; }
const INSTA_SECTORS=['hospitality','hotels','food','f&b','restaurant','real-estate','real estate','healthcare','aesthetic','dental','retail','ecommerce','e-commerce','luxury','wellness','fitness','beauty','spa'];
const HOOK={
  hospitality:'CMA drip-pricing and resort-fee rules are now enforced under the DMCC Act 2025',
  hotels:'CMA drip-pricing and resort-fee rules are now enforced under the DMCC Act 2025',
  food:"allergen rules under Natasha's Law and CMA service-charge transparency are actively enforced",
  restaurant:"allergen rules under Natasha's Law and CMA service-charge transparency are actively enforced",
  'real-estate':'NTSEAT Material Information A, B and C is mandatory on listings and CMA enforcement opened in late 2025',
  healthcare:'the MHRA treats prescription-only brand names on social posts as a criminal offence',
  aesthetic:'the MHRA treats prescription-only brand names like Botox on posts as a criminal offence',
  retail:'CMA fake-review and drip-pricing rules are now fineable up to 10 percent of global turnover',
  ecommerce:'CMA fake-review and drip-pricing rules are now fineable up to 10 percent of global turnover',
  wellness:'the ASA Health Code enforces unsubstantiated health and results claims',
  fitness:'the ASA Health Code enforces unsubstantiated health and results claims'
};
function hookFor(sector){ const s=String(sector||'').toLowerCase(); for(const k of Object.keys(HOOK)){ if(s.includes(k)) return HOOK[k]; } return 'your sector regulator is running active enforcement right now'; }
function loadLead(id){
  const raw=pg(`SELECT id::text, COALESCE(company,''), COALESCE(domain,''), COALESCE(sector,''), COALESCE(first_name,''), COALESCE(instagram_handle,''), COALESCE(audit_url,''), COALESCE(personalisation_pointers->>'top_finding','') FROM leads WHERE id=${id}`);
  if(!raw) return null;
  const [lid,company,domain,sector,first,handle,audit,finding]=raw.split('\t');
  return { id:lid, company, domain, sector, first_name:first, instagram_handle:handle, audit_url:audit, top_finding:finding };
}
function buildDM(lead){
  const who=lead.first_name || (lead.company? lead.company.split(' ')[0] : 'team');
  const findingLine=lead.top_finding ? ` One quick fix stood out on your site: ${lead.top_finding}.` : ' One quick compliance fix stood out on your site.';
  return `Hi ${who}, Aman here, founder of Tamazia (lawyer-led SEO for ${lead.sector||'your sector'}).${findingLine} For context, ${hookFor(lead.sector)}. We run every campaign through 400+ frameworks before anything goes live. Want the two-line summary? No pitch.`;
}
function buildFollowupDM(lead){
  const link=lead.audit_url ? ` Full free audit: ${lead.audit_url}` : '';
  return `Here is the gist: the fix protects you from the regulator and lifts your ranking at the same time, because compliant pages are the ones Google and the AI engines trust.${link} Happy to walk it through in 15 minutes if useful. Calendar: https://tamazia.co.uk/book/`;
}
function buildComment(lead){
  return `Strong post. The compliance angle is the one most ${lead.sector||'brands'} miss right now, the CMA, ASA and sector regulators are all running sweeps in parallel. Worth a look at your public pages.`;
}
function saveDraft(lead_id,channel,body,meta){ return pg(`INSERT INTO outreach_drafts (lead_id, channel, draft_body, draft_metadata, generated_at) VALUES (${lead_id}, ${pgEsc(channel)}, ${pgEsc(body)}, ${pgEsc(JSON.stringify(meta||{}))}::jsonb, NOW()) RETURNING id`); }
function buildAll(lead_id){
  const lead=loadLead(lead_id);
  if(!lead) return { error:'lead_not_found' };
  const s=String(lead.sector||'').toLowerCase();
  if(!INSTA_SECTORS.some(k=>s.includes(k))) return { lead_id, skipped:'sector_not_instagram_relevant', sector:lead.sector };
  if(!lead.instagram_handle) return { lead_id, skipped:'no_instagram_handle' };
  const dm=buildDM(lead), follow=buildFollowupDM(lead), comment=buildComment(lead);
  const ids={ dm:saveDraft(lead_id,'instagram_dm',dm,{finding:lead.top_finding}), followup:saveDraft(lead_id,'instagram_dm_followup',follow,{}), comment:saveDraft(lead_id,'instagram_comment',comment,{}) };
  return { lead_id, handle:lead.instagram_handle, drafts:{ dm, followup:follow, comment }, draft_ids:ids };
}
if(require.main===module){ console.log(JSON.stringify(buildAll(Number(process.argv[2]||0)),null,2)); }
module.exports={ buildAll, loadLead };
