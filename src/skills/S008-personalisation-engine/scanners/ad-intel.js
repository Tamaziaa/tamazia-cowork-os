// Ad/marketing intelligence scanner · Phase 6 task 6.2.6
// Three signals:
//   1. Meta Ad Library public search (HTML scrape with 403/200 detection)
//   2. Tracking pixels detected on the home page (from website scan tech array)
//   3. Wayback first-seen + last-archive timestamps (gives us "domain age" + cadence of updates)
//
// All sources are public. Failures degrade gracefully: never block the scan.

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const SCANNER = 'ad_intel';

async function scan({ domain, company, websiteFacts, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  // Fast bail for fixture/private hosts — Meta + Wayback would just time out.
  const isPrivateHost = /^(127\.|10\.|192\.168\.|localhost)/.test(domain) || /^\d/.test(domain);
  const [adLib, wayback] = isPrivateHost
    ? [{ ok: false, error: 'private_host_skipped' }, { ok: false, error: 'private_host_skipped' }]
    : await Promise.all([metaAdLibrary({ domain, company }), waybackHistory({ domain })]);

  const tech = (websiteFacts?.tech || []).map(t => `${t.key}:${t.value}`);
  const tracking = (websiteFacts?.tech || []).filter(t => t.key === 'analytics').map(t => t.value);

  const issues = [];
  if (tracking.length === 0) {
    issues.push({ severity: 'P1', id: 'no_tracking_detected', evidence_url: `https://${domain}/`, fact: 'No analytics or marketing-pixel scripts detected on the home page', recommendation: 'Install GA4 + Meta Pixel + conversion tracking to measure paid + organic performance' });
  }
  if (!tracking.includes('meta-pixel') && !tracking.includes('linkedin-insight')) {
    issues.push({ severity: 'P2', id: 'no_paid_pixels', evidence_url: `https://${domain}/`, fact: 'No Meta or LinkedIn conversion pixel detected', recommendation: 'Install the relevant ad-platform pixel to enable retargeting and conversion attribution' });
  }
  if (adLib.ok && adLib.active_ads === 0 && tracking.includes('meta-pixel')) {
    issues.push({ severity: 'P2', id: 'pixel_without_ads', evidence_url: 'https://www.facebook.com/ads/library/', fact: 'Meta pixel is installed but no active ads were found in the public ad library', recommendation: 'Either run paid retargeting against the pixel audience or remove the pixel to reduce script load' });
  }
  if (wayback.ok && wayback.first_seen_year && (new Date().getFullYear() - wayback.first_seen_year) >= 5 && wayback.update_cadence_days > 365) {
    issues.push({ severity: 'P2', id: 'stale_site', evidence_url: 'https://web.archive.org/', fact: `Site has been live since ${wayback.first_seen_year} but Wayback Machine shows captures spaced ~${wayback.update_cadence_days} days apart — content cadence is low`, recommendation: 'Publish at least one substantive content update per quarter to signal freshness' });
  }

  const payload = {
    domain, ok: true,
    meta_ad_library: adLib,
    wayback,
    tech_summary: tech,
    tracking_pixels: tracking,
    issues
  };
  writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}

async function metaAdLibrary({ domain, company }) {
  // Public Ad Library search page (HTML). We look for the count of active ads + first-page result text.
  const term = (company || domain.split('.')[0]).replace(/\s+/g, ' ').trim();
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=GB&q=${encodeURIComponent(term)}&search_type=keyword_unordered`;
  const r = await fetchWithRetry(url, { timeout: 15000, retries: 1, headers: { 'Accept-Language': 'en-GB,en;q=0.9' } });
  if (!r.ok) return { ok: false, status: r.status, term, query_url: url, error: r.error || `http_${r.status}` };
  // Server-rendered Meta library is usually a shell; look for the result-count text or "No ads to show"
  const body = r.body || '';
  const countMatch = body.match(/~?(\d+) result/i) || body.match(/"totalCount":\s*(\d+)/);
  const empty = /No ads to show|There are no ads/i.test(body);
  return { ok: true, status: r.status, term, query_url: url, active_ads: countMatch ? Number(countMatch[1]) : (empty ? 0 : null), html_shell_only: body.length < 4000 };
}

async function waybackHistory({ domain }) {
  // CDX API can be flaky — fall back to availability API on failure.
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&limit=2&from=20000101&to=21000101&fl=timestamp,statuscode&filter=statuscode:200`;
  const r = await fetchWithRetry(cdx, { timeout: 12000, retries: 1 });
  if (r.ok && r.body && r.body.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(r.body);
      const firstRow = arr[1];
      const lastRow = arr[arr.length - 1];
      if (firstRow && lastRow) {
        const firstYear = Number(String(firstRow[0]).slice(0, 4));
        const lastYear = Number(String(lastRow[0]).slice(0, 4));
        const daysBetween = Math.max(1, Math.round((new Date(`${lastYear}-12-31`) - new Date(`${firstYear}-01-01`)) / 86400000));
        return { ok: true, first_seen_year: firstYear, last_capture_year: lastYear, captures_seen: arr.length - 1, update_cadence_days: Math.round(daysBetween / Math.max(1, arr.length - 1)) };
      }
    } catch (_e) {}
  }
  // Fallback: availability API
  const avail = await fetchWithRetry(`https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`, { timeout: 8000, retries: 1 });
  if (avail.ok) {
    try {
      const d = JSON.parse(avail.body || '{}');
      const closest = d.archived_snapshots?.closest;
      if (closest?.timestamp) return { ok: true, first_seen_year: Number(String(closest.timestamp).slice(0, 4)), captures_seen: 1, update_cadence_days: null };
    } catch (_e) {}
  }
  return { ok: false, error: 'wayback_unavailable' };
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  const company = process.argv[3] || 'Tamazia';
  scan({ domain: dom, company, websiteFacts: { tech: [{ key: 'analytics', value: 'GA4' }] } })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}
module.exports = { scan };
