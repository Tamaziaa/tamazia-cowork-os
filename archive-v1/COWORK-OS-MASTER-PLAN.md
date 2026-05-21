# TAMAZIA COWORK OS · MASTER IMPLEMENTATION PLAN
**Version 1.0 · Authored 2026-05-17 · Owner: Aman Pareek**

This document supersedes earlier scattered planning notes. Read top to bottom once. Reference by section number afterwards.

The companion documents in this folder are:
- `COWORK-OS-TRACKER.md` (live checklist with verification criteria, ticks only when work is verified)
- `COWORK-OS-PURCHASES.md` (every subscription/spend decision with cheapest options researched, flagged for your approval)
- `COWORK-OS-EMAIL-TEMPLATES.md` (every email body the system sends, including the new switching-agencies challenge)

---

## 0. TOP-LINE DECISIONS LOCKED FROM YOUR REVIEW

Captured here so future edits build on confirmed ground, not re-litigated assumptions.

**0.1** Audit format = hosted micro-site at `tamazia.co.uk/audit/{client-slug}/{8-char-hash}`. No password. Stay Tamazia branded throughout with cinematic animations. PDF download optional. Audit stays live 180 days.

**0.2** Audit delivery cadence = audit sent in EVERY email when generation time permits. If generation is heavy, send touch 0 without, then attach link in touch 1 and every follow-up. Decision criteria in Phase 6.

**0.3** Compose tone by sector = hybrid. Legal/FS: permission-framed comparison challenge (see Email Template B). Hospitality/Healthcare/Real Estate: value-first. E-commerce/SaaS: curiosity hook.

**0.4** Cadence by sector confirmed.
Legal/FS/Real Estate: T+0, T+7, T+15, T+25, T+45.
Healthcare/Education: T+0, T+5, T+10, T+18, T+30.
Hospitality/Wellness/Personal Brand: T+0, T+3, T+7, T+14, T+21.
E-commerce/SaaS/Retail: T+0, T+2, T+5, T+10, T+18.

**0.5** Nurture pool re-engagement after 90 days = different sequence (Sequence B), not back into main. Cadence T+90, T+120, T+180.

**0.6** Hard stop on reply = absolute. Any reply, any intent (except OOO), terminates the automated sequence. No exceptions. Enforced at W4 cron, W6 classifier, W8 handler.

**0.7** Notifications stack = Slack primary + Telegram Bot for free instant push to your phone. WhatsApp deferred. Real-time for P0 (HOT/HOSTILE/LEGAL) plus morning digest 07:00 of all pending.

**0.8** Approval recall window = 120 seconds. Two-tap confirm for HOT, single-tap for WARM.

**0.9** Tamazia UK registered company. No India operations. Indian jurisdiction line in your preference file refers to LexQuity corporate, not Tamazia.

**0.10** Compliance signoff stamp = "Generated [date] using framework version v[X.Y] (Framework reviewed by Aman Pareek, International Business Lawyer, [date])". Position: bottom of every audit, every email footer, every PDF export.

**0.11** Tier 1 audit positioning = "Scan powered by Tamazia, frameworks trained on regulatory sources by AI and reviewed by Aman Pareek, International Business Lawyer. This scan is not legal advice."

**0.12** Sender title = "Aman Pareek, International Business Lawyer, Founder Tamazia" on all communications you sign.

**0.13** Free audit value framing = £1,500 audit, free for every recipient.

**0.14** Lead sourcing daily target = 100/day for first 30 days, then evaluate scale to 500/day. Confirmed.

**0.15** Channel parity required = email + LinkedIn message + Instagram DM drafted for every lead. Sent based on contact info available. Slack notification when all three drafts ready.

---

## 1. SUBSCRIPTIONS SUMMARY TABLE (full detail in COWORK-OS-PURCHASES.md)

| Item | Recurring cost | Phase | Status | Decision |
|---|---|---|---|---|
| ICO registration UK | £40/year | 2 | Required | Buy direct from ico.org.uk |
| Zoho Mail Premium upgrade (founder@) | £3/user/month | 1 | Required to unlock IMAP | Confirm tier and upgrade |
| PI insurance (cheapest researched) | £100-180/year | 2 | Required for lawyer protection | See PURCHASES doc, 12 options compared |
| EU Article 27 representative | €25-30/month (€300/yr) | 2 | Required for EU clients | EuropeanRep.com cheapest verified |
| NeverBounce verification (top-tier leads) | £15-20/month | 7 | Recommended | Approved by you, configure |
| Telegram Bot notifications | £0 | 11 | Free, replaces WhatsApp at zero cost | Build, use |
| Cal.com (free tier) | £0 | 9 | Free tier sufficient | Sign up, connect n8n |
| Cloudflare Workers AI (free tier) | £0 | 6 | 10k neurons/day free | Use for personalisation engine |
| DeepSeek API (overflow) | £5-15/month | 6 | Cheap fallback | Approved if Cloudflare hits limit |
| LinkedIn Sales Navigator | £79/month | 9 | Optional, depends on volume | Flagged for your decision month 3 |
| GlockApps deliverability | £0 (deferred) | 11 | Deferred per your call | Skip for now |
| BIMI/VMC blue tick | £0 (deferred) | 11 | Deferred per your call | Revisit at £100k ARR |
| Smartlead.ai migration | £94/month | future | Evaluate at 500/day milestone | Defer 60-90 days |

**Total committed monthly recurring at full Phase 11**: ~£40-60/month.
**Plus annual one-time**: £140-220.

This is below your £5 spend trigger per item if monthly, requires explicit approval if grouped. PURCHASES doc itemises each.

---

## 2. PHASE STRUCTURE

13 phases. Each is self-contained, with explicit verification criteria so the tracker can confirm completion without ambiguity. Phases sequenced by dependency, not by date. Some can run in parallel (called out per phase).

The phases:

| # | Phase | Effort | Cost flagged | Runs in parallel with |
|---|---|---|---|---|
| 0 | Pre-flight approvals (you) | 30 min | £0 | None |
| 1 | Infrastructure triage | 1 week | £3-12/month Zoho upgrade | None |
| 2 | Compliance and legal foundation | 1-2 weeks | £40 + £100 + €300 | 1 |
| 3 | Compose body and reply classifier | 1 week | £0 | 2 |
| 4 | Warmup engine v6 (real replies) | 1 week | £0 | 3 |
| 5 | Audit micro-site luxury build | 2 weeks | £0 | 4 |
| 6 | 50-pointer personalisation + free LLM | 1-2 weeks | £0-15/month | 5 |
| 7 | Lead sourcing 50-API engine | 2 weeks | £15-20/month NeverBounce | None (single track) |
| 8 | Ad intelligence scraper | 1 week | £0 | 7 |
| 9 | LinkedIn + Instagram + Cal.com multi-channel | 1-2 weeks | £0-79/month | 8 |
| 10 | Sector intelligence + 500-title matrix | 2 weeks | £0 | 9 |
| 11 | Chief of Staff + notifications | 1 week | £0 | 10 |
| 12 | Deploy bulletproofing + tracker artifact | 1 week | £0 | 11 |
| 13 | Continuous improvement engine | Ongoing | £0 | All |

Total elapsed time at full pace: 10-12 weeks. Sequencing reflects dependencies, not your bandwidth.

---

## PHASE 0 · PRE-FLIGHT APPROVALS (you, 30 minutes)

### 0.1 Objective
Lock the decisions in Section 0 above. Approve the spend items in Section 1. Confirm the sender identity stamp. Nothing builds until this is signed off.

### 0.2 What you do
- 0.2.1 Read Section 0 (top-line decisions), reply with any disagreement
- 0.2.2 Read COWORK-OS-PURCHASES.md (the cheapest options researched per spend item)
- 0.2.3 Approve each spend item or flag for substitution
- 0.2.4 Confirm sender identity: "Aman Pareek, International Business Lawyer, Founder Tamazia"
- 0.2.5 Confirm tracker location: COWORK-OS-TRACKER.md in this folder is single source of truth

### 0.3 Verification criteria (tracker ticks when)
- All 15 top-line decisions in Section 0 explicitly confirmed in chat or via this file
- PURCHASES doc has Aman approval mark next to each item
- Sender identity stamp drafted and stored in repo as `signatures/aman.txt`

### 0.4 Owner
Aman.

### 0.5 Subscriptions flagged
None at this phase. Approval only.

---

## PHASE 1 · INFRASTRUCTURE TRIAGE (1 week, free or £3/mo)

### 1.1 Objective
Unblock the production-ready code that is currently waiting on infrastructure access. Specifically: IMAP for reply listener, seed leads for cold send, Cal.com webhook for meeting tracking.

### 1.2 What gets built or fixed

**1.2.1 Zoho IMAP unblock**
Problem: Zoho Lite tier blocks IMAP. Your dashboard shows "install app" not "IMAP toggle". This is the symptom of being on Lite.

Three paths, ranked:

Path A (cheapest, recommended): Upgrade founder@tamazia.co.uk only to Zoho Mail Premium (£3/month). Other 89 aliases stay on Lite (they only send, don't need IMAP for inbound parsing). Total: £3/month.

Path B: Switch entire inbound parsing to Zoho ZeptoMail webhook. ZeptoMail has inbound parse feature: messages sent to a forwarder address get POSTed to your n8n webhook in real time. No IMAP polling. More reliable, lower latency, free under 10k inbound/month.

Path C: Migrate IMAP to a different provider like Mailbox.org or Fastmail. Adds complexity, defers solution.

Recommendation: **Path B (ZeptoMail webhook)** as primary, Path A as fallback. ZeptoMail is already a Zoho product, your DNS is already aligned, setup is one webhook configuration on Zoho side. Defers the IMAP question entirely.

Steps:
- 1.2.1.1 Log into mailadmin.zoho.eu
- 1.2.1.2 Mail Settings → Email Forwarding & POP/IMAP
- 1.2.1.3 If IMAP option shows: enable it. Generate app-specific password. Update n8n credential. Test.
- 1.2.1.4 If IMAP option shows "Premium required": go to ZeptoMail panel → Inbound webhook → create endpoint
- 1.2.1.5 Configure forwarder rules: founder@ replies routed to ZeptoMail inbound
- 1.2.1.6 In n8n, replace W3 IMAP trigger with HTTP webhook trigger receiving from ZeptoMail
- 1.2.1.7 Test by sending a reply to founder@, verify it appears in n8n execution log within 10 seconds

**1.2.2 Seed the 50-lead pilot list**
Without leads in the table, W2 cold send and W4 follow-up fire but find zero rows. Sequencer can't be validated until leads exist.

Decision: **Don't manually curate 50.** Wait for Phase 7 (lead sourcing engine) which will generate 100/day automatically. Phase 1 instead inserts 10 dummy "internal test" leads (using friendly inboxes you control from W1.9.1 seedlist) so W2 and W4 can be end-to-end tested without spamming real prospects.

Steps:
- 1.2.2.1 Create 10 test rows in `leads` table with `status='test'` and emails pointing to your friendly inboxes
- 1.2.2.2 Run W2 cron manually, verify cold email arrives at test inbox
- 1.2.2.3 Run W4 cron manually with `next_touch_date = today`, verify follow-up arrives
- 1.2.2.4 Reply from test inbox, verify W3 catches it and routes to W6 then W8

**1.2.3 Hard-stop-on-reply enforcement**
Current W4 doesn't check reply status before sending. Patch:

```
ADD pre-send guard in W4 node 4.3:
SELECT * FROM leads WHERE id = $1 AND status NOT IN ('replied','unsubscribed','bounced_hard','complained','dnc','client','lost','test')
AND last_reply_received_at IS NULL
```

If query returns zero rows: skip lead, log skip reason, do not send.

**1.2.4 Rename "audit" to "Regulatory Signal Scan" everywhere**
Find-replace across:
- Email templates (every touch)
- W7 subject and body
- Audit micro-site (until Phase 5 rebuild)
- Slack notification templates
- Skill files compose-body, sector-pitch, audit
- Compliance disclaimer

This is your lawyer-reputation protection from Section 0.11. Five-minute change with material liability reduction.

### 1.3 Verification criteria (tracker ticks when)
- 1.3.1 ZeptoMail webhook receives test reply within 10 seconds, logged to n8n execution
- 1.3.2 10 test leads inserted in `leads` table, W2 manual run sends to all 10 within 5 minutes
- 1.3.3 Reply from test inbox terminates sequence, W4 skips that lead on next cron, log shows skip reason
- 1.3.4 No code path remains containing the word "audit" without "Regulatory Signal Scan" disclaimer reframing

### 1.4 Owner
Aman: Zoho admin actions, test inbox replies.
Claude: n8n configuration, code changes, find-replace operations.

### 1.5 Subscriptions flagged
- Zoho Mail Premium for founder@ only: £3/month (£36/year). Approve.

### 1.6 Risk and rollback
Risk: ZeptoMail webhook misses a reply. Mitigation: keep IMAP polling as fallback for 30 days, run both, compare. Rollback: revert n8n W3 trigger to IMAP if webhook proves unreliable.

---

## PHASE 2 · COMPLIANCE AND LEGAL FOUNDATION (1-2 weeks, ~£100 + €300 + £40)

### 2.1 Objective
Get Tamazia legally clean to send commercial communications at scale, protect your professional reputation as a lawyer, and stamp every output with reviewable signoff.

### 2.2 What gets built or acquired

**2.2.1 ICO registration (UK)**
Mandatory if processing personal data of UK residents at any scale. Tier 1 fee £40/year (small business under £632k turnover, fewer than 11 staff).

Steps:
- 2.2.1.1 Go to ico.org.uk/registration
- 2.2.1.2 Complete self-assessment, select Tier 1
- 2.2.1.3 Pay £40 via direct debit
- 2.2.1.4 Receive registration number within 24 hours
- 2.2.1.5 Add registration number to website footer, email footer, audit footer

**2.2.2 EU Article 27 Representative (required for EU prospect outreach)**
Mandatory under GDPR Article 27 if Tamazia (UK entity) processes EU residents' personal data. Cold outreach to EU contacts triggers this.

Cheapest verified options (training data, verify quotes at purchase):

Ranked by cost:
1. EuropeanRep.com: €25/month or €299/year prepaid (cheapest)
2. eu-rep.org: €33/month
3. Prighter: €99/month (more white-glove, includes DPO services)
4. EU Rep Limited: €50/month
5. Maetzler EU Rep: €40/month

Recommendation: **EuropeanRep.com at €299/year** prepaid. Most affordable, covers the legal requirement, no extra services bundled.

Steps:
- 2.2.2.1 Sign up at europeanrep.com (or your chosen)
- 2.2.2.2 Provide Tamazia UK company details
- 2.2.2.3 Receive representative address and contact (usually in Ireland or Germany)
- 2.2.2.4 Add representative details to website privacy policy and email footer
- 2.2.2.5 Update GDPR Article 13 disclosures to include representative

**2.2.3 Professional Indemnity Insurance**
You are a lawyer publishing scans branded with your professional title. PI insurance protects you personally from civil claims if a client relies on a scan and suffers loss.

Cheapest verified options for marketing/consulting agency with lawyer founder (training data, verify quotes):

Ranked by typical first-year cost for £1M cover:
1. Hiscox Cyber & Marketing: £150-300/year
2. PolicyBee Marketing Consultants: £140-280/year
3. Simply Business broker aggregator: £80-200/year (cheapest typically)
4. Direct Line for Business: £100-250/year
5. Markel Direct: £140-300/year
6. AXA Business: £100-280/year
7. Caunce O'Hara: £150-300/year
8. Towergate Insurance: £120-280/year
9. Anansi: £100-250/year (digital-first, fast quotes)
10. Premierline Direct: £120-280/year
11. Get Indemnity: £100-260/year
12. Coverwallet: £120-260/year

Recommendation: **Simply Business broker** as starting point (gets 4-6 quotes from above panel in one application, takes 10 minutes). Choose lowest quote that includes:
- £1M minimum cover per claim
- Cyber liability included or addable
- Run-off cover 6 years minimum
- No exclusion for AI-generated content
- No exclusion for SEO claims

Important: Disclose to insurer that you are LLM-qualified and publish scans under your professional title. Some policies exclude regulated professional services unless declared.

Steps:
- 2.2.3.1 Get quotes via Simply Business (15-minute online form)
- 2.2.3.2 Cross-quote with PolicyBee and Anansi directly
- 2.2.3.3 Pick cheapest meeting criteria
- 2.2.3.4 Pay annual upfront (saves ~10% vs monthly)
- 2.2.3.5 Save policy number, certificate, broker contact in folder

**2.2.4 T&Cs and Privacy Policy update**
Existing T&Cs and Privacy Policy need refresh to reflect:
- New ICO registration number
- New EU Article 27 representative
- New disclaimer language for scans
- Updated processor list (Resend, SMTP2GO, MailerSend, Cloudflare, Neon, n8n Pikapod, ZeptoMail)
- Updated retention periods
- Updated lawful basis (legitimate interest for B2B cold outreach)

You said you'll get these reviewed. Draft to be prepared in this phase, ready for your legal review.

Steps:
- 2.2.4.1 Generate updated T&Cs draft using template (Termly free generator or similar)
- 2.2.4.2 Generate updated Privacy Policy draft
- 2.2.4.3 Cross-reference against your prior versions for continuity
- 2.2.4.4 Send to your reviewer (you'll identify)
- 2.2.4.5 After approval, publish to tamazia.co.uk/terms and tamazia.co.uk/privacy
- 2.2.4.6 Add footer link from every page

**2.2.5 Compliance disclaimer stamp**
Per Section 0.10 and 0.11, every output (email, audit page, PDF) must carry:

> "This Regulatory Signal Scan is powered by Tamazia. Frameworks are trained on publicly available regulatory sources by AI and reviewed by Aman Pareek, International Business Lawyer, [most recent review date]. This scan identifies publicly visible signals only. It is not legal advice and is not a substitute for review by qualified counsel in your jurisdiction. Recommendations should be confirmed with your legal advisor before action."

Position:
- Email: footer below sign-off
- Audit page: persistent footer + collapsible "About this scan" section in header
- PDF export: footer of every page

Steps:
- 2.2.5.1 Draft final language, save to `signatures/disclaimer.txt`
- 2.2.5.2 Inject into compose-body skill output (email footer)
- 2.2.5.3 Inject into audit page template (Phase 5)
- 2.2.5.4 Inject into PDF export header/footer
- 2.2.5.5 Version-control: change to disclaimer triggers DB log entry

**2.2.6 Framework version registry**
Each compliance framework regex set needs version, review date, reviewer. Stored in DB.

Schema:
```
TABLE framework_versions
  id PRIMARY KEY
  framework_name (e.g., "GDPR Article 13", "PECR Reg 6", "FCA CONC 2.5")
  version (semver: 3.2.0)
  rules_count
  last_reviewed_at
  reviewed_by (default: "Aman Pareek, International Business Lawyer")
  notes
```

Steps:
- 2.2.6.1 Create table in Neon
- 2.2.6.2 Seed with current frameworks, mark all v1.0.0, reviewed today by you
- 2.2.6.3 Audit output queries this table for the stamp
- 2.2.6.4 Quarterly review reminder scheduled in Cal.com / Telegram

### 2.3 Verification criteria (tracker ticks when)
- 2.3.1 ICO registration number live, visible on website footer, email footer, audit footer
- 2.3.2 EU Article 27 representative details published in Privacy Policy
- 2.3.3 PI insurance policy document saved in folder, certificate visible
- 2.3.4 T&Cs and Privacy Policy v2026-05 published on tamazia.co.uk, footer links work, last-updated date visible
- 2.3.5 Compliance disclaimer appears on every email, every audit page, every PDF export
- 2.3.6 `framework_versions` table populated, every audit output references current version

### 2.4 Owner
Aman: ICO registration, PI insurance quotes, T&Cs review and signoff, framework review.
Claude: Drafting T&Cs/Privacy, building registry table, injecting disclaimers.

### 2.5 Subscriptions flagged
- ICO: £40/year (Aman to buy direct)
- EU Article 27 rep: €299/year (Aman to buy, EuropeanRep.com recommended)
- PI insurance: ~£100-250/year (Aman to procure via Simply Business)

Total Phase 2 spend: ~£440 first year, ~£440/year recurring.

### 2.6 Risk and rollback
Risk: PI insurer excludes AI-generated content. Mitigation: declare upfront, get explicit confirmation in policy. If excluded by all, use stronger disclaimers, narrow scan scope to "signal identification only", consider Tier 1 only positioning.

---

## PHASE 3 · COMPOSE BODY AND REPLY CLASSIFIER (1 week, free)

### 3.1 Objective
Ship the 50 compose-body gaps fixed (your sign-off catch is item 1), classify every reply into 13 intent categories with auto-drafted responses, enforce hard stop on reply.

### 3.2 What gets built

**3.2.1 Compose body Tier 1 fixes (10 critical from the 50)**
- 3.2.1.1 Sign off as alias first name, not "Aman Pareek" generic (YOUR CATCH)
- 3.2.1.2 Reply-rate tracking per template variant (new `template_variants` table, every send links to variant_id, weekly retire bottom quartile)
- 3.2.1.3 Regional spelling (UK vs US) detected from lead.country
- 3.2.1.4 Language detection (skip if non-English, route to manual)
- 3.2.1.5 Title abbreviation correctness (KC, FRCS, LLB, FCA, etc., lookup table)
- 3.2.1.6 Company name normalisation (Ltd vs Limited stored properly)
- 3.2.1.7 Time-of-day per sector (legal early morning, hospitality late afternoon)
- 3.2.1.8 Timezone handling per lead.city
- 3.2.1.9 Unsubscribe link in email footer (PECR exempt for B2B, helps reputation)
- 3.2.1.10 Physical address + ICO reg + company number in footer

Remaining 40 gaps deferred to Phase 6 (when personalisation engine is built, easier to slot in).

**3.2.2 Reply intent classifier (W6 v2)**

13 categories from earlier analysis (Section W6.2):
HOT_BOOK, HOT_PRICE, WARM_INFO, WARM_TIMING, NURTURE, OBJECTION_BUDGET, OBJECTION_INCUMBENT, OBJECTION_FIT, REDIRECT, OOO, HOSTILE, LEGAL_THREAT, UNSUBSCRIBE.

Implementation:
- 3.2.2.1 Each reply passed to Claude Haiku via n8n HTTP node (use Anthropic API directly, ~£0.001 per classification)
- 3.2.2.2 OR self-hosted Llama 3.1 8B via Cloudflare Workers AI (free, 10k neurons/day)
- 3.2.2.3 Prompt: structured JSON output with category, confidence (0-1), reasoning (2 sentences), suggested draft response (200 words)
- 3.2.2.4 Confidence < 0.7 → category = "MANUAL_REVIEW", route to Aman without auto-action
- 3.2.2.5 Save classification + draft to `reply_classifications` table for audit trail
- 3.2.2.6 Route to W8 with full context

**3.2.3 Auto-drafted response templates per category**
13 templates per sector. Total 13 × 10 sectors = 130 baseline templates. Stored in `response_templates` table.

Each template:
- Sector
- Category
- Body
- Tone calibration notes
- Required edits (e.g., HOT_PRICE template requires inserting actual pricing tier)

**3.2.4 Hard stop on reply (Phase 1 patch hardened)**
Already done in Phase 1.2.3. Phase 3 adds:
- 3.2.4.1 W6 marks lead.replied = TRUE on any reply receipt (except OOO)
- 3.2.4.2 W4 cron checks lead.replied before every send (additional guard)
- 3.2.4.3 W2 cron checks lead.replied (defensive, shouldn't fire since W2 only fires on pending)
- 3.2.4.4 Manual override requires Aman explicit flag in DB

**3.2.5 Slack notification template per category**
W10 (notification proxy) gets 13 new templates:
- Color-coded (green HOT, yellow WARM, orange OBJECTION, red HOSTILE/LEGAL, grey OOO/UNSUB)
- Block Kit JSON with: lead name, company, sector, prior touches, open count, reply excerpt, full pre-drafted response in monospace, buttons [Approve and Send] [Edit] [Suppress] [Snooze 24h] [Hand to Aman]
- Mobile-friendly (Slack iOS/Android render properly)

**3.2.6 Telegram Bot mirror (Phase 11 prep)**
Set up Telegram Bot now so notifications are testable. Token from @BotFather, free, instant.
- 3.2.6.1 Create @TamaziaCOSBot or similar
- 3.2.6.2 Add bot to your personal Telegram
- 3.2.6.3 n8n HTTP node sends to Telegram API for P0 notifications (parallel to Slack)
- 3.2.6.4 Markdown formatting tested

### 3.3 Verification criteria (tracker ticks when)
- 3.3.1 Test email signed with alias first name (e.g., "James" not "Aman Pareek") verified in sent log
- 3.3.2 Template variant tracking active, can query "show reply rate by variant for sector X" and get answer
- 3.3.3 Reply classifier tested on 20 sample replies, ≥18 correctly categorised, no LEGAL_THREAT miscategorised
- 3.3.4 Hard stop verified by inserting test lead, replying, observing W4 skip on next cron
- 3.3.5 Slack notification received with all 13 category templates rendered correctly
- 3.3.6 Telegram Bot receives test notification, formatted correctly

### 3.4 Owner
Claude: All build and configuration.
Aman: Approve 10 fixes priority, review 13 category templates, set up Telegram Bot token (5 minutes).

### 3.5 Subscriptions flagged
None. Cloudflare Workers AI free tier handles classification. Anthropic API as overflow ~£2-5/month at 100 replies/day.

### 3.6 Risk and rollback
Risk: classifier wrong on LEGAL_THREAT. Mitigation: confidence threshold 0.85 on LEGAL_THREAT (any lower → manual). Manual review of every LEGAL_THREAT for first 30 days regardless.

---

## PHASE 4 · WARMUP ENGINE V6 WITH REAL REPLIES (1 week, free)

### 4.1 Objective
Upgrade W1 with reply-from-receiver behavior, integrate 5 real Gmail inboxes from your seedlist, prevent any alias from degrading below threshold (your W1.9.2 rule).

### 4.2 What gets built

**4.2.1 Reply-from-receiver workflow (new W1b)**
- 4.2.1.1 W1b triggers every 30 minutes
- 4.2.1.2 Polls each alias inbox (via ZeptoMail webhook or IMAP fallback) for new warmup-flagged incoming
- 4.2.1.3 Warmup flag detection: body_hash exists in `sends` table (means it's a warmup email we sent)
- 4.2.1.4 For each detected: 70% probability to generate reply
- 4.2.1.5 Reply scheduled 4-24h later (randomised), queued in `warmup_replies` table
- 4.2.1.6 Reply content from new W1-Reply library (50 templates per category: acknowledgment, question, follow-up, thanks, scheduling, casual)
- 4.2.1.7 Reply sent from receiver alias, threaded properly (In-Reply-To header preserved)
- 4.2.1.8 Receiver alias marks original as Important/Starred (Gmail signal)

**4.2.2 5 real Gmail seedlist integration**
You have 5 real Gmail accounts. Integrate as seedlist members so warmup includes real-inbox engagement:
- 4.2.2.1 Generate app-specific passwords for each Gmail
- 4.2.2.2 Add to `aliases` table with type='seedlist', engagement_role='active'
- 4.2.2.3 W1b includes these in reply rotation
- 4.2.2.4 Build new Cowork skill "Warmup Engage" that lets you trigger manual opens/replies/stars on your real Gmails when needed (single click in Slack to "engage warmup")

**4.2.3 Anti-degradation throttle (your W1.9.2 rule)**
Per your "yes risk no email" call: any alias must never send if reputation is at risk.

Implementation:
- 4.2.3.1 New table `alias_health` polled hourly
- 4.2.3.2 Fields: mail_tester_score (latest), bounce_rate_7d, complaint_rate_7d, open_rate_7d, last_check_at
- 4.2.3.3 Alias `status` transitions automatically:
  - status=active if all green (>8/10 mail-tester, <2% bounce, <0.1% complaint, >5% open)
  - status=warmup_only if any yellow (W1 only, no W2/W4)
  - status=rest if any red (no sends, 48h cool-down, then re-test)
  - status=retired if cool-down fails 3 times (alias dead)
- 4.2.3.4 W2 and W4 only pick from status=active
- 4.2.3.5 Alert to Telegram when alias transitions to rest or retired

**4.2.4 Anti-fingerprint v6 (10 layers added per earlier analysis)**
- 4.2.4.1 Time-of-day variation per alias (early-bird vs night-owl personality)
- 4.2.4.2 Day-of-week variation (Tue/Wed/Thu weighted)
- 4.2.4.3 Signature variation (5 blocks per alias, rotate)
- 4.2.4.4 Quote depth variation (top-post vs bottom-post vs no-quote)
- 4.2.4.5 Reply latency variation (no exact-hour replies)
- 4.2.4.6 Email length variance (20-300 words)
- 4.2.4.7 Punctuation rhythm variation
- 4.2.4.8 Threading depth (some threads grow to 4-5)
- 4.2.4.9 Forwarding simulation (5% of warmups get forwarded to third alias)
- 4.2.4.10 Casual typo injection (1 typo per 10 emails, in non-critical words)

**4.2.5 Mail-tester automation**
- 4.2.5.1 Every alias sends test email to its assigned mail-tester address weekly
- 4.2.5.2 n8n scrapes the score, logs to `alias_health`
- 4.2.5.3 Alert if drops below 8

### 4.3 Verification criteria
- 4.3.1 W1b reply-from-receiver workflow executes, replies appear in alias inboxes within 4-24h of receipt
- 4.3.2 5 real Gmail accounts integrated, appearing in `aliases` table with type='seedlist'
- 4.3.3 Test alias deliberately bounced 3 times, observed status transition to rest within 1 hour
- 4.3.4 Anti-fingerprint v6 collision rate verified 0% across simulated 30 runs
- 4.3.5 Mail-tester scores logged for all 95 aliases (90 + 5 seedlist), average ≥8.5

### 4.4 Owner
Claude: All build.
Aman: Provide 5 Gmail app-specific passwords, approve W1-Reply library content.

### 4.5 Subscriptions flagged
None.

### 4.6 Risk
Risk: 5 real Gmails get flagged by Google for automation activity. Mitigation: throttle real Gmail engagement to ≤5 actions/day per account, only manual triggers, never bulk.

---

## PHASE 5 · AUDIT MICRO-SITE LUXURY BUILD (2 weeks, free)

### 5.1 Objective
Build the hosted audit micro-site at `tamazia.co.uk/audit/{client-slug}/{8-char-hash}` with cinematic luxury feel, 180-day persistence, no password, QR codes, hyperlinks, optional PDF export. Per your "fuck where are we, this is luxury" requirement.

### 5.2 What gets built

**5.2.1 Astro dynamic route**
- 5.2.1.1 New route `src/pages/audit/[slug]/[hash].astro` in tamazia-website repo
- 5.2.1.2 Route fetches proposal JSON from `/api/proposals/[hash]` (Neon-backed)
- 5.2.1.3 Static generation at build time when new audit added, plus on-demand for individual pages
- 5.2.1.4 8-char hash = base62 (218 trillion combos, unguessable)
- 5.2.1.5 180-day expiry: route checks `expires_at` field, returns 410 Gone if expired with "Contact us to reactivate" page

**5.2.2 Luxury design language**
Reference brand inspirations: Hermès Finance, EQT Capital, Bridgewater Associates, Hennessy private client portal.

Visual treatment:
- 5.2.2.1 Color palette: deep navy (#0B1A2E), gold accent (#C9A961), white (#FFFFFF), warm grey (#F5F1EA)
- 5.2.2.2 Typography: serif headline (Cormorant Garamond), sans body (Inter or Söhne)
- 5.2.2.3 Hero section: full-viewport cover with client name, custom subtle motion (animated grain, slow zoom on background)
- 5.2.2.4 Section transitions: fade-up animations on scroll (Framer Motion or GSAP, lightweight)
- 5.2.2.5 Section dividers: thin gold rules, ample whitespace
- 5.2.2.6 Imagery: photographic, no stock-feel, monochrome treatments
- 5.2.2.7 Loading state: smooth fade-in, no spinners (perception of speed)
- 5.2.2.8 Micro-interactions on every CTA (subtle hover lift, gold underline animation)
- 5.2.2.9 Mobile-first: animations degrade gracefully on low-end devices
- 5.2.2.10 Performance budget: LCP < 1.5s, CLS < 0.05 (must outperform their own site)

**5.2.3 Section structure (per Section A.4 from prior analysis)**
1. Cover (client logo if available, prepared by date, validity countdown)
2. The Three Findings (above-fold hook)
3. Current vs After Tamazia comparison table (animated reveal per row)
4. Compliance signal inventory (cards, sector-specific, color-coded)
5. SEO opportunity sizing (£ value per gap, calculated)
6. Competitive benchmark (3 competitors, gap chart)
7. Why Tamazia for [sector] (sector case study, 1 only)
8. Investment (3 tiers, toggle monthly/project)
9. Next 30 minutes (Calendly embedded, QR for mobile)
10. About this scan (compliance disclaimer, framework version, lawyer signoff)

**5.2.4 QR codes**
- 5.2.4.1 Every section has anchor link (#findings, #comparison, #investment, etc.)
- 5.2.4.2 PDF export version generates QR for each section linking to the live page section
- 5.2.4.3 Master QR at bottom linking to homepage tamazia.co.uk
- 5.2.4.4 QR generated server-side (qrcode npm package, free)

**5.2.5 Hyperlinks header**
- 5.2.5.1 Sticky top navigation: "Findings" "Comparison" "Compliance" "SEO" "Investment" "Book Call"
- 5.2.5.2 Each links to anchor + tracks click
- 5.2.5.3 Mobile: hamburger to anchor menu

**5.2.6 Engagement tracking**
- 5.2.6.1 Tracking pixel on page load (timestamp, IP geolocation, user-agent)
- 5.2.6.2 Section dwell time (Intersection Observer, log seconds per section)
- 5.2.6.3 Scroll depth (max % scrolled)
- 5.2.6.4 CTA clicks (Calendly, pricing, contact)
- 5.2.6.5 PDF download (tracked event)
- 5.2.6.6 Return visits (cookie-based, logged separately)
- 5.2.6.7 All events POSTed to /api/track endpoint, stored in Neon `audit_events` table
- 5.2.6.8 Trigger Slack/Telegram notification on high-intent signals (pricing dwell >2min, multiple returns)

**5.2.7 PDF export**
- 5.2.7.1 "Download PDF" button on every audit page
- 5.2.7.2 Server-side rendering via Playwright print-to-PDF (runs on n8n Pikapod or Cloudflare Worker)
- 5.2.7.3 PDF preserves design but optimised for print (no animations, clean layout)
- 5.2.7.4 PDF includes QR codes for each section
- 5.2.7.5 PDF stored in Cloudflare R2 (free tier), URL returned to user

**5.2.8 Calendly embed with prefill**
- 5.2.8.1 Calendly inline widget on Section 9
- 5.2.8.2 Prefill: name, company, sector, lead_id as UTM
- 5.2.8.3 Booking webhook POSTs to /api/calendar/booked, updates lead.status='call_booked'
- 5.2.8.4 Triggers Slack/Telegram notification

**5.2.9 Re-engagement triggers**
- 5.2.9.1 No open after 5 days from delivery: send "did the link work?" check-in
- 5.2.9.2 Open without booking after 7 days: send "anything I can clarify?" follow-up
- 5.2.9.3 Pricing section dwell >2 min: immediate Slack alert + suggested call-now offer
- 5.2.9.4 Multiple returns (3+ visits): mark lead as HIGH_INTENT, prioritise in Aman's daily digest

### 5.3 Verification criteria
- 5.3.1 Test audit page deployed at tamazia.co.uk/audit/test-firm/abc12345, loads in <1.5s mobile
- 5.3.2 Animations smooth on iPhone 12-equivalent, no jank
- 5.3.3 QR codes scan correctly to anchors, master QR scans to homepage
- 5.3.4 PDF export generates within 10 seconds, opens correctly, QR codes work in PDF
- 5.3.5 Engagement tracking events appear in Neon within 1 second of trigger
- 5.3.6 Calendly booking flow tested end-to-end, lead.status updates
- 5.3.7 180-day expiry tested by setting expires_at = yesterday, page returns 410 with reactivate message

### 5.4 Owner
Claude: All Astro build, animations, PDF export, tracking, Calendly integration.
Aman: Sign off on visual design language at mockup stage, review test audit page.

### 5.5 Subscriptions flagged
None. Cloudflare Pages handles hosting (free). Cloudflare R2 handles PDF storage (free under 10GB). Playwright in Pikapod (already paid for n8n).

### 5.6 Risk
Risk: animations cause performance penalty, page loads slow, prospect bounces. Mitigation: hard performance budget enforced in CI (LCP <1.5s gate, fails build if exceeded).

---

## PHASE 6 · 50-POINTER PERSONALISATION + FREE LLM HOSTING (1-2 weeks, £0-15/month)

### 6.1 Objective
Build the personalisation engine that turns each audit into a bespoke document referencing 50 specific things about the prospect. Run it on free or near-free LLM hosting per your S1.7 directive.

### 6.2 What gets built

**6.2.1 Personalisation engine architecture**
- 6.2.1.1 New skill `personalisation-engine` orchestrates 5 sub-engines (5 source buckets, 10 pointers each)
- 6.2.1.2 Input: lead_id
- 6.2.1.3 Output: structured `personalisation_pointers` JSON (50 items) stored on lead
- 6.2.1.4 Runs daily for top 100 priority leads (W9 expansion)
- 6.2.1.5 Consumed by S10 (proposal generator) to fill audit micro-site content

**6.2.2 Five source buckets (10 pointers each)**

Bucket A · Website signals (10):
- Services list extraction
- Team page parsing
- Locations and offices
- Awards and recognitions
- USP statements
- Tech stack (Wappalyzer)
- Blog publishing cadence
- Social proof type used
- CTA gradient analysis
- Footer trust elements

Bucket B · Compliance signals (10):
- Sector regulator gaps (FCA/SRA/CQC/etc.)
- Cookie consent vs ICO TCF v2
- Privacy policy GDPR Article 13 completeness
- T&Cs hosted location
- ICO registration check
- Accessibility WCAG basics
- DPA visibility
- Retention policy
- Third-party processor list
- Data subject rights handling

Bucket C · SEO audit (10):
- Core Web Vitals (mobile + desktop)
- Schema markup completeness
- Keyword ranking top 5
- Backlink quality distribution
- Internal linking depth
- Content freshness
- Featured snippet coverage
- AI search citations (ChatGPT/Perplexity/Claude.ai/Gemini)
- Competitive keyword gap
- Long-tail capture

Bucket D · Ad and marketing intelligence (10):
- Active Meta ads (creative, copy, targeting visible)
- Google Ads Transparency presence
- LinkedIn Ads visible
- TikTok Creative Center presence
- Retargeting pixels installed
- Conversion tracking setup
- GA4 vs legacy
- Marketing automation tool detected
- CRM detected
- Email service provider detected

Bucket E · Public records and signals (10):
- Companies House filing trajectory
- Revenue trend (where filed)
- Headcount growth (LinkedIn)
- Recent leadership changes
- M&A history
- Press mentions last 90 days
- Awards last 12 months
- Partnership announcements
- Regulator news mentions
- Sector trend impact

**6.2.3 Free LLM hosting (your S1.7 directive)**

Researched options (training data, verify before commit):

Ranked by cost and quality:

1. **Cloudflare Workers AI** (recommended primary)
   - Free tier: 10,000 neurons/day
   - Models: Llama 3.1 8B, Mistral 7B, Phi-3.5, Qwen 2.5
   - Latency: 1-3 seconds (edge network)
   - Quality: 70-80% of Claude Haiku for personalisation tasks
   - Integration: native Cloudflare Workers, already in your stack
   - Per call: ~50-200 neurons depending on size = 50-200 calls/day free
   - Verdict: cheapest, fastest setup, slot directly into existing infra

2. **DeepSeek V3 API** (recommended secondary)
   - $0.27/M input tokens, $1.10/M output (vs Claude Haiku $0.80/$4.00)
   - Quality: ~85% of Claude Haiku for English structured tasks
   - Latency: 2-5 seconds
   - Per personalisation call (~5k tokens): $0.002
   - 1000 leads/day: ~$2-5/day = £45-110/month
   - Verdict: best price/quality at scale, use as overflow when Cloudflare hits limit

3. **Groq Free Tier**
   - Free: 30 requests/minute
   - Models: Llama 3.1 70B, Mixtral 8x7B
   - Latency: 0.5-1.5 seconds (fastest on market)
   - Quality: comparable to Claude Haiku
   - Verdict: best free option if rate limit acceptable, use for classification

4. **NVIDIA NIM Free Tier**
   - 1000 API calls/month free
   - Models: Llama 3.1 70B and others
   - Verdict: too small for your volume but useful for testing

5. **Together AI**
   - $25 free credit (one-time)
   - Verdict: trial only, not sustainable

6. **Self-hosted Ollama on Pikapod**
   - Cost: bump Pikapod tier to handle inference (~£20-30/month additional)
   - Models: any open-weight (Llama 3.1, Mistral, Qwen)
   - Latency: 5-15 seconds (CPU-bound, no GPU on Pikapod)
   - Quality: same as model
   - Verdict: more expensive than DeepSeek API, slower, but full control and privacy

**Recommendation: hybrid stack**
- Cloudflare Workers AI for personalisation bulk (within 10k neurons/day)
- DeepSeek V3 API as overflow when Cloudflare limit hit (~£5-15/month at current volume)
- Groq free tier for reply classification (fast, frequent, small)
- Anthropic Claude Haiku reserved for highest-stakes final drafts (~£2-5/month)

Total LLM cost at 100/day current: £0-15/month.
At 500/day target: £30-60/month.

**6.2.4 Personalisation engine wired**
- 6.2.4.1 Skill calls Cloudflare Workers AI first with 50-pointer prompt
- 6.2.4.2 If neuron quota exhausted, fall back to DeepSeek API
- 6.2.4.3 Output stored in `personalisation_pointers` JSON field on lead
- 6.2.4.4 S10 (audit generator) consumes pointers into template
- 6.2.4.5 Quality check: each pointer must contain a specific verifiable fact (regex check: company name OR named person OR specific URL OR specific number), reject if generic
- 6.2.4.6 Re-run if quality fails, up to 3 retries

**6.2.5 Send audit in first email decision logic (your W7.7.1)**
Per your call: send in first email if generation time permits, else from second email.

Threshold: if personalisation engine completes within 60 seconds AND audit page deploys within 30 seconds = send in touch 0. Else queue for touch 1.

Implementation:
- 6.2.5.1 W9 (auto-research) runs night before, pre-generates personalisation
- 6.2.5.2 Audit page pre-built and deployed before 08:30 W2 cron
- 6.2.5.3 W2 compose-body checks `audit_url` field on lead, includes link if present
- 6.2.5.4 If audit not ready by 08:30, W2 sends without link, W4 includes from touch 1

**6.2.6 Send link without spam triggers (your S1.8.3)**
Per your call: find way to send personalised link without spam.

Best practices to bake in:
- 6.2.6.1 Link is plain text URL (not button, not "click here")
- 6.2.6.2 ONE link per email maximum (until reply)
- 6.2.6.3 No URL shorteners (bit.ly = instant spam flag)
- 6.2.6.4 Link must be on tamazia.co.uk (own reputation), not new subdomain
- 6.2.6.5 Link appears mid-body or as natural reference, not as P.S. (P.S. links are spam pattern)
- 6.2.6.6 Body has token-personalisation around the link (e.g., "Built for {{Firm}} specifically, here it is: tamazia.co.uk/audit/{{slug}}/{{hash}}")
- 6.2.6.7 No HTML wrapping the URL (force plain text)
- 6.2.6.8 Subject line never contains "free audit" or "compliance report" (spam triggers)
- 6.2.6.9 Mail-tester per template variant including link, must score ≥9/10
- 6.2.6.10 If template scores <9, iterate copy before deploying

### 6.3 Verification criteria
- 6.3.1 Personalisation engine produces 50 specific pointers per lead, each verifiable, no generic outputs
- 6.3.2 Cloudflare Workers AI processes ~50 leads/day within free tier
- 6.3.3 DeepSeek fallback triggers correctly when Cloudflare quota hit
- 6.3.4 Audit pre-generation completes before 08:30 W2 cron for ≥80% of leads
- 6.3.5 Mail-tester score ≥9/10 on every template variant with audit link
- 6.3.6 No template variant flagged as spam in test sends across 20 inboxes

### 6.4 Owner
Claude: All build.
Aman: Approve free LLM stack, approve £5-15/month DeepSeek overflow budget, review pointer quality on 10 test leads.

### 6.5 Subscriptions flagged
- DeepSeek API: £5-15/month overflow (Aman to approve, fund via crypto or card)
- Anthropic Claude Haiku reserved: £2-5/month (already used in current stack)

### 6.6 Risk
Risk: Cloudflare Workers AI quality below acceptable. Mitigation: A/B test against DeepSeek on 50 leads, measure pointer specificity. If <80% quality parity, route bulk to DeepSeek directly.

---

## PHASE 7 · LEAD SOURCING 50-API ENGINE (2 weeks, £15-20/month)

### 7.1 Objective
Source 100 verified leads/day across 10 sectors and 5 jurisdictions, with email + LinkedIn ID + Instagram ID for each. Per your W9.10.1 confirmation.

### 7.2 What gets built

**7.2.1 50 free API integrations (catalogue from W9.3)**

Tier 1 priority APIs (implement first):
- Companies House UK (free key, no rate limit issue at 100/day)
- OpenCorporates (free tier, global coverage)
- SEC EDGAR US (free, full filings)
- Hunter.io free (25 searches/month)
- Snov.io free (50 searches/month)
- Apollo free tier (limited credits)
- Voila Norbert (50 free)
- Google Places API (200/day free)
- Meta Ad Library (free, public, no key)
- Google Ads Transparency Center (free, public)

Tier 2 (implement weeks 2-4):
- LinkedIn Ad Library
- TikTok Creative Center
- All EU registries
- Hong Kong/Singapore registries
- UAE DIFC and ADGM
- Yelp Fusion
- TripAdvisor Content
- Foursquare Places
- OpenStreetMap Overpass

Tier 3 (long tail, implement as needed):
- All remaining person discovery APIs
- All remaining ad libraries
- Verification cross-checks

**7.2.2 Sourcing daily cron (new W12)**
- 7.2.2.1 Triggers 05:00 UK time daily
- 7.2.2.2 Reads `sourcing_schedule` (which sectors today per S1.2 rotation)
- 7.2.2.3 For each (sector, city) target cell, queries relevant APIs in parallel
- 7.2.2.4 Deduplicates against existing `leads` table (unique on domain)
- 7.2.2.5 Filters via DNC and existing client tables
- 7.2.2.6 Scores each candidate via 6-factor scoring (sector fit, size fit, decision-maker accessibility, regulatory complexity, premium pricing tolerance, geographic proximity)
- 7.2.2.7 Inserts top 100 into `leads` with status='pending'
- 7.2.2.8 Triggers W9 (research dossier) and personalisation engine for top 10 priority leads

**7.2.3 Find-every-email pipeline**
For each company sourced, find every named person's email:
- 7.2.3.1 Scrape /team, /about, /leadership, /contact for named people
- 7.2.3.2 Hunter.io domain search returns format and known emails
- 7.2.3.3 Apollo search by domain returns up to N people
- 7.2.3.4 LinkedIn company employees scrape (where possible)
- 7.2.3.5 Crunchbase team list
- 7.2.3.6 Companies House Persons of Significant Control
- 7.2.3.7 For each name found: generate 6 candidate email formats
- 7.2.3.8 SMTP verify each candidate (own server, free)
- 7.2.3.9 Cross-verify with Hunter and Mailboxlayer
- 7.2.3.10 Keep verified, score by seniority

**7.2.4 Verification pipeline (3 stages)**
- Stage 1 (free): SMTP exists check via own server (~70% accuracy)
- Stage 2 (free): Hunter and Mailboxlayer cross-reference (~85% accuracy)
- Stage 3 (paid £15-20/mo NeverBounce): top-tier leads only (~95% accuracy)

Per your W9.10.3 approval, NeverBounce activated.

**7.2.5 LinkedIn ID and Instagram ID collection**
- 7.2.5.1 For each named person discovered, search LinkedIn for profile URL
- 7.2.5.2 For each company, search Instagram for brand handle
- 7.2.5.3 For each founder (where company is personal brand), search personal Instagram
- 7.2.5.4 Store linkedin_url, instagram_handle, instagram_brand_handle on lead row
- 7.2.5.5 Source: Sales Navigator API if approved (Phase 9), else LinkedIn search scraping, else manual flag

**7.2.6 Unified tracking sheet**
Per your S1.5 (connect through n8n) and S1.8.2 (connect everything):
- 7.2.6.1 Primary truth: Neon DB `leads` table
- 7.2.6.2 Aman-facing view: Cowork artifact dashboard (real-time)
- 7.2.6.3 Slack mirror: daily digest 07:30 with overnight new leads
- 7.2.6.4 Telegram mirror: P0 only (high-priority leads ready)
- 7.2.6.5 Optional Google Sheet export (read-only mirror via n8n daily push)

### 7.3 Verification criteria
- 7.3.1 50 API integrations live in n8n, each with credential and tested call
- 7.3.2 W12 cron produces 100 new leads daily across 10 sectors
- 7.3.3 Each lead has email + linkedin_url + instagram_handle (or explicit "not found" flag)
- 7.3.4 Verification pipeline: bounce rate on first sends <2% across 100 cold sends
- 7.3.5 Cowork artifact dashboard shows live lead pipeline by sector and stage
- 7.3.6 Slack digest fires 07:30 daily with overnight summary

### 7.4 Owner
Claude: All build, API integration.
Aman: Provide API keys where signup required (Hunter, Snov, Apollo, etc., free tiers), approve NeverBounce £15-20/month.

### 7.5 Subscriptions flagged
- NeverBounce: £15-20/month (your W9.10.3 approval)
- All others: free tiers

### 7.6 Risk
Risk: APIs rate-limit at scale. Mitigation: distribute load across multiple APIs, cache results 30 days, defer to next-day if quota hit.

---

## PHASE 8 · AD INTELLIGENCE SCRAPER (1 week, free)

### 8.1 Objective
Per your W9 directive: scrape Meta, Google, LinkedIn, TikTok, Snapchat, X ad libraries to find companies actively spending on marketing (highest-intent buyers).

### 8.2 What gets built

**8.2.1 Per-platform scrapers (10)**
- 8.2.1.1 Meta Ad Library (Graph API, free, public)
- 8.2.1.2 Google Ads Transparency Center (scrape, free, public)
- 8.2.1.3 LinkedIn Ad Library (scrape, free, public)
- 8.2.1.4 TikTok Creative Center (scrape, free, public)
- 8.2.1.5 Snapchat Ad Library (scrape, free, public)
- 8.2.1.6 X/Twitter Ads Transparency (scrape, free, public)
- 8.2.1.7 Pinterest Ad Library
- 8.2.1.8 Reddit Ad Library
- 8.2.1.9 SimilarAds.com aggregator
- 8.2.1.10 AdLibrary.io aggregator

**8.2.2 Aggregation pipeline**
- 8.2.2.1 Daily 04:00 cron
- 8.2.2.2 For each sector of the day, run all 10 scrapers
- 8.2.2.3 Extract: company name, ad creative (text, image, video), copy, dates active, country targeting
- 8.2.2.4 Cross-reference: company appearing on multiple platforms = high signal, priority boost
- 8.2.2.5 Enrich: pass to Phase 7 sourcing pipeline (find every email at the company)
- 8.2.2.6 Tag lead with ad_intelligence JSON (which platforms, what creative, when started, estimated spend)

**8.2.3 Personalisation injection**
Ad intelligence pointers (Bucket D in Phase 6.2.2) populated from this scraper:
- "Your Meta ad campaign 'X' has been live for 47 days, targeting [audience]"
- "You're spending estimated £X/month on Google Search for [keyword]"
- "Your LinkedIn ad creative emphasises [theme], we'd test [alternative angle]"

Concrete, specific, impossible to dismiss as template.

### 8.3 Verification criteria
- 8.3.1 All 10 ad library scrapers running daily, results in `ad_intelligence` table
- 8.3.2 ≥30% of leads sourced have ad_intelligence populated (sign that the cross-reference is working)
- 8.3.3 Personalisation pointer Bucket D consistently includes ad-specific references in test outputs

### 8.4 Owner
Claude: All scraper build.
Aman: Approve scope, review sample output.

### 8.5 Subscriptions flagged
None.

### 8.6 Risk
Risk: ad library structure changes break scraper. Mitigation: monitoring on each scraper, fall back to manual or alternative source if breaks.

---

## PHASE 9 · LINKEDIN + INSTAGRAM + CAL.COM MULTI-CHANNEL (1-2 weeks, £0-79/month)

### 9.1 Objective
Per your W9.10.2 and S9 directives: every lead gets email + LinkedIn message + Instagram DM drafted, sent based on contact info available, with cal.com meeting tracking automated.

### 9.2 What gets built

**9.2.1 LinkedIn drafter v2 (S9 hardened)**
Apply all 50 compose-body standards from Phase 3:
- Same forbidden phrases list (adapted: no em dashes, no "Hope this finds you well")
- Same sign-off discipline
- Same cross-sell trigger for Partners/Directors
- Same length discipline (300 conn req, 500 follow-up, 1900 InMail)
- Same 50-pointer personalisation
- Same sector calibration

LinkedIn-specific additions:
- 9.2.1.1 Mutual connection leverage (if 2nd-degree via Manuel, mention)
- 9.2.1.2 Recent post engagement (comment on their last post before connection request)
- 9.2.1.3 Profile view signal (view first, primes recognition)
- 9.2.1.4 Voice note option (text drafted for Aman to record manually)
- 9.2.1.5 Shared group memberships
- 9.2.1.6 Three-tier sequence: connection (300), follow-up (500), full message (1900)

**9.2.2 Instagram DM drafter (new)**
Per your "very important with correct Instagram ID":

For each lead with Instagram handle:
- 9.2.2.1 Skill `compose-instagram-dm` generates 3-tier message
  - Tier 1 (first DM, 250 chars): personal hook, no pitch
  - Tier 2 (follow-up, 500 chars): light value reference, soft question
  - Tier 3 (after engagement, 1500 chars): full pitch adapted to conversational tone
- 9.2.2.2 Tone calibrated for sector: hospitality casual, legal more reserved
- 9.2.2.3 No links in first message (Instagram flags as spam)
- 9.2.2.4 Reference one specific thing from their recent post (requires post scrape)
- 9.2.2.5 Stored in lead's `outreach_drafts` JSON field

**9.2.3 Slack notification with all three drafts**
For every priority lead (top 10/day), Slack notification includes:
- Lead context
- Email draft (with audit link)
- LinkedIn message draft (three tiers)
- Instagram DM draft (three tiers)
- Buttons: [Send Email] [Open LinkedIn] [Open Instagram] [Edit All] [Hand to Aman]

You can fire any combination. System logs which channel used per lead.

**9.2.4 Cal.com integration (your W6.8.1 ask)**
- 9.2.4.1 Cal.com free tier sufficient (unlimited bookings, basic features)
- 9.2.4.2 Connect Cal.com webhook to n8n (BOOKING_CREATED event)
- 9.2.4.3 New booking → update lead.status='call_booked' in Neon
- 9.2.4.4 Pre-call brief auto-generated (lead context, audit dwell data, personalisation pointers, suggested talking points)
- 9.2.4.5 Brief sent to Slack and Telegram 60 minutes before call
- 9.2.4.6 Post-call: prompt in Slack for outcome ("booked / didn't show / no fit / proposal sent") to update lead status
- 9.2.4.7 Cal.com sync: all bookings auto-mirrored to your Google Calendar

**9.2.5 LinkedIn Sales Navigator decision (your S9.4 flag)**
£79/month. Worth it if:
- Sourcing ≥30 leads/week from LinkedIn (you will)
- InMail volume ≥20/month
- Advanced search filters needed (job change, hiring signals)
- Lead list export needed

Recommendation: **trial month at zero cost (30-day free trial)**, evaluate at day 28.

Decision criteria for keeping:
- ≥5 booked calls in trial month attributable to Sales Nav-sourced leads
- ≥20% reply rate on Sales Nav InMails vs <10% on cold email
- If yes to both: keep at £79/month
- If no: cancel, rely on free LinkedIn search

### 9.3 Verification criteria
- 9.3.1 Every priority lead (10/day minimum) has all 3 draft outreaches generated
- 9.3.2 Slack notification correctly displays all 3, buttons work
- 9.3.3 Cal.com webhook delivers booking event to n8n within 5 seconds
- 9.3.4 Pre-call brief generates and arrives 60 minutes before call
- 9.3.5 Post-call status update prompt fires in Slack

### 9.4 Owner
Claude: All build.
Aman: Sign up for Cal.com free, generate API key, share with Claude. Decide on Sales Nav trial.

### 9.5 Subscriptions flagged
- Cal.com: free
- LinkedIn Sales Navigator: £79/month (trial 30 days, decide day 28)

### 9.6 Risk
Risk: Instagram automated DMs against ToS, account flagged. Mitigation: DRAFTS only, no auto-send. Aman manually sends from his account. System surfaces ready drafts but doesn't push them.

---

## PHASE 10 · SECTOR INTELLIGENCE + 500-TITLE MATRIX (2 weeks, free)

### 10.1 Objective
Build the 500-title × 200-city × 5-jurisdiction sourcing matrix and the 20-sector × 50-source intelligence base. Per your S1.8.1 and S6.5.1 approvals.

### 10.2 What gets built

**10.2.1 500-title sourcing matrix**
- 10.2.1.1 Catalogue 500 candidate firm types across 10 industry families (per Section S1.2)
- 10.2.1.2 Score each on 6 factors (per Section S1.3)
- 10.2.1.3 Select top 200 with explicit reasoning
- 10.2.1.4 Store as `firm_types` table with name, family, score, reasoning, target_seniority, common_pain_points
- 10.2.1.5 Build Excel export for your review and edit

**10.2.2 200-city × 5-jurisdiction matrix**
- 10.2.2.1 40 UK, 60 EU, 50 USA, 25 ME, 25 Asia
- 10.2.2.2 Stored as `target_cities` table with city, country, jurisdiction, population, business density, language, timezone, regulatory regime
- 10.2.2.3 Cross-product with firm_types = 40,000 (firm_type × city) cells = each cell a sourcing query

**10.2.3 Sourcing rotation logic**
- 10.2.3.1 Per S1.2: 10 firm-types/day in 1 jurisdiction
- 10.2.3.2 5-day cycle covers 50 firm-type × jurisdiction combinations
- 10.2.3.3 Full coverage of 200 firm-types × 5 jurisdictions = 1000 cells × ~40 cities each = 40,000 search queries
- 10.2.3.4 Full coverage cycle = 200 days (more than 6 months)
- 10.2.3.5 Re-query each cell quarterly (refresh)
- 10.2.3.6 Tracking sheet: every cell has last_queried, results_count, last_lead_added

**10.2.4 20-sector × 50-source intelligence base**
- 10.2.4.1 For each of 20 sectors, build 50-source map (5 sources × 10 categories per S6.2)
- 10.2.4.2 Stored as `sector_sources` table
- 10.2.4.3 Quarterly refresh cycle: scrape latest content, update intelligence
- 10.2.4.4 Used by: content generation, audit personalisation, pitch refinement, regulatory tracking
- 10.2.4.5 Output: each sector has a knowledge profile updated quarterly

**10.2.5 Sector-pitch library v2**
Refine all 10 existing sector pitches plus add 10 new sectors. Each pitch has:
- ICP definition (size, role, jurisdiction)
- Regulatory hook (named framework, recent enforcement)
- Pain stat (quantified, sourced)
- Pricing tier reference
- 3 subject options (A/B tested)
- Body template
- Personal brand cross-sell block
- Permission framing variant (for Legal/FS)
- Value-first variant (for Hospitality/Healthcare)
- Curiosity variant (for E-commerce/SaaS)

### 10.3 Verification criteria
- 10.3.1 500-title catalogue published in Excel with scoring rationale
- 10.3.2 Top 200 selection visible and editable
- 10.3.3 200-city matrix populated, queryable
- 10.3.4 Sourcing rotation: cron runs daily, picks next cell in rotation, no double-coverage
- 10.3.5 20-sector × 50-source intelligence base built
- 10.3.6 Sector-pitch library v2 has 20 entries with all 9 fields populated

### 10.4 Owner
Claude: All build, catalogue research, intelligence base population.
Aman: Review 500 titles, approve top 200 selection (or edit).

### 10.5 Subscriptions flagged
None.

### 10.6 Risk
Risk: 500-title catalogue too generic. Mitigation: cross-reference with your client list (CG Oncology and others), bias toward firm-types you've already won.

---

## PHASE 11 · CHIEF OF STAFF + NOTIFICATIONS (1 week, free)

### 11.1 Objective
Per your S13 directive: chief-of-staff coordinates across all pipelines, every 3 days runs gap scan, surfaces decisions. Notifications via Slack primary + Telegram secondary (replacing WhatsApp for cost reasons).

### 11.2 What gets built

**11.2.1 Telegram Bot setup (your W8.3.1 cheaper alternative)**

WhatsApp Business pricing analysis:
- WhatsApp Business app (personal): free but no automation
- WhatsApp Business Cloud API: ~$0.005/notification UK, ~$1.50/month at 300 notifications

Telegram Bot:
- Free unlimited
- Instant push to phone
- Markdown formatting
- Buttons (inline keyboards)
- Images, files, voice supported
- Webhook + polling both supported
- No business verification required
- No 24-hour window restriction

Recommendation: **Telegram Bot primary, WhatsApp deferred**. Telegram is functionally equivalent for your use case (notifications to you) at zero cost. WhatsApp only needed if you want to send TO clients via WhatsApp, which can be added later as separate channel.

Setup:
- 11.2.1.1 Message @BotFather on Telegram, create new bot, receive token
- 11.2.1.2 Start chat with new bot from your personal Telegram, send /start
- 11.2.1.3 Get your chat_id via /getUpdates API call
- 11.2.1.4 Store token + chat_id in n8n credentials
- 11.2.1.5 Build send-message function in n8n HTTP node

**11.2.2 Notification routing logic (your W8.3.3)**
- 11.2.2.1 P0 events (HOT, HOSTILE, LEGAL_THREAT, bounce alert, alias suspended): real-time to BOTH Slack and Telegram
- 11.2.2.2 P1 events (WARM, OBJECTION, audit dwell >2min): real-time to Slack only
- 11.2.2.3 P2 events (sequence complete, new lead added): batched in morning digest 07:00
- 11.2.2.4 Morning digest 07:00: Telegram message with summary of all pending actions, P0 + P1 + P2 last 24h
- 11.2.2.5 Evening digest 18:00: Slack message with day's outcomes

**11.2.3 Approval recall window (your W8.3.2)**
120 seconds between approval and send. During that window:
- Slack/Telegram shows "Sending in 117... 116... 115..." countdown
- "Cancel" button to abort
- After countdown, send fires
- Cancel logs to `approval_cancellations` for pattern analysis

**11.2.4 Chief of Staff scheduled scan (new W11)**
Every 3 days Mon/Thu 07:00:
- 11.2.4.1 Scan all 12 workflows for last 72h errors
- 11.2.4.2 Scan all leads stuck >7 days no progression
- 11.2.4.3 Scan all replies awaiting response >24h
- 11.2.4.4 Scan all audits with engagement but no booking (>5 days)
- 11.2.4.5 Scan all aliases below 8/10 mail-tester
- 11.2.4.6 Scan all template variants with declining reply rate
- 11.2.4.7 Cross-check against LexQuity contacts table (any Tamazia leads in LexQuity pipe)
- 11.2.4.8 Output: 30 gaps ranked by impact with proposed auto-fixes
- 11.2.4.9 Post to Slack #aman-cos with action checklist
- 11.2.4.10 Telegram alert with summary

**11.2.5 Decision log**
New `decisions` table:
- decision_id, summary, rationale, source, deciders, date_made, status (proposed/decided/implemented/reversed), linked_phase

Every major decision in this plan logged. Reviewable in Cowork artifact.

**11.2.6 Slack ↔ n8n full integration (your S1.5)**
- 11.2.6.1 Slack app installed in workspace with appropriate scopes
- 11.2.6.2 n8n Slack credential configured
- 11.2.6.3 Bidirectional: n8n posts to Slack, Slack actions (button clicks) webhook back to n8n
- 11.2.6.4 Approval buttons fully wired (Approve/Edit/Suppress/Snooze)
- 11.2.6.5 Slash commands in Slack: /tamazia-pipeline (status), /tamazia-leads (top 10), /tamazia-audit [domain] (trigger), /tamazia-suppress [email] (DNC)

### 11.3 Verification criteria
- 11.3.1 Telegram Bot sends test notification, arrives instantly with markdown
- 11.3.2 P0 event triggers both Slack and Telegram simultaneously
- 11.3.3 Morning digest fires 07:00 with summary
- 11.3.4 120-second recall countdown visible, cancel button works
- 11.3.5 W11 chief-of-staff scan runs Mon/Thu, posts 30-gap report to Slack
- 11.3.6 Decision log populated with all phase decisions
- 11.3.7 Slack slash commands work and return correct data

### 11.4 Owner
Claude: All build.
Aman: Create Telegram Bot (5 minutes), install Slack app, generate credentials.

### 11.5 Subscriptions flagged
None. Telegram free.

### 11.6 Risk
Risk: Telegram outage. Mitigation: Slack primary, Telegram secondary, both can run independently.

---

## PHASE 12 · DEPLOY BULLETPROOFING + TRACKER ARTIFACT (1 week, free)

### 12.1 Objective
Per your S15 directive: deploy never breaks. Per your tracker directive: Cowork artifact reads Neon live and ticks checklist items only when verification passes.

### 12.2 What gets built

**12.2.1 Pre-commit hooks**
- 12.2.1.1 Husky + lint-staged
- 12.2.1.2 ESLint on .js/.ts files
- 12.2.1.3 Astro check on .astro files
- 12.2.1.4 Secret scanner (Gitleaks or TruffleHog)
- 12.2.1.5 License compliance check (license-checker)
- 12.2.1.6 Block commit if any fails

**12.2.2 CI pre-build**
- 12.2.2.1 `npm audit fix` on dependency vulnerabilities
- 12.2.2.2 Dependency snapshot for diff vs main
- 12.2.2.3 Unit test run (where tests exist)
- 12.2.2.4 Block CI if critical vulnerabilities or test failures

**12.2.3 CI post-build (visual regression)**
- 12.2.3.1 Playwright screenshots of 10 key pages (home, audit example, pricing, contact, etc.)
- 12.2.3.2 Compare to baseline stored in Cloudflare R2
- 12.2.3.3 Diff >5% on any page above-fold: comment on PR with diff image, block merge
- 12.2.3.4 Override with "visual change intentional" tag

**12.2.4 CI smoke test**
- 12.2.4.1 Deploy to preview URL
- 12.2.4.2 Curl key routes, assert HTTP 200 + content match
- 12.2.4.3 Run Lighthouse, assert LCP <1.5s, CLS <0.05
- 12.2.4.4 Block deploy if smoke test fails

**12.2.5 Canary deployment**
- 12.2.5.1 10% traffic to new version via Cloudflare Pages
- 12.2.5.2 Monitor 5xx rate for 2 minutes
- 12.2.5.3 If 5xx rate <1%: promote to 100%
- 12.2.5.4 If 5xx rate >1%: auto-rollback to previous version, alert Aman

**12.2.6 Synthetic monitoring**
- 12.2.6.1 UptimeRobot (free, 50 monitors) pinging key pages every 5 min
- 12.2.6.2 Alert to Telegram if any monitor fails 2 consecutive checks
- 12.2.6.3 Status page at tamazia.co.uk/status (optional public)

**12.2.7 Tracker Cowork artifact**
This is your "auto-checklist that ticks only when verified" requirement:

- 12.2.7.1 Cowork artifact `tamazia-cos-tracker.html`
- 12.2.7.2 Reads COWORK-OS-TRACKER.md plus live Neon state
- 12.2.7.3 Each item displays:
  - Phase number, item number, description
  - Verification check (specific SQL query or API check)
  - Current status (TODO / DOING / BLOCKED / VERIFIED)
  - Last checked timestamp
  - Owner (Aman / Claude)
  - Blocker (if any)
- 12.2.7.4 Re-runs verifications on page load
- 12.2.7.5 Reload button forces re-check
- 12.2.7.6 Status colors: grey TODO, yellow DOING, red BLOCKED, green VERIFIED
- 12.2.7.7 Per-phase progress bar
- 12.2.7.8 Filter by status, owner, phase
- 12.2.7.9 Search box
- 12.2.7.10 Click item: expand with verification details and history

**12.2.8 Tracker auto-update bash script**
- 12.2.8.1 Bash script runs nightly via n8n cron
- 12.2.8.2 For each tracker item, executes verification check
- 12.2.8.3 Updates COWORK-OS-TRACKER.md checkbox states
- 12.2.8.4 Commits and pushes to repo (auto-deploy via GitHub Actions)
- 12.2.8.5 Slack/Telegram notification if any item flips status (newly verified or newly blocked)

### 12.3 Verification criteria
- 12.3.1 Pre-commit hook blocks a deliberately broken commit
- 12.3.2 Visual regression blocks a deliberate layout-breaking PR
- 12.3.3 Canary auto-rollback verified by deliberately breaking deploy (in test env)
- 12.3.4 Synthetic monitor alerts on simulated downtime
- 12.3.5 Tracker artifact loads, displays all phases, ticks verified items, leaves unverified untouched
- 12.3.6 Nightly tracker update runs, commits changes, no manual intervention

### 12.4 Owner
Claude: All build.
Aman: Approve Cowork artifact design, confirm GitHub Actions has write access to repo.

### 12.5 Subscriptions flagged
None.

### 12.6 Risk
Risk: false-positive blocking on visual regression. Mitigation: 5% threshold tunable, manual override available.

---

## PHASE 13 · CONTINUOUS IMPROVEMENT ENGINE (Ongoing, free)

### 13.1 Objective
After Phase 12 ships, the system runs itself with continuous improvement cycles. No new build per phase, just structured rhythms.

### 13.2 Rhythms

**13.2.1 Daily (automated)**
- W12 sourcing (100 leads)
- W9 research (top 10)
- W7 audit generation (for engagement-threshold leads)
- W1 warmup (~2700 emails)
- W2 cold send (20 touch 0)
- W4 follow-up (variable)
- W3 reply listening
- W6 reply classification
- 07:00 Telegram digest
- 18:00 Slack digest

**13.2.2 Weekly (Sunday)**
- Pipeline health review (Cowork artifact)
- Template variant performance (retire bottom quartile, promote winners)
- Mail-tester scores per alias
- Postmaster Tools reputation review
- Microsoft SNDS reputation review
- Bounce rate per relay
- Reply rate per sector
- Sourcing coverage map (which cells touched this week)

**13.2.3 Bi-weekly (every 3 days, Mon/Thu)**
- W11 Chief of Staff gap scan
- 30 gaps ranked, action list

**13.2.4 Monthly (1st of month)**
- Compliance framework version review (you + AI)
- Sector pitch refresh (review reply data, update templates)
- Source verification (any 50 APIs broken? rate-limited? alternatives?)
- Cost review (any subscriptions creeping?)
- ROI analysis (CAC by sector, conversion to client, LTV)

**13.2.5 Quarterly**
- Sector intelligence refresh (re-scrape all 20-sector × 50-source = 1000 sources)
- Top-200 firm-type review (any new sectors? any retiring?)
- 200-city review (any new markets? any removed?)
- PI insurance renewal review (re-quote)
- EU Article 27 rep review
- ICO renewal

**13.2.6 Decision gates**
- 30 days: review 100/day vs 500/day scale decision
- 60 days: review Smartlead migration
- 90 days: review LinkedIn Sales Navigator
- 90 days: review GlockApps deliverability tool
- 180 days: review BIMI/VMC blue tick investment

### 13.3 Verification criteria
- 13.3.1 All daily automated workflows complete successfully ≥95% of days
- 13.3.2 Weekly review artifact generated every Sunday
- 13.3.3 Monthly review report posted to Slack 1st of month
- 13.3.4 Quarterly refreshes completed within 14 days of scheduled date

### 13.4 Owner
System (automated) + Aman (decision gates).

### 13.5 Subscriptions flagged
Recurring only (no new). Total at this phase: ~£40-60/month + ~£440/year annual.

---

## 3. MASTER OPEN QUESTIONS

Items requiring your input before specific phases ship:

**Phase 1:**
- Confirm Zoho upgrade to Premium for founder@ only (£3/month) OR commit to ZeptoMail webhook path
- Provide 5 Gmail app-specific passwords when ready

**Phase 2:**
- Confirm PI insurance procurement via Simply Business broker (or alternative)
- Reviewer for T&Cs and Privacy Policy (you mentioned you'll get reviewed, by whom?)

**Phase 4:**
- Approve W1-Reply library content (50 templates × 6 categories) before deployment

**Phase 5:**
- Sign off on luxury design language (mockup will be sent for approval)

**Phase 6:**
- Approve £5-15/month DeepSeek overflow if Cloudflare quota hit

**Phase 7:**
- Generate accounts for free API tiers (Hunter, Snov, Apollo) and share keys with Claude

**Phase 9:**
- Approve LinkedIn Sales Navigator 30-day trial (decide day 28)
- Set up Cal.com account, share API key

**Phase 10:**
- Review 500-title catalogue when generated, approve top 200 (or edit)

**Phase 11:**
- Create Telegram Bot via @BotFather, share token + chat_id with Claude
- Install Slack app, generate credentials

**Phase 12:**
- Confirm Cowork artifact design at mockup

---

## 4. EXECUTION COMMITMENT

The intent is sequential phases but with parallel work where dependencies allow:

**Week 1**: Phase 0 (you) + Phase 1 (Claude) + Phase 2 procurement (you)
**Week 2**: Phase 2 build + Phase 3 build
**Week 3**: Phase 4 build + Phase 5 design mockup
**Week 4**: Phase 5 build + Phase 6 architecture
**Week 5-6**: Phase 6 build + Phase 7 architecture
**Week 7-8**: Phase 7 build + Phase 8 build
**Week 9-10**: Phase 9 build + Phase 10 build (parallel)
**Week 11**: Phase 11 build
**Week 12**: Phase 12 build
**Week 13+**: Phase 13 ongoing

End state at Week 12: 100 verified leads/day sourced, each with bespoke audit + email + LinkedIn + Instagram drafts, replies auto-classified and surfaced for 120-second-recall approval, hosted audit micro-sites with luxury feel and engagement tracking, 12 workflows running autonomously, chief-of-staff coordinator scanning every 3 days, deploy bulletproofed, tracker auto-updating.

Cost at full Phase 12: ~£40-60/month recurring + ~£440/year annual (PI + ICO + EU rep + Zoho upgrade) = approximately £80/month all-in.

---

End of Master Plan v1.0. Next file: COWORK-OS-TRACKER.md for the executable checklist.
