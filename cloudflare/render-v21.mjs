// Tamazia audit render v21 — billionaire-grade, Claude-aesthetic. Self-contained, CSP-safe (no inline JS;
// CSS-only tabs/accordions), responsive, print-friendly. Consumes the adapted audit + a computed ctx.
const vesc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const vgbp = n => { n=Number(n)||0; if(!n) return '£0'; if(n>=1e6) return '£'+(n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,'')+'m'; if(n>=1e3) return '£'+Math.round(n/1e3)+'k'; return '£'+n.toLocaleString(); };
const titleCase = s => String(s||'').replace(/\b([a-z])/g,(m,c)=>c.toUpperCase());
const SEV = { P0:{l:'Critical',c:'#b3261e',bg:'linear-gradient(90deg,#fbeceb,#fff)'}, P1:{l:'High',c:'#9a6212',bg:'linear-gradient(90deg,#fdf3e2,#fff)'}, P2:{l:'Standard',c:'#5b6b78',bg:'#fff'}, P3:{l:'Minor',c:'#8595a1',bg:'#fff'} };
const vsev = s => SEV[s]||SEV.P2;
const gradeColor = g => g && g[0]==='A'?'#1f7a44': g && g[0]==='B'?'#3a7d44': g && g[0]==='C'?'#9a6212': g==='D'||g==='D-'?'#b06a12':'#b3261e';

function ringSVG(score, grade){
  const r=52, c=2*Math.PI*r, off=c*(1-Math.max(0,Math.min(100,score))/100), col=gradeColor(grade);
  return `<svg viewBox="0 0 128 128" width="118" height="118" role="img" aria-label="Score ${score} of 100, grade ${vesc(grade)}">
  <circle cx="64" cy="64" r="${r}" fill="none" stroke="#eceae4" stroke-width="9"/>
  <circle cx="64" cy="64" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 64 64)"/>
  <text x="64" y="58" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-weight="600" fill="#1f2328">${vesc(grade)}</text>
  <text x="64" y="80" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#6b7280">${score}/100</text></svg>`;
}

function scorecard(dims){
  const ORDER=[['compliance','Compliance'],['seo','SEO'],['technical_seo','Technical'],['security','Security'],['accessibility','Accessibility'],['content_depth','Content'],['ai_visibility','AI visibility'],['tls_dns','Email / DNS'],['website','Site'],['public_records','Records']];
  const cell=([k,label])=>{ const d = k==='ai_visibility'? dims._ai : dims[k]; if(!d||!d.assessed) return `<div class="sc"><span class="sc-l">${label}</span><span class="sc-s sc-na">Not assessed</span></div>`;
    const crit=d.crit||0, high=d.high||0; let st,cls; if(crit>0){st='Fail';cls='sc-fail';} else if(high>0){st='Needs work';cls='sc-warn';} else if((d.mean_score||0)>=0.8){st='Strong';cls='sc-ok';} else {st='Needs work';cls='sc-warn';}
    const n=crit+high+(d.std||0); return `<div class="sc"><span class="sc-l">${label}</span><span class="sc-s ${cls}">${st}${n?` · ${n}`:''}</span></div>`; };
  return `<div class="scgrid">${ORDER.map(cell).join('')}</div>`;
}

function fixCard(p){ const s=vsev(p.severity); const fine = p.fine_high_gbp ? `${vgbp(p.fine_low_gbp||0)}–${vgbp(p.fine_high_gbp)}` : '';
  return `<div class="fix" style="background:${s.bg}"><div class="fix-top"><span class="tag" style="color:${s.c};border-color:${s.c}33">${s.l}</span>${fine?`<span class="fix-fine">${fine}</span>`:''}</div>
  <div class="fix-t">${vesc(p.desc||p.citation||'')}</div><div class="fix-x">${vesc((p.tamazia_fix_short||'').slice(0,150))}</div></div>`; }

