import { renderPage, adapt, assessDimensions } from './cloudflare/audit-worker-v14.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
// mkdtemp → 0700 dir, unpredictable name. A fixed /tmp/render_v21.html is symlink-hijackable.
const OUT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tamazia-')), 'render_v21.html');
const pj = JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/harley_final.json','utf8'));
const row = { payload_json: pj, company:'Harley Street Dental Clinic', domain:'harleystreetdentalclinic.co.uk', sector:'healthcare', country:'UK', lead_id:null, expires_at:'2030-01-01T00:00:00Z' };
const a = adapt(row);
const dims = assessDimensions(a.pointers, a.signals, a.ai_readiness);
console.log('DIMS assessed:', Object.fromEntries(Object.entries(dims).map(([k,v])=>[k, v.assessed?('Y c'+v.crit+' h'+v.high):'—'])));
const html = renderPage(a, 'https://tamazia.co.uk/audit/harley-street-dental-clinic-expert-cosmetic-dentist-in-londo/sJ4HbRK0');
fs.writeFileSync(OUT, html); console.log('html:', OUT);
console.log('rendered bytes:', html.length);
const naCount = (html.match(/Not assessed/gi)||[]).length;
console.log('"Not assessed" occurrences:', naCount);
