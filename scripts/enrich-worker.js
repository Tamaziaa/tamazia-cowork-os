#!/usr/bin/env node
'use strict';
// 24/7 enrichment worker — the binding throttle of the pipeline. Drains un-enriched leads at concurrency,
// runs the website-first DIY waterfall (enrichCompany) with the cost-governed Apify escalation on served
// verticals, then persists THE decision-maker (primary_email/role/source/confidence) + the secondary cc/bcc
// contacts + verification, so the qualify step can tier them. Multi-worker-safe (FOR UPDATE SKIP LOCKED).
//   node scripts/enrich-worker.js                 # loop forever (pm2)
//   node scripts/enrich-worker.js --once          # drain to empty, then exit
//   node scripts/enrich-worker.js --once --max 8  # enrich UP TO 8 then exit (the engine-cycle bounded mode)
//   node scripts/enrich-worker.js --dry           # claim + enrich + print, NO DB write
// Env: ENRICH_CONCURRENCY (default 6), ENRICH_IDLE_MS (20000), APIFY_ENABLE, APIFY_MONTHLY_CAP_USD
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
// load .env (repo root, then sibling execution dir) without overriding real env
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const { enrichCompany } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'enrich.js'));
const { SECTORS, classifyEntityType, entityNeedsConsent } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'icp.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jb = (v) => v == null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