function findingRow(p){ const s=vsev(p.severity); const fine=p.fine_high_gbp?`<span class="fr-fine">${vgbp(p.fine_low_gbp||0)}–${vgbp(p.fine_high_gbp)}</span>`:'';
  const cite = p.citation_url?`<a href="${vesc(p.citation_url)}" target="_blank" rel="noopener">${vesc(p.framework_short||p.citation||'source')}</a>`:vesc(p.framework_short||p.citation||'');
  const ev = p.evidence_quote?`<div class="fr-ev">“${vesc(String(p.evidence_quote).slice(0,160))}”</div>`:'';
  const enf = p.enforcement_example?`<div class="fr-enf">Precedent: ${vesc(String(p.enforcement_example).slice(0,140))}</div>`:'';
  return `<details class="fr"><summary><span class="fr-dot" style="background:${s.c}"></span><span class="fr-title">${vesc(p.desc||p.citation||'')}</span>${fine}</summary>
  <div class="fr-body"><div class="fr-meta">${cite}${enf?' · '+enf.replace(/<[^>]+>/g,''):''}</div>${ev}<p class="fr-lay">${vesc((p.layman_explanation||'').slice(0,320))}</p><p class="fr-fix"><strong>Tamazia:</strong> ${vesc((p.tamazia_fix_short||'').slice(0,200))}</p></div></details>`; }

function tabPanel(id, label, checked, body, count){ return { label:`<label class="tab" for="tab-${id}">${label}${count!=null?` <span class="tab-n">${count}</span>`:''}</label>`,
  input:`<input class="tabin" type="radio" name="tabs" id="tab-${id}"${checked?' checked':''}>`, body:`<section class="tabbody" id="body-${id}">${body}</section>` }; }

function keywordTable(km){ if(!km||!km.ok||!(km.keywords||[]).length) return '';
  const rows=km.keywords.slice(0,8).map(k=>{ const pos = k.my_position? `<span class="kw-rank">#${k.my_position}</span>` : `<span class="kw-abs">Not on page 1</span>`;
    const lead = k.leader? vesc(k.leader.replace(/^www\./,'')) : '—';
    return `<tr><td>${vesc(k.keyword)}</td><td>${pos}</td><td class="kw-lead">${lead}</td></tr>`; }).join('');
  const losses = km.keywords.filter(k=>!k.my_position||k.my_position>5).length;
  return `<div class="panel"><h3>Where your buyers search — and who wins</h3><p class="sub">${km.city?vesc(km.city)+' · ':''}You are off page one for ${losses} of ${km.keywords.length} high-intent terms. The competitor column is the real firm ranking ahead of you.</p>
  <table class="kwt"><thead><tr><th>Search term</th><th>You</th><th>Who ranks instead</th></tr></thead><tbody>${rows}</tbody></table></div>`; }

function geoPanel(a){ const gp=a.geo_probe||{}, ar=a.ai_readiness||{}; if(gp.share_of_voice==null && !ar.score) return '';
  const sov = gp.share_of_voice!=null? gp.share_of_voice : null;
  const comps=(gp.top_competitors||[]).slice(0,3).map(c=>vesc(c.name)).join(', ');
  const stat=(v,l)=>`<div class="gstat"><div class="gstat-v">${v}</div><div class="gstat-l">${l}</div></div>`;
  return `<div class="panel"><h3>Can AI engines find, trust and cite you</h3>
  <div class="gstats">${sov!=null?stat(sov+'%','AI share of voice'):''}${ar.score!=null?stat(ar.score+'/100','Entity readiness'):''}${stat(ar.in_wikidata?'Yes':'No','In knowledge graph')}${stat(ar.has_org_schema?'Yes':'No','Org schema')}</div>
  ${comps?`<p class="sub">When buyers ask AI for a provider like you, it names: ${comps}.</p>`:''}
  <p class="micro">The share-of-voice figure is a live multi-sample AI probe. Entity readiness is measured from your schema, llms.txt, sameAs and knowledge-graph presence.</p></div>`; }

