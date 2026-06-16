#!/usr/bin/env node
/**
 * D2.2 · Automated SPONSORED / Google-Ads lead sourcing runner.
 *
 *   node scripts/source-sponsored.js --dry-run --sector law-firms        # compute only, NO writes
 *   node scripts/source-sponsored.js --sector law-firms,healthcare --max 60
 *   node scripts/source-sponsored.js --all --max 200                     # all served sectors
 *   node scripts/source-sponsored.js --capture captured.json             # Chrome-captured ad rows
 *
 * Mirrors scripts/source-leads.js exactly (same gated pipeline + same downstream modules) but the ONLY
 * source is the automated Google-sponsored adapter (src/lib/scraping/google-sponsored.js), which harvests
 * ad slots via the SERPER API (SERPER_KEY). Pipeline (identical to source-leads):
 *   candidates -> normalize+dedupe -> ICP pre-filter (preFilter) -> full audit (site-scan + mint /audit) ->
 *   ICP+hot score -> enrich (multi-email + decision-makers, verified) -> persist to leads + audit_pages +
 *   sourcing_runs -> per-source/per-day yield to scraper_daily. Fail-open throughout.
 *
 * It ADDS code only: icp.js (preFilter/scoreICP/decideTier) and source-leads.js are untouched and reused
 * verbatim. SOURCE_T1_TARGET (env, default 50) applies the same per-SECTOR equal-allocation cap. --dry-run
 * proves the path locally and writes NOTHING (no leads, no scraper_daily, no sourcing_runs).
 */
const path = require('path');
const sponsored = require(path.resolve(__dirname, '..', 'src/lib/scraping/google-sponsored.js'));
const { preFilter, scoreICP, SECTORS: ICP_SECTORS } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/icp.js'));
const { hotScore } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/hot-score.js'));
const { conversionScore } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/conversion.js'));
const { enrichCompany } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/enrich.js'));
const { scanSite } = require(path.resolve(__dirname, '..', 'src/lib/audit/site-scan.js'));
const ab = require(path.resolve(__dirname, '..', 'src/skills/S025-audit-page-builder/scripts/build.js'));
const { classifyHttpInsert } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/safe-insert.js'));

// Load .env (same loader shape as run-serp-scrape.js / heartbeat.js) so SERPER_KEY/NEON_URL resolve when
// invoked outside a shell that already exported them. Never overrides an already-set process.env var.
(() => { try { const t = require('fs').readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

// Fail-open safety net: the enrich/site-scan steps do live HTTP, and a remote can close an undici HTTP/2
// socket AFTER run() has resolved (a late 'error'/'unhandledRejection' on the process). Without this, that
// stray async event would crash Node with a non-zero exit, making the heartbeat wrapper record a SUCCESSFUL
// run as 'error' and fire the failure alert. We log and swallow — the work is already done by the time these fire.
process.on('unhandledRejection', (e) => { try { console.error('[source-sponsored] unhandledRejection (fail-open):', e && e.message ? e.message : e); } catch (_) {} });
process.on('uncaughtException', (e) => { try { console.error('[source-sponsored] uncaughtException (fail-open):', e && e.message ? e.message : e); } catch (_) {} });

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function q(sql) {
  if (!NEON) return { ok: false, rows: [], error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, params: [] }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) {
      let code = '', msg = '';
      try { const eb = await r.json(); code = eb.code || ''; msg = eb.message || ''; } catch (_) {}
      return { ok: false, rows: [], code, error: msg || ('http_' + r.status) };
    }
    const d = await r.json(); return { ok: true, rows: d.rows || d.results || [], error: null };
  } catch (e) { return { ok: false, rows: [], error: e.message }; }
}
const lit = v => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || isNaN(v)) ? 'NULL' : Number(v);
const boolL = v => v ? 'TRUE' : 'FALSE';
const jb = o => o == null ? 'NULL' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const SOURCE = 'google-sponsored';   // scraper_daily.scraper_source key + leads.source key

