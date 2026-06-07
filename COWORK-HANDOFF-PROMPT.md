# HAND-OFF PROMPT — Finish & Ship the Tamazia 24/7 Agency Pipeline

> ## ⚠️ BRANCH STATUS — READ THIS FIRST (verify, don't re-apply)
> An adversarial review already ran and **many of the code fixes below were ALREADY APPLIED** to `feat/agency-24-7` in a prior session. For every item marked **[DONE]**, do NOT blindly re-apply the edit (the anchor text has changed). Instead **VERIFY** it with `git grep`/read; if the code already matches the intent, mark that step `PASS — pre-applied` and move on. Only items marked **[TODO]** still need editing.
>
> **[DONE] (verify only):**
> - **A4a columns** — `conversion_tier, conversion_score, hiring_signal, mystrika_pushed, mystrika_pushed_at` are in `schema/canonical-schema.json` AND **already live on prod** (verified). *Still TODO:* the optional per-script `ADD COLUMN IF NOT EXISTS` guards were NOT added — add them for resilience (A4a guards).
> - **A4b** `asArr` non-array guard — applied in `lead-quality.js`.
> - **A4c** verify-status — `dmEmailVerified` already broadened to `/^(valid|deliverable|ok|accept|role_valid)/i`. *Still TODO:* unify into ONE shared helper used by BOTH `dmEmailVerified` and the Apify-verifier consumer (the enrich.js Apify branch still has its own regex).
> - **A4d** Apify re-verify cap — applied in `enrich.js` (`ENRICH_VERIFY_CAP`, default 40; reused on the escalation branch).
> - **A4e** DM-candidate verify order — applied (named/DM emails sorted first, before the cap).
> - **A4f** greeting swap — applied in `push-to-mystrika.js` (`greet()` now handles bare `Name,` + `Hi Name,`). *Still TODO:* add the COMMITTED unit test with a real stored touch-0 body (and `export` `greet`).
> - **A4g** mark-pushed `NULLIF` key + cross-run dedupe (`coveredPrimaries`, mark on ANY pushed prospect) — applied.
> - **A4h** psql `-tA` sanitize — applied in `enrich-worker.js` + `push-to-mystrika.js`. *Still TODO:* `mint-worker.js` RETURNING (company/sector/country) still needs the `regexp_replace` wrap.
> - **A2e** cost governor fail-CLOSED — applied (`cost-ledger.monthSpend` returns `NaN` on DB error; `runActor` skips paid calls on non-finite spend; honors `APIFY_ENABLE`).
> - **crawl-escalation** — extracted to `src/lib/audit/crawl-escalation.js`; `build.js` now has only a ONE-line hook (so the merge in A1 is a trivial keep-both).
>
> **[TODO] (apply as written):** **A2a–A2d** (Apify actor I/O mappings — still my original guesses; validate + fix against the real actors), **A3a–A3c** (register API corrections — need live validation), **A4i + A4j** (`build.js` `sector`/`country` parameterize/escape + `RETURNING id` — deliberately deferred to apply on the merged `main`, NOT done in-branch to avoid clobbering in-flight engine edits), **A4c unification**, **A4f unit test**, **A4h mint-worker**, **A4a guards**, **A4k**, **A4.l**, **A5**, plus **A6/A7/A8** (verify, push, PR — the branch already has a commit + may have a PR; UPDATE it) and the whole **Operator track**.
>
> Net: the review-found code bugs in *new* files are fixed; the remaining engineering is the live-validated Apify/register I/O, the two `build.js` hardening fixes on merged main, a few refinements, then infra/operator setup.

You are an autonomous coding agent (shell + git + file tools) on a macOS machine. You have NO memory of any prior session. This prompt is fully self-contained. Execute the phases **in order**. After each phase print `PHASE N: PASS|FAIL|BLOCKED|SKIPPED` plus a one-line reason. **On any hard FAIL, STOP** and report what failed, the exact command, the exact error, and what you tried — do not silently continue. Never use `|| true`, never swallow an error to keep going. At the very end print the FINAL ACCEPTANCE CHECKLIST filled in, plus a SECRETS-SAFETY ATTESTATION.

This prompt is split into two tracks:
- **AGENT TRACK (Phases A0–A9):** code, git, and DB work the agent does autonomously.
- **OPERATOR TRACK (Phases O1–O3):** infrastructure and paid-account work that REQUIRES a human (cloud console, payment cards, GUI signups). The agent **produces ready-to-run scripts + exact steps and STOPS** — it must not attempt to do these itself, and the run is NOT considered failed because they are pending.

---

## GLOBAL SAFETY RULES (apply to every phase — violating any one is a hard FAIL)

1. **Never echo secret values.** Do not print tokens, passwords, connection strings, `.env` contents, or any `git remote` URL that may carry a PAT. Never run `set -x`/`bash -x`. Never run `git remote -v`, `git remote get-url`, or `env`/`printenv` in a way that lands a secret in the transcript. When you must reference a secret, refer to it by **name only** (e.g. "APIFY_TOKEN"). The PR body, commit messages, logs, and your final report must contain ZERO secret values or token-bearing URLs.
2. **Never force-push `main`. Never push to `main` at all.** All work stays on `feat/agency-24-7`. The only allowed push is to that feature branch, and only with `--force-with-lease` (never plain `--force`, never `--force` to any branch).
3. **No auto-merge.** This PR touches production-affecting SQL. Open/update the PR and STOP. A human merges. Do not run `gh pr merge` under any circumstance.
4. **Bound all cost.** During the AGENT TRACK, paid external calls are DISABLED by default (`APIFY_ENABLE=0`, no live sends). Any live/paid action is opt-in via an explicit flag described below, is pointed at a sink/seed target, and is bounded by a hard cap. Never run an unbounded retry loop (no `until ... sleep`). Every loop has a max-attempts and a max-wall-clock budget.
5. **Production DB is protected.** Take a Neon branch (snapshot) BEFORE any DDL/DML. Run and validate all schema changes on the Neon branch FIRST. Only touch the production branch after the go/no-go gate in Phase A4, and only with additive `ADD COLUMN IF NOT EXISTS`-class statements you have read and confirmed. Never DROP/RENAME/TRUNCATE. Never hand-write a destructive statement.
6. **Never clobber in-flight work.** `build.js` in the engine checkout has UNCOMMITTED SoV/PSI edits. Before any operation that could touch it, confirm where those edits live and never overwrite them (details in Phase A1). When reconciling shared files, `diff` first and preserve, never blind-overwrite.
7. **Default to the SAFE branch when authorization is unobtainable.** If a step needs an approval/value/credential you cannot obtain, do the non-destructive thing, mark the item `BLOCKED — needs <X>`, and continue with the rest of the AGENT TRACK. Never self-authorize a merge, a live send, or a prod DDL beyond the additive columns.

