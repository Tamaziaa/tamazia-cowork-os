#!/usr/bin/env node
// S033 ad intel orchestrator · Phase 8
// For each lead with a domain, polls 3+ ad libraries, writes ad_observations,
// updates leads.ad_intel JSONB summary, boosts priority_score when ≥3 platforms detected.

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const meta = require('../../../lib/ad-intel/meta-ad-library.js');
const google = require('../../../lib/ad-intel/google-ads-transparency.js');
const linkedin = require('../../../lib/ad-intel/linkedin-ad-library.js');
const pixelDetector = require('../../../lib/ad-intel/pixel-detector.js');

function fingerprint(obs) {
  return crypto.createHash('sha256').update(`${obs.platform}|${obs.advertiser_id || obs.advertiser_name || ''}|${(obs.ad_text || '').slice(0, 100)}`).digest('hex').slice(0, 24);
}

function jurisdictionToCountry(j) { return ({ UK: 'GB', GB: 'GB', US: 'US', FR: 'FR', DE: 'DE', UAE: 'AE', AE: 'AE', EU: 'GB' })[j] || 'GB'; }

async function pollPlatformsForLead(lead) {
  const observations = [];
  const country = jurisdictionToCountry(lead.jurisdiction);
  const domain = lead.domain;
  // Pixel detector is the primary signal source. JS-heavy ad libraries return
  // minimal data over plain HTTP — skip them by default in the daily cron.
  if (domain) {
    try {
      const px = await pixelDetector.detect(domain);
      observations.push(...px.map(o => ({ ...o, country })));
    } catch (_e) {}
  }
  return observations;
}

async function writeObservations(observations, lead) {
  let inserted = 0;
  for (const obs of observations) {
    obs.fingerprint_hash = fingerprint(obs);
    if (!obs.advertiser_domain && lead?.domain) obs.advertiser_domain = lead.domain;
    if (!obs.landing_domain && obs.advertiser_domain) obs.landing_domain = obs.advertiser_domain;
    const sql = `
      INSERT INTO ad_observations (platform, advertiser_name, advertiser_id, advertiser_domain, ad_text, ad_creative_url, landing_url, landing_domain, country, started_at, ended_at, fingerprint_hash, confidence, raw_payload)
      VALUES (${pgEsc(obs.platform)}, ${pgEsc(obs.advertiser_name)}, ${pgEsc(obs.advertiser_id)}, ${pgEsc(obs.advertiser_domain)}, ${pgEsc(obs.ad_text)}, ${pgEsc(obs.ad_creative_url)}, ${pgEsc(obs.landing_url)}, ${pgEsc(obs.landing_domain)}, ${pgEsc(obs.country)}, ${pgEsc(obs.started_at)}, ${pgEsc(obs.ended_at)}, ${pgEsc(obs.fingerprint_hash)}, ${obs.confidence || 0.8}, ${pgEsc(JSON.stringify(obs.raw_payload || {}))}::jsonb)
      ON CONFLICT (fingerprint_hash) DO NOTHING RETURNING id`;
    const r = pg(sql);
    if (r && r.length) inserted++;
  }
  return inserted;
}

async function updateLeadAdIntel(lead_id, lead_domain) {
  if (!lead_domain) return;
  const summary = pg(`
    SELECT json_build_object(
      'total_ads', COUNT(*),
      'platforms_count', COUNT(DISTINCT platform),
      'platforms', array_agg(DISTINCT platform ORDER BY platform),
      'countries', array_agg(DISTINCT country) FILTER (WHERE country IS NOT NULL),
      'latest_observed_at', MAX(observed_at)::text
    )::text
    FROM ad_observations
    WHERE advertiser_domain = ${pgEsc(lead_domain)} OR landing_domain = ${pgEsc(lead_domain)}
  `);
  if (!summary) return;
  // Parse to check platform count for priority boost
  let platformsCount = 0;
  try { const j = JSON.parse(summary); platformsCount = j.platforms_count || 0; } catch (_e) {}
  const boost = platformsCount >= 3 ? 15 : platformsCount >= 2 ? 8 : platformsCount >= 1 ? 3 : 0;
  pg(`UPDATE leads SET ad_intel=${pgEsc(summary)}::jsonb, priority_score = LEAST(100, COALESCE(priority_score,50) + ${boost}), updated_at=NOW() WHERE id=${lead_id}`);
}

async function startRun({ platform, query, country }) {
  const sql = `INSERT INTO ad_scraping_runs (platform, query, country, status) VALUES (${pgEsc(platform)}, ${pgEsc(query)}, ${pgEsc(country)}, 'running') RETURNING id`;
  const id = pg(sql);
  return id ? Number(id) : null;
}
async function endRun({ run_id, status, records_found, records_new, error }) {
  if (!run_id) return;
  pg(`UPDATE ad_scraping_runs SET ended_at=NOW(), status=${pgEsc(status)}, records_found=${records_found || 0}, records_new=${records_new || 0}, error=${pgEsc(error)} WHERE id=${run_id}`);
}

function pgFetchLeads(limit = 20) {
  // Prioritise leads that have a domain (pixel detector needs it).
  const raw = pg(`SELECT id, company, COALESCE(domain, ''), COALESCE(jurisdiction, 'UK'), COALESCE(priority_score, 50) FROM leads WHERE company IS NOT NULL AND domain IS NOT NULL ORDER BY priority_score DESC NULLS LAST, id ASC LIMIT ${limit}`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => {
    const [id, company, domain, jurisdiction, priority_score] = l.split('\t');
    return { id: Number(id), company, domain: domain || null, jurisdiction, priority_score: Number(priority_score) };
  });
}

async function dailyRun({ limit = 20 } = {}) {
  const leads = pgFetchLeads(limit);
  console.log(`Ad intel daily run · ${leads.length} leads to poll · ${new Date().toISOString()}`);
  const summary = { leads_polled: 0, ads_found: 0, ads_new: 0, platforms_active: {} };

  // Process in parallel batches of 5 — pixel-only path is fast, no rate-limit concerns
  const BATCH = 5;
  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    await Promise.all(batch.map(async (lead) => {
      const run_id = await startRun({ platform: 'pixel', query: lead.company, country: jurisdictionToCountry(lead.jurisdiction) });
      try {
        const observations = await pollPlatformsForLead(lead);
        summary.ads_found += observations.length;
        for (const obs of observations) {
          summary.platforms_active[obs.platform] = (summary.platforms_active[obs.platform] || 0) + 1;
        }
        const inserted = await writeObservations(observations, lead);
        summary.ads_new += inserted;
        await updateLeadAdIntel(lead.id, lead.domain);
        await endRun({ run_id, status: 'ok', records_found: observations.length, records_new: inserted });
        summary.leads_polled++;
      } catch (e) {
        await endRun({ run_id, status: 'error', error: String(e).slice(0, 200) });
      }
    }));
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const limit = Number((args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10);
  dailyRun({ limit });
}

module.exports = { dailyRun, pollPlatformsForLead, writeObservations, updateLeadAdIntel };
