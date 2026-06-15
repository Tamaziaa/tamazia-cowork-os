# EDIT-LOG — LLM-RESCUE build (branch `v4-llm-rescue`, base `c017a48`)

Generation-first LLM rescue layer + human review loop for the Tamazia agency engine.
North star: the LLM LIFTS leads INTO Tier-1 by finding missing public signals — it never relaxes the gate.

Hard rules honoured throughout: deterministic gate keeps final say; LLM only PROPOSES (advisory `qa_*` columns);
consent/entity (PECR) gate never bypassed; net Tier-1 only goes UP (rescue adds, fact-check flags for human only,
never auto-demotes); LinkedIn via SERP TITLES only (SearXNG/Brave/DDG result URLs — linkedin.com is never fetched);
£0 free-models-first with a hard cap + kill switch (`LLM_QA_ENABLED`, default OFF); SEND stays OFF; no mass Neon
writes (small samples only; the backlog runs via the scheduled job after merge).

| # | Commit | File(s) | What | Syntax | Proof |
|---|--------|---------|------|--------|-------|
| 1 | `fix(mystrika): inject canonical Art-14 footer into the live push path (B-1)` | `scripts/push-to-mystrika.js` | Port the proven Mystrika `complianceFooter()` + add `withFooter()`; wrap every rendered touch body (t0-t3) so the LIVE push wire carries provenance + `{{ unsubscribe }}` + filled `{{privacy_notice_url}}`. Founder-blocked `{{reg_address}}/{{company_number}}/{{ico_number}}` stay as placeholders. | jsc PASS (ReferenceError on require at L6, no SyntaxError) | Rendered body ends with provenance + unsubscribe + privacy URL; idempotent; empty-in→empty-out. All 8 assertions true. |
| 2 | `feat(llm): generation-first rescue worker (find missing public signals → re-run gate)` | `src/lib/llm-rescue.js`, `scripts/run-llm-rescue.js` | Wave worker over non-Tier-1 leads, ordered by Part-C yield (missing_linkedin → missing_dm → missing_both → classify_sector → missing_email). Finds the missing piece (LinkedIn via SERP titles only; named DM via CH reg-officers / SERP; email via find-every-email + free verify; sector via LLM classify) using the free-first router, re-runs the CANONICAL `scoreLead()` WITH the found data, and writes advisory `qa_found/qa_suggested_tier/qa_reason/qa_confidence/qa_model/qa_status/qa_checked_at` (+ `review_status` auto_promote / unreviewed). Kill switch `LLM_QA_ENABLED` (default OFF); excludes `consent_required`; never writes icp_tier/send state; never demotes. | jsc PASS (both files) | Eval in Commit 7. |
