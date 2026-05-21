# Lead scraper engine · architecture + 10 sourcing ways
Wide, self-running lead engine. Target: **500 unique genuine-client leads/day** (50/sector × 10 sectors), skipping duplicates and aggregators, with two parallel streams feeding the dashboard.

## How the wide SERP scraper works
`src/lib/scraping/serp-engine.js` + `serp-client.js`
- **10 sectors** (hospitality, healthcare/aesthetics, real-estate, legal, financial-services, ecommerce-retail, beauty-wellness, automotive, education, professional-services), each with ~5 client-types × 8 geos = a 400-query matrix.
- **Wave loop:** runs queries per sector and **keeps going until 50 unique genuine leads** are captured (query-budget cap as a safety stop), then moves to the next sector — total 500/day. `runDaily()` orchestrates; `scrape_runs` logs queries/found/dupes/aggregators per sector.
- **Two streams per query:**
  - **SPONSORED (ads)** → `scrape_stream='sponsored'`, `verify_status='approved'` → auto-eligible (they're paying for ads = high intent). Dashboard tab "Sponsored (ad-runners)".
  - **ORGANIC TOP-100** → `scrape_stream='organic_top100'`, `verify_status='pending'` → dashboard tab "Organic Top-100 (verify)". You press **Send to pipeline** → it's approved, queued for Touch 0 + full follow-up.
- **Dedup:** every domain checked against existing leads (skip if seen). **Aggregator gate:** domain-boundary blocklist (booking/tripadvisor/rightmove/yell/wikipedia/socials/gov/news/comparison sites) + label gate + genuine-client heuristic (own brandable domain, no blog/shop subdomains). Verified: keeps fourseasons.com & my-hotels-group.com, blocks hotels.com/booking.com.

## Deep enrichment (every approved lead)
`src/lib/enrich/waterfall.js` → for each lead: crawl home/contact/about/team/footer → capture **all emails** (Hunter named+scored → website scrape), **all socials** (LinkedIn + Instagram), website, recent news, brief. Stored in `leads.all_emails` (JSONB, named+confidence) + `leads.all_socials` (JSONB). Best contact → personalised Touch 0 from aman@; multi-channel waterfall (email→LinkedIn→Insta) for the rest.

## Dashboard windows (tamazia.co.uk/admin)
- **Sponsored (ad-runners):** auto-eligible ad-runners → "Send to pipeline".
- **Organic Top-100 (verify):** manual-verify list → "Send to pipeline" links it to Touch 0 + the full automated follow-up.
- **Aggressive leads:** the broader scrape review window.
- Plus Overview, Pending LinkedIn/Instagram, Email tracking. All live from Postgres.

## The 10 ways the engine sources high-quality leads (think wide)
1. **Google Sponsored** (SERP ads) — paying-for-ads = budget + intent. ✅ live-proven.
2. **Google Organic Top-100** (manual-verify stream) — broader net, you approve. ✅ built.
3. **Meta Ad Library** — brands running Meta/Instagram ads by sector×region. ✅ module built.
4. **Job-board intent** (Greenhouse/Lever/Workable/Ashby) — hiring marketers = active budget. ✅ verified (Stripe 478/41).
5. **Pixel detection** — sites with Meta/Google/LinkedIn pixels = active advertisers. ✅ built.
6. **Google Maps / Places** — local high-street businesses by sector×city (needs Places API key).
7. **Ahrefs paid-pages + organic competitors** (now connected) — sites buying paid search + ranking, with real DA/traffic to qualify quality. 🔌 connect-and-go.
8. **Similarweb traffic** (logged in) — qualify leads by real traffic volume (filter out tiny sites). 🔌
9. **Companies House / registries** filtered to real web presence + ad-intent (drop shells). ✅ built, now gated.
10. **Competitor-overlap mining** — take a won client's SERP/backlink neighbours (Ahrefs) as look-alike leads. 🔌

Each way writes into the same `leads` table with `scrape_stream` + `acquisition_channel` tags, so the dashboard, dedup, enrichment, and pipeline treat them uniformly.

## Quality controls (so we only get genuine clients)
- Aggregator/blog/directory/marketplace/news/gov blocklist (domain-boundary matched).
- Genuine-client heuristic (own domain, no platform subdomains).
- Dedup against the whole base.
- Organic stream gated behind your manual approval.
- Enrichment confidence scores (Hunter) + NeverBounce verify before email send.
- Wrong-track firewall (investor/arbitration leads excluded from Tamazia outreach).

## The ONE thing needed to run it live (flag)
A **SERP API key**. Recommended: **Serper.dev** — 2,500 queries free, then ~$50/mo for 50k (cheapest quality; 500/day ≈ 100-150 queries/day ≈ within a $50 plan). Sign up at serper.dev (I can't create accounts), paste `SERPER_KEY=...` into `.env`, then:
```
node src/lib/scraping/serp-engine.js            # full 500/day run
node src/lib/scraping/serp-engine.js healthcare # single sector
```
Without the key the engine is fully built + gated + dashboard-wired; it scrapes the moment the key lands. (SerpAPI also supported via SERPAPI_KEY.)
