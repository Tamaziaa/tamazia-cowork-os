# TAMAZIA COWORK OS · LIVE TRACKER
**Updated: 2026-05-17 · Single source of truth for completion status**

## HOW THIS TRACKER WORKS

Each item has a **VERIFICATION CHECK**. The checkbox ticks ONLY when the verification check passes (machine-checkable where possible, manual confirmation where not). Status conventions:

- `[ ]` = TODO (not started)
- `[~]` = DOING (in progress, blocked or partial)
- `[x]` = VERIFIED (verification check passed)
- `[!]` = BLOCKED (waiting on something, blocker noted)

Phase 12 will build the auto-update bash script that nightly runs every verification check and updates this file. Until then, status changes by hand.

**Open Cowork artifact `tamazia-cos-tracker` (when Phase 12 ships) for live colour-coded view.**

---

## PHASE 0 · PRE-FLIGHT APPROVALS (Aman, 30 min)

- [ ] 0.1 Read Section 0 of MASTER-PLAN, confirm all 15 top-line decisions
  - Verify: Aman replies "confirmed" in chat or marks here
- [ ] 0.2 Read COWORK-OS-PURCHASES.md
  - Verify: Aman replies with approval per item
- [ ] 0.3 Approve sender identity stamp "Aman Pareek, International Business Lawyer, Founder Tamazia"
  - Verify: Stored in `signatures/aman.txt` and used in test email
- [ ] 0.4 Confirm tracker location (this file) as single source of truth
  - Verify: Aman acknowledges

**Phase 0 blocker**: Until Aman ticks above, Phases 1-2 can begin in parallel on tasks that don't need approvals.

---

## PHASE 1 · INFRASTRUCTURE TRIAGE

### 1.1 Zoho IMAP / ZeptoMail webhook
- [ ] 1.1.1 Log into mailadmin.zoho.eu (Aman)
  - Verify: Screenshot showing IMAP option visible
- [ ] 1.1.2 If IMAP visible: enable, generate app-specific password, save securely
  - Verify: n8n IMAP test connection succeeds
- [!] 1.1.3 If IMAP requires Premium (your current situation): upgrade founder@ ONLY to £3/month
  - Verify: Zoho billing shows Premium tier, IMAP toggle appears
  - Blocker: Aman approval needed
- [ ] 1.1.4 Alternative: ZeptoMail inbound webhook configured
  - Verify: Test reply to founder@ appears in n8n execution log within 10 seconds
- [ ] 1.1.5 Update n8n W3 trigger to use chosen path
  - Verify: 5 test replies received over 24h, all caught

### 1.2 Test lead seeding
- [ ] 1.2.1 Insert 10 test rows in `leads` table with friendly inboxes
  - Verify: `SELECT COUNT(*) FROM leads WHERE status='test'` returns 10
- [ ] 1.2.2 W2 manual trigger, verify 10 test sends
  - Verify: 10 entries in `sends` table with kind='cold', test lead IDs
- [ ] 1.2.3 W4 manual trigger with next_touch_date=today, verify follow-up
  - Verify: 10 entries with touch=1
- [ ] 1.2.4 Reply from test inbox, verify W3 catches + W6 classifies + W8 surfaces
  - Verify: Slack notification received with reply context

### 1.3 Hard-stop on reply
- [ ] 1.3.1 Patch W4 to check lead.replied before send
  - Verify: Code review shows guard, test lead replied → W4 skips on next cron
- [ ] 1.3.2 W6 sets lead.replied = TRUE on classification (except OOO)
  - Verify: Test reply classified, DB shows updated field
- [ ] 1.3.3 Audit log of skipped sends with reason
  - Verify: `skip_log` table has entries

### 1.4 Rename "audit" to "Regulatory Signal Scan"
- [ ] 1.4.1 Find-replace across email templates
  - Verify: `grep -ri "audit" src/templates/` returns only contextually-correct uses (e.g., "audit log") not customer-facing
- [ ] 1.4.2 Find-replace across W7 subject and body
  - Verify: Same grep on W7 nodes
- [ ] 1.4.3 Find-replace across skill files
  - Verify: Same grep on /skills/
- [ ] 1.4.4 Add compliance disclaimer reference inline where scan is mentioned
  - Verify: All scan references include or link to disclaimer

**Phase 1 done when**: All 1.1-1.4 verified, end-to-end test send→reply→classify→surface→approve→send works.

---

## PHASE 2 · COMPLIANCE AND LEGAL FOUNDATION

### 2.1 ICO registration
- [ ] 2.1.1 Visit ico.org.uk/registration, complete Tier 1 (Aman)
  - Verify: ICO confirmation email received
- [ ] 2.1.2 Pay £40 via direct debit
  - Verify: ICO portal shows Active status
- [ ] 2.1.3 Add registration number to website footer
  - Verify: Visible at tamazia.co.uk in footer
- [ ] 2.1.4 Add to email footer template
  - Verify: Test email includes "ICO Registered: ZA[number]"