---

## ENVIRONMENT & HARD FACTS

**Repos / paths (all absolute):**
- engine clone: `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os`
- agency feature clone (owns `feat/agency-24-7`): `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-agency`
- engine + migrations clone (branch `master`): `/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION`
- website / cockpit clone (branch `audit-overhaul-compact-convert`): `/Users/amanigga/Desktop/TAMAZIA-REBUILD/tamazia-website`
- env file: `/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env`
- node binaries: `/Users/amanigga/Desktop/TAMAZIA-REBUILD/_tools/node/bin`

**GitHub:** branch `feat/agency-24-7` pushed to the remote already configured as `origin` in the agency clone. **Do NOT hardcode the repo slug — derive it** (Phase A0 step 5) so a one-vs-two-"a" mismatch (`Tamazia` vs `Tamaziaa`) cannot send `gh` to the wrong repo.

**Schema:** the +8 leads columns and `dm_email_cache` are already provisioned (drift 0 at branch creation). The adversarial fixes ADD five NEW columns not yet in canonical schema: `conversion_tier`, `conversion_score`, `hiring_signal`, `mystrika_pushed`, `mystrika_pushed_at` — you must provision these (Phase A4) on a Neon branch first.

**In-flight build.js:** the engine checkout has UNCOMMITTED SoV/PSI edits to `build.js`. The feature branch's only `build.js` change is ONE added line wiring `src/lib/audit/crawl-escalation.js`. See Phase A1 for the exact, satisfiable resolution.

**Credentials on disk:** the `cowork-os` and `cowork-os-agency` clones may have a GitHub PAT embedded in `origin`. Treat per Global Rule 1. Use the remote **as already configured** (push by remote name `origin`, never by URL). Flag rotation as a TODO in your report; do NOT rotate.

---

## ENV BOOTSTRAP (run at the start of every NEW shell; do not print values)

```bash
export PATH="/Users/amanigga/Desktop/TAMAZIA-REBUILD/_tools/node/bin:$PATH"
# Fail hard if node toolchain is wrong:
command -v node | grep -q '/_tools/node/bin/node' || { echo "FAIL: _tools node not on PATH"; exit 1; }
node -v | grep -Eq '^v(2[0-9]|[3-9][0-9])\.' || { echo "FAIL: node not v20+"; exit 1; }
# Fail hard if .env is missing; load it WITHOUT tracing:
ENV_FILE="/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env"
[ -r "$ENV_FILE" ] || { echo "FAIL: .env missing/unreadable at $ENV_FILE"; exit 1; }
set +x
set -a; . "$ENV_FILE"; set +a
# Assert required vars are NON-EMPTY without printing them:
for v in DATABASE_URL; do
  [ -n "${!v}" ] || { echo "FAIL: required env $v is empty"; exit 1; }
done
echo "ENV OK (values not shown)"
```
If any assertion fails, STOP with `BLOCKED — env bootstrap`.

---

# AGENT TRACK

## PHASE A0 — Context & repo identity

1. If present, read `/Users/amanigga/.claude/plans/linked-wiggling-bear.md`.
2. Locate and read the runbook: `find /Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-agency -name 'MINT-2000-DAY-RUNBOOK.md'` then read Part 2 (the canonical pm2 worker list lives here).
3. `cd /Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-agency && git fetch --all --prune`
4. Inspect the branch diff: `git log --oneline origin/main..feat/agency-24-7`.
5. **Derive the repo slug safely (no secret printed):**
   ```bash
   cd /Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-agency
   SLUG=$(git config --get remote.origin.url | sed -E 's#.*github.com[:/]([^/]+/[^/]+?)(\.git)?$#\1#')
   case "$SLUG" in */*) :;; *) echo "FAIL: could not derive slug"; exit 1;; esac
   echo "Using repo slug: $SLUG"   # slug only — contains no token
   gh repo view "$SLUG" --json nameWithOwner -q .nameWithOwner   # confirm gh can reach it
   ```
   Use `"$SLUG"` for EVERY `gh` call hereafter. If `gh repo view` fails, STOP `BLOCKED — gh auth/slug`.
6. Check for an existing PR (do not create yet): `gh pr list --repo "$SLUG" --head feat/agency-24-7 --state all`.
7. Read end-to-end, before editing, every target file:
   - `src/lib/apify/client.js`
   - `src/lib/sourcing/fca-register.js`, `cqc-register.js`, `sra-register.js`
   - `src/lib/enrich/lead-quality.js`
   - `src/lib/sourcing/enrich.js`
   - `scripts/source-leads.js`, `scripts/push-to-mystrika.js`, `scripts/enrich-worker.js`, `scripts/ensure-schema.js`
   - `src/skills/S025-audit-page-builder/scripts/build.js`
   (all under the agency clone).
8. **Read `scripts/ensure-schema.js` specifically and determine, in writing, whether it is additive-only or whether it can DROP/RENAME/ALTER columns to "reconcile" drift.** Record the answer. This gates Phase A4/A8. If it can drop, you will NOT run it against prod (see A4).

`A0: PASS` once you can summarize the branch diff, have the verified `$SLUG`, know whether a PR exists, have read all targets, and have classified `ensure-schema.js`.

---

## PHASE A1 — Incorporate latest `main`, preserving in-flight build.js (satisfiable resolution)

