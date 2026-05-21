# TAMAZIA COWORK OS · SUBSCRIPTION + PURCHASE DECISIONS
**Updated 2026-05-17 · For Aman's approval, ranked by cost**

## PURPOSE

Every spend decision in one document. Cheapest viable option researched per item. Aman ticks approval per row. Nothing gets bought without explicit sign-off here.

## TOP-LEVEL SUMMARY

| Item | Cost | Frequency | Phase | Status | Recommendation |
|---|---|---|---|---|---|
| ICO Registration UK | £40 | Annual | 2 | Required | Buy direct |
| Zoho Mail Premium (founder@ only) | £3 | Monthly | 1 | Required | Upgrade |
| EU Article 27 Representative | €25-30 | Monthly | 2 | Required | EuropeanRep.com |
| Professional Indemnity Insurance | £100-180 | Annual | 2 | Required | Simply Business broker |
| NeverBounce email verification | £15-20 | Monthly | 7 | Approved | Activate |
| DeepSeek API (overflow) | £5-15 | Monthly | 6 | Approved | Activate |
| LinkedIn Sales Navigator | £79 | Monthly | 9 | Trial | 30-day free, decide day 28 |
| All other tools listed | £0 | Free tier | Various | Approved | Use |

**Total committed minimum: ~£40-60/month + £140-220/year annual**
**Total with all optional approved: ~£100-150/month + £300-440/year annual**

---

## DETAILED RESEARCH PER ITEM

### 1. ICO REGISTRATION UK (£40/year)

**What:** Mandatory registration with Information Commissioner's Office for any UK business processing personal data.

**Why needed:** Cold outreach processes personal data (lead emails, names). ICO registration is required. £4000 fine for non-registration.

**Tier:** Tier 1 (small business under £632k turnover, fewer than 11 staff)

**Provider:** ico.org.uk direct. No third party needed. £40 flat.

**Action:**
- [ ] Aman to visit ico.org.uk/registration
- [ ] Complete self-assessment, select Tier 1
- [ ] Pay £40 via direct debit
- [ ] Add registration number to website, email, audit footers

**Approved: __ Yes / __ No**

---

### 2. ZOHO MAIL PREMIUM (£3/month for founder@ only)

**What:** Upgrade founder@tamazia.co.uk from Zoho Lite to Premium to unlock IMAP.

**Why needed:** Current Lite tier blocks IMAP. n8n W3 reply listener requires IMAP access. Without it, replies aren't auto-detected.

**Alternative (recommended):** Use Zoho ZeptoMail webhook for inbound parsing instead of IMAP. ZeptoMail is also Zoho, already in your account, free tier supports 10k inbound messages/month. Better than IMAP polling.

**Decision tree:**
- IF ZeptoMail webhook works in test → £0 needed
- ELSE → upgrade founder@ to Premium £3/month

