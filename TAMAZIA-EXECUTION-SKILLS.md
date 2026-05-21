# TAMAZIA COWORK OS · SKILL CATALOGUE
**58 skills total: 7 existing + 51 new. Every skill specified with trigger, input, output, verification, and dependencies.**

This is the full inventory of skill files Cowork operates with. Each skill is a SKILL.md plus optional supporting scripts in `~/code/tamazia-cowork-skills/{skill-name}/`.

A skill is a reusable capability Cowork can invoke. Skills compose into workflows. The 12 n8n workflows orchestrate these skills.

---

## 1. SKILLS BY CATEGORY

**Compose (drafting)**: 7 skills
**Analysis and classification**: 8 skills
**Audit and proposal**: 5 skills
**Sourcing and research**: 9 skills
**Lifecycle and CRM**: 8 skills (new in v2)
**Monitoring and intelligence**: 8 skills
**Operations and resilience**: 7 skills (new in v2)
**Coordination**: 6 skills

**Total**: 58 skills.

---

## 2. EXISTING SKILLS (v1, kept)

### S001 · compose-body
**Status**: Exists, requires v2 hardening (Phase 3)
**Trigger phrases**: "compose body for {lead}", "write email body for lead {id}"
**Input**: lead_id, touch_number, optional variant_letter
**Output**: `{body, subject, word_count, compliance_pass, personalisation_level, variant_id}`
**Verification**: `check_sql "SELECT body FROM compose_outputs WHERE lead_id = X AND touch = Y" rows_gt_0` AND body passes forbidden-phrase-checker
**Dependencies**: sector-pitch (S002), personalisation-engine (S008), compliance-disclaimer-injector (S009), forbidden-phrase-checker (S010)
**Phase 3 hardening**: Apply 50 fixes (sign off as alias first name, regional spelling, etc.)

### S002 · sector-pitch
**Status**: Exists, requires v2 expansion (Phase 10, 20 sectors)
**Trigger**: "get sector pitch for {sector}"
**Input**: sector_name
**Output**: `{ICP, reg_hook, pain_stat, pricing, subject_options[], body_template, personal_brand_crosssell, permission_variant, value_variant, curiosity_variant}`
**Verification**: `check_sql "SELECT COUNT(*) FROM sector_pitches WHERE sector = X" rows_gt_0`
**Dependencies**: none (terminal)

### S003 · audit
**Status**: Exists at audit.js v3, requires v2 deepening (Phase 5)
**Trigger**: "run audit for {domain}", "generate audit for {company}"
**Input**: domain, optional sector, optional priority
**Output**: Full audit JSON: PageSpeed, schema, compliance flags, competitive benchmark, financial impact calc
**Verification**: `check_http https://tamazia-website.pages.dev/api/audit?domain=X 200 "audit_score"`
**Dependencies**: check-compliance (S015), competitive-benchmark (S017), regulatory-citation (S018)

### S004 · research-digest
**Status**: Exists, requires expansion (Phase 7 to 50 sources)
**Trigger**: "research {company}", "build dossier for {company}"
**Input**: company_name, domain, optional depth
**Output**: Structured dossier with company_size, regulatory_hook, website_signals, personalised_opener_options, tamazia_pitch_hooks
**Verification**: `check_sql "SELECT research_dossier FROM leads WHERE id = X" value_match_complete`
**Dependencies**: 50 APIs in CONNECTORS.md

### S005 · chief-of-staff
**Status**: Exists, requires v2 expansion (Phase 11 cross-pipeline)
**Trigger**: "triage", "draft reply to {contact}", "help me respond"
**Input**: raw message text or named conversation
**Output**: `{urgency, category, draft_reply, notes_for_aman, escalation_to}`
**Verification**: `check_sql "SELECT classification FROM chief_of_staff_actions WHERE id = X" value_match_complete`
**Dependencies**: reply-intent-classifier (S012), response-draft-generator (S013)

### S006 · linkedin-drafter
**Status**: Exists, requires Phase 9 hardening
**Trigger**: "draft LinkedIn for {contact}", "write LinkedIn outreach"
**Input**: lead_id, tier (1/2/3)
**Output**: `{connection_note, follow_up, full_message}` with char counts validated
**Verification**: char counts ≤ 300/500/1900, forbidden phrases check passes
**Dependencies**: research-digest (S004), forbidden-phrase-checker (S010)

