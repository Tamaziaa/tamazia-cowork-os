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
 *
 * DEDUP STRATEGY (cross-scraper global):
 *   1. external_id match  — placeId (smatleads GBP) or equivalent stable ID from the source
 *   2. domain match       — normalised domain (strip www., lowercase)
 *   3. company+city fuzzy — lowercased company name + city, to catch smatleads vs SERP overlap
 * Each check hits the leads table so dedup is GLOBAL across all scrapers, not just in-memory.
 *
 * PER-SCRAPER DAILY CAP (50 Tier-1+2):
 *   Each scraper stops persisting NEW Tier-1 or Tier-2 leads once it has reached
 *   SCRAPER_T12_DAILY_CAP (default 50) for the current UTC day. Tier-3 leads are exempt
 *   (low-cost backlog) and always flow through. The cap is per (scraper_source, day) and is
 *   read from scraper_daily at run start, then enforced in-process to avoid double-counting
 *   from concurrent runs.
 */
const path = require('path');
const { REGISTRY } = require(path.resolve(__dirname, '..', 'src/lib/sourcing/sources/adapters.js'));
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
    if (!r.ok) {
      // Capture the Postgres SQLSTATE + message from the error body so callers can tell a benign
      // unique_violation (23505, dup-domain race) apart from a real failure. Body shape:
      // {"message":"...","code":"23505",...}. Fail-open: if the body can't be parsed, fall back to http_<status>.
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
  // WS5 equal-allocation cap (now OUTCOME-AWARE). The Tier-1 OUTCOME target per source is SOURCE_T1_TARGET
  // (default 50). We cannot know the FINAL tier at source (that needs enrich + scoreICP), so we still measure
  // eligibility with preFilter — but we count it PER (source, sector) so one sector can't eat the whole 50,
  // and we DO NOT drop overflow: candidates past the cap are still collected and persisted (the enrich/score
  // path assigns them their real, usually lower, tier for the LLM-rescue backlog). 0/negative disables the cap.
  o.t1Target = Math.max(0, parseInt(process.env.SOURCE_T1_TARGET || '50', 10) || 0);
  // Per-scraper Tier-1+2 daily cap. Each scraper stops persisting NEW Tier-1 or Tier-2 leads once it
  // hits this number today. Tier-3 leads (low-cost backlog) are exempt. Set to 0 to disable.
  o.t12DailyCap = Math.max(0, parseInt(process.env.SCRAPER_T12_DAILY_CAP || '50', 10) || 0);
  // Per-sector ceiling so the 50 is spread across served sectors (10 priority sectors => ~5 each by default).
  // Derived from t1Target / SOURCE_SECTORS (default 10) unless SOURCE_T1_PER_SECTOR is set explicitly.
  const sectorsN = Math.max(1, parseInt(process.env.SOURCE_SECTORS || '10', 10) || 10);
  o.t1PerSector = Math.max(0, parseInt(process.env.SOURCE_T1_PER_SECTOR || '', 10) || (o.t1Target ? Math.ceil(o.t1Target / sectorsN) : 0));
  // Overflow headroom: keep collecting past the t1-eligible cap up to OVERFLOW_MULT x the target so overflow
  // persists as Tier-2/3 backlog instead of being discarded. Bounded by --max downstream. 1 = no overflow.
  o.overflowMult = Math.max(1, parseFloat(process.env.SOURCE_OVERFLOW_MULT || '3') || 3);
  return o;
}
// Match adapters tolerantly: callers (scrape-all.js, cron) sometimes pass underscores (serp_top,
// social_ads) while adapter .name values are hyphenated (serp-top, social-ads). Normalise both sides
// so a hyphen/underscore mismatch can never silently zero a source.
const _canon = s => String(s || '').toLowerCase().replace(/[_\s]+/g, '-');
function adapterByName(n) { const c = _canon(n); return Object.values(REGISTRY).find(s => _canon(s.name) === c); }

