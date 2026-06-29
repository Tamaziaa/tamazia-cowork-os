# ENGINE_GAP_MAP — Tamazia Audit Engine: Single Source of Truth

> Permanent, continuously-evolving truth map. Started 2026-06-29. Rule: never optimise one audit; eliminate error CLASSES.
> Every claimed defect must be VERIFIED on a FRESH local `buildPayload` before it is treated as live (stale-cache + version-skew produce false defects).

## 0. END-TO-END PIPELINE (stages, file, what it produces, known weakness)

| # | Stage | File | Produces | Known weakness (verified) |
|---|-------|------|----------|---------------------------|
| 1 | Lead ingestion | leads table / minting_queue | domain, lead.sector, lead.country | lead.sector is often the CLIENT industry or coarse; lead.country stale for .com |
| 2 | Home-country resolve | build.js `resolveHomeCountry` | effCountry (feeds framework routing) | runs BEFORE firm_profile exists; .com falls to TLD/market default |
| 3 | Corpus acquisition | compliance.js `gatherCorpus` | corpus[] (home+links+sitemap) | datacenter fetch blocked by Cloudflare -> RESCUE: residential(#182)+Jina-on-challenge(#183, bounded #185). autotrader-class still resists |
| 4 | JS render / wall bypass | compliance.js `_renderViaReader` (Jina) / CRAWL_RENDER_URL(blank) | rendered text | Jina free, ~1s, bypasses most walls; CRAWL_RENDER_URL microservice NOT stood up (founder infra lever for 100%) |
| 5 | Firm profiling (LLM) | firm-profile.js `profileFirm` via router | sector, hq_country, office/served countries, source(llm/fallback) | LLM rate-limited under load -> ~50% fallback (see §2). Deterministic fallback strengthened (#184) |
| 6 | Sector reconcile | compliance.js effectiveSector | detected_sector | ICP-guard only applies when profiler low-confidence (#178); domain-profession override (#184) |
| 7 | Jurisdiction merge | firm-profile.js `mergeJurisdictions` | detected_jurisdictions[] (two-signal gated) | works; scalar display-country reconciled to corroborated HQ (#186) |
| 8 | Framework routing | connect.js `connect()` | applicable_frameworks (GATE A juris, B sector, C trigger) | sound; multi-jurisdiction working |
| 9 | Rule eval | compliance.js `ruleCheck` | findings (hit/miss/trigger_absent) | trigger_then_check fires correctly; SOME check regexes loose (false "present" -> false-negative). NOT a missing engine |
| 10 | Finding integrity gate | build.js `_integrityOK` | _confirmed | drops unmapped/textless |
| 11 | LLM verify | build.js `verifyTopFindings` | state PASS/NEEDS_REVIEW | uses Groq directly (not router) |
| 12 | Penalty/severity | catalogue penalty_basis + enforce_* | penalty headline | Equality Act/non-fining now non_monetary (fixed); exec headline picks max fine_high |
| 13 | Exec/trust summary | build.js LLM | exec_summary | often SEO/GEO-led not compliance-led (RC-7, quality not correctness); occasional truncation/empty |
| 14 | Pointer assembly | build.js | pointers[] (merged+sorted by severity) | no tight cap; sector findings survive if emitted |
| 15 | Scan cache | http.js getCached/writeCache | scanner_cache row | KEY=domain|sector|country, 1-day TTL, NO code-version -> re-mint can return PRE-FIX result (hazard, see §3) |
| 16 | Render (website) | tamazia-website _adapter.js -> window.D | live audit page | separate repo |

## 1. SOLUTION PROTOCOL STATUS
Building permanent truth map (this file) → deep-verify clean 60-batch → root-cause cluster → multi-perspective → BATCH → implement → regress → re-mint → re-verify → loop.

## 2. LLM-CAPACITY CEILING — full solution space + recommended COMBINED solution
PROBLEM (root-caused, verified): free LLM tiers 429 on CONCURRENCY + exhaust DAILY quota under sustained minting. Burst of CONC mints x several LLM calls each saturates Cloudflare (10k neurons/day), Groq (~30 RPM), Gemini (free daily). Measured ~50% source:fallback under load; single calls succeed when isolated.

Solution space considered (15):
1. Lower MINT_CONCURRENCY 5->3 (free; reduces burst; throughput still >2000/day) — backstop, not root fix.
2. Router concurrency semaphore — DONE #187.
3. Retry+jittered backoff on 429 — DONE #187.
4. **Add NIM to router chain** — NIM_API_KEY SET, free, NVIDIA, separate quota, Llama-3.3-70b. NOT in chain. FREE CAPACITY. ★
5. Cloudflare 8B model as extra chain step (separate limit bucket).
6. Cache profiler by domain — scanner_cache ALREADY caches whole scan 1-day (re-mints should skip LLM) but key lacks code-version (§3).
7. Offline pre-profiling pass at low concurrency before minting.
8. Reduce LLM calls/mint (profiler + verify + summary + keyword) — consolidate.
9. Paid tier (Anthropic Haiku/Gemini paid) — founder spend decision; declined for now.
10. Spread minting over time (== #1).
11. **Deterministic-first / LLM-on-demand**: skip LLM profiler when domain-profession fired OR strong keyword match (high confidence). Cuts LLM calls 50-70%. ★ root lever.
12. Self-hosted LLM (Ollama on Hetzner/Oracle) — free unlimited, infra effort.
13. Provider-matched token-bucket rate limiter.
14. Stagger mint start jitter.
15. Increase Cloudflare paid neurons — spend.

RECOMMENDED COMBINED SOLUTION (free, root-attacking, beats lower-concurrency alone):
**A. Deterministic-first (LLM-on-demand) [#11]** — only call the LLM when the deterministic classifier is NOT high-confidence (no domain-profession + no strong sector keyword). Profession-named/clear-corpus domains skip the LLM (deterministic already correct). Biggest reduction in LLM pressure.
**B. NIM into the router chain [#4]** — multiplies free capacity with a separate quota; chain becomes Cloudflare->Groq->NIM->Gemini.
**C. Semaphore+retry [#2/#3]** — DONE #187 (bounds residual burst).
**D. Lower MINT_CONCURRENCY 5->3 [#1]** — cheap backstop; throughput still clears target.
**E. Fix cache key to include a code/engine version [#6/§3]** — so re-mints either skip LLM (cache hit) OR re-run with current code, never return a pre-fix result.
This eliminates the CLASS (LLM exhaustion) at the root rather than throttling; paid tier (#9) held in reserve if A-E still insufficient at full 2,376 volume.

## 3. SCAN-CACHE HAZARD (newly found)
scanner_cache key = `domain|sector|country`, TTL 1 day, caches ENTIRE scan incl firm_profile + frameworks, NO engine-version component. Effect: after any compliance/firm-profile/connect code change, a re-mint of a domain scanned <1 day ago returns the OLD cached result — the fix appears not to take. This likely caused some false "version-skew/stale" readings. FIX: add an ENGINE_VERSION constant to the cache key (bump on logic changes) so a code change auto-invalidates; re-mints then either hit a still-valid cache (skip LLM) or recompute on current code.

## 4. VERIFIED GAP CLUSTERS (from 5-agent deep analysis 2026-06-29, each traced to origin on CURRENT code)
| ID | Class | Verified verdict | Action |
|----|-------|------------------|--------|
| RC-1 | sector frameworks attach but emit no findings | NOT REAL — engine fires; rashidlaw SRA trigger+check both matched -> correctly compliant. Some check regexes loose (per-rule tuning) | tune loose regexes later; do NOT build finding-engine |
| RC-2 | "registered in UK" on non-UK | MOSTLY FIXED; residual .com HQ-mismatch FIXED #186 | done |
| RC-3 | Equality Act £52.5M fabricated fine | ALREADY FIXED (non_monetary); agents saw stale | re-mint clears |
| RC-4 | LLM-off fallback inherits stale lead.sector | mostly mitigated (#181 router, #184 domain-prof); root = §2 LLM capacity | §2 combined solution |
| RC-5 | sub-sector/business-model blindness (publisher/AR/institutional/medical-tourism) | LIVE, quality | discriminators batch (future) |
| RC-6 | thin/walled corpus not gated -> boilerplate-only audit "looks full" | LIVE | corpus-sufficiency gate (future batch) |
| RC-7 | exec summary SEO-led not compliance-led; truncation/empty | LIVE, quality | summary prompt batch (future) |
| RC-8 | operational-country extraction not consumed (wmedtour 9 countries) | LIVE | profiler->jurisdiction wiring (future) |
| RC-9 | hardcoded UK regulator in finding text | STALE; fresh shows correct regs | re-mint clears |
| RC-10 | regulated-activity (FCA FRN/ATOL on page) not detected under generic sector | LIVE | on-page reg-number scan (future batch) |

## 5. SHIPPED THIS PROGRAM (PRs)
#177-180 sector own-vs-client + ccTLD jurisdiction; #181 Cloudflare-first profiler router; #182 residential corpus; #183 Jina-on-challenge (crawl regression); #184 domain-profession expansion; #185 bounded corpus-fallback latency; #186 HQ reconciliation; #187 LLM semaphore+retry.

## 6. OPEN / NEXT (batched, not yet implemented)
- LLM-capacity COMBINED solution §2 (deterministic-first + NIM-in-chain + cache-version + lower conc).
- Deep verification of clean 60-batch (non-stale) -> confirm/extend clusters.
- RC-5 business-model discriminators; RC-6 corpus-sufficiency gate; RC-10 on-page reg-number scan; RC-7 compliance-led summary; loose check-regex tuning.
- Slow-site timeout (leightonpark/domirealestate) — page-count cap or insufficient-evidence stamp.