const CONC = Math.max(1, parseInt(process.env.ENRICH_CONCURRENCY || '6', 10));
const IDLE = Math.max(1000, parseInt(process.env.ENRICH_IDLE_MS || '20000', 10));
const ONCE = process.argv.includes('--once');
const DRY = process.argv.includes('--dry');
// bounded mode for the engine cycle — cap TOTAL leads enriched per run so a single cycle step never tries to
// drain the whole backlog (thousands) and overrun. `--max N` or a positional N (0 = unbounded, the pm2 default).
const MAX = (() => { const i = process.argv.indexOf('--max'); if (i >= 0 && /^\d+$/.test(process.argv[i + 1] || '')) return parseInt(process.argv[i + 1], 10); const pos = process.argv.slice(2).find((a) => /^\d+$/.test(a)); return pos ? parseInt(pos, 10) : 0; })();
// Apify (paid, $29-capped) escalation stays OFF unless APIFY_ENABLE is set; make it explicit at the call site
// too (the apify client already fail-closes on the env + the monthly cap; this avoids even attempting the call).
const APIFY_ON = /^(1|true|yes|on)$/i.test(process.env.APIFY_ENABLE || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atomically claim un-enriched leads. Setting enriched_at NOW() marks them taken so other workers skip.
function claimBatch(lim) {
  const sql = `UPDATE leads SET enriched_at = NOW()
    WHERE id IN (
      SELECT id FROM leads
      WHERE COALESCE(domain,'') <> '' AND enriched_at IS NULL
        AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
        AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      ORDER BY priority_score DESC NULLS LAST, id DESC
      LIMIT ${lim} FOR UPDATE SKIP LOCKED)
    RETURNING id, regexp_replace(COALESCE(domain,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(company,''),'[\t\r\n]+',' ','g'), regexp_replace(COALESCE(sector,''),'[\t\r\n]+',' ','g');`;
  const out = (pg(sql) || '').trim();
  if (!out) return [];
  return out.split('\n').map((l) => { const [id, domain, company, sector] = l.split('\t'); return { id, domain, company, sector }; });
}

async function enrichOne(row) {
  const served = !!SECTORS[String(row.sector || '').toLowerCase()];
  let rec;
  try {
    rec = await enrichCompany({ domain: row.domain, company: row.company, sector: row.sector, env: process.env, verify: true, useCache: true, apify: APIFY_ON && served });
  } catch (e) { console.log('  ERR ' + row.domain + ' ' + String(e.message || e).slice(0, 100)); return; }
  const primary = rec.primary || null;
  const secondary = rec.secondary_emails || [];
  const socials = rec.socials || {};
  const liUrl = (socials.linkedin && (socials.linkedin.url || socials.linkedin)) || (rec.linkedin_people && rec.linkedin_people[0]) || '';
  // P2-3: keep UP TO 3 LinkedIn-identified people for multi-threading (not just the first URL). Pull named
  // decision-makers that carry a personal /in/ LinkedIn URL first (best for a 1:1 approach), then top up from
  // any remaining personal LinkedIn URLs found on the site. De-dupe by URL, cap at 3, store as decision_makers
  // jsonb [{name,title,linkedin,source}]. This is additive — the legacy single linkedin_url is still written.
  const liNames = (() => {
    const out = []; const seen = new Set();
    const isPersonal = (u) => /linkedin\.com\/in\//i.test(String(u || ''));
    for (const d of (rec.decisionMakers || [])) {
      if (out.length >= 3) break;
      const u = d.linkedin || '';
      if (!isPersonal(u) || seen.has(u.toLowerCase())) continue;
      seen.add(u.toLowerCase());
      out.push({ name: d.name || [d.first_name, d.last_name].filter(Boolean).join(' '), title: d.title || '', linkedin: u, source: d.source || 'enrich' });
    }
    for (const u of (rec.linkedin_people || [])) {
      if (out.length >= 3) break;
      if (!isPersonal(u) || seen.has(String(u).toLowerCase())) continue;
      seen.add(String(u).toLowerCase());
      out.push({ name: '', title: '', linkedin: u, source: 'site' });
    }
    return out;
  })();
  if (DRY) {
    console.log(`  DRY ${row.domain} -> primary=${primary ? primary.email + ' (' + primary.role + ', conf ' + primary.confidence + (primary.verified ? ', verified' : '') + ')' : 'none'} +${secondary.length} secondary`);
    return;
  }
  const sets = [
    `primary_email=${q(primary && primary.email)}`,
    `primary_email_role=${q(primary && primary.role)}`,
    `primary_email_source=${q(primary && primary.source)}`,
    `decision_maker_confidence=${primary ? Number(primary.confidence || 0) : 'NULL'}`,
    `secondary_emails=${jb(secondary)}`,
    `all_emails=${jb((rec.emails || []).map(e => ({ email: e.value, name: e.name || '', role: e.position || '', source: e.source || '', verified: !!e.verified })))}`,
    `all_socials=${jb(socials)}`,
    `email_verified=${primary ? (primary.verified ? 'TRUE' : 'FALSE') : 'FALSE'}`,
    `enriched_at=NOW()`,
  ];
  // Q2 (B45/B54): persist the RESOLVED company name + legal_name (resolveName ran inside enrichCompany off the
  // homepage HTML). Only OVERWRITE `company` when resolution actually produced a clean name (name_status
  // resolved/verified) AND it differs — a 'raw'/'unverified' result keeps the existing value rather than
  // re-writing junk. legal_name is backfilled whenever resolveName returned one (Companies House, UK) and the
  // column is currently empty. Never blanks either field.
  const _rc = String((rec && rec.company) || '').trim();
  const _ns = String((rec && rec.name_status) || 'raw');
  const _lg = String((rec && rec.legal_name) || '').trim();
  if (_rc && (_ns === 'resolved' || _ns === 'verified')) sets.push(`company=${q(_rc)}`);
  if (_lg) sets.push(`legal_name=COALESCE(NULLIF(legal_name,''), ${q(_lg)})`);
  // Q5 (B30): PERSIST entity_type so the PECR consent gate stops being inert (live: entity_type NULL + consent_required
  // FALSE for ALL 8,712 leads, so the qualifier's gate never fired). Classify from the company NAME's legal form
  // (Ltd/LLP/PLC = corporate; "& Partners"/partnership = individual; person-shaped = sole_trader). CH does not expose
  // company_type via the reg-number /officers lookup, so the name heuristic is the reliable enrich-time signal.
  // Only PERSIST a POSITIVE classification (company|partnership|sole_trader) and never DOWNGRADE a known value to
  // 'unknown'/'other' (COALESCE keeps any value a CH-typed source already set). consent_required is set TRUE for
  // sole-trader/ordinary-partnership (individual subscribers) — the qualifier (qualify-and-queue.js) already honours
  // both columns to exclude them from the cold/Tier-1 path; this populates the input it was missing.
  let _entityNote = '';
  try {
    const _nameForEntity = String((rec && rec.company) || row.company || '').trim();
    const _bucket = _nameForEntity ? classifyEntityType(_nameForEntity, { asName: true }) : 'unknown';
    if (_bucket === 'company' || _bucket === 'partnership' || _bucket === 'sole_trader') {
      sets.push(`entity_type=COALESCE(entity_type, ${q(_bucket)})`);
      if (entityNeedsConsent(_bucket)) { sets.push(`consent_required=TRUE`); _entityNote = ` entity=${_bucket}*consent`; }
      else { _entityNote = ` entity=${_bucket}`; }
    }
  } catch (_e) {}
  // Only set the legacy single-contact fields when we actually found a primary (never clobber a good value with null).
  if (primary && primary.email) {
    sets.push(`contact_email=${q(primary.email)}`, `contact_confidence=${Number(primary.confidence || 0)}`);
    // Q4 (B33/B21/B22): NEVER overwrite contact_name/title with an empty string. The previous code always wrote
    // contact_name=q(primary.name); when the primary is a role inbox (info@/feedback@) with no person attached,
    // primary.name='' and q('') = '' (NOT null), so it BLANKED any name a prior enrichment had found. Only write
    // these when we actually have a non-empty value; otherwise leave the existing value (COALESCE keeps the old
    // contact_name, which is also why we no longer derive a name from a role inbox at all — see enrich.js Q4).
    const _nm = String((primary.name || '')).trim();
    const _ro = String((primary.role || '')).trim();
    if (_nm) sets.push(`contact_name=${q(_nm)}`);
    if (_ro) sets.push(`title=${q(_ro)}`);
  }
  if (liUrl) sets.push(`linkedin_url=${q(liUrl)}`);
  // P2-3: store up-to-3 LinkedIn contacts for multi-threading. Only write when we found at least one (never
  // clobber a previously-found set with an empty array).
  if (liNames.length) { sets.push(`decision_makers=${jb(liNames)}`, `channel_linkedin_ready=${liNames.length ? 'TRUE' : 'FALSE'}`); }
  pg(`UPDATE leads SET ${sets.join(', ')} WHERE id=${row.id};`);
  console.log(`  OK ${row.domain} -> ${primary ? primary.email + ' [' + (primary.role || '?') + '] conf=' + primary.confidence + (primary.verified ? ' ✓' : '') : 'no DM'} (+${secondary.length} cc, ${(rec.counts || {}).emails || 0} emails, ${liNames.length} LI)${_entityNote}`);
}

async function drainOnce(lim) {
  const batch = claimBatch(lim);
  if (!batch.length) return 0;
  await Promise.all(batch.map(enrichOne));
  return batch.length;
}

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  console.log(`[enrich-worker] start conc=${CONC} idle=${IDLE}ms once=${ONCE} dry=${DRY} apify=${/^(1|true|yes|on)$/i.test(process.env.APIFY_ENABLE || '') ? 'on(cap $' + (process.env.APIFY_MONTHLY_CAP_USD || 29) + ')' : 'off'}`);
  let total = 0;
  for (;;) {
    const lim = MAX ? Math.min(CONC, MAX - total) : CONC;
    if (lim <= 0) { console.log('[enrich-worker] reached --max ' + MAX + '; done. total=' + total); break; }
    let n = 0;
    try { n = await drainOnce(lim); } catch (e) { console.error('[enrich-worker] drain error (continue):', String(e.message || e).slice(0, 120)); }
    total += n;
    if (n > 0) { console.log(`[enrich-worker] batch=${n} total=${total}`); continue; }
    if (ONCE) { console.log('[enrich-worker] nothing to enrich; done. total=' + total); break; }
    await sleep(IDLE);
  }
})().catch((e) => { console.error('[enrich-worker] fatal:', e.message); process.exit(1); });
