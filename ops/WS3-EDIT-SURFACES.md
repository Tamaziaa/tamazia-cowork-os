# WS3 — Engine edit surfaces for the gap → fix → re-mint loop

When the Layer-3 Claude safeguard catches an audit gap, this doc tells the runtime Claude session **exactly where to make the fix** (file + function + line) for each gap type, then how to lock it so it never reappears. Line numbers are as of commit `be18d3b` (WS1 v5-gate); re-grep if they drift.

The loop:
1. **Detect** — safeguard compares the minted audit against the real, correct answer.
2. **Record** — `src/lib/gap-ledger.js` `recordGap()` writes an `engine_gap_fixes` row + appends a bullet to `ops/CLAUDE-GAP-LEDGER.md`.
3. **Fix** — edit **one** of the four surfaces below (this is the only place the actual law/logic changes).
4. **Lock** — add a fixture entry to `eval/audit-gaps.json` and advance the row with `updateGap(... , { status, fix_pr_url, fixture_path })`. The `eval-audit-gaps` CI gate now blocks any future change that re-opens the gap.

There are exactly **four** surfaces. Pick by gap type.

---

## Surface 1 — missing / wrong LAW → seed `compliance_rules` (a new migration)

**Symptom:** the audit should have flagged a rule that the engine has **no row for** (or the row is wrong: wrong severity, wrong citation, wrong regex, wrong sector). The framework already routes (it shows up in `routeForMarkets`) but the *rule* under it is absent or wrong.

**Where:** add a new dated migration under `migrations/` (e.g. `migrations/2026-06-15-gapfix-<framework>.sql`). **Never edit an applied migration** — `compliance_rules` is an AUDIT-ENGINE-adjacent table; changes are additive via a new file. The scanner reads rules live from Neon via `loadRules()` (scanner line 52), so a new seed row takes effect on the next mint with no code change.

**INSERT pattern** (full-column form, from `migrations/2026-05-20-phase-7.2-law-expansion.sql:79`):

```sql
INSERT INTO compliance_rules
  (framework_short, rule_id, description, regex_pattern, url_check, severity, citation_url,
   rule_type, trigger_pattern, sector_relevance, fine_low_gbp, fine_high_gbp,
   layman_explanation, tamazia_fix_short, active)
VALUES
  ('UK_OSA_2023', 'OSA_S10_RISK_ASSESS',
   'In-scope user-to-user services must publish illegal-content risk assessments and protections.',
   '(illegal[- ]content|risk assessment|user[- ]safety|content[- ]moderation policy)',  -- regex_pattern (the disclosure to find)
   '/safety',                                                                            -- url_check (preferred page; NULL = any page)
   'P0',                                                                                 -- severity: P0 | P1 | P2
   'https://www.ofcom.org.uk/online-safety',                                             -- citation_url
   'trigger_then_check',                                                                 -- rule_type (see below)
   '(forum|community|user[- ]generated|UGC|comments|chat|reviews|upload)',               -- trigger_pattern (only for trigger_then_check)
   ARRAY['saas','media','marketing','ecommerce','tech','education']::varchar[],          -- sector_relevance (canonical sector slugs)
   1800000, 18000000,                                                                    -- fine_low_gbp, fine_high_gbp
   'Plain-English why-it-matters for the client.',                                       -- layman_explanation
   'One-line Tamazia fix.',                                                              -- tamazia_fix_short
   TRUE)
ON CONFLICT DO NOTHING;     -- UNIQUE(framework_short, rule_id); use ON CONFLICT ... DO UPDATE to CORRECT a wrong existing row
```

- A simpler seed (no copy columns) is fine too — see `migrations/2026-05-19-seed-uk-compliance-rules.sql:21`. Defaults: `rule_type` → `must_appear`, `service_page_path` → `/services/regulatory-compliance/`, `pricing_tier` → `Authority`.
- `framework_short` MUST already exist in `framework_versions` (FK). If the framework is brand-new, seed it there first (see `migrations/2026-05-19-framework-versions.sql`).
- **rule_type values** the scanner understands (scanner `ruleCheck()`, line 465): `must_appear` (default — disclosure required, MISS if absent, line 512), `trigger_then_check` (only fires when `trigger_pattern` is present on the site, line 479), `prohibit` (MISS if the pattern IS present, line 497).
- **To fix a WRONG law** (not a missing one): re-INSERT the same `(framework_short, rule_id)` with `ON CONFLICT (framework_short, rule_id) DO UPDATE SET ...` to correct severity/regex/citation, or set `active = FALSE` to retire a rule that should not apply.
- ⚠️ This touches `migrations/**`, so the `eval-audit-gaps` gate runs on the PR. Add the locking fixture entry in the same PR.

