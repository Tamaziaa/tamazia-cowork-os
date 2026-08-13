# TAMAZIA · MASTER CLOSEOUT — do these once, nothing left after
The single end-to-end list. Confirmed bugs, the critical path to your first real email, every pending task with button-by-button steps for your side, every roadblocker (incl. Oracle), and the 15-phase status. Compiled 2026-05-21.

---

## 0. THE CORE TRUTH (read first)
The engine is fully BUILT but has never RUN on a real lead. Every number you see is test data:
- 0 real emails sent. All 11 sends were to `internal_test` leads.
- All 447 leads are test/registry/seed; 0 genuine prospects have completed source → enrich → personalise → send.
- Unfilled placeholders (`[Decision Maker Name]`, `{firm}`) appear because the test leads have no real contact data to fill them, AND the spam-linter correctly blocks placeholder drafts from sending.
- The cockpit counts test data, so its KPIs are meaningless to you. That is the "dashboard is useless" feeling.

**So the #1 goal is not more building — it is getting ONE real lead fully through the pipeline.** Once that works, everything populates and makes sense.

---

## 1. CONFIRMED BUGS (yours + what I can see) and status
| # | Bug | Status | Fix |
|---|---|---|---|
| B1 | "11 sent" but no real emails | TRUE — all 11 were test | Dashboard must show real vs test (spec in §5). State, not code bug. |
| B2 | Placeholders `{firm}`/`[Decision Maker Name]` unfilled | TRUE on 2 test drafts | Linter blocks them from send (good). Real fix = real leads get real personalisation; see B6. |
| B3 | Email subject/body not matching the agreed pipeline copy | LIKELY — touches 1-3 use S064 locked templates; touch 0 is S063-personalised | Need to re-sync the locked templates to the approved copy (task T9). |
| B4 | Dashboard data not synced / looks odd / no info | Renders correctly in code; it's empty because data is test | §5 dashboard fixes + real data will populate it. |
| B5 | Dashboard counts test/investor leads | TRUE | §5: KPIs filter to real prospects. |
| B6 | Personalisation can't fill tokens for leads missing data | TRUE | Enrichment must populate contact_first/company before a draft is allowed to queue; gate added in T8. |
| B7 (FIXED) | Send queue armed with test + investor leads | FIXED | Excluded + cleared. |
| B8 (FIXED) | Sender read empty `email` not `contact_email` | FIXED | COALESCE in send gate. |
| B9 (FIXED) | New sends not logged to `sends` | FIXED | Canonical send log added. |
| B10 (FIXED) | Double-send risk (n8n W2 + send-due) | FIXED | W2 deactivated. |

---

## 2. THE CRITICAL PATH TO YOUR FIRST REAL EMAIL (the only thing that matters now)
1. Real sourcing runs (SERPER live ✓) → genuine prospect lands with a real domain.
2. Enrichment finds a real contact_email + name (Hunter ✓) → `contact_email`, `contact_first`, `company` filled.
3. Deep-research personalises Touch 0 with real evidence (Gemini/Groq ✓).
4. Quality gate passes (≥35) and the draft has NO placeholder.
5. Send gate (opt-out/test/bounce clean) sends via a relay, logs to `sends`.
**Gating it today:** the host must run cycles on REAL leads, not test. Action: let the engine run a real sourcing pass (T1) and watch one lead flow (I can run + watch it on request).

---

## 3. PENDING TASKS — YOUR SIDE, button-by-button (Chrome)
Do these once. Each says what it unblocks.

### T-A · Activate website form-lead sync (unblocks: form leads into pipeline)
1. Chrome → dash.cloudflare.com → log into the account that hosts **tamazia.co.uk Pages** (the other CF account).
2. Left menu → **Workers & Pages** → click the **tamazia.co.uk** Pages project.
3. Top tabs → **Settings** → **Variables and secrets** → **Add**.
4. Name: `NEON_URL` · Type: **Secret (encrypted)** · Value: the Neon connection string (from SECRET-KEYS.md, the `NEON_URL=` value) · Environment: **Production** → **Save**.
5. Tab **Deployments** → **Retry deployment** (or push any commit) so it picks up the secret.
6. Tell me "form sync live" — I'll submit a test via the site and confirm it lands in `leads`.

### T-B · Turn on cold-reply intake (unblocks: replies captured + Slack/Telegram)
1. Chrome → dash.cloudflare.com → **tamazia.in** zone → **Email** → **Email Routing** → **Routing rules**.
2. **Catch-all address** → **Edit** → Action **Send to** → `amangotselected@gmail.com` → **Save** → toggle **Enable**.
3. Open Gmail (account u/3 amangotselected) → find the **Cloudflare verify** email → click **Verify**.
4. Tell me "catch-all on" — the poller already reads that inbox.

### T-C · (Optional) Unify founder@ + .co.uk replies into the same Gmail
1. Chrome → dash.cloudflare.com → **tamazia.co.uk** zone → **Email** → **Email Routing** → **Enable** (accept the DNS records; let it replace the Zoho MX).
2. **Routing rules** → Catch-all → **Send to** `amangotselected@gmail.com` → Save → Enable.
3. (Optional) Add rule `founder@tamazia.co.uk` → `amangotselected@gmail.com`.
4. **DNS** tab → confirm MX = route1/2/3.mx.cloudflare.net only (no zoho).
5. Trade-off: Zoho mailboxes become forwards (history stays in Zoho). All 5 Zoho users are yours, so this is clean. Skip if you want founder@ to stay in Zoho.

