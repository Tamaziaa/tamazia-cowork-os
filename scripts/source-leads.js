#!/usr/bin/env node
/**
 * Unified hot-lead sourcing orchestrator.
 *   node scripts/source-leads.js --source serp-top,reddit --max 25
 *   node scripts/source-leads.js --all --max 50
 *   node scripts/source-leads.js --source youtube --capture captured.json   # Chrome-captured rows
 *   node scripts/source-leads.js --source serp-top --max 10 --dry-run        # compute only, no writes
 *
 * Pipeline (identical for every source): candidates -> normalize+dedupe -> ICP pre-filter ->
 * full audit (real site-scan + mint /audit page) -> ICP+hot score -> enrich (multi-email + decision-makers
 * + LinkedIn, verified) -> persist to leads + audit_pages + sourcing_runs with full provenance ->
 * set channel-ready flags (Mystrika / LinkedIn / Instagram). Fail-open throughout.
 */
const path = require('path');
const { REGISTRY } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/sources/adapters.js'));
const { preFilter, scoreICP, SECTORS } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/icp.js'));
const { hotScore } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/hot-score.js'));
const { conversionScore } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/conversion.js'));
const { enrichCompany } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/enrich.js'));
const { scanSite } = require(path.resolve(__dirname, '..', 'src/lib/audit/site-scan.js'));
const ab = require(path.resolve(__dirname, '..', 'src/skills/S025-audit-page-builder/scripts/build.js'));

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function q(sql) {
  if (!NEON) return { ok: false, rows: [], error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, params: [] }) });
    if (!r.ok) return { ok: false, rows: [], error: 'http_' + r.status };
    const d = await r.json(); return { ok: true, rows: d.rows || d.results || [], error: null };
  } catch (e) { return { ok: false, rows: [], error: e.message }; }
}
const lit = v => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || isNaN(v)) ? 'NULL' : Number(v);
const boolL = v => v ? 'TRUE' : 'FALSE';
const jb = o => o == null ? 'NULL' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

function args() {
  const a = process.argv.slice(2); const o = { sources: [], max: 25, dryRun: false, capture: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--source') o.sources = (a[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a[i] === '--all') o.sources = Object.values(REGISTRY).map(s => s.name);
    else if (a[i] === '--max') o.max = Number(a[++i]) || 25;
    else if (a[i] === '--dry-run') o.dryRun = true;
    else if (a[i] === '--capture') o.capture = a[++i];
  }
  if (!o.sources.length) o.sources = ['serp-top'];
  return o;
}
function adapterByName(n) { return Object.values(REGISTRY).find(s => s.name === n); }

async function gather(o) {
  let captured = null;
  if (o.capture) { try { captured = JSON.parse(require('fs').readFileSync(o.capture, 'utf8')); } catch (_) {} }
  const raws = [];
  for (const name of o.sources) {
    const ad = adapterByName(name); if (!ad) continue;
    try {
      if (captured && captured[name]) raws.push(...ad.ingestCaptured(captured[name]));
      if (ad.mode(process.env) === 'api') raws.push(...await ad.candidates({}, process.env));
    } catch (e) { console.error('[source ' + name + '] ' + e.message); }
  }
  return raws;
}