---

## Surface 2 — routing miss → `src/lib/compliance/jurisdiction-router.js`

**Symptom:** the right rules exist in `compliance_rules`, but the framework **never gets routed** for this (country, sector) — or a framework is routed that should **not** apply. The fix is in the applicability map, not the rules.

**File:** `src/lib/compliance/jurisdiction-router.js`. Pick the right map/function:

| Gap | Edit | Location |
|---|---|---|
| Sector should carry framework X but doesn't (or carries a wrong one) | `SECTOR_MAP` — add/remove the `framework_short` in that sector's array | line 11 (e.g. `'law-firms': ['UK_SRA_COC','UK_EQUALITY_2010']`) |
| A client term routes to the wrong canonical sector (e.g. a gym → hospitality) | `SECTOR_ALIASES` — fix the alias → canonical mapping | line 72 |
| A whole jurisdiction's universal stack is wrong (UK/EU/US/UAE base laws) | `routeJurisdictions()` — the per-country `out.push(...)` blocks | line 99 (UK block lines 106–111) |
| Operating-market country name not recognised / maps to wrong region | `NAME_TO_CODE` | line 140 |
| A conditional law attaches without its trigger, or is missing when its trigger IS present | `CONDITIONAL` set (line 145) + `conditionalOK()` switch (line 146) — fix the per-code predicate |
| Home/served-market jurisdiction gate wrong (e.g. US law on a UK-only firm) | `routeForMarkets()` — the `ctx` flags (uk/eu/us/me, lines 173–179) and the `jOK()` gate (lines 192–201) | line 159 |

- `routeForMarkets({ markets, country, sector, signals })` (line 159) is the entry point the mint and the eval harness both call. `routeJurisdictions({ country, sector })` (line 99) is the pure per-country resolver it composes.
- This is a **code** fix (no DB). It takes effect on next mint. Touches the router file → the `eval-audit-gaps` gate runs. Add the locking fixture entry.
- **This is the surface the eval harness directly asserts** — `scripts/eval-audit-gaps.mjs` recomputes `routeForMarkets()` per fixture and checks `expect_laws` ⊆ output and `forbid_laws` ∩ output = ∅. A routing fix here is *provably* locked by adding the (country, sector) to the fixture.

---

## Surface 3 — scanner missed a LIVE error → `src/skills/S008-personalisation-engine/scanners/compliance.js`

**Symptom:** the rule routed **and** exists in `compliance_rules`, but the scanner failed to detect the actual breach/disclosure on the live page (false negative), or fired when it shouldn't (false positive). The fix is in the matcher, not the rule's existence.

**File:** `src/skills/S008-personalisation-engine/scanners/compliance.js`. Functions:

- `ruleCheck(rule, corpus, sector, corpusIndex)` — **line 465.** The per-rule matcher. This is the usual fix site:
  - `must_appear` default branch — **line 512** (disclosure absent ⇒ `status: 'miss'`, line 525).
  - `trigger_then_check` branch — **line 479** (only fires when `rule.trigger_pattern` matches the corpus first).
  - `prohibit` branch — **line 497** (a forbidden pattern present ⇒ miss).
  - Often the real fix is the **rule's `regex_pattern`/`trigger_pattern`** (Surface 1, a DB correction) rather than the matcher code — decide which: if *every* site mis-scans, it's the regex (Surface 1); if the matching *logic* is wrong (page selection, prose detection, evidence extraction), it's here.
- `scan({ domain, sector, country, cache_max_age, signals })` — **line 535.** The orchestrator: routes frameworks (`routeJurisdictions`, scanner line 11), `loadRules()`, gathers the corpus, runs `ruleCheck` per rule, applies the resolver overlay, and assembles findings. Edit here for corpus/page-coverage gaps (e.g. a policy page not fetched).
  - Note the false-positive guards already here: the "no readable text ⇒ bail" guard (line 548) and the unreadable-privacy-page suppression (line 658). If a *legit* miss is being suppressed, that's the bug to fix.
- `gatherCorpus(...)` (line 231) / `detectOperatingJurisdictions(corpus)` (line 344) — fix here if the page the disclosure lives on is never crawled, or operating markets are mis-detected from the corpus.

