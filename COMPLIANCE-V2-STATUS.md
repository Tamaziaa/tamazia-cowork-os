# Compliance Engine v2 + Agency completion — status

Branch `feat/compliance-v2` (off `main @ 9b28d6c`). Every phase built test-first with continuous bug-testing.

## Code-complete + tested (this branch)

| WS | What | Proof |
|----|------|-------|
| **B0** | One merged, de-duplicated canonical law repo (187 laws, identity zero-loss) | `qa-validate-library.js` 29/0 |
| **B1** | Negative-guardrails-first resolver + signals + verified/jurisdiction overlay wired into the engine | `test-resolver.js` 19/0 |
| **B2** | Every-page / every-word detection (blogs flagged, any line located) + blog-tier crawl | `test-corpus-index.js` 18/0 |
| **B3** | Live enforcement + calibrated penalties + per-breach panel (official sources only) | `test-enforcement.js` 20/0 |
| **C** | Gap-finder (7 dims) + 100-point ship-gate (per-mint fail-closed) + self-audit cycle | `qa-compliance.js` 10/0, gap-finder 0 gaps |
| **D** | Agency code verified intact (Apify cost-governor, free-LLM/no-Grok, build.js hardening, worker concurrency) | grep-verified below |
| — | Engine regression (no breakage across all of the above) | `adversarial-test.js` 27/0 |

Run everything at once: `node scripts/self-audit-workflow.js` → **7/7 green**.

### Free-LLM everywhere (no Grok)
`src/lib/audit/llm.js` → free Groq→Gemini, `LLM_FREE_ONLY=1` filters to Groq-only. The only "Grok" strings are the
AI-search-engine citation list (we check if a firm is *cited in* Grok), not our LLM. Enforcement classify uses the
free LLM, temp 0, JSON, never-invent.

### Throughput (2,000–3,000/day) holds
Static-first crawl, strip-once word index, 600KB cap, 30-page bound, per-fetch timeouts; mint concurrency 10, enrich
6. Research math: 4,800–28,800/day headroom. The browser/headless tier stays a rare fallback (r.jina.ai), no local
Chromium needed.

## Operator / founder-gated (cannot be done from here — needs accounts / servers / approval)

1. **Provision + load the law repo to Neon:** `node scripts/migrations/load-canonical-laws.js --apply`
   (creates `compliance_laws` + `compliance_client_types` + `compliance_enforcement`, loads 187 laws + 400 client types).
2. **Seed live enforcement:** `node scripts/enforcement-sync.js --apply` (then schedule it daily/weekly via cron).
   Until then the per-breach panel shows the honest statutory regime + "no recent enforcement found".
3. **Wire the fail-closed per-mint gate into the mint-worker:** before the `audit_pages` INSERT, call
   `require('./scripts/qa-compliance.js').checkMint(payload)`; if `!ok`, hold the row for review instead of inserting.
4. **Part B infra (documented in `COWORK-HANDOFF-PROMPT.md`):** Apify Starter+Creator accounts/tokens; the 6 pm2
   services; SearXNG; Metabase (+ `metabase-queries.sql`); n8n approval digest. Then a **2–3k/day soak** to confirm.
5. **Go-live sending:** recreate the `tz-push` step **only on the founder's explicit approval** (sending on the
   founder's behalf is gated).

## Cadence once live
- **per-mint:** `checkMint()` fail-closed before INSERT.
- **per-cycle:** `node scripts/self-audit-workflow.js` blocks export if red.
- **weekly:** `enforcement-sync --apply` + the self-audit cycle + the adversarial workflow.