function authorityPanel(a){ const au=a.authority; if(!au||!au.you) return '';
  const you=au.you.da_100||0; const top=(au.ranked||[]).slice(0,3).map(c=>`${vesc(c.domain)} ${Math.round((c.dr||0)*10)}/100`).join(' · ');
  const par = au.top && Math.abs((au.top.dr||0)-(au.you.dr||0))<1;
  return `<div class="panel"><h3>Domain authority</h3><div class="bar-row"><span class="bar-l">You</span><div class="bar"><i style="width:${Math.min(100,you)}%"></i></div><span class="bar-v">${you}/100</span></div>
  <p class="sub">${par?'You are on par with':'You trail'} the firms competing for your buyers${top?': '+top:''}. Domain authority is the backlink-trust score search and AI engines use to decide who to rank and cite.</p></div>`; }

function chartTrajectory(now, wk12, after){ const W=520,H=140,pad=34, x=p=>pad+(W-2*pad)*p, y=v=>H-pad-(H-2*pad)*(v/100);
  const pts=[[0,now],[0.5,wk12],[1,after]]; const path=pts.map(([px,v],i)=>`${i?'L':'M'}${x(px).toFixed(0)},${y(v).toFixed(0)}`).join(' ');
  const dot=([px,v],col)=>`<circle cx="${x(px).toFixed(0)}" cy="${y(v).toFixed(0)}" r="4.5" fill="${col}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:520px" role="img" aria-label="Score trajectory ${now} now to about ${after} after Tamazia">
  <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="#eceae4"/>
  <path d="${path}" fill="none" stroke="#9a7b35" stroke-width="2.5"/>
  ${dot(pts[0],'#b3261e')}${dot(pts[1],'#9a6212')}${dot(pts[2],'#1f7a44')}
  <text x="${x(0)}" y="${y(now)-12}" font-family="system-ui" font-size="12" fill="#b3261e">Now ${now}</text>
  <text x="${x(0.5)}" y="${y(wk12)-12}" text-anchor="middle" font-family="system-ui" font-size="12" fill="#9a6212">12 wks ${wk12}</text>
  <text x="${x(1)}" y="${y(after)-12}" text-anchor="end" font-family="system-ui" font-size="12" fill="#1f7a44">Fixed ~${after}</text></svg>`; }

function investment(p0, multiJur){ const tier = (multiJur && p0>=6)?'Enterprise':(p0>=2?'Authority':'Foundation');
  const price = {Foundation:'£2,500',Authority:'£4,500',Enterprise:'£9,500'}[tier];
  return `<div class="panel invest"><div><div class="inv-k">Recommended engagement</div><div class="inv-t">${tier} · from ${price}/mo</div><p class="sub">Right-sized to your ${p0} critical findings${multiJur?' across multiple jurisdictions':''}. Scope and a fixed proposal are confirmed on the call.</p></div>
  <a class="cta" href="https://tamazia.co.uk/book/">Book the founder →</a></div>`; }

