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

## 6. UNRESOLVED — the v19 Jina-rescue anomaly (highest priority open item)

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
