# Phase 9 · Pre-execution 50-gap audit

## LinkedIn outreach (1-12)
1. LinkedIn ToS prohibits automated DMs from non-Sales-Nav accounts → drafts only, human sends
2. Voice notes — LinkedIn supports voice messages up to 60s; script generator outputs ≤30s
3. Mutual connection leverage — need a `known_warm_intros` table seeded with Tamazia client + LexQuity advisor + accelerator alum LinkedIn URLs
4. Recent-post engagement — pull `lead.linkedin_url` (Phase 7 finder), scrape last 3 public posts, draft thoughtful comments
5. Post-comment cooldown — same actor commenting on 5+ posts in 24h is flagged; limit to 3
6. Connection request copy — 200-character LinkedIn limit; templates pre-written per sector
7. Follow-up cadence — connection accepted → wait 48h → soft message → wait 5d → next message
8. Engagement-based filter — leads who liked/commented on Tamazia post get fast-track priority
9. LinkedIn rate limits — 100 search results/day for free, 200 connection requests/week
10. Multi-stakeholder coordination — when a deal has GC + CMO + CEO, all 3 get coordinated reach but different opening angles
11. Sales Navigator trial decision — defer per original spec (Phase 9.D)
12. PECR + GDPR compliance — LinkedIn data is licensed for B2B outreach under their ToS

## Instagram outreach (13-20)
13. Instagram DM rate limits — 80-100 DMs/day from a single account before throttling
14. Instagram Business API requires Meta verification — defer to manual sends for now
15. Sector targeting — IG is best for hospitality, real-estate, healthcare (B2C-adjacent)
16. Handle confidence — Phase 7 finder returned ≥40% confidence handles only
17. Open-rate proxy — DM seen ≠ replied; track via reply detection
18. Story view → DM sequence — leads who view Tamazia story get a follow-up DM template
19. Voice note in IG — supported, same 30s script template as LinkedIn
20. Multi-stakeholder on IG — usually 1-2 decision makers; less common than LinkedIn

## Slack + Cal.com flow (21-30)
21. New lead → Slack message with all 3 channel drafts (email + LinkedIn + IG)
22. Slack message includes priority score + ad-intel summary + audit URL
23. Cal.com webhook trigger when prospect books → grab their info → trigger pre-call brief
24. Cal.com event types — Tamazia "30-min discovery", LexQuity "30-min investor briefing"
25. Pre-call brief format — 1-page brief: company news, recent ads, audit findings, mutual connections, suggested opener
26. Brief generation latency — must complete within 60s of booking
27. Brief delivery — attached to Google Calendar event + Slack channel
28. Post-call outcome — Slack form: "go/no-go/follow-up", `next_step`, `next_step_due`
29. Google Calendar sync — booking creates event with brief attached as note
30. Cal.com webhook signature verification — secret in `.env` (CAL_WEBHOOK_SECRET)

## LexQuity investor pipeline (31-40)
31. Separate `lexquity_investor_pipeline` track inside `leads` (via `lead_audience='lexquity_investor'`)
32. Targets: pre-seed legaltech VCs + sovereign wealth allocators + UHNW family offices
33. Sources: Crunchbase (paid), AngelList (free), public VC announcements, Manuel's network
34. Cadence: relationship-first, not cold-pitch
35. Drafts: warm intro language, founder-to-founder, no Tamazia case studies
36. Separate Slack channel: `#lexquity-investor-outreach`
37. Separate Cal.com event: "LexQuity investor briefing · 30 min"
38. NDA boundaries: investor briefings carry NDA option in booking flow
39. Investor research: pre-call brief includes fund thesis, portfolio companies, partner background
40. Track partner-to-partner intros separately from cold outbound

## Outreach quality + ethics (41-50)
41. No deception — every outreach identifies Aman + Tamazia + reason
42. PECR opt-out routing — `dnc_reason='opt_out'` skips all channels
43. Sole-trader soft-touch — UK sole traders get a softer opener (PECR direct-marketing rules)
44. Pattern dedup — same lead doesn't get the same opener twice across channels
45. Reply detection — when a lead replies on any channel, all other channels pause
46. Channel mix per sector — law-firms prefer email; hospitality prefers IG; finance prefers LinkedIn
47. Cooldown between channels — 7 days between channels for the same lead
48. Voice-note risk — voice notes are personal but harder to refuse; balance carefully
49. Accelerator overlay — when King's accelerator decision lands, the same pipeline supports cohort outreach in 24h
50. Compliance-line in every draft — "Reply STOP to opt out" or equivalent per channel ToS

---
**Build approach:** schema → 3 channel drafters → pre-call brief skill → Slack notification → LexQuity track overlay → live test → post-50 + closeout