### S007 · dnc
**Status**: Exists, requires Phase 15 extension (multi-channel suppression)
**Trigger**: "add {email/domain} to DNC", "suppress {email}", "who's on DNC"
**Input**: email or domain, suppress_level (email/domain/company), reason, channel (email/linkedin/instagram/phone/postal/all)
**Output**: confirmation, propagation status
**Verification**: `check_sql "SELECT * FROM dnc WHERE email = X" rows_gt_0`
**Dependencies**: none (terminal)

---

## 3. NEW SKILLS · COMPOSE GROUP (Phase 3, 9)

### S008 · personalisation-engine
**Status**: NEW, Phase 6
**Trigger**: "personalise for {lead}", auto-triggered by compose-body
**Input**: lead_id
**Output**: 50-pointer JSON across 5 buckets (website, compliance, SEO, ad intel, public records)
**Verification**: pointer count ≥ 45 AND each pointer contains specific verifiable fact (regex: named person OR specific URL OR specific number)
**Dependencies**: research-digest (S004), ad-intelligence-scraper (S033), site-change-detector (S035)
**Implementation**: Skill calls Cloudflare Workers AI first with structured prompt, falls back to Gemini Flash on quota exhaustion, falls back to Claude Haiku for highest-stakes drafts.

### S009 · compliance-disclaimer-injector
**Status**: NEW, Phase 2
**Trigger**: auto-injected on every compose output
**Input**: output_type (email/audit/pdf/linkedin)
**Output**: appropriate disclaimer text positioned correctly
**Verification**: every compose output contains disclaimer text from signatures/disclaimer.txt
**Dependencies**: none (terminal)
**Implementation**: Reads disclaimer.txt, injects at footer position with framework version stamp from framework_versions table.

### S010 · forbidden-phrase-checker
**Status**: NEW, Phase 3
**Trigger**: pre-send linter
**Input**: draft text, channel (email/linkedin/instagram)
**Output**: pass/fail with list of violations
**Verification**: 0 forbidden phrases match in output text
**Dependencies**: none
**Implementation**: Runs regex against forbidden_phrases table (em dashes, "Hope this finds you well", "I'd love to", "Touching base", etc.). Blocks send if any match.

### S011 · subject-line-ab
**Status**: NEW, Phase 5
**Trigger**: compose-body invocation
**Input**: lead_id, sector, touch_number
**Output**: 3 ranked subject variants with A/B test allocation
**Verification**: variant returned exists in template_variants table, allocation logged
**Dependencies**: template-variant-tracker (S014)
**Implementation**: SHA1(lead_id) mod 3 deterministic for touch 0. New variants tested as 10% allocation against winners. Winners promoted after 100 sends.

### S012 · reply-intent-classifier
**Status**: NEW, Phase 3
**Trigger**: W3 reply detected, auto-invoked
**Input**: reply text, full thread history, lead context
**Output**: `{category (13 enum), confidence (0-1), reasoning, suggested_draft}`
**Verification**: classification logged in reply_classifications, confidence ≥ 0.7 OR routes to MANUAL_REVIEW
**Dependencies**: response-draft-generator (S013)
**Implementation**: Cloudflare Workers AI Llama 3.1 8B primary, Claude Haiku for LEGAL_THREAT/HOSTILE (high stakes). 13 categories: HOT_BOOK, HOT_PRICE, WARM_INFO, WARM_TIMING, NURTURE, OBJECTION_BUDGET, OBJECTION_INCUMBENT, OBJECTION_FIT, REDIRECT, OOO, HOSTILE, LEGAL_THREAT, UNSUBSCRIBE.

### S013 · response-draft-generator
**Status**: NEW, Phase 3
**Trigger**: invoked by reply-intent-classifier
**Input**: lead_id, reply_text, category, lead_context
**Output**: full response draft, sector-calibrated, ≤200 words
**Verification**: draft saved to response_drafts table, passes forbidden-phrase-checker
**Dependencies**: forbidden-phrase-checker (S010), sector-pitch (S002)
**Implementation**: 130 templates (13 categories × 10 sectors) stored in response_templates table. Skill picks template, fills personalisation tokens.