export function renderV21(a, ctx){
  const { dims, score, wk12, projected, grade, exposure_total, exposure_frameworks, top3 } = ctx;
  const pts = a.pointers||[];
  const SEOB=['seo','technical_seo','security','accessibility','content_depth','website','tls_dns'];
  const byb = b => pts.filter(p => b==='regulatory' ? (p.bucket==='compliance'||p.bucket==='public_records') : b==='seo' ? SEOB.includes(p.bucket) : p.bucket==='ai_visibility');
  const reg=byb('regulatory'), seo=byb('seo'), ai=byb('ai_visibility');
  const crit = pts.filter(p=>p.severity==='P0').length, high = pts.filter(p=>p.severity==='P1').length;
  const multiJur = (a.detected_jurisdictions||[]).length>1;
  const verdict = `${vesc(a.company)} scores ${score}/100 today. Fixed, it reaches about ${projected}. ${crit} critical and ${high} high-priority findings carry up to ${vgbp(exposure_total)} of statutory exposure across ${exposure_frameworks} frameworks.`;
  // regulatory grouped by framework (accordion per framework)
  const regByFw={}; reg.forEach(p=>{const k=p.framework_short||p.citation||'Other';(regByFw[k]=regByFw[k]||[]).push(p);});
  const regHtml = Object.entries(regByFw).sort((x,y)=>y[1].length-x[1].length).slice(0,14).map(([fw,arr])=>{
    const c=arr.filter(p=>p.severity==='P0').length, h=arr.filter(p=>p.severity==='P1').length;
    return `<details class="fw"><summary><span class="fw-name">${vesc(fw)}</span><span class="fw-n">${arr.length} finding${arr.length>1?'s':''}${c?` · ${c} critical`:h?` · ${h} high`:''}</span></summary><div>${arr.slice(0,8).map(findingRow).join('')}</div></details>`;
  }).join('');
  const seoHtml = seo.length? seo.slice(0,16).map(findingRow).join('') : '<p class="sub">No SEO, technical or security gaps surfaced.</p>';
  const aiHtml = (ai.length? ai.slice(0,12).map(findingRow).join('') : '') + geoPanel(a) + authorityPanel(a) + keywordTable(a.keyword_map);
  const t1=tabPanel('reg','Regulatory',true,regHtml,reg.length);
  const t2=tabPanel('seo','SEO &amp; Technical',false,seoHtml,seo.length);
  const t3=tabPanel('ai','AI visibility',false,aiHtml,ai.length);
  const top3cards = (top3||[]).slice(0,3).map(fixCard).join('') || reg.slice(0,3).map(fixCard).join('');
  const juris = a.jurisdiction_statement && a.jurisdiction_statement.regimes ? (a.jurisdiction_statement.regimes||[]).map(r=>vesc(r.regime)).slice(0,4).join(' · ') : (a.detected_jurisdictions||[]).join(' · ');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${vesc(a.company)} · Regulatory + SEO + AI audit · Tamazia</title>
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap top-in"><span class="brand">TAMAZIA</span><span class="top-mid">Regulatory · SEO · AI visibility audit</span><a class="top-cta" href="https://tamazia.co.uk/book/">Book the founder →</a></div></header>
<main class="wrap">
  <section class="hero">
    <div class="hero-l">
      ${ringSVG(score,grade)}
      <div class="hero-meta"><div class="hero-co">${vesc(a.company)}</div><div class="hero-sub">${vesc(titleCase(a.sector||''))}${a.city?' · '+vesc(a.city):''}${juris?' · assessed against '+juris:''}</div></div>
    </div>
    <div class="hero-r">
      <p class="verdict">${verdict}</p>
      <div class="hero-stats"><div><b>${vgbp(exposure_total)}</b><span>max exposure · ${exposure_frameworks} frameworks</span></div><div><b style="color:#b3261e">${crit}</b><span>critical</span></div><div><b style="color:#9a6212">${high}</b><span>high priority</span></div></div>
    </div>
  </section>
  <section class="band"><h2 class="h2">The three fixes this quarter</h2><div class="fixes">${top3cards}</div></section>
  <section class="band"><h2 class="h2">Where you stand</h2>${scorecard(dims)}</section>
  <section class="band">
    <div class="tabs">${t1.input}${t2.input}${t3.input}<nav class="tabnav">${t1.label}${t2.label}${t3.label}</nav>${t1.body.replace('<section class="tabbody"','<section class="tabbody reg"')}${t2.body}${t3.body}</div>
  </section>
  <section class="band split">
    <div class="panel"><h3>Your trajectory with Tamazia</h3>${chartTrajectory(score,wk12,projected)}<p class="micro">Indicative path based on closing the findings above. Not a guarantee.</p></div>
    ${investment(crit, multiJur)}
  </section>
  <footer class="foot"><div>This is a marketing diagnostic, not legal advice or a legal determination. Exposure figures are statutory maxima, not predictions. Tamazia Ltd.</div><div class="foot-r">100+ verified client reviews · UK · EU · Middle East · Aman Pareek reviews every onboarding personally.</div></footer>
</main></body></html>`;
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fbfbfa;color:#1f2328;font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:0 22px}
a{color:#1857a8;text-decoration:none}a:hover{text-decoration:underline}
h2,h3{font-family:Georgia,'Times New Roman',serif;font-weight:600;color:#23323d}
.h2{font-size:1.18rem;margin:0 0 14px;letter-spacing:-.01em}
.top{position:sticky;top:0;z-index:20;background:rgba(61,14,14,.97);color:#f3ece1;backdrop-filter:saturate(1.2) blur(4px)}
.top-in{display:flex;align-items:center;gap:14px;padding:10px 22px;max-width:1000px}
.brand{font-weight:800;letter-spacing:.22em;font-size:.82rem}
.top-mid{font-size:.74rem;color:#d8c39a;margin-right:auto;letter-spacing:.02em}
.top-cta{background:#c8a664;color:#3D0E0E;font-weight:700;font-size:.74rem;padding:6px 13px;border-radius:7px}
.top-cta:hover{text-decoration:none;opacity:.92}
.hero{display:grid;grid-template-columns:300px 1fr;gap:26px;align-items:center;padding:30px 0 24px;border-bottom:1px solid #ece9e3}
.hero-l{display:flex;gap:16px;align-items:center}
.hero-co{font-family:Georgia,serif;font-size:1.28rem;font-weight:600;line-height:1.2}
.hero-sub{font-size:.8rem;color:#6b7280;margin-top:4px}
.verdict{font-size:1.04rem;line-height:1.5;margin:0 0 16px;color:#33424d}
.hero-stats{display:flex;gap:26px;flex-wrap:wrap}
.hero-stats>div{display:flex;flex-direction:column}
.hero-stats b{font-size:1.5rem;font-family:Georgia,serif;line-height:1}
.hero-stats span{font-size:.72rem;color:#6b7280;margin-top:3px}
.band{padding:26px 0;border-bottom:1px solid #f3f1ec}
.fixes{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.fix{border:1px solid #ece9e3;border-radius:11px;padding:14px 15px}
.fix-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.tag{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border:1px solid;border-radius:20px;padding:2px 9px}
.fix-fine{font-size:.74rem;font-weight:700;color:#3D0E0E;font-variant-numeric:tabular-nums}
.fix-t{font-weight:650;font-size:.94rem;margin-bottom:6px;line-height:1.3}
.fix-x{font-size:.8rem;color:#5b6b78;line-height:1.45}
.scgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}
.sc{border:1px solid #ece9e3;border-radius:9px;padding:10px 11px;display:flex;flex-direction:column;gap:6px;background:#fff}
.sc-l{font-size:.74rem;color:#6b7280}
.sc-s{font-size:.78rem;font-weight:700}
.sc-ok{color:#1f7a44}.sc-warn{color:#9a6212}.sc-fail{color:#b3261e}.sc-na{color:#aab2b9;font-weight:600}
.tabs{}
.tabin{position:absolute;opacity:0;pointer-events:none}
.tabnav{display:flex;gap:6px;border-bottom:1px solid #ece9e3;margin-bottom:16px;flex-wrap:wrap}
.tab{cursor:pointer;padding:9px 15px;font-size:.85rem;font-weight:600;color:#6b7280;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab-n{font-size:.7rem;background:#f0ede7;color:#5b6b78;border-radius:10px;padding:1px 7px;margin-left:3px}
.tabbody{display:none}
#tab-reg:checked~.tabnav label[for=tab-reg],#tab-seo:checked~.tabnav label[for=tab-seo],#tab-ai:checked~.tabnav label[for=tab-ai]{color:#3D0E0E;border-bottom-color:#c8a664}
#tab-reg:checked~#body-reg,#tab-seo:checked~#body-seo,#tab-ai:checked~#body-ai{display:block}
.fw,.fr{border:1px solid #ece9e3;border-radius:9px;margin:8px 0;background:#fff;overflow:hidden}
.fw>summary,.fr>summary{cursor:pointer;list-style:none;padding:11px 14px;display:flex;align-items:center;gap:9px;font-size:.9rem}
.fw>summary::-webkit-details-marker,.fr>summary::-webkit-details-marker{display:none}
.fw-name{font-weight:700}.fw-n{margin-left:auto;font-size:.74rem;color:#6b7280}
.fw>div,.fr-body{padding:2px 14px 12px}
.fr-dot{width:8px;height:8px;border-radius:50%;flex:none}
.fr-title{font-weight:600}.fr-fine{margin-left:auto;font-size:.74rem;font-weight:700;color:#3D0E0E;font-variant-numeric:tabular-nums}
.fr-meta{font-size:.74rem;color:#6b7280;margin-bottom:6px}
.fr-ev{font-style:italic;color:#52606b;font-size:.82rem;border-left:3px solid #ece9e3;padding-left:10px;margin:6px 0}
.fr-lay{font-size:.84rem;color:#33424d;margin:6px 0}.fr-fix{font-size:.84rem;color:#1f3a2a;margin:6px 0}
.panel{border:1px solid #ece9e3;border-radius:11px;padding:16px 18px;margin:12px 0;background:#fff}
.panel h3{font-size:1.02rem;margin:0 0 4px}
.sub{font-size:.84rem;color:#5b6b78;margin:4px 0 12px;line-height:1.5}
.micro{font-size:.72rem;color:#9ca3af;margin:8px 0 0}
.kwt{width:100%;border-collapse:collapse;font-size:.84rem}
.kwt th{text-align:left;font-size:.72rem;color:#6b7280;font-weight:600;border-bottom:1px solid #ece9e3;padding:7px 8px}
.kwt td{padding:8px;border-bottom:1px solid #f3f1ec;vertical-align:top}
.kw-rank{color:#1f7a44;font-weight:700}.kw-abs{color:#b06a12;font-weight:600}.kw-lead{color:#52606b}
.gstats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0}
.gstat{border:1px solid #f3f1ec;border-radius:9px;padding:11px;text-align:center;background:#fcfbf9}
.gstat-v{font-family:Georgia,serif;font-size:1.3rem;font-weight:600}.gstat-l{font-size:.7rem;color:#6b7280;margin-top:3px}
.bar-row{display:flex;align-items:center;gap:10px;margin:6px 0}
.bar-l{font-size:.78rem;color:#6b7280;width:34px}.bar{flex:1;height:9px;background:#f0ede7;border-radius:5px;overflow:hidden}.bar>i{display:block;height:100%;background:linear-gradient(90deg,#3D0E0E,#9a7b35)}.bar-v{font-size:.78rem;font-weight:700;width:50px;text-align:right}
.split{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.invest{display:flex;flex-direction:column;justify-content:center;gap:6px;background:#fbf6ea;border-color:#ecdfba}
.inv-k{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:#9a7b35;font-weight:700}
.inv-t{font-family:Georgia,serif;font-size:1.2rem;font-weight:600}
.cta{align-self:flex-start;margin-top:6px;background:#3D0E0E;color:#f3ece1;font-weight:700;font-size:.84rem;padding:10px 18px;border-radius:8px}
.cta:hover{text-decoration:none;opacity:.93}
.foot{padding:22px 0 60px;color:#9ca3af;font-size:.74rem;display:flex;gap:20px;justify-content:space-between;flex-wrap:wrap}
@media(max-width:760px){.hero{grid-template-columns:1fr}.fixes,.scgrid,.gstats{grid-template-columns:1fr 1fr}.split{grid-template-columns:1fr}}
@media print{.top,.top-cta,.cta{position:static}.tabbody{display:block !important}details>*{display:block !important}}
`;
