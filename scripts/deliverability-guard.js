#!/usr/bin/env node
// P2-7 · Weekly deliverability guard. For each sending domain, checks SPF + DKIM + DMARC over DNS (DNS-over-
// HTTPS, no resolver needed) and flags any domain not connected to Google Postmaster Tools (postmaster TXT
// token present). Any failure is written to the notifications table so it surfaces in the daily digest's
// "Deliverability + domains" group, and a realtime alert fires via the existing notify path (notify-event.js
// 'stuck' channel) when a domain is misconfigured. Read-only DNS + one notification write. Fail-open per check.
//
// Domains: read live from mailbox_pool.domain when populated, else the 6 IceMail sending domains (CLAUDE.md).
// Usage: node scripts/deliverability-guard.js [--report]   (--report prints the table, never alerts/writes)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, execFile } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');
const REPORT = process.argv.includes('--report');
function pg(sql) { if (!NEON) return ''; try { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// The 6 IceMail sending domains (fallback when mailbox_pool is empty / pre-provision). Env SENDING_DOMAINS
// (comma-separated) overrides. DKIM selectors to probe (Google Workspace = 'google'; common others tried too).
const FALLBACK_DOMAINS = ['tamaziatop100.com', 'tamaziaworld.uk', 'tamazia.info', 'tamazia.online', 'tamazia.store', 'tamazia.uk'];
const DKIM_SELECTORS = (process.env.DKIM_SELECTORS || 'google,selector1,selector2,default,k1,mail,dkim').split(',').map(s => s.trim()).filter(Boolean);

function sendingDomains() {
  if (process.env.SENDING_DOMAINS) return process.env.SENDING_DOMAINS.split(',').map(s => s.trim()).filter(Boolean);
  const live = (pg(`SELECT DISTINCT domain FROM mailbox_pool WHERE COALESCE(domain,'') <> ''`) || '').split('\n').filter(Boolean);
  return live.length ? live : FALLBACK_DOMAINS;
}

// DNS-over-HTTPS TXT/CNAME lookup (Cloudflare, Google fallback). Returns array of record data strings.
async function dohQuery(name, type = 'TXT') {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const d = await r.json();
      return (d.Answer || []).map(a => String(a.data || '').replace(/^"|"$/g, '').replace(/" "/g, ''));
    } catch (_e) {}
  }
  return null; // null = lookup failed (distinct from [] = no record)
}

async function checkDomain(domain) {
  const out = { domain, spf: null, dmarc: null, dkim: null, postmaster: null, errors: [] };
  // SPF: a TXT on the apex starting v=spf1
  const apex = await dohQuery(domain, 'TXT');
  if (apex == null) out.errors.push('spf_lookup_failed');
  else out.spf = apex.some(t => /^v=spf1\b/i.test(t));
  // DMARC: TXT at _dmarc.<domain> starting v=DMARC1; capture policy
  const dmarc = await dohQuery('_dmarc.' + domain, 'TXT');
  if (dmarc == null) out.errors.push('dmarc_lookup_failed');
  else { const rec = dmarc.find(t => /^v=DMARC1\b/i.test(t)); out.dmarc = !!rec; out.dmarc_policy = rec ? (rec.match(/\bp=([a-z]+)/i) || [, ''])[1] : ''; }
  // DKIM: any known selector with a TXT/CNAME at <selector>._domainkey.<domain>
  let dkimFound = false;
  for (const sel of DKIM_SELECTORS) {
    const txt = await dohQuery(`${sel}._domainkey.${domain}`, 'TXT');
    if (txt && txt.some(t => /v=DKIM1|k=rsa|p=/i.test(t))) { dkimFound = true; out.dkim_selector = sel; break; }
    const cname = await dohQuery(`${sel}._domainkey.${domain}`, 'CNAME');
    if (cname && cname.length) { dkimFound = true; out.dkim_selector = sel + ' (CNAME)'; break; }
  }
  out.dkim = dkimFound;
  // Google Postmaster Tools verification: a TXT token 'google-site-verification=' on the apex indicates the
  // domain is verified with Google (the same token Postmaster Tools accepts). Not a perfect signal, but it is
  // the only DNS-observable proxy for "connected to Postmaster". Absent => flag to connect it.
  if (apex != null) out.postmaster = apex.some(t => /google-site-verification=/i.test(t));
  return out;
}

function verdict(c) {
  const fails = [];
  if (c.spf === false) fails.push('no SPF');
  if (c.dmarc === false) fails.push('no DMARC');
  if (c.dkim === false) fails.push('no DKIM');
  if (c.postmaster === false) fails.push('not connected to Google Postmaster');
  return fails;
}

async function notifyEvent(kind, msg) {
  return new Promise(res => {
    try { execFile(process.execPath, [path.join(ROOT, 'scripts', 'notify-event.js'), kind, msg], { timeout: 20000 }, () => res()); }
    catch (_e) { res(); }
  });
}

(async () => {
  const domains = sendingDomains();
  console.log(`[deliverability-guard] checking ${domains.length} sending domain(s): ${domains.join(', ')}`);
  const flagged = [];
  for (const d of domains) {
    let c; try { c = await checkDomain(d); } catch (e) { console.error('  ' + d + ' error: ' + e.message); continue; }
    const fails = verdict(c);
    const line = `${d.padEnd(22)} SPF:${c.spf === null ? '?' : c.spf ? 'Y' : 'N'} DKIM:${c.dkim === null ? '?' : c.dkim ? 'Y' : 'N'} DMARC:${c.dmarc === null ? '?' : c.dmarc ? 'Y' : 'N'}${c.dmarc_policy ? '(' + c.dmarc_policy + ')' : ''} Postmaster:${c.postmaster === null ? '?' : c.postmaster ? 'Y' : 'N'}${fails.length ? '  -> ' + fails.join(', ') : '  OK'}`;
    console.log('  ' + line);
    if (fails.length) flagged.push(`${d}: ${fails.join(', ')}`);
  }
  if (!flagged.length) { console.log('[deliverability-guard] all sending domains pass SPF/DKIM/DMARC + Postmaster.'); return; }
  const title = `Deliverability/DNS alert (${flagged.length} domain${flagged.length > 1 ? 's' : ''}): ` + flagged.join(' | ');
  if (REPORT) { console.log('[deliverability-guard] (report mode) would alert: ' + title); return; }
  // write to the digest ("Deliverability + domains" group matches /dns|spf|dmarc|deliver/) + realtime alert
  pg(`INSERT INTO notifications (kind, severity, title, realtime) VALUES ('deliverability_dns_guard','warning',${esc(title.slice(0, 600))},FALSE)`);
  await notifyEvent('stuck', title.slice(0, 500));
  console.log('[deliverability-guard] flagged ' + flagged.length + ' domain(s) -> digest + realtime alert.');
})().catch(e => { console.error('[deliverability-guard] fatal (fail-open):', e.message); process.exit(0); });
