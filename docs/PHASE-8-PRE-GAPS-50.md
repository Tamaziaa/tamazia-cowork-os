# Phase 8 · Pre-execution 50-gap audit

## Scraper coverage (1-15)
1. Meta Ad Library — has public API `https://www.facebook.com/ads/library/async/search_ads` but it changed; better path: `graph.facebook.com/ads_archive` with no token for limited fields, else scrape `facebook.com/ads/library` page
2. Google Ads Transparency — no API; HTML scrape `adstransparency.google.com/advertiser/<id>` is structured
3. LinkedIn Ad Library — `linkedin.com/ad-library/search` HTML; no auth needed for public ad listings
4. TikTok Creative Center — `library.tiktok.com/ads` public; some endpoints require region cookie
5. X / Twitter Ads Transparency — `ads.x.com/transparency` requires login as of 2024; workaround: use Wayback Machine snapshots for historical visibility
6. Snapchat Ads Library — `snap.com/ad-library` HTML, low traffic
7. Pinterest Ads — no public library yet; skip
8. Reddit Ads Transparency — `reddit.com/ads-transparency/` HTML
9. SimilarAds aggregator — paid; skip
10. AdLibrary.io aggregator — paid; skip
11. Workaround for aggregators: build our own cross-platform aggregator from the 6 free libraries
12. Rate limits — each library rate-limits anonymous scrapers; throttle to 1 req every 3-5 seconds, alternate platforms
13. Anti-bot detection — Meta and TikTok use JS challenges; use simple HTTP fetch + parse, accept some misses
14. ToS — every library's ToS allows public viewing; scraping for research is gray. Be conservative on volume
15. Headless browser fallback — Playwright/Puppeteer for JS-only platforms. Defer unless necessary

## Data model (16-25)
16. `ad_observations` table — (platform, advertiser_name, advertiser_domain, advertiser_id, ad_text, ad_creative_url, landing_url, country, started_at, ended_at, observed_at, fingerprint_hash)
17. Fingerprint hash for cross-run dedupe — SHA-256 of (platform + advertiser_id + ad_text first 100 chars)
18. Domain canonicalisation — strip www, lowercase, ignore trailing slash
19. Landing URL canonicalisation — same + ignore tracking params (utm_, fbclid, gclid)
20. Cross-platform advertiser matching — `lower(advertiser_name)` + domain → unified advertiser_id
21. Lead linkage — `ad_observations.advertiser_domain` matches `leads.domain` for cross-reference
22. `ad_intel` JSONB on `leads` — summary: { platforms: [], total_ads: N, latest_ad_at, top_keywords: [] }
23. Cross-platform priority boost — `priority_score` += 15 when advertiser runs ads on ≥3 platforms
24. Country tagging — every observation tagged with target country (from URL or platform-provided)
25. Audit-worker integration — `ad_intel` bucket pointers fed into the existing 10-bucket scoring

## Engineering (26-40)
26. Cron schedule — daily W14 at 14:30 local (1 hr lag from sourcing cron)
27. Idempotency — `INSERT ON CONFLICT (fingerprint_hash)` skip
28. Schema migration — additive only, nullable defaults
29. Per-platform queue depth — process 30 advertisers/platform/day, cycle through `leads` ordered by `priority_score DESC`
30. Latency tolerance — full pipeline run within 30 min
31. Error handling — single platform failure doesn't break the chain
32. Observability — every run logs to `ad_scraping_runs` table
33. UA + robots.txt — User-Agent identifies Tamazia, honour robots.txt where present
34. JavaScript-only platforms — defer; document workaround as headless browser if/when needed
35. International ad-intel — regional digests for UK/EU/USA/Middle East (current priority overlay)
36. LexQuity arbitration competitor monitor — passive ping on Kira / RAVN / Disco / Kleros LinkedIn + ads
37. Cache TTL — ad_observations fresh for 7 days, then re-fetch
38. Backfill — first-run pulls historical ads going back 90 days
39. Disposable advertiser detection — non-business advertisers (personal pages, scams) excluded by name pattern
40. Confidence score — 0-1 per observation, lower for headless scrapes

## Conversion + audit integration (41-50)
41. Pre-call briefs reference ad-intel: "Your competitors are running 18 ads on Meta + 22 on Google"
42. Audit Worker `ad_intel` bucket — previously empty for most leads; now populated when ads detected
43. Sector benchmarking — average ads per platform per sector → flag advertisers spending below/above average
44. Trend detection — when an advertiser's ad count grows 30%+ MoM → priority boost
45. New campaign alert — when an advertiser's ad text changes → Slack notification
46. Landing-page change detection — when a landing URL appears in ads but the page changed → re-scan via audit Worker
47. Multi-region advertisers — same advertiser running ads in 3+ countries → tag as international, increases LexQuity arbitration-target probability
48. Crisis signal — when advertiser pauses all ads after running consistently → Slack alert
49. Competitor ad text → keyword extraction for Tamazia outreach copy
50. Audit Worker page `ad_intel` block — show "Competitors running ads · click to see" detail

---
**Build order:** schema → 4 working scrapers (Meta, Google, LinkedIn, TikTok) → cron → pointer integration → live test → post-50 + closeout
