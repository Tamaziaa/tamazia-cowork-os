# AUDIT ENGINE · CURRENT STATE (read this first for any compliance/audit engine session)

Last synced 2026-07-10, end of the blind-send v18/v19 session. This is the audit-engine equivalent of `PROJECT-MEMORY.md` (which covers the AGENCY lead-gen side only). If you are working on sourcing, sending, or the cockpit instead, read `PROJECT-MEMORY.md` and `CLAUDE.md`; the off-limits boundary documented there between the agency engine and this audit engine is correct and intentional, not stale, verified this session.

**Do not trust this file's prose over live evidence.** It is a snapshot. Before acting on anything below, re-run STEP 0 at the bottom of this file. Every fact here has a commit hash, a PR number, or a Neon query behind it; if you find a contradiction between this file and the live repo or database, the live source wins and this file is wrong.

---

## 1. What this workstream is

The compliance audit engine (`src/lib/compliance/`, `src/lib/audit/`, `src/skills/S008-personalisation-engine/`, `src/skills/S025-audit-page-builder/`, plus the renderer in the sibling `tamazia-website` repo: `functions/audit/`, `public/audit/`) crawls a prospect's website, determines which sector and jurisdiction they sit in, attaches the correct binding law set, finds evidenced breaches, and mints a shareable audit page used as a cold-outreach asset ("blind send"). The project this session: make every cell of the sector x jurisdiction matrix (legal, healthcare, finance, real estate, hospitality, accounting x UK, EU, USA, UAE) correct enough to send blind, with zero fabrication.

## 2. ENGINE_VERSION lineage (reconstructed from full git history, not memory)

