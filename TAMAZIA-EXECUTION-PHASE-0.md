# PHASE 0 · PRE-FLIGHT APPROVALS
**Owner: Aman primary. Effort: ~45 minutes. Spend: £0 (approvals only).**

This phase locks decisions, captures credentials, and gates everything that follows. No code changes happen here. Aman ticks each task or replies with the artifact required.

## PHASE PREREQUISITE
None. This is the entry phase.

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 0
```
Returns exit 0 only when all 15 tasks below pass their verification.

---

### Task 0.1.1: Confirm 15 top-line decisions from MASTER.md Section 0

Files: confirmations/decisions-locked.txt
Owner: Aman
Prerequisite: none
Estimated time: 10 minutes

Verification:
```
test -f confirmations/decisions-locked.txt && \
grep -c "CONFIRMED" confirmations/decisions-locked.txt | xargs -I {} test {} -ge 15
```

Expected output:
File exists with at least 15 lines containing "CONFIRMED".

Description:
Aman reads MASTER.md Section 0 (decisions 0.1 through 0.15). For each, replies with either CONFIRMED or AMENDED + new wording. Creates `confirmations/decisions-locked.txt` with one line per decision: `0.1 CONFIRMED: hosted audit at tamazia.co.uk/audit/{slug}/{hash} no password 180-day expiry`. Etc.

Failure mode: Aman amends a decision in ways that contradict downstream tasks. Resolution: Cowork flags conflicts, surfaces to Aman, re-locks before proceeding.

Status: [x] VERIFIED

---

### Task 0.1.2: Approve subscription items in PURCHASES.md

Files: COWORK-OS-PURCHASES.md (existing), confirmations/spend-approved.txt
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 10 minutes

Verification:
```
test -f confirmations/spend-approved.txt && \
grep -E "(ICO|EU_REP|PI_INSURANCE|ZOHO|NEVERBOUNCE|DEEPSEEK|TELEGRAM|CALCOM|CLOUDFLARE)" confirmations/spend-approved.txt | wc -l | xargs -I {} test {} -ge 9
```

Expected output:
File exists, at least 9 spend items approved.

Description:
Aman opens COWORK-OS-PURCHASES.md. Reviews each spend item with researched options. Replies APPROVED or REJECTED per item. Creates `confirmations/spend-approved.txt` with one line per item: `ICO APPROVED budget=£40/year provider=ico.org.uk`. For rejected items, notes alternative or defer.

Failure mode: Aman rejects an item that Phase X depends on. Resolution: Cowork flags downstream impact, asks for substitute.

Status: [x] VERIFIED

---

### Task 0.1.3: Create Telegram Bot via @BotFather

Files: .env (add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 5 minutes

Verification:
```
test -n "${TELEGRAM_BOT_TOKEN:-}" && \
test -n "${TELEGRAM_CHAT_ID:-}" && \
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" | jq -e '.ok == true' > /dev/null
```

Expected output:
Both env vars set, getMe returns ok=true.

Description:
Aman opens Telegram, messages @BotFather, runs `/newbot`, picks name (suggested: TamaziaCOSBot or AmanTamaziaBot), receives token. Aman starts conversation with new bot, sends any message (e.g., "hello"). Aman runs `curl https://api.telegram.org/bot{TOKEN}/getUpdates` to retrieve chat_id from the response. Aman adds both to `.env` at folder root.

Failure mode: Aman doesn't add to .env. Resolution: Cowork checks for env file, prompts.

Status: [x] VERIFIED

---

### Task 0.1.4: Install Slack app and capture bot token

Files: .env (add SLACK_BOT_TOKEN), Slack workspace
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 10 minutes

Verification:
```
test -n "${SLACK_BOT_TOKEN:-}" && \
curl -s -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
  "https://slack.com/api/auth.test" | jq -e '.ok == true' > /dev/null
```

Expected output:
Env var set, auth.test returns ok=true with workspace info.

Description:
Aman visits api.slack.com, creates new Slack app named "Tamazia COS". Adds OAuth scopes: chat:write, chat:write.public, channels:read, channels:manage, commands, im:write. Installs to workspace. Captures Bot User OAuth Token (starts with xoxb-). Adds to `.env`.

Failure mode: Wrong scopes selected, app missing permissions. Resolution: Cowork tests specific operations, prompts to add missing scopes.

Status: [x] VERIFIED

---

### Task 0.1.5: Sign up for Cal.com (free tier)

Files: .env (add CALCOM_API_KEY)
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 10 minutes

Verification:
```
test -n "${CALCOM_API_KEY:-}" && \
curl -s -H "Authorization: Bearer ${CALCOM_API_KEY}" \
  "https://api.cal.com/v2/me" | jq -e '.data.id' > /dev/null
```

Expected output:
Env var set, me endpoint returns user object.

Description:
Aman signs up at cal.com with username "aman-tamazia" or similar. Configures availability. Generates API key in Settings → Developer → API Keys. Adds to `.env`. Sets up 2 event types: "Discovery Call (30 min)" and "Strategy Session (60 min)".

