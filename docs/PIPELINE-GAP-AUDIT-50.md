# Full pipeline gap audit · 50 gaps across 10 stages
Honest stage-by-stage audit of the Tamazia acquisition engine. For each stage: current state, the real gaps, tools I can CONNECT (free, API/MCP) and tools to FLAG for you (need your login/signup or paid). Compliance held throughout (no personal-social mass scraping; B2B legitimate-interest).

Legend: ✅ wired · 🔌 I can connect · 🚩 you connect · 💷 paid

---

## Stage 1 · Sourcing (find companies)
Current: GLEIF, Companies House, SEC EDGAR, OSM Overpass live. **Gap: CH bulk = shell-name noise (no website), poor quality.**
Gaps: (1) no ad-runner-first sourcing, (2) no sector×geo targeting at source, (3) directory-site false matches, (4) no dedupe against existing clients, (5) no quality score at ingest.
- 🔌 Connect: OpenCorporates API (500/mo), Google Places API ($200 credit), Yelp Fusion (5k/day), Wikidata SPARQL.
- 🚩 Flag: Apify Google Maps scraper (signup, $5 credit), Clay (you have plugin — connect), PhantomBuster (14-day), Common Room Prospector (you have plugin).
- ✅ Fix shipped: directory-domain exclusion (endole/cqc/opencorporates) added to website discovery.

## Stage 2 · Ad-intent detection (who's spending)
Current: pixel-detector, job-board scanner, Meta/Google/LinkedIn/TikTok ad-library modules. ✅ strong.
Gaps: (6) not run at source (should gate sourcing), (7) no spend-size estimate, (8) Meta Ad Library token expiry, (9) no historical-creative archive, (10) TikTok endpoint drift.
- 🔌 Connect: BuiltWith free single-domain, Wappalyzer OSS, Wayback ad-library snapshots.
- 🚩 Flag: Apify Meta/Google/TikTok ad actors ($5), BigSpy (free tier), SimilarWeb (you have plugin — connect for traffic/spend signal).

## Stage 3 · Enrichment (contacts + brief)
Current: ✅ Hunter LIVE (named contacts + confidence), website scrape, LinkedIn/Insta discovery, S063 Gemini brief.
Gaps: (11) Apollo free API blocked, (12) no phone numbers, (13) no email-verify gate live (NeverBounce 0 credits), (14) single email-source dependency, (15) no decision-maker seniority ranking.
- ✅ Connected: Hunter (live), NeverBounce (wired, awaiting credit refresh).
- 🚩 Flag: Snov.io (50/mo), Anymailfinder (50/mo), Skrapp (100/mo), Proxycurl LinkedIn (50 credits), Apollo paid 💷 (cheapest API tier for scale). Recommended next: sign up Snov + Anymailfinder to stack ~225 free finds/mo.

## Stage 4 · Audit generation (Touch-1 asset)
Current: ✅ audit Worker live at audit.tamazia.co.uk (HTTP 200); 17 scan-ready leads minted; Touch-1 guard blocks if URL doesn't resolve.
Gaps: (16) only leads with personalisation_pointers get real audits, (17) shell leads can't be audited (no site), (18) audit not regenerated on site change, (19) no PageSpeed/Lighthouse real data, (20) no SSL/DNS live re-scan in audit.
- 🔌 Connect: Google PageSpeed Insights API (free), Mozilla Observatory API, SSL Labs API, security-headers.com.
- 🚩 Flag: Ahrefs (you have plugin — connect for real backlink/DA data in audits), SimilarWeb (traffic numbers).

## Stage 5 · Drafting + personalisation
Current: ✅ S063 deep-research Touch 0 + locked Touch 1-3 cadence + Gemini→Groq failover + spam-linter gate.
Gaps: (21) no A/B subject testing live, (22) no per-sector tone tuning, (23) no reply-prediction scoring, (24) Gemini quota ceilings, (25) no multivariate body testing.
- 🔌 Connect: Groq (✅ live failover), OpenRouter free models, Cloudflare Workers AI (free tier).
- 🚩 Flag: lemlist (you registered — for spintax/AB), Instantly/Smartlead (warmup + AB).