- [ ] 2.1.5 Add to audit page footer
  - Verify: Test audit page shows ICO number

### 2.2 EU Article 27 representative
- [!] 2.2.1 Choose provider (recommended: EuropeanRep.com)
  - Verify: Aman picks from PURCHASES doc
  - Blocker: Aman decision
- [ ] 2.2.2 Sign up, pay €299/year prepaid
  - Verify: Provider confirmation, representative address received
- [ ] 2.2.3 Add representative details to Privacy Policy
  - Verify: Visible at tamazia.co.uk/privacy
- [ ] 2.2.4 Add to email footer for EU recipients
  - Verify: Test send to .de address includes EU rep line
- [ ] 2.2.5 Add to audit page footer for EU clients
  - Verify: Test EU audit page shows EU rep

### 2.3 PI insurance
- [!] 2.3.1 Get 3 quotes via Simply Business broker (Aman)
  - Verify: Quotes saved in folder
  - Blocker: Aman to procure
- [ ] 2.3.2 Cross-quote PolicyBee and Anansi directly
  - Verify: Quotes saved
- [ ] 2.3.3 Pick cheapest meeting criteria, declare AI scans + lawyer status
  - Verify: Policy issued
- [ ] 2.3.4 Save policy doc in folder, add certificate
  - Verify: `policies/PI-insurance-2026.pdf` exists

### 2.4 T&Cs and Privacy Policy update
- [ ] 2.4.1 Draft updated T&Cs (Claude)
  - Verify: `drafts/terms-v2026-05.md` created
- [ ] 2.4.2 Draft updated Privacy Policy (Claude)
  - Verify: `drafts/privacy-v2026-05.md` created
- [!] 2.4.3 Aman reviews, sends to legal reviewer
  - Verify: Aman confirms reviewer engaged
  - Blocker: Aman to identify reviewer
- [ ] 2.4.4 Publish to tamazia.co.uk/terms and tamazia.co.uk/privacy
  - Verify: URLs return 200, latest version visible
- [ ] 2.4.5 Footer links from every page
  - Verify: Spot-check 5 pages, footer present

### 2.5 Compliance disclaimer
- [ ] 2.5.1 Finalise language per Section 0.10/0.11
  - Verify: `signatures/disclaimer.txt` created
- [ ] 2.5.2 Inject into compose-body skill
  - Verify: Test email shows disclaimer in footer
- [ ] 2.5.3 Inject into audit page template
  - Verify: Test audit page shows disclaimer in footer + about section
- [ ] 2.5.4 Inject into PDF export
  - Verify: Test PDF page footer shows disclaimer

### 2.6 Framework version registry
- [ ] 2.6.1 Create `framework_versions` table in Neon
  - Verify: Table exists with correct schema
- [ ] 2.6.2 Seed with current frameworks v1.0.0 reviewed by Aman today
  - Verify: SELECT shows all frameworks with today's date
- [ ] 2.6.3 Audit output queries this table
  - Verify: Test audit page shows current version stamp
- [ ] 2.6.4 Quarterly review reminder in Cal.com
  - Verify: Recurring event exists in Cal.com

**Phase 2 done when**: All 2.1-2.6 verified, ICO number live, EU rep published, PI insurance certificate filed, T&Cs updated, disclaimers everywhere, framework registry populated.

---

## PHASE 3 · COMPOSE BODY + REPLY CLASSIFIER

### 3.1 Top 10 compose-body fixes
- [ ] 3.1.1 Sign off as alias first name
  - Verify: Test send from alias "James@" signs off as "James" not "Aman Pareek"
- [ ] 3.1.2 Reply-rate tracking per template variant
  - Verify: Query "show reply rate by variant for sector hotels" returns ranked list
- [ ] 3.1.3 Regional spelling (UK/US)
  - Verify: Test send to US lead uses "optimize", UK uses "optimise"
- [ ] 3.1.4 Language detection skip
  - Verify: Test non-English lead routes to manual queue
- [ ] 3.1.5 Title abbreviation lookup
  - Verify: Test lead with "Mr Aman Pareek KC" renders with KC honorific
- [ ] 3.1.6 Company name normalisation
  - Verify: "Tamazia Ltd" displays as "Tamazia" in body, "Tamazia Ltd" in footer
- [ ] 3.1.7 Time-of-day per sector
  - Verify: Legal sends pre-09:00, hospitality post-15:00 (verified on cron)
- [ ] 3.1.8 Timezone handling per city
  - Verify: London lead receives at 08:30 GMT, NYC at 08:30 EST
- [ ] 3.1.9 Unsubscribe link in footer
  - Verify: Test email has working unsubscribe link
- [ ] 3.1.10 Physical address + ICO + company number in footer
  - Verify: Test email footer has all 3 elements

### 3.2 Reply intent classifier
- [ ] 3.2.1 13 categories defined in `reply_intents` enum
  - Verify: Enum exists in DB