Work in the agency clone.

```bash
cd /Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-agency
git status
```

**Precondition handling (no silent loss):**
- If the tree is **clean**, proceed.
- If the tree is **dirty**, do NOT stash-and-hope. Inspect the changes. If they are unrelated noise, stash with a labeled message (`git stash push -m "preflight-A1 <date>"`) and remember to restore. If they look like in-flight feature work, STOP `BLOCKED — agency clone dirty, manual triage` and report the diff summary (no secrets). Do not rebase over uncommitted work you can't classify.

**About the in-flight SoV/PSI build.js edits:** those live in the **engine clone** (`/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os`), as UNCOMMITTED working-tree changes. They are NOT in the agency clone and a rebase here cannot see or destroy them. Therefore:
- The "keep BOTH" requirement during THIS rebase is strictly: the agency branch's `build.js` must retain its ONE crawl-escalation line through any `origin/main` conflict. That is fully satisfiable here.
- The separate uncommitted SoV/PSI edits in the engine clone must be left untouched: **do not run any git/checkout/reset/`ensure-schema` write inside `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os`** during this run. Verify they are still present and uncommitted at the end (Phase A9 check). If at any point you would have to overwrite them to satisfy an instruction, STOP and report instead.

**Incorporate main (prefer merge to avoid force-push of shared history):**
```bash
git checkout feat/agency-24-7
git merge --no-edit origin/main
```
Use **merge**, not rebase, because the branch is already pushed and shared — merging avoids rewriting published history and avoids any force-push. (If a clean rebase is explicitly desired later, that is a human decision; default to merge here.)

**If `build.js` conflicts:** open `src/skills/S025-audit-page-builder/scripts/build.js`, keep `origin/main`'s content AND re-add the single crawl-escalation hook line (the `require('../../../lib/audit/crawl-escalation.js')` import and its one call site). Remove conflict markers only. Then `git add` that file and `git commit --no-edit`. Resolve any other conflict by preserving both behaviors; if a conflict is ambiguous, STOP `BLOCKED — ambiguous merge conflict in <file>` and report.

Verify:
```bash
git log --oneline -8
git grep -n "crawl-escalation" -- src/skills/S025-audit-page-builder/scripts/build.js
```

`A1: PASS` once `origin/main` is merged in, tree is clean, and `build.js` still references `crawl-escalation`.

---

## PHASE A2 — Fix Apify actor I/O mappings (`src/lib/apify/client.js`)

Apply these exact corrections.

**2a. `findDecisionMakerEmail()` — actor `code_crafter/leads-finder`:**
- Input keys: `company_domain: [domain]`; `contact_job_title: [...titles]`; keep `email_status: ['validated']`; `fetch_count: 10`. Remove `domain`, `company_name`, `organization_domains`, `person_titles`, `max_results`.
- Output reads: `p.full_name`; `p.job_title` (fallback `p.headline`); `p.email`. Keep `p.first_name`/`p.last_name`/`p.linkedin`. Drop `p.business_email`.
- The per-lead `verified` flag based on `p.email_status` is DEAD (no such output field). Since input filtered to `validated`, set `verified: true` for returned leads (or drop the per-lead flag). Do NOT read `p.email_status`.

**2b. `verifyEmails()` — actor `michael.g/email-verifier-validator`:**
- Keep input `emails: list`.
- Output: read `it.email`, `it.status`, `it.score` only. Drop `it.address`, `it.result`, `it.state`.
- **Status VALUES are `good`/`risky`/`bad`** (NOT valid/invalid). Map `good` → verified; `risky`/`bad` → not verified. Implement `const ok = /^good$/i.test(it.status)` where consumed.

**2c. `contactDetails()` — `vdrmota/contact-info-scraper`:** mappings correct; optional cleanup of dead lowercase `'linkedins'` fallback. No functional change required.

**2d. `crawlSite()` — `apify/website-content-crawler`:** mappings correct. **Note for Phase A3c:** `crawlerType: 'cheerio'` does NOT execute JavaScript. Do not rely on this actor to render JS pages.

**2e. `runActor()` cost governor — fail CLOSED for paid actors:** today `monthSpend('apify')` returns `0` when Neon is unreachable, so the cap never trips during a DB outage. Make the spend lookup signal failure distinctly (return `null`/non-finite on error, not `0`). In `runActor`, if spend is non-finite for a PAID (Starter) actor → SKIP and return `[]`. Free/Creator actors may remain fail-open. Honor `APIFY_ENABLE`: if `APIFY_ENABLE` is not `1`, paid actors must no-op and return `[]`.

Syntax check (no side effects): `node --check src/lib/apify/client.js`. **Do NOT `require()` the module** — it may construct clients or read env at import.

`A2: PASS` once the file passes `node --check` and all five edits are applied.

---

## PHASE A3 — Fix the register fetchers

**3a. `fca-register.js`:**
- Endpoint: `${BASE}/Search` → `${BASE}/CommonSearch`.
- FRN field: add `firm['Reference Number']` (string WITH a space) first in the fallback chain.
- Firm filter: match `/firm/i` against `d['Type of business or Individual']`.
- Core:
  ```js
  const s = await getJSON(`${BASE}/CommonSearch?q=${encodeURIComponent(company)}&type=firm`, H);
  const data = (s && (s.Data || s.data)) || [];
  const firm = data.find(d => /firm/i.test(d['Type of business or Individual'] || d.Type || '')) || data[0] || {};
  const frn = firm['Reference Number'] || firm.Reference_Number || firm.FRN;
  ```
- **Name normalization (apply to FCA + all registers):** before emitting a person, strip honorifics; if `"Surname, Forename"` (comma present), reorder to `First Last`; strip trailing punctuation. Prevents garbled guessed emails like `smith,.john@domain`.

