const ss = require('./src/lib/audit/site-scan.js');
const fn = ss.scanSite || ss.scan || (ss.default && ss.default.scanSite);
(async()=>{ const t0=Date.now();
  const s = await fn({domain:'harleystreetdentalclinic.co.uk', sector:'healthcare', env:process.env});
  const pts=s.pointers||[]; const by={}; pts.forEach(p=>by[p.bucket]=(by[p.bucket]||0)+1);
  console.log(JSON.stringify({ms:Date.now()-t0, reachable:s.reachable, render_class:s.render_class, psi_present:!!s.psi, total_pointers:pts.length, by_bucket:by}, null, 0));
})().catch(e=>console.log('ERR '+e.message));