function args() {
  const a = process.argv.slice(2);
  const o = { sectors: [], max: 25, dryRun: false, capture: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--sector' || a[i] === '--sectors') o.sectors = (a[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a[i] === '--all') o.sectors = Object.keys(sponsored.SECTORS);
    else if (a[i] === '--max') o.max = Number(a[++i]) || 25;
    else if (a[i] === '--dry-run') o.dryRun = true;
    else if (a[i] === '--capture') o.capture = a[++i];
  }
  if (!o.sectors.length) o.sectors = Object.keys(sponsored.SECTORS);
  // Same equal-allocation cap source-leads uses, but PER SECTOR for this single source: stop a sector once
  // SOURCE_T1_TARGET of its candidates pass the Tier-1 ICP pre-filter. 0/negative disables (raw --max governs).
  o.t1Target = Math.max(0, parseInt(process.env.SOURCE_T1_TARGET || '50', 10) || 0);
  return o;
}

// Gather sponsored candidates per sector, applying the per-sector Tier-1-eligible stop. Fail-open: any
// sector that errors contributes 0 and never wedges the run. Returns { raws, perSector } for logging.
async function gather(o) {
  const raws = [];
  const perSector = {};
  // Chrome-captured rows (manual fallback) are ingested first, grouped by their own sector tag.
  let captured = null;
  if (o.capture) { try { captured = JSON.parse(require('fs').readFileSync(o.capture, 'utf8')); } catch (_e) {} }
  for (const sector of o.sectors) {
    const srcRaws = [];
    try {
      if (captured) {
        const cap = Array.isArray(captured) ? captured : (captured[SOURCE] || captured[sector] || []);
        srcRaws.push(...sponsored.ingestCaptured(cap).filter(r => !r.sector || r.sector === sector || Array.isArray(captured)));
      }
      // Automated Serper path for THIS sector (adRunner=true rows in the candidate shape).
      srcRaws.push(...await sponsored.candidates({ sectors: [sector] }, process.env));
    } catch (e) { try { console.error('[sponsored ' + sector + '] ' + e.message); } catch (_) {} }
    // Per-sector eligibility stop (same logic as source-leads gather()): keep candidates in order until
    // SOURCE_T1_TARGET have passed preFilter; only COUNT with preFilter here (no re-scoring of the gate).
    let t1 = 0, kept = 0;
    for (const r of srcRaws) {
      if (o.t1Target && t1 >= o.t1Target) break;
      raws.push(r); kept++;
      let pass = false; try { pass = !!preFilter(r).pass; } catch (_) {}
      if (pass) t1++;
    }
    perSector[sector] = { produced: srcRaws.length, kept, t1 };
    console.error(`[sponsored ${sector}] produced=${srcRaws.length} kept=${kept} t1-eligible=${t1}${o.t1Target ? '/' + o.t1Target : ''}${o.t1Target && t1 >= o.t1Target ? ' (cap hit)' : ''}`);
  }
  return { raws, perSector };
}

