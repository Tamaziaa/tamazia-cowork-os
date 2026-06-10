I now have complete ground-truth on every seam. All four subsystem maps are verified against the actual code: the finding object shape, the `f.status==='miss'` gates in both consumers, the `classifyAll` ctx at build.js:434, the `_quota` map, the build() return at build.js:537, the mint-worker try/catch, the missing `enforcement_news`/`law_verified` DDL, the render `_contract.js` REQUIRED set + exact-count invariants, and the `_adapter.js` membrane gates. I have everything needed to write the definitive plan. This is the integration architecture deliverable.

# Compliance Engine v2 — Definitive PRE-BUILD Integration Plan

Worktree: `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-compliance`
Render repo: `/Users/amanigga/Desktop/TAMAZIA-REBUILD/tamazia-website`
Verified against live code on 2026-06-08. Every anchor below was read, not assumed. The governing constraint: **`build()` is shared by the mint-worker at 2–3k/day; the per-finding object shape and the `build()` return shape are frozen contracts; two consumers hard-gate on `f.status==='miss'`; the membrane renders only `state==='CONFIRMED'`.**

---

## 1. End-to-End Integration Map (seam → exact file:anchor)

```
                         ┌─────────────────────────── ENGINE (Node, cowork-os-compliance) ──────────────────────────┐
 minting_queue ─claim─►  mint-worker.js:mintOne (L38-60)  ── build() ──►  build.js:build (L502) ──► buildPayload (L?-499)
   (WS-C QA gate slot: AFTER L45 r=await build, BEFORE L46 done UPDATE)        │
                                                                              ▼
                                          buildPayload fan-out → compliance.js:scan (L344)
                                                                              │
   ┌──────────────────────────────────────────────────────────────────────── scan() internals ──────────────────────────────┐
   │ L353 gatherCorpus  →  L358 CREDIBILITY GUARD (fail-CLOSED, returns early)  ← LEAVE UNTOUCHED, must run before any resolver │
   │ L368-376 privacyUnreadable                                                                                                 │
   │ L393-398 mergedJur try/catch  ───► REPLACE with resolver.resolveJurisdictions  (WS-B1)                                     │
   │ L410-417 connect()            ───► WRAP/extend (WS-B0 catalogue, WS-B2 confidence rides alongside)                         │
   │ L418 loadRules                                                                                                             │
   │ L424-432 PHARMA sub-gate      ← LEAVE                                                                                       │
   │ L445-455 eval loop:                                                                                                        │
   │     (NEW, before loop) buildSignalIndex  ◄── signals.js  (WS-B1)                                                           │
   │     L446 ruleCheck(r,...)     ───► REPLACE with resolver.resolveRule(r,{...,index})  ◄── resolver.js  (WS-B1)              │
   │     L447 hit-count / L450 privacy-suppress / L451 verify_context  ← LEAVE VERBATIM                                         │
   │ L480-491 payload (findings[]) ← shape FROZEN                                                                               │
   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                              │ comp.findings (status:'miss' items)
                                                                              ▼
   build.js:compPointers (L262-276)  ── maps miss→pointer{bucket:'compliance',...} ── FROZEN
                                                                              ▼
   build.js:L414 findings concat → L428 reachability gate → L431 enforcement backfill (enforcement-map.js)
                                                                              ▼
   build.js:L432-434 classifyAll(ctx)   ───► EXTEND ctx with verified_frameworks  (WS-C verified gate)
                                          ◄── finding-trust.js:classifyFinding  ───► INSERT verified-only gate AFTER L68, BEFORE L71
                                                                              ▼
   build.js:L435 verifyTopFindings (fail-open NLI)  →  L436 _ft.confirmed
                                                                              ▼
   build.js:L475-482 pointers (per-bucket _quota, slice 140)  ───► attach enforcement_live here over _confirmed  (WS-B3/B4)
   build.js:L486 news_map IIFE (reads enforcement_news)        ───► widen + key-match (WS-B3)
                                                                              ▼
   build.js:L459-499 buildPayload return (payload_json keys)   ← shape FROZEN, additive-only
   build.js:L534 INSERT audit_pages RETURNING id (hard-throw)  ← last line of defence, LEAVE
   build.js:L537 build() return {slug,hash,signed_url,...}     ← 7 keys FROZEN
                                                                              │ payload_json::jsonb
   ┌──────────────────────────── RENDER (Cloudflare Pages, tamazia-website) ──┼─────────────────────────────────────────────┐
   │ functions/audit/[[path]].js  → JSON.parse → _adapter.js:payloadToD (L808)                                              │
   │   membrane gates: L819 CONFIRMED-only · L825-832 evidence-gate · L833-838 FW_JUR jurisdiction · L845-852 exposure      │
   │     rescale ── per-breach enforcement → D.frameworks[].action / D.fixes[].prec  ◄── surface enforcement_live additively │
   │ _shell.js:renderShell(D) → HTML                                                                                          │
   │ _contract.js:validateD(D) (L26-35)  ← REQUIRED[]/NONEMPTY[]/dims=10/geo.engines=8/rootCause.chain=4 — CI + QA mirror    │
   └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   (legacy in-repo renderers cloudflare/audit-worker-v14.js + render-v21.mjs read the same payload — keep parity)
```

