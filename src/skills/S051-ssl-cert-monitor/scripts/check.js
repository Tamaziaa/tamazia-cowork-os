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

// TLS-validation errors that mean "we DID receive a certificate, we just refused to trust it".
// These are precisely the states this monitor exists to alert on, so they get a scoped inspection retry.
const CERT_VALIDATION_ERRORS = new Set([
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_UNTRUSTED', 'CERT_REVOKED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'HOSTNAME_MISMATCH',
]);

function readCert(socket, host) {
  const cert = socket.getPeerCertificate();
  if (!cert || !cert.valid_to) return null;
  const not_before = new Date(cert.valid_from);
  const not_after = new Date(cert.valid_to);
  const days = Math.floor((not_after.getTime() - Date.now()) / 86400000);
  return { host, issuer: cert.issuer?.O || cert.issuer?.CN || 'unknown', not_before, not_after, days, authorized: socket.authorized === true };
}

// `inspectOnly` opens a certificate-INSPECTION socket: it completes the handshake without enforcing chain
// trust, reads the presented certificate, and closes. It never sends a byte of application data, never
// carries a credential, and its result is only ever written to ssl_cert_state. It is used ONLY as the
// phase-2 fallback below — every other TLS connection in this repo keeps full validation.
function connectTls(host, inspectOnly) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host, port: 443, servername: host, timeout: 10000,
      rejectUnauthorized: !inspectOnly, // eslint-disable-line no-unneeded-ternary
    }, () => {
      const r = readCert(socket, host);
      socket.end();
      resolve(r);
    });
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
  });
}

// Phase 1: connect with certificate validation FULLY ON. Healthy hosts (the overwhelmingly common case)
// never disable verification any more.
// Phase 2: if — and only if — phase 1 failed because the certificate itself did not validate, re-probe on a
// cert-inspection socket to actually read the bad certificate. Node destroys the TLS socket on a failed
// handshake (getPeerCertificate() returns {} in the error handler — verified against expired.badssl.com),
// so without this scoped fallback the monitor would go blind on expired/self-signed certs, i.e. it would
// stop alerting in exactly the situation it was built for.
async function probe(host) {
  try {
    return await connectTls(host, false);
  } catch (e) {
    const code = (e && (e.code || e.message)) || '';
    if (!CERT_VALIDATION_ERRORS.has(code)) throw e; // network/timeout/DNS — surface as before
    return await connectTls(host, true);
  }
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
