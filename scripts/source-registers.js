#!/usr/bin/env node
/**
 * Register-based sourcing orchestrator (ADDITIVE — does NOT touch the existing source-leads.js path).
 *   node scripts/source-registers.js --source companies-house --max 50 --dry-run
 *   node scripts/source-registers.js --all --max 100
 *   node scripts/source-registers.js --source cqc,fca --dry-run
 *
 * Iterates the SEPARATE register adapter registry (src/lib/sourcing/sources/registers.js:
 * companies-house, cqc, fca) through the SAME unchanged gate + pipeline source-leads.js uses
 * (candidates -> normalize+dedupe -> preFilter (ICP) -> full audit -> scoreICP+hotScore -> enrich ->
 * persist to leads + audit_pages + sourcing_runs -> channel-ready flags). The qualify layer
 * (preFilter / scoreICP / decideTier) is imported UNCHANGED from src/lib/sourcing/icp.js — this runner
 * only COUNTS with preFilter for the equal-allocation cap, exactly like source-leads.js.
 *
 * Regulated registers = the ICP by construction, so this is the highest-purity Tier-1 supply.
 *
 * SAFETY: SEND stays OFF (this never sends). Writes are gated behind a configured NEON_URL AND the
 * absence of --dry-run; with no DB configured the run is DRY by default (prints candidates, writes
 * nothing). Fail-open throughout: a bad adapter never wedges the run; a fatal error exits 0.
 */
const path = require('path');
const { REGISTER_REGISTRY } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/sources/registers.js'));
const { preFilter, scoreICP, SECTORS } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/icp.js'));
const { hotScore } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/hot-score.js'));
const { conversionScore } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/conversion.js'));
const { enrichCompany } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/enrich.js'));
const { scanSite } = require(path.resolve(__dirname, '..', 'src/lib/audit/site-scan.js'));
const ab = require(path.resolve(__dirname, '..', 'src/skills/S025-audit-page-builder/scripts/build.js'));
const { classifyHttpInsert } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/safe-insert.js'));

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
async function q(sql) {
  if (!NEON) return { ok: false, rows: [], error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, params: [] }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) { let code = '', msg = ''; try { const eb = await r.json(); code = eb.code || ''; msg = eb.message || ''; } catch (_) {} return { ok: false, rows: [], code, error: msg || ('http_' + r.status) }; }
    const d = await r.json(); return { ok: true, rows: d.rows || d.results || [], error: null };
  } catch (e) { return { ok: false, rows: [], error: e.message }; }
}
const lit = v => v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || isNaN(v)) ? 'NULL' : Number(v);
const boolL = v => v ? 'TRUE' : 'FALSE';
const jb = o => o == null ? 'NULL' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

function args() {
  const a = process.argv.slice(2); const o = { sources: [], max: 50, dryRun: false, capture: null, resolveCap: null, sector: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--source') o.sources = (a[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a[i] === '--all') o.sources = Object.values(REGISTER_REGISTRY).map(s => s.name);
    else if (a[i] === '--max') o.max = Number(a[++i]) || 50;
    else if (a[i] === '--dry-run') o.dryRun = true;
    else if (a[i] === '--capture') o.capture = a[++i];
    // --resolve-cap N: bound the SERP domain-resolution budget per adapter (registers carry no website).
    // Lower = faster dry-runs; 0 = skip resolution entirely (candidates stay domain-less). Defaults to each
    // adapter's own cap when omitted. ADDITIVE — does not change the gated pipeline.
    else if (a[i] === '--resolve-cap') o.resolveCap = Math.max(0, Number(a[++i]) || 0);
    // --sector NAME: restrict CH advanced-search to one regulated sector (law-firms|healthcare|financial).
    else if (a[i] === '--sector') o.sector = (a[++i] || '').trim() || null;
  }
  if (!o.sources.length) o.sources = Object.values(REGISTER_REGISTRY).map(s => s.name);   // default: all registers
  // No DB configured -> force dry (default behavior with no DB available = dry).
  if (!NEON) o.dryRun = true;
  // Equal-allocation cap: stop each register once SOURCE_T1_TARGET candidates pass the UNCHANGED Tier-1
  // ICP pre-filter. Same semantics + default name as source-leads.js. 0/negative disables (raw --max governs).
  o.t1Target = Math.max(0, parseInt(process.env.SOURCE_T1_TARGET || '100', 10) || 0);
  return o;
}