### S014 · template-variant-tracker
**Status**: NEW, Phase 3
**Trigger**: every send logged automatically
**Input**: send_id, lead_id, template_variant_id
**Output**: tracked record + reply rate calculation rolling 7d, 30d
**Verification**: every send in sends table has variant_id, weekly retirement of bottom-quartile variants triggers
**Dependencies**: none
**Implementation**: New `template_variants` table (id, sector, touch, variant_letter, body_template, reply_rate_7d, sends_count, active). Weekly cron retires bottom 25% by reply rate, replaces with new candidates from variant pool.

---

## 4. NEW SKILLS · ANALYSIS GROUP

### S015 · check-compliance
**Status**: Exists at check_forbidden_phrases.py, requires v2 expansion (Phase 2)
**Trigger**: "check compliance for {domain}", "run compliance scan"
**Input**: domain OR text content, sector
**Output**: `{pass, violations[], compliance_score, jurisdiction_breakdown}`
**Verification**: scan output saved to compliance_scans table, jurisdiction-specific framework versions cited
**Dependencies**: regulatory-citation (S018), framework_versions table
**Implementation**: 200+ regulatory rules organised by framework + jurisdiction. Each rule has severity (P0/P1/P2), regex pattern, citation URL, exception conditions, false-positive likelihood note.

### S016 · alias-health-monitor
**Status**: NEW, Phase 4
**Trigger**: hourly cron + on-demand
**Input**: alias_id OR all
**Output**: health score 0-100 per alias, status transition recommendations
**Verification**: alias_health table updated hourly, all aliases scored
**Dependencies**: mail-tester-runner (S023), bounce-handler (S024)
**Implementation**: Polls bounce_rate_7d, complaint_rate_7d, open_rate_7d, mail_tester_latest. Auto-transitions status (active → warmup_only → rest → retired) based on thresholds.

### S017 · competitive-benchmark
**Status**: NEW, Phase 5
**Trigger**: invoked by audit
**Input**: domain, sector, target_competitor_count (default 3)
**Output**: 3 competitors with comparison matrix on 10 metrics
**Verification**: competitive_benchmarks table populated with 3+ rows per audit
**Dependencies**: research-digest (S004)
**Implementation**: Identifies competitors via SimilarWeb similar-sites + Ahrefs competing-domains. Compares Core Web Vitals, content depth, backlink quality, schema coverage, mobile UX, trust signals.

### S018 · regulatory-citation
**Status**: NEW, Phase 2
**Trigger**: invoked by compliance and audit
**Input**: violation_type, jurisdiction
**Output**: citation block (statute, section, regulator, recent enforcement example, fine range)
**Verification**: citation table has entry for combination, link to regulator source live
**Dependencies**: framework_versions table
**Implementation**: Curated table of UK ICO, EU EDPB, FCA, SRA, CQC, MHRA, US FTC, UAE PDPL citations. Each entry: full reference, regulator URL, enforcement_examples (link to actual cases).

### S019 · engagement-tracker
**Status**: NEW, Phase 5
**Trigger**: audit page load + every interaction
**Input**: hash, event_type, metadata
**Output**: event logged to audit_events
**Verification**: `check_sql "SELECT COUNT(*) FROM audit_events WHERE hash = X" rows_gt_0`
**Dependencies**: none
**Implementation**: Client-side tracking pixel + Intersection Observer for section dwell + scroll depth listener + CTA click tracker. All events POSTed to /api/track endpoint.

### S020 · gap-scanner
**Status**: NEW, Phase 11
**Trigger**: Mon/Thu 07:00 cron OR manual
**Input**: scan_scope (all/workflow/lead/alias/template)
**Output**: 30 gaps ranked by impact with proposed fixes
**Verification**: scan output posted to Slack #aman-cos within 10 minutes of cron
**Dependencies**: all monitoring skills
**Implementation**: Cross-pipeline scan: workflow errors 72h, stuck leads >7d, replies awaiting response >24h, audits engaged but no booking >5d, aliases <8/10 mail-tester, declining template reply rates, LexQuity contact conflicts.

### S021 · win-loss-analyser
**Status**: NEW, Phase 14
**Trigger**: lead status changes to client OR lost
**Input**: lead_id, outcome (won/lost/lost_reason)
**Output**: analysis JSON: time_to_close, touches_count, channels_used, decisive_factor, learnings
**Verification**: win_loss_records table has entry, monthly aggregate report generated
**Dependencies**: research-digest (S004)
**Implementation**: Captures full deal journey. Identifies pattern: which touches converted, which channels mattered, which sector pitches performed.