**3b. `cqc-register.js`:**
- `?name=` free-text search is UNSUPPORTED. Gate name-only lookups to return `[]` gracefully; require a `providerId` for real lookups. Do not rely on `?name=`.
- Add a real `partnerCode` to every request, read from `CQC_PARTNER_CODE`. **If the env var is empty, this integration cannot work reliably** — make the module return `[]` and log `CQC disabled: no CQC_PARTNER_CODE` (do not silently fire throttled requests). Note `CQC_PARTNER_CODE` as a required operator key in your report.
- Nominated individual lives inside `regulatedActivities[]`:
  ```js
  const acts = detail.regulatedActivities || [];
  for (const a of acts) {
    const ni = a.nominatedIndividual;
    if (ni && (ni.personGivenName || ni.personFamilyName)) {
      const nm = `${ni.personGivenName || ''} ${ni.personFamilyName || ''}`.trim();
      if (nm) { out.push({ name: nm, role: 'Nominated Individual', source: 'cqc_register' }); break; }
    }
  }
  ```
- Use role label `Nominated Individual` (there is no "Registered Manager" field).

**3c. `sra-register.js`:**
- Fix the stale "No official API" comment: the SRA Data Sharing Platform exists but is **firm-only** (no individual solicitors / COLP / COFA), so scraping is still required for the ICP.
- The Find-a-Solicitor page (`solicitors.lawsociety.org.uk`) is **JS-rendered**; the current `class="...person..."` regex returns `[]`. **Resolution:** a `cheerio`-type crawl (per Phase A2d) will NOT render JS, so it cannot fix this. Choose ONE and state which you did:
  - (preferred) keep the `SRA_REGISTER=1` opt-in gate and return `[]` gracefully — mark SRA individual-scrape **out of scope** for this ship, with a TODO to wire a JS-capable Apify actor (e.g. a Playwright/Puppeteer-rendering actor) later; **OR**
  - if and only if a JS-rendering actor is already available in `client.js`, route the person scrape through THAT (not the cheerio crawler).
  Keep the graceful-`[]` fallback either way.

Syntax check each: `node --check src/lib/sourcing/fca-register.js src/lib/sourcing/cqc-register.js src/lib/sourcing/sra-register.js`.

`A3: PASS` once all three pass `node --check` and carry the corrections (with your SRA choice stated).

---

## PHASE A4 — Schema + script fixes (Neon branch FIRST, then go/no-go)

### A4.0 — Take a Neon branch BEFORE any DB change
Create an isolated Neon branch/snapshot of the production DB and obtain its connection string into a LOCAL var `BRANCH_DB_URL` (do not print it). Use the repo's own DB helper / Neon CLI / Neon API as available. If you cannot create a branch, STOP `BLOCKED — cannot create Neon test branch` (do NOT fall back to running DDL on prod). Run ALL of A4's schema work against `BRANCH_DB_URL` first; only the production go/no-go in A4.9 touches prod.

### A4a — Provision five missing columns (silent-data-loss fix)
`source-leads.js` inserts `conversion_tier`/`conversion_score`/`hiring_signal`; `push-to-mystrika.js` reads/writes `mystrika_pushed`/`mystrika_pushed_at`/`hiring_signal`. None exist → inserts/selects silently fail on a converged DB.
- Add to `schema/canonical-schema.json` under `leads.columns`: `conversion_tier` (text), `conversion_score` (numeric), `hiring_signal` (text), `mystrika_pushed` (boolean default false), `mystrika_pushed_at` (timestamptz).
- Add idempotent, ADDITIVE-ONLY guards at the top of both scripts (mirroring how `verify-audits.js` adds `audit_verified`):
  ```sql
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_tier text;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_score numeric;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS hiring_signal text;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed boolean DEFAULT false;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed_at timestamptz;
  ```
  These are the ONLY DDL statements this run may apply to prod, and only after A4.9.

### A4b — `lead-quality.js` `asArr` non-array guard
```js
const asArr = (v) => { if (Array.isArray(v)) return v; try { const p = v ? JSON.parse(v) : []; return Array.isArray(p) ? p : []; } catch (_e) { return []; } };
```

### A4c — Reconcile email-status vocabularies, ONE mapping
There are two vocabularies: the Apify verifier (`good`/`risky`/`bad`, Phase A2b) and `enrich.js`/stored `verify_status` (`deliverable`/`ok`/`accept`/`catchall`). Define a SINGLE shared helper used by both `dmEmailVerified` and the verifier consumer:
```js
// verified == deliverable & safe. Explicitly EXCLUDE catch-all/risky/unknown.
const VERIFIED_RE = /^(good|valid|deliverable|ok|accept(ed)?)$/i;
const RISKY_RE    = /^(risky|catch[\s_-]?all|unknown|accept[_-]?all)$/i;
const isVerifiedStatus = (s) => { s = String(s||'').trim(); return VERIFIED_RE.test(s) && !RISKY_RE.test(s); };
```
Then: `const dmEmailVerified = truthy(lead.email_verified) || isVerifiedStatus(lead.verify_status);` Ensure `email_verified` is carried onto the lead row so the boolean stays authoritative. Confirm `accept`-as-catch-all in your provider is NOT mis-counted — if `accept` means catch-all in this stack, remove it from `VERIFIED_RE`. State which you concluded.

### A4d — `enrich.js` cap the Apify re-verify branch
First-pass verify is capped at 25; the Apify-escalation re-verify (~line 261) has NO cap. Apply the same cap, parameterized:
```js
const REVERIFY_CAP = Number(process.env.APIFY_REVERIFY_CAP || 25);
for (const e of emails.filter(e => e.verified == null).slice(0, REVERIFY_CAP)) { /* verifyFree(...) */ }
```

### A4e — `enrich.js` verify DM-candidate emails past the cap
Ensure every email referenced by a `decisionMakers[].email` is in the verified slice BEFORE the 25-cap applies to generic inboxes (order `byEmail` so named/DM emails verify first). Otherwise a register/Companies-House DM email past index 25 never becomes primary.

