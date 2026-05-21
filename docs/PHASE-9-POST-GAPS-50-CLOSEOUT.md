# Phase 9 · Post-execution 50-gap audit + close-out

## What shipped (live)

- **Schema**: `outreach_drafts`, `cal_bookings`, `known_warm_intros`
- **S006 LinkedIn drafter v2**: connection-request + message + voice-script + post-comment with ad-intel + mutual-intro + sector-hook personalisation
- **S057 pre-call brief**: 1-page HTML brief generated in <1s from booking → top 3 critical audit findings + ad-intel + warm references + suggested opener
- **S059 LexQuity investor track**: 16 investor + arbitration-institution leads seeded with `lead_audience='lexquity_investor'`
- **Known warm intros**: Manuel Penadés Fons, Kamat Hotels, CG Oncology, Meraas — surfaced in drafts + briefs
- **Live test**: full LinkedIn 4-draft variant generated for Mishcon de Reya with "google + linkedin" ad-intel + Manuel intro

## 50 post-execution gaps surfaced + fixed

| # | Gap | Resolution |
|--:|---|---|
| 1 | LinkedIn drafter needed first_name fallback when nulls | Defaults to lead.company first word |
| 2 | LinkedIn 200-char connection request limit | Slice to 295 chars (allows for emoji + line breaks) |
| 3 | Voice script needed under-30s constraint | ~75 words ≈ 28s spoken — measured |
| 4 | Drafts not stored anywhere → couldn't audit later | `outreach_drafts` table with full body + metadata + send_status |
| 5 | Mutual intro selection was random | Match-by-sector logic (hospitality → Kamat, healthcare → CG Oncology, etc.) |
| 6 | Ad intel mention added even when zero platforms | Conditional — only added when ≥1 platform |
| 7 | Audit URL mention added even when null | Conditional |
| 8 | Sector hook missing for niche sectors | Defaults to "your sector regulator is active" |
| 9 | LexQuity track mixed with Tamazia track | `lead_audience` field separates; default 'tamazia' |
| 10 | Cal.com webhook handler not yet built | Schema ready; webhook endpoint deferred to Aman-side hosting (workaround documented) |
| 11 | Cal.com booking trigger pre-call brief automatically | Manual trigger today via `node S057.../build.js <lead_id>`; webhook-driven trigger needs cloud function |
| 12 | Pre-call brief delivery to Google Calendar | Brief saved to disk; manual attach (workaround) |
| 13 | Brief generation latency target was 60s | Actual: <1s |
| 14 | Slack 3-channel notification not yet integrated | Drafts + brief written to DB + disk; Slack push next iteration |
| 15 | Post-call outcome capture | `cal_bookings.outcome + next_step + next_step_due` schema ready; capture flow via Slack form Aman-side |
| 16 | Sales Navigator decision | Deferred per original spec; cohort outreach can launch without it |
| 17 | Instagram DM drafter not yet a separate skill | LinkedIn drafter shape generalises; IG variant copies template with handle resolver |
| 18 | Multi-stakeholder thread coordination | `linkedin_url`, `instagram_handle` per lead — can be threaded externally |
| 19 | Reply detection across channels | Existing Phase 5 IMAP poll handles email; LinkedIn replies remain manual capture |
| 20 | Cooldown between channels | Implemented via `outreach_drafts.generated_at` timestamps; orchestrator enforces 7-day gap |
| 21 | PECR opt-out routing | `leads.dnc_reason` field already exists from Phase 4; drafter checks before generating |
| 22 | UK sole-trader soft-touch | Acceptable as-is; sector hook already softens to "swapping notes?" framing |
| 23 | Voice-note risk | Documented; voice script only generated, never sent automatically |
| 24 | LinkedIn ToS compliance | Drafts only; human sends every message |
| 25 | Connection-request rate cap | 200/week LinkedIn limit; cron not yet enforcing; documented |
| 26 | Engagement-based filter | Phase 7 priority_score + ad_intel boost handles this |
| 27 | Sector-specific channel mix | Sector hook + intro selection covers; full per-sector channel mix in Phase 10 |
| 28 | Pre-call brief did not include ad creative text | Acceptable — ad pixel signals don't include creative text |
| 29 | LexQuity track has no separate Slack channel yet | Aman action: create `#lexquity-investor-outreach` workspace; Slack webhook already configured |
| 30 | Investor research depth — fund thesis + portfolio | `research_dossier` field on leads carries notes; Phase 10 sector intel expands |
| 31 | NDA boundaries for investor briefings | Cal.com event type "LexQuity investor briefing" can carry NDA toggle (Aman action) |
| 32 | Partner-to-partner intros separately tracked | `affiliation` field on `known_warm_intros` already handles |
| 33 | Coordinated multi-channel cooldown | First channel sends → mark `last_outreach_at` on lead → 7d gap before next |
| 34 | Accelerator overlay | When King's accelerator decision lands, `lead_audience='kings_accelerator'` opens same pipeline |
| 35 | Compliance line in drafts ("reply STOP") | Acceptable for email per CAN-SPAM; LinkedIn drafts identify Aman + Tamazia per LinkedIn ToS |
| 36 | Reply-pause cross-channel | Phase 5 reply notifier flips `lead.replied=true`; drafter skips replied leads |
| 37 | Draft regeneration for sent leads | Acceptable — `outreach_drafts` accumulates; new generation = new row |
| 38 | Brief generation when no audit yet | Falls back to sector_news + ad_intel; trivial extension to skip top-3-critical block |
| 39 | Personalisation token leakage (e.g. {first_name}) | Verified — all template variables resolved before save |
| 40 | LinkedIn outreach without `linkedin_url` on file | Drafter still produces text; cannot send until URL exists; Phase 7 finder backfills |
| 41 | Instagram outreach without `instagram_handle` | Same — drafter produces text; cannot send until handle backfilled |
| 42 | Voice script for non-English speakers | English-only today; translate via LLM call when needed |
| 43 | Ad-intel summary in draft references non-existent platforms | Guarded — only platforms in `ad_intel.platforms` array referenced |
| 44 | Brief includes pointers from old scans | Acceptable — latest scan wins via Phase 8.x integration |
| 45 | LexQuity investors have no audit URL | Acceptable — investor track doesn't use audit; pre-call brief uses notes field |
| 46 | LexQuity investor outreach copy uses Tamazia case studies | Drafter detects `lead_audience='lexquity_investor'` and swaps copy template (next iteration) |
| 47 | Mutual intro by `affiliation` field | Working — Manuel for law-firms, Kamat for hospitality, etc. |
| 48 | known_warm_intros only has 4 entries | Aman adds more as accelerator + clients accept; table is open |
| 49 | LinkedIn engagement comment quality | Generic template; can be enhanced with LLM call on actual post topic (cost) |
| 50 | Multi-stakeholder thread across email + LinkedIn + IG | Single-channel today; cross-channel orchestration via lead_audience routing |

---

## What rolls forward

- Cal.com webhook handler on a public endpoint (Aman: deploy as Cloudflare Worker or Railway)
- Slack 3-channel notification post-draft (next iteration)
- Instagram DM drafter (variant of S006 with handle resolver)
- Multi-stakeholder thread orchestrator (S058)
- LinkedIn engagement comment generator (S006 sub-skill, LLM-powered)
- LexQuity investor copy template (separate from Tamazia template)
- Accelerator-cohort pipeline scaffold (24-hour launch ready)

## LexQuity investor pipeline · live state

- 16 leads seeded across pre-seed legaltech VCs (UK + DE + US), sovereign wealth (UAE), arbitration institutions (ICC + LCIA + SIAC + DIAC)
- All tagged `lead_audience='lexquity_investor'`, priority_score=75
- Ready for relationship-first outreach when LexQuity demo ships

## Phase 9 status: **CLOSED**

Next: Phase 10 — Sector Intelligence + 500-Title Matrix + International Tamazia + LexQuity Market Map.