const _canon = s => String(s || '').toLowerCase().replace(/[_\s]+/g, '-');
function adapterByName(n) { const c = _canon(n); return Object.values(REGISTER_REGISTRY).find(s => _canon(s.name) === c); }

async function gather(o) {
  let captured = null;
  if (o.capture) { try { captured = JSON.parse(require('fs').readFileSync(o.capture, 'utf8')); } catch (_) {} }
  const raws = [];
  const target = o.t1Target || 0;
  for (const name of o.sources) {
    const ad = adapterByName(name);
    if (!ad) { console.error(`[register ${name}] no adapter registered (known: ${Object.values(REGISTER_REGISTRY).map(s => s.name).join(', ')}) — skipped`); continue; }
    const mode = ad.mode(process.env);
    const srcRaws = [];
    try {
      if (captured && (captured[ad.name] || captured[name])) srcRaws.push(...ad.ingestCaptured(captured[ad.name] || captured[name]));
      if (mode === 'api') {
        const co = { max: o.max };
        if (o.resolveCap != null) co.resolveCap = o.resolveCap;   // bound SERP budget (fast dry-runs)
        if (o.sector) co.sector = o.sector;                       // restrict CH to one regulated sector
        srcRaws.push(...await ad.candidates(co, process.env));
      }
    } catch (e) { console.error('[register ' + name + '] ' + e.message); }
    // Eligibility-stop: keep candidates in order until SOURCE_T1_TARGET pass the Tier-1 ICP pre-filter.
    let t1 = 0; let kept = 0;
    for (const r of srcRaws) {
      if (target && t1 >= target) break;
      raws.push(r); kept++;
      let pass = false; try { pass = !!preFilter(r).pass; } catch (_) {}
      if (pass) t1++;
    }
    console.error(`[register ${ad.name}] mode=${mode} produced=${srcRaws.length} kept=${kept} t1-eligible=${t1}${target ? '/' + target : ''}${target && t1 >= target ? ' (cap hit)' : ''}`);
    if (mode !== 'api') console.error(`[register ${ad.name}] mode=${mode} — needs its API key(s) set; yields 0 until then (fail-open).`);
  }
  return raws;
}