### A4f — `push-to-mystrika.js` greeting-swap (wrong-name sends)
Rendered touch bodies (from `S064-touch-cadence/scripts/render.js`) open with a bare `Name,` so secondaries get the primary's first name. Replace only a leading name-run immediately followed by a comma at the very start of the body:
```js
const greet = (body, first) => !body ? body
  : body.replace(/^[ \t]*([A-Za-z][\w'’\-]*(?:[ \t]+[A-Za-z][\w'’\-]*){0,2})[ \t]*,/,
                 (m) => (first || 'there') + ',');
```
**Add a unit test with real fixtures** drawn from an actual stored touch-0 body: assert `John,`→`<secondary first>,`; `Team,`→`there,` (or configured fallback); and assert a body that does NOT start with `Name,` is left unchanged (guard against corrupting openers like "Tamazia, the agency,"). The test must load the same `greet` the script uses (export it) so the two cannot drift.

### A4g — `push-to-mystrika.js` mark-pushed key + dedupe
- Make SQL key match JS by using `NULLIF` so `''` is treated as absent on BOTH sides:
  ```sql
  WHERE lower(COALESCE(NULLIF(primary_email,''), NULLIF(contact_email,''), NULLIF(email,''))) IN (...)
  ```
  Apply the same `NULLIF` to the SELECT's `primary_email`.
- Dedupe fix: accumulate pushed `lead_primary` from ALL pushed prospects (primary OR secondary), AND mark a lead pushed when its primary email collided with `seenGlobal` during the run (it was effectively delivered via the other lead). Prevents re-pushing secondaries every run.

### A4h — Sanitize psql `-tA` row parsing (tab/newline injection)
`enrich-worker.js` (~41-44), `mint-worker.js` (~29-35), `push-to-mystrika.js` (~49) split on `\n`/`\t` without sanitizing free-text columns. Wrap free-text columns in RETURNING/SELECT with `regexp_replace(col,'[\t\r\n]+',' ','g')` (mint-worker: company/sector/country; enrich-worker: company/sector; push: sector/city), OR switch those claim queries to `to_jsonb(row)` + `JSON.parse` per line (as `qualify-and-queue.js` already does).

### A4i — `build.js` SQL injection via `sector`/`country` — PARAMETERIZE if possible
`sector` (overwritten ~line 188 by `comp.detected_sector`) and `country` are interpolated raw into the `audit_pages` INSERT (~517) and collision SELECT (~508). A quote breaks/injects the statement.
- **Preferred:** convert both the INSERT and the collision SELECT to **parameterized queries** if `pg()` supports params (check the helper). Parameterize ALL interpolated literals (`domain`, `sector`, `country`).
- **Only if** `pg()` cannot take params: escape every literal AND add a `sector` allow-list (mandatory, not optional):
  ```js
  const sectorE  = String(sector||'').replace(/'/g,"''");
  const countryE = String(country||'UK').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3) || 'UK';
  ```
  Use `'${sectorE}'`/`'${countryE}'` in both statements. State which path you took.

### A4j — `build.js` INSERT silent-success
`pg()` returns `null` on error, so a failed `audit_pages` INSERT still returns `{slug,hash,signed_url}` → dead link emailed. Add `RETURNING id`; have `build()` throw/return an error flag when no row was written, so callers never send a link to a non-existent `/audit/{slug}/{hash}`.

### A4k — NEEDS-LIVE-VALIDATION (run read-only on the Neon BRANCH; apply additive fixes on branch, re-apply on prod only via A4.9)
Use the repo DB helper against `BRANCH_DB_URL`:
1. **`minting_queue` UNIQUE(domain):** `enqueue-leads.js` uses `ON CONFLICT (domain)`. Confirm a unique index/constraint exists. If absent, **first check for existing dup lowercased domains**; if dups exist, do NOT create the unique index (it will fail) — instead drop the `ON CONFLICT` and rely on the `NOT EXISTS` anti-join, and report the dups. If no dups, add `CREATE UNIQUE INDEX IF NOT EXISTS minting_queue_domain_uk ON minting_queue(lower(domain))`.
2. **`leads_sync_dual_fields` trigger** (`COWORK-OS-EXECUTION/scripts/migrations/2026-05-21-sync-dual-fields.sql`): confirm installed. If not, the A4g `NULLIF` fix is load-bearing — ensure it is applied.
3. **The five A4a columns** exist after applying the guards on the branch.
4. **W14-cron SELECT:** `W14-cron.js qualifyAdIntelLeads` lives in `COWORK-OS-EXECUTION`. `cd` there to inspect. Confirm it SELECTs `audit_critical`, `ai_cited`/`ai_visibility_gap`, `primary_email`, `decision_maker_confidence`, `email_verified`/`verify_status`. If it is meant to mint Tier-1 and omits them, add them; if intentional, note it. **Do not write to prod from the EXECUTION clone; do not touch its uncommitted build.js.**

### A4.l — Reconcile `run-engine-cycle.sh` (diff first, preserve agency lines)
EXECUTION copy (md5 `050ee09a…`) is canonical; agency/`cowork-os` copies are `3ccfd1ad…`. **`diff` the agency copy against the EXECUTION copy first.** Bring the agency copy in line with EXECUTION **while preserving any agency-specific worker lines the branch intentionally added** — never blind-overwrite. If the diff shows the agency copy adds required worker wiring, merge by hand and report what you kept.

Syntax-check every edited `.js` with `node --check`.

### A4.9 — GO/NO-GO before touching production
You have now applied/validated all schema work on the Neon BRANCH. Before applying the five `ADD COLUMN IF NOT EXISTS` to PROD:
- Confirm (from A0.8) `ensure-schema.js` is additive-only. If it can DROP/RENAME, do NOT run it on prod — apply ONLY the five explicit `ADD COLUMN IF NOT EXISTS` statements to prod via the repo helper, and skip running `ensure-schema` against prod (run it only on the branch).
- Re-fetch `origin/main` (TOCTOU guard) and confirm no schema-affecting migration landed since A0; if one did, re-validate on the branch.
- Apply ONLY the five additive `ADD COLUMN IF NOT EXISTS` statements to prod. Nothing else. No drops, no index creation on prod unless A4k.1 found zero dups AND you state it explicitly.
- Confirm via `information_schema.columns` on prod that the five columns now exist.

