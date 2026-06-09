'use strict';
// Residential-proxy fetch via the creator Apify account (RESIDENTIAL group, ~10GB/mo on credits) using Node
// built-ins only (HTTP CONNECT tunnel). Used as a FALLBACK to reach sites that block datacenter IPs, so our own
// email/contact scrapers extract more. Gated by APIFY_RESIDENTIAL_ENABLED + APIFY_PROXY_PASSWORD. Never throws.
const http = require('http');
const https = require('https');

function residentialGet(url, { timeout = 15000, country } = {}) {
  return new Promise((resolve) => {
    const pw = process.env.APIFY_PROXY_PASSWORD;
    if (!pw || !/^(1|true|yes|on)$/i.test(process.env.APIFY_RESIDENTIAL_ENABLED || '')) return resolve({ ok: false, body: '', status: 0, skipped: true });
    let u; try { u = new URL(url); } catch { return resolve({ ok: false, body: '', status: 0 }); }
    const port = u.protocol === 'https:' ? 443 : 80;
    const grp = country ? `groups-RESIDENTIAL,country-${country}` : 'groups-RESIDENTIAL';
    const auth = 'Basic ' + Buffer.from(grp + ':' + pw).toString('base64');
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    let settled = false;
    const con = http.request({ host: 'proxy.apify.com', port: 8000, method: 'CONNECT', path: `${u.hostname}:${port}`, headers: { 'Proxy-Authorization': auth } });
    con.setTimeout(timeout, () => { con.destroy(); done({ ok: false, body: '', status: 0 }); });
    con.on('error', () => done({ ok: false, body: '', status: 0 }));
    con.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return done({ ok: false, body: '', status: res.statusCode }); }
      const reqFn = u.protocol === 'https:' ? https.request : http.request;
      const r2 = reqFn({ host: u.hostname, port, path: u.pathname + u.search, method: 'GET', socket, agent: false, servername: u.hostname,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', 'Host': u.hostname, 'Accept': 'text/html' } },
        (resp) => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => done({ ok: resp.statusCode >= 200 && resp.statusCode < 400, body: d, status: resp.statusCode })); });
      r2.setTimeout(timeout, () => { r2.destroy(); done({ ok: false, body: '', status: 0 }); });
      r2.on('error', () => done({ ok: false, body: '', status: 0 }));
      r2.end();
    });
    con.end();
  });
}
module.exports = { residentialGet };
