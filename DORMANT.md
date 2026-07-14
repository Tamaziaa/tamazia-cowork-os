# DORMANT MODULES

Every module under `src/lib/audit/`, `src/lib/compliance/` and `src/lib/evidence/` must be **either**
reachable from `src/skills/S025-audit-page-builder/scripts/build.js` in the static require graph, **or**
listed here with a written reason and an owner. `eval/reachability.test.js` fails CI otherwise.

**Why this file exists.** `statute-rag.js` was famously required for months and never called. It was not the
exception, it was the pattern: a module can be written, reviewed, merged and unit-tested while being
unreachable from the mint. The test proves the *function* works. Nothing proved the *mint calls it*.
A reachability gate makes "built and never called" impossible to ship silently.

**Wired in v25.13** (they were dead, and are dead no longer):
- `citation-gate.js` — wired into `build.js`. Its `gateMint()` used to key violations by FRAMEWORK while the
  filter keyed framework-first, so one uncited UK_PECR rule DELETED EVERY UK_PECR FINDING including fully-cited
  P0s. Identity is now per-FINDING. It runs in **quarantine** mode: it records uncited findings and marks the
  audit unsendable. It does not silently delete a client's breach.
- `coverage-contract.js` — wired into `build.js`, **reporting only**. An audit built on a blocked crawl now says
  so (`payload.coverage.render_class`) and is not sendable. `applyCoverage()` is deliberately NOT wired: it
  filters on `f.status` but pointers carry `state`, so it is a no-op that looks like a filter.
- `verify-audit-url.js` — merged into the mint-worker post-write assertion. A row in `audit_pages` is necessary,
  not sufficient: the prospect clicks a URL, not a row.

---

## Genuinely dormant, with reasons

| Module | Lines | Why it is not wired | Owner | Unblocks when |
|---|---|---|---|---|
| `audit/evidence-ledger.js` | 41 | Produces `{law_ref, binds_because, violated, confidence}` per attached law — exactly what a managing partner will demand. Not wired because **the renderer has no contract for it**: shipping it into the payload without a matching website component adds weight to every row and renders nothing. Needs a website PR first. | Aman | website renderer accepts `payload.evidence_ledger` |
| `audit/enforcement-matcher.js` | 37 | Matches a detected gap to a REAL fined case. It reads `compliance_enforcement`, which is **empty for our frameworks** — so today it would return nothing on every audit and we would ship a "matched precedent" section that is always blank. Wiring it before the fact bank is seeded is wiring an empty box. | Aman | task #64 seeds the enforcement fact bank |
| `audit/enforcement-crossval.js` | 31 | Flags a rule claiming a sector with zero enforcement support (our over-tagging detector). Same blocker: needs a populated `compliance_enforcement`. Belongs in the **nightly self-audit**, not the mint — it is a catalogue-quality check, not a per-firm check. | Aman | #64 + gap-finder scheduled |
| `audit/gap-finder.js` | 103 | The engine's own immune system: re-derives compliance invariants across all 20 sectors. Correctly NOT in the mint path (it audits the catalogue, not the firm). Should run **nightly on a schedule** and alert to Sentry. Not scheduled yet because its first run will produce a large report nobody has triaged. | Aman | a nightly workflow + one triage pass |
| `compliance/applicability.js` | 43 | Deterministic conflict tie-break (*lex specialis* / *lex superior*). Today, when two laws conflict we attach both. Wiring this **changes which law we cite to a client** — that is a legal decision, not a refactor, and it must be reviewed before it ships. | Aman | a reviewed decision on conflict precedence |
| `compliance/engine-bridge.js` | 58 | A structured query interface over the whole engine (attachment + statute + enforcement + catalogue) for the cockpit or an LLM. Required by nothing because **its consumer does not exist yet**. It is a library, not a stage. | Aman | the cockpit adds a compliance-query tab |
| `compliance/registry/nexus.js` | 62 | The SPEC-derived canonical nexus vocabulary (`NEXUS_TYPES`, `EDPB_SIGNALS`, `CATEGORY_REQUIRED_NEXUS`). **This is a second door on the nexus fact** — `signals.js` is the live producer. Merging them is right, but `signals.js` was rewritten in v25.12 to kill the ghost-jurisdiction P0, and I will not gamble a second change on the module that just stopped falsely accusing UK firms of US establishment. | Aman | v25.14: fold `NEXUS_TYPES` into `signals.js` behind the existing eval |
| `compliance/registry/obligations.js` | 104 | The universal obligation-concept × jurisdiction map (one concept, e.g. "cookie consent", resolving to the right law in any country). Genuinely valuable and genuinely unwired: it needs a consumer design, not a require(). | Aman | a design for concept-first attachment |
| `compliance/registry/subjurisdiction.js` | 68 | **134 US state privacy rules that can never attach.** Its own header admits "no live consumer yet". It needs an economic-nexus THRESHOLD decision (CCPA has revenue/consumer cutoffs we cannot observe from a website), not a wiring change. Attaching CCPA to every US-facing site would be a new false-accusation class. | Aman | a threshold/nexus design for US state law |
| `compliance/registry/vocab.js` | 26 | Controlled vocabulary for the tagged-law schema. References `registry/nexus.js` and `framework-intel.js`. Dormant for the same reason as `nexus.js` — it is schema, and the schema has no live validator. | Aman | with `nexus.js` |