### S022 · forecast-builder
**Status**: NEW, Phase 14
**Trigger**: weekly Friday OR manual
**Input**: pipeline_snapshot
**Output**: weighted forecast best/likely/worst, gap-to-quota
**Verification**: forecasts table has entry per week, accuracy vs actuals tracked
**Dependencies**: none
**Implementation**: Stage probabilities: pending 1%, contacted 3%, engaged 8%, replied 18%, call_booked 25%, proposal_sent 40%, negotiating 65%, closed 100%. Multiplied by deal value, summed.

---

## 5. NEW SKILLS · AUDIT AND PROPOSAL GROUP

### S023 · mail-tester-runner
**Status**: NEW, Phase 4
**Trigger**: weekly per alias OR manual
**Input**: alias_id
**Output**: mail-tester score 0-10, detailed breakdown
**Verification**: score logged to alias_health.mail_tester_latest, scrape successful
**Dependencies**: alias-health-monitor (S016)
**Implementation**: Each alias has unique mail-tester address. Sends test email, scrapes result page after 30 sec, parses 0-10 score, stores in DB.

### S024 · bounce-handler
**Status**: NEW, Phase 4
**Trigger**: W5 webhook receives bounce event
**Input**: bounce event JSON (recipient, message_id, bounce_type, reason)
**Output**: action taken (alias_flagged, lead_marked, no_action)
**Verification**: `check_sql "SELECT delivery_status FROM sends WHERE message_id = X" value_match_bounced`
**Dependencies**: alias-health-monitor (S016), dnc (S007)
**Implementation**: Hard bounce → alias bounce_count++ AND lead.status=bounced. Soft bounce → retry in 30 min once. Complaint → DNC immediately.

### S025 · audit-page-builder
**Status**: NEW, Phase 5
**Trigger**: invoked by W7 after audit JSON generated
**Input**: lead_id, audit_json, personalisation_pointers
**Output**: deployed URL at tamazia.co.uk/audit/{slug}/{hash}
**Verification**: `check_http https://tamazia.co.uk/audit/{slug}/{hash} 200 "Tamazia"`
**Dependencies**: audit (S003), personalisation-engine (S008), compliance-disclaimer-injector (S009)
**Implementation**: Astro dynamic route. Generates audit content JSON, commits to repo, triggers GitHub Actions deploy. 180-day expiry tracked. Engagement tracking pixel injected.

### S026 · proposal-pdf-generator
**Status**: NEW, Phase 5
**Trigger**: PDF download button on audit page
**Input**: audit hash
**Output**: PDF stored in Cloudflare R2, signed URL returned
**Verification**: `check_artifact /tmp/proposals/{hash}.pdf 100000`
**Dependencies**: audit-page-builder (S025)
**Implementation**: Playwright print-to-PDF on audit URL. Preserves design with print-optimised CSS. Includes QR codes per section. Stored in R2 bucket with 180-day TTL.

### S027 · proposal-versioning
**Status**: NEW, Phase 5
**Trigger**: audit data refreshed (site changes detected by S035)
**Input**: original_hash, new_audit_data
**Output**: new hash, version pointer
**Verification**: proposal_versions table linked to original
**Dependencies**: site-change-detector (S035), audit-page-builder (S025)
**Implementation**: If lead's site changes materially, regenerate audit, link new version to old. Email notification: "Updated scan available for {Firm}".

---

## 6. NEW SKILLS · SOURCING AND RESEARCH GROUP

### S028 · sourcing-orchestrator
**Status**: NEW, Phase 7
**Trigger**: daily 05:00 cron OR manual
**Input**: sectors[], cities[], jurisdictions[]
**Output**: 100 new leads added to leads table with priority_score
**Verification**: `check_sql "SELECT COUNT(*) FROM leads WHERE created_at > NOW() - INTERVAL '24 hours'" count_eq_100` (±10)
**Dependencies**: 50 APIs from CONNECTORS, find-every-email (S029), email-verifier-3-stage (S030), dnc (S007)
**Implementation**: Reads sourcing_schedule rotation (10 sectors × 1 jurisdiction per day). Calls Companies House, Apollo, Hunter, etc. in parallel. Dedups against leads + dnc. Scores via 6-factor.

