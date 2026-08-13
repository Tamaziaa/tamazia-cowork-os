# Sending Path + Remediation Plan · 2026-05-23
Answers the migration question and turns the discovery audit into an execution order.
Companion: docs/DISCOVERY-AUDIT-2026-05-23.md (full built-but-unused + Neon audit).

## A. THE SENDING PATH (decisive)
**Can you send directly in MailDeck, skipping the sequencer?** No. MailDeck is infrastructure-only by
design ("you'll need a separate sequencer"). Their own SMTP send product is "coming soon" and not in
your Growth plan. There is no send UI inside MailDeck.

**Can you run MailDeck for a month via a sequencer, then shift to something with creds for your own
engine?** Yes. That is the right plan. The tradeoff to understand:
- Cheap RESOLD Google Workspace (MailDeck Growth, ~$3.30/inbox) = best deliverability, but API-delivered
  with NO credentials you can extract. Locked to a supported sequencer.
- To get raw SMTP/IMAP creds for our own engine you need one of:
  1. Your OWN Google Workspace tenant on the 6 domains. Full control + app passwords, but ~$7/user/mo x
     30 = ~$210/mo. Not cheaper.
  2. A reseller that provisions Google/MS inboxes AND hands you SMTP/IMAP creds (Maildoso, Mailforge,
     Hypertide, Inframail, Mailreef, Premium Inbox class). ~$2-4/inbox, creds included, plug into ANY
     tool incl. our engine. THIS is the cheaper own-engine target. (Verify credential access per vendor
     before buying; some are SMTP-only/lower-trust than full Workspace.)
  3. MailDeck's own SMTP product when it ships (cheaper, plain-text, lower trust).

**Recommended roadmap**
- Month 1 (now; the $99 is already spent): once provisioning lands (~May 26-27), warm + send via PlusVibe
  (already connected, free 14-day trial) or Smartlead. Validate copy, book first meetings.
- Month 2+: migrate to a creds-providing provider (option 2) on the same 6 domains (domain reputation
  partially carries; mailbox warmup does not). Plug into our engine (mailbox-pool.js + warmup-engine.js
  already built for exactly this). Drop MailDeck if it still won't give creds.

**The 12-15K-in-one-month reality (honest):** 30 inboxes, 15-day Google warmup, then ~20 cold/inbox/day =
~600/day = ~15-18K/MONTH at steady state, which is MONTH 2. In month 1, ~half the month is warmup, so safe
volume is ~5-8K. Pushing 12-15K from cold inboxes in 30 days risks burning the domains we are protecting.
To safely hit 12-15K in month 1 you need ~50-60 inboxes (a second order), not warmup compression.

## B. WHY THE SYSTEM UNDERPERFORMS (discovery audit)
~60% of what was built is not wired into the live cycle. The cycle runs ~11 scripts; the rest are dormant.
- Sourcing engine (S028) UNWIRED → only 27/408 leads have an email; sendable_real_leads = 0.
- Enrichment (S060 gemini + S062 auto-trigger) UNWIRED → 91% of leads unscored, 6.6% have emails.
- Touch seam broken: S064 (renders Touch 0-3 drafts) UNWIRED; S065 (sends) wired → sender drains a queue
  nothing refills. Eligibility fix alone is not enough.
- S025 audit-page-builder UNWIRED → Touch 1 has no audit URL → Touch 1 can never pass its own guard.
- Deliverability telemetry (S023 mail-tester, S019 open/click, S024 bounce, S016 alias-health) UNWIRED →
  flying blind; 99% of sends have unknown relay attribution.
- Warmup duplicated: old warmup_pairs build (unwired) + new warmup-engine.js (migration now applied).
- Dead scripts: backtest-full-pipeline.js, quality-loop.js, pre-send-pipeline.js.
- Phase 14 (revenue ops: invoices, onboarding, forecasts) and Phase 15 (aman_actions, DR runbooks) =
  entirely pending, 0 built.

## C. REMEDIATION ORDER (the "5x efficiency" plan — all engine-side, independent of the sending decision)
1. Wire S028 sourcing-orchestrator → 500+ fresh leads/run from the 10 sources. (Fixes sendable=0.)
   = your "every sourcing engine scores 500 fresh leads above 60."
2. Wire S060 + S062 → enrich each lead: scrape website, find emails, pull news + SEO/compliance signals.
   = your "scrape their website, emails, all details, news for our SEO+compliance moat."
3. Fix S064->S065 seam → render Touch 0-3 from FINAL-SEQUENCE-PROFESSIONAL-SERVICES.md, then send.
4. Wire S025 audit-page-builder → generate the Touch-1 audit URL.
5. Wire S023 mail-tester gate + S019 open/click + S024 bounce + S016 alias auto-pause → deliverability eyes.
6. Wire S033 ad-intel + S036 regulator-watch → richer priority scoring.
7. Cleanup: retire dead scripts; consolidate to one warmup path; fix relay attribution.

## D. DECISIONS NEEDED FROM AMAN
1. Sending path: PlusVibe-trial month 1 then migrate to a creds-provider (recommended) OR Smartlead month 1?
2. Green light to wire the dormant skills (Section C) into the live 30-min cycle? (Changes the autonomous
   host + uses API quota. Done in the order above.)
3. The 30 repos: not recoverable from the old transcript. Re-research equivalents fresh, or paste the list?
4. Rotate the leaked GitHub token (it sits in plaintext in .git/config remote URL).
