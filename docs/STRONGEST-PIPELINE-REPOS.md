# Strongest pipeline: repo stack + the full automated workflow (2026-05-23)
Evaluates your 9 repos + adds more, maps each to a pipeline stage, and gives the honest integration path
and the perfect daily reply/touch automation.

## THE ONE INTEGRATION TRUTH
Every repo below except bullmq is a Go/Rust/Python service or binary. Our engine is zero-dependency Node
on GitHub Actions (free, but ~2,000 min/mo and no always-on services). So adopting these = stand up ONE
small always-on box (~$5/mo Hetzner/Pikapod VPS, Docker) where these run and our Node engine calls them.
That same box is what unlocks "200 leads/day per source with full scraping" — the free host cannot.
Recommendation: keep today's free pipeline running; provision the VPS when you want the scale + automation below.

## YOUR 9 REPOS — verdict + role
| Repo | Verdict | Pipeline stage / why |
|---|---|---|
| gosom/google-maps-scraper | **ADOPT (highest)** | VOLUME SOURCING. Returns name + website + phone + email per business → solves "every lead has a website" + email + 200/day in one. Go binary on VPS. |
| searxng | **ADOPT (high)** | FREE SERP. Self-hosted meta-search → replaces SERPER ($50/mo after 2.5k) for resolve-domains + sourcing. Unlimited, £0. Docker. |
| crawl4ai | **ADOPT (high)** | SITE EXTRACTION. JS-aware, LLM-structured scrape → upgrades our regex website-intel for the 10 params at scale + sites that need JS. Python. |
| theHarvester | **ADOPT** | EMAIL/NAME OSINT. Fills the hidden-email gap (firms behind contact forms) via OSINT sources. Python, run per-domain. |
| reacherhq/check-if-email-exists | **ADOPT (pick 1)** | EMAIL VERIFY. Rust + HTTP backend → call from Node to verify before send (MX/SMTP/catch-all/role/disposable). |
| AfterShip/email-verifier | alt to reacher | Same job, Go library. Pick reacher (HTTP API is easier to call). |
| assafelovic/gpt-researcher | **ADOPT (selective)** | PER-LEAD RESEARCH. Deep news/context for high-value leads → richer touch hooks. LLM-heavy, run on top-tier leads only. |
| moj/splink | **ADOPT (at scale)** | DEDUP/ENTITY RESOLUTION. Probabilistic dedupe when volume > a few thousand. Python. Our current dedupe is fine until then. |
| taskforcesh/bullmq | **ADOPT (at scale)** | ORCHESTRATION. Redis job queue → replaces the 30-min cron with real 24/7 throughput + retries/backoff. Node, fits our stack directly. |

## EXTRA REPOS WORTH ADDING
- **BillionMail** (self-hosted mail server) → host our OWN inboxes WITH SMTP creds. This is the escape from
  MailDeck's "no credentials" wall: own inboxes = our engine sends directly, £0, no sequencer. Month-2 own-infra play.
- **Coldflow / OutreachStudio** (open-source sequencers) → self-hosted send + reply handling if we go own-infra
  (pair with BillionMail). Removes PlusVibe entirely once we own the inboxes.
- **Playwright** → headless-browser scraping for the hardest JS sites (crawl4ai uses it under the hood).

## THE STRONGEST PIPELINE (target architecture on the VPS)
1. SOURCE: google-maps-scraper (primary, 200+/day/sector with site+phone+email) + existing OSM + SEC/CH.
2. RESOLVE: searxng (free SERP) for any name-only lead → website.
3. SCRAPE 10 PARAMS: crawl4ai → emails, people+titles, LinkedIn/Instagram/socials, phone, SEO+compliance, news, services.
4. FIND HIDDEN EMAILS: theHarvester OSINT for firms that hide email.
5. VERIFY: reacher HTTP → keep only deliverable emails (bounce protection).
6. DEDUPE: splink (entity resolution) at volume.
7. RESEARCH: gpt-researcher on leads scoring 60+ (deep per-firm hook).
8. SCORE: existing 10-layer quality gate (>=60).
9. AUDIT + RENDER: S025 audit page → S064 7-touch persona-signed copy.
10. ORCHESTRATE: bullmq + Redis runs it all 24/7 with retries; our Node engine is the worker logic.
11. HAND-OFF: export-to-plusvibe.js → CSV → PlusVibe (or, own-infra: BillionMail+Coldflow send directly).

## REPLY AUTOMATION + DAILY TOUCH — the perfect way per budget
**Touches (every day): already automatic.** Once the 7-step sequence is set in the sequencer, it sends
Touch 0-6 at 0/3/7/12/19/28/40 days on its own. Our engine just feeds new leads daily (scheduled export).

**Replies — three tiers (pick by spend):**
- **$37 PlusVibe (no API):** use PlusVibe's INCLUDED "AI Reply Label Detection" — it auto-tags replies
  (interested / not interested / OOO / unsubscribe) in the Unified Inbox. You triage hot ones in ~5 min/day.
  This is the best fully-within-$37 answer. Not zero-touch, but near it.
- **$77 PlusVibe / Smartlead (API + webhooks):** replies POST to our engine → S012 classifier → S013 auto-drafts
  the reply → Slack/Telegram alert → you approve → auto-send. True zero-touch reply automation. RECOMMENDED if
  reply volume justifies it.
- **Own-infra (BillionMail + Coldflow + our engine):** we own send + inbox via IMAP, so the existing
  zoho-imap-poll + S012/S013 loop runs the whole reply cycle ourselves, £0 forever. Biggest setup, lowest run cost.

## 200 LEADS/DAY/SOURCE — honest config
- Batch sizes are env-driven (RESOLVE_BATCH, SCRAPE_BATCH, and per-script LIMIT). On the VPS set them high +
  run bullmq workers continuously → 200+/day/source with full 10-param scraping is realistic.
- On the current free GitHub Actions host this is NOT achievable (minute cap + no persistent services); it
  sustains a few hundred fully-processed leads/day total. The VPS is the unlock. Engine is already modular for it.

## RECOMMENDED NEXT MOVE (ranked)
1. Decide sending: PlusVibe $37 now (capacity ok, AI reply labels) → ship.
2. When ready to scale: ~$5/mo VPS + Docker (searxng + google-maps-scraper + crawl4ai + reacher + bullmq).
   This is the single highest-leverage spend; it makes "automate everything at 200+/day" real.
3. Month-2 own-infra (BillionMail + Coldflow) only if you want to drop MailDeck+PlusVibe entirely for £0 sending.
