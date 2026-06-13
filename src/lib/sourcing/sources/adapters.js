// Source adapters — one uniform interface per platform. Each yields normalized rawLeads that flow
// through the SAME pipeline (ICP pre-filter → audit → enrich → score → persist → channel-ready).
//
// rawLead = { domain, company, country, title, snippet, adText, adRunner, platform, source, permalink }
//
// mode(env): 'api' (free/keyed, runs autonomously) | 'chrome' (human-paced capture via Claude-in-Chrome,
//            compliant) | 'needs_key' (a free key would unlock API mode). candidates() runs api/free mode;
// ingestCaptured() accepts rows captured in a Chrome session. Everything fail-open.
'use strict';
const { execFileSync } = require('child_process');
const _NP = require('path');
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function timed(fn, ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fn(c.signal);}finally{clearTimeout(t);}}
async function getJSON(u,o,ms){try{const r=await timed(s=>fetch(u,{...o,signal:s}),ms||15000);if(!r.ok)return null;return await r.json();}catch(_){return null;}}
function rootDomain(u){try{return new URL(u.startsWith('http')?u:'https://'+u).hostname.replace(/^www\./,'');}catch{return '';}}
let _serpClient=null; try { _serpClient=require('../../scraping/serp-client.js'); } catch(_e){}
const SECTOR_TERMS = ['law firm','solicitors','dental clinic','aesthetic clinic','private clinic','estate agents','property developer','luxury hotel','fine dining','wealth management','financial advisers','accountants','cosmetic surgery'];
// [city, country]; country names map to gl codes in serp-client (unmapped fail-open to 'gb').
// Expanded EU coverage so the served EU region is actually sourced (was ~0.7% of leads).
const GEOS = [['London','UK'],['Manchester','UK'],['Edinburgh','UK'],['Dubai','UAE'],['Abu Dhabi','UAE'],['New York','USA'],['Miami','USA'],
  ['Paris','France'],['Madrid','Spain'],['Barcelona','Spain'],['Berlin','Germany'],['Munich','Germany'],['Frankfurt','Germany'],['Amsterdam','Netherlands'],['Dublin','Ireland'],['Milan','Italy'],['Rome','Italy'],['Brussels','Belgium'],['Lisbon','Portugal'],['Stockholm','Sweden'],['Copenhagen','Denmark'],['Vienna','Austria']];

// ---------- SERP top-results (strengthened "top 100") · SERPER, live ----------
const serp_top = {
  name: 'serp-top', platform: 'google-organic',
  // Free-first: serp-client chains SearXNG (unlimited, SEARXNG_URL) -> Brave (BRAVE_API_KEY) -> DuckDuckGo (no key,
  // always available) -> SERPER/SerpApi backup, with query-level Neon cache. So sourcing NEVER depends on SERPER credits.
  mode: () => 'api',
  async candidates(opts = {}, env = process.env) {
    if (!_serpClient) return [];
    const out = []; const terms = opts.terms || SECTOR_TERMS; const geos = opts.geos || GEOS;
    for (const term of terms.slice(0, opts.maxTerms || 6)) {
      for (const [city, country] of geos.slice(0, opts.maxGeos || 4)) {
        let d = null; try { d = await _serpClient.search(`${term} ${city}`, country, 20); } catch (_e) {}
        for (const o of ((d && d.organic) || [])) {
          const dom = o.domain || rootDomain(o.url || o.link || ''); if (!dom) continue;
          out.push({ domain: dom, company: (o.title || '').split(/[|\-–·]/)[0].trim(), country, title: o.title, snippet: o.snippet || '', adText: '', adRunner: false, platform: 'google-organic', source: 'serp-top', permalink: o.url || o.link || '' });
        }
        for (const a of ((d && d.ads) || [])) { const dom = a.domain || rootDomain(a.url || a.link || ''); if (dom) out.push({ domain: dom, company: (a.title || '').trim(), country, title: a.title, snippet: '', adText: a.title || '', adRunner: true, platform: 'google-ads', source: 'serp-top', permalink: a.url || a.link || '' }); }
      }
    }
    return out;
  },
  ingestCaptured(items){ return (items||[]).map(i=>({ domain:rootDomain(i.url||i.domain||''), company:i.company||'', country:i.country||'', title:i.title||'', snippet:i.snippet||'', adText:i.adText||'', adRunner:!!i.adRunner, platform:'google-organic', source:'serp-top', permalink:i.url||'' })).filter(x=>x.domain); },
};

