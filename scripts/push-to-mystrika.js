#!/usr/bin/env node
'use strict';
// Direct push: FIT + audit-verified leads -> Mystrika campaign via the inbound API (bulk add, custom fields =
// verified audit link + gated per-touch bodies + personalisation). Replaces the CSV step. Idempotent, fail-soft.
// Usage: MYSTRIKA_API_KEY=... node scripts/push-to-mystrika.js --campaign <campaign_id> [--max 200] [--dry]
const { execFileSync } = require('child_process');
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'src', 'lib', 'mystrika', 'client.js'));
const { conversionScore, SEND_TIERS } = require(path.resolve(__dirname, '..', 'src', 'lib', 'sourcing', 'conversion.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql){ return execFileSync(path.join(__dirname,'psql'),[NEON,'-tA','-c',sql],{encoding:'utf8'}); }
const b64d = (s)=>{ try { return Buffer.from(String(s||''),'base64').toString('utf8'); } catch(_){ return ''; } };
const arg = (n,d)=>{ const i=process.argv.indexOf('--'+n); return i>=0?process.argv[i+1]:d; };
const DRY = process.argv.includes('--dry');
(async()=>{
  if (!M._hasKey()) { console.log('No MYSTRIKA_API_KEY.'); return; }
  if (!NEON) { console.log('No NEON_URL'); return; }
  const forceCampaign = arg('campaign', process.env.MYSTRIKA_CAMPAIGN_ID || '');
  // Build sector -> campaign map from the live campaigns ("Tamazia | Law Firms" etc.) for auto-routing.
  let nameToId = {};
  try { const cl = await M.listCampaigns(); const arr = (cl.data && (cl.data.data || cl.data.campaigns)) || cl.data || []; for (const c of (Array.isArray(arr)?arr:[])) nameToId[String(c.name||'').toLowerCase()] = c.id || c.campaign_id; } catch(_){}
  const SECTOR_CAMPAIGN = { 'law-firms':'law firms','legal':'law firms','healthcare':'healthcare','dental':'healthcare','real-estate':'real estate','hospitality':'f&b','restaurants':'f&b','financial':'financial','finance':'financial','education':'education','automotive':'automotive','professional':'professional','ecommerce':'e-commerce' };
  const campaignFor = (sector) => {
    if (forceCampaign) return forceCampaign;
    const want = SECTOR_CAMPAIGN[String(sector||'').toLowerCase()] || '';
    for (const [nm,id] of Object.entries(nameToId)) { if (want && nm.includes(want)) return id; }
    return null;
  };
  const limit = parseInt(arg('max','200'),10);
  const raw = pg(`SELECT COALESCE(NULLIF(l.contact_email,''), l.email, ''), regexp_replace(COALESCE(NULLIF(trim(l.first_name||' '||COALESCE(l.last_name,'')),''), l.company,'there'),'[\\t\\r\\n]',' ','g'),
      regexp_replace(COALESCE(l.company,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.domain,''), COALESCE(l.sector,''), COALESCE(l.audit_url,''),
      regexp_replace(COALESCE(l.personalisation_pointers->>'top_finding',''),'[\\t\\r\\n]',' ','g'), COALESCE(l.operating_city,''),
      regexp_replace(COALESCE(l.rank_insight_sentence,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.hiring_signal,''), COALESCE(l.fit_score,0), COALESCE(l.hot_score,0), CASE WHEN COALESCE(l.contact_linkedin,'')<>'' THEN '1' ELSE '0' END, CASE WHEN COALESCE(jsonb_array_length(l.decision_makers),0)>0 OR COALESCE(l.contact_name,'')<>'' THEN '1' ELSE '0' END,
      replace(encode(convert_to(COALESCE(d.t0s,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t0b,''),'UTF8'),'base64'),E'\\n',''),
      replace(encode(convert_to(COALESCE(d.t1b,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t2b,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t3b,''),'UTF8'),'base64'),E'\\n','')
    FROM leads l LEFT JOIN LATERAL (
      SELECT MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_subject END) t0s, MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_body END) t0b,
             MAX(CASE WHEN draft_metadata->>'touch'='1' THEN draft_body END) t1b, MAX(CASE WHEN draft_metadata->>'touch'='2' THEN draft_body END) t2b, MAX(CASE WHEN draft_metadata->>'touch'='3' THEN draft_body END) t3b
      FROM outreach_drafts od WHERE od.lead_id=l.id AND od.channel='email') d ON TRUE
    WHERE l.quality_fit=TRUE AND COALESCE(l.lifecycle_stage,'')='qualified' AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.audit_verified,FALSE)=TRUE AND COALESCE(l.audit_url,'') <> '' AND COALESCE(l.contact_email,l.email,'') <> '' AND COALESCE(l.mystrika_pushed,FALSE)=FALSE
    ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  const rows = raw.split('\n').filter(Boolean).map(r=>r.split('\t'));
  if (!rows.length) { console.log('0 new FIT leads to push (need quality_fit + qualified + audit_verified + email + not already pushed).'); return; }
  const prospects = [];
  for (const r of rows) {
    const [email,name,company,domain,sector,audit,finding,city,ri,hiring,fitScore,hotScore,hasLi,hasDm,t0s,t0b,t1b,t2b,t3b]=r;
    if (!email) continue;
    if (!audit) continue;  // touch-1 guard: never push a lead without a minted audit_url
    const t0body=b64d(t0b); if (!t0body) continue;
    const conv=conversionScore({fit:true,fit_score:+fitScore||0,hot_score:+hotScore||0,has_verified_email:true,decision_maker:hasDm==='1',has_linkedin:hasLi==='1',audit_verified:true,hiring_signal:hiring});
    if (!SEND_TIERS.has(conv.tier)) continue;  // only email leads we are VERY sure about (Tier A/B) // never push a prospect without a real Touch-0 body
    prospects.push({ email, name: name||'there', company, domain, sector, audit_url: audit, top_finding: finding, city,
      rank_insight: ri, hiring_signal: hiring, conversion_tier: conv.tier, conversion_score: conv.score, touch0_subject: b64d(t0s), touch0_body: t0body, touch1_body: b64d(t1b), touch2_body: b64d(t2b), touch3_body: b64d(t3b) });
  }
  // TOUCH-1 CORRECTNESS GUARD: assert each prospect's audit_url (slug,hash) maps to ITS OWN domain in audit_pages.
  // Guarantees an email can never carry another firm's audit (slug-collision / cross-bind guard). Skips + logs on mismatch.
  {
    const parsed = prospects.map(p => { const m = String(p.audit_url||'').match(/\/audit\/([^\/?#]+)\/([^\/?#]+)/); return m ? { slug:m[1], hash:m[2] } : null; });
    const pairs = [...new Set(parsed.filter(Boolean).map(x => `('${x.slug.replace(/'/g,"''")}','${x.hash.replace(/'/g,"''")}')`))];
    const pageDomain = {};
    if (pairs.length) {
      const out = pg(`SELECT slug, hash, domain FROM audit_pages WHERE (slug,hash) IN (${pairs.join(',')})`);
      for (const ln of out.split('\n').filter(Boolean)) { const [sl,h,dom] = ln.split('\t'); pageDomain[sl+'/'+h] = (dom||'').toLowerCase().trim(); }
    }
    const kept = [];
    for (let i = 0; i < prospects.length; i++) {
      const p = prospects[i], pr = parsed[i];
      if (!pr) { console.log('  SKIP (guard): unparseable audit_url for '+p.email+' ['+p.audit_url+']'); continue; }
      const dom = pageDomain[pr.slug+'/'+pr.hash];
      if (!dom) { console.log('  SKIP (guard): audit_pages row missing for '+p.email+' ('+pr.slug+'/'+pr.hash+')'); continue; }
      const leadDom = String(p.domain||'').toLowerCase().trim();
      if (dom !== leadDom) { console.log('  SKIP (guard): domain mismatch for '+p.email+' lead='+leadDom+' audit_page='+dom+' ('+pr.slug+'/'+pr.hash+')'); continue; }
      kept.push(p);
    }
    const dropped = prospects.length - kept.length;
    if (dropped) console.log('touch-1 guard: dropped '+dropped+'/'+prospects.length+' prospects; '+kept.length+' verified domain<->slug');
    else console.log('touch-1 guard: all '+prospects.length+' prospects passed domain<->slug assertion');
    prospects.length = 0; prospects.push(...kept);
  }
  // group by sector campaign
  const byCamp = {};
  for (const p of prospects) { const cid = campaignFor(p.sector); if (!cid) { continue; } (byCamp[cid] = byCamp[cid] || []).push(p); }
  const totalRouted = Object.values(byCamp).reduce((a,x)=>a+x.length,0);
  prospects.sort((a,b)=>(b.conversion_score||0)-(a.conversion_score||0));  // SEND BEST FIRST
  const tierA=prospects.filter(p=>p.conversion_tier==='A').length;
  console.log('Routing '+totalRouted+'/'+prospects.length+' prospects ('+tierA+' Tier-A) across '+Object.keys(byCamp).length+' sector campaigns'+(DRY?' (DRY)':'')+' ...');
  if (DRY) { for (const [cid,ps] of Object.entries(byCamp)) console.log('  campaign '+cid+': '+ps.length+' prospects (e.g. '+(ps[0]||{}).company+')'); return; }
  let pushedEmails = [];
  for (const [cid, ps] of Object.entries(byCamp)) {
    const res = await M.addProspects(cid, ps, true);
    console.log('  -> '+cid+': ok='+res.ok+' added='+res.added+' batches='+res.ok_batches+'/'+res.batches);
    if (res.ok) pushedEmails = pushedEmails.concat(ps.map(p=>p.email));
  }
  if (pushedEmails.length) { const emails = pushedEmails.map(e=>"'"+String(e).replace(/'/g,"''")+"'").join(','); pg(`UPDATE leads SET mystrika_pushed=TRUE, mystrika_pushed_at=NOW() WHERE COALESCE(contact_email,email) IN (${emails})`); console.log('marked '+pushedEmails.length+' leads mystrika_pushed=TRUE'); }
})().catch(e=>{ console.error('push error (non-fatal):',e.message); process.exit(0); });
