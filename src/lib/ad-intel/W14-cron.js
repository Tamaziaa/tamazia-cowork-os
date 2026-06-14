#!/usr/bin/env node
// Phase 8.2.2 · W14 daily ad-intelligence cron
// 1. Read today's sourcing sectors
// 2. For each lead with a domain, query all 8 platforms (Meta/Google/LinkedIn/TikTok/X/Snap/Pinterest/Reddit)
// 3. Cross-reference + dedupe via fingerprint_hash
// 4. Write to ad_intelligence
// 5. Recompute ad_intel_score + priority_score boost

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { searchAcrossPlatforms } = require('./aggregators.ts');
const { scoreAllLeads } = require('./cross-platform-scorer.ts');
const { scoreLead } = require('../enrich/lead-quality.js'); // 10-layer quality gate (PASS>=35)

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

function fingerprint(obs) {
  return crypto.createHash('sha256').update(`${obs.platform}|${obs.advertiser_id || obs.advertiser_name || ''}|${(obs.ad_text || obs.ad_creative_text || '').slice(0, 100)}`).digest('hex').slice(0, 32);
}

function jurisdictionToCountry(j) { return ({ UK: 'GB', GB: 'GB', US: 'US', FR: 'FR', DE: 'DE', UAE: 'AE', AE: 'AE', EU: 'GB' })[j] || 'GB'; }

function writeObservation(obs, lead_id) {
  const fp = fingerprint(obs);
  const sql = `
    INSERT INTO ad_intelligence
      (lead_id, platform, advertiser_name, advertiser_id, ad_creative_text, ad_creative_url, ad_format, date_started, date_ended, countries, estimated_spend_range, raw_data, fingerprint_hash)
    VALUES
      (${lead_id ? lead_id : 'NULL'}, ${pgEsc(obs.platform)}, ${pgEsc(obs.advertiser_name)}, ${pgEsc(obs.advertiser_id)},
       ${pgEsc(obs.ad_text || obs.ad_creative_text)}, ${pgEsc(obs.ad_creative_url)}, ${pgEsc(obs.ad_format)},
       ${pgEsc(obs.date_started)}::date, ${pgEsc(obs.date_ended)}::date,
       ${obs.country ? `ARRAY[${pgEsc(obs.country)}]::text[]` : 'NULL'},
       ${pgEsc(obs.estimated_spend_range)},
       ${pgEsc(JSON.stringify(obs))}::jsonb,
       ${pgEsc(fp)})
    ON CONFLICT (fingerprint_hash) DO NOTHING RETURNING id`;
  return pg(sql);
}

function fetchLeads(limit = 20) {
  const raw = pg(`SELECT id::text, company, COALESCE(domain, ''), COALESCE(jurisdiction, 'UK') FROM leads WHERE domain IS NOT NULL AND company IS NOT NULL AND company NOT LIKE 'Test %' ORDER BY priority_score DESC NULLS LAST, id DESC LIMIT ${limit}`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [id, company, domain, jurisdiction] = l.split('\t'); return { id: Number(id), company, domain, jurisdiction }; });
}