- [ ] 3.2.2 Cloudflare Workers AI classifier built (primary)
  - Verify: Test reply classified within 3 seconds
- [ ] 3.2.3 Claude Haiku fallback for high-confidence required
  - Verify: LEGAL_THREAT category always uses Haiku for ≥0.85 confidence
- [ ] 3.2.4 Confidence <0.7 routes to MANUAL_REVIEW
  - Verify: Ambiguous test reply lands in manual queue
- [ ] 3.2.5 Classification + draft saved to `reply_classifications` table
  - Verify: SELECT shows entries with category, confidence, draft
- [ ] 3.2.6 Routes to W8 with full context
  - Verify: W8 receives test reply with all fields

### 3.3 Auto-draft response templates
- [ ] 3.3.1 130 templates built (13 categories × 10 sectors)
  - Verify: COUNT(*) FROM response_templates = 130
- [ ] 3.3.2 Sample 13 test classifications, drafts generated
  - Verify: Each draft is sector + category appropriate

### 3.4 Hard stop reinforced
- [ ] 3.4.1 W6 marks lead.replied=TRUE except OOO
  - Verify: Test OOO doesn't mark replied, all others do
- [ ] 3.4.2 W4 secondary guard
  - Verify: Code review + test
- [ ] 3.4.3 W2 defensive guard
  - Verify: Code review

### 3.5 Slack notification templates
- [ ] 3.5.1 13 Block Kit templates built
  - Verify: All 13 render correctly in test channel
- [ ] 3.5.2 Color-coded per severity
  - Verify: HOT shows green, HOSTILE shows red
- [ ] 3.5.3 Buttons functional (Approve/Edit/Suppress/Snooze)
  - Verify: Test all 4 buttons return to n8n correctly

### 3.6 Telegram Bot mirror
- [ ] 3.6.1 Bot created via @BotFather (Aman)
  - Verify: Bot exists, token saved
  - Blocker: Aman to create
- [ ] 3.6.2 Aman starts conversation, chat_id retrieved
  - Verify: chat_id stored
- [ ] 3.6.3 n8n sends test notification
  - Verify: Telegram message received with markdown

**Phase 3 done when**: 20 sample replies classified ≥90% accurate, 0% LEGAL_THREAT miscategorised, all templates render, hard stop verified end-to-end.

---

## PHASE 4 · WARMUP V6 WITH REAL REPLIES

### 4.1 Reply-from-receiver (W1b)
- [ ] 4.1.1 W1b workflow built
  - Verify: Workflow exists, executes on 30-min cron
- [ ] 4.1.2 Detects warmup-flagged incoming via body_hash
  - Verify: Test detected within 1 cron cycle
- [ ] 4.1.3 70% probability reply generation
  - Verify: 1000 simulated runs, replies ~700
- [ ] 4.1.4 Reply scheduled 4-24h later
  - Verify: Time delays observed
- [ ] 4.1.5 50 reply templates × 6 categories built
  - Verify: 300 entries in `warmup_reply_templates`
- [ ] 4.1.6 Receiver marks Important/Starred
  - Verify: Manual inbox check on test alias shows starred

### 4.2 5 real Gmail seedlist
- [!] 4.2.1 Aman generates app-specific passwords for 5 Gmails
  - Verify: Passwords stored securely in n8n
  - Blocker: Aman action
- [ ] 4.2.2 Added to aliases table type='seedlist'
  - Verify: SELECT shows 5 rows
- [ ] 4.2.3 Included in W1b reply rotation
  - Verify: Code review + test run
- [ ] 4.2.4 "Warmup Engage" Cowork skill built for manual triggers
  - Verify: Skill callable, triggers actions on real Gmail

### 4.3 Anti-degradation throttle (no email if risk)
- [ ] 4.3.1 `alias_health` table built
  - Verify: Table schema correct
- [ ] 4.3.2 Hourly health poll cron
  - Verify: Latest poll within 65 minutes
- [ ] 4.3.3 Status transitions logic active
  - Verify: Test alias bounced 3x → status=rest within 1h
- [ ] 4.3.4 W2/W4 only pick status=active
  - Verify: Code review + test
- [ ] 4.3.5 Telegram alert on status flip
  - Verify: Test transition triggers notification

### 4.4 Anti-fingerprint v6
- [ ] 4.4.1 All 10 anti-fingerprint additions implemented
  - Verify: Code review per item
- [ ] 4.4.2 Collision rate 0% across 30-run simulation
  - Verify: Python sim script returns 0%

### 4.5 Mail-tester automation
- [ ] 4.5.1 Per-alias mail-tester address assigned
  - Verify: 95 unique addresses in `alias_mail_tester` table
- [ ] 4.5.2 Weekly send + score scrape
  - Verify: `alias_health` rows updated weekly
- [ ] 4.5.3 Alert if score <8
  - Verify: Test deliberately low score triggers Telegram