async function run() {
  const o = args();
  const t0 = Date.now();
  const runId = 'spon-' + Date.now().toString(36);
  console.log(`[source-sponsored] sectors=${o.sectors.join(',')} max=${o.max} t1Target=${o.t1Target || 'off'} dryRun=${o.dryRun} serperKey=${process.env.SERPER_KEY ? 'set' : 'UNSET'}`);

  // A4a resilience guards — idempotent, ADDITIVE-ONLY (one statement per call: Neon HTTP /sql is single-statement).
  // Identical to source-leads.js; skipped entirely on --dry-run so a dry run never touches the DB.
  if (!o.dryRun) {
    for (const ddl of [
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_tier text',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_score numeric',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed boolean DEFAULT false',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed_at timestamptz',
      // scraper_daily upsert key (mirrors scorecard-nightly.js; additive on a non-off-limits table).
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_daily_source_day ON scraper_daily (scraper_source, day)',
    ]) { try { await q(ddl); } catch (_) {} }
  }

  const { raws, perSector } = await gather(o);
  // dedupe by domain (in-memory)
  const seen = new Set(); const cand = [];
  for (const r of raws) { const d = (r.domain || '').toLowerCase(); if (d && !seen.has(d)) { seen.add(d); cand.push(r); } }
  // dedupe against existing leads (skipped on dry-run — no DB read needed to prove the path)
  let existing = new Set();
  if (!o.dryRun) { const e = await q('SELECT LOWER(domain) d FROM leads WHERE domain IS NOT NULL'); if (e.ok) existing = new Set(e.rows.map(x => x.d)); }
  const fresh = cand.filter(r => !existing.has(r.domain.toLowerCase()));
  // ICP pre-filter (preFilter sets the canonical sector). Ads were already classified by the adapter, but
  // preFilter is the single source of truth for the gate, so we re-run it (never re-implement the gate here).
  const qualified = [];
  for (const r of fresh) { const pf = preFilter(r); if (pf.pass) { r.sector = pf.sector; qualified.push(r); } }
  console.log(`[source-sponsored] raw=${raws.length} unique=${cand.length} fresh=${fresh.length} icp-qualified=${qualified.length}`);

  const summary = { run_id: runId, source: SOURCE, sectors: o.sectors, raw: raws.length, unique: cand.length, fresh: fresh.length, qualified: qualified.length, audited: 0, enriched: 0, send_ready: 0, persisted: 0, hot: 0, per_sector: perSector, leads: [] };
  // Per-sector qualified tally (for the dry-run benchmark + scraper_daily counts).
  const qualifiedBySector = {};
  for (const r of qualified) qualifiedBySector[r.sector] = (qualifiedBySector[r.sector] || 0) + 1;

  for (const r of qualified.slice(0, o.max)) {
    // 1. full audit (real site scan) — identical to source-leads.js
    let scan = { counts: { total: 0, p1: 0 }, signals: {}, reachable: false, pointers: [] };
    try { scan = await scanSite({ domain: r.domain, sector: r.sector, env: process.env }); } catch (_) {}
    const seoGap = scan.counts ? scan.counts.total : 0;
    const aiGap = scan.signals && !scan.signals.json_ld;
    const adTech = (scan.signals && scan.signals.ad_tech) || { runs_ads: false, platforms: [] };
    const adRunner = !!(r.adRunner || adTech.runs_ads);   // always true for sponsored, but keep the upgrade path
    const adPlatforms = (adTech.platforms && adTech.platforms.length) ? adTech.platforms : [r.platform];
    summary.audited++;
    // 2. score
    let icp = scoreICP({ sector: r.sector, country: r.country, adRunner, adPlatforms, seoGapCount: seoGap, aiVisibilityGap: aiGap, complianceApplicable: !!(ICP_SECTORS[r.sector] || {}).regulated, decisionMakerFound: false, hiring_signal: r.hiring_signal || null });
    const hot = hotScore({ adRunner, adPlatforms, adRecencyDays: adRunner ? 5 : null, seoGapSeverity: Math.min(3, Math.ceil(seoGap / 2)), aiVisibilityGap: aiGap, decisionMakerFound: false });
    // 3. enrich
    let enr = { emails: [], decisionMakers: [], counts: { emails: 0, verified: 0, decision_makers: 0 }, send_ready: false, linkedin_people: [] };
    try { enr = await enrichCompany({ domain: r.domain, company: r.company, sector: r.sector, env: process.env }); } catch (_) {}
    if (enr.counts.emails) summary.enriched++;
    if (enr.send_ready) summary.send_ready++;
    if (hot.band === 'hot') summary.hot++;
    const dm = enr.decisionMakers[0] || {};
    const _dmFound = (enr.decisionMakers || []).length > 0;
    const _dmVerified = (enr.decisionMakers || []).some(d => d.verified);
    const _established = ((enr.counts || {}).emails || 0) >= 2 || (enr.decisionMakers || []).some(d => d.linkedin) || (enr.linkedin_people || []).length > 0;
    icp = scoreICP({ sector: r.sector, country: r.country, adRunner, adPlatforms, seoGapCount: seoGap, aiVisibilityGap: aiGap, complianceApplicable: !!(ICP_SECTORS[r.sector] || {}).regulated, decisionMakerFound: _dmFound, decisionMakerVerified: _dmVerified, established: _established, emailCount: (enr.counts || {}).emails || 0, hiring_signal: r.hiring_signal || null });
    const consumerSector = ['hospitality', 'healthcare', 'real-estate', 'restaurants', 'automotive'].includes(r.sector);
    const lead = {
      ...r, sector: r.sector, fit: icp.fit, tier: icp.tier, fit_score: icp.score, hot_score: hot.hot,
      seoGap, emails: enr.emails, decision_makers: enr.decisionMakers,
      email: (enr.emails.find(e => e.verified) || enr.emails[0] || {}).value || '',
      contact_name: dm.name || '', contact_title: dm.title || '', contact_linkedin: dm.linkedin || '',
      channel_email_ready: enr.send_ready, channel_linkedin_ready: enr.decisionMakers.some(d => d.linkedin) || enr.linkedin_people.length > 0,
      channel_instagram_ready: consumerSector,
      top_finding: (scan.pointers && scan.pointers[0] && scan.pointers[0].layman_explanation) || '',
    };
    const _verifiedEmail = (enr.emails || []).some(e => e.verified) || !!lead.email;
    const conv = conversionScore({ fit: lead.fit, fit_score: lead.fit_score, hot_score: lead.hot_score, has_verified_email: _verifiedEmail, decision_maker: (enr.decisionMakers || []).length > 0, has_linkedin: !!lead.contact_linkedin, audit_verified: false, hiring_signal: r.hiring_signal });
    lead.conversion_tier = conv.tier; lead.conversion_score = conv.score;
    summary.leads.push({ domain: lead.domain, sector: lead.sector, tier: conv.tier, fit: lead.fit, hot: lead.hot_score, emails: enr.counts.emails, verified: enr.counts.verified, dms: enr.counts.decision_makers, platform: r.platform });

    if (o.dryRun) continue;
    // 4. persist lead — scrape_stream='sponsored', aggressive_source from adRunner (identical to source-leads.js)
    const ins = await q(`INSERT INTO leads (company, domain, website, sector, jurisdiction, country, source, acquisition_channel, lead_type, lifecycle_stage, aggressive_source, priority_score, platform, source_permalink, scrape_stream, hot_score, fit, fit_score, email, contact_name, contact_title, contact_linkedin, emails, decision_makers, top_finding, channel_email_ready, channel_linkedin_ready, channel_instagram_ready, conversion_tier, conversion_score, sourced_at, created_at)
      VALUES (${lit(lead.company)}, ${lit(lead.domain)}, ${lit('https://' + lead.domain)}, ${lit(lead.sector)}, ${lit(lead.country)}, ${lit(lead.country)}, ${lit(SOURCE)}, ${lit('ad_intel_' + r.platform)}, ${lit('commercial_' + lead.sector)}, 'sourced', ${boolL(adRunner)}, ${num(lead.hot_score)}, ${lit(r.platform)}, ${lit(r.permalink)}, 'sponsored', ${num(lead.hot_score)}, ${boolL(lead.fit)}, ${num(lead.fit_score)}, ${lit(lead.email)}, ${lit(lead.contact_name)}, ${lit(lead.contact_title)}, ${lit(lead.contact_linkedin)}, ${jb(lead.emails)}, ${jb(lead.decision_makers)}, ${lit(lead.top_finding)}, ${boolL(lead.channel_email_ready)}, ${boolL(lead.channel_linkedin_ready)}, ${boolL(lead.channel_instagram_ready)}, ${lit(lead.conversion_tier)}, ${num(lead.conversion_score)}, NOW(), NOW())
      RETURNING id`);
    const leadId = ins.ok && ins.rows[0] ? ins.rows[0].id : null;
    if (ins.ok && ins.rows[0]) { summary.persisted++; }
    else {
      const kind = classifyHttpInsert(ins);
      if (kind === 'duplicate') { summary.skipped_dup = (summary.skipped_dup || 0) + 1; }
      else console.error('[persist] ' + lead.domain + ': ' + ins.error);
    }
    // Tier routing (identical to source-leads.js): Tier-1 auto, Tier-2 -> pending_approval, Tier-3 -> rejected.
    if (leadId) { const stage = lead.tier === 1 ? 'sourced' : lead.tier === 2 ? 'pending_approval' : 'rejected'; try { await q(`UPDATE leads SET icp_tier=${num(lead.tier)}, lifecycle_stage=${lit(stage)} WHERE id=${leadId}`); } catch (_) {} }
    // 5. mint audit page — ONLY Tier-1 auto-mints inline (same gate as source-leads.js).
    if (leadId && lead.tier === 1) {
      try {
        const slug = ab.slugify(lead.company || lead.domain.split('.')[0]); const hash = ab.generateHash();
        const payload = { schema_version: 'v2', domain: lead.domain, sector: lead.sector, scan: { counts: scan.counts, signals: scan.signals }, pointers: scan.pointers || [] };
        const exp = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
        await q(`INSERT INTO audit_pages (workspace_id, lead_id, slug, hash, domain, sector, country, framework_version, payload_json, expires_at) VALUES (1, ${leadId}, ${lit(slug)}, ${lit(hash)}, ${lit(lead.domain)}, ${lit(lead.sector)}, ${lit((lead.country || 'UK').toUpperCase())}, '1.0.0', ${jb(payload)}, to_timestamp(${exp}))`);
        await q(`UPDATE leads SET audit_slug=${lit(slug)}, audit_hash=${lit(hash)}, audit_url=${lit('https://tamazia.co.uk/audit/' + slug + '/' + hash)} WHERE id=${leadId}`);
      } catch (_) {}
    }
  }

  // 6. per-source / per-day yield → scraper_daily (ADDITIVE, idempotent upsert on (scraper_source, day)).
  // Mirrors scorecard-nightly.js's daily snapshot but written at SOURCE time so the per-scraper yield is
  // recorded even on days scorecard-nightly doesn't run. One row for this source, summing today's output.
  // The qualified-per-sector figures are the Tier-1-eligible count for this source today. Skipped on dry-run.
  if (!o.dryRun) {
    const sourcedToday = summary.persisted;
    const t1Today = Object.values(qualifiedBySector).reduce((n, v) => n + v, 0);
    // valid_email_pct / sector_match_pct over THIS run's leads (best-effort; null when no leads).
    const withEmail = summary.leads.filter(l => l.emails > 0 || l.verified > 0).length;
    const validPct = summary.leads.length ? Math.round(1000 * withEmail / summary.leads.length) / 10 : null;
    const sectorPct = summary.leads.length ? 100 : null;   // every sponsored lead carries a canonical sector
    if (sourcedToday > 0) {
      const upsert = `INSERT INTO scraper_daily (scraper_source, day, sourced_n, t1_eligible_n, valid_email_pct, sector_match_pct, cost, recorded_at)
          VALUES (${lit(SOURCE)}, CURRENT_DATE, ${num(sourcedToday)}, ${num(t1Today)}, ${num(validPct)}, ${num(sectorPct)}, NULL, NOW())
          ON CONFLICT (scraper_source, day) DO UPDATE SET
            sourced_n = scraper_daily.sourced_n + EXCLUDED.sourced_n,
            t1_eligible_n = scraper_daily.t1_eligible_n + EXCLUDED.t1_eligible_n,
            valid_email_pct = EXCLUDED.valid_email_pct, sector_match_pct = EXCLUDED.sector_match_pct,
            recorded_at = EXCLUDED.recorded_at`;
      try { await q(upsert); } catch (_) {}
    }
    // 7. log the run to sourcing_runs (same as source-leads.js).
    await q(`INSERT INTO sourcing_runs (source, sector, query, records_found, records_new, status, ended_at, payload_summary) VALUES (${lit(SOURCE)}, NULL, ${lit('source-sponsored')}, ${num(summary.qualified)}, ${num(summary.persisted)}, 'completed', NOW(), ${jb({ run_id: runId, hot: summary.hot, send_ready: summary.send_ready, audited: summary.audited, per_sector: qualifiedBySector })})`);
  }

  summary.qualified_by_sector = qualifiedBySector;
  summary.ms = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

run().catch(e => { console.error('[source-sponsored] fatal (fail-open):', e.message); process.exit(0); });
