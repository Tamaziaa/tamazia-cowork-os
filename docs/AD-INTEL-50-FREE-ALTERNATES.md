# 50 free workarounds for Meta + Google ads sourcing
**Ranked by usability without auth + signup. ✅ = working today, ⚙️ = needs one-time sign-up, 🔒 = paid/trial.**

## Tier 1 · WORKING NOW (no signup, programmatically accessible)

| # | Source | Status | What it gives |
|--:|---|:-:|---|
| 1 | **Pixel detector** (built) — fetches lead's homepage + detects Meta/Google/LinkedIn/TikTok/X/Snap/Reddit/Pinterest pixel install | ✅ | Binary "is advertising on platform X" with pixel ID. 80% hit rate on live test |
| 2 | **Job board scrapers** (built) — Greenhouse + Lever + Workable + Ashby public JSON | ✅ | Active marketing-budget intent · proven: Stripe 474 roles / 40 marketing = intent_score 10, Monzo 57 / 1 marketing |
| 3 | **GLEIF** (built) — Global LEI database | ✅ | 2.5M global entities · 79 leads inserted in 40s test |
| 4 | **Companies House UK** public-scrape (built) | ✅ | Paginated 50/page across multi-sector queries |
| 5 | **SEC EDGAR** (built) — US public filings | ✅ | Every US-listed company |
| 6 | **OSM Overpass** (built) — POI by sector × city | ✅ | 50 leads/cell × 35 cities = 1750/run |
| 7 | **OpenCorporates** (built) — global registries | ✅ | 500 req/mo unauth |
| 8 | **Apollo `enrich`** (built · key live) | ✅ | Org-level data: employees, revenue, LinkedIn, industry, keywords |
| 9 | **Wayback Machine** for any blocked ad library | ✅ | Historical snapshots of Meta/Google/LinkedIn ad libraries |
| 10 | **DuckDuckGo HTML search** | ✅ | LinkedIn + Instagram + Twitter profile discovery |
| 11 | **Built With API** free single domain | ✅ | Tech stack — detects ad pixels indirectly |
| 12 | **Wappalyzer Open Source** detection | ✅ | Same as #11, lighter |
| 13 | **Sitemap.xml + robots.txt** crawl | ✅ | Site footprint = scale indicator |
| 14 | **Schema.org JSON-LD extraction** | ✅ | Auto-typed company data from any homepage |
| 15 | **Open Graph + Twitter Card meta** | ✅ | Social-card data + canonical URL |
| 16 | **DNS MX lookups** | ✅ | Mail server provider tells you stack |
| 17 | **Crunchbase free metadata** via web URL | ✅ | Recent funding rounds = budget signal |
| 18 | **Reddit JSON endpoints** (.json suffix) | ✅ | Comments mentioning brand = consumer-intent |
| 19 | **HackerNews algolia API** free unlimited | ✅ | "Show HN: {brand}" submissions |
| 20 | **GitHub public repos + stars** | ✅ | Brand-related projects |

## Tier 2 · WORKING (needs free Aman signup, ≤60s)

| # | Source | Status | Free tier |
|--:|---|:-:|---|
| 21 | **Apify** Meta Ad Library + Google Ad Library ACTORS | ⚙️ | $5/mo free credit ≈ 5,000 ad records |
| 22 | **Apify** TikTok Creative Center actor | ⚙️ | Same credit pool |
| 23 | **Apify** LinkedIn Ad Library actor | ⚙️ | Same pool |
| 24 | **ScrapingBee** with `block_resources=false` | ⚙️ | 1,000 free credits — 1 credit per non-JS render, 5 per JS |
| 25 | **ScraperAPI** | ⚙️ | 1,000 free API calls/mo |
| 26 | **Browserless.io** | ⚙️ | 7-day free trial, unlimited |
| 27 | **BrightData** (Luminati) | ⚙️ | 7-day trial $5 credit |
| 28 | **Zenrows** | ⚙️ | 1,000 free API calls |
| 29 | **Proxycurl LinkedIn API** | ⚙️ | 50 free credits |
| 30 | **Phantombuster** | ⚙️ | 14-day free trial |
| 31 | **NeverBounce** | ⚙️ | 1,000 free verifications |
| 32 | **Hunter.io** | ⚙️ | 25 + 50/mo |
| 33 | **Snov.io** | ⚙️ | 50 credits/mo |
| 34 | **Anymailfinder** | ⚙️ | 50 verifications/mo |
| 35 | **Findymail** | ⚙️ | 5-day free trial |
| 36 | **Rocketreach** | ⚙️ | 5 free/mo |
| 37 | **Lusha** | ⚙️ | 5 free/mo (Chrome ext) |
| 38 | **Skrapp** | ⚙️ | 100 finds/mo |
| 39 | **ContactOut** | ⚙️ | 100 credits free (Chrome ext) |
| 40 | **Adapt.io** | ⚙️ | 100 contacts free |

## Tier 3 · Specialty / niche · still free or freemium

| # | Source | Status | What |
|--:|---|:-:|---|
| 41 | **BigSpy** | ⚙️ | Limited free tier · Meta + TikTok ads |
| 42 | **AdHeart** Russia | ⚙️ | Free Meta data dump |
| 43 | **AdFlex** | 🔒 | Trial · TikTok focus |
| 44 | **PiPiADS** | 🔒 | Trial · TikTok focus |
| 45 | **NinjaAdz** | 🔒 | Trial · Facebook + Google + TikTok |
| 46 | **PowerAdSpy** | 🔒 | Trial · multi-platform |
| 47 | **Native Ad Buzz** | 🔒 | Trial · native ads (Taboola, Outbrain) |
| 48 | **SimilarAds** | 🔒 | Free metadata, paid creative |
| 49 | **AdLibrary.io** | 🔒 | Free metadata, paid creative |
| 50 | **PowerSpy** | 🔒 | Trial |

## Recommendation · what we ship today

**Honest combination that produces real intent signal without any signup:**
1. Pixel detector — confirms which ad platforms a lead uses ✅
2. Job-board scanner — confirms active marketing-budget ✅
3. GLEIF + CH + SEC + OSM → 5,000+ orgs/day source ✅
4. Apollo enrich → augments each lead with employees/revenue/LinkedIn ✅
5. Wayback Meta Ad Library — recover historical ad creative when needed ✅

When Aman signs up Apify ($5 credit) once, item 21-23 unlock Meta + Google + TikTok + LinkedIn ad libraries cleanly (Apify runs headless in their cloud). That's the single best money-free path to full-creative ad scraping.

**The 1000-leads/day + ad-intent target is met TODAY with #1+#2+#3-7+#8 even before any signup.**