**Phase 4 done when**: All 4.1-4.5 verified, reply-from-receiver active, 5 Gmail seedlist integrated, all aliases ≥8/10 mail-tester.

---

## PHASE 5 · AUDIT MICRO-SITE LUXURY BUILD

### 5.1 Astro dynamic route
- [ ] 5.1.1 Route src/pages/audit/[slug]/[hash].astro created
  - Verify: Test URL returns 200
- [ ] 5.1.2 Fetches from /api/proposals/[hash]
  - Verify: Test API returns JSON
- [ ] 5.1.3 8-char hash unguessable
  - Verify: Code review of hash generator
- [ ] 5.1.4 180-day expiry enforced
  - Verify: Test with expired hash returns 410 Gone

### 5.2 Luxury design language
- [ ] 5.2.1 Color palette implemented
  - Verify: Visual check against spec
- [ ] 5.2.2 Typography loaded (Cormorant + Inter)
  - Verify: Font check in browser
- [ ] 5.2.3 Hero section animations smooth
  - Verify: Manual test on iPhone 12
- [ ] 5.2.4 Section transitions fade-up
  - Verify: Manual scroll test
- [ ] 5.2.5 Performance budget met (LCP <1.5s)
  - Verify: Lighthouse score
- [ ] 5.2.6 Mobile-first verified
  - Verify: Manual test on iOS + Android

### 5.3 All 10 sections built
- [ ] 5.3.1 Cover
- [ ] 5.3.2 Three Findings
- [ ] 5.3.3 Current vs After Tamazia table (animated)
- [ ] 5.3.4 Compliance signal inventory
- [ ] 5.3.5 SEO opportunity sizing
- [ ] 5.3.6 Competitive benchmark
- [ ] 5.3.7 Sector case study
- [ ] 5.3.8 Investment tiers
- [ ] 5.3.9 Calendly + QR
- [ ] 5.3.10 About this scan / disclaimer
  - Verify each: visible on test audit page, renders correctly

### 5.4 QR codes
- [ ] 5.4.1 Every section has anchor
  - Verify: Anchor links work
- [ ] 5.4.2 QR codes generated for each section in PDF
  - Verify: PDF QR scans to correct anchor
- [ ] 5.4.3 Master QR to homepage
  - Verify: Scans to tamazia.co.uk

### 5.5 Engagement tracking
- [ ] 5.5.1 Tracking pixel on page load
  - Verify: Test visit logs to audit_events
- [ ] 5.5.2 Section dwell time logged
  - Verify: 30s on pricing section appears in DB
- [ ] 5.5.3 Scroll depth logged
  - Verify: 75% scroll appears
- [ ] 5.5.4 CTA clicks tracked
  - Verify: Calendly click logged
- [ ] 5.5.5 PDF download tracked
  - Verify: Download click logged
- [ ] 5.5.6 Return visits logged
  - Verify: Second visit creates new event
- [ ] 5.5.7 High-intent triggers Slack
  - Verify: Pricing dwell >2min sends notification

### 5.6 PDF export
- [ ] 5.6.1 Download button visible
  - Verify: Button present
- [ ] 5.6.2 Playwright render within 10s
  - Verify: Timing measurement
- [ ] 5.6.3 PDF preserves design
  - Verify: Visual check
- [ ] 5.6.4 QR codes in PDF work
  - Verify: Scan test
- [ ] 5.6.5 PDF stored in R2
  - Verify: R2 bucket has file

### 5.7 Calendly embed
- [ ] 5.7.1 Inline widget in section 9
  - Verify: Widget loads
- [ ] 5.7.2 Prefill with lead context
  - Verify: Name/company prefilled
- [ ] 5.7.3 Booking webhook updates lead.status
  - Verify: Test booking flips status

### 5.8 Re-engagement triggers
- [ ] 5.8.1 No-open after 5 days check-in
  - Verify: Test lead, observe trigger
- [ ] 5.8.2 Open-no-book after 7 days follow-up
  - Verify: Same
- [ ] 5.8.3 Pricing dwell >2min alert
  - Verify: Same
- [ ] 5.8.4 Multiple returns mark HIGH_INTENT
  - Verify: Test 3 visits, flag set

**Phase 5 done when**: Test audit page deployed, scores ≥90 mobile Lighthouse, all sections render, animations smooth, tracking events flow.

---

## PHASE 6 · 50-POINTER PERSONALISATION + FREE LLM

### 6.1 Personalisation engine architecture
- [ ] 6.1.1 Skill `personalisation-engine` built
  - Verify: Skill callable, returns 50-pointer JSON
- [ ] 6.1.2 5 sub-engines (one per bucket)
  - Verify: Each callable independently
- [ ] 6.1.3 Stored on lead.personalisation_pointers
  - Verify: DB field populated
- [ ] 6.1.4 W9 expansion: runs daily top 100
  - Verify: Daily cron output

