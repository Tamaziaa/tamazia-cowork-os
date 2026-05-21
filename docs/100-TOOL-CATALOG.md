# Tamazia engine · 100-tool catalog (free / freemium)

Curated from a broad scan, mapped to our use case. Legend:
- **WIRED** = live in the engine now (key in `.env`, code path exists)
- **API** = free API, I can wire on request (no signup blocker)
- **SIGNUP** = free tier but needs you to create the account / paste a key
- **MCP** = Claude connector (connect in Cowork, no code)
- **EXT** = Chrome extension, manual install only

Compliance note: all contact-data tools are used on the **compliant B2B path** (legitimate interest, licensed providers, role-based corporate contacts, unsubscribe honored). No mass personal-social scraping.

## 1 · Email sending relays (transactional)
| # | Tool | Free/mo | Status |
|--:|---|---|---|
|1|SMTP2Go|1,000|WIRED|
|2|Brevo|9,000 (300/day)|WIRED (needs account activation)|
|3|Mailjet|6,000 (200/day)|WIRED|
|4|SendGrid|3,000 (100/day)|WIRED|
|5|Resend|3,000|SIGNUP (key empty)|
|6|MailerSend|3,000|SIGNUP (key empty)|
|7|MailerLite|12,000 (campaigns)|WIRED (nurture only, not cold)|
|8|Sender.net|15,000|SIGNUP|
|9|Elastic Email|100/day|API|
|10|SMTP.com trial|—|SIGNUP|
|11|Postmark (txn)|100/mo dev|SIGNUP|
|12|Amazon SES|3,000 (12mo)|SIGNUP (already in tamazia.in SPF)|

## 2 · Email verification / deliverability
|13|NeverBounce|1,000 free|WIRED|
|14|Mail-Tester|1/day|WIRED (manual)|
|15|GlockApps|3 tests/mo|SIGNUP|
|16|MailReach|trial|SIGNUP|
|17|ZeroBounce|100/mo|SIGNUP|
|18|Hunter Verifier|50/mo|API|
|19|Bouncer|free trial|SIGNUP|
|20|Verifalia|25/day|API|
|21|Gmail Postmaster Tools|free|SIGNUP (1 DNS TXT)|
|22|MXToolbox|free lookups|API|
|23|learndmarc.com|free|API|
|24|dmarcian (RUA)|free tier|SIGNUP|

## 3 · Lead sourcing / B2B databases
|25|Apollo.io|free + MCP|WIRED + MCP|
|26|GLEIF (LEI)|unlimited|WIRED|
|27|Companies House UK|unlimited|WIRED|
|28|SEC EDGAR|unlimited|WIRED|
|29|OpenStreetMap Overpass|unlimited|WIRED|
|30|OpenCorporates|500/mo|API|
|31|Crunchbase (web)|metadata|API|
|32|Common Room|MCP|MCP (installed plugin)|
|33|Clay|free tier|MCP (installed plugin)|
|34|ZoomInfo|MCP|MCP (installed plugin)|
|35|People Data Labs|100/mo|SIGNUP|
|36|Clearbit/Breeze|free tier|SIGNUP|
|37|Wikidata SPARQL|unlimited|API|
|38|Google Places API|$200 credit|SIGNUP|
|39|Yelp Fusion|5,000/day|SIGNUP|
|40|Product Hunt API|free|API|

## 4 · Contact enrichment (compliant B2B)
|41|Hunter.io|25+50/mo|WIRED|
|42|Snov.io|50/mo|SIGNUP|
|43|Anymailfinder|50/mo|SIGNUP|
|44|Findymail|trial|SIGNUP|
|45|RocketReach|5/mo|SIGNUP|
|46|Skrapp|100/mo|SIGNUP|
|47|ContactOut|100 free|EXT|
|48|Adapt.io|100 free|EXT|
|49|Lusha|5/mo|EXT|
|50|Proxycurl (LinkedIn API, licensed)|50 credits|SIGNUP|
|51|Dropcontact|trial|SIGNUP|
|52|Tomba|50/mo|API|