| Version | Commit | Date | What it fixed |
|---|---|---|---|
| v7 → v16 | (see `git log -S"ENGINE_VERSION" -- src/skills/S008-personalisation-engine/scanners/compliance.js`) | 29 Jun – 10 Jul | Prior sector self-ID and DP-policy-guard work, not detailed here |
| v17 | `beca686` | 10 Jul | Own-identity self-ID override fix (flat keyword list was misclassifying own firm) |
| **v18** | `405321d` | 10 Jul | **This session's main delivery.** See section 3. |
| v18.1 | `5969faf` | 10 Jul | Main payload now emits `nexus` + `jurisdiction_families` (root cause of a V07 false-positive); SITE_INTEGRITY finding gained evidence fields |
| v18.2 | (squashed into a later commit) | 10 Jul | Engine self-derives the nexus map from the corpus when callers omit `signals` |
| v18.3 | `d8fc6af` (PR #260) | 10 Jul | V11 hard floor: an unassessed or unreachable crawl is never outreach-eligible, plus AE/SA/QA family symmetry on V02 |
| **v19** | `5997ea9` (PR #261) | 10 Jul, 17:54 UTC | **Not mine. Merged by `Tamaziaa` after my v18.3.** Free Jina (`r.jina.ai`) wall-bypass rescue for the WAF-blocked runner. See section 6, UNRESOLVED. |
| (parallel) | `98ff413` (PR #262), `6adb13c` (PR #263) | 10 Jul | **Not mine.** LLM router reordered Groq → NVIDIA NIM → Gemini → Alibaba Qwen, "per founder." Addresses part of the founder-only LLM key item. |

Reconstruct this table yourself with:
```
git log --all -S"ENGINE_VERSION = process.env.COMPLIANCE_ENGINE_VERSION" --format='%ad %h' --date=short -- src/skills/S008-personalisation-engine/scanners/compliance.js
```

## 3. The six original bugs and proof of fix (v18)

Proven from live v17 payloads before the fix, re-verified from live v18/v19 payloads after.

| Bug | Was | Fix | Live proof after |
|---|---|---|---|
| B1 sector misclassification | ahdubai.com (hospital) shipped as law-firms | Deny-by-default sector fallback, two-cue rule (E-005/006, `firm-profile.js`) | ahdubai.com mints as healthcare, `verified=true` |
| B2 thin AE catalogues | finsbury-associates.com bound 2 frameworks | `BASELINE_BY_FAMILY` gives AE its own established/serves sets (E-023/024, `connect.js`) | abspartners.ae binds 5 correctly typed AE frameworks |
| B3 UK establishment dropped | masecoprivatewealth.com (London, FCA) shipped US-only | Establishment-first nexus assembly (E-013/014); self-derived nexus (v18.2) | Fix is in code; live re-mint blocked by the v19 crawl issue, section 6 |
| B4 evidence-less jurisdictions | maguirejackson.com carried US with no offices, no serves | Verifier V07: no family without typed nexus evidence | Ghost-US quarantines correctly |
| B5 wrong-family cookie law | AE-only firms cited "UK PECR + UK GDPR" | Family-keyed `_cookieRegimes()` (E-023 twin, `extra-scanners.js`) | abspartners.ae binds a pure AE stack, zero UK law |
| B6 unreachable sites shipping findings | brookswm.co.uk shipped DA-0 plus absence findings | V11 hard floor: unassessed/unreachable never ships | brookswm quarantines correctly |

## 4. Engine changes shipped (all merged to `main`, PRs #257, #258, #259, #260)

- **E-005/006** `firm-profile.js`: deny-by-default sector fallback, needs 2 distinct keyword cues beating the runner-up, else `professional-services` + `sector_confident=false`.
- **E-013/014** `compliance.js`: establishment-first family assembly from `signals.nexus` (UK/EU/USA/AE/SA/QA), evidence-gated attach, `_jurFamilies` threaded through.
- **E-023/024** `connect.js`: `BASELINE_BY_FAMILY` replaces the single `UNIVERSAL_FW`. Each family (UK, EU, US, AE, SA, QA, GLOBAL) has its own established/serves law sets. Removed from every baseline: DIFC_DPL, ADGM_DPR, four US state privacy acts, DE_BDSG, FR_CNIL_2025.
- **E-041/044** `compliance.js`: evidence gate after the severity sort. Quote >=25 chars, verbatim-anchored in fetched corpus, testimonial/nav fragments rejected, absence findings need a proving page. Demotes to `NEEDS_REVIEW` + `gate_reason`, fine withheld. `finding-trust.js` respects gate demotions (a demoted finding can never be re-CONFIRMED downstream).
- **E-045** `ENGINE_VERSION` cache-bust (now v19, section 2).
- **E-082** `build.js`: `verifyPayload` runs before the `audit_pages` INSERT. Row carries `verified` + `verify_report`. Quarantined rows persist, never outreach-eligible.
- **E-101 to E-110, V11** `src/lib/audit/verify-payload.js`: V01 sector laws blocked on unconfident sector, V02 no law without its family (now symmetric UK/EU/AE/SA/QA), V03 threshold acts need evidence, V04 no gated finding ships, V05 absences need proof, V06 no placeholder regulators, V07 every family needs nexus evidence, V08 foreign-sector-law deny-list, V09 no statutory-max headline, V10 hygiene, **V11 (v18.3): unassessed/unreachable crawl is never outreach-eligible.**
- **E-111** `scripts/send-gate-summary.js` + `mint-now.yml`: every mint run prints verified vs quarantined counts for the last 6h.

## 5. Renderer changes shipped (tamazia-website, PR #153, merged, Cloudflare Pages deployed)

`functions/audit/_adapter.js` + `public/audit/audit-app.js`: headline split (E-090: "X obligations verified breached... Y further frameworks bind you and were assessed at page level"), zero-breach M-2 header (a clean audit reads as depth, not emptiness), render-side quote gate (E-091, twin of the engine gate), binding label map incl. `industry_code` (E-092), APPLIES · ASSESSED badge with inspected pages (E-088), two Calendly CTAs (E-094).

## 6. RESOLVED (2026-07-11) — the zero-pages anomaly was NOT Jina: it was a v18.2 scope bug

**Root cause found and fixed (E-201, v21).** v18.2 (`a3eaf38`) declared `_nx`, `_estF`, `_srvF` and `_jurFamilies` inside the PRIMARY-JURISDICTION whitelist block (compliance.js ~915-944) while lines ~1020 and ~1147 read them outside that scope. Every mint since threw `ReferenceError: _nx is not defined`, caught upstream and written as `compliance_error` with `compliance_unassessed=true` and zero pages: exactly the live evidence this section documented. 55 of the 55 most recent audit_pages rows carried that literal error string. The Jina rescue (PR #261) was diagnosing the wrong layer; it may still be useful for genuine WAF blocks but was never the outage. Fixed in v21 by hoisting the four declarations to function scope. Also shipped in the same session: E-202 LLM blind-send cross-verifier (src/lib/audit/llm-verify.js, fail-closed V12_llm_crosscheck, live-tested flagging UK_PECR on an AE firm and passing a clean UK firm, Qwen key confirmed working end to end), E-203 canonical country codes at the write seam, E-204 one-live-audit-per-domain supersede, E-205 out-of-ICP sector gate (V15). Full defect catalogue: the audit-of-the-audits document (11 Jul session), 108 primary + 200 secondary issues.

### Historical record of the (wrong) prior diagnosis

PR #261 (`5997ea9`, merged 17:54 UTC by `Tamaziaa`, not this session) claims to fix the runner crawl blocker reported at the end of this session's v18.3 work: the GitHub Actions runner's datacenter IP gets WAF-challenged, the paid Apify residential rescue was down (credential/credit), so it adds a free `r.jina.ai` fallback and removes a gating bug that skipped the rescue on a hard 403. Commit message claims local verification: "medcare.ae 8 pages, pallmallmedical 7 pages."

**Live evidence contradicts this as of last check.** Mint-now runs confirmed via `head_sha` to have `5997ea9` checked out (17:55 and 18:20 UTC runs, both `completed success`) still produced `audit_pages` rows with `npc:0` (zero pages crawled) and `verified:false` for beaconhospital.ie, bsalaw.com, carbonhealth.com, pallmallmedical.co.uk, generated 18:26 to 18:50 UTC, i.e. after the fix was live. `scanner_cache` has zero rows for these domains, ruling out stale cache. The mint-now job log for that run contains **no trace of a Jina attempt at all**, not even a failure line, grepped for `jina|wall-bypass|rescue`.

**Next diagnostic (not yet done):** read the actual diff of `5997ea9` against `src/skills/S008-personalisation-engine/scanners/compliance.js` to see exactly where the Jina call sits and why it produces no log output and no pages. Hypotheses, unranked, unverified: the rescue path throws before its log line; Jina itself is now also blocked from the runner's IP; the rescue only fires on a specific corpus-empty condition that isn't the one these domains hit; a second, unlogged gate short-circuits before reaching it. As of this file's last sync, two more unrelated commits (`98ff413`, `6adb13c`) landed on main after the v19 fix without addressing this, so it is very likely still broken; verify before assuming otherwise.

**Do not re-run the eight/ten-firm test matrix mint until this is resolved**, or you will burn another WAF-escalation cycle for no signal, same mistake made earlier this session.

## 7. Database state (Neon)

`audit_pages.verified` and `.verify_report` columns added (self-provisioning via `ensure-schema.js` on every run, safe to re-run). Catalogue fixes applied: FAIR restricted to real-estate/housing (E-053), UK_ARLA `binding_status='industry_code'` (E-057), `US_REG_E_EFTA` restricted to finance (E-054). `minting_queue` source tags used this session: `blindsend-verify` (original 10-domain watch list), `blindsend-lh` (8-firm legal/healthcare matrix).

Watch domains: finsbury-associates.com, fichtelegal.com, abspartners.ae, masecoprivatewealth.com, connells.co.uk, ahdubai.com, lvproperty.co.uk, maguirejackson.com, brookswm.co.uk, gtag.ae.

Legal/healthcare matrix (queued, mint blocked on section 6): russell-cooke.co.uk (UK legal), whitneymoore.ie (IE legal), goulstonstorrs.com (US legal), bsalaw.com (AE legal), pallmallmedical.co.uk (UK health), beaconhospital.ie (IE health), carbonhealth.com (US health), medcare.ae (AE health).

## 8. Compliance-section marketing redesign (agreed direction, not yet built)

Founder's verdict after this session: the breach-hunting compliance section wastes time because it depends on a crawl that can be blocked (see section 6) and on interpretive findings that can be wrong. Agreed reframe: **stop proving breaches, start proving knowledge.** Buyer trust comes from what is deterministic and externally verifiable, not from what the crawler happened to catch.

**Eight modules, in render order, agreed but not built:**
0. **The Grade** — A+ to F, deterministic scoring (Sweep pass count + register alignment + obligation completeness), never touched by interpretive findings.
1. **Registered Reality** — cross-check the prospect's own government register record against their site: Companies House (`CH_API_KEY`), ICO fee-payer register, SRA record (legal/UK), CQC rating + Regulation 20A display duty (`CQC_API_KEY`, health/UK), FCA register (`FCA_API_KEY`, finance/UK), DHA/MOHAP link-out (health/AE). Every row links to the government page so the reader verifies Tamazia in one click.
2. **The Obligation Map** — the v18/v19 binding-law work, rendered as the centrepiece: what binds, why (nexus quote from their own site), regulator, one-line obligation, APPLIES · ASSESSED badge, effective-date chips.
3. **The Sweep** — twelve binary statutory checks (privacy policy reachable, cookie consent before fire, regulator number displayed, complaints procedure per the DUAA duty in force 19 Jun 2026, accessibility statement, etc.), each with the URL checked and the rule that requires it. Degrades honestly to "not confirmed on this scan" if the crawl is unavailable; never blocks the ship.
4. **Precedent panel** — three recent regulator enforcement actions per sector/jurisdiction, human-reviewed before render (`framework_intelligence.reviewed_at` gate), sourced via `BRAVE_API_KEY`/`SERPER_KEY`, summarised by `ANTHROPIC_API_KEY`, approved in the admin cockpit.
5. **Peer line** — percentile against Tamazia's own minted-audit corpus (9,721+ audits), nightly SQL aggregate, no external dependency.
6. **The Unseen list** — seven artefacts a regulator requests that no outside scan can see (records of processing, DPIAs, processor agreements, training log, breach register, retention schedule, sector file reviews). This is the honest close, not a locked-content trick.
7. **Conversion wiring** — two Cal.com CTAs (`CALCOM_API_KEY`), GC-ready PDF via R2 + Resend, Turnstile-guarded re-check button, PostHog funnel events.

**Ship-gate redefinition needed:** `verified = obligation_map_built AND registers_checked >= 1 AND (sweep_ran OR crawl_unavailable_disclosed)`. This removes the crawl as a hard dependency for shipping at all, which directly neutralises the section-6 blocker's ability to stop outreach.

Full research backing (regulator sources, competitor-engine mechanics, buyer-archetype reasoning) is in two HTML documents delivered this session in chat; their substance is preserved above. If the originals are needed verbatim, rebuild from this section, they were not committed anywhere durable outside this file.

## 9. Ranked next steps

1. Diagnose the v19 Jina-rescue gap (section 6) before any further minting. Read the `5997ea9` diff directly.
2. Once a mint returns real pages, re-run the ten-domain watch list and the eight-firm legal/healthcare matrix, verify every cell against the expected binding stacks in section 3's table logic.
3. Build the compliance-section redesign (section 8), starting with the ship-gate redefinition since it removes the crawl dependency that keeps causing outages, then the register layer (Companies House + CQC first, both keyed and free).
4. Wire outreach to `WHERE verified = TRUE` only, permanently.

## 10. Founder-only items

- Apify residential proxy: confirm token validity and credit balance, or accept the free Jina path once section 6 is actually working and retire the Apify dependency.
- Anthropic API key / Alibaba Qwen activation for the LLM assistance layer: **partially resolved**, PR #262/#263 added Qwen as a fallback per founder instruction; confirm `DASHSCOPE_API_KEY` is present and working end to end.
- Confirm who ran the session that produced PR #261, #262, #263, so this file's "not mine" attributions can be corrected if it was in fact a parallel authorised session.

## 11. STEP 0 for the next session, run this before trusting anything above

```bash
# engine repo
cd tamazia-cowork-os && git fetch --all -q && git log -1 --format='%h %ad %s' --date=short origin/main
grep -n "ENGINE_VERSION = process.env" src/skills/S008-personalisation-engine/scanners/compliance.js
# live queue + last mints
# (Neon HTTPS SQL API against NEON_URL, see password.md)
select status, count(*) from minting_queue group by 1;
select domain, verified, jsonb_array_length(coalesce(payload_json->'pages_crawled','[]'::jsonb)) npc, generated_at
  from audit_pages order by generated_at desc limit 10;
# latest mint-now run log, grep for the domain(s) you care about
```


## 12. 2026-07-11 session addendum

- v21 (`E-201`) unblocks minting; DASHSCOPE_API_KEY value confirmed working (workspace 911052, Singapore); founder must confirm the same key is set as a GitHub Actions secret for mint-now.
- Send gate policy: outreach eligibility = `verified = TRUE`; for the priority sectors (legal, healthcare, hospitality, real estate, finance/wealth) additionally require `payload_json->'llm_verify'->>'status' = 'pass'`.
- Neon migrations applied this session: country canonicalisation (USA→US, UAE→AE, GB→UK), duplicate live rows superseded keeping newest, media/general rows superseded, legacy NULL-verified rows stamped `verified=false` with reason `V00_legacy_unverified` so nothing pre-gate is ever outreach-eligible.

## 13. 2026-07-11 session II — v22.5 (uniform tags, registers, ops tripwires)

Defect-ledger mapping (S-200): every change carries an E-number tied to the 11 Jul audit-of-the-audits P/S ids.

| ID | What shipped | P/S ids closed |
|---|---|---|
| E-210 | Taxonomy single-source: canonical sector at BOTH emit seams (live path now matches knowledge path via `canonicalSector()`); `sub_sector` + `sub_sector_meta` first-class payload fields; ONE family-alias map exported from `registry/jurisdiction.js` (`FAMILY_ALIAS`/`famCanon`) imported by compliance.js (×2), verify-payload, llm-verify, build.js; Gulf DE-COLLAPSED (Kuwait/Bahrain/Oman/Egypt/Jordan no longer fold to AE) in firm-profile + jurisdiction-router; router routes SA→SAUDI_PDPL, QA→QATAR_PDPPL; connect `_FAM_OF`/selfTest recognise SA/QA. Eval: `eval/vocab-uniformity-e210.test.js` (9 checks). | P-005 residual, P-030, S-047 partial, agent-report risks 2/4 |
| E-211 | exec_summary NEVER empty: LLM path moved to the shared router (Qwen paid fallover, retries, concurrency gate) + deterministic composer fallback (live/zero-breach/knowledge variants, British English, no dash-pauses); verifier V13 (empty exec quarantines) + V20 (engine_version stamped, payload + R2 projection); R2 stubs now carry an inline compact projection (sector, sub_sector, country, binding, families, trust_summary, llm_verify, registers). | P-009, S-174, S-181, S-182, P-014 |
| E-212 | LLM verdict CACHE (`llm_verdicts` Neon table, key = sha1(domain|engine_version|framework_version|sector|binding-set|prompt_v); 14-day TTL; unavailable never cached) + PRIORITY-SECTOR QUORUM: P0/P1-carrying payloads in priority sectors need a second, different-model-family verifier PASS (gemini/qwen leg) before auto-ship; disagreement fail-closed, unavailability fail-open (`quorum:'single'`). Off switch: LLM_VERIFY_QUORUM=0. | P-013 hardening, S-180 |
| E-213 | REGISTERED REALITY payload (`payload.registers`, `src/lib/audit/register-check.js`): Companies House (CH_API_KEY/COMPANIES_HOUSE_KEY, name→number match), CQC (keyless + CQC_API_KEY header), FCA (FCA_API_KEY+FCA_EMAIL) API rows with official source links; ICO/SRA/DHA/RERA honest link-out rows; on_site from positive_compliance; crawl-independent, fail-open per register. | P-094, S-023 partial, S-041 link-out |
| E-214 | connect(): SECTOR_AGNOSTIC_FW carve-out for DIFC_DPL/ADGM_DPR (free-zone DP law binds every zone-established entity; CAP_GATE establishment regex still gates) — fixes the red-team DIFC fixture that B0 dead-dropped. DB repairs: US_STATE_PRIVACY dead law → status='superseded', rules_count=0 (closes GAP-2 + rules-count-sync); UK_CLC backfilled canonical_law_id + required_nexus=["established_in"]. | S-045, red-team red, catalogue-completeness red |
| E-215 | mint-now.yml verified-rate GATE (`scripts/mint-verified-gate.js`): minted>=5 & rate<50% → Telegram + exit 1 (run goes red); logs live LLM keys per run (P-013 observability). | P-103, S-193 partial |
| E-216 | Weekly audit-of-the-audits job (`scripts/audit-of-the-audits.js` in eval-audit.yml Mondays): verified mix, per-day rates, quarantine reasons, sector/country hygiene, duplicate-live check, engine-version + llm_verify + sub_sector coverage, opens telemetry → reports/audit-of-audits/ + Telegram. | S-194, P-105 |
| E-217 | remint-priority.yml + `scripts/queue-priority-remint.js`: founder-authorised remint of live-unverified priority-sector rows (UK first), paced batches, dedupe against queue + verified-live; `--watchlist` queues the 10+8 canary set (S-195) after any version bump. ~1,145 rows in scope at ship time. | P-104/S-195 (canary path), GATE-REMINT |

ENGINE_VERSION: `v22.5-2026-07-uniform-tags`. Renderer-side truth filter for legacy/unverified rows ships in tamazia-website (same session): verified!=true rows render evidence-clean content only (family-nexus filter, absence-without-proof drop, short-evidence drop, fines withheld unless evidence-clean) with value-mode fallback, point-in-time banner, Registered Reality + binding map; beacon now writes open_count/last_opened_at to Neon (P-010).

Founder items still open: rotate GH PAT + Neon password (P-107/S-198, they were pasted in chat); Perplexity key absent (router runs groq→NIM→gemini→qwen fine without it); Sweep module 3 (twelve binary checks) is the next build after this ships; precedent-panel curation pipeline (module 4) still manual-seeded.

## 14. 2026-07-11 session III — v22.6 (the LLM gate + self-learning law discovery + write-seam hotfixes)

| ID | What shipped |
|---|---|
| E-220 | RESILIENT WRITE SEAM (root cause of the canary storm: INSERT committed server-side, psql shim raised client-side, build threw after a real write, worker retried -> 4 duplicate rows/domain + queue 'failed'). Order now: parameterised Neon-HTTP INSERT w/ RETURNING -> shim fallback -> cross-channel confirm loop -> idempotent ADOPTION of a <15min row by the same engine version. No escaping, no argv limits, structured errors. |
| E-221 | FREE-ZONE EXCLUSIVITY: DIFC_DPL/ADGM_DPR DISPLACE UAE_PDPL (never stack; DIFC>ADGM precedence, drops traced) + 'DIFC Courts' advocacy no longer reads as DIFC establishment (fichtelegal V02 x10 class). eval/me-exclusivity-e221 4/4 GREEN. |
| E-222 | THE LLM GATE (src/lib/llm/gate.js): every LLM decision scored 0-10 by DETERMINISTIC rubrics (schema/enum/verbatim-evidence/cross-signal agreement — never self-reported confidence), pass >=7, targeted-deficiency retry, 3 strikes -> drop to deterministic fallback. Wired: firm-profile classification (taxonomy-constrained prompt now also asks sub_sector from OUR tree nodes; rubric 3+2+1+2+2), exec_summary (2 attempts, then composer). Telemetry per mint in payload.llm_gate. eval/llm-gate-e222 8/8 GREEN. |
| E-223 | SELF-LEARNING LAW DISCOVERY: per-CELL (sector×sub×jurisdictions×catalogue_version) gated LLM query for digital-exposure laws, diffed against the catalogue by order-insensitive name matching. Matches = confirmation signal; novelties -> framework_candidates (deduped, seen_count) for the HUMAN-GATED seed pipeline — discovery NEVER touches binding/render. Cell-cached 30d in cell_law_reviews (steady-state ≈ one call/cell/month). Kill switch LAW_DISCOVERY=0. Weekly audit-of-the-audits now reports gate scores + the candidate queue. |

ENGINE_VERSION v22.6-2026-07-llm-gate. Candidate activation path: framework_candidates (status='candidate') -> human review via weekly Telegram digest -> seed as INACTIVE rule -> validate -> activate (guardrail #50 unchanged).

### §14 addendum — E-224 (v22.6.1, same day)
Escalating gate retries (forensic → maximum-rigor + premium chain, null-over-guess), gate deadline budgets, law discovery detached fire-and-forget, MINT_BUILD_TIMEOUT_MS→720s, write-seam v2 (>100KB -f leg, shim adoption, channel telemetry). DB fact: `trg_ap_engine` BEFORE INSERT trigger on audit_pages rejects payloads without llm_verify (or bare r2 stubs) — any test write must include those keys. Worker races build() and retries on wall-clock; keep new build stages budgeted or detached.