### 6.2 5 buckets × 10 pointers
- [ ] 6.2.A Website signals bucket (10 pointers)
- [ ] 6.2.B Compliance signals bucket (10 pointers)
- [ ] 6.2.C SEO audit bucket (10 pointers)
- [ ] 6.2.D Ad intelligence bucket (10 pointers)
- [ ] 6.2.E Public records bucket (10 pointers)
  - Verify each: test lead produces ≥9 of 10 pointers populated

### 6.3 Free LLM hosting stack
- [ ] 6.3.1 Cloudflare Workers AI account configured
  - Verify: API key in n8n, test call succeeds
- [ ] 6.3.2 DeepSeek V3 API as fallback
  - Verify: Aman approves £15/mo, key configured, test call
- [ ] 6.3.3 Groq free tier for classification
  - Verify: Account, key, test call
- [ ] 6.3.4 Routing logic: Cloudflare first, DeepSeek overflow
  - Verify: Quota exhaustion test triggers fallback

### 6.4 Audit pre-generation timing
- [ ] 6.4.1 W9 runs night before
  - Verify: 23:00 cron fires
- [ ] 6.4.2 Audit pre-built before 08:30
  - Verify: 80% of leads have audit URL by 08:30
- [ ] 6.4.3 W2 includes link if present
  - Verify: Test send includes URL when ready

### 6.5 Send link without spam triggers
- [ ] 6.5.1 Plain text URL only
- [ ] 6.5.2 One link per email max
- [ ] 6.5.3 Own domain only (tamazia.co.uk)
- [ ] 6.5.4 Mid-body placement
- [ ] 6.5.5 No HTML wrapping
- [ ] 6.5.6 Subject line clean
- [ ] 6.5.7 Mail-tester per template ≥9
  - Verify: All 7 enforced in code, mail-tester scores pass

**Phase 6 done when**: 50 specific pointers per test lead verified, free LLM stack operational, links land in inbox.

---

## PHASE 7 · LEAD SOURCING 50-API ENGINE

### 7.1 Tier 1 APIs (10 first)
- [ ] 7.1.1 Companies House UK integrated
- [ ] 7.1.2 OpenCorporates integrated
- [ ] 7.1.3 SEC EDGAR integrated
- [ ] 7.1.4 Hunter.io free integrated
- [ ] 7.1.5 Snov.io free integrated
- [ ] 7.1.6 Apollo free integrated
- [ ] 7.1.7 Voila Norbert integrated
- [ ] 7.1.8 Google Places integrated
- [ ] 7.1.9 Meta Ad Library integrated
- [ ] 7.1.10 Google Ads Transparency integrated
  - Verify each: API credential stored, test call returns data

### 7.2 Tier 2 APIs (next 20)
- [ ] 7.2.1 LinkedIn Ad Library
- [ ] 7.2.2 TikTok Creative Center
- [ ] 7.2.3 Snapchat Ad Library
- [ ] 7.2.4 X Ads Transparency
- [ ] 7.2.5 Pinterest Ad Library
- [ ] 7.2.6 Reddit Ad Library
- [ ] 7.2.7 EU registries × 6 (Bundesanzeiger, INFOGREFFE, etc.)
- [ ] 7.2.8 UAE DIFC and ADGM
- [ ] 7.2.9 Hong Kong and Singapore registries
- [ ] 7.2.10 Yelp Fusion
- [ ] 7.2.11 TripAdvisor
- [ ] 7.2.12 Foursquare
- [ ] 7.2.13 OpenStreetMap
- [ ] 7.2.14 RocketReach
- [ ] 7.2.15 FindThatLead
- [ ] 7.2.16 AnyMail Finder
- [ ] 7.2.17 Wiza
- [ ] 7.2.18 Lusha
- [ ] 7.2.19 ContactOut
- [ ] 7.2.20 SignalHire

### 7.3 Sourcing cron (W12)
- [ ] 7.3.1 W12 built, 05:00 trigger
  - Verify: Cron fires daily
- [ ] 7.3.2 Reads sourcing_schedule rotation
  - Verify: Today's sectors logged
- [ ] 7.3.3 Parallel API calls per cell
  - Verify: Multiple API calls within seconds
- [ ] 7.3.4 Dedup against leads + DNC
  - Verify: Test duplicate not re-added
- [ ] 7.3.5 6-factor scoring active
  - Verify: New leads have priority_score
- [ ] 7.3.6 Top 100 inserted with status=pending
  - Verify: Daily count = 100 ±10

### 7.4 Find-every-email
- [ ] 7.4.1 Team page scraper
- [ ] 7.4.2 Hunter domain search
- [ ] 7.4.3 Apollo by domain
- [ ] 7.4.4 LinkedIn employees scrape
- [ ] 7.4.5 Crunchbase team
- [ ] 7.4.6 Companies House PSC
- [ ] 7.4.7 6-format candidate generator
- [ ] 7.4.8 SMTP verifier (own server)
- [ ] 7.4.9 Cross-verification with Hunter+Mailboxlayer
- [ ] 7.4.10 Seniority scoring
  - Verify: Test company produces 5-20 verified contacts ranked