**New files and exact insertion anchors:**

| New/modified | Exact anchor | What plugs in |
|---|---|---|
| `src/lib/compliance/signals.js` **(NEW)** | `module.exports = { buildSignalIndex, GUARDRAILS }` | Precompute ONE per-corpus index: stripped text, per-page bodies, policy-page set (reuse `_policyPages` regex compliance.js:L372 + `_ANCHOR` L371), `privacyUnreadable` (L376), med-signal flag (reuse `_medSig` L425), trackers from `signals.trackers`. **Move `_stripText`/`_isProse`/`_extractQuote` verbatim** (compliance.js L240-282) here OR re-export — quote-cleanliness must not drift. Expose negative-guardrail predicates: sector/sub-sector mismatch, capability absent, disclosure already present (= old `must_appear` hit), corpus/policy unreadable per-framework. **MUST NOT fetch.** |
| `src/lib/compliance/resolver.js` **(NEW)** | `module.exports = { resolveRule, resolveJurisdictions }` | `resolveRule(rule,{corpus,sector,signals,index})` → ONE finding obj. Negative-guardrails-FIRST: first predicate that clears returns a **non-'miss'** status reusing the exact vocab (`not_applicable_to_sector`, `hit`, `hit_after_trigger`, `no_prohibited_pattern`, `trigger_absent`, `rule_regex_invalid`, `unknown`). Only if NO guardrail clears → `status:'miss'` with the **full field set ruleCheck builds at L333-341/L312/L318**. `resolveJurisdictions({corpus,corpusText,markets,registeredCountry,sector,signals,env})` → `{jurisdictions,detectedJurisdictions,firmProfile,effectiveSector}`, folding `firm-profile.profileFirm` + the two-signal `mergeJurisdictions` gate (L56-71) as ONE fail-open call. |
| `compliance.js` | L393-398 (delete mergedJur try/catch) | `let firmProfile=null, mergedJur=null; try { const {resolveJurisdictions}=require('../../../lib/compliance/resolver.js'); const _rj=await resolveJurisdictions({corpus,corpusText,markets:mk,registeredCountry:country,sector,signals,env:process.env}); firmProfile=_rj.firmProfile; mergedJur=_rj.jurisdictions; } catch(_e){}` — preserve L405 fallback `(mergedJur&&mergedJur.length)?…:Array.from(codes)`. |
| `compliance.js` | L445 (before loop) + L446 (in loop) | Before loop: `const {buildSignalIndex}=require('../../../lib/compliance/signals.js'); const _sigIndex=buildSignalIndex({corpus,corpusText,sector:normSector,signals,policyPages:_policyPages,privacyUnreadable});` In loop: replace `ruleCheck(r,corpus,normSector)` → `resolveRule(r,{corpus,sector:normSector,signals,index:_sigIndex})`. Keep L447/L450/L451 verbatim. |
| `finding-trust.js` | After L68 (relevance veto), before L69/L71 (fine-lock) | Verified-only confidence gate, **no-op unless `ctx.verified_frameworks instanceof Set`**, skip GLOBAL frameworks, reuse `_fwJur`. Pushes distinct signal `law_unverified`. Runs BEFORE L71 so the existing `if(state!=='CONFIRMED')` auto-withholds the fine — **no new fine code.** |
| `build.js` | L432-434 (classifyAll ctx) | Build `_verifiedFw` Set just after L432; pass `verified_frameworks:_verifiedFw`. Keep `corpus_adequate/render_class/jurisdictions/sector` unchanged. **Hard DB error → `undefined` (gate no-ops); zero-rows → empty `Set` (blocks).** Comment the decision. |
| `build.js` | L475-482 (pointers builder) + L486 (news_map) | Attach `f.enforcement_live = nm[f.framework_short] || nm[(f.citation||'').split(/\s+/)[0]] || null` over `_confirmed` AFTER verifyTopFindings/`_ft.confirmed`. Additive; keep `enforcement_example` (floor) untouched and `news_map` at top level. |
| `scripts/refresh-enforcement-news.js` | SOURCES array + upsert loop | Widen reputable feeds (ICO/ASA/EDPB) for more framework coverage. Keep `newsLine()` shape, per-source try/catch, curated-floor fallback. Write canonical codes matching `framework_short`. |
| `_adapter.js` (render) | bingoFromPointer + framework grouping (per-breach action/prec) | Surface `enforcement_live` additively with preference `enforcement_live || enforcement_example || news_map`. Keep PURE. All strings through `fwName()` `[<>]` strip. |
| `_contract.js` (render) | REQUIRED[]/NONEMPTY[] | Add new render-load-bearing D fields ONLY if any are introduced (none required for B0–B1). Mint QA gate mirrors this file. |
| `cloudflare/audit-worker-v14.js` + `render-v21.mjs` | pointer-reshape + framework block | If targeted, carry `enforcement_live` through the reshape (else dropped). `esc()` all new strings. Keep parity with `_adapter.js`. |
| `migrations/2026-06-08-compliance-v2.sql` **(NEW)** | new file | `CREATE TABLE IF NOT EXISTS enforcement_news(...)`; `ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS law_verified BOOLEAN NOT NULL DEFAULT FALSE; ... source_url TEXT; ... last_verified_at DATE;` Idempotent. **Seed `law_verified=TRUE` for the already-shipped framework set in the same migration** so production is not silently emptied on deploy. |
| `scripts/mint-worker.js` | mintOne L45→L46 (inside existing try) | WS-C per-mint QA gate: after `r=await build`, before `done` UPDATE, run a cheap deterministic assertion (mirror `_contract.js` + the miss-evidence invariant). On fail → `throw` (existing L55-58 catch marks that ONE row failed/pending). **Never** in `drainOnce` around the `Promise.all`. |