## Stage 6 · Sending (deliverability)
Current: ✅ 4 live relays (Mailjet/SendGrid/SMTP2Go + Brevo pending activation), router + failover, alias rotation, List-Unsubscribe, SPF/DKIM/DMARC pass, Mail-Tester 9.4.
Gaps: (26) Brevo not activated, (27) Resend+MailerSend keys empty, (28) no HTTPS one-click unsub endpoint, (29) no Postmaster Tools monitoring, (30) ~25k/mo free ceiling vs 50k target.
- ✅ Connected: 4 relays.
- 🚩 Flag: Activate Brevo (+9k/mo), add Resend + MailerSend keys (+6k/mo), Sender.net (15k/mo), Gmail Postmaster Tools (1 DNS TXT), SendGrid paid 💷 (~£16/50k).

## Stage 7 · Reply handling
Current: ✅ Zoho IMAP poller + S012 14-category classifier + journey write + Slack/Telegram notify.
Gaps: (31) ZOHO_IMAP_APP_PASSWORD not set (poller idle), (32) no auto-draft-reply approval UI in dashboard, (33) no sentiment trend, (34) no meeting-booking auto-link on HOT, (35) no LinkedIn/Insta reply capture.
- 🔌 Connect: Cal.com (✅ have) auto-insert on HOT replies.
- 🚩 Flag: Generate Zoho IMAP app-password (unblocks reply automation), Fireflies/Fathom (you have Fireflies plugin) for call notes.

## Stage 8 · Multi-channel (LinkedIn + Instagram)
Current: ✅ waterfall (email→LinkedIn→Insta), channel_sends queue, dashboard pending tabs + mark-sent→next-touch.
Gaps: (36) manual send only (compliant by design), (37) no per-channel touch 1-3 auto-gen yet, (38) no connection-accepted tracking, (39) no Insta DM templates beyond touch 0, (40) no LinkedIn profile-view warmup.
- 🔌 Connect: build touch 1-3 channel templates (next cycle).
- 🚩 Flag (you operate, compliant): Dux-Soup / LinkedHelper (manual-assist Chrome ext), Instagram via your own account. These are YOUR platform use — engine only tracks.

## Stage 9 · CRM + journey
Current: ✅ Postgres journey layer + admin dashboard (tamazia.co.uk/admin, CF Access + password) + client_journey view.
Gaps: (41) no deal-stage pipeline view, (42) no revenue forecast, (43) no task reminders, (44) no 2-way CRM sync, (45) dashboard read-heavy (mark-sent writes live ✅).
- ✅ Connected: HubSpot, Close MCP (you connected). Day AI available.
- 🔌 Connect: mirror journey to HubSpot via its MCP.
- 🚩 Flag: Notion (you have plugin — visual boards), Airtable (free).

## Stage 10 · Automation / always-on
Current: orchestrator script + launchd plists built. n8n workflow JSON ready.
Gaps: (46) not yet running 24/7 (Oracle VM pending), (47) scheduled-tasks needs interactive approval, (48) no health alerting, (49) no auto-retry dashboard, (50) no central log aggregation.
- ✅ Built: run-engine-cycle.sh + launchd plist (load once).
- 🚩 Flag (PENDING per your call): Oracle free VM 24/7 setup; alternatively GitHub Actions; UptimeRobot (free) for health pings.

---

## The 12 highest-ROI moves (ranked)
1. Generate Zoho IMAP app-password → reply automation goes live.
2. Activate Brevo → +9k/mo sending.
3. Sign up Snov + Anymailfinder → +100 free email finds/mo.
4. Connect Ahrefs plugin → real DA/backlink data in audits (credibility).
5. Connect SimilarWeb plugin → traffic/spend signal for ad-intent.
6. Add Resend + MailerSend keys → +6k/mo.
7. Gmail Postmaster Tools → live spam-rate guard.
8. Oracle VM (or GitHub Actions) → true 24/7.
9. Connect Notion plugin → visual client boards.
10. Apify $5 → clean ad-library scraping.
11. Google PageSpeed API → real audit performance data.
12. Sender.net → close the 50k gap free.
