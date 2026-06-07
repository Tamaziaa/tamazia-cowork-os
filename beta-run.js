'use strict';
// Controlled 20-prospect beta: enrich (DIY + Apify escalation) -> score/tier -> mint Tier-1. NO sends.
const path = require('path');
const ROOT = __dirname;
const { enrichCompany } = require(path.join(ROOT, 'src/lib/sourcing/enrich.js'));
const { scoreLead } = require(path.join(ROOT, 'src/lib/enrich/lead-quality.js'));
const ab = require(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'));
const NEON = process.env.NEON_URL;
const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
async function q(query, params=[]) {
  const r = await fetch('https://'+host+'/sql', { method:'POST', headers:{'Neon-Connection-String':NEON,'Content-Type':'application/json'}, body: JSON.stringify({query, params}) });
  if (!r.ok) return { ok:false, rows:[], error:'http_'+r.status };
  const d = await r.json(); return { ok:true, rows: d.rows||d.results||[] };
}
const lit = v => v==null||v===''?'NULL':`'${String(v).replace(/'/g,"''")}'`;
const withTimeout = (pr, ms, fallback) => Promise.race([pr, new Promise(r=>setTimeout(()=>r(fallback),ms))]);
const N = Number(process.argv[2]||20);
(async () => {
  // pick N un-enriched served-sector leads, spread across sectors
  const sel = await q(`SELECT id, company, domain, sector, country FROM (
      SELECT id, company, domain, sector, country, row_number() OVER (PARTITION BY sector ORDER BY priority_score DESC NULLS LAST, id DESC) rn
      FROM leads WHERE COALESCE(domain,'')<>'' AND enriched_at IS NULL
        AND sector IN ('healthcare','hospitality','real-estate','legal','law-firms','financial-services','ecommerce-retail')
        AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
        AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')) t
    WHERE rn <= 3 ORDER BY sector, id LIMIT ${N}`);
  const leads = sel.rows;
  console.log(`BETA: ${leads.length} prospects selected (Apify ${/^(1|true|yes|on)$/i.test(process.env.APIFY_ENABLE||'')?'ON cap $'+(process.env.APIFY_MONTHLY_CAP_USD||29):'OFF'})\n`);
  const results = [];
  for (const L of leads) {
    const served = true;
    let rec = {}, scored = {}, dmSource = 'none', minted = '';
    const t0 = Date.now();
    try { rec = await withTimeout(enrichCompany({ domain: L.domain, company: L.company, sector: L.sector, env: process.env, verify: true, useCache: false, apify: served }), 30000, { _timeout:true }); } catch(e){ rec = { _err: String(e.message||e).slice(0,80) }; }
    const primary = rec.primary || null;
    if (primary) dmSource = primary.source || 'unknown';
    // persist enrichment (real pipeline write)
    const sets = [
      `primary_email=${lit(primary&&primary.email)}`, `primary_email_role=${lit(primary&&primary.role)}`,
      `primary_email_source=${lit(primary&&primary.source)}`, `decision_maker_confidence=${primary?Number(primary.confidence||0):'NULL'}`,
      `secondary_emails=${rec.secondary_emails?`'${JSON.stringify(rec.secondary_emails).replace(/'/g,"''")}'::jsonb`:'NULL'}`,
      `all_emails=${rec.emails?`'${JSON.stringify((rec.emails||[]).map(e=>({email:e.value,name:e.name||'',role:e.position||'',source:e.source||'',verified:!!e.verified}))).replace(/'/g,"''")}'::jsonb`:'NULL'}`,
      `all_socials=${rec.socials?`'${JSON.stringify(rec.socials).replace(/'/g,"''")}'::jsonb`:'NULL'}`,
      `email_verified=${primary?(primary.verified?'TRUE':'FALSE'):'FALSE'}`, `enriched_at=NOW()` ];
    if (primary && primary.email) sets.push(`contact_email=${lit(primary.email)}`,`contact_name=${lit(primary.name)}`,`title=${lit(primary.role)}`,`contact_confidence=${Number(primary.confidence||0)}`);
    await q(`UPDATE leads SET ${sets.join(', ')} WHERE id=${L.id}`);
    // score/tier (live site fetch)
    const leadRow = { domain:L.domain, sector:L.sector, primary_email: primary&&primary.email, contact_email: primary&&primary.email, decision_maker_confidence: primary&&primary.confidence, email_verified: primary&&primary.verified, verify_status: primary&&primary.verify_status, all_emails: rec.emails||[], all_socials: rec.socials||{} };
    try { scored = await withTimeout(scoreLead(leadRow), 15000, { tier:3, score:0, _timeout:true }); } catch(e){ scored = { _err: String(e.message||e).slice(0,60) }; }
    const tier = scored.tier || 3;
    await q(`UPDATE leads SET quality_score=${Number(scored.score||0)}, quality_fit=${tier===1?'TRUE':'FALSE'}, icp_tier=${tier}, lifecycle_stage=${tier===1?"'qualified'":tier===2?"'pending_approval'":"'rejected'"}, quality_scored_at=NOW() WHERE id=${L.id}`);
    // mint Tier-1 audit (real)
    if (tier === 1) {
      try {
        const slug = ab.slugify(L.company||L.domain.split('.')[0]); const hash = ab.generateHash();
        const payload = { schema_version:'v2-beta', domain:L.domain, sector:L.sector, beta:true };
        const exp = Math.floor(Date.now()/1000)+180*24*3600;
        const ins = await q(`INSERT INTO audit_pages (workspace_id, lead_id, slug, hash, domain, sector, country, framework_version, payload_json, expires_at) VALUES (1, ${L.id}, ${lit(slug)}, ${lit(hash)}, ${lit(L.domain)}, ${lit(L.sector)}, ${lit((L.country||'UK').toUpperCase())}, '1.0.0-beta', '${JSON.stringify(payload).replace(/'/g,"''")}'::jsonb, to_timestamp(${exp})) RETURNING id`);
        if (ins.rows[0]) { minted = `https://tamazia.co.uk/audit/${slug}/${hash}`; await q(`UPDATE leads SET audit_slug=${lit(slug)}, audit_hash=${lit(hash)}, audit_url=${lit(minted)} WHERE id=${L.id}`); }
      } catch(e){ minted = 'MINT_ERR:'+String(e.message||e).slice(0,40); }
    }
    const r = { id:L.id, domain:L.domain, sector:L.sector, dm: primary?primary.email:'-', dmSource, conf: primary?primary.confidence:0, verified: !!(primary&&primary.verified), emails:(rec.counts||{}).emails||0, score: scored.score||0, tier, minted: minted||'-', ms: Date.now()-t0 };
    results.push(r);
    console.log(`  [${results.length}/${leads.length}] ${L.domain} (${L.sector}) -> DM:${r.dm} src:${dmSource} conf:${r.conf}${r.verified?' ✓':''} | score:${r.score} TIER:${tier} | ${minted?('mint:'+(minted.startsWith('http')?'OK':minted)):''} (${r.ms}ms)`);
  }
  // summary
  const byTier = {1:0,2:0,3:0}; results.forEach(r=>byTier[r.tier]++);
  const withDM = results.filter(r=>r.dm!=='-').length;
  const verified = results.filter(r=>r.verified).length;
  const apifyDM = results.filter(r=>/apify/i.test(r.dmSource)).length;
  const minted = results.filter(r=>r.minted.startsWith('http')).length;
  console.log(`\n=== BETA SUMMARY ===`);
  console.log(`prospects: ${results.length} | DM email found: ${withDM} | verified: ${verified} | via Apify: ${apifyDM}`);
  console.log(`tiers: T1(auto)=${byTier[1]} T2(approval)=${byTier[2]} T3(reject)=${byTier[3]} | audits minted: ${minted}`);
  require('fs').writeFileSync('/tmp/beta-results.json', JSON.stringify(results,null,2));
  process.exit(0);
})().catch(e=>{ console.error('BETA FATAL:', e.message); process.exit(1); });