### S029 · find-every-email
**Status**: NEW, Phase 7
**Trigger**: invoked per company by sourcing-orchestrator
**Input**: company_domain
**Output**: list of named persons + verified emails, ranked by seniority
**Verification**: 5-20 verified contacts per medium-sized company
**Dependencies**: email-verifier-3-stage (S030)
**Implementation**: Scrapes /team /about /leadership /contact. Hunter domain search. Apollo by domain. LinkedIn employees. Crunchbase team. Companies House PSC. Generates 6 email formats per name. Verifies all.

### S030 · email-verifier-3-stage
**Status**: NEW, Phase 7
**Trigger**: invoked by find-every-email
**Input**: email_address
**Output**: `{valid (bool), confidence (0-1), risk_factors[], catchall_likelihood}`
**Verification**: `check_sql "SELECT verification_status FROM emails WHERE email = X" value_match_verified`
**Dependencies**: NeverBounce (paid), Hunter, Mailboxlayer (free)
**Implementation**: Stage 1: own SMTP check (free, 70% accuracy). Stage 2: Hunter + Mailboxlayer cross-reference (free, 85%). Stage 3: NeverBounce paid (95%, top-tier only).

### S031 · linkedin-profile-finder
**Status**: NEW, Phase 7
**Trigger**: invoked per person by find-every-email
**Input**: first_name, last_name, company_name
**Output**: LinkedIn profile URL OR null
**Verification**: linkedin_url populated on lead row OR explicit "not found" flag
**Dependencies**: none (uses Google search + LinkedIn public profile detection)
**Implementation**: Google site:linkedin.com search "{name} {company}". Parses top result. Returns URL or null. No scraping LinkedIn directly (ToS).

### S032 · instagram-handle-finder
**Status**: NEW, Phase 7
**Trigger**: invoked per company by sourcing-orchestrator
**Input**: company_name, OR person_name (for personal brand sector)
**Output**: Instagram handle OR null
**Verification**: instagram_handle populated OR explicit "not found"
**Dependencies**: none
**Implementation**: Google search + Instagram public profile detection. Validates handle exists by API call. For personal brand sector, looks for founder/principal handle.