### 7.5 LinkedIn + Instagram IDs
- [ ] 7.5.1 LinkedIn profile URL collection
  - Verify: 70% of leads have URL
- [ ] 7.5.2 Instagram brand handle collection
  - Verify: 60% of brand-relevant leads have handle
- [ ] 7.5.3 Founder Instagram for personal brand sector
  - Verify: 80% of personal-brand leads have founder handle

### 7.6 Unified tracking
- [ ] 7.6.1 Neon leads table as primary truth
  - Verify: All sources insert here
- [ ] 7.6.2 Cowork artifact dashboard
  - Verify: Loads, shows live pipeline by sector
- [ ] 7.6.3 Slack daily digest 07:30
  - Verify: Daily message fires
- [ ] 7.6.4 Telegram P0 leads ready
  - Verify: High-priority notifications fire
- [ ] 7.6.5 Optional Google Sheet mirror
  - Verify: Sheet refreshes daily

### 7.7 NeverBounce verification
- [!] 7.7.1 Sign up, approve £15-20/month (Aman)
  - Verify: Account active
  - Blocker: Aman to approve and sign up
- [ ] 7.7.2 Stage 3 verification on top-tier leads
  - Verify: Top-tier leads pass through, 95% accuracy
- [ ] 7.7.3 Bounce rate on first sends <2%
  - Verify: After 100 cold sends, measure

**Phase 7 done when**: 100 verified leads/day flowing, all 30 APIs operational, dashboard live, bounce rate <2%.

---

## PHASE 8 · AD INTELLIGENCE SCRAPER

### 8.1 10 platform scrapers
- [ ] 8.1.1 Meta Ad Library
- [ ] 8.1.2 Google Ads Transparency
- [ ] 8.1.3 LinkedIn Ad Library
- [ ] 8.1.4 TikTok Creative Center
- [ ] 8.1.5 Snapchat Ad Library
- [ ] 8.1.6 X/Twitter Ads Transparency
- [ ] 8.1.7 Pinterest Ad Library
- [ ] 8.1.8 Reddit Ad Library
- [ ] 8.1.9 SimilarAds.com
- [ ] 8.1.10 AdLibrary.io
  - Verify each: scraper runs, results stored

### 8.2 Aggregation pipeline
- [ ] 8.2.1 04:00 daily cron
  - Verify: Fires
- [ ] 8.2.2 Per-sector run
  - Verify: All 10 platforms queried per active sector
- [ ] 8.2.3 Company name extraction + dedup
  - Verify: No duplicates across platforms
- [ ] 8.2.4 Cross-platform high-signal flagging
  - Verify: Multi-platform companies get priority boost
- [ ] 8.2.5 Pass to Phase 7 sourcing
  - Verify: Companies feed into lead enrichment
- [ ] 8.2.6 ad_intelligence JSON on lead row
  - Verify: DB field populated

### 8.3 Personalisation pointers
- [ ] 8.3.1 Bucket D consistently populated
  - Verify: ≥80% of leads with ad activity have ad-specific pointers in audit

**Phase 8 done when**: All 10 scrapers run, ≥30% of sourced leads have ad_intelligence, audits cite specific ad creative.

---

## PHASE 9 · LINKEDIN + INSTAGRAM + CAL.COM

### 9.1 LinkedIn drafter v2
- [ ] 9.1.1 All 50 compose-body standards applied
  - Verify: Generated message passes same checks as email
- [ ] 9.1.2 Mutual connection leverage
  - Verify: Test 2nd-degree connection surfaces
- [ ] 9.1.3 Recent post engagement comment generated
  - Verify: Test produces relevant comment
- [ ] 9.1.4 Profile view trigger
  - Verify: Browser action recorded
- [ ] 9.1.5 Voice note text generated
  - Verify: Aman gets script to record
- [ ] 9.1.6 Group memberships referenced
  - Verify: Shared groups noted in message
- [ ] 9.1.7 Three-tier sequence built
  - Verify: 300/500/1900 char versions all generated

### 9.2 Instagram DM drafter
- [ ] 9.2.1 Skill compose-instagram-dm built
  - Verify: Callable, returns 3-tier
- [ ] 9.2.2 Sector tone calibration
  - Verify: Hospitality casual vs legal reserved verified on sample
- [ ] 9.2.3 No links in first message
  - Verify: Code enforces
- [ ] 9.2.4 Recent post reference
  - Verify: Test produces specific reference
- [ ] 9.2.5 Stored in outreach_drafts JSON
  - Verify: DB field populated

### 9.3 Slack notification with all 3
- [ ] 9.3.1 Template includes all 3 drafts
  - Verify: Test notification shows email + LinkedIn + Instagram
- [ ] 9.3.2 Buttons for each channel
  - Verify: All 5 buttons work
