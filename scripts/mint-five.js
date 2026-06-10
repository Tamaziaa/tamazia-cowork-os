#!/usr/bin/env node
'use strict';
// One-off: mint 5 sample audits (3 big + 2 small, 5 sectors) and print the links + a compliance summary.
const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const { build } = require(path.join(ROOT, 'src', 'skills', 'S025-audit-page-builder', 'scripts', 'build.js'));

const FIRMS = [
  { domain: 'irwinmitchell.com', sector: 'legal', country: 'UK', company: 'Irwin Mitchell', size: 'BIG' },
  { domain: 'foxtons.co.uk', sector: 'realestate', country: 'UK', company: 'Foxtons', size: 'BIG' },
  { domain: 'azets.co.uk', sector: 'financial', country: 'UK', company: 'Azets', size: 'BIG' },
  { domain: 'harleystreetdentalclinic.co.uk', sector: 'dental', country: 'UK', company: 'Harley Street Dental Clinic', size: 'SMALL' },
  { domain: 'firmdalehotels.com', sector: 'hospitality', country: 'UK', company: 'Firmdale Hotels', size: 'SMALL' },
];

(async () => {
  const out = [];
  for (const f of FIRMS) {
    const t0 = Date.now();
    try {
      const r = await build({ domain: f.domain, sector: f.sector, country: f.country, company: f.company, env: process.env });
      out.push({ ...f, ok: true, url: r.signed_url, reachable: r.reachable, pointers: (r.pointers || []).length, ms: Date.now() - t0 });
      console.log(`✓ ${f.domain} (${f.size}/${f.sector}) reachable=${r.reachable} pointers=${(r.pointers || []).length} ${Math.round((Date.now() - t0) / 1000)}s`);
      console.log(`   ${r.signed_url}`);
    } catch (e) {
      out.push({ ...f, ok: false, error: e.message });
      console.log(`✗ ${f.domain} FAILED: ${e.message.slice(0, 140)}`);
    }
  }
  fs.writeFileSync(path.join(ROOT, 'mint-five.result.json'), JSON.stringify(out, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(`minted ${out.filter(x => x.ok).length}/${out.length}`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
