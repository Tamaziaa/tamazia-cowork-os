'use strict';
// Minimal, fail-soft Apify client for the enrichment bottleneck + the audit-crawl escalation.
// - Paid enrichment actors (Leads Finder, Contact Details, Email Verifier) run on the STARTER token and are
//   COST-GOVERNED: once month-to-date 'apify' spend in cost_ledger would exceed APIFY_MONTHLY_CAP_USD ($29),
//   further paid calls are refused (return []). Every paid call logs its actual cost.
// - Free universal crawlers (website-content-crawler / cheerio) run on the CREATOR token ($500/6mo credit),
//   tracked under 'apify_creator' for visibility but not capped against the $29.
// Everything returns [] / null on any error so the pipeline never breaks if Apify is down or disabled.
const https = require('https');
let _ledger = {}; try { _ledger = require('../cost-ledger.js'); } catch (_) { _ledger = {}; }
const logUsage = _ledger.logUsage || (async () => {});
const monthSpend = _ledger.monthSpend || (async () => NaN); // no ledger → cannot verify budget → fail-closed

const ENABLED = (env) => /^(1|true|yes|on)$/i.test(env.APIFY_ENABLE || '');
const CAP_USD = (env) => Number(env.APIFY_MONTHLY_CAP_USD || 29);
const tokenFor = (env, kind) => kind === 'creator' ? (env.APIFY_TOKEN_CREATOR || '') : (env.APIFY_TOKEN_STARTER || env.APIFY_TOKEN || '');
// Per-result unit cost (USD) — the store prices, used for cost logging + the cap estimate.
const UNIT_USD = { leads: 0.0015, contact: 0.00105, verify: 0.0006, crawl: 0.0005 };
const ACTORS = (env) => ({
  leads: (env.APIFY_ACTOR_LEADS || 'code_crafter~leads-finder'),
  contact: (env.APIFY_ACTOR_CONTACT || 'vdrmota~contact-info-scraper'),
  verify: (env.APIFY_ACTOR_VERIFY || 'michael.g~email-verifier-validator'),
  crawl: (env.APIFY_ACTOR_CRAWL || 'apify~website-content-crawler'),
});

function _post(url, body, timeoutMs) {
  return new Promise((resolve) => {
    let data = ''; const u = new URL(url);
    const req = https.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: timeoutMs }, (r) => {
      r.on('data', (d) => data += d); r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.write(JSON.stringify(body || {})); req.end();
  });
}

// Run an actor synchronously and return its dataset items (array). Cost-governed for paid (starter) actors.
async function runActor({ actorId, input, kind = 'starter', unit = 0, env = process.env, timeoutMs = 120000, label = '' }) {
  if (!ENABLED(env)) return [];
  const tok = tokenFor(env, kind);
  if (!tok || !actorId) return [];
  if (kind !== 'creator') {
    const spent = await monthSpend('apify');
    // Fail-CLOSED: if spend can't be verified (NaN from a ledger outage) OR the cap is reached, skip the paid call.
    if (!Number.isFinite(spent) || spent >= CAP_USD(env)) { console.log(`[apify] budget guard (spent=${spent}, cap=$${CAP_USD(env)}) — skipping ${label || actorId}`); return []; }
  }
  const id = String(actorId).replace('/', '~');
  const url = `https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?token=${encodeURIComponent(tok)}`;
  const r = await _post(url, input, timeoutMs);
  if (r.status !== 200 && r.status !== 201) { console.log(`[apify] ${label || id} http ${r.status}`); return []; }
  let items = []; try { items = JSON.parse(r.body); } catch (_) { return []; }
  if (!Array.isArray(items)) items = (items && items.items) || [];
  const cost = (items.length || 0) * (unit || 0);
  if (cost > 0) { try { await logUsage(kind === 'creator' ? 'apify_creator' : 'apify', cost, { actor: id, items: items.length, label }); } catch (_) {} }
  return items;
}

// ---- High-level helpers (DIY-miss gated by the caller) ----

// Decision-maker by title + domain → business email (Apollo-style DB; no Apollo credits).
async function findDecisionMakerEmail({ domain, company, titles, env = process.env }) {
  const input = { company_domain: domain ? [domain] : undefined, contact_job_title: titles && titles.length ? titles : ['owner', 'founder', 'managing partner', 'managing director', 'partner', 'principal', 'practice manager', 'general manager'], email_status: ['validated'], fetch_count: 10 };
  const items = await runActor({ actorId: ACTORS(env).leads, input, kind: 'starter', unit: UNIT_USD.leads, env, label: 'leads-finder' });
  // Input filtered to email_status:['validated'] -> returned leads are verified by construction (no email_status in output).
  return items.map(p => ({ name: p.full_name || [p.first_name || p.firstName, p.last_name || p.lastName].filter(Boolean).join(' ') || p.name || '', email: (p.email || '').toLowerCase(), title: p.job_title || p.headline || '', linkedin: p.linkedin_url || p.linkedin || '', source: 'apify_leads', verified: true })).filter(x => x.email && /@/.test(x.email));
}

// All emails/phones/socials off a company website (the primary signal — fallback when DIY scrape misses).
async function contactDetails({ domain, env = process.env }) {
  if (!domain) return { emails: [], socials: {} };
  const input = { startUrls: [{ url: 'https://' + domain }], maxDepth: 1, maxRequests: 6 };
  const items = await runActor({ actorId: ACTORS(env).contact, input, kind: 'starter', unit: UNIT_USD.contact, env, label: 'contact-details' });
  const emails = []; const socials = {};
  for (const it of items) {
    for (const e of (it.emails || [])) if (e && /@/.test(e)) emails.push({ value: String(e).toLowerCase(), source: 'apify_contact' });
    for (const k of ['linkedIns', 'instagrams', 'twitters', 'facebooks']) for (const u of (it[k] || [])) { const key = k.replace(/s$/, ''); if (!socials[key]) socials[key] = u; }
  }
  return { emails, socials };
}

// Deliverability verification for a batch of emails (final gate before send).
async function verifyEmails({ emails, env = process.env }) {
  const list = (emails || []).filter(e => e && /@/.test(e));
  if (!list.length) return [];
  const input = { emails: list };
  const items = await runActor({ actorId: ACTORS(env).verify, input, kind: 'starter', unit: UNIT_USD.verify, env, label: 'email-verify' });
  // Verifier status values are good/risky/bad. Consumers must treat ONLY /^good$/i as verified.
  return items.map(it => ({ email: String(it.email || '').toLowerCase(), status: String(it.status || '').toLowerCase(), score: Number(it.score || 0) }));
}

// Audit-crawl escalation — LLM-ready markdown for a site that blocked / didn't render for the DIY crawler.
// Runs on the CREATOR token ($500 free credit), not the $29 cap.
async function crawlSite({ url, maxPages = 6, env = process.env }) {
  if (!url) return [];
  const startUrl = /^https?:\/\//.test(url) ? url : 'https://' + url;
  const input = { startUrls: [{ url: startUrl }], maxCrawlPages: maxPages, crawlerType: 'cheerio', saveMarkdown: true };
  const items = await runActor({ actorId: ACTORS(env).crawl, input, kind: 'creator', unit: UNIT_USD.crawl, env, timeoutMs: 180000, label: 'wcc-crawl' });
  return items.map(it => ({ url: it.url || '', title: (it.metadata && it.metadata.title) || it.title || '', markdown: it.markdown || it.text || '', html: it.html || '' }));
}

module.exports = { runActor, findDecisionMakerEmail, contactDetails, verifyEmails, crawlSite, UNIT_USD, ACTORS };
