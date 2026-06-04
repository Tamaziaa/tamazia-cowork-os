(async()=>{
  const ss=require('./src/lib/audit/site-scan.js');
  const t0=Date.now();
  const psi=await ss.pageSpeed('harleystreetdentalclinic.co.uk', process.env.PAGESPEED_API_KEY);
  console.log(JSON.stringify({ms:Date.now()-t0, got:!!psi, perf:psi&&psi.perf, seo:psi&&psi.seo, lcp:psi&&psi.lcp_ms, audits:psi&&psi.audits&&psi.audits.length}));
})().catch(e=>console.log('ERR '+e.message));
