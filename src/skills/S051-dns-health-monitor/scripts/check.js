#!/usr/bin/env node
// DNS continuous health monitor (4.8.1)
// Resolves the critical Tamazia DNS records and compares against expected values.
// Drift gets stored in dns_health_state with drift=TRUE and fires a Telegram alert.

const dns = require('dns').promises;
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function notify(text) {
  try { execFileSync(path.resolve(ROOT, 'scripts', 'notify-telegram.sh'), [text], { stdio: 'pipe' }); } catch (_e) { /* */ }
}

// Expectations reflect the CURRENT canonical configuration as of 2026-05-19:
// tamazia.co.uk + tamazia.in MX both on Cloudflare Email Routing (route[1-3].mx.cloudflare.net).
// The earlier Zoho MX was migrated as part of the CF Email Worker pivot (Phase 1 task 1.2.1).
const CHECKS = [
  { host: 'tamazia.co.uk', type: 'MX',  expectedIncludes: 'mx.cloudflare.net' },
  { host: 'tamazia.co.uk', type: 'TXT', expectedIncludes: 'v=spf1' },
  { host: 'tamazia.in',    type: 'MX',  expectedIncludes: 'mx.cloudflare.net' },
  { host: '_dmarc.tamazia.co.uk', type: 'TXT', expectedIncludes: 'v=DMARC1' },
];

async function resolveOne(c) {
  let records = [];
  try {
    if (c.type === 'MX')      records = (await dns.resolveMx(c.host)).map(r => r.exchange);
    else if (c.type === 'TXT') records = (await dns.resolveTxt(c.host)).map(r => r.join(''));
    else if (c.type === 'A')   records = await dns.resolve4(c.host);
    else if (c.type === 'CNAME') records = await dns.resolveCname(c.host);
  } catch (e) {
    return { host: c.host, type: c.type, expected: c.expectedIncludes, actual: 'ERROR:' + e.code, drift: true };
  }
  const joined = records.join(', ');
  const drift = !records.some(r => r.toLowerCase().includes(c.expectedIncludes.toLowerCase()));
  return { host: c.host, type: c.type, expected: c.expectedIncludes, actual: joined.slice(0, 400), drift };
}

(async () => {
  const results = [];
  for (const c of CHECKS) {
    const r = await resolveOne(c);
    pg(`INSERT INTO dns_health_state (hostname, record_type, expected_value, actual_value, drift, last_checked_at) VALUES ('${r.host}', '${r.type}', '${r.expected.replace(/'/g, "''")}', '${r.actual.replace(/'/g, "''")}', ${r.drift ? 'TRUE' : 'FALSE'}, NOW()) ON CONFLICT (hostname, record_type) DO UPDATE SET expected_value=EXCLUDED.expected_value, actual_value=EXCLUDED.actual_value, drift=EXCLUDED.drift, last_checked_at=NOW()`);
    if (r.drift) notify(`*DNS drift* · ${r.host} ${r.type} · expected to include \`${r.expected}\` · actual: \`${r.actual.slice(0, 200)}\``);
    results.push(r);
  }
  console.log(JSON.stringify(results, null, 2));
})();
