#!/usr/bin/env node
'use strict';
// Direct push: FIT + audit-verified leads -> Mystrika campaign via the inbound API (bulk add, custom fields =
// verified audit link + gated per-touch bodies + personalisation). Replaces the CSV step. Idempotent, fail-soft.
// Usage: MYSTRIKA_API_KEY=... node scripts/push-to-mystrika.js --campaign <campaign_id> [--max 200] [--dry]
const { execFileSync } = require('child_process');
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'src', 'lib', 'mystrika', 'client.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql){ return execFileSync(path.join(__dirname,'psql'),[NEON,'-tA','-c',sql],{encoding:'utf8'}); }
const b64d = (s)=>{ try { return Buffer.from(String(s||''),'base64').toString('utf8'); } catch(_){ return ''; } };
const arg = (n,d)=>{ const i=process.argv.indexOf('--'+n); return i>=0?process.argv[i+1]:d; };
const DRY = process.argv.includes('--dry');
(async()=>{
  const campaign = arg('campaign', process.env.MYSTRIKA_CAMPAIGN_ID);
  if (!M._hasKey()) { console.log('No MYSTRIKA_API_KEY — paste your "tamazia-cowork-os" token value (my.mystrika.com/settings/api).'); return; }
  if (!campaign) { console.log('Need --campaign <campaign_id> or MYSTRIKA_CAMPAIGN_ID. List campaigns with scripts/mystrika-cli.js campaigns.'); return; }
  if (!NEON) { console.log('No NEON_URL'); return; }
  const limit = parseInt(arg('max','200'),10);
  const raw = pg(`SELECT COALESCE(NULLIF(l.contact_email,''), l.email, ''), regexp_replace(COALESCE(NULLIF(trim(l.first_name||' '||COALESCE(l.last_name,'')),''), l.company,'there'),'[\\t\\r\\n]',' ','g'),
      regexp_replace(COALESCE(l.company,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.domain,''), COALESCE(l.sector,''), COALESCE(l.audit_url,''),
      regexp_replace(COALESCE(l.personalisation_pointers->>'top_finding',''),'[\\t\\r\\n]',' ','g'), COALESCE(l.operating_city,''),
      regexp_replace(COALESCE(l.rank_insight_sentence,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.hiring_signal,''),
      replace(encode(convert_to(COALESCE(d.t0s,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t0b,''),'UTF8'),'base64'),E'\\n',''),
      replace(encode(convert_to(COALESCE(d.t1b,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t2b,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t3b,''),'UTF8'),'base64'),E'\\n','')
    FROM leads l LEFT JOIN LATERAL (
      SELECT MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_subject END) t0s, MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_body END) t0b,
             MAX(CASE WHEN draft_metadata->>'touch'='1' THEN draft_body END) t1b, MAX(CASE WHEN draft_metadata->>'touch'='2' THEN draft_body END) t2b, MAX(CASE WHEN draft_metadata->>'touch'='3' THEN draft_body END) t3b
      FROM outreach_drafts od WHERE od.lead_id=l.id AND od.channel='email') d ON TRUE
    WHERE l.quality_fit=TRUE AND COALESCE(l.lifecycle_stage,'')='qualified' AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.audit_verified,FALSE)=TRUE AND COALESCE(l.contact_email,l.email,'') <> '' AND COALESCE(l.mystrika_pushed,FALSE)=FALSE
    ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  const rows = raw.split('\n').filter(Boolean).map(r=>r.split('\t'));
  if (!rows.length) { console.log('0 new FIT leads to push (need quality_fit + qualified + audit_verified + email + not already pushed).'); return; }
  const prospects = [];
  for (const r of rows) {
    const [email,name,company,domain,sector,audit,finding,city,ri,hiring,t0s,t0b,t1b,t2b,t3b]=r;
    if (!email) continue;
    const t0body=b64d(t0b); if (!t0body) continue; // never push a prospect without a real Touch-0 body
    prospects.push({ email, name: name||'there', company, domain, sector, audit_url: audit, top_finding: finding, city,
      rank_insight: ri, hiring_signal: hiring, touch0_subject: b64d(t0s), touch0_body: t0body, touch1_body: b64d(t1b), touch2_body: b64d(t2b), touch3_body: b64d(t3b) });
  }
  console.log('Pushing '+prospects.length+' FIT prospects to Mystrika campaign '+campaign+(DRY?' (DRY)':'')+' ...');
  if (DRY) { console.log('sample:', JSON.stringify({...prospects[0], touch0_body:(prospects[0]||{}).touch0_body?.slice(0,60)+'...'},null,0).slice(0,300)); return; }
  const res = await M.addProspects(campaign, prospects, true);
  console.log('Mystrika add: ok='+res.ok+' added='+res.added+' batches='+res.ok_batches+'/'+res.batches);
  if (res.ok) { const emails = prospects.map(p=>"'"+String(p.email).replace(/'/g,"''")+"'").join(','); pg(`UPDATE leads SET mystrika_pushed=TRUE, mystrika_pushed_at=NOW() WHERE COALESCE(contact_email,email) IN (${emails})`); console.log('marked '+prospects.length+' leads mystrika_pushed=TRUE'); }
})().catch(e=>{ console.error('push error (non-fatal):',e.message); process.exit(0); });