async function gather(o) {
  let captured = null;
  if (o.capture) { try { captured = JSON.parse(require('fs').readFileSync(o.capture, 'utf8')); } catch (_) {} }
  const raws = [];
  const stats = {};                            // per-source yield: { raw, eligible, kept, t1, by_sector{} }
  const target = o.t1Target || 0;             // 0 = no cap (raw --max governs)
  const perSector = o.t1PerSector || 0;       // 0 = no per-sector ceiling
  for (const name of o.sources) {
    const ad = adapterByName(name);
    if (!ad) { console.error(`[source ${name}] no adapter registered (known: ${Object.values(REGISTRY).map(s => s.name).join(', ')}) — skipped`); continue; }
    const mode = ad.mode(process.env);
    // Collect this source's candidates first, then apply the per-source / per-sector cap so the stop is
    // measured PER SOURCE (equal allocation), independent of what other sources produced.
    const srcRaws = [];
    try {
      if (captured && captured[ad.name]) srcRaws.push(...ad.ingestCaptured(captured[ad.name]));
      else if (captured && captured[name]) srcRaws.push(...ad.ingestCaptured(captured[name]));
      if (mode === 'api') srcRaws.push(...await ad.candidates({}, process.env));
    } catch (e) { console.error('[source ' + name + '] ' + e.message); }
    // OUTCOME-AWARE cap with per-sector balance and NO overflow loss:
    //  - preFilter().pass == served-sector + served-geo + real business == the Tier-1-eligible pre-gate.
    //  - We count t1-eligible per (source, SECTOR) so the 50 spreads across served sectors (no single
    //    sector eats the whole allocation). A sector that hit its per-sector ceiling stops counting toward
    //    the cap but its candidates are STILL kept as overflow (persisted later as their real, lower tier).
    //  - We keep collecting overflow up to overflowMult x target (or everything when uncapped) so nothing
    //    is dropped — the enrich/score path decides the final tier for the LLM-rescue backlog.
    const st = { raw: srcRaws.length, eligible: 0, kept: 0, t1: 0, by_sector: {} };
    const overflowCap = target ? Math.ceil(target * o.overflowMult) : 0;   // 0 = keep all (raw --max governs)
    for (const r of srcRaws) {
      let pf = { pass: false, sector: null }; try { pf = preFilter(r) || pf; } catch (_) {}
      const sec = pf.sector || r.sector || 'unclassified';
      if (pf.pass) st.eligible++;
      // Count toward the equal-allocation target only while neither the global nor this sector's ceiling is hit.
      const globalRoom = !target || st.t1 < target;
      const sectorRoom = !perSector || (st.by_sector[sec] || 0) < perSector;
      const countsToward = pf.pass && globalRoom && sectorRoom;
      if (countsToward) { st.t1++; st.by_sector[sec] = (st.by_sector[sec] || 0) + 1; }
      // Stop collecting only once BOTH the t1 target is met AND we've taken our overflow headroom — this
      // keeps overflow flowing into persistence instead of discarding it the instant the 50 is reached.
      if (target && st.t1 >= target && overflowCap && st.kept >= overflowCap) break;
      raws.push(r); st.kept++;
    }
    stats[ad.name] = st;
    if (target) console.error(`[source ${ad.name}] produced=${st.raw} kept=${st.kept} eligible=${st.eligible} t1-counted=${st.t1}/${target}${st.t1 >= target ? ' (cap hit, overflow kept)' : ''} per-sector=${JSON.stringify(st.by_sector)}`);
    // Explain a 0-yield chrome-mode source instead of failing silently (root cause of reddit/youtube/
    // x-ads/social-ads logging 0 every run: they need an API token or a --capture file).
    if (st.kept === 0 && mode !== 'api') console.error(`[source ${ad.name}] mode=chrome and no --capture provided — yields 0 (set the source's API token or pass --capture).`);
  }
  return { raws, stats };
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
      // Unified per-scraper daily yield — uses the EXISTING scraper_daily table (scorecard-nightly.js /
      // source-sponsored.js) keyed UNIQUE(scraper_source, day); we additively ensure the richer columns exist.
      'CREATE TABLE IF NOT EXISTS scraper_daily (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, scraper_source text, day date, sourced_n integer DEFAULT 0, t1_eligible_n integer DEFAULT 0, valid_email_pct numeric, sector_match_pct numeric, cost numeric, recorded_at timestamptz DEFAULT now())',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_daily_source_day ON scraper_daily (scraper_source, day)',
      'ALTER TABLE scraper_daily ADD COLUMN IF NOT EXISTS raw_found integer DEFAULT 0',
      'ALTER TABLE scraper_daily ADD COLUMN IF NOT EXISTS eligible integer DEFAULT 0',
      'ALTER TABLE scraper_daily ADD COLUMN IF NOT EXISTS persisted integer DEFAULT 0',
      "ALTER TABLE scraper_daily ADD COLUMN IF NOT EXISTS sector_breakdown jsonb DEFAULT '{}'::jsonb",
      'ALTER TABLE scraper_daily ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()',
      // Global cross-scraper dedup: store the source-system stable ID (placeId for smatleads GBP).
      // ADDITIVE only — never rename/drop.
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_id text',
      'CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads (external_id) WHERE external_id IS NOT NULL',
      // Per-scraper Tier-1+2 daily cap tracking column in scraper_daily.
      'ALTER TABLE scraper_daily ADD COLUMN IF NOT EXISTS t12_persisted integer DEFAULT 0',
      // city column on leads (used by company+city cross-scraper dedup key).
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS city text',
    ]) { try { await q(ddl); } catch (_) {} }
  }
  const t0 = Date.now();
  const runId = 'src-' + Date.now().toString(36);
  console.log(`[source-leads] sources=${o.sources.join(',')} max=${o.max} t1Target=${o.t1Target || 'off'} dryRun=${o.dryRun}`);
  const { raws, stats: srcStats } = await gather(o);
  // In-memory dedup by domain (first pass — catches within-batch duplicates before the DB round-trip).
  const seen = new Set(); const cand = [];
  for (const r of raws) { const d = (r.domain || '').toLowerCase(); if (d && !seen.has(d)) { seen.add(d); cand.push(r); } }

  // ── GLOBAL CROSS-SCRAPER DEDUP ──────────────────────────────────────────────────────────────────
  // Load three dedup signals from Neon so ANY scraper that already inserted this business is caught,
  // regardless of which scraper originally found it.
  //
  //  Signal 1 — external_id (placeId from smatleads GBP, or equivalent stable ID)
  //  Signal 2 — normalised domain (strip www., lowercase)
  //  Signal 3 — company+city fuzzy key  (lowercased, trimmed, joined with '|')
  //             catches same business found by smatleads AND a SERP scraper under slightly different names.
  let existingDomains = new Set();
  let existingExtIds  = new Set();
  let existingCompCity = new Set();
  if (!o.dryRun) {
    const [edR, eiR, ecR] = await Promise.all([
      q('SELECT LOWER(domain) d FROM leads WHERE domain IS NOT NULL'),
      q("SELECT LOWER(external_id) ei FROM leads WHERE external_id IS NOT NULL AND external_id <> ''"),
      q("SELECT LOWER(company) || '|' || LOWER(COALESCE(city,'')) k FROM leads WHERE company IS NOT NULL"),
    ]);
    if (edR.ok) existingDomains  = new Set(edR.rows.map(x => x.d));
    if (eiR.ok) existingExtIds   = new Set(eiR.rows.map(x => x.ei));
    if (ecR.ok) existingCompCity = new Set(ecR.rows.map(x => x.k));
  }
  const _normDomain = d => (d || '').toLowerCase().replace(/^www\./, '');
  const _compCityKey = r => ((r.company || '') + '|' + (r.city || '')).toLowerCase().trim();
  const fresh = cand.filter(r => {
    if (!r.domain) return false;
    const nd = _normDomain(r.domain);
    if (existingDomains.has(nd)) return false;
    if (r.external_id && existingExtIds.has((r.external_id || '').toLowerCase())) return false;
    const ck = _compCityKey(r);
    if (ck !== '|' && existingCompCity.has(ck)) return false;
    return true;
  });
  // ICP pre-filter
  const qualified = []; for (const r of fresh) { const pf = preFilter(r); if (pf.pass) { r.sector = pf.sector; qualified.push(r); } }
  console.log(`[source-leads] raw=${raws.length} unique=${cand.length} fresh=${fresh.length} icp-qualified=${qualified.length}`);

  const summary = { run_id: runId, sources: o.sources, raw: raws.length, qualified: qualified.length, audited: 0, enriched: 0, send_ready: 0, persisted: 0, hot: 0, leads: [] };
  // Per-source OUTCOME accumulator for the unified scraper_daily yield row. Seeded from gather() stats
  // (raw/eligible/t1-eligible/per-sector pre-gate counts) and finalised below with real persisted + Tier-1
  // OUTCOME counts (icp_tier===1 after enrich/score) so the daily yield reflects true Tier-1 output, not just
  // pre-filter eligibility. Keyed by the canonical source string written to leads.source (r.source).
  const yieldBySource = {};
  const _ys = (src) => (yieldBySource[src] = yieldBySource[src] || { raw: 0, eligible: 0, persisted: 0, tier1: 0, tier2: 0, by_sector: {}, emailed: 0, leads: 0 });
  for (const [name, st] of Object.entries(srcStats || {})) { const y = _ys(name); y.raw += st.raw || 0; y.eligible += st.eligible || 0; }

  // ── PER-SCRAPER TIER-1+2 DAILY CAP ─────────────────────────────────────────────────────────────
  // Load today's already-persisted Tier-1+2 count per scraper source from Neon so the cap is
  // respected across multiple same-day runs of this script (or parallel runners).
  // Tier-3 is exempt — it flows through regardless (low-cost backlog, doesn't eat send capacity).
  const t12Cap = o.t12DailyCap || 0;   // 0 = disabled
  const t12TodayBySource = {};          // scraper_source => count already persisted today
  if (t12Cap && !o.dryRun) {
    const r12 = await q(`SELECT source, COUNT(*) n FROM leads WHERE icp_tier IN (1,2) AND sourced_at >= CURRENT_DATE AND sourced_at < CURRENT_DATE + INTERVAL '1 day' GROUP BY source`);
    if (r12.ok) for (const row of r12.rows) t12TodayBySource[row.source] = Number(row.n) || 0;
  }
  // In-process counters so concurrent leads within this run also count toward the cap.
  const t12InProcess = {};   // scraper_source => count added this run (before the DB upsert at step 6)
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
    //
    // PER-SCRAPER TIER-1+2 DAILY CAP CHECK — skip this lead if:
    //   • the cap is enabled (t12Cap > 0)
    //   • the lead is Tier-1 or Tier-2  (Tier-3 always flows through)
    //   • this scraper has already hit or exceeded its cap today
    // "Today" = already-in-DB count (t12TodayBySource) + added-this-run count (t12InProcess).
    const _srcKey = r.source || 'unknown';
    const _isT12 = lead.tier === 1 || lead.tier === 2;
    if (t12Cap && _isT12) {
      const _dbCount  = t12TodayBySource[_srcKey] || 0;
      const _runCount = t12InProcess[_srcKey] || 0;
      if (_dbCount + _runCount >= t12Cap) {
        console.error(`[daily-cap] ${_srcKey} Tier-${lead.tier} skipped — cap ${t12Cap} reached (db=${_dbCount} run=${_runCount}) domain=${lead.domain}`);
        summary.skipped_cap = (summary.skipped_cap || 0) + 1;
        continue;
      }
    }
    const ins = await q(`INSERT INTO leads (company, domain, website, sector, jurisdiction, country, source, acquisition_channel, lead_type, lifecycle_stage, aggressive_source, priority_score, platform, source_permalink, scrape_stream, hot_score, fit, fit_score, email, contact_name, contact_title, contact_linkedin, emails, decision_makers, top_finding, channel_email_ready, channel_linkedin_ready, channel_instagram_ready, conversion_tier, conversion_score, hiring_signal, external_id, sourced_at, created_at)
      VALUES (${lit(lead.company)}, ${lit(lead.domain)}, ${lit('https://' + lead.domain)}, ${lit(lead.sector)}, ${lit(lead.country)}, ${lit(lead.country)}, ${lit(r.source)}, ${lit('ad_intel_' + r.platform)}, ${lit('commercial_' + lead.sector)}, 'sourced', ${boolL(adRunner)}, ${num(lead.hot_score)}, ${lit(r.platform)}, ${lit(r.permalink)}, ${lit(adRunner ? 'sponsored' : 'organic_top100')}, ${num(lead.hot_score)}, ${boolL(lead.fit)}, ${num(lead.fit_score)}, ${lit(lead.email)}, ${lit(lead.contact_name)}, ${lit(lead.contact_title)}, ${lit(lead.contact_linkedin)}, ${jb(lead.emails)}, ${jb(lead.decision_makers)}, ${lit(lead.top_finding)}, ${boolL(lead.channel_email_ready)}, ${boolL(lead.channel_linkedin_ready)}, ${boolL(lead.channel_instagram_ready)}, ${lit(lead.conversion_tier)}, ${num(lead.conversion_score)}, ${lit(r.hiring_signal || null)}, ${lit(r.external_id || null)}, NOW(), NOW())
      RETURNING id`);
    const leadId = ins.ok && ins.rows[0] ? ins.rows[0].id : null;
    // Unique-violation safe: with idx_leads_domain_active_unique live, a concurrent writer that inserted
    // this domain between our dedupe SELECT and this INSERT raises 23505. That's a benign "already exists" —
    // skip it (don't crash, don't count as persisted, don't log it as an error). Only real failures are logged.
    if (ins.ok && ins.rows[0]) {
      summary.persisted++;
      // Per-source OUTCOME tally for the unified scraper_daily yield. tier1 here is the REAL Tier-1 outcome
      // (icp_tier===1 after enrich/score), NOT pre-filter eligibility, so the daily row reflects true output.
      const y = _ys(r.source); y.persisted++; y.leads++;
      if (lead.tier === 1) { y.tier1++; y.by_sector[lead.sector] = (y.by_sector[lead.sector] || 0) + 1; }
      if (lead.tier === 2) { y.tier2++; }
      if (lead.channel_email_ready || ((enr.counts || {}).emails || 0) > 0 || ((enr.counts || {}).verified || 0) > 0) y.emailed++;
      // Advance in-process counter so the daily cap is enforced within this run too.
      if (t12Cap && _isT12) { t12InProcess[_srcKey] = (t12InProcess[_srcKey] || 0) + 1; }
    } else {
      const kind = classifyHttpInsert(ins);
      if (kind === 'duplicate') { summary.skipped_dup = (summary.skipped_dup || 0) + 1; }
      else console.error('[persist] ' + lead.domain + ': ' + ins.error);
    }
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
  // 6. UNIFIED per-scraper daily yield → scraper_daily (one row per scraper_source per day; ADDITIVE upsert on
  // the EXISTING (scraper_source, day) key, mirroring source-sponsored.js so source-leads + scorecard-nightly +
  // source-sponsored all converge on the SAME table). Counters SUM across same-day runs; pct/breakdown are
  // last-write per run. Written PER SOURCE so each scraper's true Tier-1 OUTCOME + sector spread is tracked.
  if (!o.dryRun) {
    for (const [src, y] of Object.entries(yieldBySource)) {
      if (!src) continue;
      const validPct = y.leads ? Math.round(1000 * y.emailed / y.leads) / 10 : null;
      const t1Eligible = Math.max(y.tier1, srcStats[src] ? srcStats[src].t1 : 0);   // OUTCOME, floored by pre-gate count
      const sectorMatchPct = y.persisted ? Math.round(1000 * Object.values(y.by_sector).reduce((n, v) => n + v, 0) / y.persisted) / 10 : null;
      const t12Added = (t12InProcess[src] || 0);
      const upsert = `INSERT INTO scraper_daily (scraper_source, day, sourced_n, t1_eligible_n, valid_email_pct, sector_match_pct, cost, recorded_at, raw_found, eligible, persisted, sector_breakdown, t12_persisted, updated_at)
          VALUES (${lit(src)}, CURRENT_DATE, ${num(y.persisted)}, ${num(t1Eligible)}, ${num(validPct)}, ${num(sectorMatchPct)}, NULL, NOW(), ${num(y.raw)}, ${num(y.eligible)}, ${num(y.persisted)}, ${jb(y.by_sector)}, ${num(t12Added)}, NOW())
          ON CONFLICT (scraper_source, day) DO UPDATE SET
            sourced_n = scraper_daily.sourced_n + EXCLUDED.sourced_n,
            t1_eligible_n = scraper_daily.t1_eligible_n + EXCLUDED.t1_eligible_n,
            persisted = COALESCE(scraper_daily.persisted,0) + EXCLUDED.persisted,
            raw_found = COALESCE(scraper_daily.raw_found,0) + EXCLUDED.raw_found,
            eligible = COALESCE(scraper_daily.eligible,0) + EXCLUDED.eligible,
            t12_persisted = COALESCE(scraper_daily.t12_persisted,0) + EXCLUDED.t12_persisted,
            valid_email_pct = EXCLUDED.valid_email_pct, sector_match_pct = EXCLUDED.sector_match_pct,
            sector_breakdown = EXCLUDED.sector_breakdown, recorded_at = EXCLUDED.recorded_at, updated_at = NOW()`;
      try { await q(upsert); } catch (_) {}
    }
    summary.yield_by_source = yieldBySource;
  }
  // 7. log the run
  if (!o.dryRun) await q(`INSERT INTO sourcing_runs (source, sector, query, records_found, records_new, status, ended_at, payload_summary) VALUES (${lit(o.sources.join('+'))}, NULL, ${lit('source-leads')}, ${num(summary.qualified)}, ${num(summary.persisted)}, 'completed', NOW(), ${jb({ run_id: runId, hot: summary.hot, send_ready: summary.send_ready, audited: summary.audited })})`);
  summary.ms = Date.now() - t0;
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
run().catch(e => { console.error('[source-leads] fatal (fail-open):', e.message); process.exit(0); });