- [ ] 9.3.3 Logged which channel used
  - Verify: outreach_log table updated

### 9.4 Cal.com integration
- [!] 9.4.1 Aman signs up for Cal.com free tier
  - Verify: Account active
  - Blocker: Aman to sign up
- [ ] 9.4.2 Webhook configured to n8n
  - Verify: Test booking triggers webhook
- [ ] 9.4.3 Lead.status updates on booking
  - Verify: Test changes DB
- [ ] 9.4.4 Pre-call brief auto-generated
  - Verify: Test produces brief
- [ ] 9.4.5 Brief sent 60 min before
  - Verify: Timing correct
- [ ] 9.4.6 Post-call outcome prompt
  - Verify: Slack/Telegram prompt fires after Cal.com end time
- [ ] 9.4.7 Google Calendar sync
  - Verify: Cal.com bookings appear in Aman's GCal

### 9.5 LinkedIn Sales Navigator trial
- [!] 9.5.1 Aman starts 30-day trial
  - Verify: Trial active
  - Blocker: Aman decision
- [ ] 9.5.2 Day 28 evaluation
  - Verify: Cowork generates ROI report

**Phase 9 done when**: All 3 channels generate drafts per lead, Cal.com fully wired, decision on Sales Nav made by day 28.

---

## PHASE 10 · SECTOR INTELLIGENCE + 500-TITLE MATRIX

### 10.1 500-title catalogue
- [ ] 10.1.1 500 candidates documented across 10 families
  - Verify: Excel file with 500 rows
- [ ] 10.1.2 6-factor scoring applied
  - Verify: Score column populated
- [ ] 10.1.3 Top 200 selected with reasoning
  - Verify: Selected_for_v1 column marked
- [!] 10.1.4 Aman reviews and approves
  - Verify: Aman tick or edits
  - Blocker: Aman review

### 10.2 200-city × 5-jurisdiction matrix
- [ ] 10.2.1 200 cities catalogued
  - Verify: Table populated
- [ ] 10.2.2 Stored as target_cities with full metadata
  - Verify: All columns populated

### 10.3 Sourcing rotation
- [ ] 10.3.1 Rotation logic per S1.2
  - Verify: 10 firm-types/day per jurisdiction
- [ ] 10.3.2 Cell tracking last_queried
  - Verify: Updated per query
- [ ] 10.3.3 Quarterly re-query
  - Verify: Schedule exists

### 10.4 20-sector × 50-source intelligence
- [ ] 10.4.1 1000 sources catalogued
  - Verify: sector_sources table has 1000 rows
- [ ] 10.4.2 Quarterly refresh cron
  - Verify: Schedule
- [ ] 10.4.3 Consumed by content generation
  - Verify: Sample content cites recent source

### 10.5 Sector-pitch library v2
- [ ] 10.5.1 20 sectors with all 9 fields
  - Verify: COUNT * 9 = 180 fields populated
- [ ] 10.5.2 A/B variants for cold approach
  - Verify: Permission + value-first + curiosity variants per sector

**Phase 10 done when**: All catalogues built, rotation active, sector intelligence consumed by content + audit + pitches.

---

## PHASE 11 · CHIEF OF STAFF + NOTIFICATIONS

### 11.1 Telegram Bot
- [!] 11.1.1 Aman creates via @BotFather
  - Verify: Token + chat_id stored
  - Blocker: Aman 5-minute action
- [ ] 11.1.2 n8n send-message tested
  - Verify: Message arrives

### 11.2 Notification routing
- [ ] 11.2.1 P0/P1/P2 logic implemented
  - Verify: Sample events route correctly
- [ ] 11.2.2 Morning digest 07:00
  - Verify: Daily fires with overnight summary
- [ ] 11.2.3 Evening digest 18:00
  - Verify: Daily fires

### 11.3 120-second recall
- [ ] 11.3.1 Countdown visible in Slack
  - Verify: Test shows countdown
- [ ] 11.3.2 Cancel button works
  - Verify: Cancel logged, send halted
- [ ] 11.3.3 After countdown, send fires
  - Verify: Timed test

### 11.4 W11 Chief of Staff scan
- [ ] 11.4.1 Mon/Thu 07:00 cron
  - Verify: Fires
- [ ] 11.4.2 8 scan categories run
  - Verify: All 8 produce data
- [ ] 11.4.3 30 gaps ranked + proposed fixes
  - Verify: Output structured
- [ ] 11.4.4 Posted to Slack #aman-cos
  - Verify: Channel exists, message posts
- [ ] 11.4.5 Telegram summary
  - Verify: Sent

### 11.5 Decision log
- [ ] 11.5.1 decisions table built
  - Verify: Schema correct
- [ ] 11.5.2 All phase decisions logged
  - Verify: Seed entries present
- [ ] 11.5.3 Cowork artifact for review
  - Verify: Loads, displays

### 11.6 Slack ↔ n8n integration
- [!] 11.6.1 Slack app installed (Aman)
  - Verify: App in workspace
  - Blocker: Aman action
