# Phase 2 · 5-Layer Bug Test Report
**Run**: 2026-05-19 · Scope: every Phase 2 artefact end-to-end

## Result summary
| Layer | Scope | Pass | Fail | Bugs caught + fixed in this run |
|---|---|---|---|---|
| L1 | Schema sanity (framework_versions, compliance_rules, leads phase-1 cols + indices) | 5/5 | 0 | none |
| L2 | jurisdiction-router across UK / DE / US / UAE / sector overlay / no-country default | 6/6 | 0 | none |
| L3 | compose-body + S009 disclaimer injection + EU recipient routing | 4/4 | 0 | none |
| L3b | S010 forbidden-phrase checker across clean + em-dash + opener + body + subject blocker | 6/6 | 0 | none |
| L4 | S052 GDPR classifier across 10 representative replies (Articles 15/16/17/18/20/21 + UNCLASSIFIED) | 10/10 | 0 (after fix) | **2 bugs fixed**: Article 20 (machine-readable) was being shadowed by Article 15 (copy of data); Article 18 freeze-processing pattern was too narrow. Reordered CATEGORIES so 20 evaluates before 15 and widened Article 18 patterns. |
| L5 | Disclaimer + audit-trail consistency: disclaimer.txt tokens, Disclaimer.astro, pdf-renderer.ts, compose substitution, framework freshness | 21/21 | 0 | none |
| **Total** | | **52/52** | **0 (after L4 fixes)** | **2 caught + 2 fixed** |

## L4 bug detail

### Bug 1 — Article 20 portability misclassified as Article 15 access
- Input: "Send me a machine-readable copy of my data"
- Before: classified Article 15 (confidence 0.75) because `/copy of (my|the) (personal )?data/i` matched and Article 15 was evaluated before Article 20.
- After: Article 20 evaluated first because the order in `CATEGORIES` now places Article 20 immediately after Article 17 erasure. Article 20 still matches the machine-readable pattern at the same 0.75 confidence, and because it now wins on iteration order, the classification is correct.
- Code change: `src/skills/S052-gdpr-request-handler/scripts/handle.js` — reordered CATEGORIES array. No external API change.

### Bug 2 — Article 18 restriction missing the "freeze processing" pattern
- Input: "Please freeze processing while we dispute this"
- Before: classifier returned UNCLASSIFIED at confidence 0.0 because Article 18 patterns only matched `freeze my data`, `restrict(ion) processing`, `stop processing`. The literal phrase "freeze processing" had no matcher.
- After: pattern widened to `/freeze (my )?(personal )?(data|processing|account)/i` and three additional Article 18 hooks (`pause processing`, `suspend processing`, plus the existing `stop processing`). Test now passes at 0.75 confidence.
- Code change: same handle.js file.

## Other observations

- **L3 / L5 graceful defaults**: with `confirmations/eu-rep-receipt.txt` not yet on disk (Aman procurement pending), S009 inject substitutes the canonical fallback `EU Representative: details published at tamazia.co.uk/privacy`. Compose output for a German recipient renders the placeholder cleanly; once Aman files the real receipt, the placeholder swap is automatic.
- **L1 framework freshness**: all 10 frameworks show `last_reviewed_at = CURRENT_DATE` because the migration seeded them today. The scheduled quarterly review (task 2.9.1) will rotate these forward.
- **L5 disclaimer tokens**: the canonical disclaimer template still carries the `{version}`, `{date}`, `{company_number}`, `{ico_number}`, `{eu_rep_line}` placeholders — this is correct because S009 substitutes at compose time, not at file-edit time. Verified that the substitution produces the populated text in the compose output (`Framework version: 1.0.0`, `Last reviewed: 2026-05-18`, etc.).

## Sign-off
52 of 52 checks pass after the 2 L4 patches landed. No regressions. Phase 2 artefacts are functionally clean and Phase 3 build can start.