- Code fix, no DB. Takes effect next mint. Touches the scanner file → `eval-audit-gaps` gate runs. **Live-error detection is NOT asserted by the deterministic gate** (the scanner is network-bound / non-deterministic — same reason `eval-qualifier` never gates live `scoreLead`). Record the gap in `engine_gap_fixes` with `gap_type: 'live_error'` and note the expectation in the fixture's documentary `expect_errors` field for traceability.

---

## Surface 4 — a VALID law was wrongly DROPPED → `src/lib/compliance/resolver.js` `overlayDrop()`

**Symptom:** a law genuinely applies (right jurisdiction, right sector, right trigger) but the audit **dropped it** — the negative-guardrail overlay over-suppressed a legitimate finding.

**File:** `src/lib/compliance/resolver.js`. Function **`overlayDrop(law, { jurSet, employeeBand, trig, sector, framework })`** — **line 118.** It is the conservative per-finding guardrail the scanner applies after `ruleCheck`. It returns a drop-reason string or `null` (keep). The drop reasons, in order:

| Returned reason | Guard | Line |
|---|---|---|
| `unverified_held` | `!law.servable` (only confidence=verified ships) | 120 |
| `vacated` | `law.status === 'vacated'` | 121 |
| `out_of_jurisdiction` | `!jurCovered(law.jurisdiction, jurSet)` (the structural Al-Tamimi gate) | 122 |
| `freezone_carveout` | `carveDropped(law, jurSet)` (DIFC/ADGM zone match) | 123 |
| `out_of_sector` | `sectorExcluded(law, framework, sector)` (the structural sector gate) | 124 |
| `excluded` | `law.excluded_when` matches an active trigger | 125 |
| `below_employee_threshold` | `thresholdOk(law, employeeBand) === false` | 126 |

- If a valid law is dropped, identify **which** reason fired (the scanner records the drop reason) and fix the corresponding guard:
  - `out_of_jurisdiction` wrong → the law's `jurisdiction` value or the firm's `jurSet`; see `jurCovered()` (line 25) for the coverage rules (USA covers USA-CA/USA-STATES; GLOBAL always).
  - `out_of_sector` wrong → `sectorExcluded()` (line 101) reads the sector authority from `connect.js` (`UNIVERSAL_FW` + reverse `SECTOR_MAP`). The gate is conservative (drops only when the framework's sector set is KNOWN and excludes this firm) — if it still over-cuts, the framework→sector mapping in `connect.js`/`SECTOR_MAP` is the real fix (Surface 2).
  - `below_employee_threshold` wrong → `thresholdOk()` (line 35) / the law's `applies_when` band flag.
  - `freezone_carveout` wrong → `carveDropped()` (line 18).
- The full attach path `resolveLaws()` (line 49) shares the same guards; `overlayDrop()` is the *single-finding* subset that "cannot over-suppress a legitimate verified finding" (no positive `applies_when` trigger gate). Prefer fixing `overlayDrop`/its helpers for a single wrongly-dropped finding.
- Code fix, no DB. Touches the resolver file → `eval-audit-gaps` gate runs. A wrongly-dropped law that is *also* a routing assertion can be locked by adding the (country, sector) to the fixture's `expect_laws`; a drop that depends on live signals/triggers is `gap_type: 'live_error'` and recorded in the ledger.

---

## After ANY fix — lock it (mandatory)

1. **Add a fixture entry** to `eval/audit-gaps.json` → `fixtures[]`. Minimum: `{ domain, sector, country, expect_laws:[...], forbid_laws:[...], expect_errors:[...], note }`. For a routing/law/drop fix, put the affected framework in `expect_laws` (or `forbid_laws` for a wrong-law removal). Run `node scripts/eval-audit-gaps.mjs` — it must print `N/N pass` and exit 0.
2. **Advance the gap row:** `updateGap({ audit_hash, gap_type, gap_sig }, { status: 'merged', fix_pr_url, fixture_path: 'eval/audit-gaps.json' })` (then `'reminted'` / `'verified'` as the audit is re-minted and re-checked).
3. The `eval-audit-gaps` CI gate (`.github/workflows/eval-audit-gaps.yml`) now fails any PR touching the four surfaces that re-opens the gap.

## Quick reference — surface decision

- Rule missing/wrong in the DB? → **Surface 1** (migration).
- Framework not routed (or wrongly routed) for the sector/country? → **Surface 2** (`jurisdiction-router.js`). *Asserted by the gate.*
- Rule exists + routes, but the live page wasn't scanned correctly? → **Surface 3** (`scanners/compliance.js`). *Documentary in the gate.*
- Law applies but was dropped by a guardrail? → **Surface 4** (`resolver.js overlayDrop()`).