// ---------- Reddit · free JSON search (discovery of businesses surfacing in sector subreddits) ----------
const reddit = {
  name: 'reddit', platform: 'reddit',
  mode: (env) => (env.REDDIT_TOKEN ? 'api' : 'chrome'), // reddit blocks unauth .json (403); needs OAuth token or Chrome capture
  async candidates(opts = {}, env = process.env) {
    const out = []; const terms = opts.terms || ['recommend solicitor','best dental clinic','estate agent recommendation','financial advisor recommendation','aesthetic clinic'];
    const token = env.REDDIT_TOKEN; const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    const hdr = token ? { 'user-agent': UA, authorization: 'Bearer ' + token } : { 'user-agent': UA };
    if (!token) return out; // unauth .json is 403-blocked — use Chrome capture or add REDDIT_TOKEN
    for (const term of terms.slice(0, opts.maxTerms || 5)) {
      const d = await getJSON(`${base}/search.json?q=${encodeURIComponent(term)}&limit=25&sort=new`, { headers: hdr }, 15000);
      for (const c of ((d&&d.data&&d.data.children)||[])) {
        const p = c.data || {}; const url = p.url_overridden_by_dest || p.url || '';
        const dom = rootDomain(url);
        if (dom && !/reddit\.com|redd\.it|imgur|youtube|i\.redd/.test(dom)) out.push({ domain:dom, company:'', country:'', title:p.title||'', snippet:(p.selftext||'').slice(0,200), adText:'', adRunner:false, platform:'reddit', source:'reddit', permalink:'https://reddit.com'+(p.permalink||'') });
        // also mine domains mentioned in self-text
        for (const m of String(p.selftext||'').matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) { const dd=rootDomain(m[1]); if(dd && !/reddit|youtube|imgur|google|wikipedia/.test(dd)) out.push({ domain:dd, company:'', country:'', title:p.title||'', snippet:'', adText:'', adRunner:false, platform:'reddit', source:'reddit', permalink:'https://reddit.com'+(p.permalink||'') }); }
      }
    }
    return out;
  },
  ingestCaptured(items){ return (items||[]).map(i=>({ domain:rootDomain(i.url||i.domain||''), company:i.company||'', country:i.country||'', title:i.title||'', snippet:i.snippet||'', adText:'', adRunner:false, platform:'reddit', source:'reddit', permalink:i.url||'' })).filter(x=>x.domain); },
};

