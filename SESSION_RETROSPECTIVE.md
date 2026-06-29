# SESSION RETROSPECTIVE — end-to-end, honest (2026-06-29)

> What was actually done this session, whether it was done properly, and the GAPS that explain why live audits
> still look poor — especially the destroyed regulatory/compliance section. Written BEFORE the next batch of edits.

## A. WHAT WAS DONE (end-to-end), and was it proper?

| Area | Change (PRs) | Proper? | Verified how |
|------|--------------|---------|--------------|
| Crawl regression | Jina-on-challenge restored (#183), residential rescue (#182), bounded latency (#185) | YES | 0 unreachable across 60; thehandbook walled->media live |
| Sector detection | own-vs-client + domain-profession (#177-180,#184) | YES (engine/payload) | validated vs 400 leads, 0 over-fires; clean batch sectors correct |
| Jurisdiction | ccTLD definitive (#180), HQ reconcile (#186) | YES | bnsluxury/klgates US correct; lawyerdubai->AE |
| LLM reliability | Cloudflare-first router (#181), semaphore+retry (#187), NIM+cache-version+concurrency (#188) | YES | source:llm 52%->98% on clean batch |
| Render crash (keystone) | TDZ fix + entity decode + page-title company-name guard (website #124) | YES | fixtures 14/14 crash->0; 60 live render; names fixed |
| Truth maps | ENGINE_GAP_MAP.md, RENDER_RCA.md, SESSION_RETROSPECTIVE.md | YES | permanent docs |

What was done PROPERLY: each engine change was unit/regression tested and validated on a clean re-mint; the render
crash was forensically root-caused (not guessed) and verified across all fixtures + 60 live audits.

## B. THE BIG GAP I MISSED UNTIL NOW — the engine was enhanced but the RENDER was never updated to consume it

The legal-engine rebuild (earlier sessions) expanded the catalogue to ~281 frameworks with real names, regulators,
penalty_basis, enforcement ranges, statutory citations. The PAYLOAD carries this. BUT:

1. **RENDER name/regulator map is STALE.** `tamazia-website/functions/audit/_adapter.js` resolves framework display
   name + regulator from a HARDCODED map (`FW_REGULATOR` line ~217, `fwName`), which only knows the OLD ~40
   frameworks. Every newer framework renders as a title-cased code + generic regulator: `"UAE Dha | Sector
   regulator"`, `"UK Fca Conduct | Sector regulator"`, `"UK Abi"`. The regulatory section therefore looks broken
   even though the engine knows the correct names/regulators. ORIGIN: render data-mapping (should be DATA-DRIVEN
   from the payload/catalogue, not a parallel hardcoded map). This is the single biggest reason the regulatory
   section looks "destroyed".

2. **Sector-specific regulators DISAPPEAR when the rule does not emit a breach.** rashidlaw (solicitor) has
   UK_SRA_COC + UK_SRA_TRANSPARENCY in applicable_frameworks, but ZERO SRA pointers, so SRA is not rendered at all.
   Two compounding causes: (a) the render's framework list is built only from compliance POINTERS (byFw), so a
   screened-but-not-breached SRA never shows; (b) the SRA check regexes are LOOSE (match a casual "fees"/"fixed"
   mention) -> `hit_after_trigger` -> false "compliant" -> no finding. So a law firm shows DPA/CMA/cookies but not
   the SRA regime it actually lives under. ORIGIN: (a) render (which frameworks to display) + (b) engine (loose
   check regex = false negative).

3. **Render freeze (now fixed, #124).** The adapter TDZ crash froze the DEPLOYED render at a pre-improvement build,
   so penalty-basis / enforcement-range / statutory-citation rendering never reached prod. #124 unblocks this; once
   redeployed, those should appear — but #1 and #2 still need fixing for the regulatory section to be correct.

## C. WHY LIVE AUDITS LOOK POOR (root-cause summary, by subsystem)
- RENDER: stale framework name/regulator map (B1) -> garbled regulator section across most sectors. **(biggest)**
- RENDER: framework list shows only breached/pointered frameworks (B2a) -> screened sector regulators (SRA, GDC,
  DHA) vanish when not breached.
- ENGINE: loose sector check regexes (B2b) -> false "compliant" -> missing sector breaches (SRA price publishing).
- RENDER FREEZE (B3, fixed #124) -> penalties/statutes/enforcement weren't rendering live.
- DATA/sourcing: company name = scraped page title (fixed render-side #124); a few residual title slips + genuine
  firm_profile data cases (wellingtonplace->"The Whitehall Clinic").

## D. THE FIX PLAN (well-researched, smallest set, restore + improve the "good engine")
1. DATA-DRIVEN framework metadata: engine emits `framework_meta` {code:{name,regulator,penalty_note}} in the payload
   from the catalogue (single source of truth); render consumes it, deleting reliance on the stale hardcoded map.
   Kills B1 across ALL sectors. (engine + render; needs re-mint for new payloads.)
2. ALWAYS render the applicable sector regulators (screened), breached or not, with name/regulator/penalty from the
   catalogue -> SRA/GDC/DHA always visible for their sectors (the "good engine" look). Kills B2a.
3. Tighten the loosest sector check regexes (SRA price-publish etc.) so genuine breaches surface (careful, per-rule,
   regression-tested). Reduces B2b false negatives.
4. Re-mint 3 representative audits (law, health, finance), verify the regulatory section is correct + complete.
VALIDATION: qa_live render of the 3 + manual read of the regulatory section vs the firm's true regulators/laws.
