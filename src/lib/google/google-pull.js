#!/usr/bin/env node
// Google data pull (GA4 + Search Console) using a service-account key.
// Self-contained: signs a JWT with Node crypto (RS256), exchanges for an access token,
// then calls the GA4 Data API and the Search Console API. No external deps, no token expiry
// (service-account keys do not expire), so the autonomous hourly pull never breaks.
//
// Env:
//   GOOGLE_SA_KEY_B64  base64 of the service-account JSON key
//   GA4_PROPERTY_ID    e.g. 536210909
//   GSC_SITE           e.g. sc-domain:tamazia.co.uk
//
// Usage: node src/lib/google/google-pull.js [--ga4] [--gsc]   (default: both)

const crypto = require('crypto');
const https = require('https');

function loadKey() {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (!b64) throw new Error('GOOGLE_SA_KEY_B64 not set');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

function post(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({ host, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } }, res => {
      let chunks = ''; res.on('data', d => chunks += d); res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

async function getAccessToken(scopes) {
  const key = loadKey();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(key.private_key));
  const assertion = `${header}.${claim}.${sig}`;
  const r = await post('oauth2.googleapis.com', '/token', { 'Content-Type': 'application/x-www-form-urlencoded' },
    `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`);
  const j = JSON.parse(r.body || '{}');
  if (!j.access_token) throw new Error(`token exchange failed (${r.status}): ${r.body.slice(0, 200)}`);
  return j.access_token;
}

async function pullGA4() {
  const prop = process.env.GA4_PROPERTY_ID;
  if (!prop) return { ok: false, error: 'GA4_PROPERTY_ID not set' };
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
  const r = await post('analyticsdata.googleapis.com', `/v1beta/properties/${prop}:runReport`,
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    { dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'conversions' }], dimensions: [{ name: 'date' }] });
  if (r.status !== 200) return { ok: false, status: r.status, error: r.body.slice(0, 300) };
  const j = JSON.parse(r.body);
  return { ok: true, rows: (j.rows || []).map(row => ({ date: row.dimensionValues[0].value, activeUsers: row.metricValues[0].value, sessions: row.metricValues[1].value, conversions: row.metricValues[2].value })) };
}

async function pullGSC() {
  const site = process.env.GSC_SITE;
  if (!site) return { ok: false, error: 'GSC_SITE not set' };
  const token = await getAccessToken(['https://www.googleapis.com/auth/webmasters.readonly']);
  const end = new Date(), start = new Date(Date.now() - 28 * 86400000);
  const r = await post('searchconsole.googleapis.com', `/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), dimensions: ['query'], rowLimit: 25 });
  if (r.status !== 200) return { ok: false, status: r.status, error: r.body.slice(0, 300) };
  const j = JSON.parse(r.body);
  return { ok: true, rows: (j.rows || []).map(row => ({ query: row.keys[0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position })) };
}

module.exports = { getAccessToken, pullGA4, pullGSC };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const doGA4 = args.length === 0 || args.includes('--ga4');
    const doGSC = args.length === 0 || args.includes('--gsc');
    if (doGA4) console.log('GA4:', JSON.stringify(await pullGA4(), null, 2).slice(0, 1200));
    if (doGSC) console.log('GSC:', JSON.stringify(await pullGSC(), null, 2).slice(0, 1200));
  })().catch(e => { console.error('FATAL', e.message); process.exit(1); });
}
