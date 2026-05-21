// Phase 8.3.1 · Bucket D integration into S008 personalisation engine
// Reads ad_intelligence for each lead → produces specific ad-referencing pointers.
// Updates leads.personalisation_pointers · bucket_ad_intel with concrete strings.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

function buildPointer(observation) {
  const p = observation.platform;
  const adv = observation.advertiser_name;
  const txt = observation.ad_creative_text || observation.ad_text;
  const start = observation.date_started;
  const country = (observation.countries && observation.countries[0]) || null;
  const fmt = observation.ad_format;

  // Construct specific pointer strings per spec
  if (p === 'meta' && txt && start) return `Your Meta ad creative ("${txt.slice(0, 70)}…") has been live since ${start}${country ? ' targeting ' + country : ''}.`;
  if (p === 'meta' && txt) return `Your Meta ad creative ("${txt.slice(0, 70)}…") is currently live.`;
  if (p === 'meta') return `You're actively running Meta ads (Facebook + Instagram).`;
  if (p === 'google' && adv) return `Your Google Ads account is active. Tracking tag detected on the homepage.`;
  if (p === 'google') return `You're running Google Ads (tracking tag installed).`;
  if (p === 'linkedin' && txt) return `LinkedIn ad creative ("${txt.slice(0, 70)}…") published${start ? ' since ' + start : ''}.`;
  if (p === 'linkedin') return `LinkedIn Ads pixel active — actively investing in B2B social.`;
  if (p === 'tiktok' && txt) return `TikTok creative "${txt.slice(0, 70)}…" currently running${country ? ' in ' + country : ''}.`;
  if (p === 'tiktok') return `Active TikTok advertising via Creative Center.`;
  if (p === 'x') return `X (Twitter) Ads pixel detected — actively running paid social.`;
  if (p === 'snapchat') return `Snapchat advertising signal detected${observation.estimated_spend_usd ? ' (estimated spend $' + observation.estimated_spend_usd + ')' : ''}.`;
  if (p === 'pinterest') return `Pinterest Business profile active${observation.follower_count ? ' (' + observation.follower_count + ' followers)' : ''}.`;
  if (p === 'reddit') return `Reddit Ads activity detected.`;
  if (p === 'intent') return `Marketing-tech investment signal: ${txt}.`;
  return `Active ${p} advertising detected.`;
}

function integrateForLead(lead_id) {
  const raw = pg(`SELECT platform, advertiser_name, ad_creative_text, date_started, date_ended, COALESCE(array_to_string(countries, ','), '') AS country, ad_format FROM ad_intelligence WHERE lead_id = ${lead_id} ORDER BY fetched_at DESC LIMIT 20`);
  if (!raw) return { lead_id, pointers: [] };
  const obs = raw.split('\n').filter(Boolean).map(l => { const [platform, advertiser_name, ad_creative_text, date_started, date_ended, country, ad_format] = l.split('\t'); return { platform, advertiser_name, ad_creative_text, date_started, date_ended, countries: country ? country.split(',') : null, ad_format }; });
  const pointers = obs.map(o => buildPointer(o)).filter(Boolean);
  const uniqueByPrefix = new Map();
  for (const p of pointers) { const key = p.slice(0, 35); if (!uniqueByPrefix.has(key)) uniqueByPrefix.set(key, p); }
  const finalPointers = Array.from(uniqueByPrefix.values());
  // Read existing personalisation_pointers JSONB and merge under "bucket_ad_intel"
  const existing = pg(`SELECT COALESCE(personalisation_pointers, '[]'::jsonb)::text FROM leads WHERE id = ${lead_id}`);
  let arr = [];
  try { arr = JSON.parse(existing || '[]'); } catch (_e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  // Remove old ad-intel pointers + append new ones
  arr = arr.filter(p => p.bucket !== 'ad_intel');
  for (const p of finalPointers) {
    arr.push({
      bucket: 'ad_intel',
      severity: 'P2',
      fact: p,
      recommendation: 'Cross-reference Tamazia regulatory + SEO review with your active paid-acquisition copy.',
      citation: 'AD_INTEL bucket_d',
      quality: 0.85,
      layman_explanation: p,
      tamazia_fix_short: 'Tamazia reviews every active ad creative + landing page against the sector regulator before re-publish.'
    });
  }
  pg(`UPDATE leads SET personalisation_pointers = ${pgEsc(JSON.stringify(arr))}::jsonb, updated_at = NOW() WHERE id = ${lead_id}`);
  return { lead_id, pointers_added: finalPointers.length };
}

function integrateAll() {
  const raw = pg(`SELECT DISTINCT lead_id FROM ad_intelligence WHERE lead_id IS NOT NULL`);
  if (!raw) return { leads: 0 };
  const leadIds = raw.split('\n').filter(Boolean).map(Number);
  const results = leadIds.map(id => integrateForLead(id));
  return { leads: results.length, total_pointers: results.reduce((a, r) => a + (r.pointers_added || 0), 0), results };
}

module.exports = { buildPointer, integrateForLead, integrateAll };

if (require.main === module) {
  const r = integrateAll();
  console.log(JSON.stringify(r, null, 2).slice(0, 800));
}
