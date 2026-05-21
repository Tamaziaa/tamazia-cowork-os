#!/usr/bin/env node
// S051 SSL cert monitor (4.7.1)
// Probes each configured hostname's TLS cert via tls module, records cert chain into ssl_cert_state.
// Telegram alert when days_to_expiry < 14.

const tls = require('tls');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const HOSTS = (process.env.SSL_HOSTS || 'tamazia.co.uk,tamazia.in,modest-magpie.pikapod.net').split(',').map(h => h.trim()).filter(Boolean);

function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function notify(text) {
  try { execFileSync(path.resolve(ROOT, 'scripts', 'notify-telegram.sh'), [text], { stdio: 'pipe' }); } catch (_e) { /* */ }
}

function probe(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return resolve(null);
      const not_before = new Date(cert.valid_from);
      const not_after = new Date(cert.valid_to);
      const days = Math.floor((not_after.getTime() - Date.now()) / 86400000);
      resolve({ host, issuer: cert.issuer?.O || cert.issuer?.CN || 'unknown', not_before, not_after, days });
    });
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
  });
}

(async () => {
  const results = [];
  for (const h of HOSTS) {
    try {
      const r = await probe(h);
      if (!r) continue;
      const status = r.days < 14 ? 'expiring_soon' : 'ok';
      pg(`INSERT INTO ssl_cert_state (hostname, issuer, not_before, not_after, days_to_expiry, last_checked_at, status) VALUES ('${h}', '${r.issuer.replace(/'/g, "''")}', '${r.not_before.toISOString()}'::timestamptz, '${r.not_after.toISOString()}'::timestamptz, ${r.days}, NOW(), '${status}') ON CONFLICT (hostname) DO UPDATE SET issuer=EXCLUDED.issuer, not_before=EXCLUDED.not_before, not_after=EXCLUDED.not_after, days_to_expiry=EXCLUDED.days_to_expiry, last_checked_at=NOW(), status=EXCLUDED.status`);
      results.push(r);
      if (r.days < 14) notify(`*SSL cert expiring* · \`${h}\` · ${r.days} days remaining · issuer ${r.issuer}`);
    } catch (e) {
      results.push({ host: h, error: e.message });
    }
  }
  console.log(JSON.stringify(results, null, 2));
})();
