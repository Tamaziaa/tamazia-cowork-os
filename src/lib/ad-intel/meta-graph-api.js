// Meta Graph API · ads_archive endpoint
// Public political/issue ads work with app-access-token (free Meta Developer App, no review needed)
// Commercial ads require Marketing API ads_read scope + verified business
//
// Workaround for the no-token case: call the public Meta Ad Library async endpoint
// (graph.facebook.com/v18.0/ads_archive?search_terms=X&ad_reached_countries=GB&ad_active_status=ACTIVE&access_token=APP_ID|APP_SECRET)
// — works for political/issue, returns 4xx for commercial.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

function appToken() {
  // META_APP_ID|META_APP_SECRET produces an app-access-token usable for public Ads Library political/issue queries
  const appId = process.env.META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  if (appId && appSecret) return `${appId}|${appSecret}`;
  return process.env.META_ACCESS_TOKEN || ''; // direct token override
}

async function adsArchive({ search_terms, ad_reached_countries = 'GB', ad_active_status = 'ALL', ad_type = 'POLITICAL_AND_ISSUE_ADS', limit = 25, after = null }) {
  const token = appToken();
  if (!token) return { ok: false, error: 'no_meta_token', hint: 'Set META_APP_ID + META_APP_SECRET in .env OR META_ACCESS_TOKEN. Free Meta Developer app at developers.facebook.com/apps' };
  const fields = 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,page_id,page_name,languages,publisher_platforms,estimated_audience_size,impressions,spend';
  const params = new URLSearchParams({
    access_token: token,
    search_terms,
    ad_reached_countries: JSON.stringify([ad_reached_countries]),
    ad_active_status,
    ad_type,
    fields,
    limit: String(limit)
  });
  if (after) params.set('after', after);
  const url = `https://graph.facebook.com/v19.0/ads_archive?${params}`;
  const r = await fetchWithRetry(url, { timeout: 18000, retries: 1 });
  if (!r.ok) {
    let err = r.body;
    try { err = JSON.parse(r.body); } catch (_e) {}
    return { ok: false, status: r.status, error: err };
  }
  try {
    const json = JSON.parse(r.body);
    return {
      ok: true,
      data: (json.data || []).map(ad => ({
        platform: 'meta',
        advertiser_id: ad.page_id,
        advertiser_name: ad.page_name,
        ad_id: ad.id,
        ad_creative_text: Array.isArray(ad.ad_creative_bodies) ? ad.ad_creative_bodies.join(' · ').slice(0, 800) : null,
        ad_creative_url: ad.ad_snapshot_url,
        date_started: ad.ad_delivery_start_time ? ad.ad_delivery_start_time.slice(0, 10) : null,
        date_ended: ad.ad_delivery_stop_time ? ad.ad_delivery_stop_time.slice(0, 10) : null,
        countries: [ad_reached_countries],
        platforms: ad.publisher_platforms,
        estimated_audience_size: ad.estimated_audience_size,
        impressions: ad.impressions,
        spend: ad.spend,
        observed_at: new Date().toISOString()
      })),
      next_cursor: json.paging?.cursors?.after || null
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function searchAllPagesForTerm({ search_terms, country = 'GB', max_pages = 4 }) {
  const all = [];
  let cursor = null;
  for (let p = 0; p < max_pages; p++) {
    const r = await adsArchive({ search_terms, ad_reached_countries: country, after: cursor });
    if (!r.ok) break;
    all.push(...r.data);
    if (!r.next_cursor) break;
    cursor = r.next_cursor;
    await new Promise(r => setTimeout(r, 600));
  }
  return all;
}

module.exports = { adsArchive, searchAllPagesForTerm };

if (require.main === module) {
  (async () => {
    const r = await adsArchive({ search_terms: 'NHS', ad_reached_countries: 'GB' });
    if (!r.ok) console.log('Meta Graph API status:', r.ok, '· hint:', r.hint || r.error);
    else console.log('Meta political/issue ads search "NHS" GB:', r.data.length, '· sample:', r.data[0]?.advertiser_name);
  })();
}