## 5 · Ad intelligence (who's running ads)
|53|Pixel detector (built)|unlimited|WIRED|
|54|Job-board intent scanner (built)|unlimited|WIRED|
|55|Meta Ad Library API|free|WIRED|
|56|Google Ads Transparency|free (web)|API|
|57|TikTok Creative Center|free|WIRED|
|58|LinkedIn Ad Library|free (web)|API|
|59|Apify Meta Ads actor|$5 credit|SIGNUP|
|60|Apify Google Ads actor|$5 credit|SIGNUP|
|61|BuiltWith (single domain)|free|API|
|62|Wappalyzer OSS|unlimited|WIRED|
|63|BigSpy|limited free|SIGNUP|
|64|Wayback Machine (ad lib snapshots)|unlimited|API|

## 6 · Scraping infrastructure (ToS-respecting)
|65|ScrapingBee|1,000 credits|SIGNUP|
|66|ScraperAPI|1,000/mo|SIGNUP|
|67|Zenrows|1,000 calls|SIGNUP|
|68|Browserless.io|7-day unlimited|SIGNUP|
|69|Crawlee (OSS)|unlimited|API|
|70|Playwright (OSS)|unlimited|API|
|71|Sitemap/robots crawler (built)|unlimited|WIRED|
|72|Schema.org JSON-LD extractor (built)|unlimited|WIRED|
|73|DuckDuckGo HTML|unlimited|WIRED|
|74|Reddit JSON / HN Algolia|unlimited|API|
|75|Claude-in-Chrome (this session)|—|WIRED|

## 7 · CRM / pipeline / journey
|76|Postgres (Neon) journey layer (built)|free|WIRED|
|77|CRM dashboard generator (built)|free|WIRED|
|78|HubSpot|free CRM + MCP|MCP|
|79|Zoho CRM|free 3 users + MCP|MCP|
|80|Close|MCP|MCP (installed plugin)|
|81|Day AI|MCP|MCP|
|82|Notion|free + MCP|MCP (installed plugin)|
|83|Airtable|free tier|API|
|84|Attio|free tier|SIGNUP|

## 8 · Automation / orchestration
|85|n8n Cloud|trial/paid|SIGNUP (you have account)|
|86|Make.com|1,000 ops/mo|SIGNUP|
|87|Pipedream|free tier|SIGNUP|
|88|Zapier|100 tasks/mo|SIGNUP|
|89|Cron-job.org|free|SIGNUP|
|90|GitHub Actions|2,000 min/mo|SIGNUP|
|91|launchd (local, built)|free|WIRED|
|92|Cloudflare Workers + Cron|free tier|WIRED|

## 9 · Messaging / notify
|93|Slack (Salesforce) connector|MCP|MCP (installed plugin)|
|94|Telegram Bot (built)|free|WIRED|
|95|Slack webhook (built)|free|WIRED|

## 10 · Analytics / monitoring
|96|Supermetrics (200+ ad platforms)|MCP|MCP|
|97|Similarweb|MCP|MCP (installed plugin)|
|98|Ahrefs|MCP|MCP (installed plugin)|
|99|Google Search Console API|free|SIGNUP|
|100|Plausible/Umami (OSS analytics)|free|API|

## What's WIRED now (counts)
~28 tools live in the engine. The rest split: ~20 MCP connectors (one-click connect in Cowork), ~6 Chrome extensions (manual install), the remainder free APIs/signups I can wire on your go-ahead.

## Recommended next 10 to activate (highest leverage, all free)
1. Connect **Apollo MCP** (one click) — replaces fragile Chrome enrichment with the licensed API.
2. Activate **Brevo** account (unlocks 9k/mo).
3. Add **Resend + MailerSend** keys (+6k/mo transactional).
4. Verify **Gmail Postmaster Tools** (live spam-rate vs 0.3% line).
5. Connect **Notion MCP** for visual client boards (mirrors the Postgres journey).
6. Connect **Slack MCP** for reply notifications.
7. **Apify** $5 credit — clean Meta/Google/TikTok ad-library scraping.
8. **Sender.net** signup — closes the gap toward 50k/mo (opt-in nurture stream).
9. **GlockApps** — recurring seed-list inbox-placement test.
10. **n8n Cloud** — wire the orchestration backbone (task 65).
