# EDIT-LOG-A — Mission A V2 finish + adversarial audit (branch v4-p3-track, off main bdf141c)

Additive only. Audit engine untouched. Neon SELECT-only by the assistant (additive DDL lands in
canonical-schema + ops/*.sql for the coordinator to run). Each row = one logical change with its A-ID.
The build log for the original P3/A work is `ops/EDIT-LOG-obs.md`; this file logs the V2 finish pass.

## A1 — close the context gaps

| ID | File(s) | Change |
|---|---|---|
| **A1c+** | `CLAUDE.md` (engine) | HARDEN the existing engine CLAUDE.md to the V2 spec: off-limits table map made exact (`scanner_cache` not `scanner_*`; added `crawl-render` = audit engine, never in the agency send path); added the **never "we"/"our"** client-copy rule next to the no-em-dash rule; named where prices live (`tamazia-website/src/content/pricing.ts`, single source, audit mirrors it, never hardcode/fork); pointed the first-load order at `docs/CONTEXT-PACK.md` → `docs/PIPELINE-STATE.md` → control-repo MAP/STATE. Identity-string conflict note kept (do not bake a wrong value). |
| **A1** | `docs/CONTEXT-PACK.md` (new) | Compact (<8 KB) cold-session bootstrap pack: load order (CLAUDE.md → docs/PIPELINE-STATE.md → price source), one-paragraph identity + boundaries, the off-limits list, the additive-Neon rule, the run surface, SEND_ENABLED-off, and the single price source. No competing PRICING.json created — points at pricing.ts. |
| **A1** | (decision) single price source | Did NOT create a PRICING.json. `tamazia-website/src/content/pricing.ts` stays canonical (audit £1,500; tiers £2,500 / £4,500 / £9,500). Documented in CLAUDE.md + CONTEXT-PACK.md instead of forking. |

## A — adversarial bug fixes (safe, committed)

(see the BUG list in the final report; each safe fix gets its own commit + a row here)

| ID | File:line | Severity | Condition | Fix |
|---|---|---|---|---|
| (filled in as fixes land) | | | | |

## Verification
- `jsc` syntax (ReferenceError require = PASS): all six audited JS scripts parse.
- `python3 -m py_compile mcp/tamazia-ops/server.py`: OK.
- Read-only Neon via /sql HTTP for the data-integrity checks.
