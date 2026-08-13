#!/usr/bin/env node
// FIND EMAILS · £0 email-coverage lift (the real ceiling: only ~7% of leads had an email).
// For leads with a domain but no email, this:
//   1. If a contact first/last name exists → runs find-every-email (12 pattern guesses + MX/SMTP probe).
//   2. Otherwise → probes generic role addresses (info@, contact@, enquiries@, hello@, office@) via the
//      same MX/SMTP RCPT probe, taking the first that verifies.
// Writes leads.contact_email (+ a marker in source_raw). No paid APIs. Safe: read+update only.
// CAVEAT: many mail servers block RCPT probes or are catch-alls (false positives). This lifts coverage
// where it can; the verify step (verify-contacts.js) + the quality gate still police deliverability.
//
// Usage: node scripts/find-emails.js [LIMIT]   (default 20)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const fee = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'find-every-email.js'));
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { return null; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

const ROLE_LOCALS = ['info', 'contact', 'enquiries', 'hello', 'office', 'mail'];

// PRIMARY method (works on port-25-blocked hosts): scrape published emails off the firm's website.
// Fetches homepage + common contact paths, extracts mailto: + plain-text emails on the lead's own domain.
async function scrapeWebsiteEmails(domain) {
  const paths = ['', '/contact', '/contact-us', '/about', '/team'];
  const found = new Set();
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  for (const p of paths) {
    for (const scheme of ['https://', 'https://www.']) {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(scheme + domain + p, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 TamaziaResearch/1.0' } });
        clearTimeout(t);
        if (!r.ok) continue;
        const html = (await r.text()).slice(0, 400000);
        for (const m of html.match(emailRe) || []) {
          const e = m.toLowerCase();
          if (e.endsWith('@' + domain) || e.endsWith('.' + domain)) {
            if (!/\.(png|jpg|jpeg|gif|webp|svg)$/.test(e) && !e.includes('example.') && !e.includes('sentry') && !e.includes('wixpress')) found.add(e);
          }
        }
        if (found.size) break;
      } catch (_e) {}
    }
    if (found.size) break;
  }
  // prefer a named person address, else a role address, else any
  const list = [...found];
  return list.find(e => !ROLE_LOCALS.includes(e.split('@')[0])) || list[0] || null;
}

async function findGenericEmail(domain) {
  let mx;
  try { mx = await fee.lookupMX(domain); } catch (_e) { return null; }
  if (!mx) return null;
  for (const local of ROLE_LOCALS) {
    const addr = `${local}@${domain}`;
    try { const r = await fee.smtpRcptProbe(mx, 'aman@tamazia.co.uk', addr); if (r && (r.accepted || r.ok || r === true)) return addr; } catch (_e) {}
  }
  return null;
}

(async () => {
  const limit = Number(process.argv[2] || 20);
  const raw = pg(`
    SELECT id::text, COALESCE(domain,''), COALESCE(first_name,''), COALESCE(last_name,'')
    FROM leads
    WHERE COALESCE(domain,'') <> ''
      AND COALESCE(NULLIF(email,''), contact_email, '') = ''
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%'
    ORDER BY COALESCE(quality_score,0) DESC NULLS LAST, id DESC LIMIT ${limit}`);
  const leads = raw ? raw.split('\n').filter(Boolean).map(l => { const [id, domain, first_name, last_name] = l.split('\t'); return { id: Number(id), domain, first_name, last_name }; }) : [];
  console.log(`find-emails · ${leads.length} leads with a domain but no email · ${new Date().toISOString()}`);
  let found = 0;
  for (const lead of leads) {
    let email = null, method = null;
    try {
      // 1) scrape published emails off the site (works on port-25-blocked hosts) — most reliable
      email = await scrapeWebsiteEmails(lead.domain); if (email) method = 'scraped';
      // 2) pattern guess + SMTP probe (needs a contact name + outbound port 25)
      if (!email && lead.first_name && lead.last_name) {
        const r = await fee.find({ first: lead.first_name, last: lead.last_name, domain: lead.domain, probe: true });
        if (r && (r.email || r.best)) { email = r.email || r.best; method = 'pattern'; }
      }
      // 3) generic role probe (needs port 25)
      if (!email) { email = await findGenericEmail(lead.domain); if (email) method = 'role'; }
    } catch (e) { /* keep going */ }
    if (email) { pg(`UPDATE leads SET contact_email=${esc(email)}, contact_confidence=COALESCE(contact_confidence,40), updated_at=NOW() WHERE id=${lead.id} AND COALESCE(NULLIF(email,''),contact_email,'')=''`); found++; console.log(`  [${lead.id}] ${lead.domain} → ${email} (${method})`); }
  }
  console.log(`find-emails · found ${found}/${leads.length}`);
})().catch(e => { console.error('[find-emails] FATAL', e.message); process.exit(1); });