async function run() {
  const o = args();
  // A4a resilience guards — idempotent, ADDITIVE-ONLY (one statement per call: Neon HTTP /sql is single-statement).
  if (!o.dryRun) {
    for (const ddl of [
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_tier text',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_score numeric',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS hiring_signal text',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed boolean DEFAULT false',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed_at timestamptz',
    ]) { try { await q(ddl); } catch (_) {} }
  }
  const t0 = Date.now();
  const runId = 'src-' + Date.now().toString(36);
  console.log(`[source-leads] sources=${o.sources.join(',')} max=${o.max} dryRun=${o.dryRun}`);
  const raws = await gather(o);
  // dedupe by domain (in-memory)
  const seen = new Set(); const cand = [];
  for (const r of raws) { const d = (r.domain || '').toLowerCase(); if (d && !seen.has(d)) { seen.add(d); cand.push(r); } }
  // dedupe against existing leads
  let existing = new Set();
  if (!o.dryRun) { const e = await q('SELECT LOWER(domain) d FROM leads WHERE domain IS NOT NULL'); if (e.ok) existing = new Set(e.rows.map(x => x.d)); }
  const fresh = cand.filter(r => !existing.has(r.domain.toLowerCase()));
  // ICP pre-filter
  const qualified = []; for (const r of fresh) { const pf = preFilter(r); if (pf.pass) { r.sector = pf.sector; qualified.push(r); } }
  console.log(`[source-leads] raw=${raws.length} unique=${cand.length} fresh=${fresh.length} icp-qualified=${qualified.length}`);

  const summary = { run_id: runId, sources: o.sources, raw: raws.length, qualified: qualified.length, audited: 0, enriched: 0, send_ready: 0, persisted: 0, hot: 0, leads: [] };
  for (const r of qualified.slice(0, o.max)) {
    // 1. full audit (real site scan)
    let scan = { counts: { total: 0, p1: 0 }, signals: {}, reachable: false, pointers: [] };
    try { scan = await scanSite({ domain: r.domain, sector: r.sector, env: process.env }); } catch (_) {}
    const seoGap = scan.counts ? scan.counts.total : 0;
    const aiGap = scan.signals && !scan.signals.json_ld;
    // Keyless ad-intent: pixels on the site prove they advertise → upgrade to ad-runner even if sourced organically
    const adTech = (scan.signals && scan.signals.ad_tech) || { runs_ads: false, platforms: [] };
    const adRunner = !!(r.adRunner || adTech.runs_ads);
    const adPlatforms = (adTech.platforms && adTech.platforms.length) ? adTech.platforms : [r.platform];
    summary.audited++;
    // 2. score
    let icp = scoreICP({ sector: r.sector, country: r.country, adRunner, adPlatforms, seoGapCount: seoGap, aiVisibilityGap: aiGap, complianceApplicable: !!(SECTORS[r.sector] || {}).regulated, decisionMakerFound: false, hiring_signal: r.hiring_signal || null });
    const hot = hotScore({ adRunner, adPlatforms, adRecencyDays: adRunner ? 5 : null, seoGapSeverity: Math.min(3, Math.ceil(seoGap / 2)), aiVisibilityGap: aiGap, decisionMakerFound: false });
    // 3. enrich
    let enr = { emails: [], decisionMakers: [], counts: { emails: 0, verified: 0, decision_makers: 0 }, send_ready: false, linkedin_people: [] };
    try { enr = await enrichCompany({ domain: r.domain, company: r.company, sector: r.sector, env: process.env }); } catch (_) {}
    if (enr.counts.emails) summary.enriched++;
    if (enr.send_ready) summary.send_ready++;
    if (hot.band === 'hot') summary.hot++;
    const dm = enr.decisionMakers[0] || {};
    // Re-tier with the REAL decision-maker signals from enrichment (ads are NOT a gate).
    const _dmFound = (enr.decisionMakers || []).length > 0;
    const _dmVerified = (enr.decisionMakers || []).some(d => d.verified);
    const _established = ((enr.counts || {}).emails || 0) >= 2 || (enr.decisionMakers || []).some(d => d.linkedin) || (enr.linkedin_people || []).length > 0;
    icp = scoreICP({ sector: r.sector, country: r.country, adRunner, adPlatforms, seoGapCount: seoGap, aiVisibilityGap: aiGap, complianceApplicable: !!(SECTORS[r.sector] || {}).regulated, decisionMakerFound: _dmFound, decisionMakerVerified: _dmVerified, established: _established, emailCount: (enr.counts || {}).emails || 0, hiring_signal: r.hiring_signal || null });
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
    // 4. persist lead (upsert by domain)
    const ins = await q(`INSERT INTO leads (company, domain, website, sector, jurisdiction, country, source, acquisition_channel, lead_type, lifecycle_stage, aggressive_source, priority_score, platform, source_permalink, scrape_stream, hot_score, fit, fit_score, email, contact_name, contact_title, contact_linkedin, emails, decision_makers, top_finding, channel_email_ready, channel_linkedin_ready, channel_instagram_ready, conversion_tier, conversion_score, hiring_signal, sourced_at, created_at)
      VALUES (${lit(lead.company)}, ${lit(lead.domain)}, ${lit('https://' + lead.domain)}, ${lit(lead.sector)}, ${lit(lead.country)}, ${lit(lead.country)}, ${lit(r.source)}, ${lit('ad_intel_' + r.platform)}, ${lit('commercial_' + lead.sector)}, 'sourced', ${boolL(adRunner)}, ${num(lead.hot_score)}, ${lit(r.platform)}, ${lit(r.permalink)}, ${lit(adRunner ? 'sponsored' : 'organic_top100')}, ${num(lead.hot_score)}, ${boolL(lead.fit)}, ${num(lead.fit_score)}, ${lit(lead.email)}, ${lit(lead.contact_name)}, ${lit(lead.contact_title)}, ${lit(lead.contact_linkedin)}, ${jb(lead.emails)}, ${jb(lead.decision_makers)}, ${lit(lead.top_finding)}, ${boolL(lead.channel_email_ready)}, ${boolL(lead.channel_linkedin_ready)}, ${boolL(lead.channel_instagram_ready)}, ${lit(lead.conversion_tier)}, ${num(lead.conversion_score)}, ${lit(r.hiring_signal || null)}, NOW(), NOW())
      RETURNING id`);
    const leadId = ins.ok && ins.rows[0] ? ins.rows[0].id : null;
    if (ins.ok && ins.rows[0]) summary.persisted++; else if (!ins.ok) console.error('[persist] ' + lead.domain + ': ' + ins.error);
    // Tier routing: Tier-1 auto, Tier-2 -> pending_approval (mint only after founder approval), Tier-3 -> rejected.
    if (leadId) { const stage = lead.tier === 1 ? 'sourced' : lead.tier === 2 ? 'pending_approval' : 'rejected'; try { await q(`UPDATE leads SET icp_tier=${num(lead.tier)}, lifecycle_stage=${lit(stage)} WHERE id=${leadId}`); } catch (_) {} }
    // 5. mint audit page tied to the lead — ONLY Tier-1 auto-mints inline; Tier-2 mints after approval, Tier-3 never.
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
  // 6. log the run
  if (!o.dryRun) await q(`INSERT INTO sourcing_runs (source, sector, query, records_found, records_new, status, ended_at, payload_summary) VALUES (${lit(o.sources.join('+'))}, NULL, ${lit('source-leads')}, ${num(summary.qualified)}, ${num(summary.persisted)}, 'completed', NOW(), ${jb({ run_id: runId, hot: summary.hot, send_ready: summary.send_ready, audited: summary.audited })})`);
  summary.ms = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
run().catch(e => { console.error('[source-leads] fatal (fail-open):', e.message); process.exit(0); });