async function run() {
  const o = args();
  if (!o.dryRun) {
    for (const ddl of [
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_tier text',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_score numeric',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed boolean DEFAULT false',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed_at timestamptz',
    ]) { try { await q(ddl); } catch (_) {} }
  }
  const t0 = Date.now();
  const runId = 'reg-' + Date.now().toString(36);
  console.log(`[source-registers] sources=${o.sources.join(',')} max=${o.max} t1Target=${o.t1Target || 'off'}${o.sector ? ' sector=' + o.sector : ''}${o.resolveCap != null ? ' resolveCap=' + o.resolveCap : ''} dryRun=${o.dryRun}${!NEON ? ' (no NEON_URL -> dry)' : ''}`);
  const raws = await gather(o);
  // dedupe by domain (in-memory). Register candidates without a resolvable domain are dropped here.
  const seen = new Set(); const cand = [];
  for (const r of raws) { const d = (r.domain || '').toLowerCase(); if (d && !seen.has(d)) { seen.add(d); cand.push(r); } }
  const domainless = raws.length - raws.filter(r => r.domain).length;
  // dedupe against existing leads
  let existing = new Set();
  if (!o.dryRun) { const e = await q('SELECT LOWER(domain) d FROM leads WHERE domain IS NOT NULL'); if (e.ok) existing = new Set(e.rows.map(x => x.d)); }
  const fresh = cand.filter(r => !existing.has(r.domain.toLowerCase()));
  // ICP pre-filter (UNCHANGED gate). preFilter sets the sector (honouring our explicit raw.sector).
  const qualified = []; for (const r of fresh) { const pf = preFilter(r); if (pf.pass) { r.sector = pf.sector; qualified.push(r); } }
  console.log(`[source-registers] raw=${raws.length} domainless-dropped=${domainless} unique=${cand.length} fresh=${fresh.length} icp-qualified=${qualified.length}`);

  const summary = { run_id: runId, sources: o.sources, raw: raws.length, domainless, qualified: qualified.length, audited: 0, enriched: 0, send_ready: 0, persisted: 0, hot: 0, by_sector: {}, leads: [] };
  for (const r of qualified.slice(0, o.max)) {
    summary.by_sector[r.sector] = (summary.by_sector[r.sector] || 0) + 1;
    if (o.dryRun) {
      // dry: prove the candidate + the tier the UNCHANGED gate assigns (no audit/enrich/scan, no writes).
      const icp0 = scoreICP({ sector: r.sector, country: r.country, complianceApplicable: !!(SECTORS[r.sector] || {}).regulated });
      summary.leads.push({ domain: r.domain, company: r.company, sector: r.sector, source: r.source, regulated: !!(SECTORS[r.sector] || {}).regulated, tier_floor: icp0.tier, permalink: r.permalink });
      continue;
    }
    // ----- full pipeline (identical to source-leads.js) -----
    let scan = { counts: { total: 0, p1: 0 }, signals: {}, reachable: false, pointers: [] };
    try { scan = await scanSite({ domain: r.domain, sector: r.sector, env: process.env }); } catch (_) {}
    const seoGap = scan.counts ? scan.counts.total : 0;
    const aiGap = scan.signals && !scan.signals.json_ld;
    const adTech = (scan.signals && scan.signals.ad_tech) || { runs_ads: false, platforms: [] };
    const adRunner = !!(r.adRunner || adTech.runs_ads);
    const adPlatforms = (adTech.platforms && adTech.platforms.length) ? adTech.platforms : [r.platform];
    summary.audited++;
    let icp = scoreICP({ sector: r.sector, country: r.country, adRunner, adPlatforms, seoGapCount: seoGap, aiVisibilityGap: aiGap, complianceApplicable: !!(SECTORS[r.sector] || {}).regulated, decisionMakerFound: false });
    const hot = hotScore({ adRunner, adPlatforms, adRecencyDays: adRunner ? 5 : null, seoGapSeverity: Math.min(3, Math.ceil(seoGap / 2)), aiVisibilityGap: aiGap, decisionMakerFound: false });
    let enr = { emails: [], decisionMakers: [], counts: { emails: 0, verified: 0, decision_makers: 0 }, send_ready: false, linkedin_people: [] };
    try { enr = await enrichCompany({ domain: r.domain, company: r.company, sector: r.sector, env: process.env }); } catch (_) {}
    if (enr.counts.emails) summary.enriched++;
    if (enr.send_ready) summary.send_ready++;
    if (hot.band === 'hot') summary.hot++;
    const dm = enr.decisionMakers[0] || {};
    const _dmFound = (enr.decisionMakers || []).length > 0;
    const _dmVerified = (enr.decisionMakers || []).some(d => d.verified);
    const _established = ((enr.counts || {}).emails || 0) >= 2 || (enr.decisionMakers || []).some(d => d.linkedin) || (enr.linkedin_people || []).length > 0;
    icp = scoreICP({ sector: r.sector, country: r.country, adRunner, adPlatforms, seoGapCount: seoGap, aiVisibilityGap: aiGap, complianceApplicable: !!(SECTORS[r.sector] || {}).regulated, decisionMakerFound: _dmFound, decisionMakerVerified: _dmVerified, established: _established, emailCount: (enr.counts || {}).emails || 0 });
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
    const conv = conversionScore({ fit: lead.fit, fit_score: lead.fit_score, hot_score: lead.hot_score, has_verified_email: _verifiedEmail, decision_maker: (enr.decisionMakers || []).length > 0, has_linkedin: !!lead.contact_linkedin, audit_verified: false });
    lead.conversion_tier = conv.tier; lead.conversion_score = conv.score;
    summary.leads.push({ domain: lead.domain, sector: lead.sector, tier: conv.tier, icp_tier: lead.tier, fit: lead.fit, hot: lead.hot_score, emails: enr.counts.emails, verified: enr.counts.verified, dms: enr.counts.decision_makers, source: r.source });

    // persist (upsert by domain). entity_type carried from CH company_type for the PECR consent gate.
    let _entityType = null;
    try { const { classifyEntityType } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/icp.js')); _entityType = r.company_type ? classifyEntityType(r.company_type) : classifyEntityType(r.company, { asName: true }); if (_entityType === 'unknown' || _entityType === 'other') _entityType = null; } catch (_) {}
    const ins = await q(`INSERT INTO leads (company, domain, website, sector, jurisdiction, country, source, acquisition_channel, lead_type, lifecycle_stage, aggressive_source, priority_score, platform, source_permalink, scrape_stream, entity_type, hot_score, fit, fit_score, email, contact_name, contact_title, contact_linkedin, emails, decision_makers, top_finding, channel_email_ready, channel_linkedin_ready, channel_instagram_ready, conversion_tier, conversion_score, sourced_at, created_at)
      VALUES (${lit(lead.company)}, ${lit(lead.domain)}, ${lit('https://' + lead.domain)}, ${lit(lead.sector)}, ${lit(lead.country)}, ${lit(lead.country)}, ${lit(r.source)}, ${lit('register_' + r.source)}, ${lit('regulated_' + lead.sector)}, 'sourced', ${boolL(adRunner)}, ${num(lead.hot_score)}, ${lit(r.platform)}, ${lit(r.permalink)}, ${lit('register')}, ${lit(_entityType)}, ${num(lead.hot_score)}, ${boolL(lead.fit)}, ${num(lead.fit_score)}, ${lit(lead.email)}, ${lit(lead.contact_name)}, ${lit(lead.contact_title)}, ${lit(lead.contact_linkedin)}, ${jb(lead.emails)}, ${jb(lead.decision_makers)}, ${lit(lead.top_finding)}, ${boolL(lead.channel_email_ready)}, ${boolL(lead.channel_linkedin_ready)}, ${boolL(lead.channel_instagram_ready)}, ${lit(lead.conversion_tier)}, ${num(lead.conversion_score)}, NOW(), NOW())
      RETURNING id`);
    const leadId = ins.ok && ins.rows[0] ? ins.rows[0].id : null;
    if (ins.ok && ins.rows[0]) { summary.persisted++; }
    else { const kind = classifyHttpInsert(ins); if (kind === 'duplicate') { summary.skipped_dup = (summary.skipped_dup || 0) + 1; } else console.error('[persist] ' + lead.domain + ': ' + ins.error); }
    if (leadId) { const stage = lead.tier === 1 ? 'sourced' : lead.tier === 2 ? 'pending_approval' : 'rejected'; try { await q(`UPDATE leads SET icp_tier=${num(lead.tier)}, lifecycle_stage=${lit(stage)} WHERE id=${leadId}`); } catch (_) {} }
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
  if (!o.dryRun) await q(`INSERT INTO sourcing_runs (source, sector, query, records_found, records_new, status, ended_at, payload_summary) VALUES (${lit('registers:' + o.sources.join('+'))}, NULL, ${lit('source-registers')}, ${num(summary.qualified)}, ${num(summary.persisted)}, 'completed', NOW(), ${jb({ run_id: runId, hot: summary.hot, send_ready: summary.send_ready, audited: summary.audited, by_sector: summary.by_sector })})`);
  summary.ms = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
run().catch(e => { console.error('[source-registers] fatal (fail-open):', e.message); process.exit(0); });
