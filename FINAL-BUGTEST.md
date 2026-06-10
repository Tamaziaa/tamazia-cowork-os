# Final wide bug-test — compliance-v2 (B0–D)

29-agent adversarial workflow: 8 dimension finders (each PROVING bugs with a runnable repro) → per-bug adversarial
verification (default-refuted). **6 confirmed (3 high, 2 medium, 1 low), 3 refuted.** All 6 fixed + regression-tested.

| # | Sev | Dimension | Bug | Fix | Test |
|---|-----|-----------|-----|-----|------|
| 1 | high | resolver | DIFC/ADGM onshore carve-out line was dead code (`!jurSet.has('MENA-AE')` can never be true). The verifier's "activate it" fix would have **regressed Al Tamimi** (dropped federal UAE_PDPL from a DIFC+onshore firm). | Removed the misleading dead branch; documented that the federal baseline is intentionally kept (can't prove DIFC-*exclusive* registration from a website). Zone-specific gating (lines 15-16) already correct. | resolver 19/0 |
| 2 | low | corpus-index | The 600KB cap's `&& !capped` terminator stopped the WHOLE outer loop → later pages silently dropped from the every-word index (reverts to first-hit evidence). | Per-page budget (80KB) + raised absolute ceiling (2MB); outer loop stops only at the absolute ceiling → every page contributes. | corpus-index 21/0 (G1-G3) |
| 3 | high | enforcement | `_amount` parsed "10% of global turnover"→10, "£1,000 per violation"→1000 as money → poisoned the calibrated median fine shown to clients. | `_amount` rejects %/per-unit/turnover strings and requires a currency token; only real money totals enter the median. | enforcement 26/0 (D1-D4,D6) |
| 4 | medium | enforcement | `_fmt` over-rounded ≥£10M (17.5M → "18M"). | `.toFixed(1)` across the whole M range. | enforcement (D5) |
| 5 | medium | qa-compliance | Per-mint gate failed OPEN: a finding whose framework wasn't a `neon_framework_short` skipped M1/M2 silently. | Index by canonical `id` too; **fail-closed** new M5 (a compliance finding with no law row is a violation, except whitelisted non-law composites). | qa-compliance 5/0 |
| 6 | high | gap-finder | `over_suppression` was a dead detector (universal laws mask the sector pool → can never fire). | Rewrote D2 as a true total-suppression guard; moved the held-pool observation to INFO; **fault-injection test proves every dimension fires**. | gap-finder 7/0 |

Refuted (mechanically reproduce but no live impact; defensive guards added anyway): `serves_eu` orphan trigger
(live path uses connect+overlay, not applies_when); sticky-`y` regex flag (live rules compile `/i`, never `/y` —
added a flag-sanitiser regardless); M4 P-form-only severity (findings are always P-form — sevN unchanged).

**Re-green after fixes:** self-audit cycle **8/8** — gap-finder 0 gaps, ship-gate 10/0, per-mint 5/0, qa-library
29/0, resolver 19/0, corpus-index 21/0, enforcement 26/0, gap-finder-injection 7/0, engine adversarial 27/0.
