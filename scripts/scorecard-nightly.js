#!/usr/bin/env node
// P2-4 · Nightly scraper scorecard. For each scraper SOURCE, samples the 50 most-recent leads and computes
// quality metrics, writing one row per scraper to scraper_scorecard (table already exists). A red flag
// (valid_email_pct < 60 OR sector_match_pct < 70) writes one line into the daily digest via the notifications
// table (daily-digest.js picks it up under "Leads + pipeline"). Read-mostly; the only writes are the scorecard
// rows + (on red flag) a notification row. Fail-open per scraper. Usage: node scripts/scorecard-nightly.js [N]
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { if (!NEON) return ''; try { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).toString().trim(); } catch (_e) { return ''; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => (v == null || v === '' || Number.isNaN(Number(v))) ? 'NULL' : Number(v);

const DRY = process.argv.includes('--dry-run');
const SAMPLE = Number(process.argv.find(a => /^\d+$/.test(a)) || 50);
const RED_VALID = Number(process.env.SCORECARD_RED_VALID_PCT || 60);
const RED_SECTOR = Number(process.env.SCORECARD_RED_SECTOR_PCT || 70);

// One pass per scraper: sample the N most-recent leads (by best available timestamp) and aggregate. We do the
// aggregation in SQL over a per-scraper LIMIT N subquery so it is one round-trip per scraper. The recency
// timestamp prefers sourced_at, then scraped_at, then created_at.
function scoreScraper(source) {
  // Measure SCRAPER quality, not enrichment-queue depth. So sample the N most-recently-SOURCED leads from this
  // scraper that have reached a terminal evaluated state (quality_score set) — i.e. recent scraper output that
  // the pipeline has fully judged. Ordering by sourced_at (not scored_at) keeps the window on "what this scraper
  // produced lately"; the quality_score filter ensures every sampled lead has been through enrich+score so the
  // metrics are real. Falls back to the most-recently-sourced raw leads when too few have been scored yet (a
  // brand-new scraper), so it still gets a row (its low scored-coverage shows up as low valid/sector).
  const sql = `
    WITH scored AS (
      SELECT * FROM leads
      WHERE COALESCE(source,'') = ${esc(source)} AND quality_score IS NOT NULL
      ORDER BY COALESCE(sourced_at, scraped_at, created_at) DESC NULLS LAST
      LIMIT ${SAMPLE}
    ),
    topup AS (
      SELECT * FROM leads
      WHERE COALESCE(source,'') = ${esc(source)} AND id NOT IN (SELECT id FROM scored)
      ORDER BY COALESCE(sourced_at, scraped_at, created_at) DESC NULLS LAST
      LIMIT GREATEST(0, ${SAMPLE} - (SELECT COUNT(*) FROM scored))
    ),
    s AS (SELECT * FROM scored UNION ALL SELECT * FROM topup)
    SELECT
      COUNT(*)::int AS n,
      -- valid email = a deliverable-shaped email is present and NOT confirmed-bad. The pipeline treats a
      -- 5-filter-clean email as deliverable WITHOUT an SMTP probe (most corporate domains block SMTP), so we
      -- count "has an email AND the verdict is not bad/invalid", not "has a positive verify verdict". Checks all
      -- three email columns the enrich-worker writes (contact_email, email, primary_email).
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(contact_email,''), NULLIF(email,''), primary_email) IS NOT NULL
          AND LOWER(COALESCE(deliverability, verify_status, '')) NOT IN ('bad','invalid','undeliverable','no_mx','disposable','dead')
      ) / NULLIF(COUNT(*),0), 1) AS valid_email_pct,
      -- named contact = a real human name attached (contact_name with a space, or a named decision_makers entry)
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE (contact_name IS NOT NULL AND contact_name ~ '\\S+\\s+\\S+')
           OR (decision_makers IS NOT NULL AND jsonb_typeof(decision_makers)='array'
               AND EXISTS (SELECT 1 FROM jsonb_array_elements(decision_makers) e WHERE COALESCE(e->>'name','') ~ '\\S+\\s+\\S+'))
      ) / NULLIF(COUNT(*),0), 1) AS named_contact_pct,
      -- sector match = the grid classifier placed it in a sector (sector_code present)
      ROUND(100.0 * COUNT(*) FILTER (WHERE COALESCE(sector_code,'') <> '') / NULLIF(COUNT(*),0), 1) AS sector_match_pct,
      -- linkedin id'd = a personal LinkedIn URL or a named decision_makers entry with a /in/ URL
      ROUND(100.0 * COUNT(*) FILTER (
        WHERE COALESCE(linkedin_url,'') ~* 'linkedin\\.com/in/'
           OR (decision_makers IS NOT NULL AND jsonb_typeof(decision_makers)='array'
               AND EXISTS (SELECT 1 FROM jsonb_array_elements(decision_makers) e WHERE COALESCE(e->>'linkedin','') ~* 'linkedin\\.com/in/'))
      ) / NULLIF(COUNT(*),0), 1) AS linkedin_id_pct,
      -- duplicate = flagged duplicate_of or status='duplicate'
      ROUND(100.0 * COUNT(*) FILTER (WHERE duplicate_of IS NOT NULL OR COALESCE(status,'')='duplicate') / NULLIF(COUNT(*),0), 1) AS duplicate_pct,
      -- tier mix = % Tier-1 (the headline of the tier_mix)
      ROUND(100.0 * COUNT(*) FILTER (WHERE icp_tier = 1) / NULLIF(COUNT(*),0), 1) AS tier1_pct,
      COUNT(*) FILTER (WHERE icp_tier = 1)::int AS t1,
      COUNT(*) FILTER (WHERE icp_tier = 2)::int AS t2,
      COUNT(*) FILTER (WHERE icp_tier = 3)::int AS t3
    FROM s`;
  const raw = pg(sql);
  if (!raw) return null;
  const [n, valid, named, sector, li, dup, tier1, t1, t2, t3] = raw.split('\t');
  return { n: Number(n), valid_email_pct: valid, named_contact_pct: named, sector_match_pct: sector, linkedin_id_pct: li, duplicate_pct: dup, tier1_pct: tier1, tier_mix: { t1: Number(t1), t2: Number(t2), t3: Number(t3) } };
}

// serper cost per lead: total serper/serp cost_ledger units in the sample window / leads from this scraper in
// the same window. Best-effort: NULL when no cost rows. Only serp-derived scrapers carry a serper cost.
function serperCostPerLead(source) {
  // leads from this scraper in the last 30 days
  const leads = Number(pg(`SELECT COUNT(*)::int FROM leads WHERE COALESCE(source,'')=${esc(source)} AND COALESCE(sourced_at,scraped_at,created_at) > NOW() - INTERVAL '30 days'`) || 0);
  if (!leads) return null;
  const cost = Number(pg(`SELECT COALESCE(SUM(units),0) FROM cost_ledger WHERE source ~* 'serper|serp' AND run_at > NOW() - INTERVAL '30 days'`) || 0);
  if (!cost) return null;
  // Only attribute serper cost to serp-derived scrapers (serp_organic_top100/serp-top/maps/jobspy use Serper).
  if (!/serp|maps|jobspy/i.test(source)) return 0;
  // Split the shared serper spend across all serp-derived leads in the window (fair per-lead attribution).
  const serpLeads = Number(pg(`SELECT COUNT(*)::int FROM leads WHERE COALESCE(source,'') ~* 'serp|maps|jobspy' AND COALESCE(sourced_at,scraped_at,created_at) > NOW() - INTERVAL '30 days'`) || 0);
  if (!serpLeads) return null;
  return Number((cost / serpLeads).toFixed(4));
}

function verdictFor(m) {
  const valid = Number(m.valid_email_pct || 0), sector = Number(m.sector_match_pct || 0);
  if (m.n < 5) return 'insufficient_sample';
  if (valid < RED_VALID || sector < RED_SECTOR) return 'red_flag';
  if (valid >= 80 && sector >= 85) return 'strong';
  return 'ok';
}

(async () => {
  // every scraper source that has produced leads
  const sources = (pg(`SELECT DISTINCT COALESCE(source,'') FROM leads WHERE COALESCE(source,'') <> ''`) || '').split('\n').filter(Boolean);
  if (!sources.length) { console.log('[scorecard] no scraper sources found.'); return; }
  const redFlags = [];
  let written = 0;
  for (const source of sources) {
    let m; try { m = scoreScraper(source); } catch (e) { console.error('[scorecard] ' + source + ': ' + e.message); continue; }
    if (!m || !m.n) { console.log(`[scorecard] ${source}: no sample`); continue; }
    let cpl = null; try { cpl = serperCostPerLead(source); } catch (_e) {}
    const verdict = verdictFor(m);
    if (!DRY) {
      pg(`INSERT INTO scraper_scorecard (scraper_source, sampled_at, sample_n, valid_email_pct, named_contact_pct, sector_match_pct, linkedin_id_pct, duplicate_pct, tier1_pct, cost_per_lead, verdict)
          VALUES (${esc(source)}, NOW(), ${m.n}, ${num(m.valid_email_pct)}, ${num(m.named_contact_pct)}, ${num(m.sector_match_pct)}, ${num(m.linkedin_id_pct)}, ${num(m.duplicate_pct)}, ${num(m.tier1_pct)}, ${num(cpl)}, ${esc(verdict)})`);
    }
    written++;
    console.log(`[scorecard] ${source.padEnd(24)} n=${m.n} valid=${m.valid_email_pct}% named=${m.named_contact_pct}% sector=${m.sector_match_pct}% li=${m.linkedin_id_pct}% dup=${m.duplicate_pct}% t1=${m.tier1_pct}% cpl=${cpl == null ? 'n/a' : cpl} -> ${verdict}`);
    if (verdict === 'red_flag') redFlags.push(`${source}: valid ${m.valid_email_pct}% / sector ${m.sector_match_pct}% (n=${m.n})`);
  }
  // Red flags -> one line in the daily digest (notifications table; daily-digest matches /lead|sourc|scrap/).
  if (redFlags.length) {
    const title = `Scraper scorecard red flags (${redFlags.length}): ` + redFlags.join('; ');
    if (!DRY) pg(`INSERT INTO notifications (kind, severity, title, realtime) VALUES ('scorecard_lead_quality','warning',${esc(title.slice(0, 600))},FALSE)`);
    console.log('[scorecard] RED FLAGS -> digest: ' + redFlags.length + (DRY ? ' (dry-run, not written)' : ''));
  }
  console.log(`[scorecard] ${DRY ? 'DRY-RUN computed' : 'wrote'} ${written} scorecard rows across ${sources.length} scrapers, ${redFlags.length} red-flagged.`);
})().catch(e => { console.error('[scorecard] fatal (fail-open):', e.message); process.exit(0); });
