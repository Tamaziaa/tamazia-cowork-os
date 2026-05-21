# TAMAZIA COWORK OS · CONNECTOR AND FREE-AI LEVERAGE MAP
**Every external service, plugin, MCP, and AI tool the system uses. Free-first. Spend only where Aman has approved.**

This file maps the leverage layer. The OS itself is local files + n8n on Pikapod + Neon DB. Everything else listed here is an external surface Tamazia connects to, leveraging free tiers wherever possible.

---

## 1. CLAUDE'S OWN CONNECTORS (built-in, leverage immediately)

These are Claude/Cowork's native connectors available in your session. No additional setup needed beyond credentials.

### 1.1 · Slack (via slack-by-salesforce plugin)
**Status**: Plugin installed, needs Slack workspace authentication
**Free**: Yes (Slack free workspace OK for personal/small team)
**Used in**: Phase 11 (notifications, channels, approvals)
**Capabilities Tamazia uses**:
- Post to channels (notifications, daily digests)
- Receive button clicks (approval buttons on reply notifications)
- Slash commands (/tamazia-pipeline, /tamazia-suppress)
- DMs to Aman
**Setup task**: Phase 0.5 (Aman installs Slack app in his workspace)
**Skills it powers**: S012 (reply-intent-classifier surfaces via Slack), S020 (gap-scanner posts to #aman-cos), S056 (slack-channel-manager)

### 1.2 · Telegram Bot (via webhook + HTTP node in n8n)
**Status**: Setup required (Aman creates bot via @BotFather)
**Free**: Yes, unlimited
**Used in**: Phase 11 (mobile notifications, P0 alerts)
**Capabilities Tamazia uses**:
- Push notifications to Aman's phone instantly
- Markdown formatting
- Inline keyboards (approval buttons)
- Slash commands (/status, /pause, /resume, /audit, /override, /escalate)
- File attachments (audit PDFs, contracts)
**Setup task**: Phase 11.1 (Aman creates bot, shares token + chat_id)
**Skills it powers**: S057 (telegram-command-handler), S016 (alias-health alerts), all P0 notifications

### 1.3 · GitHub (via plugin_engineering_github)
**Status**: Plugin available, authentication via OAuth
**Free**: Yes (current free tier sufficient)
**Used in**: Phase 12 (deploy bulletproofing), Phase 13 (continuous ops)
**Capabilities Tamazia uses**:
- Read/write to tamazia-website repo (auto-commits from tracker updates)
- GitHub Actions (existing deploy pipeline)
- Issue creation (for blockers)
- PR comments (visual regression diffs)
**Setup**: Already configured (existing tamazia-website repo lives on GitHub)
**Skills it powers**: Tracker MD auto-commits via nightly-regression.sh

### 1.4 · Notion (via plugin_design_notion, optional)
**Status**: Plugin available
**Free**: Yes (Notion personal free tier)
**Used in**: Phase 10 (sector intelligence storage), Phase 14 (client onboarding pages)
**Capabilities Tamazia uses**:
- Sector intelligence base (10,000 entries across 20 sectors)
- Client onboarding wikis
- Decision log mirror
**Setup task**: Phase 10.4 (Aman creates Notion workspace, shares integration token)
**Skills it powers**: S053 (industry-news-ingester writes to Notion), S040 (onboarding-sequence creates client page)

### 1.5 · Cal.com (via webhook)
**Status**: Setup required (Aman creates Cal.com account)
**Free**: Yes (Cal.com free tier sufficient)
**Used in**: Phase 9 (meeting management)
**Capabilities Tamazia uses**:
- Free unlimited bookings
- Webhook on BOOKING_CREATED
- Google Calendar sync
- Multiple event types (30-min discovery, 60-min strategy)
- Custom availability rules
- Branded booking page
**Setup task**: Phase 9.4 (Aman signs up, configures event types, shares API key)
**Skills it powers**: S048 (Calendly embed via Cal.com), pre-call brief generation

### 1.6 · Linear (via plugin_design_linear, optional)
**Status**: Plugin available
**Free**: Yes (Linear free tier sufficient)
**Used in**: Phase 14 (engineering tasks for Aditya), Phase 15 (incident tracking)
**Capabilities Tamazia uses**:
- Issue tracking for Aditya tasks
- Bug capture
- Sprint planning
**Setup task**: Phase 14.X (if Aditya is engaged, otherwise defer)

---

## 2. MCP PLUGINS IN COWORK (free or free-tier, leverage)

These plugins are visible in your current Cowork session. They have free tiers that Tamazia can leverage.

### 2.1 · Common Room (plugin_common-room_common-room)
**Free tier**: Generous (intent signals, account research)
**Used in**: Phase 7 (lead enrichment), Phase 10 (sector intelligence)
**Capabilities**:
- Company signal data (job postings, tech changes, funding, leadership)
- Contact research (warm/cold scoring)
- Prospector (build account lists)
- Daily digests of relevant company activity
**Setup task**: Phase 7.X (Aman authenticates Common Room)
**Skills it powers**: S004 (research-digest), S034 (company-news-monitor)

### 2.2 · Apollo (plugin_apollo_apollo)
**Free tier**: 50 credits/month, limited but useful
**Used in**: Phase 7 (lead sourcing, enrichment)
**Capabilities**:
- Company search by filters
- Contact email + phone discovery
- Email verification
- Outreach sequence loading (we won't use this, we have our own)
**Setup task**: Phase 7.1.6 (Aman creates Apollo free account)
**Skills it powers**: S028 (sourcing-orchestrator), S029 (find-every-email)

### 2.3 · brand-voice (plugin_brand-voice)
**Status**: Plugin available
**Free**: Yes (own infrastructure)
**Used in**: Phase 3 (compose hardening), Phase 10 (sector pitch refinement)
**Capabilities**:
- Brand voice extraction from existing content
- Style guide enforcement
- Content discovery across Box, Gong, Granola
**Setup task**: Phase 3.X (if Tamazia has existing brand voice docs to analyse)
**Skills it powers**: compose-body voice consistency

### 2.4 · ClickUp / Monday (plugin_productivity_clickup, plugin_productivity_monday)
**Free**: Both have free tiers
**Used in**: deferred for now (we use Cowork TaskCreate as primary)
**Note**: Could mirror tasks to ClickUp/Monday if Aman wants visual project view, but the COWORK TaskList widget handles primary tracking.

### 2.5 · ahrefs (plugin_marketing_ahrefs, optional)
**Status**: Plugin available
**Free**: Limited free tier (Webmaster Tools free for owned sites)
**Used in**: Phase 5 (competitive benchmarking), Phase 10 (SEO intelligence)
**Capabilities**:
- Backlink analysis
- Keyword research
- Content gap analysis
- Competitive intelligence
**Cost**: Free for own site only via Webmaster Tools. Full features require subscription (£89-£299/month).
**Recommendation**: Use free Webmaster Tools for Tamazia.co.uk only. For prospect analysis, use free alternative (Ubersuggest free tier, Google Search Console for connected sites, Semrush free trial cycling).
**Setup task**: Phase 10.X (if Aman approves paid tier later)

### 2.6 · similarweb (plugin_sales_similarweb, plugin_marketing_similarweb)
**Free**: Limited (top-level metrics free, detail paid)
**Used in**: Phase 7 (lead enrichment), Phase 10 (competitive intelligence)
**Capabilities**:
- Estimated traffic per domain
- Top countries by traffic
- Traffic sources breakdown
- Competitor identification
**Cost**: Free tier sufficient for top-level use. Paid £165/month for detail.
**Recommendation**: Free tier only.

### 2.7 · canva (plugin_marketing_canva)
**Free**: Yes (Canva free)
**Used in**: Phase 9 (image generation for personalised creative)
**Capabilities**: 
- Branded graphic generation
- Social card design
- LinkedIn image cards for personalised outreach
**Setup**: Aman's existing Canva account
**Skills it powers**: Visual elements in audit page, LinkedIn graphics

### 2.8 · fireflies (plugin_sales_fireflies)
**Free tier**: 800 minutes/month (very generous)
**Used in**: Phase 14 (call recording + transcription for case studies)
**Capabilities**:
- Auto-records Aman's calls
- AI-summarised meeting notes
- Action item extraction
- CRM sync
**Setup**: Aman authenticates Fireflies, configures recording rules
**Skills it powers**: S045 (case-study-builder), call notes for post-call workflow

### 2.9 · zoominfo (plugin_sales_zoominfo, optional, paid)
**Free**: No, full paid only
**Recommendation**: Skip. Use Apollo + Common Room + Hunter free tiers instead.

---

## 3. FREE AI MODELS (per your S1.7 directive)

Your specific ask: free or near-free AI hosted on n8n. Researched options ranked by cost and quality:

### 3.1 · Cloudflare Workers AI (PRIMARY recommendation)
**Free tier**: 10,000 neurons/day
**Cost beyond free**: $0.011 per 1,000 neurons (very cheap)
**Models available**:
- Llama 3.1 8B Instruct (general purpose)
- Llama 3.3 70B Instruct (highest quality free)
- Mistral 7B Instruct
- Phi-3.5 Mini
- Qwen 2.5 Coder
- Gemma 2 9B
- DeepSeek V3 (via Workers AI)
- Mixtral 8x7B
- Embedding models: bge-small-en, bge-base-en, bge-large-en
- Image models: stable-diffusion-xl, flux-1-schnell
**Latency**: 1-3 seconds (Cloudflare global edge network)
**Integration**: Native Workers binding, also REST API
**Why primary**: Already in your stack (tamazia-website is on Cloudflare), zero setup, generous free tier
**Used by skills**: S008 (personalisation-engine), S012 (reply-intent-classifier), S013 (response-draft-generator), S017 (competitive-benchmark)
**Approval**: Free, no spend approval needed

### 3.2 · Groq Cloud
**Free tier**: 30 requests/minute, 14,400/day
**Cost beyond free**: Generous paid tier (~$0.05/M tokens for Llama 3.1 8B)
**Models available**:
- Llama 3.1 8B Instant
- Llama 3.1 70B Versatile (best quality free)
- Llama 3.3 70B Versatile
- Mixtral 8x7B
- Gemma 2 9B
- Whisper Large v3 (speech-to-text, free)
**Latency**: 200-500ms (fastest on market, Groq's LPU hardware)
**Integration**: OpenAI-compatible API
**Why secondary**: Free tier sufficient for classification volume, much faster than Cloudflare for sub-second responses
**Used by skills**: S012 (reply-intent-classifier, fast paths), S023 (mail-tester-runner uses Whisper for any voice content)
**Approval**: Free, no spend approval needed

### 3.3 · Google Gemini Flash via AI Studio
**Free tier**: 15 requests/minute, 1,500/day (generous)
**Cost beyond free**: $0.075/M input tokens, $0.30/M output (cheapest paid hosted)
**Models available**:
- Gemini 2.0 Flash (1M context window, multimodal)
- Gemini 1.5 Flash 8B (smaller, faster)
- Gemini 1.5 Pro (highest quality, paid)
**Latency**: 1-2 seconds
**Integration**: REST API
**Why tertiary**: Backup when Cloudflare hits quota, 1M context window useful for long documents (audit JSON, contract review)
**Used by skills**: S008 (personalisation overflow), S045 (case-study-builder for long inputs)
**Approval**: Free tier yes. Paid £15-20/month cap if overflow ever needed.

### 3.4 · Hugging Face Inference API
**Free tier**: Rate-limited but unlimited monthly
**Models**: 1000s of models, including Llama, Mistral, Qwen, specialty models
**Latency**: 2-10 seconds (varies by model size and load)
**Integration**: REST API
**Why optional**: Use for specialty tasks (e.g., named entity recognition, sentiment analysis) where dedicated models outperform general LLMs
**Approval**: Free

### 3.5 · OpenRouter (aggregator with free models)
**Free models include**: Meta Llama 3.2, Mistral Nemo, Phi-3, Qwen, several others
**Cost beyond free**: Pay-as-you-go for premium models
**Why optional**: Convenient single API for accessing many models including free ones
**Approval**: Free

### 3.6 · DeepSeek API (overflow option)
**Cost**: $0.27/M input, $1.10/M output (V3); $0.55/M input for R1
**Quality**: Strong, ~85% of Claude Haiku for English structured tasks
**Why considered**: Cheapest paid hosted option for reasoning-heavy tasks
**Approval**: Capped at £15/month per PURCHASES doc

### 3.7 · Claude Haiku (reserved for highest-stakes)
**Cost**: $0.80/M input, $4.00/M output
**Why reserved**: Best quality at acceptable cost for: LEGAL_THREAT classification, HOSTILE classification, contract review, audit final review
**Approval**: Capped at £5/month per PURCHASES doc (already in use)

### 3.8 · Self-hosted Ollama on Pikapod (LAST RESORT)
**Cost**: Bump Pikapod from £20/month to £40-50/month for more CPU
**Models**: Any open-weight (Llama 3.1 8B, Mistral 7B, Phi-3.5, Qwen 2.5)
**Latency**: 5-15 seconds (CPU-only, no GPU)
**Why deferred**: More expensive AND slower than Cloudflare Workers AI. Only consider if Cloudflare quota becomes inadequate AND privacy concerns dictate local hosting.
**Approval**: Not approved unless Cloudflare + Gemini overflow both insufficient

---

## 4. LEAD SOURCING APIS (full 50 from Phase 7)

Categorised by domain and free-tier limits.

### 4.1 · Company registrations (15 APIs)

| API | Free tier | Used for | Skill |
|---|---|---|---|
| Companies House UK | Unlimited free with API key | UK registered businesses by SIC code | S028 |
| SEC EDGAR US | Free unlimited | US public companies, filings | S028 |
| OpenCorporates | 500 requests/month free | Global coverage cross-jurisdiction | S028 |
| INFOGREFFE France | Free for basic info | French companies | S028 |
| Bundesanzeiger Germany | Free basic | German registered businesses | S028 |
| Camera di Commercio Italy | Free basic | Italian companies | S028 |
| Mercantile Registry Spain | Free basic | Spanish companies | S028 |
| MCA India | Free basic | Indian companies (deferred, we don't target India) | S028 |
| UAE DIFC Public Registry | Free | UAE Dubai International Financial Centre | S028 |
| UAE ADGM Public Registry | Free | UAE Abu Dhabi Global Market | S028 |
| Hong Kong Companies Registry | Free | HK companies | S028 |
| Singapore ACRA Bizfile | $0.05/lookup | Singapore companies | S028 |
| ASIC Australia | Free basic | Australian companies | S028 |
| CRO Ireland | Free basic | Irish companies | S028 |
| FCDO Travel Advice + UK GOV business search | Free | Cross-reference | S028 |

### 4.2 · Place-based directories (8 APIs)

| API | Free tier | Used for | Skill |
|---|---|---|---|
| Google Places API | 200/day free, then $17/1k | Local businesses by type + city | S028 |
| Yelp Fusion | 5000/day free | Restaurants, hotels, businesses | S028 |
| Foursquare Places | 100k/month free | Place data + categories | S028 |
| OpenStreetMap Overpass | Free unlimited | All POIs, custom queries | S028 |
| TripAdvisor Content | Free with limits | Hotels, restaurants | S028 |
| Booking.com Affiliate | Free | Hotels API | S028 |
| OpenTable Affiliate | Free | Restaurants | S028 |
| Yell.com scraping | Free with rate limit | UK business directory | S028 |

### 4.3 · Ad intelligence (10 APIs)

| API | Free | Used for | Skill |
|---|---|---|---|
| Meta Ad Library | Free public, no key | Companies running Meta ads | S033 |
| Google Ads Transparency Center | Free public | Companies running Google ads | S033 |
| LinkedIn Ad Library | Free public | LinkedIn ad spenders | S033 |
| TikTok Creative Center | Free public | TikTok ad creative | S033 |
| Snapchat Ad Library | Free public | Snapchat ad spenders | S033 |
| X/Twitter Ads Transparency | Free public | X ad spenders | S033 |
| Pinterest Ad Library | Free public | Pinterest ad spenders | S033 |
| Reddit Ad Library | Free public | Reddit ad spenders | S033 |
| SimilarAds.com | Free aggregator | Cross-platform views | S033 |
| AdLibrary.io | Free aggregator | Cross-platform views | S033 |

### 4.4 · Person and email discovery (12 APIs)

| API | Free tier | Used for | Skill |
|---|---|---|---|
| Hunter.io | 25 searches/month free | Email format + verification | S029 |
| Snov.io | 50 credits/month free | Email discovery | S029 |
| RocketReach | 5/month free | Contact details | S029 |
| Apollo | 50 credits/month free | Person search + email | S029 |
| Voila Norbert | 50 free trial | Email finder | S029 |
| FindThatLead | 5/month free | Lead enrichment | S029 |
| Anymail Finder | 3/month free | Email finder | S029 |
| Wiza | 10/month free | LinkedIn → email | S029 |
| Lusha | 5/month free | Contact details | S029 |
| ContactOut | 5/month free | LinkedIn data | S029 |
| SignalHire | 5/month free | Person search | S029 |
| Clearbit Hunter | Reduced free 2024 | Email finder | S029 |

### 4.5 · Email verification (5 APIs)

| API | Free tier | Used for | Skill |
|---|---|---|---|
| Mailtester.com | Limited free | Quick sanity check | S030 |
| Mailboxlayer | 1000/month free | Programmatic verification | S030 |
| EmailListVerify | 100/day free | Bulk verification | S030 |
| Bouncer | Free trial | High-accuracy verification | S030 |
| Custom SMTP verifier | Free self-hosted | Stage 1 verification | S030 |
| **NeverBounce (paid)** | £15-20/month | Stage 3 top-tier verification | S030 |

---

## 5. NOTIFICATION AND MONITORING APIS (free)

| Service | Free tier | Purpose |
|---|---|---|
| Google Postmaster Tools | Free unlimited | Gmail reputation for owned domain |
| Microsoft SNDS | Free unlimited | Outlook reputation for IP |
| UptimeRobot | 50 monitors free, 5-min checks | Synthetic monitoring |
| StatusCake | 10 monitors free | Alternative synthetic |
| dmarcian | Limited free | DMARC report parsing |
| Talkwalker Alerts | Free | Brand mention monitoring |
| Google Alerts | Free | Topic monitoring |
| Mention (free tier) | 1 alert free | Real-time monitoring |
| NewsAPI | 100 requests/day free | Global news ingestion |
| Google News RSS | Free | News by topic |

---

## 6. STORAGE AND HOSTING (mostly free)

| Service | Free tier | Purpose |
|---|---|---|
| Cloudflare Pages | Unlimited builds free | Tamazia website + audit micro-sites |
| Cloudflare R2 | 10 GB free + 10M class-A ops/month | PDF storage, backups |
| Cloudflare Workers AI | 10k neurons/day free | LLM inference |
| Cloudflare D1 | 5 GB free, 25M reads/day | Backup DB if Neon fails |
| Neon Postgres | 0.5 GB free + 191 compute hours/month | Primary DB |
| Pikapod (n8n hosting) | £20/month (current) | n8n workflow runtime |
| GitHub | Free private repos | Code + tracker MD |
| GitHub Actions | 2000 minutes/month free | CI/CD pipeline |

---

## 7. E-SIGN AND CONTRACT (Phase 14)

Free or trial options for contract execution:

| Service | Free tier | Notes |
|---|---|---|
| Documenso (self-hosted) | Free unlimited | Open source, host on Pikapod |
| DocuSeal | 3 free per month | Free tier sufficient for low volume |
| HelloSign / Dropbox Sign | 3 free per month | Limited |
| DocuSign | Trial only | Paid required for production |
| **Recommendation** | **Documenso self-hosted** | Free, full control, no vendor lock |

---

## 8. INVOICING (Phase 14)

| Service | Free tier | Notes |
|---|---|---|
| Wave | Fully free | Best free invoicing for small biz |
| Zoho Invoice | Free for 1 user | Integrates with Zoho Mail (already in use) |
| FreshBooks | Trial | Paid required |
| Stripe Invoicing | Free, takes payment % | Use only if accepting card |
| **Recommendation** | **Zoho Invoice + Wave** | Zoho integrates, Wave as backup |

---

## 9. CONNECTOR SETUP SEQUENCE BY PHASE

Each connector is set up in the phase where it's first needed. Phase tasks reference the connector by name.

**Phase 0 setup tasks**:
- Telegram Bot creation
- Slack workspace authentication
- Cal.com account creation

**Phase 1 setup tasks**:
- Zoho ZeptoMail webhook (replaces IMAP)

**Phase 2 setup tasks**:
- ICO direct registration
- EuropeanRep.com signup
- Simply Business PI quote process

**Phase 3 setup tasks**:
- Cloudflare Workers AI binding
- Groq API key
- Gemini AI Studio API key

**Phase 6 setup tasks**:
- DeepSeek API key (if approved overflow)

**Phase 7 setup tasks**:
- Companies House API key
- Apollo free account
- Hunter free account
- Snov free account
- All other free APIs (in priority order)
- NeverBounce account (paid £15-20/month)

**Phase 8 setup tasks**:
- Meta Ad Library access (free)
- Google Ads Transparency (free)
- Other ad libraries (free, public)

**Phase 9 setup tasks**:
- Cal.com webhook configured
- LinkedIn Sales Navigator trial (optional, decide day 28)
- Canva account (likely existing)
- Fireflies free account

**Phase 10 setup tasks**:
- NewsAPI free key
- Google News RSS feeds
- Common Room authentication

**Phase 11 setup tasks**:
- Slack channels created (#aman-cos, #tamazia-pipeline, #tamazia-replies, #tamazia-deploys)
- Telegram Bot commands wired

**Phase 12 setup tasks**:
- UptimeRobot 50 monitors
- Cloudflare R2 bucket for visual regression baselines

**Phase 14 setup tasks**:
- Documenso self-hosted setup OR DocuSeal free tier
- Zoho Invoice account
- Wave account (backup)

**Phase 15 setup tasks**:
- Postmaster Tools verification
- Microsoft SNDS registration
- Cloudflare D1 backup DB (optional)

---

## 10. TOTAL CONNECTOR COST

If all free options used and only approved paid items activated:

| Category | Cost |
|---|---|
| All free APIs | £0 |
| Cloudflare Workers AI + R2 + Pages | £0 (within free tiers) |
| Neon Postgres | £0 (within free tier) |
| Pikapod n8n hosting | £20/month (existing) |
| Slack | £0 (free workspace) |
| Telegram | £0 |
| Cal.com | £0 |
| GitHub | £0 |
| Fireflies | £0 |
| Documenso self-hosted | £0 (on Pikapod) |
| Zoho Invoice | £0 |
| Wave | £0 |
| ICO Registration | £40/year |
| Zoho Mail Premium (founder only) | £3/month |
| EU Article 27 representative | €25/month |
| PI Insurance | ~£10/month |
| NeverBounce | £15-20/month |
| DeepSeek API overflow (capped) | £15/month |
| LinkedIn Sales Nav (optional) | £79/month |
| **Total minimum** | **£25-50/month + £40/year** |
| **Total with all optional** | **£100-150/month + £40/year** |

End of CONNECTORS.md.