// ---------- YouTube ad-runners · YouTube Data API (free key) + Google Ads Transparency (Chrome) ----------
const youtube = {
  name: 'youtube', platform: 'youtube',
  mode: (env) => (env.YOUTUBE_API_KEY ? 'api' : 'chrome'),
  async candidates(opts = {}, env = process.env) {
    const key = env.YOUTUBE_API_KEY; if (!key) return []; // chrome mode handles capture
    const out = []; const terms = opts.terms || SECTOR_TERMS;
    for (const term of terms.slice(0, opts.maxTerms || 6)) {
      const d = await getJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(term)}&key=${key}`, {}, 15000);
      for (const it of ((d&&d.items)||[])) { const desc=(it.snippet&&it.snippet.description)||''; const m=desc.match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i); const dom=m?rootDomain(m[1]):''; if(dom) out.push({ domain:dom, company:(it.snippet&&it.snippet.title)||'', country:'', title:(it.snippet&&it.snippet.title)||'', snippet:desc.slice(0,200), adText:'', adRunner:false, platform:'youtube', source:'youtube', permalink:'https://youtube.com/channel/'+(it.id&&it.id.channelId||'') }); }
    }
    return out;
  },
  // Chrome capture from Google Ads Transparency Center (YouTube/video advertisers in a sector+geo)
  ingestCaptured(items){ return (items||[]).map(i=>({ domain:rootDomain(i.url||i.advertiser_domain||i.domain||''), company:i.advertiser||i.company||'', country:i.country||'', title:i.advertiser||'', snippet:i.adText||'', adText:i.adText||'', adRunner:true, platform:'youtube-ads', source:'youtube', permalink:i.url||'' })).filter(x=>x.domain); },
};

// ---------- X (Twitter) ad-runners · X Ads Repository (Chrome) + free search fallback ----------
const x_ads = {
  name: 'x-ads', platform: 'x',
  mode: (env) => (env.X_BEARER_TOKEN ? 'api' : 'chrome'),
  async candidates(opts = {}, env = process.env) {
    const t = env.X_BEARER_TOKEN; if (!t) return [];
    const out = []; const terms = opts.terms || SECTOR_TERMS;
    for (const term of terms.slice(0, 4)) {
      const d = await getJSON(`https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(term+' has:links')}&max_results=20&tweet.fields=entities`, { headers:{ authorization:'Bearer '+t } }, 15000);
      for (const tw of ((d&&d.data)||[])) { const urls=((tw.entities&&tw.entities.urls)||[]); for(const u of urls){ const dom=rootDomain(u.expanded_url||u.url||''); if(dom && !/twitter|x\.com|t\.co/.test(dom)) out.push({ domain:dom, company:'', country:'', title:'', snippet:(tw.text||'').slice(0,200), adText:'', adRunner:false, platform:'x', source:'x-ads', permalink:'' }); } }
    }
    return out;
  },
  // Chrome capture from X / ads.x.com transparency (advertisers in sector)
  ingestCaptured(items){ return (items||[]).map(i=>({ domain:rootDomain(i.url||i.advertiser_domain||i.domain||''), company:i.advertiser||i.company||'', country:i.country||'', title:i.advertiser||'', snippet:i.adText||'', adText:i.adText||'', adRunner:true, platform:'x-ads', source:'x-ads', permalink:i.url||'' })).filter(x=>x.domain); },
};

// ---------- Generic social ad-libraries · Meta / TikTok / LinkedIn ("all other social") ----------
const social_ads = {
  name: 'social-ads', platform: 'social',
  mode: (env) => (env.META_AD_TOKEN ? 'api' : 'chrome'),
  async candidates(opts = {}, env = process.env) {
    const tok = env.META_AD_TOKEN; if (!tok) return [];
    const out = []; const terms = opts.terms || SECTOR_TERMS;
    for (const term of terms.slice(0, 4)) {
      const d = await getJSON(`https://graph.facebook.com/v19.0/ads_archive?search_terms=${encodeURIComponent(term)}&ad_reached_countries=['GB','AE','US']&fields=page_name,ad_snapshot_url,ad_creative_link_captions&limit=25&access_token=${tok}`, {}, 15000);
      for (const a of ((d&&d.data)||[])) { const cap=(a.ad_creative_link_captions&&a.ad_creative_link_captions[0])||''; const dom=rootDomain(cap); if(dom) out.push({ domain:dom, company:a.page_name||'', country:'', title:a.page_name||'', snippet:'', adText:'', adRunner:true, platform:'meta-ads', source:'social-ads', permalink:a.ad_snapshot_url||'' }); }
    }
    return out;
  },
  ingestCaptured(items){ return (items||[]).map(i=>({ domain:rootDomain(i.url||i.advertiser_domain||i.domain||''), company:i.advertiser||i.page_name||i.company||'', country:i.country||'', title:i.advertiser||i.page_name||'', snippet:i.adText||'', adText:i.adText||'', adRunner:true, platform:(i.platform||'social')+'-ads', source:'social-ads', permalink:i.url||'' })).filter(x=>x.domain); },
};

