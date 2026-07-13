(async()=>{
  const ss=require('./src/lib/audit/site-scan.js');
  const k=process.env.PAGESPEED_API_KEY;
  // never log the key (or anything derived from it — length leaks material too); presence is all we need.
  console.log('key seen by node:', process.env.PAGESPEED_API_KEY ? 'PRESENT' : 'EMPTY');
  const t0=Date.now();
  const psi=await ss.pageSpeed('harleystreetdentalclinic.co.uk', k);
  console.log(JSON.stringify({ms:Date.now()-t0, got:!!psi, perf:psi&&psi.perf, seo:psi&&psi.seo, a11y_present: psi? ('seo' in psi):null}));
})().catch(e=>console.log('ERR',e.message));
