# 50-scenario adversarial audit · Tamazia engine
Run the pipeline through 50 adverse scenarios, state what breaks, the current handling, and the fix. Grounded in the actual code. Legend: ✅ handled in code · 👁 now monitored live by `health-check.js` (shows in cockpit Health tab) · 🟡 partial · ❌ open gap. Compiled 2026-05-21.

## Infra / credentials
1. Neon DB unreachable. Breaks: everything. ✅ engine scripts fail non-zero so cron retries; 👁 `db_reachable` probe; cockpit degrades per-widget instead of blanking. Fix done.
2. SERPER key missing/expired. Breaks: sourcing silently stops. ✅ scraper skips cleanly; 👁 `key_serper` fail. Fix: alert added via Health tab.
3. A relay key revoked. Breaks: that relay's sends fail. ✅ router fails over to other relays; 👁 `relays_live` (warn at 1, fail at 0). 
4. All relays down. Breaks: no email goes out. ✅ router returns all_relays_failed (logged, not lost); 👁 `relays_live`=fail + `send_freshness_h`.
5. GH_TOKEN missing. Breaks: 24/7 host can't deploy/run. 👁 `key_gh_token`. ✅ token saved this session.
6. Secrets leak to git. Breaks: credential exposure. ✅ `.gitignore` excludes .env/SECRET-KEYS/PII; pre-push scan against literal secret values; verified clean.

## Sourcing / scraping
7. Scraper returns 0 leads for a day. Breaks: pipeline starves. 👁 `new_leads_24h` (warn if <1). Fix: visible; query-calendar rotates fresh keywords.
8. Aggregator/listicle slips in as a "lead". Breaks: junk leads, wasted sends. ✅ domain-boundary blocklist + Layer 1b content heuristic (40+ external domains / listicle title) reject; verified booking.com rejected.
9. hotels.com substring matches oetkerhotels.com. Breaks: real businesses wrongly blocked. ✅ fixed (domain-boundary isAggregator, not substring).
10. Duplicate leads from multiple sources. Breaks: double outreach, annoyance. 🟡 dedup vs existing base on scrape; 👁 `duplicate_domains` flags residual. ❌ no auto-merge yet (backlog).
11. Scrape runs but never finishes (hang). Breaks: stale data, looks alive but isn't. 👁 `scrape_freshness_h` (warn 36h/fail 96h).
12. SERP provider rate-limits. Breaks: partial scrape. ✅ provider-agnostic (Serper→SerpApi fallback) + daily-idempotent (skips if ≥500 today). 
13. Organic leads pile up unverified. Breaks: backlog, missed prospects. 👁 `organic_verify_backlog` (warn 50/fail 200) + cockpit Organic tab one-click verify.
14. Wrong-track leads (investor/arbitration) enter outreach. Breaks: brand/credibility damage. ✅ quarantine (QUARANTINED_WRONG_TRACK); 👁 `quarantined_drafts`.

## Enrichment / verification
15. Hunter quota exhausted. Breaks: verification + email-finding degrade. ✅ free-verify falls back to DIY MX/SMTP/disposable; 👁 `key_hunter` warn.
16. NeverBounce 0 credits. Breaks: paid verify off. ✅ free verifier is primary; NeverBounce optional; 👁 `key_neverbounce` warn.
17. Lead has no email at all. Breaks: can't email. ✅ multi-channel waterfall (LinkedIn/Insta); 👁 `no_contact_channel` flags qualified leads with zero channels.
18. Catch-all domain accepts any address. Breaks: false "valid" emails → bounces. ✅ free-verify catch-all probe downgrades to "risky".
19. Disposable / gibberish / role email. Breaks: bounces, low quality. ✅ free-verify rejects disposable/gibberish, caps role addresses.
20. Typo domain (gmial.com). Breaks: guaranteed bounce. ✅ free-verify typo-corrects + re-checks.
21. Enrichment writes malformed JSON to all_socials. Breaks: queries on the column. ✅ fixed (text-cast in checks + dashboard); resilient queries.

## Quality gate
22. Quality scorer crashes on one lead. Breaks: batch stops. ✅ per-lead try/catch in qualify-and-queue + W14; continues.
23. Site fetch times out during scoring. Breaks: hang. ✅ fetchSite timeout 9s, retries 0, returns ''.
24. Score threshold too strict drops genuine leads. Breaks: lost pipeline. ✅ PASS=35 + reachable-based pass (named OR any email OR social).
25. Ad-intel leads bypass the quality gate. Breaks: unscored leads auto-send. ✅ fixed — W14 cron now runs the same 35-score gate.
26. Most leads never scored. Breaks: pipeline looks empty/unqualified. 👁 `null_quality_pct` + `unscored_eligible`. Note: registry leads are intentionally outside the scored streams; flagged for visibility.
27. Scored-low lead still auto-sends. Breaks: spray-and-pray. ✅ send-due hard-blocks score<35 (status=quality_blocked).