// ---------- JobSpy hiring-signal · firms hiring SEO/marketing/compliance roles = budget + a gap we fill ----------
const jobspy = {
  name: 'jobspy', platform: 'indeed',
  mode: () => 'api', // domain resolution now via serp-client (Google proxy/DDG); the job scrape itself needs scrapers/run_jobspy.py
  async candidates(opts = {}, env = process.env) {
    let rows = [];
    try {
      const script = _NP.resolve(__dirname, '..', '..', '..', '..', 'scrapers', 'run_jobspy.py');
      const cfg = JSON.stringify({ roles: opts.roles, locs: opts.locs });
      const raw = execFileSync('python3', [script, cfg], { encoding: 'utf8', timeout: 150000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, JOBSPY_PER: String(opts.per || 6) } });
      const j = JSON.parse(raw.trim().split('\n').pop()); rows = j.rows || [];
    } catch (_e) { return []; }
    const out = []; const seen = new Set();
    const BAD = /indeed|glassdoor|linkedin|facebook|crunchbase|wikipedia|youtube|reed\.co|totaljobs|monster|ziprecruiter|bayt|naukri|google|bloomberg|companieshouse|trustpilot|yell|yelp|twitter|instagram|tiktok|apple|amazon/i;
    const validDom = (dd) => dd && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dd) && !/^\d+\.\d+\.\d+\.\d+$/.test(dd) && dd.length <= 60;
    const resolve = async (company, country) => {
      const gl = country === 'UK' ? 'gb' : country === 'UAE' ? 'ae' : country === 'EU' ? 'ie' : 'us';
      for (let attempt = 0; attempt < 2; attempt++) {
        const qq = attempt === 0 ? (company + ' official website') : ('"' + company + '" website');
        let d = null; try { d = _serpClient ? await _serpClient.search(qq, country, 6) : null; } catch (_e) {}
        for (const o of ((d && d.organic) || [])) { const dd = o.domain || rootDomain(o.url || o.link || ''); if (validDom(dd) && !BAD.test(dd)) return { dom: dd, otitle: o.title || '', osnip: o.snippet || '' }; }
        if (attempt === 0) await new Promise(r => setTimeout(r, 350));
      }
      return null;
    };
    for (const r of rows.slice(0, opts.max || 50)) {
      let res = null; try { res = await resolve(r.company, r.country); } catch (_e) { res = null; }
      if (!res || seen.has(res.dom)) continue; seen.add(res.dom);
      out.push({ domain: res.dom, company: r.company, country: r.country, title: res.otitle || r.company, snippet: (res.osnip ? res.osnip + ' \u00b7 ' : '') + 'Currently hiring: ' + r.title + (r.site ? ' (' + r.site + ')' : ''), adText: '', adRunner: false, hiring_signal: r.query || r.title, job_board: r.site || 'indeed', platform: r.site || 'indeed', source: 'jobspy', permalink: 'https://www.google.com/search?q=' + encodeURIComponent(r.company + ' careers') });
    }
    return out;
  },
  ingestCaptured(items) { return (items || []).map(i => ({ domain: rootDomain(i.url || i.domain || ''), company: i.company || '', country: i.country || '', title: i.title || '', snippet: i.snippet || ('Currently hiring: ' + (i.title || '')), adText: '', adRunner: false, hiring_signal: i.hiring_signal || i.title || '', platform: 'indeed', source: 'jobspy', permalink: i.url || '' })).filter(x => x.domain); },
};

// ---------- Google Maps places · SERPER /places (free-keyed, no Go binary) — local service-firm ICP sourcing ----------
const maps = {
  name: 'maps', platform: 'google-maps',
  // Free-first local sourcing: serp-client (Apify Google SERP proxy -> SearXNG -> Brave -> DDG) on a local-intent
  // query. No SERPER dependency. Structured place data (rating/address) is sacrificed for the domain, which is all
  // the funnel needs; OSM-overpass (S028) still provides address-rich local records in parallel.
  mode: () => 'api',
  async candidates(opts = {}, env = process.env) {
    if (!_serpClient) return [];
    const out = []; const seen = new Set();
    const terms = opts.terms || SECTOR_TERMS; const geos = opts.geos || GEOS;
    for (const term of terms.slice(0, opts.maxTerms || 6)) {
      for (const [city, country] of geos.slice(0, opts.maxGeos || 4)) {
        let d = null; try { d = await _serpClient.search(`${term} in ${city}`, country, 15); } catch (_e) {}
        for (const o of ((d && d.organic) || [])) {
          const dom = o.domain || rootDomain(o.url || ''); if (!dom || seen.has(dom)) continue; if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dom) || dom.length > 60) continue; seen.add(dom);
          out.push({ domain: dom, company: (o.title || '').split(/[|\-–·]/)[0].trim(), country, title: o.title || '', snippet: term + ' · ' + city, adText: '', adRunner: false, platform: 'google-maps', source: 'maps', permalink: o.url || '' });
        }
      }
    }
    return out;
  },
  ingestCaptured(items) { return (items || []).map(i => ({ domain: rootDomain(i.website || i.url || i.domain || ''), company: i.company || i.title || '', country: i.country || '', title: i.title || '', snippet: i.snippet || '', adText: '', adRunner: false, platform: 'google-maps', source: 'maps', permalink: i.website || i.url || '' })).filter(x => x.domain); },
};

const REGISTRY = { serp_top, reddit, youtube, x_ads, social_ads, jobspy, maps };
function list(env = process.env){ return Object.values(REGISTRY).map(a=>({ name:a.name, platform:a.platform, mode:a.mode(env) })); }
module.exports = { REGISTRY, list, serp_top, reddit, youtube, x_ads, social_ads, jobspy, maps, rootDomain };
