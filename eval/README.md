# eval/ — the compliance-engine safety net (ledger branch 1)
Plain-language: this folder is the seat-belt. Before any change to how the engine attaches law or writes audits,
these checks run and refuse to let a change ship if it makes the legal output worse on a set of known firms.

- `guardrails.js` — the legal-QA harness (ledger 1.1). 9 checks over the golden set: no invented citation-presence
  duty (G1), the fix matches the finding (G2), one establishment regime not three (G3), no voluntary body shown as
  law (G4), the predicate alphabet is producible (G5), the score agrees with the findings (G6), no rare-max headline
  (G7), no duplicate framework (G8), and no finding cites a jurisdiction the firm has no nexus to (G9).
  Run `node eval/guardrails.js` to refresh the baseline; `node eval/guardrails.js --check` to block regressions.
- `predicate-gate.js` — proves every law's `applies_when` flag has a producer in signals.js (ledger 1.3). Today it
  reports 102 orphans (the silent-suppression root, V1 A1); it becomes blocking at ledger 3.3 once producers are added.
- `golden/` — 15 real firms across UK, EU, US and the Middle East, reduced to structural facts only (no firm identity,
  no marketing text). `golden/.raw/` (gitignored) holds the full payloads as the shadow oracle for cut-overs.
- `invariants/scenarios.json` — the 50 INV500 cascade scenarios, each mapped to the harness check or the later phase
  that enforces it (ledger 1.5).
