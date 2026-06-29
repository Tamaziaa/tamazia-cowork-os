# REGRESSION INVESTIGATION — compliance richness (2026-06-29)

> Forensic git + before/after reconstruction. Goal: determine exactly why the regulatory section looks gutted and
> whether the optimisation work regressed it. NO engine edits made during the investigation.

## TIMELINE (last stable -> now)
- LAST STABLE baseline = **1666358** (Merge PR #139 "fix/bulletproof-mint", 2026-06-27 ~06:00).
- 54 commits in 2 days, two waves:
  - WAVE 1 (06-27): "accuracy / anti-hallucination" — sector gates (#152/#153), consumer-nexus + free-zone
    establishment gates (#160), finding-integrity gate (#161, build.js), trigger-gate prohibited rules (#168),
    home-jurisdiction resolver (#154/#156), sector-term JS rescue. INTENT: kill false positives/hallucinations.
  - WAVE 2 (06-28..29): detection (own-vs-client sector #177-179, domain-profession #184), jurisdiction (ccTLD #180,
    HQ #186), crawl (Jina #183, residential #182, bounded #185), LLM router (#181/#187/#188), RENDER crash fix
    (website #124/#125). INTENT: sector/jurisdiction accuracy + restore frozen render.

## DECISIVE BEFORE/AFTER (rashidlaw.co.uk, same catalogue, same 85-page corpus)
| | findings | frameworks |
|--|----------|-----------|
| BASELINE 1666358 | **14** | UK_GDPR_A13, UK_CMA, UK_DMCC_2024, UK_PECR, GOOGLE_EEAT, UK_COMPANIES_ACT, UK_DPA_2018 |
| CURRENT main | **5** | UK_CMA, GOOGLE_EEAT, UK_DPA_2018 |
- Isolation: reverting ONLY connect.js -> still 5 (gates alone are NOT the cause). Both crawl the SAME 85 pages.
- current connect() on the REAL corpus ATTACHES UK_PECR, UK_GDPR_A13, UK_DMCC_2024, UK_SRA_TRANSPARENCY (only
  UK_COMPANIES_ACT drops at connect via the incorporation gate). So the attached frameworks emit NO finding ->
  the suppression is in the RULE-EVALUATION layer (compliance.js +198/-30 from the waves), not in attachment.

## ROOT CAUSE (honest, nuanced — not a clean "broke a good engine")
The 14->5 drop is a MIX of correct and incorrect:
1. **Some of the lost 9 were FALSE POSITIVES the optimisation correctly removed.** rashidlaw HAS a robust privacy
   notice + a cookie policy on /privacy-policy-2 (both crawled). Baseline flagged UK_GDPR_A13 / UK_PECR as "absent"
   = FALSE POSITIVE (claiming a present disclosure is missing). Current evaluates them as satisfied -> no finding.
   This is MORE accurate (the independent legal audit agreed: the privacy notice is robust). So part of the
   "richness" the previous engine showed was hallucinated absence.
2. **But the engine STILL MISSES the real, granular sector breaches** — and always did. It does NOT detect: SRA
   price-transparency DEFECTS (VAT/timescales/stages/people present? — it only coarsely checks "are there fees"),
   the missing SRA digital badge, the missing cookie-CONSENT-BANNER (it checks for a cookie POLICY text, not a
   consent mechanism), the SRA regulated-status statement. These are the findings a real lawyer raises (per the 3
   independent audits) and the engine produces none of them — in BOTH baseline and current.
3. **UK_COMPANIES_ACT dropped at connect** because the incorporation gate needs explicit on-page tokens (company
   number / registered office / companies house); rashidlaw shows "Limited" once but not the full set on crawled
   pages. The firm IS incorporated -> this is a FALSE NEGATIVE from a too-strict, corpus-fragile gate. (Fail-open
   on firm_profile entity type would fix it.)
4. **Compounding: the RENDER FREEZE (website TDZ crash, fixed #124/#125)** meant even the findings + penalties that
   DID exist rendered as an old, gutted generation. That is the single biggest reason the live reports LOOK
   destroyed, independent of finding count.

CONCLUSION: the optimisation did NOT simply gut a good engine. It (a) correctly removed some hallucinated absence
findings, (b) over-tightened one gate (Companies Act) into a false negative, and (c) left untouched the engine's
long-standing inability to detect GRANULAR sector breaches. The previous engine LOOKED richer largely because it
emitted more false-positive "absence" findings. Restoring quality = NOT reverting (that restores hallucinations) but
BUILDING the granular sector-breach detection + fixing the over-strict gate + the render (done).

## FIX PLAN (regression-safe, restore + SURPASS — not yet implemented)
F1. Granular sector-breach rules (the real value): SRA (price elements VAT/timescales/stages/people + digital badge
    + regulated-status statement), FCA (Consumer Duty web outcomes, FSMA s.21 promotions, FOS/FSCS), UAE health-ad
    permit + licence-number + claims-substantiation ("Guaranteed"/"Harvard-Approved"), cookie CONSENT-BANNER (not
    policy-text) detection. Replace coarse single-regex checks with element checklists.
F2. Fail-OPEN gates on the firm profile: incorporated entity -> UK_COMPANIES_ACT; consumer-facing sector
    (law/health/hospitality/etc.) -> consumer law, regardless of fragile on-page tokens. Keep strict gate only for
    genuinely ambiguous B2B/institutional firms.
F3. Evidence-ground every finding ("live on your website" quote / nearest-miss); generate prohibit/claims findings.
F4. Penalty-metadata completeness (FCA unlimited/DEPP6 etc.); gate MAR to listed-issuers; gate children's-code to
    child-audience. (per COMPLIANCE_ENGINE_RCA.md)
VALIDATION: re-mint rashidlaw/coutts/towerclinic; each must surface its TRUE regulators (SRA defects / FCA Consumer
Duty / DHA permit) with grounded evidence + real penalties, and must NOT re-introduce false-positive absence.
Benchmarks = the 3 independent legal audits (in COMPLIANCE_ENGINE_RCA.md).
