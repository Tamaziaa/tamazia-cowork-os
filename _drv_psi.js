(async()=>{
  const dom='harleystreetdentalclinic.co.uk';
  const u=`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${dom}&strategy=mobile&category=performance&category=seo&category=accessibility&key=${process.env.PAGESPEED_API_KEY}`;
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),40000); const t0=Date.now();
  try{
    const r=await fetch(u,{signal:ctrl.signal});
    const ms=Date.now()-t0;
    const j=await r.json();
    console.log(JSON.stringify({status:r.status, ms, has_lh:!!(j.lighthouseResult&&j.lighthouseResult.audits), err:(j.error&&(j.error.message||j.error.code))||null}));
  }catch(e){ console.log(JSON.stringify({threw:e.name, msg:e.message, ms:Date.now()-t0})); }
  finally{clearTimeout(t);}
})();
