(async()=>{
  const ss=require('./src/lib/audit/site-scan.js');
  const k=process.env.PAGESPEED_API_KEY;
  console.log('key seen by node:', k? (k.length+' chars'):'EMPTY');
  const t0=Date.now();
  const psi=await ss.pageSpeed('harleystreetdentalclinic.co.uk', k);
  console.log(JSON.stringify({ms:Date.now()-t0, got:!!psi, perf:psi&&psi.perf, seo:psi&&psi.seo, a11y_present: psi? ('seo' in psi):null}));
})().catch(e=>console.log('ERR',e.message));