### T-D · Google credential for GA4 + Search Console + Business Profile (unblocks: those 3 in one place, autonomous)
1. Chrome (logged in as amanpareek.pareek@gmail.com) → console.cloud.google.com → create/select a project "tamazia-data".
2. **APIs & Services → Library** → enable: **Google Analytics Data API**, **Search Console API**, **Business Profile API**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** (Web app) → add redirect `https://developers.google.com/oauthplayground` → save the Client ID + Secret.
4. developers.google.com/oauthplayground → gear → "Use your own OAuth credentials" → paste ID/secret → authorise the three scopes (analytics.readonly, webmasters.readonly, business.manage) → **Exchange for refresh token** → copy the **refresh token**.
5. Paste Client ID, Secret, Refresh token to me (or into SECRET-KEYS). I wire GA4 (property 393591822 / 536210909) + GSC + GBP into the pipeline + hourly pulse.
   - Don't want the cloud setup? Say "snapshot it" and I read GA4/GSC via your open browser into the pipeline now (manual, not hourly).

### T-E · Gmail "Send as" for the identities you reply by hand (after T-B/T-C)
1. Gmail (amangotselected) → ⚙ → **See all settings → Accounts and Import → Send mail as → Add another email address**.
2. For `founder@tamazia.co.uk` (and `aman@tamazia.co.uk`): name + address → Next → SMTP `mail.smtp2go.com`, port 587, username `tamazia.co.uk`, password (your SMTP2Go password) → Add.
3. Gmail emails a code to that address → it lands in this inbox (catch-all) → enter it → done.

### T-F · SECURITY (urgent) · rotate the reused password
The admin+SMTP password was reused and briefly in repo history. Change it: tamazia.co.uk/admin password + the SMTP2Go password, to two DIFFERENT values. Tell me the new admin password and I update the worker hash.

---

## 4. ROADBLOCKERS (incl. Oracle) — status + the one move
| Roadblocker | Needed? | Status / move |
|---|---|---|
| Oracle VM 24/7 host | **NO — already solved** | GitHub Actions is the live 24/7 host (engine every 30 min, pulse hourly). Oracle is redundant; skip it. |
| NEON_URL in Pages | YES | T-A (your 5 clicks). The CF Pages dashboard won't load through my automation; it's on the other CF account. |
| Google API credential | YES | T-D (your ~5 min). I can't create OAuth creds as you. |
| tamazia.in catch-all | YES | T-B (your 4 clicks). CF token lacks Email-Routing scope; CF SPA hangs for me. |
| CF account linking | NO — and I won't | Access-control change on production; not needed. Each task works without merging accounts. |
| Zoho IMAP | NO | Replaced by free Gmail intake. |
| SERPER / relays / Gmail IMAP / GH host | DONE | All live. |

---

## 5. DASHBOARD — fixes to make it useful (I apply; you can send a reference)
1. KPIs split **Real vs Test**: count only `acquisition_channel NOT ILIKE '%test%' AND lead_type NOT IN ('investor','institution','internal')`. Show "0 real sent" honestly until real sends happen.
2. Top banner: "Real prospects: X · Real sent: Y · Real replies: Z" so the founder sees truth at a glance.
3. Hide/segregate test leads behind a toggle.
4. Each KPI gets a one-line "what this means".
5. Once real data flows, the funnel/charts populate automatically.
**Reference option:** generate a dashboard you like with this prompt in v0.dev / Claude, then send it to me to match:
> "Design a clean, calm admin cockpit for a B2B outreach agency in a warm off-white Claude-style theme. Top: 4 KPI cards (real leads, real sent, reply rate, health score). Then a left-to-right funnel (sourced→qualified→contacted→replied). Then a 'Today' action list and a system-health panel with green/amber/red. Minimal, lots of whitespace, serif headings. Show me the HTML/CSS."

To inspect the live one myself I render it locally with real data (works); to see the deployed page I'd need CF Access off briefly (your call — Cloudflare → Access → Applications → the admin app → disable, re-enable after).

---

## 6. 15-PHASE CLOSEOUT STATUS
- Ph 0-1 Infra/approvals: ✅ done.
- Ph 2 Compliance/legal: 🟡 Danish workstream (Art 27, PI, cross-juris templates) — not engineering.
- Ph 3 Compose + classifier: ✅ (re-sync locked templates to approved copy = T9).
- Ph 4 Warmup + replies: ✅ build; reply intake live; warmup running (W0/W1).
- Ph 5 Audit micro-site: ✅ (batch-mint audits as real leads reach Touch 1).
- Ph 6 Personalisation: ✅ (needs real lead data to fill tokens).
- Ph 7 Sourcing: ✅ live (needs to run on real leads — T1).
- Ph 8 Ad-intel: ✅ + 35-gate.
- Ph 9 Multi-channel: ✅ email; LinkedIn/Insta manual windows.
- Ph 10 Sector intel: 🟡 news/regulator triggers = next build.
- Ph 11 Cockpit/orchestrator: ✅ live (§5 polish).
- Ph 12 Deploy bulletproofing: ✅ GitHub host + health engine + intel-pulse.
- Ph 13 Continuous improvement: 🟡 A/B + auto-pause = next build.
- Ph 14 Post-signature lifecycle: ⛔ build when first client signs.
- Ph 15 Ops resilience: ⛔ DB backup, key rotation, DR = next build.

**To truly close all 15:** finish the YOUR-SIDE tasks in §3 (so real leads flow), then I build the remaining ⛔/🟡 engineering (Ph 10, 13, 14, 15) on the live host. That is the complete remaining scope — nothing else.

---

## 7. WHAT I DO NEXT (no input needed)
- Re-sync the locked touch templates to the approved pipeline copy (T9) + add a "no draft queues with an unfilled token" gate (B6).
- Apply the §5 dashboard real-vs-test fixes + redeploy.
- On your "go": run a real sourcing→enrich→personalise pass and walk one genuine lead to a verified, placeholder-free, sendable state so you can watch the first real email work end to end.
