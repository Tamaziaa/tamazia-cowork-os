// Source adapters — one uniform interface per platform. Each yields normalized rawLeads that flow
// through the SAME pipeline (ICP pre-filter → audit → enrich → score → persist → channel-ready).
//
// rawLead = { domain, company, country, title, snippet, adText, adRunner, platform, source, permalink }
//
// mode(env): 'api' (free/keyed, runs autonomously) | 'chrome' (human-paced capture via Claude-in-Chrome,
//            compliant) | 'needs_key' (a free key would unlock API mode). candidates() runs api/free mode;
// ingestCaptured() accepts rows captured in a Chrome session. Everything fail-open.
'use strict';
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function timed(fn, ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fn(c.signal);}finally{clearTimeout(t);}}
async function getJSON(u,o,ms){try{const r=await timed(s=>fetch(u,{...o,signal:s}),ms||15000);if(!r.ok)return null;return await r.json();}catch(_){return null;}}
function rootDomain(u){try{return new URL(u.startsWith('http')?u:'https://'+u).hostname.replace(/^www\./,'');}catch{return '';}}
const SECTOR_TERMS = ['law firm','solicitors','dental clinic','aesthetic clinic','private clinic','estate agents','property developer','luxury hotel','fine dining','wealth management','financial advisers','accountants','cosmetic surgery'];
const GEOS = [['London','UK'],['Manchester','UK'],['Edinburgh','UK'],['Dubai','UAE'],['Abu Dhabi','UAE'],['New York','USA'],['Miami','USA'],['Madrid','Spain'],['Paris','France']];

// ---------- SERP top-results (strengthened "top 100") · SERPER, live ----------
const serp_top = {
  name: 'serp-top', platform: 'google-organic',
  mode: (env) => env.SERPER_KEY ? 'api' : 'needs_key',
  async candidates(opts = {}, env = process.env) {
    const key = env.SERPER_KEY; if (!key) return [];
    const out = []; const terms = opts.terms || SECTOR_TERMS; const geos = opts.geos || GEOS;
    for (const term of terms.slice(0, opts.maxTerms || 6)) {
      for (const [city, country] of geos.slice(0, opts.maxGeos || 4)) {
        const d = await getJSON('https://google.serper.dev/search', { method:'POST', headers:{'X-API-KEY':key,'Content-Type':'application/json'}, body: JSON.stringify({ q:`${term} ${city}`, num: 20, gl: country==='UK'?'gb':country==='UAE'?'ae':'us' }) }, 15000);
        for (const o of ((d&&d.organic)||[])) {
          const dom = rootDomain(o.link||''); if(!dom) continue;
          out.push({ domain:dom, company:(o.title||'').split(/[|\-–·]/)[0].trim(), country, title:o.title, snippet:o.snippet, adText:'', adRunner:false, platform:'google-organic', source:'serp-top', permalink:o.link });
        }
        // ad-runner signal: presence of ads block for the same query
        for (const a of ((d&&d.ads)||[])) { const dom=rootDomain(a.link||a.domain||''); if(dom) out.push({ domain:dom, company:(a.title||'').trim(), country, title:a.title, snippet:a.snippet||'', adText:a.title||'', adRunner:true, platform:'google-ads', source:'serp-top', permalink:a.link }); }
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

const REGISTRY = { serp_top, reddit, youtube, x_ads, social_ads };
function list(env = process.env){ return Object.values(REGISTRY).map(a=>({ name:a.name, platform:a.platform, mode:a.mode(env) })); }
module.exports = { REGISTRY, list, serp_top, reddit, youtube, x_ads, social_ads, rootDomain };
