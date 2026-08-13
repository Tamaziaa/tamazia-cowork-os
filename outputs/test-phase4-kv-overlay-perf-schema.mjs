// Phase 4 · KV cache + overlay + perf + schema hardening.
import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { validateFinding } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/schema/finding-schema');

const SECRET = 'test_secret_key_1234567890abcdef';
let src = fs.readFileSync('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/cloudflare/audit-page-worker.js', 'utf8')
  .replaceAll('__NEON_URL__', 'postgres://u:p@ep-test.neon.tech/db').replaceAll('__TAMAZIA_HMAC_SECRET__', SECRET);
fs.writeFileSync('/tmp/wp4.mjs', src);
const mod = (await import('file:///tmp/wp4.mjs?c=' + Date.now())).default;
function sign(slug, hash, l, x) { return crypto.createHmac('sha256', SECRET).update(`${slug}|${hash}|${l}|${x}`).digest('hex').slice(0, 32); }

let pass = 0, fail = 0;
const failures = [];
function chk(c, n) { if (c) { pass++; } else { fail++; failures.push(n); console.log('  FAIL ' + n); } }

console.log('\n=== L1 · Schema hardening ===');
// Length cap
const long = 'a'.repeat(4500);
const r1 = validateFinding({ category: 'privacy_notice_missing', severity: 'P0', location: '/', evidence: long, fix: 'do the thing properly' });
chk(!r1.ok, 'evidence > 4000 chars rejected');

// language BCP-47 check
const r2 = validateFinding({ category: 'privacy_notice_missing', severity: 'P0', location: '/', evidence: 'long enough text here xxxxx', fix: 'long enough fix text xxxxx', language: 'english' });
chk(!r2.ok, 'invalid language code rejected');

const r3 = validateFinding({ category: 'privacy_notice_missing', severity: 'P0', location: '/', evidence: 'long enough text here xxxxx', fix: 'long enough fix text xxxxx', language: 'en' });
chk(r3.ok, 'valid language code accepted');

const r4 = validateFinding({ category: 'privacy_notice_missing', severity: 'P0', location: '/', evidence: 'long enough text here xxxxx', fix: 'long enough fix text xxxxx', language: 'en-GB' });
chk(r4.ok, 'BCP-47 region code accepted');

const r5 = validateFinding({ category: 'privacy_notice_missing', severity: 'P0', location: '/', evidence: 'long enough text here xxxxx', fix: 'long enough fix text xxxxx', citation_url: 42 });
chk(!r5.ok, 'non-string citation_url rejected');

console.log(`  L1: ${pass} pass / ${fail} fail`);

console.log('\n=== L2 · Telemetry response headers ===');
const payload = { schema_version:'v1', domain:'streathers.co.uk', sector:'law-firms', country:'UK', framework_version:'7.4.0', applicable_frameworks:['UK_GDPR_A13','UK_PECR','UK_SRA_COC','GOOGLE_EEAT'], rules:[], sections:{cover:{firm:'streathers'}} };
const pts = [
  { severity:'P0', citation:'Privacy notice missing', category:'privacy_notice_missing', framework:'UK_GDPR_A13', location:'/', evidence:'no privacy notice anywhere', fix:'publish UK GDPR Article 13/14 notice', uplift:'closes ICO' }
];
globalThis.fetch = async (_u, opts) => {
  const q = JSON.parse(opts.body).query;
  let rows = [];
  if (/FROM audit_pages/.test(q)) rows = [[JSON.stringify(payload),'streathers.co.uk','law-firms','UK']];
  else if (/FROM leads/.test(q)) rows = [['Streathers', 78, JSON.stringify(pts)]];
  return { ok: true, json: async () => ({ rows }) };
};
const future = Math.floor(Date.now()/1000)+86400;
const sig = sign('streathers', 'YpHBx5lx', '48', future);
const r = await mod.fetch(new Request(`https://tamazia.co.uk/audit/streathers/YpHBx5lx?l=48&x=${future}&sig=${sig}`));
const headers = Object.fromEntries(r.headers.entries());
chk(headers['x-tamazia-engine'] === 'v23-phase4', `engine header = v23-phase4 (got ${headers['x-tamazia-engine']})`);
chk(headers['x-tamazia-country'] === 'UK', `country header = UK (got ${headers['x-tamazia-country']})`);
chk(headers['x-tamazia-sector'] === 'law-firms', `sector header = law-firms (got ${headers['x-tamazia-sector']})`);
chk(headers['x-tamazia-findings-count'] === '1', `findings-count header = 1 (got ${headers['x-tamazia-findings-count']})`);
chk(headers['x-tamazia-cache'] === 'no-KV', `cache header reports no-KV when binding absent (got ${headers['x-tamazia-cache']})`);
chk(/s-maxage=3600/.test(headers['cdn-cache-control'] || ''), 'CDN cache header present');

console.log(`  L2: ${pass} pass / ${fail} fail`);

console.log('\n=== L3 · KV cache path ===');
// Simulate a KV binding with put/get semantics.
const kv = {
  _store: new Map(),
  async get(k) { return this._store.has(k) ? this._store.get(k) : null; },
  async put(k, v) { this._store.set(k, v); }
};
const env = { AUDIT_KV: kv };
const ctxFake = { waitUntil: (p) => p };
const fake = await mod.fetch(new Request(`https://tamazia.co.uk/audit/streathers/YpHBx5lx?l=48&x=${future}&sig=${sig}`), env, ctxFake);
const firstHeaders = Object.fromEntries(fake.headers.entries());
chk(firstHeaders['x-tamazia-cache'] === 'KV-miss', `first request: KV-miss (got ${firstHeaders['x-tamazia-cache']})`);

// Give the waitUntil time to resolve
await new Promise(r => setTimeout(r, 50));

const fake2 = await mod.fetch(new Request(`https://tamazia.co.uk/audit/streathers/YpHBx5lx?l=48&x=${future}&sig=${sig}`), env, ctxFake);
const secondHeaders = Object.fromEntries(fake2.headers.entries());
chk(secondHeaders['x-tamazia-cache'] === 'KV-hit', `second request: KV-hit (got ${secondHeaders['x-tamazia-cache']})`);

console.log(`  L3: ${pass} pass / ${fail} fail`);

console.log('\n=== L4 · Annotation overlay (non-overlapping markers) ===');
const html = await fake.text();
chk(/class="shot-grid"/.test(html), 'shot-grid layout present');
chk(/position:absolute;top:\d+%;left:8px/.test(html), 'numbered markers anchored to absolute % offsets');
const annotCount = (html.match(/<details class="annot"/g) || []).length;
chk(annotCount === 0, `no legacy <details class="annot"> (got ${annotCount})`);

console.log(`  L4: ${pass} pass / ${fail} fail`);

console.log(`\n=========== PHASE 4 RESULT: ${pass} pass / ${fail} fail ===========\n`);
if (fail > 0) for (const f of failures) console.log('  · ' + f);
process.exit(fail === 0 ? 0 : 1);
