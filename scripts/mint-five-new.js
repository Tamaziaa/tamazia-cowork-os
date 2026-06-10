#!/usr/bin/env node
'use strict';
const path=require('path'),fs=require('fs');const ROOT=path.resolve(__dirname,'..');
(()=>{for(const p of [path.join(ROOT,'.env'),path.join(ROOT,'..','COWORK-OS-EXECUTION','.env')]){try{for(const l of fs.readFileSync(p,'utf8').split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}catch(_e){}}})();
const {build}=require(path.join(ROOT,'src','skills','S025-audit-page-builder','scripts','build.js'));
const FIRMS=[
  {domain:'shoosmiths.com',sector:'legal',country:'UK',company:'Shoosmiths'},
  {domain:'arnoldclark.com',sector:'automotive',country:'UK',company:'Arnold Clark'},
  {domain:'gymshark.com',sector:'ecommerce',country:'UK',company:'Gymshark'},
  {domain:'pizzaexpress.com',sector:'hospitality',country:'UK',company:'PizzaExpress'},
  {domain:'mydentist.co.uk',sector:'dental',country:'UK',company:'mydentist'},
];
(async()=>{const out=[];for(const f of FIRMS){const t=Date.now();try{const r=await build({...f,env:process.env});out.push({...f,url:r.signed_url,ok:true,pointers:(r.pointers||[]).length});console.log('✓ '+f.domain+' ('+f.sector+') → '+r.signed_url+'  ['+(r.pointers||[]).length+'p '+Math.round((Date.now()-t)/1000)+'s]');}catch(e){out.push({...f,ok:false,error:e.message});console.log('✗ '+f.domain+' '+e.message.slice(0,120));}}
fs.writeFileSync(path.join(ROOT,'mint-five-new.result.json'),JSON.stringify(out,null,2));console.log('\nminted '+out.filter(x=>x.ok).length+'/'+out.length);})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
