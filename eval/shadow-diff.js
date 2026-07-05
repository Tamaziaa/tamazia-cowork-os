#!/usr/bin/env node
'use strict';
// Diff shadow-minted payloads (audit_pages_shadow, engine=compliance-ssot) vs live (audit_pages, prod).
// Zero writes. Surfaces per-firm: compliance-pointer count, framework set, binding presence, resolver_dropped presence.
const { execFileSync } = require('child_process');
const path = require('path');
const NEON = process.env.NEON_URL;
const hashes = (process.env.REMINT_HASHES || process.argv[2] || '').split(',').map(x=>x.trim()).filter(Boolean);
function q(sql){ try { return execFileSync(path.join(__dirname,'..','scripts','psql'),[NEON,'-tA','-c',sql],{encoding:'utf8'}).trim(); } catch(e){ return 'ERR:'+e.message.slice(0,60); } }
function fields(tbl,h){
  const r = q(`SELECT COALESCE(jsonb_array_length(payload_json->'pointers'),0)||'|'||(payload_json ? 'binding')||'|'||(payload_json ? 'resolver_dropped')||'|'||COALESCE(jsonb_array_length(payload_json->'applicable_frameworks'),0)||'|'||COALESCE(framework_version,'') FROM ${tbl} WHERE hash='${h}' LIMIT 1`);
  if(!r || r.startsWith('ERR')) return null;
  const [ptr,bind,drop,fw,ver]=r.split('|'); return {ptr,bind,drop,fw,ver};
}
let missing=0;
console.log('hash      | live(ptr/fw/ver)        | shadow(ptr/fw/bind/drop/ver)');
for(const h of hashes){
  const L=fields('audit_pages',h), S=fields('audit_pages_shadow',h);
  if(!S){ missing++; console.log(`${h} | ${L?L.ptr+'/'+L.fw+'/'+L.ver:'—'} | SHADOW ABSENT (not minted yet / failed)`); continue; }
  console.log(`${h} | ${L?L.ptr+'/'+L.fw+'/'+L.ver:'—'} | ptr:${S.ptr} fw:${S.fw} bind:${S.bind} drop:${S.drop} ver:${S.ver}`);
}
console.log(`\n${hashes.length-missing}/${hashes.length} shadow-minted. ${missing} pending/failed.`);
process.exit(0);
