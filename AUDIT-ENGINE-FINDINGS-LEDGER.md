# Audit Engine — Full-Estate Findings Ledger
### Every tool. Every repo. Every finding. One number each.
### Generated 2026-07-14T15:57:59.062Z — do not hand-edit; regenerate with `node tools/sweep/ledger.js`

---

## THE GATE

> **`ACT`** — **two or more independent tools agree.** That is a fact. Fix it.
> **`REVIEW`** — **one tool only.** That is a lead, not a fact. It is triaged, never auto-fixed.

Greptile found **2** issues where CodeRabbit found **51** on the same diff. A lone finding from a weak tool
is noise — and a lone finding from a strong tool is still only a lead. Corroboration is the whole point.

## THE NUMBERS

| | |
|---|---|
| raw findings ingested | **318** |
| after fingerprint dedupe | **281** |
| distinct defects (clustered) | **206** |
| **ACT** (≥2 tools) | **6** |
| REVIEW (1 tool) | 200 |

### By tool

| Tool | Findings |
|---|---|
| coderabbitai | 119 |
| Semgrep OSS | 78 |
| one-door | 36 |
| CodeQL | 27 |
| dependency-cruiser | 14 |
| jscpd | 4 |
| greptile-apps | 3 |

### By severity (clustered)

| Sev | Count |
|---|---|
| P0 | 78 |
| P1 | 101 |
| P2 | 27 |
| P3 | 0 |

---

## ACT — CORROBORATED BY TWO OR MORE TOOLS

| # | Sev | Corrob | Tools | Location | Finding | Fix | Status |
|---|---|---|---|---|---|---|---|
| **F-0001** | P0 | **×3** | CodeQL, coderabbitai, one-door | `src/skills/S025-audit-page-builder/scripts/build.js:1270` | Make mandatory audit gates fail closed. | _TBD_ | OPEN |
| **F-0002** | P0 | **×2** | coderabbitai, one-door | `src/skills/S008-personalisation-engine/scanners/compliance.js:1218` | Keep `_N2C` aligned with `detectMarkets().bound`. | _TBD_ | OPEN |
| **F-0003** | P0 | **×2** | coderabbitai, one-door | `src/lib/audit/payload-schema.js:51` | Anchor the engine-version format. | _TBD_ | OPEN |
| **F-0004** | P0 | **×2** | coderabbitai, one-door | `src/lib/util/url-safe.js:68` | Parse inputs before comparing hosts. | _TBD_ | OPEN |
| **F-0005** | P0 | **×2** | coderabbitai, one-door | `src/lib/compliance/signals.js:155` | Protected compliance library change needs Aman sign-off | _TBD_ | OPEN |
| **F-0079** | P1 | **×2** | CodeQL, greptile-apps | `src/lib/enrich/lead-quality.js:521` | Persisted socials bypass anchor | _TBD_ | OPEN |

### ACT — full detail, every tool's own words

#### F-0001 · P0 · ×3 — `src/skills/S025-audit-page-builder/scripts/build.js:1270`

**Category:** `other` · **Fingerprint:** `05c5781ce254e5a3`

