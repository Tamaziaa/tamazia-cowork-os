const build = require('./src/skills/S025-audit-page-builder/scripts/build.js');
const [,, domain, sector, country, outfile] = process.argv;
(async () => {
  const t0 = Date.now();
  try {
    const pay = await build.buildPayload({ domain, sector, country: country||'UK', env: process.env });
    require('fs').writeFileSync(outfile, JSON.stringify(pay));
    const pts = pay.pointers||[];
    const cnt = b => pts.filter(p=>p.bucket===b).length;
    console.log(JSON.stringify({ok:true, ms:Date.now()-t0,
      psi: !!(pay.scan&&pay.scan.psi), sov: pay.geo_probe&&pay.geo_probe.share_of_voice,
      dr: pay.authority&&pay.authority.you&&pay.authority.you.dr,
      pointers: pts.length, compliance: cnt('compliance'), seo: cnt('seo'), technical_seo: cnt('technical_seo'),
      security: cnt('security'), ai_visibility: cnt('ai_visibility'),
      kw_positions: (pay.keyword_map&&pay.keyword_map.rows||[]).map(r=>r.my_position)
    }));
  } catch(e){ console.log(JSON.stringify({ok:false, err:e.message, stack:(e.stack||'').split('\n').slice(0,3)})); }
})();