- [ ] 11.6.2 Bidirectional wired
  - Verify: Buttons return to n8n
- [ ] 11.6.3 Slash commands functional
  - Verify: /tamazia-pipeline returns data

**Phase 11 done when**: All notifications routed, recall countdown works, chief-of-staff scan runs Mon/Thu, decision log live.

---

## PHASE 12 · DEPLOY BULLETPROOFING + TRACKER ARTIFACT

### 12.1 Pre-commit hooks
- [ ] 12.1.1 Husky + lint-staged installed
- [ ] 12.1.2 ESLint
- [ ] 12.1.3 Astro check
- [ ] 12.1.4 Secret scanner
- [ ] 12.1.5 License checker
  - Verify all: deliberately broken commit blocked

### 12.2 CI pre-build
- [ ] 12.2.1 npm audit fix
- [ ] 12.2.2 Dependency diff
- [ ] 12.2.3 Unit tests
  - Verify: Vulnerability or test fail blocks CI

### 12.3 Visual regression
- [ ] 12.3.1 Playwright captures
- [ ] 12.3.2 Baseline in R2
- [ ] 12.3.3 Diff threshold 5%
- [ ] 12.3.4 PR comment with diff
  - Verify: Deliberate layout break blocked

### 12.4 Smoke test
- [ ] 12.4.1 Preview URL deploy
- [ ] 12.4.2 Curl routes
- [ ] 12.4.3 Lighthouse gate
  - Verify: Smoke fail blocks deploy

### 12.5 Canary deploy
- [ ] 12.5.1 10% traffic split
- [ ] 12.5.2 2-minute monitoring
- [ ] 12.5.3 Auto-rollback on >1% 5xx
  - Verify: Test break triggers rollback

### 12.6 Synthetic monitoring
- [ ] 12.6.1 UptimeRobot 50 monitors set
- [ ] 12.6.2 Telegram alerts on 2 fails
  - Verify: Simulated downtime alerts

### 12.7 Tracker Cowork artifact
- [ ] 12.7.1 Artifact tamazia-cos-tracker built
  - Verify: Loads in Cowork
- [ ] 12.7.2 Reads this MD + Neon
  - Verify: Status pulled from both
- [ ] 12.7.3 All status conventions visible
  - Verify: Colors render
- [ ] 12.7.4 Re-runs verification on load
  - Verify: Stale status flips on re-check
- [ ] 12.7.5 Per-phase progress bars
  - Verify: Render correctly
- [ ] 12.7.6 Filter + search functional
  - Verify: Manual test

### 12.8 Nightly tracker update script
- [ ] 12.8.1 Bash script built
- [ ] 12.8.2 n8n cron nightly
- [ ] 12.8.3 Updates this MD file
- [ ] 12.8.4 Commits + pushes
- [ ] 12.8.5 Slack/Telegram on status flip
  - Verify: Test flip triggers notification

**Phase 12 done when**: Deploy bulletproofed, tracker auto-updates nightly, status visible in Cowork artifact.

---

## PHASE 13 · CONTINUOUS IMPROVEMENT (Ongoing)

### Daily checks
- [ ] 13.1 All 12 workflows execute ≥95% success rate
- [ ] 13.2 Daily digest fires 07:00 + 18:00

### Weekly checks (Sunday)
- [ ] 13.3 Pipeline health review run
- [ ] 13.4 Template variant retirements
- [ ] 13.5 Mail-tester all aliases ≥8.5 avg
- [ ] 13.6 Bounce rate <2% all relays

### Bi-weekly
- [ ] 13.7 W11 scan Mon/Thu produces 30 gaps

### Monthly
- [ ] 13.8 Framework version review with Aman
- [ ] 13.9 Sector pitch refresh
- [ ] 13.10 Source verification
- [ ] 13.11 Cost review
- [ ] 13.12 ROI by sector

### Quarterly
- [ ] 13.13 Sector intelligence refresh
- [ ] 13.14 Top-200 firm-type review
- [ ] 13.15 200-city review
- [ ] 13.16 PI insurance renewal
- [ ] 13.17 EU Article 27 renewal
- [ ] 13.18 ICO renewal

### Decision gates
- [ ] 13.19 Day 30: 100/day vs 500/day decision
- [ ] 13.20 Day 60: Smartlead migration decision
- [ ] 13.21 Day 90: LinkedIn Sales Nav decision
- [ ] 13.22 Day 90: GlockApps decision
- [ ] 13.23 Day 180: BIMI/VMC decision

---

## TRACKER SUMMARY

**Total trackable items: ~280 across 13 phases**

Top-line counts (updated by Phase 12 nightly script):
- TODO: 280
- DOING: 0
- BLOCKED: 12 (all awaiting Aman actions)
- VERIFIED: 0

**This tracker is the single source of truth. Cowork will read it. Future you will read it. Anyone joining the team will read it.**
