async function timed(fp,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fp(c.signal);}finally{clearTimeout(t);}}
(async()=>{
  const dom='harleystreetdentalclinic.co.uk';
  const u=`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${dom}&strategy=mobile&category=performance&category=seo&category=accessibility&key=${process.env.PAGESPEED_API_KEY}`;
  const r=await timed(s=>fetch(u,{signal:s}),40000);
  console.log('step1: r.ok',r.ok,'status',r.status);
  const j=await r.json();
  const lr=j.lighthouseResult||{}; const a=lr.audits||{};
  console.log('step2: has_lh',!!(lr&&a),'audit_keys',Object.keys(a).length,'err',j.error&&j.error.message);
  try{
    const auds=Object.values(a).filter(x=>x&&x.score!==null&&x.score<0.9&&['binary','numeric','metricSavings'].includes(x.scoreDisplayMode))
      .map(x=>{const _it=(x.details&&x.details.items)||[];const _n=_it.map(q=>q&&q.node).filter(Boolean)[0]||null;return{id:x.id,title:x.title||'',score:x.score};});
    console.log('step3: _parsePsi filter OK, audits',auds.length, 'perf', lr.categories&&lr.categories.performance&&lr.categories.performance.score);
  }catch(e){console.log('step3: THREW',e.message);}
})().catch(e=>console.log('OUTER THREW',e.name,e.message));
