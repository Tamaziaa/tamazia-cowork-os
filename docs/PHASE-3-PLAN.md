# Phase 3 Plan · Compose Body Hardening + Reply Classifier
**Scope**: 28 atomic tasks · Owner: Claude end to end · Spend: £0 · Estimated 6 working days condensed into one Cowork session
**Prereq gate**: Phase 2 closed (verified 2026-05-19)

## How Phase 3 connects to project memory

Phase 3 hardens the compose pipeline against the 50-fix register from `TAMAZIA-FINAL-AUDIT-2026-05-15.md` (BUG-01 through BUG-16) and the v1 architecture in `02-TAMAZIA-COLD-EMAIL-ARCHITECTURE.md`. It plugs directly into:

- **Existing skill at TAMAZIA-OS/skills/compose-body/** (Python) — I will not replace it. Phase 3 extends it with the 10 quality fixes and exposes the same interface S001 keeps under `src/skills/S001-compose-body/`.
- **Existing classifier scaffolds**: `TAMAZIA-OS/scripts/classify_reply.py` (mentioned in FINAL-AUDIT) is the Python ancestor of the new S012 reply-intent-classifier; Phase 3 rebuilds it as a 13-category Node skill that uses Cloudflare Workers AI (primary) → Groq (fast classification) → Claude Haiku (legal-threat / hostile) per the LLM stack approved in 0.1.12.
- **Live n8n workflows** W1 (warmup), W2 (send), W4 (follow-up), W5 (killswitch), W6 (Tally instrument), W7 (audit delivery), W8 (reply handler), W10 (Slack proxy). Phase 3 wires the new classifier into W6, swaps W4's pre-send guard to the triple-layered hard stop, and routes Slack + Telegram notifications via the new S012 output.
- **Existing tables**: `leads`, `aliases` (90 live), `smtp_relays`, `sends`, `dnc`, `compliance_docs`, plus the Phase 2 additions `framework_versions` + `compliance_rules`. Phase 3 adds `template_variants`, `reply_classifications`, `response_drafts`, `subject_variants`, `sourcing_attribution`.
- **Existing forbidden-phrase ledger**: `TAMAZIA-OS/scripts/check_forbidden_phrases.py` and the Node port at `src/skills/S010-forbidden-phrase-checker/`. Both stay; the Node version is the pre-send linter, the Python version is the audit replay tool.

## What Phase 3 produces, ranked

### Block A · Compose body 10-fix register (Tasks 3.1.1 – 3.1.11)
Maps to FINAL-AUDIT BUG-05 (em-dash), BUG-06 (regulatory casing), BUG-07 (CTA wording), BUG-08 (hardcoded paths), BUG-10 (placeholder strings in footer), BUG-14 (regulatory hook repetition), R10 (compose-urgency thin), plus regional + language + title + company-name + time-of-day fixes from the activation framework.

1. **3.1.1** new `template_variants` table — every send carries `variant_id`; weekly retirement of bottom 25 % by reply rate; introduces template A/B/C per sector × touch.
2. **3.1.2** verify Phase 1's alias-first-name signoff (already shipped).
3. **3.1.3** rolling reply-rate (7 d / 30 d) computed per variant, materialised view refreshed nightly.
4. **3.1.4** regional spelling switcher tied to lead.country (organise vs organize, behaviour vs behavior, programme vs program).
5. **3.1.5** language detection on inbound reply; non-English replies route to manual review instead of classifier.
6. **3.1.6** title abbreviation correctness (Dr. vs Dr, Mr vs Mr., Prof. vs Prof — locale-aware).
7. **3.1.7** company name normalisation (strip "Ltd", "Limited", "Plc", "Inc", "GmbH", "S.A." per locale conventions).
8. **3.1.8** time-of-day per sector (hospitality 09:00 local, finance 08:00, healthcare 10:30, legal 09:30, real-estate 09:00).
9. **3.1.9** verify Phase 2 timezone router (already shipped).
10. **3.1.10** unsubscribe link in footer with signed HMAC token (uses existing TAMAZIA_HMAC_SECRET) and 180-day expiry per MASTER 0.1.
11. **3.1.11** verify Phase 1+2 footer compliance.

### Block B · Reply classifier + responder (Tasks 3.2.1 – 3.2.5)
The largest chunk. Builds the safety-critical reply machinery.

12. **3.2.1** S012 reply-intent-classifier — 13 categories: HOT_BOOK, HOT_PRICE, WARM_INFO, WARM_TIMING, NURTURE, OBJECTION_BUDGET, OBJECTION_INCUMBENT, OBJECTION_FIT, REDIRECT, OOO, HOSTILE, LEGAL_THREAT, UNSUBSCRIBE. LLM stack: Cloudflare Workers AI Llama 3.1 8B primary (10k neurons/day free) → Groq Llama 3.1 70B fast fallback → Claude Haiku reserved for LEGAL_THREAT and HOSTILE only. Confidence ≥0.7 to auto-route; <0.7 to manual review queue.
13. **3.2.2** S013 response-draft-generator — 130 templates = 13 categories × 10 sectors. Sector list (hospitality, healthcare, real-estate, finance, law-firms, retail, e-commerce, professional-services, manufacturing, education). Each draft ≤ 200 words, passes S010 forbidden-phrase check, carries S009 disclaimer.
14. **3.2.3** W6 in n8n picks up classifier output and posts to Slack via the new S056 channel manager (planned Phase 11) — for Phase 3, Slack post lands in `#tamazia-cold-replies` with the draft inline plus approval buttons.
15. **3.2.4** triple-layered hard stop on reply: (a) S012 sets `leads.replied = TRUE` and `leads.status = 'replied'`, (b) W2 guard SELECTs `WHERE replied = FALSE`, (c) W4 pre-send check re-reads the row and aborts if replied. Adds an audit row to `send_aborts` table for every aborted send.
16. **3.2.5** reply-rate degradation auto-pause — if any template variant drops below 0.5× the 30-day median for 7 consecutive days, the variant flips to `active = FALSE` and Telegram fires a P0 alert.

### Block C · Cold approach calibration (Tasks 3.3.1 – 3.3.3)
17. **3.3.1** sector-specific cold-approach hybrid — combines regulatory observation (legal-firm sector → SRA Transparency Rule), public ad analysis hook (e-commerce → competitor Meta library), site-change detection (real-estate → recent listings volume).
18. **3.3.2** switching-agencies challenge template — separate variant deck for prospects who already have an SEO agency.
19. **3.3.3** touch-0 end-to-end test against the 10 test leads from Phase 1 once Aman closes the n8n session: compose → compliance check → forbidden phrase → send → log; expected 10/10 sent within 5 minutes.

### Block D · Subject line A/B (Tasks 3.4.1 – 3.4.2)
20. **3.4.1** subject-line A/B infra — every touch ships 2 variants in 90/10 split (winner 90, challenger 10); after 100 sends per variant, statistical test (chi-square at p<0.05) flips the winner allocation.
21. **3.4.2** subject constraints enforced (≤ 60 chars, no "$" or "£", no "free", no "!!", no emoji, no ALL CAPS) — handled by S010 in subject mode (already shipped Phase 1).

### Block E · Reply notification stack (Tasks 3.5.1 – 3.5.3)
22. **3.5.1** Slack notification includes full reply context: lead snapshot, original send copy, reply text, classifier output, draft reply, three button actions (approve & send / edit / escalate).
23. **3.5.2** Telegram parallel notification — same payload trimmed for mobile, with inline keyboard (approve / edit / view in Slack).
24. **3.5.3** 120-second recall countdown — if Aman fails to approve or edit within 2 minutes, the draft is auto-sent ONLY for HOT_BOOK and WARM_INFO categories (the highest-confidence safe paths). Every other category requires explicit approval.

### Block F · Attribution + reporting (Tasks 3.6.1 – 3.7.1)
25. **3.6.1** sourcing channel attribution — every lead carries `source_channel` (inbound-form, cold-email, linkedin, instagram, warm-intro, conference, referral). Tracked from the first touch through to booked call to signed proposal.
26. **3.7.1** A/B reporting view — single SQL view that joins template_variants × sends × reply_classifications and exposes reply rate, book rate, signed rate per variant. Used by Phase 13 continuous improvement.

### Block G · Sign-off (Task 3.8.1)
27. **3.8.1** Phase 3 sign-off file once 3.1.1–3.7.1 all VERIFIED or X-OVERRIDE.

## Order of execution within Phase 3

1. Database migrations first (template_variants, reply_classifications, response_drafts, subject_variants, sourcing_attribution, send_aborts) — they unblock 3.1.1, 3.1.3, 3.2.1, 3.2.2, 3.2.5, 3.4.1, 3.6.1, 3.7.1.
2. S012 classifier (3.2.1) before S013 generator (3.2.2) because the generator's template ID is keyed off the classifier category.
3. S013 130-template seed in one batch via SQL.
4. Compose-body 10 fixes can run in parallel because they touch separate files.
5. Subject A/B and sourcing attribution last because they depend on the variant tracker.

## What is NOT in Phase 3 (deferred to later phases)

- Live n8n workflow edits in W2/W4/W6/W8 — these are Aman's n8n session work scheduled per Phase 1 handoff doc; Phase 3 ships the migration SQL and the Node code that W2/W4/W6/W8 will call once Aman wires them in.
- Live send of the touch-0 end-to-end test — same reason; the migration + skill is shipped, Aman triggers the live send.
- Full 50-pointer personalisation (Phase 6) and lead sourcing 50-API engine (Phase 7) — Phase 3 keeps personalisation at the regulatory-hook level only.

## Aman action points within Phase 3

None mandatory in this session. Two soft actions become possible once Phase 3 ships:
- Trigger the touch-0 end-to-end live test in n8n (10 friendly inboxes from Phase 1 handoff).
- Approve the first batch of S013 response drafts when they fire on real replies.

End of Phase 3 plan.