`A4: PASS` once every fix is applied, all edited `.js` pass `node --check`, A4k items are resolved on the branch, and exactly the five additive columns are live on prod (verified) with `ensure-schema` having been run on prod ONLY if confirmed additive-only.

---

## PHASE A5 — OPTIONAL: Tier-2 approval tab in the cockpit

Check first whether a Tier-2 approval surface already exists; if so, `SKIPPED — exists`. Otherwise, in `/Users/amanigga/Desktop/TAMAZIA-REBUILD/tamazia-website` (branch `audit-overhaul-compact-convert`), vanilla-JS SPA; `quality_fit`/`lifecycle_stage` already exist live:
1. READ `functions/api/admin/leads/pending.js` (`onRequestGet`) — copy `leads.js`, WHERE `quality_fit IS NOT TRUE AND lifecycle_stage IN ('enriched','sourced') ORDER BY quality_score DESC`.
2. WRITE `functions/api/admin/leads/approve.js` (`onRequestPost`) — copy `leads/update.js`; body `{id}`; **parameterized** `UPDATE leads SET quality_fit=TRUE, lifecycle_stage='qualified', updated_at=NOW() WHERE id=$1`.
3. `public/admin/index.html` nav (`<nav id="tabs">`, ~line 28): add `<button data-tab="pending" class="tab">Pending</button>`.
4. `public/admin/cockpit/app.js`: in `renderTab` (~line 76) add `else if (tab==='pending') await renderPending(root);`; add `renderPending(root)` modeled on `renderLeads`, rows with an Approve button (`.apbtn`) POSTing to `/leads/approve`, refreshing on success.

`A5: PASS` or `SKIPPED — exists`.

---

## PHASE A6 — Verification suite (NON-DESTRUCTIVE by default)

Run from the agency clone with env loaded. **For this entire phase, force `APIFY_ENABLE=0` and a SINK target** unless the explicit live gate (A6.7) is invoked. No real prospect email may be sent. Capture output for each step.

Set the safe context for the phase:
```bash
export APIFY_ENABLE=0          # paid actors no-op
export DRY_RUN=1               # honored by scripts that support it
```

1. **Schema verify (on prod, read-only):** confirm via `information_schema.columns` that the five A4a columns exist on `leads`. Then run `node scripts/ensure-schema.js` **only if** A0.8 proved it additive-only; expect 0 drift given canonical schema now includes the five columns. If `ensure-schema` is not provably additive, SKIP running it and just assert the five columns via `information_schema`; record `ensure-schema: skipped (not provably additive)`.
   - **Drift expectation:** "0 drift" means: canonical (with the five new columns) matches live for the columns this feature owns. If unrelated in-flight SoV/PSI columns exist live and aren't in canonical, drift may be NON-zero for THOSE — that is expected and is NOT a failure of this run. Report drift, attribute each drifting column, and only FAIL if a column THIS feature owns is missing/mismatched.
2. `node scripts/enrich-worker.js --once --dry` (no paid calls; `APIFY_ENABLE=0`).
3. `node scripts/qualify-and-queue.js 50` — confirm leads advance to `lifecycle_stage=qualified`; confirm `asArr`/`isVerifiedStatus` did not regress tiering.
4. `node scripts/approve-leads.js`.
5. `node scripts/push-to-mystrika.js --dry` — verify: no duplicate sends; greeting addresses SECONDARIES by their own name; leads marked pushed even on the `seenGlobal` collision path. **No real send occurs in --dry.**
6. Run the `greet` unit test (A4f) and confirm PASS.
7. **LIVE MINT — GATED, opt-in, single, sink-targeted:** Do this ONLY if the operator has set `ALLOW_LIVE_MINT=1` AND a sink recipient (`SINK_EMAIL`) AND `APIFY_CAP_USD` is in effect. Run exactly ONE mint against a designated SEED domain with the send leg pointed at `SINK_EMAIL` (never a real prospect). Confirm the produced audit link resolves to a real `/audit/{slug}/{hash}` page (validates A4i/A4j). If `ALLOW_LIVE_MINT` is unset, **skip the live send** and instead build the audit page in dry mode and assert the slug/hash row is written with `RETURNING id` — record `live mint: SKIPPED (no ALLOW_LIVE_MINT)`. Never send to a real buyer during verification.
8. Re-run `node --check` on every edited `.js`; run repo `npm test` / `npm run lint` if those scripts exist (report "not present" if not).

Throughout, print a running tally: paid Apify calls made (should be 0 unless gated), emails sent (0 unless gated to SINK), so cost is observable.

`A6: PASS` once steps 1–6 and 8 succeed, and step 7 is either a clean gated sink-mint or a recorded safe SKIP.

---

## PHASE A7 — Commit & push (feature branch only, no merge)

```bash
cd /Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-agency
git add -A
git status
git commit -m "Ship agency 24/7: fix Apify I/O + register APIs, provision new columns, harden push/audit/cost-governor

- apify/client.js: correct leads-finder & email-verifier I/O; fail-closed cost governor; honor APIFY_ENABLE
- fca/cqc/sra registers: correct endpoints/fields; CQC nominated-individual; CQC disabled without partnerCode; SRA JS-render noted
- provision conversion_tier/conversion_score/hiring_signal/mystrika_pushed(+_at) + additive guards
- lead-quality: asArr guard; single shared verified-status mapping (excludes catch-all)
- enrich.js: cap Apify re-verify; verify DM-candidate emails before cap
- push-to-mystrika: fix greeting swap (+unit test), NULLIF mark-pushed key, dedupe re-push
- build.js: parameterize/escape sector/country; RETURNING id so dead audit links can't be sent
- sanitize psql -tA free-text parsing; keep crawl-escalation hook through merge of main

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Push the FEATURE branch only, with lease (history may have moved since it was published; lease prevents clobbering others without forcing):
```bash
git push --force-with-lease origin feat/agency-24-7
```
If the push is rejected by lease, FETCH, inspect who/what advanced the branch, reconcile by **merge** (not force), and retry `--force-with-lease`. Never use plain `--force`. Never push `main`.

`A7: PASS` once the feature branch is pushed without secrets in any output.

---

## PHASE A8 — Open/update the PR (base `main`), do NOT merge

Branch on existence (the literal `gh pr create` must not run when a PR exists):
```bash
if gh pr view --repo "$SLUG" --head feat/agency-24-7 >/dev/null 2>&1; then
  gh pr comment --repo "$SLUG" --head feat/agency-24-7 \
    --body "Updated feat/agency-24-7. Verification summary: <fill in: schema 5 cols live, enrich --once --dry OK, qualify 50 → qualified, push --dry clean (correct greeting, no dupes), greet unit test PASS, live-mint <sink|skipped>>. Awaiting human review/merge."
