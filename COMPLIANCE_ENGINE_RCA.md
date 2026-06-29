# COMPLIANCE-ENGINE RCA — why the regulatory section is broken (2026-06-29)

> Built from THREE independent legal audits (senior solicitor / FS lawyer / UAE health lawyer) of the live sites,
> compared against the engine's actual output. Render freeze (#124) + framework-names (#125) already fixed; this
> document is about the DETECTION layer, which is the deeper problem. NO engine edits made yet — diagnosis first.

## THE PATTERN (all 3 sites): generic "absence" checklist, not an evidence-grounded legal audit
| Site | Engine produced | Independent legal audit says SHOULD be there | Verdict |
|------|-----------------|----------------------------------------------|---------|
| rashidlaw (law) | 4 findings: CMA + DPA x3 (absence, quotes empty); **NO SRA** | SRA Transparency price-defects (VAT/timescales/stages/people), SRA digital badge absent, regulated-status statement defective, PECR cookie banner absent | Misses the ENTIRE SRA regime; DPA over-stated (policy is robust); CMA likely false-positive |
| coutts (finance) | 3: DPA(absence, but policy EXISTS), FCA_CONDUCT(**penalty NONE**), **FCA_MAR(false positive)** | FSMA s.21/COBS 4 financial promotions, Consumer Duty (PRIN 2A) web outcomes, FSCS limit, FOS signposting, PECR reject-all parity | Surfaces an issuer rule (MAR) that doesn't apply to a retail site; misses every consumer-facing FCA framework; FCA penalty shown as NONE when FCA fines are UNLIMITED |
| towerclinic (dental, UAE) | **0 findings** | Health-advertising permit number absent, licence numbers absent, "Guaranteed"/"Harvard-Approved" prohibited claims, NO privacy policy (404), testimonial marketing | UAE ruleset attached but INERT — produced nothing on a clearly non-compliant site |

## ROOT-CAUSE CLUSTERS (detection layer), ranked by blast radius
1. **GENERIC-ABSENCE DOMINANCE / SECTOR-SPECIFIC MISS.** The findings that fire are universal must_appear rules
   (DPA, CMA, cookies); the sector rules that define a firm's real exposure (SRA, FCA Consumer-Duty/promotions, UAE
   health-ad permit, GDC) either don't fire or aren't written granularly. So every audit looks the same and generic.
   ORIGIN: rule library is universal-heavy + sector-rule check logic is coarse. **Biggest cause of "destroyed".**
2. **LOOSE CHECK REGEXES -> false negatives AND false positives.** SRA price rule "passes" rashidlaw because the
   word "fees" appears somewhere (it never checks the 4 required price elements). DPA "absence" fires on coutts even
   though the privacy policy exists. ORIGIN: ruleCheck trigger_then_check uses a single loose disclosure regex, not
   element-level checks; must_appear fires on absence-of-token without confirming the page that should carry it was
   read. (rashidlaw: 6 pages crawled incl privacy+complaints, but /our-fees was NOT crawled.)
3. **EVIDENCE QUOTES EMPTY -> "live on your website" section broken.** Nearly all findings are kind:absence with
   empty evidence_quote; the nearest-miss/absence_evidence isn't surfacing. The "exact lines live on your website"
   the previous reports showed are gone because absence findings carry no quote and prohibit/presence findings (bad
   claims ON the page, e.g. towerclinic "Guaranteed") aren't being generated. ORIGIN: evidence extraction + lack of
   prohibit/claims rules. One quote was a misattributed customer REVIEW ("thanks to noor butt") = wrong extraction.
4. **PENALTY METADATA GAPS -> "no fine / ranking impact" instead of real fines.** UK_FCA_CONDUCT penalty = NONE
   though FCA fines are unlimited (DEPP 6). Non-populated penalty_basis/fine fields render as "ranking impact" /
   "controls to confirm". ORIGIN: catalogue rows seeded without enforcement metadata for some frameworks.
5. **FRAMEWORK MIS-SCOPING (false positives).** UK_FCA_MAR applied to a retail-banking website (MAR is a listed-
   ISSUER market-abuse regime, not a website-disclosure rule). ORIGIN: framework attached by sector(finance) without
   an issuer/entity-type gate.
6. **CHILDREN'S-CODE / AGE-APPROPRIATE over-attachment.** A UK_DPA_2018 children's/age-appropriate element fires
   across 64 domains regardless of child-facing activity. ORIGIN: must_appear rule not gated on a child-audience
   trigger.
7. **UAE / NON-UK RULESETS INERT.** towerclinic: 9 UAE frameworks attached, 0 findings. The UAE rules are positive-
   match-only (no required-element-absent checks) and there is no health-advertising-permit detector; English/UK
   anchoring. ORIGIN: jurisdiction rule coverage is UK-centric; non-UK frameworks are decorative.
8. **KEY SUB-PAGE COVERAGE.** /our-fees (the SRA-relevant page) was not crawled for rashidlaw; sector-critical pages
   (fees, pricing, treatments) should be prioritised in gatherCorpus. ORIGIN: link-discovery priority.

## IS THIS A REGRESSION FROM THIS SESSION? (honest)
Mostly NO — these are pre-existing DETECTION-layer limitations (coarse rules, empty evidence, penalty gaps, MAR
false-positive [flagged in prior memory], UAE inert). What THIS session fixed was the RENDER FREEZE (#124) that made
even the good catalogue data invisible, plus framework names (#125), sector/jurisdiction/crawl/LLM. The compliance
DETECTION quality is the next, larger architectural work — it was masked before because the render froze.

## FIX PLAN (large, regression-safe batch — NOT yet implemented; for approval)
Smallest set, biggest class-elimination:
- F1 EVIDENCE-GROUND every finding: render the nearest-miss/quote ("live on your website") for absence; generate
  prohibit/claims findings (e.g. "Guaranteed"/"Harvard-Approved") so real on-page breaches are quoted. (engine+render)
- F2 ELEMENT-LEVEL sector checks for the top sectors: SRA price (VAT/timescales/stages/people + badge + status),
  FCA (Consumer Duty web outcomes, FSMA s.21 promotions, FOS/FSCS), UAE health-ad permit/licence-number detector.
  Replace single loose disclosure regex with element checklists. (engine catalogue + ruleCheck)
- F3 PENALTY metadata completeness pass (every active fining framework has real penalty_basis + enforce_*); FCA =
  unlimited/DEPP6. (catalogue)
- F4 GATE false positives: MAR -> issuer/listed only; children's-code -> child-audience trigger; consumer law -> B2C.
- F5 ACTIVATE non-UK rules (UAE/Gulf) with required-element-absent checks, not positive-match-only.
- F6 Prioritise sector-critical pages (fees/pricing/treatments/privacy/complaints) in the crawl.
VALIDATION: re-mint the 3 + independent re-audit vs these benchmarks; each must surface the real regulators
(SRA / FCA-Consumer-Duty / DHA-permit) with grounded evidence + real penalties.

## BENCHMARKS (from the independent audits — the target the engine must hit)
- rashidlaw: SRA Transparency (price defects + badge + status), PECR cookies; DPA only ICO-number/date; NOT AML.
- coutts: FSMA s.21/COBS4 promotions, Consumer Duty, FOS, FSCS; DPA correct (policy exists); DROP MAR.
- towerclinic: DHCC/DHA/MOHAP advertising-permit + licence numbers, claims substantiation ("Guaranteed"/"Harvard"),
  UAE PDPL (no privacy policy / 404), ICT Health Law localisation.