**Confirmed facts that shape the plan (ground-truth, not the map's word):**
- `enforcement_news` and `law_verified` have **zero DDL** anywhere — grep returned empty. The migration is a hard prerequisite, not optional.
- The render contract `_adapter.js`/`_contract.js` are in the **sibling repo** `tamazia-website`, plus legacy `cloudflare/audit-worker-v14.js`+`render-v21.mjs` live in this repo and read the same payload. Both must keep parity.
- `adversarial-test.js` currently does **NOT** exercise compliance.js / connect.js / resolver / finding-trust at all (only `jurisdiction-router`, markets, ICP, scanners). New assertions for the resolver are net-new and must be added (Phase B1).
- `package.json` has no `test` script. Tests run by direct `node` invocation; exit code from `adversarial-test.js` is `process.exitCode=1` on any FAIL.
- The `loadRules` shape already COALESCE-defaults all 18 fields (compliance.js L22-61) — new columns stay additive and old rows parse.

---

## 2. WON'T-BREAK CHECKLIST (every frozen field/column/shape + its guard)

### A. Per-finding object (compliance.js `scan().findings[]` — written by resolveRule, read by BOTH consumers)
Two consumers hard-gate `f.status==='miss'`: **run.js#buildCanonicalPointers (L172-191)** and **build.js#compPointers (L262-276)**.

| Field | Guard |
|---|---|
| `status` — literal `'miss'` for real breaches | resolveRule emits `'miss'` ONLY for unguarded breaches; non-binding rules reuse the EXACT existing non-miss vocab (`not_applicable_to_sector`/`hit`/`hit_after_trigger`/`no_prohibited_pattern`/`trigger_absent`/`rule_regex_invalid`/`unknown`). **Never invent a new breach status.** Grep both consumers for `status===` before merge. |
| `checked_urls` (=`pool.map(c=>c.url)`, L339) | resolveRule MUST set this on **every absence miss** (or `evidence_quote`, or `trigger_evidence.quote`) — else finding-trust L51 demotes to NEEDS_REVIEW and the breach silently vanishes. **Unit assert: every `status:'miss'` has `(checked_urls.length>0 || evidence_quote || trigger_evidence.quote)`.** |
| `rule_id, code, framework, severity, rule_type, description, citation_url, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, service_page_path, pricing_tier, enforcement_example, evidence_url, evidence_snippet, evidence_quote, rule_pattern_summary, trigger_evidence` | Copy the L333-341/L312/L318 builder field-for-field. Snapshot-test `resolveRule` output keys against a golden set captured from `ruleCheck` on a fixture. |
| `evidence_quote` cleanliness (null for nav/footer, non-null for prose) | Move `_stripText`/`_isProse`/`_extractQuote` **verbatim** into signals.js (or re-export). Assert null on a known nav string and non-null on a known prose breach via the `site-scan.test` pattern. |
| `severity` ∈ `P0|P1|P2` exactly | `sevRank` (compliance.js L495) + `sevRank` map (build.js L291) both assume P0/P1/P2. Resolver never emits anything else. |
| `framework` correctly prefixed | finding-trust RELEVANCE VETO (L65-67) + render FW_JUR gate need a parseable prefix. Pass through `rule.framework_short` unchanged. |

### B. compliance.js top-level payload (read by build.js buildPayload + cache)
| Key | Guard |
|---|---|
| `ok, reachable, frameworks[], jurisdictions[], detected_jurisdictions[], firm_profile, detected_sector, rules_evaluated, hits, misses, p0/p1/p2_misses, corpus_pages[], findings[]` | Resolver may ADD keys (`guardrails_fired`, `resolver_version`) but **MUST NOT remove/rename** any. Diff payload keys before/after on the fixture set. |
| `jurisdictions` = `allJurisdictions` (drives finding-trust `ctx.jurisdictions` + L471 cookie-diff region gate) | resolveJurisdictions **always includes the registered country** (codes seed) and fails open to null/[] so L405 fallback to raw `codes` fires. **Never an empty jurisdiction set.** |
| Fail-CLOSED empty-corpus payload `{ok:true, reachable:false, rules_evaluated:0, findings:[], note, block_reason, http_status, challenge, pages_tried}` (L360) | The L358 guard stays BEFORE any resolver call (returns early). **Test: empty corpus → this exact payload, zero findings.** |
| Cache key `${domain}|${sector}|${country}` + shape (L347/363/492) | Unchanged. |

### C. build.js payload_json (`schema_version:'v2'`, read by render adapter + remint + template-resolver + eval)
| Key | Guard |
|---|---|
| `pointers[]` item shape: `{state, bucket, severity, framework_short, citation, fact, layman_explanation, tamazia_fix_short, recommendation, evidence, evidence_quote, checked_urls, fine_low_gbp, fine_high_gbp, fine_withheld, enforcement_example, bingo, metric}` | Adapter reads these specific keys and **silently drops off-spec items**. New `enforcement_live` is additive. `bucket` must exist in `_quota` (L478). Snapshot-test `pointers[0]` keys. |
| Per-bucket `_quota` (compliance:60, …) + `.slice(0,140)` (L478-482); `needs_review.slice(0,40)` (L483) | High-recall resolver must not flood compliance and starve seo/ai_visibility. **Assert each major bucket contributes ≥1 confirmed pointer** on the fixture set. |
| `news_map{framework_short:string}` | Keys must be `framework_short`. **Mint-time assert: every news_map key is a known framework_short.** Renderer `esc()`s but does not parse. |
| `trust_summary{confirmed,needs_review}`, `applicable_frameworks[]`, `detected_jurisdictions[]`, `engine_jurisdictions[]`, `scan{reachable,...}`, `keyword_map`, `ai_citation`, `framework_version` + ~40 others adapter reads via `g()` | Additive-only. Adapter degrades MISSING keys to "not assessed" silently — which is exactly why the QA gate (validateD) must catch it. |

### D. build() return (mint/verify contract — 7 keys frozen)
| Key | Guard |
|---|---|
| `{slug, hash, signed_url, signed_exp, framework_version, applicable_frameworks, pointers, reachable}` (L537) | mint-worker reads `slug/hash/signed_url` (binds `leads.audit_url`) + logs `applicable_frameworks.length`/`pointers.length`; verify-audits reads `signed_url`. **Never rename; `pointers` must stay an array** (the `.length` logs would throw on non-array). New keys additive. |
| `audit_pages INSERT … RETURNING id` hard-throw (L534-535) | Stays the last line of defence against dead links. **Leave.** |

### E. window.D render contract (`_contract.js:validateD`)
| Invariant | Guard |
|---|---|
| REQUIRED[] non-null (meta.*, score, grade, exposure*, counts.*, scoring.*, seo.*, geo.*, competitors.*, …) | Any change keeps these populated. Run `validateD` on a re-mint before deploy. |
| NONEMPTY[] arrays: `frameworks, dims, fixes, trajectory, seo.keywords, geo.engines, competitors.rows, pricing, addons` | Resolver suppression must not drop `frameworks` below the render floor — `_adapter.js` has a ≥5-framework honest top-up; verify per-firm. |
| **Exact counts: `dims.length===10`, `geo.engines.length===8`, `geo.rootCause.chain.length===4`** | Compliance changes don't touch these, but `validateD` asserts them — keep green. |
| Membrane: only `state==='CONFIRMED'` renders; FW_JUR jurisdiction gate; P0/P1 fined findings need quote-or-checked_url | Defense-in-depth independent of engine. Verify `D._trace.allow` per firm. |

### F. DB columns / migrations
| Object | Guard |
|---|---|
| `enforcement_news` table | **No DDL exists** → ship `CREATE TABLE IF NOT EXISTS` BEFORE enabling per-breach live attach. Verify `\d enforcement_news`. |
| `compliance_rules.law_verified / source_url / last_verified_at` | `ADD COLUMN IF NOT EXISTS`, idempotent. **Seed `law_verified=TRUE` for shipped frameworks in the same migration** or production empties on deploy. |
| `compliance_rules` 18-field shape (loadRules L22-61) | All COALESCE-defaulted; new rule columns (`negative_guardrail`/`applies_when`/`sub_sector`) are additive-only and not required for B1. Old rows still parse. |
| `audit_pages` domain/slug/hash columns | **Do not touch** `slugify()`/`generateHash()`/the INSERT — push-to-mystrika cross-bind guard drops prospects on mismatch. |

### G. Lead-pipeline coupling (the subtle one)
| Coupling | Guard |
|---|---|
| `lead-quality.js` L134-139 READS `audit_critical/audit_high/ai_cited/ai_visibility_gap` but **nothing writes them today** | If WS-B3 begins writing these back to the lead row, the dormant tier branch goes LIVE and silently re-tiers leads → auto-mint/auto-send. **Treat as a gate change: flag-gated, before/after `icp_tier` distribution diff, founder sign-off.** Do not write these columns in B0–C without that process. |
| `audit_url` write-once (mint-worker L51-52, `IS NULL OR ''`) | Panel changes reach existing leads only via `remint-audits.js` (updates payload_json by slug/hash, **same URL**). Never relax the write-once guard. |

### H. Fail-OPEN vs fail-CLOSED (do not invert)
| Path | Direction | Guard |
|---|---|---|
| Corpus credibility guard (compliance.js L358) | fail-CLOSED | Stays before resolver. Empty corpus → reachable:false, findings:[]. |
| resolveJurisdictions / resolveRule | fail-OPEN | Any throw → deterministic fallback (`codes` / drop rule). Never empty jurisdiction set, never a miss with no evidence. |
| Every LLM/network step in buildPayload (verifyTopFindings, exec_summary, fix-writer, live-enforcement) | fail-OPEN | Wrapped try/catch + `AbortSignal.timeout`. **No un-timed awaits.** Prefer cron-refreshed `enforcement_news` over per-mint fetch. |
| verified-only gate (finding-trust) | fail-OPEN on DB error (`undefined`→no-op), fail-CLOSED on zero-rows (empty Set→blocks) | Explicit + commented. Seed migration prevents accidental empty. |

---

## 3. Build Order (B0 → B1 → B2 → B3 → C → D) — each step keeps the engine green

The order is dictated by the dependency graph: **schema before any code that reads it; the catalogue before the resolver that reads it; the resolver before throughput tuning; enforcement data before the panel; the QA gate before go-live.** Land each phase behind a default-off seam so the live mint path is never red between phases.

**Phase 0 — Baseline (WS-A, task #60). DO FIRST.**
Capture the green baseline so every later diff is meaningful. Snapshot for the 22 fixtures: `rules_evaluated`, `hits`, `misses`, `p0/p1/p2_misses`, and `pointers[].keys`. Run the existing suite (commands in §4). Commit the snapshots. **Nothing ships until this is green and recorded.**

**Phase B0 — Merged 18-field canonical law repo (task #61). Schema + data only, zero behaviour change.**
1. Write `migrations/2026-06-08-compliance-v2.sql`: `enforcement_news` DDL + `law_verified/source_url/last_verified_at` columns + **seed `law_verified=TRUE` for the currently-shipped framework set**. Idempotent.
2. Merge/de-dup the catalogue so rules become detection-children of the 18-field schema. Because `loadRules` (L22-61) and `loadCatalogue` (connect.js L110-118) already COALESCE every column, **old rows keep parsing and `connect()` output is unchanged**.
3. Apply migration to staging; `\d enforcement_news` + confirm column adds.
4. **Green check:** re-run baseline. `rules_evaluated`/`hits`/`misses` must be **identical** to Phase 0 (data merge must not change what binds). If counts move, the merge changed semantics — fix before proceeding.

**Phase B1 — signals.js + resolver.js (negative-guardrails-first) (task #62). The core surgery.**
1. Create `signals.js`: move `_stripText`/`_isProse`/`_extractQuote` verbatim; build `buildSignalIndex`; expose guardrail predicates. (Pure, no fetch.)
2. Create `resolver.js`: `resolveRule` (guardrails-first, identical miss field-set, identical non-miss vocab) + `resolveJurisdictions` (fail-open, registered-country-always-in).
3. Wire compliance.js: replace L393-398 (jurisdictions) and L445-446 (build index + resolveRule). Keep L447/L450/L451 verbatim. Old `ruleCheck` may stay as dead code.
4. **Add resolver assertions to `adversarial-test.js`** (currently has none): every `status:'miss'` carries `checked_urls||evidence_quote`; empty corpus → fail-closed payload; `resolveRule` non-miss vocab ⊆ existing set; `evidence_quote` null on nav / non-null on prose.
5. **Green check:** re-run baseline + the new assertions. Diff `rules_evaluated/hits/misses` vs Phase 0 — they should match within the guardrail intent (guardrails only DROP rules that were already non-binding, or convert a `must_appear` hit to the same `hit` status). **Al Tamimi assertion: `jurisdictions===['AE']` (+EU only if `serves_eu`).** Any new breach that wasn't there before is a regression.

**Phase B2 — Throughput-safe detection (task #63). Performance only, no shape change.**
1. The index is already built ONCE per scan (B1). Confirm `resolveRule` does no per-rule re-fetch and no per-rule full-corpus re-strip (reads `index`).
2. Any new network step is `AbortSignal.timeout`-bounded + fail-open (mirror existing 15-25s cogs).
3. **Green check:** measure mints/min on a 50-lead `--once` batch before vs after; must hold the 2-3k/day rate at `MINT_CONCURRENCY=10`. Set a CI budget.

**Phase B3 — Live enforcement + verified gate + per-breach panel (tasks #64, #65-verified-gate).**
1. `finding-trust.js`: insert verified-only gate AFTER L68, BEFORE L71 (no-op unless `ctx.verified_frameworks instanceof Set`).
2. `build.js` L432-434: build `_verifiedFw` (`undefined` on hard DB error, empty Set on zero rows), pass into ctx.
3. `build.js` L486 + L475-482: widen news_map, attach `enforcement_live` over `_confirmed` AFTER verifyTopFindings, key-matched to renderer's `framework_short || citation.split()[0]`.
4. `refresh-enforcement-news.js`: widen reputable sources, keep self-healing.
5. Render: surface `enforcement_live` additively in `_adapter.js` (and carry through `cloudflare/audit-worker-v14.js` reshape if that renderer is in play); `esc()`/`fwName()` all new strings.
6. **Green check:** backtest assert — a known-verified framework (e.g. `UK_GDPR_A13`) on a fixture stays CONFIRMED; an unverified-law finding returns `fine_low_gbp===null && fine_high_gbp===null && fine_withheld===true`; `news_map` keys all known framework_short; render parity (live → example → none) holds.

**Phase C — Self-audit / QA gate (task #65). Fail-closed per mint, fail-soft per batch.**
1. Add the QA assertion in `mint-worker.js` mintOne between L45 and L46, **inside the existing try**. Mirror `_contract.js:validateD` + the miss-evidence invariant + "every pointer bucket ∈ _quota" + "news_map keys known". On fail → `throw` (L55-58 marks that ONE row failed/pending; the `Promise.all` batch continues). Deterministic, local, no network.
2. **Green check:** force a malformed payload for one fixture lead → that row goes `failed`, the rest of the batch mints, `leads.audit_url` for the bad one stays unbound (no dead link emailed). A good fixture → bound URL + non-empty `audit_pages` row.

**Phase D — Agency completion / go-live (task #66). Validation + backfill only.**
1. Run `remint-audits.js` to backfill the panel onto live audits **without re-binding URLs** (write-once preserved).
2. Full pipeline backtest + cross-bind guard: mint a fixture, run push-to-mystrika guard, assert **0 drops** for a correctly-bound lead.
3. Confirm `lead-quality.js` L134-139 columns are still **unwritten** (no silent re-tier). If WS-B3 deliberately wires them, run the flagged before/after `icp_tier` diff + founder sign-off first.
4. Default knobs unchanged: `AUDIT_PAYLOAD_STORE=neon`, `MINT_CONCURRENCY=10`.

---

## 4. Exact Re-Green Test Commands (run after each phase)

All from worktree root `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-compliance`. `node` direct (no `npm test` exists). A clean exit code 0 (or printed `PASS`) is the gate.

**Universal gate (after EVERY phase):**
```bash
# 1. Adversarial regression (offline; exit 1 on any FAIL). Extend with resolver assertions in B1.
node scripts/adversarial-test.js

# 2. Unit suites (pure, offline)
node tests/phase-6.7-10-layer.test.js
node src/lib/audit/tests/site-scan.test.js          # quote-cleanliness: evidence_quote null on nav, non-null on prose
node src/lib/sourcing/tests/icp.test.js
node src/skills/S008-personalisation-engine/tests/10-layer.test.js

# 3. Jurisdiction regression (the Al Tamimi spine)
node scripts/test-jurisdiction.mjs                  # assert Al Tamimi jurisdictions===['AE'] (+EU iff serves_eu)
```

**Phase 0 / B0 (schema + baseline):**
```bash
# DB reachable + schema present after migration
node scripts/test-connection.mjs
# Snapshot the 22-firm rules_evaluated/hits/misses/p0-p2 BEFORE changes (and re-diff after B0 — must match)
node scripts/backtest-personalisation.js
# Post-migration column check
./scripts/psql "$NEON_URL" -tA -c '\d enforcement_news'
./scripts/psql "$NEON_URL" -tA -c "SELECT count(*) FROM compliance_rules WHERE law_verified=TRUE"   # >0, seeded
```

**Phase B1 (resolver) — the diff that proves no new breaches:**
```bash
node scripts/adversarial-test.js                    # now includes resolver assertions
node scripts/backtest-personalisation.js            # diff rules_evaluated/hits/misses vs Phase-0 snapshot
# Single live scan, eyeball findings shape + status vocab
node src/skills/S008-personalisation-engine/scanners/compliance.js altamimi.com law-firms AE
node src/skills/S008-personalisation-engine/scanners/compliance.js <fixture-uk-firm> law-firms UK
```

**Phase B2 (throughput) — timing budget:**
```bash
# 50-lead drain, wall-clock + mints/min before vs after (hold 2-3k/day at CONC=10)
time MINT_CONCURRENCY=10 node scripts/mint-worker.js --once
```

**Phase B3 (enforcement + verified gate):**
```bash
node scripts/backtest-personalisation.js            # verified framework stays CONFIRMED; unverified → fines null + fine_withheld
node scripts/eval-audit.mjs <slug> <hash>           # render-side validateD + per-breach enforcement preference
# news_map key sanity (every key a known framework_short)
node scripts/backtest-full-pipeline.js
```

**Phase C (QA gate) — fail-closed proof:**
```bash
# Sample mint of a real fixture lead → bound URL + audit_pages row
node src/skills/S025-audit-page-builder/scripts/build.js --domain <fixture> --sector law-firms --country UK --company "Fixture Co"
# Force-malformed fixture → row 'failed', batch continues, audit_url unbound (manual: inject bad payload, run --once)
node scripts/mint-worker.js --once
```

**Phase D (go-live) — full pipeline + cross-bind:**
```bash
node scripts/backtest-full-pipeline.js              # all 7 stages PASS through seed inbox (no real prospect)
node scripts/verify-audits.js                       # re-check audit_url live (HTTP 200), self-heal-gated
node scripts/remint-audits.js                       # backfill panel onto live audits, SAME URL (write-once kept)
# Render contract on a re-mint (CI parity)
node scripts/eval-audit.mjs <slug> <hash>
```

**Definition of "green" per phase:** (1) `adversarial-test.js` exit 0; (2) all four unit suites print PASS; (3) `backtest-personalisation.js` shows `rules_evaluated/hits/misses` within intent vs the Phase-0 snapshot (only DROPS from guardrails, never new breaches); (4) `validateD` returns `[]` (no missing/empty contract paths, `dims=10`/`geo.engines=8`/`rootCause.chain=4` hold); (5) Al Tamimi `jurisdictions===['AE']`; (6) a forced bad mint fails exactly one queue row and leaves no dead `audit_url`; (7) push cross-bind guard drops 0 correctly-bound leads.

**Net regression budget: ZERO new findings, ZERO renamed keys, ZERO new dead links, ZERO throughput loss.** Every new seam is fail-open (resolver, LLM, enforcement) except the two intentional fail-closed gates (corpus credibility, per-mint QA), and both of those already exist or sit inside the existing try/catch so one bad mint never aborts the 2-3k/day batch.