else
  gh pr create --repo "$SLUG" --base main --head feat/agency-24-7 \
    --title "Agency 24/7 pipeline: ship + harden" \
    --body "$(cat <<'EOF'
Finishes the Tamazia 24/7 agency pipeline.

## What changed
- Fixed all 4 Apify actor I/O mappings (leads-finder keys; email-verifier good/risky/bad); cost governor fails CLOSED for paid actors and honors APIFY_ENABLE.
- FCA (`/CommonSearch`, `"Reference Number"`, `"Type of business or Individual"`), CQC (no name search; partnerCode-gated; `regulatedActivities[].nominatedIndividual`), SRA (JS-render limitation noted; graceful `[]`).
- Provisioned 5 previously-missing `leads` columns (additive only) + idempotent guards.
- Hardened push-to-mystrika (greeting swap + unit test, NULLIF key, dedupe), lead-quality (asArr guard, single verified-status mapping excluding catch-all), enrich.js (re-verify cap, DM-email verification order), S025 build.js (parameterized/escaped + RETURNING).
- Sanitized psql -tA free-text parsing. Merged latest main; kept the crawl-escalation hook.

## Verification (non-destructive)
APIFY_ENABLE=0 throughout. ensure-schema/columns verified; enrich-worker --once --dry; qualify 50 → qualified; approve-leads; push --dry (no dupes, correct greeting); greet unit test green; live mint gated to a sink/seed only.

## NOT done here (operator track)
Oracle A1 VM (SearXNG/Metabase), Apify paid+creator account signup, n8n workflows — see operator runbook. No secrets in this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
fi
gh pr view --repo "$SLUG" --json url -q .url   # report URL
```
Do NOT merge. Leave for human review regardless of CI state (this PR touches production SQL).

`A8: PASS` once the PR is open/updated and you have its URL. Report the URL.

---

## PHASE A9 — Final integrity checks

1. Agency tree clean; `feat/agency-24-7` contains `origin/main`; `build.js` still references `crawl-escalation`.
2. The engine clone's uncommitted SoV/PSI `build.js` edits are STILL present and uncommitted (you never touched that clone): verify by listing that the clone still reports a dirty `build.js` (do not modify it).
3. No secret value or token-bearing URL appears anywhere in your transcript, the commit, or the PR.
4. The five columns exist on prod; only additive DDL was applied.

`A9: PASS` once all four hold.

---

# OPERATOR TRACK (HUMAN-ONLY — agent emits scripts/steps and STOPS; do not attempt)

The agent CANNOT provision cloud infra, enter payment cards, or click GUI signups. For each phase below, the agent OUTPUTS the exact scripts/steps for a human and marks the phase `BLOCKED — operator action required`. These do NOT count against AGENT-TRACK success.

## PHASE O1 — Oracle A1 VM (SearXNG :8888 + Metabase :3000)
Emit a copy-pasteable bundle; the human runs it.
- **Provision:** OCI Always-Free Ampere `VM.Standard.A1.Flex` (Ubuntu 22.04 aarch64, 4 OCPU/24GB, 50–200GB). London (UK South) often returns `Out of host capacity` → upgrade to Pay-As-You-Go (still free under Always-Free limits) or fall back to `VM.Standard.E2.1.Micro` (x86, 1GB) with a 2GB swapfile. **Capacity retry must be BOUNDED** (max attempts + max wall-clock, e.g. 60 tries / 2h), never an infinite `until` loop.
- **SSH key:** `ssh-keygen -t ed25519 -f ~/.ssh/oci_a1`.
- **Ingress layer 1 (OCI Security List/NSG):** allow TCP 22, 8888, 3000 (optional 80/443) from `0.0.0.0/0`; rely on app-level auth (Pikapod egress IPs aren't static).
- **Ingress layer 2 (VM iptables) — SSH-SAFE:** Oracle Ubuntu has a catch-all REJECT in INPUT; rules appended after it are ignored. **Never touch the port-22 ACCEPT.** Find the REJECT line number, INSERT the new ACCEPTs immediately BEFORE it (not a hardcoded index), verify `iptables -L INPUT --line-numbers -n` shows 8888/3000 ACCEPT ABOVE the REJECT and 22 still ACCEPTed, THEN `netfilter-persistent save`. Keep an open SSH session while editing so a mistake doesn't lock you out.
- **Install:** Node 20, git, Docker, pm2. Do NOT use `newgrp docker` inside a script (it spawns a subshell and breaks the script) — log out/in or prefix with `sudo`. Capture the `pm2 startup` output and run the printed command manually.
- **SearXNG (Docker):** internal port 8080 published as 8888; `json` MUST be in `search.formats`; set a random `secret_key`. Export `SEARXNG_URL=http://<PUBLIC_IP>:8888`; query `${SEARXNG_URL}/search?q=<term>&format=json`.
- **Neon read-only role (run in Neon SQL editor on the reporting DB):** create `metabase_ro` LOGIN with a STRONG password (not a placeholder); GRANT CONNECT/USAGE/SELECT on existing + default privileges. Use a SEPARATE read-write `metabase_app` role for Metabase's own metadata DB. **Do not paste real passwords into shared transcripts.**
- **Metabase (Docker :3000):** pass `MB_DB_CONNECTION_URI` via a Docker **env-file or secret**, NOT inline `-e` (inline is visible in `docker inspect`). Connect the reporting DB in the UI using `metabase_ro` with SSL=require.
- **6 pm2 services:** bring up the workers named in `MINT-2000-DAY-RUNBOOK.md` Part 2; `pm2 save`; confirm `pm2 ls` shows 6 online.