- **coderabbitai** (`coderabbitai:3cdb740f`): Make mandatory audit gates fail closed.
- **coderabbitai** (`coderabbitai:5bae24f3`): Run these gates before persisting the payload to R2.
- **coderabbitai** (`coderabbitai:8f53cc01`): Validate before offloading the payload.
- **coderabbitai** (`coderabbitai:d9a932e7`): /node_modules/
- **coderabbitai** (`coderabbitai:ac93fabc`): Do not upload the open manifest to the early R2 snapshot.
- **coderabbitai** (`coderabbitai:d390e7c7`): Pass `_manifest` and findings into `build()`
- **coderabbitai** (`coderabbitai:24e1f120`): Jurisdiction stage is marked `ran` unconditionally — the check can never fail.
- **coderabbitai** (`coderabbitai:5d836af7`): Make `llmPreflight()` fail closed here.
- **coderabbitai** (`coderabbitai:c1e0f3a7`): Module-scope warning sink should be per invocation, not shared across the process.
- **coderabbitai** (`coderabbitai:5bdfb366`): Stale `_warn` location labels — several no longer match their actual line number.
- **coderabbitai** (`coderabbitai:cbef7c1e`): `_WARN` is a module-level singleton — never reset between builds, so persisted `warnings`/`warning_count` are wrong for every audit after the first.
- **coderabbitai** (`coderabbitai:dbebc4be`): Run preflight once per mint worker.
- **coderabbitai** (`coderabbitai:a89dda33`): `_SM`/`_manifest` are out of scope here — this throws on every build, and the manifest is sealed before `llm_verify` is known anyway.
- **coderabbitai** (`coderabbitai:462fe396`): `firm_identity` stage should read the resolver output, not `comp.firm_profile` (src/skills/S025-audit-page-builder/scripts/build.js:835-837).
- **CodeQL** (`js/file-access-to-http`): File data in outbound network request
- **one-door** (`multiple-producers:regulator`): TWO DOORS: "REGULATOR NAME" has 5 producers (payload-schema.js, verify-payload.js, framework-intel.js, icp.js, build.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 17.5M fine that neve
- **one-door** (`multiple-producers:jurisdiction`): TWO DOORS: "JURISDICTION -> FAMILY map" has 5 producers (firm-profile.js, jurisdiction-router.js, jurisdiction.js, compliance.js, build.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 1
- **one-door** (`multiple-producers:element-checklist`): TWO DOORS: "ELEMENT-CHECKLIST evaluation" has 2 producers (compliance.js, build.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 17.5M fine that never reached the client.

**Fix:** _TBD_ · **Status:** OPEN

#### F-0002 · P0 · ×2 — `src/skills/S008-personalisation-engine/scanners/compliance.js:1218`

**Category:** `other` · **Fingerprint:** `239f795cc8de74da`

- **coderabbitai** (`coderabbitai:78045779`): Triplicated `_extractQuote(c.body, re)` calls and a per-iteration `require()` in the fallback loop.
- **coderabbitai** (`coderabbitai:a45481dd`): Keep `_N2C` aligned with `detectMarkets().bound`.
- **coderabbitai** (`coderabbitai:d9a932e7`): /node_modules/
- **coderabbitai** (`coderabbitai:1c6457a2`): Stale `_ordered` snapshot makes the C‑1 sector-term rescue a no-op for `corpusText`.
- **coderabbitai** (`coderabbitai:c5ef86cb`): Do not modify the protected crawl/render engine without an approved exception.
- **coderabbitai** (`coderabbitai:3f0becd8`): Neon `engine_flags.required_engine_version` must be updated to match this bump, or minting halts fail-closed.
- **coderabbitai** (`coderabbitai:472b15d0`): Record thrown sub-stage failures in the manifest.
- **coderabbitai** (`coderabbitai:5addd4fd`): Keep sub-stage state scoped to one scan.
- **coderabbitai** (`coderabbitai:04df0d1f`): Do not change the prohibited audit and compliance engine paths.
- **coderabbitai** (`coderabbitai:e0d03885`): Expose warning data on every payload path.
- **coderabbitai** (`coderabbitai:ddd5ca24`): Record returned fetch failures, not only thrown exceptions.
- **coderabbitai** (`coderabbitai:f079ab80`): Make `_SWARN` per scan invocation.
- **coderabbitai** (`coderabbitai:976c3615`): Do not modify this compliance library under the repository rule.
- **coderabbitai** (`coderabbitai:07e04634`): Include warning fields on every return path.
- **coderabbitai** (`coderabbitai:49342a4d`): Isolate warning state per scan.
- **one-door** (`multiple-producers:jurisdiction`): TWO DOORS: "JURISDICTION NEXUS (established_in)" has 5 producers (llm-verify.js, register-grounding.js, nexus.js, signals.js, compliance.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 
- **one-door** (`multiple-producers:jurisdiction`): TWO DOORS: "JURISDICTION -> FAMILY map" has 5 producers (firm-profile.js, jurisdiction-router.js, jurisdiction.js, compliance.js, build.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 1
- **one-door** (`multiple-producers:sector`): TWO DOORS: "SECTOR normalisation" has 6 producers (connect.js, jurisdiction-router.js, resolver.js, signals.js, rank-insight.js, compliance.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the G
- **one-door** (`multiple-producers:host`): TWO DOORS: "HOST anchoring" has 8 producers (competitor-overlap.js, firm-profile.js, preflight.js, serp-engine.js, resolve-name.js, rank-insight.js, url-safe.js, compliance.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "S
- **one-door** (`multiple-producers:element-checklist`): TWO DOORS: "ELEMENT-CHECKLIST evaluation" has 2 producers (compliance.js, build.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 17.5M fine that never reached the client.

**Fix:** _TBD_ · **Status:** OPEN

#### F-0003 · P0 · ×2 — `src/lib/audit/payload-schema.js:51`

**Category:** `other` · **Fingerprint:** `25ba423fae05105e`

- **coderabbitai** (`coderabbitai:a7dae25f`): Enforce the draft gate in `src/lib/audit/payload-schema.js:79-89`
- **coderabbitai** (`coderabbitai:9f3dde48`): Anchor the engine-version format.
- **coderabbitai** (`coderabbitai:5a73a70a`): Do not modify protected audit and compliance components.
- **one-door** (`multiple-producers:regulator`): TWO DOORS: "REGULATOR NAME" has 5 producers (payload-schema.js, verify-payload.js, framework-intel.js, icp.js, build.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 17.5M fine that neve

**Fix:** _TBD_ · **Status:** OPEN

#### F-0004 · P0 · ×2 — `src/lib/util/url-safe.js:68`

**Category:** `other` · **Fingerprint:** `30864732a4ff4e3e`

- **coderabbitai** (`coderabbitai:2acc994d`): Keep the `^` anchor on the scheme strip.
- **coderabbitai** (`coderabbitai:c73c308b`): `LogicalOperator` proof is wrong at both call sites.
- **coderabbitai** (`coderabbitai:0e606c1f`): Parse inputs before comparing hosts.
- **one-door** (`multiple-producers:host`): TWO DOORS: "HOST anchoring" has 8 producers (competitor-overlap.js, firm-profile.js, preflight.js, serp-engine.js, resolve-name.js, rank-insight.js, url-safe.js, compliance.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "S

**Fix:** _TBD_ · **Status:** OPEN

#### F-0005 · P0 · ×2 — `src/lib/compliance/signals.js:155`

**Category:** `other` · **Fingerprint:** `3df5c9146b10013e`

- **coderabbitai** (`coderabbitai:92c14257`): Freeze `NEXUS_PROFILE` before exporting it.
- **coderabbitai** (`coderabbitai:8d9fa1ac`): Protected compliance library change needs Aman sign-off
- **one-door** (`multiple-producers:jurisdiction`): TWO DOORS: "JURISDICTION NEXUS (established_in)" has 5 producers (llm-verify.js, register-grounding.js, nexus.js, signals.js, compliance.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the GBP 
- **one-door** (`multiple-producers:sector`): TWO DOORS: "SECTOR normalisation" has 6 producers (connect.js, jurisdiction-router.js, resolver.js, signals.js, rank-insight.js, compliance.js). The stale door is the one the client sees. This class has already shipped a P0 three times: the ghost jurisdiction, the "Sector regulator" label, and the G

**Fix:** _TBD_ · **Status:** OPEN

#### F-0079 · P1 · ×2 — `src/lib/enrich/lead-quality.js:521`

**Category:** `other` · **Fingerprint:** `15879654782452e9`

- **greptile-apps** (`greptile-apps:65c33678`): Persisted socials bypass anchor
- **CodeQL** (`js/unneeded-defensive-code`): Unneeded defensive code

**Fix:** _TBD_ · **Status:** OPEN

---

## REVIEW — SINGLE TOOL. A LEAD, NOT A FACT.

| # | Sev | Tool | Location | Finding |
|---|---|---|---|---|
| F-0006 | P0 | coderabbitai | `src/lib/util/prose.js:41` | Place each `next-line` directive immediately before the code it suppresses. |
| F-0007 | P0 | one-door | `src/lib/compliance/registry/framework-intel.js:0` | TWO DOORS: "REGULATOR NAME" has 5 producers (payload-schema.js, verify-payload.js, framework-intel.js, icp.js, build.js). The stal |
| F-0008 | P0 | coderabbitai | `.github/workflows/mint-now.yml:61` | Re-assert workflow credentials after importing `.env`. |
| F-0009 | P0 | coderabbitai | `eval/legal-provenance.test.js:64` | Assert the post-DUAA cap here. |
| F-0010 | P0 | one-door | `src/lib/compliance/connect.js:0` | TWO DOORS: "SECTOR normalisation" has 6 producers (connect.js, jurisdiction-router.js, resolver.js, signals.js, rank-insight.js, c |
| F-0011 | P0 | coderabbitai | `.github/workflows/code-coherence.yml:46` | Make the coherence counters parser-aware. |
| F-0012 | P0 | coderabbitai | `eval/legal-provenance.test.js:54` | Make repealed-reference detection canonical or exhaustive. |
| F-0013 | P0 | coderabbitai | `scripts/deliverability-guard.js:29` | Make the validated NEON contract match the error message. |
| F-0014 | P0 | one-door | `src/lib/touch0/rank-insight.js:0` | TWO DOORS: "SECTOR normalisation" has 6 producers (connect.js, jurisdiction-router.js, resolver.js, signals.js, rank-insight.js, c |
| F-0015 | P0 | one-door | `src/lib/audit/llm-verify.js:0` | TWO DOORS: "JURISDICTION NEXUS (established_in)" has 5 producers (llm-verify.js, register-grounding.js, nexus.js, signals.js, comp |
| F-0016 | P0 | coderabbitai | `scripts/ahrefs-enrich.js:55` | Make the NEON guards fail open across all operational scripts. |
| F-0017 | P0 | one-door | `src/lib/evidence/cookie-evidence.js:0` | TWO DOORS: "FINE AMOUNT (the figure a client is quoted)" has 3 producers (cookie-policy-diff.js, cookie-evidence.js, ico-register. |
| F-0018 | P0 | one-door | `src/lib/evidence/ico-register.js:0` | TWO DOORS: "FINE AMOUNT (the figure a client is quoted)" has 3 producers (cookie-policy-diff.js, cookie-evidence.js, ico-register. |
| F-0019 | P0 | coderabbitai | `scripts/enforcement-sync.js:30` | Do not block the cycle with a startup throw. |
| F-0020 | P0 | coderabbitai | `src/skills/S008-personalisation-engine/scanners/corpus-index.js:89` | Tighten the negation guard in `src/skills/S008-personalisation-engine/scanners/corpus-index.js:89` |
| F-0021 | P0 | coderabbitai | `src/lib/audit/citation-gate.js:16` | Include the framework in rule identities. |
| F-0022 | P0 | one-door | `src/lib/audit/preflight.js:0` | TWO DOORS: "HOST anchoring" has 8 producers (competitor-overlap.js, firm-profile.js, preflight.js, serp-engine.js, resolve-name.js |
| F-0023 | P0 | coderabbitai | `.github/workflows/code-coherence.yml:35` | Do not report a successful scan after `jscpd` fails. |
| F-0024 | P0 | one-door | `src/lib/compliance/register-grounding.js:0` | TWO DOORS: "JURISDICTION NEXUS (established_in)" has 5 producers (llm-verify.js, register-grounding.js, nexus.js, signals.js, comp |
| F-0025 | P0 | coderabbitai | `.github/workflows/rebuild-env-b64.yml:81` | Add a timeout and propagate `PUT` failures. |
| F-0026 | P0 | coderabbitai | `package.json:19` | Move Zod to `dependencies` |
| F-0027 | P0 | coderabbitai | `eval/boundaries.test.js:47` | Exercise the exact acceptance boundaries. |
| F-0028 | P0 | one-door | `src/lib/compliance/jurisdiction-router.js:0` | TWO DOORS: "JURISDICTION -> FAMILY map" has 5 producers (firm-profile.js, jurisdiction-router.js, jurisdiction.js, compliance.js,  |
| F-0029 | P0 | one-door | `src/lib/sourcing/icp.js:0` | TWO DOORS: "REGULATOR NAME" has 5 producers (payload-schema.js, verify-payload.js, framework-intel.js, icp.js, build.js). The stal |
| F-0030 | P0 | coderabbitai | `src/lib/audit/finding-trust.js:62` | Prioritise browser observations over presence rule types. |
| F-0031 | P0 | one-door | `src/lib/audit/competitor-overlap.js:0` | TWO DOORS: "HOST anchoring" has 8 producers (competitor-overlap.js, firm-profile.js, preflight.js, serp-engine.js, resolve-name.js |
| F-0032 | P0 | coderabbitai | `eval/regex-health.test.js:35` | Neon fetch lacks timeout and error-status handling; the initial data fetch can crash the script instead of failing gracefully. |
| F-0033 | P0 | one-door | `src/lib/audit/firm-profile.js:0` | TWO DOORS: "JURISDICTION -> FAMILY map" has 5 producers (firm-profile.js, jurisdiction-router.js, jurisdiction.js, compliance.js,  |
| F-0034 | P0 | coderabbitai | `src/lib/audit/citation-gate.js:32` | Do not modify protected audit or compliance modules. |
| F-0035 | P0 | coderabbitai | `.github/workflows/shadow-validate.yml:22` | Shadow-validate dead-letters will page the same channel as real production failures. |
| F-0036 | P0 | one-door | `src/lib/scraping/serp-engine.js:0` | TWO DOORS: "HOST anchoring" has 8 producers (competitor-overlap.js, firm-profile.js, preflight.js, serp-engine.js, resolve-name.js |
| F-0037 | P0 | coderabbitai | `eval/gates-executed.test.js:20` | Fail when the required database connection is absent. |
| F-0038 | P0 | coderabbitai | `.github/workflows/engine-cycle.yml:43` | Scope provider secrets to trusted execution steps. |
| F-0039 | P0 | coderabbitai | `eval/rule-polarity.test.js:105` | Treat `regex_elements` as a valid pattern source. |
| F-0040 | P0 | coderabbitai | `.github/workflows/v3-rerun.yml:64` | Extract the repeated engine-version guard into a single shared script. |
| F-0041 | P0 | one-door | `src/lib/sourcing/resolve-name.js:0` | TWO DOORS: "HOST anchoring" has 8 producers (competitor-overlap.js, firm-profile.js, preflight.js, serp-engine.js, resolve-name.js |
| F-0042 | P0 | coderabbitai | `eval/legal-provenance.test.js:46` | Include low fine amounts in the source check. |
| F-0043 | P0 | coderabbitai | `eval/llm-chain-order.test.js:57` | Make these checks fail when wiring or ordering is wrong. |
| F-0044 | P0 | coderabbitai | `eval/rule-polarity.test.js:56` | Keep the detector aligned with the documented prohibited tokens. |
| F-0045 | P0 | coderabbitai | `eval/legal-provenance.test.js:32` | Fail closed on Neon HTTP errors and bound the request. |
| F-0046 | P0 | one-door | `src/lib/compliance/registry/jurisdiction.js:0` | TWO DOORS: "JURISDICTION -> FAMILY map" has 5 producers (firm-profile.js, jurisdiction-router.js, jurisdiction.js, compliance.js,  |
| F-0047 | P0 | coderabbitai | `scripts/scorecard-nightly.js:29` | Standardise the NEON environment-variable contract. |
| F-0048 | P0 | coderabbitai | `website/functions/audit/_adapter.js:1942` | Truncated-code fallback still bypasses the catalogue. |
| F-0049 | P0 | coderabbitai | `.github/workflows/code-coherence.yml:14` | Run this on every push covered by the description. |
| F-0050 | P0 | coderabbitai | `eval/post-write-assertion.test.js:41` | Test the behaviour, not only the source text. |
| F-0051 | P0 | coderabbitai | `eval/coherence-gate.test.js:40` | Make the silent-failure check structural, not formatting-specific. |
| F-0052 | P0 | one-door | `src/lib/audit/verify-payload.js:0` | TWO DOORS: "REGULATOR NAME" has 5 producers (payload-schema.js, verify-payload.js, framework-intel.js, icp.js, build.js). The stal |
| F-0053 | P0 | coderabbitai | `eval/boundaries.test.js:113` | Pin dangerous-scheme normalisation too. |
| F-0054 | P0 | coderabbitai | `.github/workflows/update-env-secret.yml:68` | Flag this secret mutation for Aman before execution. |
| F-0055 | P0 | coderabbitai | `eval/coherence-gate.test.js:34` | Reject dynamic template-literal requires. |
| F-0056 | P0 | Semgrep OSS | `tools/sweep/collect-local.js:23` | Detected calls to child_process from a function argument `cmd`. This could lead to a command injection if the input is user contro |
| F-0057 | P0 | coderabbitai | `src/lib/audit/geo-probe.js:79` | Do not change protected audit and compliance components in this PR. |
| F-0058 | P0 | coderabbitai | `.github/workflows/rebuild-env-b64.yml:82` | Flag this secret mutation for Aman before execution. |
| F-0059 | P0 | coderabbitai | `.github/workflows/code-coherence.yml:27` | /node_modules/ |
| F-0060 | P0 | one-door | `src/lib/compliance/registry/nexus.js:0` | TWO DOORS: "JURISDICTION NEXUS (established_in)" has 5 producers (llm-verify.js, register-grounding.js, nexus.js, signals.js, comp |
| F-0061 | P0 | coderabbitai | `src/lib/audit/site-scan.js:114` | `CORPUS_MAX_CHARS` misconfiguration silently zeroes the corpus and disables the truncation flag. |
| F-0062 | P0 | coderabbitai | `.github/workflows/quality-gates.yml:28` | Use `npm ci` here without a fallback. |
| F-0063 | P0 | coderabbitai | `eval/reachability.test.js:50` | A `require()` edge does not prove the stage executes. |
| F-0064 | P0 | coderabbitai | `.coderabbit.yaml:84` | Move `tools` under `reviews`. |
| F-0065 | P0 | coderabbitai | `src/skills/S008-personalisation-engine/scanners/corpus-index.js:90` | `declin` alternative in `NEGATION_RX` can never match — dead branch. |
| F-0066 | P0 | coderabbitai | `scripts/mint-worker.js:79` | Consider migrating off the legacy Sentry `/store/` endpoint. |
| F-0067 | P0 | one-door | `src/lib/compliance/resolver.js:0` | TWO DOORS: "SECTOR normalisation" has 6 producers (connect.js, jurisdiction-router.js, resolver.js, signals.js, rank-insight.js, c |
| F-0068 | P0 | coderabbitai | `scripts/mint-worker.js:275` | Keep the `http` diagnostics in the dead-letter message |
| F-0069 | P0 | coderabbitai | `eval/reachability.test.js:85` | Parse only the dormant table as a declaration. |
| F-0070 | P0 | coderabbitai | `.github/workflows/eslint-pipeline.yml:18` | Disable checkout credential persistence. |
| F-0071 | P0 | coderabbitai | `.github/workflows/mint-cycle.yml:31` | Prevent `ENV_B64` from overwriting the provider secrets. |
| F-0072 | P0 | coderabbitai | `.github/workflows/quality-gates.yml:14` | Run the gate for dependency and workflow-only PRs. |
| F-0073 | P0 | coderabbitai | `.github/workflows/eslint-pipeline.yml:10` | Include this workflow file in its own PR filter |
| F-0074 | P0 | one-door | `src/lib/audit/cookie-policy-diff.js:0` | TWO DOORS: "FINE AMOUNT (the figure a client is quoted)" has 3 producers (cookie-policy-diff.js, cookie-evidence.js, ico-register. |
| F-0075 | P0 | coderabbitai | `eval/coherence-gate.test.js:46` | Exercise warning propagation instead of checking token presence. |
| F-0076 | P0 | coderabbitai | `.github/workflows/code-coherence.yml:21` | Disable checkout credential persistence. |
| F-0077 | P0 | coderabbitai | `.github/workflows/backlog-burst.yml:46` | Keep `CRAWL_RENDER_URL` authoritative after `.env` import |
| F-0078 | P0 | coderabbitai | `scripts/mint-worker.js:286` | Await `verifyAuditUrl()` before checking `_res.ok` |
| F-0080 | P1 | coderabbitai | `src/lib/llm/router.js:381` | Do not log optional-provider absence as an error. |
| F-0081 | P1 | Semgrep OSS | `scripts/refresh-enforcement-news.js:64` | RegExp() called with a `tag` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDo |
| F-0082 | P1 | Semgrep OSS | `src/lib/scraping/residential-fetch.js:18` | Checks for any usage of http servers instead of https servers. Encourages the usage of https protocol instead of http, which does  |
| F-0083 | P1 | Semgrep OSS | `scripts/materialise-client-emails.js:35` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0084 | P1 | dependency-cruiser | `node_modules/@aws-crypto/crc32c/build/main/aws_crc32c.js:0` | circular dependency via node_modules/@aws-crypto/crc32c/build/main/index.js |
| F-0085 | P1 | Semgrep OSS | `eval/build-golden.js:44` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0086 | P1 | Semgrep OSS | `eval/one-door.test.js:23` | Semgrep Finding: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal |
| F-0087 | P1 | Semgrep OSS | `eval/feeds.test.js:15` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0088 | P1 | Semgrep OSS | `eval/reachability.test.js:62` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0089 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:753` | RegExp() called with a `rule` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0090 | P1 | CodeQL | `src/lib/audit/llm.js:52` | File data in outbound network request |
| F-0091 | P1 | CodeQL | `website/functions/audit/_adapter.js:1922` | Superfluous trailing arguments |
| F-0092 | P1 | Semgrep OSS | `src/lib/sourcing/markets.js:68` | RegExp() called with a `rx` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDoS |
| F-0093 | P1 | coderabbitai | `eval/legal-provenance.test.js:21` | Prefer `process.exitCode` in both places. |
| F-0094 | P1 | Semgrep OSS | `src/lib/llm-rescue.js:202` | Depending on the context, user control data in `Object.assign` can cause web response to include data that it should not have or c |
| F-0095 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/lib/extract.js:20` | RegExp() called with a `name` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0096 | P1 | Semgrep OSS | `src/lib/compliance/connect.js:315` | RegExp() called with a `{ catalogue, jurisdictions, sector, signals, text, mode }` function argument, this might allow an attacker |
| F-0097 | P1 | jscpd | `intel/feeds/eurlex-cellar.js:16` | 21-line clone shared with legislation-gov-uk.js |
| F-0098 | P1 | Semgrep OSS | `scripts/materialise-client-emails.js:42` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0099 | P1 | CodeQL | `scripts/remint-audits.js:12` | Network data written to file |
| F-0100 | P1 | Semgrep OSS | `src/lib/compliance/signals.js:92` | RegExp() called with a `term` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0101 | P1 | Semgrep OSS | `mcp/tamazia-ops/server.py:104` | Detected a dynamic value being used with urllib. urllib supports 'file://' schemes, so a dynamic value controlled by a malicious a |
| F-0102 | P1 | Semgrep OSS | `eval/coherence-gate.test.js:42` | Semgrep Finding: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal |
| F-0103 | P1 | Semgrep OSS | `eval/guardrails.js:9` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0104 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:685` | Semgrep Finding: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp |
| F-0105 | P1 | coderabbitai | `website/tests/framework-meta-ssot.test.mjs:36` | Add coverage for the raw `binding` field, not just `binding_label`. |
| F-0106 | P1 | Semgrep OSS | `src/templates/email/footer.html:31` | Detected a template variable used in an anchor tag with the 'href' attribute. This allows a malicious actor to input the 'javascri |
| F-0107 | P1 | Semgrep OSS | `scripts/verify-attribution.js:30` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0108 | P1 | Semgrep OSS | `.github/dependabot.yml:3` | This Dependabot configuration does not set a cooldown period. Newly published packages can be malicious or unstable. Add a `cooldo |
| F-0109 | P1 | Semgrep OSS | `src/lib/touch0/rank-insight.js:368` | RegExp() called with a `p` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDoS) |
| F-0110 | P1 | Semgrep OSS | `eval/reachability.test.js:85` | Semgrep Finding: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal |
| F-0111 | P1 | jscpd | `llm-factcheck.js:1` | 23-line clone shared with llm-rescue.js |
| F-0112 | P1 | Semgrep OSS | `src/lib/sourcing/markets.js:68` | Semgrep Finding: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp |
| F-0113 | P1 | Semgrep OSS | `src/lib/llm-rescue.js:281` | RegExp() called with a `needle` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (R |
| F-0114 | P1 | Semgrep OSS | `renovate.json:22` | Semgrep Finding: package_managers.renovate.renovate-missing-minimum-release-age.renovate-missing-minimum-release-age |
| F-0115 | P1 | Semgrep OSS | `eval/no-hardcoded-fines.test.js:32` | Semgrep Finding: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal |
| F-0116 | P1 | Semgrep OSS | `eval/build-golden.js:15` | RegExp() called with a `dom` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDo |
| F-0117 | P1 | coderabbitai | `.coderabbit.yaml:5` | /node_modules/ |
| F-0118 | P1 | CodeQL | `scripts/backtest-personalisation.js:36` | Missing regular expression anchor |
| F-0119 | P1 | CodeQL | `src/lib/audit/geo-probe.js:45` | Network data written to file |
| F-0120 | P1 | Semgrep OSS | `scripts/patch-w8-s012.py:125` | Detected a dynamic value being used with urllib. urllib supports 'file://' schemes, so a dynamic value controlled by a malicious a |
| F-0121 | P1 | coderabbitai | `website/tests/catalogue-truth-e07-e09.test.mjs:62` | Widen E07 coverage to lock all 12 new exact titles, not just 3. |
| F-0122 | P1 | Semgrep OSS | `src/skills/S064-touch-cadence/scripts/render.js:282` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0123 | P1 | Semgrep OSS | `scripts/reconcile.js:21` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0124 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:763` | RegExp() called with a `rule` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0125 | P1 | coderabbitai | `eval/llm-chain-order.test.js:50` | Validate actual secret mappings across all modified workflows. |
| F-0126 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:788` | Semgrep Finding: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp |
| F-0127 | P1 | Semgrep OSS | `tools/sweep/collect-local.js:59` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0128 | P1 | Semgrep OSS | `src/skills/S009-compliance-disclaimer-injector/scripts/inject.js:35` | RegExp() called with a `field` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (Re |
| F-0129 | P1 | greptile-apps | `website/functions/audit/_adapter.js:88` | Guard passed names too |
| F-0130 | P1 | Semgrep OSS | `src/lib/touch0/rank-insight.js:232` | RegExp() called with a `city` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0131 | P1 | jscpd | `S006-linkedin-drafter-v2/scripts/draft.js:6` | 26-line clone shared with run.js |
| F-0132 | P1 | Semgrep OSS | `ops/infra/hetzner-verify.js:78` | Detected string concatenation with a non-literal variable in a node-postgres JS SQL statement. This could lead to SQL injection if |
| F-0133 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/lib/extract.js:71` | RegExp() called with a `patternList` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Servi |
| F-0134 | P1 | Semgrep OSS | `mcp/tamazia-ops/server.py:490` | Detected a dynamic value being used with urllib. urllib supports 'file://' schemes, so a dynamic value controlled by a malicious a |
| F-0135 | P1 | Semgrep OSS | `cloudflare/admin-worker.js:32` | RegExp() called with a `name` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0136 | P1 | CodeQL | `_drv_mint.js:7` | Network data written to file |
| F-0137 | P1 | coderabbitai | `.github/workflows/mint-cycle.yml:58` | Identical 10-line unset/echo block duplicated 7 times across 4 files (and likely more across the remaining 8 workflows in this coh |
| F-0138 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:608` | RegExp() called with a `re` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDoS |
| F-0139 | P1 | coderabbitai | `.github/workflows/quality-gates.yml:38` | Flag this workflow rollout to Aman before enablement. |
| F-0140 | P1 | dependency-cruiser | `node_modules/@aws-crypto/crc32c/build/main/index.js:0` | circular dependency via node_modules/@aws-crypto/crc32c/build/main/aws_crc32c.js |
| F-0141 | P1 | dependency-cruiser | `node_modules/zod/v4/classic/iso.cjs:0` | circular dependency via node_modules/zod/v4/classic/schemas.cjs |
| F-0142 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:780` | RegExp() called with a `rule` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0143 | P1 | Semgrep OSS | `ops/infra/hetzner-verify.js:89` | RegExp() called with a `i` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDoS) |
| F-0144 | P1 | Semgrep OSS | `src/lib/touch0/rank-insight.js:539` | RegExp() called with a `{ query, company }` function argument, this might allow an attacker to cause a Regular Expression Denial-o |
| F-0145 | P1 | Semgrep OSS | `src/skills/S057-pre-call-brief/scripts/build.js:109` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0146 | P1 | jscpd | `S008-personalisation-engine/lib/http.js:2` | 21-line clone shared with run.js |
| F-0147 | P1 | Semgrep OSS | `mcp/tamazia-ops/server.py:1344` | Detected a dynamic value being used with urllib. urllib supports 'file://' schemes, so a dynamic value controlled by a malicious a |
| F-0148 | P1 | Semgrep OSS | `ops/infra/setup.sh:21` | Data is being piped into `bash` from a `curl` command. An attacker with control of the server in the `curl` command could inject m |
| F-0149 | P1 | Semgrep OSS | `scripts/patch-w8-s012.py:152` | Detected a dynamic value being used with urllib. urllib supports 'file://' schemes, so a dynamic value controlled by a malicious a |
| F-0150 | P1 | Semgrep OSS | `src/lib/sourcing/linkedin-finder.js:44` | RegExp() called with a `needle` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (R |
| F-0151 | P1 | coderabbitai | `stryker.config.json:21` | Update the stale `_comment` narrative to match the new thresholds. |
| F-0152 | P1 | coderabbitai | `eval/prohibition-calibration.test.js:27` | Use the Neon serverless driver instead of hand-rolling `/sql` requests. |
| F-0153 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/corpus-index.js:102` | RegExp() called with a `re` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDoS |
| F-0154 | P1 | Semgrep OSS | `tools/sweep/collect-local.js:44` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0155 | P1 | coderabbitai | `eval/llm-chain-order.test.js:42` | Assert the exact runtime provider order. |
| F-0156 | P1 | Semgrep OSS | `scripts/eval-llm-rescue.js:42` | Depending on the context, user control data in `Object.assign` can cause web response to include data that it should not have or c |
| F-0157 | P1 | Semgrep OSS | `src/lib/intel/feeds/eurlex-cellar.js:31` | RegExp() called with a `name` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0158 | P1 | dependency-cruiser | `node_modules/@aws-crypto/crc32/build/main/index.js:0` | circular dependency via node_modules/@aws-crypto/crc32/build/main/aws_crc32.js |
| F-0159 | P1 | coderabbitai | `src/skills/S025-audit-page-builder/scripts/build.js:1024` | Glossary catch silently swallows — no `_warn()` call, contradicting the AI summary and sibling stages. |
| F-0160 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:685` | RegExp() called with a `scope` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (Re |
| F-0161 | P1 | coderabbitai | `eval/rule-polarity.test.js:36` | Add a timeout to the Neon request. |
| F-0162 | P1 | Semgrep OSS | `scripts/verify-attribution.js:57` | RegExp() called with a `f` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDoS) |
| F-0163 | P1 | Semgrep OSS | `src/skills/S064-touch-cadence/scripts/render.js:66` | Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vul |
| F-0164 | P1 | greptile-apps | `.github/workflows/env-rebuild-v5.yml:28` | Require rotated secret |
| F-0165 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:608` | Semgrep Finding: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp |
| F-0166 | P1 | CodeQL | `src/lib/audit/firm-identity.js:274` | Useless assignment to local variable |
| F-0167 | P1 | Semgrep OSS | `src/lib/audit/site-scan.js:57` | RegExp() called with a `bot` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDo |
| F-0168 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/content-depth.js:75` | Cannot determine what 'currentYear' is and it is used with a '<script>' tag. This could be susceptible to cross-site scripting (XS |
| F-0169 | P1 | coderabbitai | `eval/corpus-truncation.test.js:117` | Weak regression guard: `/pages_fetched:/` matches anywhere in the file, not specifically the `classifyAll` call. |
| F-0170 | P1 | coderabbitai | `eval/pipeline-contract.test.js:57` | Good unit coverage, but no integration test exercises the `build.js` wiring. |
| F-0171 | P1 | coderabbitai | `src/skills/S025-audit-page-builder/scripts/build.js:964` | Glossary lookup still swallows its error silently — no `_warn`. |
| F-0172 | P1 | coderabbitai | `src/lib/audit/finding-trust.js:43` | `MIN_PAGES_FOR_ABSENCE` can be forced to `0` via env misconfiguration, contradicting the "never zero" intent. |
| F-0173 | P1 | dependency-cruiser | `node_modules/zod/v4/classic/schemas.cjs:0` | circular dependency via node_modules/zod/v4/classic/iso.cjs |
| F-0174 | P1 | Semgrep OSS | `src/lib/scraping/free-serp.js:62` | Checks for any usage of http servers instead of https servers. Encourages the usage of https protocol instead of http, which does  |
| F-0175 | P1 | CodeQL | `eval/mint-smoke.test.js:49` | Useless conditional |
| F-0176 | P1 | dependency-cruiser | `node_modules/@aws-crypto/crc32/build/main/aws_crc32.js:0` | circular dependency via node_modules/@aws-crypto/crc32/build/main/index.js |
| F-0177 | P1 | Semgrep OSS | `src/lib/intel/feeds/legislation-gov-uk.js:30` | RegExp() called with a `name` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0178 | P1 | Semgrep OSS | `src/skills/S008-personalisation-engine/scanners/compliance.js:788` | RegExp() called with a `rule` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReD |
| F-0179 | P1 | Semgrep OSS | `src/lib/util/html-text.js:38` | RegExp() called with a `tag` function argument, this might allow an attacker to cause a Regular Expression Denial-of-Service (ReDo |
| F-0180 | P2 | coderabbitai | `.github/workflows/backlog-burst.yml:67` | Same 10-line guard block duplicated four times in this file. |
| F-0181 | P2 | CodeQL | `src/lib/audit/source-gap.js:16` | Semicolon insertion |
| F-0182 | P2 | dependency-cruiser | `src/skills/S052-gdpr-request-handler/scripts/handle.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0183 | P2 | dependency-cruiser | `src/lib/sourcing/safe-insert.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0184 | P2 | CodeQL | `website/dist/audit/audit-app.js:833` | Unused variable, import, function or class |
| F-0185 | P2 | CodeQL | `website/dist/audit/audit-app.js:134` | Unused variable, import, function or class |
| F-0186 | P2 | dependency-cruiser | `src/lib/sourcing/conversion.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0187 | P2 | CodeQL | `website/dist/audit/audit-app.js:590` | Unused variable, import, function or class |
| F-0188 | P2 | CodeQL | `website/dist/audit/audit-app.js:298` | Unused variable, import, function or class |
| F-0189 | P2 | CodeQL | `website/public/audit/audit-app.js:590` | Unused variable, import, function or class |
| F-0190 | P2 | CodeQL | `eval/host-anchoring.test.js:19` | Unused variable, import, function or class |
| F-0191 | P2 | coderabbitai | `.github/workflows/layer3-complete.yml:85` | Same duplicated guard block as backlog-burst.yml / nightly-workers.yml. |
| F-0192 | P2 | CodeQL | `website/dist/audit/audit-app.js:198` | Unused variable, import, function or class |
| F-0193 | P2 | CodeQL | `website/dist/audit/audit-app.js:228` | Unused variable, import, function or class |
| F-0194 | P2 | CodeQL | `eval/properties.test.js:18` | Unused variable, import, function or class |
| F-0195 | P2 | coderabbitai | `eval/waf-rescue.test.js:48` | Exercise all five workflow bindings. |
| F-0196 | P2 | dependency-cruiser | `src/lib/compliance/applicability.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0197 | P2 | CodeQL | `website/public/audit/audit-app.js:833` | Unused variable, import, function or class |
| F-0198 | P2 | coderabbitai | `.github/workflows/nightly-workers.yml:48` | Same duplicated guard block, repeated four times in this file. |
| F-0199 | P2 | Semgrep OSS | `scripts/backtest-phase2.mjs:94` | Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format |
| F-0200 | P2 | coderabbitai | `scripts/mint-worker.js:27` | Flag the worker and Neon rollout to Aman. |
| F-0201 | P2 | CodeQL | `website/functions/audit/_adapter.js:2504` | Unused variable, import, function or class |
| F-0202 | P2 | dependency-cruiser | `src/lib/mystrika/client.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0203 | P2 | dependency-cruiser | `src/lib/calendar/timezone-router.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0204 | P2 | coderabbitai | `eval/gates-executed.test.js:29` | Provision the CI Neon secret before merging. |
| F-0205 | P2 | dependency-cruiser | `src/lib/compliance/registry/obligations.js:0` | orphan module: nothing depends on it and it depends on nothing |
| F-0206 | P2 | dependency-cruiser | `src/lib/compliance/registry/subjurisdiction.js:0` | orphan module: nothing depends on it and it depends on nothing |