// Phase 8 quality gate: run the SAME 10-layer / 35-score engine used by the SERP pipeline on every
// lead that ad-intel has just proven is an active ad-runner. Ad-runners detected here get scored,
// persisted (quality_score/fit/layers + ad_intel summary), and — if they PASS (>=35) and have a
// Touch-0 draft — enter the auto-send cadence, exactly like sponsored-SERP leads. Single gate, everywhere.
async function qualifyAdIntelLeads(limit = 25) {
  const raw = pg(`
    SELECT l.id::text, COALESCE(l.domain,''), COALESCE(l.sector,''), COALESCE(l.contact_email,''),
           COALESCE(l.contact_confidence::text,'0'), COALESCE(l.all_socials::text,'{}'), COALESCE(l.all_emails::text,'[]'),
           COALESCE(l.primary_email,''), COALESCE(l.decision_maker_confidence::text,'0'),
           COALESCE(l.email_verified::text,''), COALESCE(l.verify_status,''), COALESCE(l.deliverability,''),
           COALESCE(l.audit_critical::text,'0'), COALESCE(l.ai_cited::text,''), COALESCE(l.ai_visibility_gap::text,''),
           COUNT(ai.id)::text AS obs, COALESCE(string_agg(DISTINCT ai.platform, ','),'') AS platforms
    FROM leads l JOIN ad_intelligence ai ON ai.lead_id = l.id
    WHERE l.quality_score IS NULL AND COALESCE(l.domain,'') <> ''
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
    GROUP BY l.id ORDER BY COUNT(ai.id) DESC LIMIT ${limit}`);
  if (!raw) return { scored: 0, passed: 0, queued: 0 };
  const rows = raw.split('\n').filter(Boolean).map(l => {
    const [id, domain, sector, contact_email, cc, all_socials, all_emails, primary_email, dmc, email_verified, verify_status, deliverability, audit_critical, ai_cited, ai_visibility_gap, obs, platforms] = l.split('\t');
    return { id: Number(id), domain, sector, contact_email, contact_confidence: Number(cc), all_socials, all_emails,
             primary_email, decision_maker_confidence: Number(dmc), email_verified, verify_status, deliverability,
             audit_critical: Number(audit_critical), ai_cited, ai_visibility_gap,
             scrape_stream: 'ad_intel',
             ad_intel: JSON.stringify({ observations: Number(obs), platforms: (platforms || '').split(',').filter(Boolean) }) };
  });
  let scored = 0, passed = 0, queued = 0;
  for (const lead of rows) {
    let q;
    try { q = await scoreLead(lead); } catch (_e) { continue; }
    scored++;
    pg(`UPDATE leads SET quality_score=${q.score}, quality_fit=${q.fit ? 'TRUE' : 'FALSE'}, quality_layers=${pgEsc(JSON.stringify(q.layers))}::jsonb,
        ad_intel=${pgEsc(lead.ad_intel)}::jsonb, quality_scored_at=NOW(),
        lifecycle_stage=${q.pass ? "'qualified'" : "'low_quality'"} WHERE id=${lead.id}`);
    if (q.pass) {
      passed++;
      const hasDraft = pg(`SELECT 1 FROM outreach_drafts WHERE lead_id=${lead.id} AND draft_metadata->>'touch'='0' AND send_status='pending' LIMIT 1`);
      if (hasDraft) { pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE WHERE id=${lead.id}`); queued++; }
    }
  }
  return { scored, passed, queued };
}

async function run({ limit = 15 } = {}) {
  const leads = fetchLeads(limit);
  console.log(`W14 daily cron · polling ${leads.length} leads across 8 platforms · ${new Date().toISOString()}`);
  const summary = { leads_polled: 0, observations_found: 0, observations_new: 0, platforms_active: {}, errors: [] };
  // Parallel batches of 3 to balance speed vs rate-limit safety
  const BATCH = 3;
  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    await Promise.all(batch.map(async (lead) => {
      try {
        const observations = await searchAcrossPlatforms({ domain: lead.domain, company: lead.company, country: jurisdictionToCountry(lead.jurisdiction) });
        summary.observations_found += observations.length;
        for (const obs of observations) {
          summary.platforms_active[obs.platform] = (summary.platforms_active[obs.platform] || 0) + 1;
          const r = writeObservation(obs, lead.id);
          if (r && r.length) summary.observations_new++;
        }
        summary.leads_polled++;
      } catch (e) {
        summary.errors.push({ lead_id: lead.id, error: String(e).slice(0, 200) });
      }
    }));
  }
  // Recompute ad-intel/priority scores
  const scoreResult = await scoreAllLeads();
  summary.leads_scored = scoreResult.updated;
  // 10-layer / 35-score quality gate on freshly-proven ad-runners → auto-send queue
  const gate = await qualifyAdIntelLeads();
  summary.quality_gate = gate;
  console.log(`W14 quality gate (10-layer, PASS>=35): scored ${gate.scored} · passed ${gate.passed} · queued-for-send ${gate.queued}`);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) {
  const limit = Number(process.argv[2] || 10);
  run({ limit });
}

module.exports = { run, writeObservation, fingerprint, qualifyAdIntelLeads };