## PHASE O2 — Apify accounts + env
- Human creates an **Apify Starter** (paid) account for `code_crafter/leads-finder` + `michael.g/email-verifier-validator`, and a **Creator** account for `apify/website-content-crawler` + `vdrmota/contact-info-scraper`. (Agent cannot enter payment details.)
- Append to `/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env` (do not overwrite existing keys), using the EXACT var names `client.js` reads (the agent must report those names from A2):
  - `APIFY_ENABLE=1` (only AFTER verification is done and you intend live runs)
  - `APIFY_TOKEN=<starter>` (+ `APIFY_CREATOR_TOKEN=<creator>` if the client supports a split — match `client.js`)
  - `APIFY_CAP_USD=29`, `APIFY_REVERIFY_CAP=25`
  - `CQC_PARTNER_CODE=<value>` (required for CQC; without it CQC stays disabled per A3b)
- Never print token values. Confirm names match `client.js`.

## PHASE O3 — n8n on Pikapod (`modest-magpie.pikapod.net`)
Build two workflows in the GUI (agent emits the spec; **verify the source table name first** — pipeline writes `leads` with `lifecycle_stage`/`quality_fit`; do NOT assume a `prospects` table exists. Use the real table/columns confirmed against the live schema):
- **Daily Tier-2 digest:** cron `0 8 * * *` (Europe/London) → Postgres (Neon, `metabase_ro`, SSL require) selecting pending Tier-2 leads → format → Slack/Email with an approval link.
- **Queue-depth alert:** cron `*/30 * * * *` → count pending → IF depth > 50 → alert, with a cooldown (Set node) to avoid spam.
- n8n→SearXNG: HTTP Request node to `http://<PUBLIC_IP>:8888/search?q={{ $json.term }}&format=json`.

---

## FINAL ACCEPTANCE CHECKLIST (print filled in; mark each PASS / FAIL / BLOCKED-needs-X / SKIPPED)

**Agent track:**
- [ ] Env bootstrap passed (node v20 from `_tools`, `.env` loaded, required vars non-empty) — no values printed.
- [ ] `$SLUG` derived & verified via `gh repo view`; all `gh` calls used it.
- [ ] `origin/main` merged into `feat/agency-24-7` (merge, not force-rebase); tree clean; `build.js` retains crawl-escalation line.
- [ ] Engine-clone uncommitted SoV/PSI `build.js` edits left untouched and still present.
- [ ] `apify/client.js`: leads-finder I/O fixed; email-verifier good/risky/bad mapping; cost governor fails CLOSED for paid + honors `APIFY_ENABLE`; passes `node --check`.
- [ ] FCA `/CommonSearch` + `"Reference Number"` + `"Type of business or Individual"` + name normalization.
- [ ] CQC no `?name=` reliance; `regulatedActivities[].nominatedIndividual`; disabled gracefully without `CQC_PARTNER_CODE`.
- [ ] SRA JS-render limitation resolved (stated path); `SRA_REGISTER=1` gate + graceful `[]`.
- [ ] Neon test branch created; all schema work validated there BEFORE prod.
- [ ] Five `leads` columns in canonical schema + additive guards; applied to prod via `ADD COLUMN IF NOT EXISTS` only; verified live in `information_schema`.
- [ ] `ensure-schema.js` classified additive-only; run on prod ONLY if so (else skipped + columns asserted directly).
- [ ] `lead-quality.js` `asArr` guard; SINGLE shared verified-status mapping that excludes catch-all/risky.
- [ ] `enrich.js` Apify re-verify capped (`APIFY_REVERIFY_CAP`); DM-candidate emails verified before the cap.
- [ ] `push-to-mystrika.js` greeting swap fixed + unit test with real fixtures (incl. non-greeting-unchanged case); `NULLIF` key; cross-run dedupe.
- [ ] `build.js` sector/country parameterized (or escaped + mandatory allow-list — stated); INSERT `RETURNING id`, fails loudly (no dead links).
- [ ] psql `-tA` free-text sanitized in enrich-worker/mint-worker/push.
- [ ] A4k resolved: minting_queue unique (dedupe-checked first); sync-dual-fields trigger; 5 columns live; W14-cron SELECT checked.
- [ ] `run-engine-cycle.sh` reconciled via diff, agency-specific lines preserved.
- [ ] Verification ran with `APIFY_ENABLE=0`; paid calls = 0; emails sent = 0 (or only to SINK under explicit gate); drift attributed and only feature-owned columns required to match.
- [ ] enrich `--once --dry`; qualify 50 → qualified; approve-leads; push `--dry` clean; greet test green; live mint = sink-gated OR recorded safe SKIP.
- [ ] Feature branch pushed with `--force-with-lease` (never plain force; never `main`).
- [ ] PR opened/updated (branched on existence; no double-create); NOT merged; URL reported.

**Operator track (expected BLOCKED — these do not fail the run):**
- [ ] O1 Oracle A1 VM bundle emitted (SSH-safe iptables, bounded capacity retry, no `newgrp`, secrets via env-file).
- [ ] O2 Apify Starter+Creator signup steps + `.env` var names (matched to `client.js`) emitted; `APIFY_ENABLE=1` deferred to post-verification.
- [ ] O3 n8n digest + queue-depth specs emitted against the REAL table (verified, not assumed `prospects`).

**Secrets-safety attestation (must be true):**
- [ ] No token, password, connection string, `.env` content, or token-bearing `git remote` URL was printed in any output, commit, or PR.
- [ ] No `set -x`/`bash -x`; no `git remote -v`/`get-url`; no `env`/`printenv` dumping secrets.
- [ ] PAT rotation flagged as a TODO (not performed).

Finally report: the PR URL; the Neon test-branch name (not its URL/credentials); whether the live mint ran (sink) or was skipped; the exact `client.js` env var names operators must set; and every item marked `BLOCKED — needs <X>` with the specific missing input.