**Action:**
- [ ] Test ZeptoMail webhook first (Claude can configure)
- [ ] If fails, Aman to upgrade founder@ to Premium
- [ ] All other 89 aliases stay on Lite (they send, don't need IMAP)

**Approved if needed: __ Yes / __ No**

---

### 3. EU ARTICLE 27 REPRESENTATIVE (€25-30/month, recommend €299/year prepaid)

**What:** Legal representative required under GDPR Article 27 for non-EU companies (Tamazia is UK post-Brexit) processing EU residents' data.

**Why needed:** Cold outreach to EU contacts triggers this. Without representative, ICO complaint risk, EU DPA enforcement risk, individual €20M fine exposure under GDPR.

**Cheapest verified providers (training data, verify at signup):**

| Rank | Provider | Annual cost | Notes |
|---|---|---|---|
| 1 | EuropeanRep.com | €299 | Cheapest, Ireland-based rep, all GDPR requirements |
| 2 | eu-rep.org | €396 | Germany-based |
| 3 | Maetzler EU Rep | €480 | Belgium |
| 4 | EU Rep Limited | €600 | Cyprus |
| 5 | Prighter | €1188 | Premium, includes DPO services |
| 6 | VeraSafe | €1500+ | Enterprise |
| 7 | DPR Group | Custom | Quote-based |

Recommendation: **EuropeanRep.com at €299/year prepaid (~£260)**. Meets all legal requirements, no extras you don't need.

**Action:**
- [ ] Aman to sign up at europeanrep.com
- [ ] Provide Tamazia UK company details
- [ ] Receive rep address
- [ ] Add to Privacy Policy + email footer for EU recipients

**Approved: __ Yes / __ No**

---

### 4. PROFESSIONAL INDEMNITY INSURANCE (£100-180/year)

**What:** Insurance protecting you personally from civil claims if a client relies on a Tamazia scan and suffers loss.

**Why needed:** You are a lawyer publishing scans branded with your professional title. Higher reputational and legal exposure than a generic marketing agency. PI insurance protects you from civil claims AND provides legal defence funding.

**Quotes (training data, verify by application):**

For marketing/consulting agency, £1M cover, sole director, low claims history:

| Rank | Provider | Annual range | Notes |
|---|---|---|---|
| 1 | Simply Business broker | £80-200 | Aggregator, gets quotes from 4-6 insurers in 10-min form |
| 2 | PolicyBee Marketing Consultants | £140-280 | Marketing specialist |
| 3 | Anansi | £100-250 | Digital-first, fast quotes |
| 4 | Direct Line for Business | £100-250 | Established, includes cyber |
| 5 | Hiscox Cyber & Marketing | £150-300 | Premium brand |
| 6 | Markel Direct | £140-300 | Comprehensive |
| 7 | Caunce O'Hara | £150-300 | UK broker |
| 8 | AXA Business | £100-280 | Major insurer |
| 9 | Towergate | £120-280 | UK broker |
| 10 | Get Indemnity | £100-260 | Online specialist |
| 11 | Premierline | £120-280 | UK broker |
| 12 | Coverwallet | £120-260 | Digital broker |

**Critical disclosures to make:**
- Lawyer publishing scans under professional title
- AI-generated content
- B2B marketing services
- SEO and compliance scanning

Some policies exclude AI-generated content unless declared. Some exclude regulated professional services. Get this in writing.

**Minimum coverage:**
- £1M per claim
- Cyber liability included or addable
- 6-year run-off cover
- No exclusions for AI content, SEO claims, lawyer-branded work

**Recommendation:** Start with Simply Business broker (15-min online form, returns 4-6 quotes). Cross-quote PolicyBee and Anansi directly. Pick cheapest meeting criteria.

Realistic first-year price: £100-150 for clean cover.

**Action:**
- [ ] Aman to get 3 quotes (Simply Business + PolicyBee + Anansi)
- [ ] Compare exclusions list carefully
- [ ] Pay annual upfront (saves ~10%)
- [ ] Save policy doc in /policies folder

**Approved: __ Yes / __ No / __ Budget cap £___**

---

### 5. NEVERBOUNCE EMAIL VERIFICATION (£15-20/month)

**What:** Stage 3 email verification (after own SMTP check + Hunter/Mailboxlayer cross-check) for top-tier leads only.

**Why:** Your "zero bounces" requirement. Free verification reaches ~85% accuracy. Paid reaches 95%. The 10% delta matters for high-value leads where bounce risks deliverability reputation.

**Per your W9.10.3:** Already approved.

**Pricing (training, verify):**
- NeverBounce: $0.008/verification = ~£0.006
- 1000 top-tier verifications/month = ~£6
- 3000 verifications/month = ~£18
- Budget: £15-20/month covers ~2500-3000

**Alternatives:**
- ZeroBounce: similar pricing
- Bouncer: similar
- MillionVerifier: cheapest at $0.0049 but slower
- DeBounce: ~$0.0035 cheapest

**Action:**
- [ ] Aman to sign up at neverbounce.com
- [ ] Buy starter credits (£20 = ~3300 verifications)
- [ ] Add API key to n8n
- [ ] Configure to verify only top 30% scored leads

**Approved: __ Yes / __ No (per W9.10.3 already yes)**

---

### 6. DEEPSEEK V3 API (£5-15/month overflow, OPTIONAL)

**What:** Cheap LLM API as overflow when Cloudflare Workers AI free tier (10k neurons/day) is exhausted.

**Why:** Personalisation engine produces 50 specific pointers per lead. At 100 leads/day, fits in Cloudflare free tier. At 500 leads/day, will overflow.

**Pricing (training, verify):**
- DeepSeek V3: $0.27/M input tokens, $1.10/M output tokens
- vs Claude Haiku: $0.80/$4.00 (3-4x more expensive)
- vs GPT-4o-mini: $0.15/$0.60 (cheaper than DeepSeek for input)

Actually GPT-4o-mini is cheaper than DeepSeek for input tokens. Let me revise:

**Cheapest hosted LLM ranked:**

| Rank | Provider | Input cost | Output cost | Notes |
|---|---|---|---|---|
| 1 | Cloudflare Workers AI | $0 free tier | $0 free tier | 10k neurons/day = ~100 calls free |
| 2 | Groq | $0 free tier | $0 free tier | 30 req/min, Llama 3.1 70B free |
| 3 | GPT-4o-mini | $0.15/M | $0.60/M | Cheapest paid hosted |
| 4 | DeepSeek V3 | $0.27/M | $1.10/M | Better quality than mini |
| 5 | Gemini 2.0 Flash | $0.075/M | $0.30/M | Cheapest input |
| 6 | Claude Haiku | $0.80/M | $4.00/M | Best quality for cost ratio |

**Revised recommendation:**
- Primary: Cloudflare Workers AI (free)
- Secondary free: Groq (free, rate-limited)
- Cheapest paid overflow: Gemini 2.0 Flash ($0.075 input) for bulk personalisation
- Quality paid for finals: Claude Haiku for sensitive drafts

**Monthly cost at 100/day:**
- Cloudflare covers it: £0
- If overflow: ~£3-8 at Gemini 2.0 Flash

**Monthly cost at 500/day:**
- Cloudflare partial coverage
- Gemini 2.0 Flash overflow: ~£15-25/month

**Action:**
- [ ] Phase 6 build uses Cloudflare primary
- [ ] Gemini 2.0 Flash configured as fallback (Google AI Studio, free API key)
- [ ] Budget cap: £20/month, alert if exceeded

**Approved budget cap: £___/month**

---

### 7. LINKEDIN SALES NAVIGATOR (£79/month, OPTIONAL, TRIAL FIRST)

**What:** LinkedIn premium tier for advanced search, InMail credits, lead lists.

**Why:** Your S9.4 flag. Worth it if sourcing ≥30 leads/week from LinkedIn, ≥20 InMails/month, advanced filters needed.

**Pricing:**
- LinkedIn Sales Navigator Core: £79/month
- Annual: £762 (~£63/month, 20% saving)
- 30-day free trial available

**Recommendation:** Start 30-day trial Phase 9. Evaluate at day 28 against criteria:
- ≥5 calls booked from Sales Nav-sourced leads
- ≥20% reply rate on Sales Nav InMails vs <10% cold email
- Both met → keep at £79/month (or £63 annual prepay)
- Either missed → cancel, use free LinkedIn search

**Action:**
- [ ] Aman starts trial Phase 9
- [ ] Phase 9 generates day-28 ROI report
- [ ] Aman decides keep/cancel

**Approved trial: __ Yes / __ No**
**Approved continuation (decide day 28): __ Yes / __ No / __ Conditional on ROI**

---

### 8. TELEGRAM BOT (£0)

**What:** Free notification channel to your phone, replacing WhatsApp.

**Why cheaper than WhatsApp:**
- WhatsApp Business app: free for personal use but limited automation
- WhatsApp Business Cloud API: $0.005-0.05/notification
- Telegram Bot: free unlimited

**Functional parity:**
- Both push to phone instantly
- Both support markdown
- Both support buttons
- Both support images, files, voice
- Telegram supports webhooks AND polling
- No business verification required for Telegram
- No 24-hour window restriction

**Action:**
- [ ] Aman messages @BotFather on Telegram (5 minutes)
- [ ] Creates @TamaziaCOSBot or similar
- [ ] Receives token
- [ ] Starts conversation, sends /start
- [ ] Shares token + chat_id with Claude

**Approved: __ Yes (recommended) / __ No**

---

### 9. CAL.COM FREE TIER (£0)

**What:** Open-source Calendly alternative for meeting scheduling.

**Why free tier sufficient:**
- Unlimited bookings
- Basic features (1-to-1, group calls, webhooks)
- Custom branding (limited)
- Google Calendar sync
- Webhook integration with n8n

**Paid features not needed at your stage:**
- Team scheduling
- Custom domain
- Advanced workflows
- Removing Cal.com branding

**Action:**
- [ ] Aman signs up at cal.com (free)
- [ ] Generates API key
- [ ] Sets up event types: 30-min discovery, 60-min strategy session
- [ ] Shares API key with Claude
- [ ] Webhook configured to n8n

**Approved: __ Yes / __ No**

---

### 10. CLOUDFLARE WORKERS AI (£0 free tier)

**What:** Hosted LLM inference on Cloudflare edge network.

**Why free tier sufficient:**
- 10,000 neurons/day free
- Each personalisation call ~50-200 neurons
- Covers 50-200 calls/day = 50-100 personalised audits/day
- Fits current 100/day target

**Models available free:**
- Llama 3.1 8B (good for structured tasks)
- Mistral 7B
- Phi-3.5
- Qwen 2.5
- Several others

**Action:**
- [ ] Already have Cloudflare account (tamazia-website hosted there)
- [ ] Enable Workers AI in dashboard
- [ ] API key generated
- [ ] Configured in n8n

**Approved: __ Yes (no cost) / __ No**

---

### 11. UPTIMEROBOT FREE (£0)

**What:** Synthetic monitoring of tamazia.co.uk pages.

**Why free tier sufficient:**
- 50 monitors free
- 5-minute check interval (free tier)
- Telegram/Slack/email alerts
- Public status page

**Used in Phase 12 for deploy bulletproofing.**

**Approved: __ Yes (no cost) / __ No**

---

### 12. DEFERRED PER YOUR CALL

These were considered, you chose to defer:

**GlockApps deliverability** (£59/month): Deferred per S11.6.1. Build locally with seedlist.

**BIMI/VMC blue tick** (£1500/year): Deferred per S11.6.2. Revisit at £100k ARR.

**Smartlead.ai migration** (£94/month): Defer until 500/day milestone.

---

## TOTAL SCENARIOS

### Scenario A: Minimum viable (Phase 1-5)
- ICO: £40/year
- EU rep: €299/year
- PI insurance: £150/year
- Zoho upgrade founder@: £36/year (if needed)

**Total Year 1: ~£475 + £36 = £511 (~£42/month avg)**

### Scenario B: Full operating (through Phase 13)
- All Scenario A items: £511/year
- NeverBounce: £20/month = £240/year
- DeepSeek/Gemini overflow: £15/month = £180/year
- LinkedIn Sales Nav (if kept after trial): £762/year

**Total Year 1: ~£1700 (~£140/month avg)**

### Scenario C: Aggressive scale (Phase 13+, 500/day)
- All Scenario B items
- Smartlead migration: £1128/year
- GlockApps: £708/year
- BIMI/VMC: £1500/year

**Total Year 1: ~£5036 (~£420/month avg)**

---

## YOUR APPROVAL CHECKLIST

Tick each item or replace with alternative. Document is updated when you reply.

- [ ] 1. ICO Registration (£40/year)
- [ ] 2. Zoho Premium founder@ (£36/year, ONLY if ZeptoMail webhook fails)
- [ ] 3. EU Article 27 Rep via EuropeanRep.com (€299/year)
- [ ] 4. PI Insurance via Simply Business broker (budget cap £___/year)
- [ ] 5. NeverBounce (£15-20/month, already pre-approved W9.10.3)
- [ ] 6. DeepSeek/Gemini Flash API overflow (£15-20/month cap)
- [ ] 7. LinkedIn Sales Navigator 30-day trial
- [ ] 8. Telegram Bot setup (free)
- [ ] 9. Cal.com free tier
- [ ] 10. Cloudflare Workers AI (free)
- [ ] 11. UptimeRobot (free)

**Total committed if all approved: ~£440 first year setup + ~£60-100/month recurring.**

Sign off this document and Phase 1 begins.