## Send / cadence
28. Draft contains an unresolved placeholder ([Decision Maker Name], {{}}). Breaks: embarrassing send. ✅ content-linter hard-block; 👁 `placeholder_drafts` (currently flags 1 — investigate).
29. Spammy copy trips filters. Breaks: deliverability/reputation. ✅ pre-send spam linter (blocked_spam_lint); 👁 `blocked_drafts`.
30. Touch-1 audit URL missing or 404. Breaks: broken-link send. ✅ send-due verifies audit URL resolves (HTTP 200) before send, else blocks; 👁 `audit_coverage_gap`.
31. Aman-signed mail sent from a persona alias. Breaks: identity/signature mismatch. ✅ Aman-identity rule routes "Aman Pareek"-signed drafts from aman@.
32. Alias quota exhausted mid-run. Breaks: sends fail. ✅ rotator skips capped aliases, returns no_eligible_alias; 👁 `alias_healthy`.
33. Alias demoted on bounce/complaint. Breaks: sending from a burned alias. ✅ health monitor demotes; rotator never picks demoted; 👁 `alias_demoted`.
34. Cadence stalls (leads stuck queued, never advance). Breaks: silent pipeline death. 👁 `stuck_leads` (>5 days overdue) + `send_freshness_h`.
35. Send queue backlog exceeds daily capacity. Breaks: never catches up. 👁 `send_queue_backlog` (warn 60/fail 200).
36. Reply arrives mid-cadence but next touch still fires. Breaks: sending after a reply. ✅ send-due suppresses if replied=true; reply poller sets status=replied.
37. Duplicate send to same lead. Breaks: annoyance. ✅ touch keyed by lead+touch; draft send_status flips to sent.

## Deliverability / relays
38. One relay's reputation tanks. Breaks: inbox placement. 🟡 router caps + failover; 👁 `bounce_rate_pct`. ❌ per-relay reputation scoring (backlog).
39. Bounce rate spikes. Breaks: domain reputation. 👁 `bounce_rate_pct` (warn 3%/fail 8%). ❌ auto-pause on spike (backlog).
40. Relay attribution missing (can't tell which relay sent). Breaks: blind debugging. 👁 `relay_unknown_pct` (currently 94% on historical sends — new sends record relay via router). 
41. Daily cap exceeded across relays. Breaks: throttling/blocks. ✅ relay_daily_usage caps in router. 🟡 cockpit cap-vs-usage bars (backlog).
42. SPF/DKIM/DMARC misalignment. Breaks: spam folder. ✅ both domains authenticated (verified in Brevo); MX move plan preserves auth.
43. Unsubscribe link missing. Breaks: CAN-SPAM/compliance. ✅ List-Unsubscribe header (mailto + one-click when HTTPS endpoint live) in every relay.

## Replies / inbound / compliance
44. Reply intake (IMAP) stops. Breaks: replies missed, cadence keeps firing. 👁 `reply_poll_freshness_h` (warn 6h/fail 48h). ✅ poller live on Gmail.
45. Reply can't be matched to a lead. Breaks: orphan reply, no context. ✅ matches on Message-ID (stored this session) + relay id + To-address (all 90 aliases) + from-domain fallback; 👁 `replies_unmatched`.
46. Opt-out/STOP not honored. Breaks: serious compliance/legal risk. ✅ poller sets status=unsubscribed on STOP; 👁 `optouts_honored` flags any opted-out lead still queued (fail at 5).
47. Hard bounce not detected. Breaks: keep mailing a dead box. ✅ poller classifies BOUNCE, logs bounce_events, pauses sequence.
48. Out-of-office treated as a real reply. Breaks: false "interested". ✅ OOO classifier reschedules +7d, doesn't mark replied.
49. Replies pile up unactioned. Breaks: lost deals. 👁 `replies_unactioned` + cockpit Reply center one-click handled.
50. Inbound flood (1071 old emails) processed as new on first poll. Breaks: Slack/Telegram spam, false leads. ✅ fixed — baseline UID set so only new mail is processed.

## Fixes implemented this session
- Dashboard made resilient (per-widget query isolation) — root cause of "everything broken".
- Email tracking repointed to the real `sends` table (was reading empty `outreach_drafts`).
- `scrape_runs` column bug fixed in dashboard + health engine.
- `reviewed` column added; reply "mark handled" works.
- Message-ID stored on every send + matched on reply (bit-perfect threading) + persona-by-To-address.
- Free verifier (commercial-grade) replaces paid credits.
- Health engine (30 live probes) built, wired into the 30-min cycle, surfaced in the cockpit Health tab.

## Open gaps, prioritized (next builds)
1. Auto-pause sending on bounce-rate spike (scenario 39) — highest risk to reputation.
2. Lead dedupe auto-merge (10) — pipeline hygiene.
3. Per-relay reputation scoring + cap-vs-usage bars (38, 41).
4. Investigate the 1 placeholder draft (28) and the 94% relay-attribution backfill (40).
5. Cockpit auto-refresh + "last cycle status" banner so liveness is glanceable.