Failure mode: API key has insufficient scope. Resolution: Cowork tests booking creation, identifies missing scope.

Status: [x] VERIFIED

---

### Task 0.1.6: Generate Cloudflare API token

Files: .env (add CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 5 minutes

Verification:
```
test -n "${CLOUDFLARE_API_TOKEN:-}" && \
test -n "${CLOUDFLARE_ACCOUNT_ID:-}" && \
curl -s -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" | jq -e '.success == true' > /dev/null
```

Expected output:
Token valid.

Description:
Aman logs into Cloudflare dashboard. My Profile → API Tokens → Create Token. Uses "Custom token" with these permissions: Account → Workers AI (Read+Edit), Account → Workers Scripts (Edit), Account → Cloudflare Pages (Edit), Account → R2 (Edit), Zone → DNS (Read). Saves token to `.env`. Also notes Account ID from sidebar.

Failure mode: Token missing Workers AI permission. Resolution: Verification call fails on AI endpoint, Cowork prompts to regenerate.

Status: [x] VERIFIED

---

### Task 0.1.7: Sign up for Groq Cloud (free LLM)

Files: .env (add GROQ_API_KEY)
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 3 minutes

Verification:
```
test -n "${GROQ_API_KEY:-}" && \
curl -s -X POST "https://api.groq.com/openai/v1/chat/completions" \
  -H "Authorization: Bearer ${GROQ_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"test"}],"max_tokens":5}' \
  | jq -e '.choices[0].message.content' > /dev/null
```

Expected output:
API call succeeds, returns generated content.

Description:
Aman signs up at console.groq.com (free, GitHub or Google login). Creates API key. Adds to `.env`. Groq's free tier gives 30 req/min, 14,400/day across all models including Llama 3.1 70B (best free model).

Failure mode: Free quota exceeded during testing. Resolution: Wait 1 minute, retest.

Status: [x] VERIFIED

---

### Task 0.1.8: Sign up for Google AI Studio (Gemini Flash)

Files: .env (add GEMINI_API_KEY)
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 3 minutes

Verification:
```
test -n "${GEMINI_API_KEY:-}" && \
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}" \
  | jq -e '.models[0].name' > /dev/null
```

Expected output:
Models listed, including Gemini 2.0 Flash.

Description:
Aman visits aistudio.google.com (Google account login). Creates API key. Adds to `.env`. Gemini 2.0 Flash gives 1500 requests/day free, 1M context window. Backup to Cloudflare Workers AI.

Failure mode: Geographic restriction. Resolution: Aman uses Google Workspace account or VPN.

Status: [x] VERIFIED

---

### Task 0.1.9: Sign sender identity to file

Files: signatures/aman.txt
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 2 minutes

Verification:
```
test -f signatures/aman.txt && \
grep -q "Aman Pareek" signatures/aman.txt && \
grep -q "International Business Lawyer" signatures/aman.txt && \
grep -q "Founder, Tamazia" signatures/aman.txt
```

Expected output:
File exists with canonical sender block.

Description:
Aman creates `signatures/aman.txt` with this canonical block (or amends to preference):

```
Aman Pareek
International Business Lawyer
Founder, Tamazia
Email: aman@tamazia.co.uk
Phone: +44 [number]
Tamazia, [Registered office]
United Kingdom
Company number: [number]
ICO Registration: [number, populated Phase 2]
```

Aman edits to current truth and saves.

Failure mode: Missing fields. Resolution: Verification fails, Aman prompted to complete.

Status: [x] VERIFIED

---

### Task 0.1.10: Sign disclaimer to file

Files: signatures/disclaimer.txt
Owner: Both (Aman drafts, Claude formats)
Prerequisite: 0.1.1
Estimated time: 5 minutes

Verification:
```
test -f signatures/disclaimer.txt && \
grep -q "Regulatory Signal Scan" signatures/disclaimer.txt && \
grep -q "Aman Pareek, International Business Lawyer" signatures/disclaimer.txt && \
grep -q "not legal advice" signatures/disclaimer.txt
```

Expected output:
File exists with canonical disclaimer.

Description:
Claude drafts disclaimer per MASTER decisions 0.10 and 0.11. Aman reviews, edits, approves. Final:

```
This Regulatory Signal Scan is powered by Tamazia.
Frameworks are trained on publicly available regulatory sources by AI and reviewed by Aman Pareek, International Business Lawyer.
Framework version: {version} | Last review: {date}
This scan identifies publicly visible signals only. It is not legal advice and is not a substitute for review by qualified counsel in your jurisdiction. Recommendations should be confirmed with your legal advisor before action.
```

Variables `{version}` and `{date}` populate at injection time from framework_versions table.

Failure mode: Disclaimer too weak (legal exposure) or too strong (kills conversion). Resolution: Iterate with Aman until both legal and commercial OK.

Status: [x] VERIFIED

---

### Task 0.1.11: Confirm Zoho mail tier check

Files: confirmations/zoho-tier-checked.txt
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 3 minutes

Verification:
```
test -f confirmations/zoho-tier-checked.txt && \
grep -q "TIER:" confirmations/zoho-tier-checked.txt
```

Expected output:
File exists noting current tier (Lite/Premium) and IMAP availability.

Description:
Aman logs into mailadmin.zoho.eu. Navigates to Mail Settings → Email Forwarding & POP/IMAP. Notes whether IMAP toggle is visible or whether tier upgrade required. Writes to file: `TIER: Lite, IMAP_AVAILABLE: No, NEEDS_UPGRADE: Yes`.

Failure mode: Aman can't find admin panel. Resolution: Cowork provides step-by-step screenshots reference.

Status: [x] VERIFIED

---

### Task 0.1.12: Approve free LLM stack architecture

Files: confirmations/llm-stack-approved.txt
Owner: Aman
Prerequisite: 0.1.7, 0.1.8
Estimated time: 2 minutes

Verification:
```
test -f confirmations/llm-stack-approved.txt && \
grep -q "PRIMARY:" confirmations/llm-stack-approved.txt && \
grep -q "FALLBACK:" confirmations/llm-stack-approved.txt
```

Expected output:
File with stack confirmed.

Description:
Aman writes to file:
```
PRIMARY: Cloudflare Workers AI (Llama 3.1 8B for bulk, Llama 3.3 70B for quality)
SECONDARY: Groq (Llama 3.1 70B for fast classification)
FALLBACK: Gemini 2.0 Flash via Google AI Studio
RESERVED: Claude Haiku for LEGAL_THREAT/HOSTILE and final drafts
OVERFLOW_CAP: £15/month DeepSeek if all else exhausted
```

Failure mode: Aman prefers different priority. Resolution: Edit and reconfirm.

Status: [x] VERIFIED

---

### Task 0.1.13: Provide 5 Gmail accounts (or commit deferred)

Files: confirmations/gmail-seedlist.txt
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 15 minutes (if doing now)

Verification:
```
test -f confirmations/gmail-seedlist.txt && \
( grep -c "@gmail.com" confirmations/gmail-seedlist.txt | xargs -I {} test {} -ge 5 || \
  grep -q "DEFERRED_TO_PHASE_4" confirmations/gmail-seedlist.txt )
```

Expected output:
Either 5 Gmail addresses listed, or explicit deferral.

Description:
Aman provides 5 Gmail account email addresses (does NOT share passwords yet, that's Phase 4). Writes to file:
```
seedlist1@gmail.com
seedlist2@gmail.com
seedlist3@gmail.com
seedlist4@gmail.com
seedlist5@gmail.com
```

OR if not ready:
```
DEFERRED_TO_PHASE_4
```

Failure mode: Fewer than 5 available. Resolution: 3 is acceptable minimum, Cowork uses those plus 2 dummy ProtonMail accounts.

Status: [x] VERIFIED

---

### Task 0.1.14: Confirm Tamazia UK corporate details

Files: confirmations/tamazia-corporate.txt
Owner: Aman
Prerequisite: 0.1.1
Estimated time: 5 minutes

Verification:
```
test -f confirmations/tamazia-corporate.txt && \
grep -q "COMPANY_NUMBER:" confirmations/tamazia-corporate.txt && \
grep -q "REGISTERED_OFFICE:" confirmations/tamazia-corporate.txt && \
grep -q "VAT_NUMBER:" confirmations/tamazia-corporate.txt
```

Expected output:
File with all three identifiers.

Description:
Aman writes Tamazia UK Ltd's:
- Company number (from Companies House)
- Registered office address (full)
- VAT number (if registered) or NOT_VAT_REGISTERED
These populate every email footer, every audit footer, every PDF, every legal document.

Failure mode: Some details unknown. Resolution: Aman looks up on Companies House, files in.

Status: [x] VERIFIED

---

### Task 0.1.15: Final Phase 0 sign-off

Files: confirmations/phase-0-complete.txt
Owner: Aman
Prerequisite: 0.1.1, 0.1.2, 0.1.3, 0.1.4, 0.1.5, 0.1.6, 0.1.7, 0.1.8, 0.1.9, 0.1.10, 0.1.11, 0.1.12, 0.1.13, 0.1.14
Estimated time: 1 minute

Verification:
```
bash scripts/verify-phase.sh 0 && \
test -f confirmations/phase-0-complete.txt
```

Expected output:
All Phase 0 tasks verified, sign-off file exists.

Description:
After tasks 0.1.1 through 0.1.14 are verified, Aman creates `confirmations/phase-0-complete.txt` with single line: `Phase 0 complete: {ISO date}. Phase 1 unlocked.`. This is the final gate before Phase 1 build can begin.

Failure mode: One or more upstream tasks not verified. Resolution: Cowork lists which, Aman resolves.

Status: [ ] TODO

---

## PHASE 0 EXIT GATE

Run:
```bash
bash scripts/verify-phase.sh 0
```

Returns exit 0 only when:
- All 15 tasks verified
- `confirmations/phase-0-complete.txt` exists

Phase 1 is locked until this returns exit 0.

When green, Cowork posts to Telegram and Slack:
> Phase 0 complete. Decisions locked, credentials captured, sender identity signed. Phase 1 unlocked.

End of Phase 0.