### S033 · ad-intelligence-scraper
**Status**: NEW, Phase 8
**Trigger**: daily 04:00 cron
**Input**: sectors[] (today's rotation)
**Output**: ad_intelligence JSON per company found running ads
**Verification**: `check_sql "SELECT COUNT(*) FROM ad_intelligence WHERE created_at > NOW() - INTERVAL '24 hours'" rows_gt_0`
**Dependencies**: Meta Ad Library API, Google Ads Transparency, LinkedIn Ad Library, TikTok Creative Center, X Ads Transparency
**Implementation**: Per-platform scraper. Per-sector query. Cross-references companies across platforms. Multi-platform companies get priority boost. Extracts creative, copy, dates active.

### S034 · company-news-monitor
**Status**: NEW, Phase 10
**Trigger**: hourly cron
**Input**: leads in status IN ('contacted','nurture','replied')
**Output**: news events per company, sentiment tagged
**Verification**: company_news table populated, leads with new news flagged
**Dependencies**: Google News API (free with limits), NewsAPI free tier
**Implementation**: Hourly check for each tracked company. Sentiment: positive (funding, awards, expansion), neutral (leadership change), negative (lawsuit, breach, layoffs). Triggers contextualised follow-up.

### S035 · site-change-detector
**Status**: NEW, Phase 10
**Trigger**: weekly per tracked lead
**Input**: lead_id, domain
**Output**: change detected (yes/no), changed sections
**Verification**: site_changes table has entry per scan, diff stored
**Dependencies**: previous site snapshot
**Implementation**: Headless browser screenshot + DOM hash per page. Compare to last snapshot. If hash differs, mark site changed, trigger audit refresh via proposal-versioning (S027).

### S036 · regulator-watch
**Status**: NEW, Phase 10
**Trigger**: daily 06:00 cron
**Input**: jurisdictions[] (UK, EU, US, UAE)
**Output**: new enforcement actions, regulatory updates, framework changes
**Verification**: regulator_events table populated daily
**Dependencies**: ICO RSS, EDPB RSS, FCA RSS, SRA RSS, CQC RSS, FTC RSS, UAE PDPL bulletin
**Implementation**: Scrapes regulator press releases and enforcement notices. Tags by sector relevance. Triggers content updates and outreach hooks (e.g., "ICO just fined competitor X for Y, we should reach out to firms exposed to Y").

---

## 7. NEW SKILLS · LIFECYCLE GROUP (Phase 14, NEW IN v2)

### S037 · contract-generator
**Status**: NEW, Phase 14
**Trigger**: lead status changes to "verbal_yes"
**Input**: lead_id, agreed_tier, agreed_terms
**Output**: contract document (DOCX or HTML→PDF), unique reference number
**Verification**: contract file exists in policies/ folder, reference logged
**Dependencies**: template contract in templates/contract/
**Implementation**: Fills standardised contract template with deal terms. Includes Tamazia T&Cs, scope, fees, term, termination, IP, confidentiality. Outputs DOCX for e-sign.

### S038 · esign-orchestrator
**Status**: NEW, Phase 14
**Trigger**: contract-generator complete
**Input**: contract_ref, signer_email, signer_name
**Output**: signed contract URL after completion
**Verification**: contract status changes to signed, file stored
**Dependencies**: free e-sign service (recommended: Documenso self-hosted free, or DocuSeal free tier, or DocuSign trial)
**Implementation**: Uploads contract to chosen e-sign service. Sends to client. Webhook on completion. Stores final signed copy in policies/contracts/.

### S039 · invoicing-skill
**Status**: NEW, Phase 14
**Trigger**: contract signed OR monthly cron for retainers
**Input**: lead_id, invoice_amount, invoice_period
**Output**: invoice PDF, sent email, payment tracking
**Verification**: invoice in invoices table, sent_at populated
**Dependencies**: free invoicing (Wave free, Zoho Invoice free for 1 user, FreshBooks trial)
**Implementation**: Generates invoice via chosen tool API. Sends with payment link. Tracks paid status via webhook.

### S040 · onboarding-sequence
**Status**: NEW, Phase 14
**Trigger**: contract signed
**Input**: lead_id
**Output**: onboarding tasks created, welcome email sent, kickoff scheduled
**Verification**: onboarding_record table has entry, all tasks created in client folder
**Dependencies**: Cal.com (S048), contract-generator (S037)
**Implementation**: 30-day structured onboarding. Day 0: welcome email + kickoff Calendly. Day 1: questionnaire sent. Day 7: data access requested. Day 14: audit results presented. Day 21: implementation plan signed off. Day 30: kickoff call.

### S041 · client-success-tracker
**Status**: NEW, Phase 14
**Trigger**: weekly per active client
**Input**: client_id
**Output**: health score (0-100), risk factors, upsell signals
**Verification**: client_health table updated weekly per active client
**Dependencies**: engagement-tracker (S019), invoicing-skill (S039)
**Implementation**: Tracks engagement (logins to portal if any, response rate to comms, deliverables accepted on time). Surfaces risk early.

### S042 · renewal-automation
**Status**: NEW, Phase 14
**Trigger**: 60 days before contract end date
**Input**: client_id
**Output**: renewal proposal, scheduled conversation
**Verification**: renewal_records table has entry, Calendly booking exists
**Dependencies**: forecast-builder (S022)
**Implementation**: 60d out: renewal email + Calendly. 30d out: reminder. 14d out: escalation to Aman direct. 7d out: P0 alert if no progress.

### S043 · upsell-engine
**Status**: NEW, Phase 14
**Trigger**: client-success-tracker signals
**Input**: client_id
**Output**: upsell opportunity identified, draft proposal
**Verification**: upsell_opportunities table has entry
**Dependencies**: client-success-tracker (S041), sector-pitch (S002)
**Implementation**: Identifies expansion based on outcomes (e.g., SEO going well → add compliance retainer; one location succeeding → expand to other locations).

### S044 · referral-capture
**Status**: NEW, Phase 14
**Trigger**: client mentions someone in comms OR explicit referral
**Input**: referrer_id, referred_name, referred_company, referred_context
**Output**: new lead with referred_by populated, intro template drafted
**Verification**: lead.referred_by set, intro_draft saved
**Dependencies**: research-digest (S004)
**Implementation**: Detects referral mentions in client comms. Auto-creates lead with warm-intro context. Drafts referral-acknowledgment + intro request to client.

### S045 · case-study-builder
**Status**: NEW, Phase 14
**Trigger**: 90 days after client launch with positive results
**Input**: client_id
**Output**: case study draft, pending client approval
**Verification**: case_studies table has entry, status='draft_pending_approval'
**Dependencies**: client-success-tracker (S041)
**Implementation**: Pulls metrics from before/after engagement. Drafts narrative. Stores in case_studies. Sends to client for approval. Once approved, publishes to tamazia.co.uk/case-studies.

---

## 8. NEW SKILLS · OPERATIONS RESILIENCE GROUP (Phase 15, NEW IN v2)

### S046 · api-key-rotator
**Status**: NEW, Phase 15
**Trigger**: quarterly OR on security event
**Input**: service_name
**Output**: new key generated and stored, old key revoked, all references updated
**Verification**: api_key_log shows rotation, all systems still working
**Dependencies**: relevant service API
**Implementation**: For each rotatable service, generates new key via API, updates n8n credential, updates .env, revokes old key after 24h grace period.

### S047 · db-backup
**Status**: NEW, Phase 15
**Trigger**: daily 02:00 cron
**Input**: none
**Output**: backup file in R2 + retention metadata
**Verification**: latest backup file exists, size > expected, restore-test succeeds weekly
**Dependencies**: Neon's own backups + R2 storage
**Implementation**: pg_dump of Neon DB. Encrypted with GPG. Uploaded to R2. Retention: 7 daily + 4 weekly + 12 monthly. Weekly restore-test to ephemeral DB to verify backup integrity.

### S048 · disaster-recovery
**Status**: NEW, Phase 15
**Trigger**: P0 incident OR quarterly drill
**Input**: incident_type
**Output**: recovery playbook executed
**Verification**: recovery_runs table logs every drill and incident
**Dependencies**: db-backup (S047), api-key-rotator (S046)
**Implementation**: Documented runbook for: Neon DB loss, n8n Pikapod loss, Cloudflare account compromise, domain hijack, Resend account suspension, Slack/Telegram outage.

### S049 · audit-trail-export
**Status**: NEW, Phase 15
**Trigger**: manual OR on external request (DPIA, legal subpoena, regulator request)
**Input**: date_range, lead_id OR client_id OR all
**Output**: structured export of all actions taken with timestamps
**Verification**: export file exists, signed with timestamp, hash logged
**Dependencies**: all action-logging tables
**Implementation**: Generates immutable PDF/JSON of every action: sends, replies, audits delivered, decisions, manual overrides, status changes. Cryptographically signed.

### S050 · multi-domain-backup-sender
**Status**: NEW, Phase 15
**Trigger**: primary domain reputation drops
**Input**: alert from alias-health-monitor
**Output**: backup domain activated, traffic routed
**Verification**: secondary domain shows sends, primary domain in quarantine
**Dependencies**: alias-health-monitor (S016)
**Implementation**: Holds 2 secondary domains (e.g., tamazia-reach.com, tamazia-mail.com) warmed-up. Activates when primary reputation drops. Automatic transition.

### S051 · ssl-cert-monitor
**Status**: NEW, Phase 15
**Trigger**: daily check
**Input**: domain_list
**Output**: cert expiry status, renewal needed flag
**Verification**: cert_status table updated daily, alerts on <30 days remaining
**Dependencies**: none
**Implementation**: Checks SSL expiry on all owned domains. Cloudflare handles auto-renewal but monitor regardless. Alert 30/14/7/1 day before expiry.

### S052 · gdpr-request-handler
**Status**: NEW, Phase 2 + 15
**Trigger**: detected in reply ("right to be forgotten", "data subject access request", "GDPR")
**Input**: request_type (Article 15/17/20/21), requester_email
**Output**: structured handling workflow, response template
**Verification**: gdpr_requests table has entry, 30-day SLA tracked
**Dependencies**: audit-trail-export (S049), dnc (S007)
**Implementation**: Detects request type. Article 15 (access): exports all data within 30 days. Article 17 (erasure): suppresses + deletes + confirms. Article 20 (portability): structured export to subject. Article 21 (object): adds to DNC.

---

## 9. NEW SKILLS · MONITORING AND INTELLIGENCE

### S053 · industry-news-ingester
**Status**: NEW, Phase 10
**Trigger**: daily 06:00 cron
**Input**: sectors[]
**Output**: industry news digest per sector
**Verification**: industry_news table populated daily per sector
**Dependencies**: NewsAPI free, Google News RSS, sector publication RSS feeds
**Implementation**: Per sector, ingests 20-50 articles daily. Filters relevance. Tags by sub-topic. Feeds into sector intelligence base.

### S054 · brand-mention-monitor
**Status**: NEW, Phase 10
**Trigger**: hourly cron
**Input**: "Tamazia" + variations + Aman Pareek
**Output**: mentions logged with sentiment, source, reach
**Verification**: brand_mentions table populated
**Dependencies**: free monitoring (Talkwalker Alerts free, Google Alerts, Mention free tier)
**Implementation**: Tracks Tamazia mentions across web, news, social. Sentiment-tagged. P0 alert on negative high-reach mentions.

### S055 · review-monitor
**Status**: NEW, Phase 10 + 15
**Trigger**: daily check on review sites
**Input**: review_sites[] (Trustpilot, Google, Clutch, Yelp business)
**Output**: new reviews logged, sentiment, response required flag
**Verification**: reviews table populated, response_sla tracked
**Dependencies**: review-monitor-respond skill
**Implementation**: Checks each platform daily. Logs new reviews. Drafts response for Aman approval if response policy says respond. Tracks NPS-equivalent score.

---

## 10. NEW SKILLS · COORDINATION GROUP

### S056 · slack-channel-manager
**Status**: NEW, Phase 11
**Trigger**: setup task + ongoing
**Input**: channel structure spec
**Output**: 4 Slack channels configured with permissions, members, topics
**Verification**: channels exist in Slack workspace via API
**Dependencies**: Slack bot token
**Implementation**: 4 channels: #aman-cos (chief of staff actions), #tamazia-pipeline (lead flow), #tamazia-replies (incoming replies awaiting approval), #tamazia-deploys (deploy notifications).

### S057 · telegram-command-handler
**Status**: NEW, Phase 11
**Trigger**: incoming Telegram message to bot
**Input**: message_text, chat_id
**Output**: command executed, response posted
**Verification**: command_history table has entry per command, success rate >95%
**Dependencies**: Telegram Bot, n8n webhook
**Implementation**: Slash commands: /status (pipeline summary), /pause [workflow] (halt), /resume [workflow] (restart), /audit [domain] (trigger), /override [task] [reason] (manual override), /escalate [issue] (Slack P0).

### S058 · multi-stakeholder-thread
**Status**: NEW, Phase 9 + 11
**Trigger**: lead has multiple stakeholders identified
**Input**: lead_id (primary), additional_contacts[]
**Output**: stakeholder map, coordinated outreach sequence
**Verification**: stakeholder_map table linked to lead, no contradictory comms sent
**Dependencies**: research-digest (S004)
**Implementation**: When a deal has multiple decision-influencers (champion, economic buyer, blocker, parent-company contact), tracks all, sequences different messages to each, never contradicts.

---

## 11. SKILL DEPENDENCY DIAGRAM

```
                    Master orchestration
                           |
        ┌──────────────────┼──────────────────┐
        |                  |                  |
   Compose group     Sourcing group    Lifecycle group (Phase 14)
        |                  |                  |
   ┌────┼────┐         ┌──┼──┐            ┌──┼──┐
   S001 S008 S009     S028 S029 S030     S037 S040 S041
   compose pers disc  source find verify  contract onboard health
        |                                       |
   S010 S011 S012                              S042 S043 S045
   forbid subj reply                          renewal upsell case
        |                                       
   S013 S014                                   
   draft variant                               
        |
        | All compose flows through S015 (compliance) and S018 (citation)
        v
   S015 check-compliance + S018 regulatory-citation
        |
   Phase exit gate via verify-phase.sh
```

---

## 12. SKILL FILE LOCATIONS

Each skill lives at: `~/code/tamazia-cowork-skills/{S0XX-skill-name}/SKILL.md`

Plus supporting files: `~/code/tamazia-cowork-skills/{S0XX-skill-name}/scripts/`

The SKILL.md follows the standard Cowork skill format (frontmatter + description + invocation + examples).

Phase 0-15 tasks reference specific skills by ID (e.g., "creates S008") so verification can confirm skill file exists.

End of SKILLS.md.
