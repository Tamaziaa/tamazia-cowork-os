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
