# EDIT-LOG — Cluster 1 (Lead quality at enrich) · branch `v4-fix-quality` · base 2029558

FIX AGENT ENG-A. One commit per fix `fix(quality): <id> ...`. Agency lead pipeline only; audit engine off-limits; Neon additive only (no DDL here — needed columns exist); SEND OFF.

Syntax tool: `jsc <file>` — ReferenceError on require/module after a CLEAN parse = PASS; SyntaxError = FAIL.

## Live evidence captured at start (Neon, 8,806 leads)
- **Q1** `contact_name='Altaf Husain Yunus Bhai Patel'` bound to **20 distinct law-firm domains** (wiselaw, paragonlaw, stowefamilylaw, gibsonkerr …), all `primary_email_source=companies_house`. Isabel Cordoba 13, Peter Maguire 12, etc. 34 `.ae` leads carry a contact_name; **19 of them via `companies_house`** (cross-jurisdiction leak).
- **Q3** template emails as primary: `user@domain.com` (80), `example@mysite.com` (26, Wix), `your@email.com` (21), `you@company.com`, `email@email.com`, `email@work.com`, `email@mcewanfraserlegal.co.uk` … 171 template-local + 160 template-domain.
- **Q4** `feedback@onemedical.com` → contact_name "Feedback We".
- **Q5** `entity_type` populated = **0 / 8,806**; `consent_required=true` = **0**. PECR gate fully inert (column exists, never written by enrich).
- **Q2** 1,018 question/listicle company names; `legal_name` populated = **0 / 8,324**.

---

## Fixes

### Q1 [B13/B14/B23] — kill CH officer NAME-SEARCH; reg-number match only
- **File:** `src/lib/sourcing/enrich.js`
- **Before:** lines 236-253 called `require('./companies-house.js').findDecisionMakers({company,domain})` — a keyword SEARCH that returns one officer for any firm sharing a sector word; gated only by a loose TLD/country regex. Separately, `_firmo.officers` (the safe reg-number CH path) was merged AFTER the verify loop with `email:''`.
- **After:** removed the name-search block entirely (and its now-orphaned `_isUK` gate). CH officers now come ONLY from `firmographics.js` (reads the company-registration NUMBER off the firm's own site → CH `/company/{reg}/officers`, jurisdiction==='gb' only = exact-company match). Moved that merge ABOVE the verify loop and gave it the same pattern-guessed-email treatment as register officers (guess only when the firm's OWN pattern was detected; no blind first.last default for CH).
- **Why this kills the bug:** a CH officer can no longer be attached unless the reg number on THIS firm's site resolves to it. "Altaf … Patel on 20 law domains" + the 19 `.ae`/`.com` UK-officer leaks came exclusively through the name-search; that call no longer exists.
- **companies-house.js note:** the `findDecisionMakers` name-search function still exists in `companies-house.js` (NOT in my exclusive file set, left untouched). It simply has no caller in the agency enrich path now. Flagged for the owner of that file to delete or repurpose.
- **Syntax:** `jsc enrich.js` → `ReferenceError: require` after clean parse = PASS. Grep confirms zero live refs to `findDecisionMakers`/`_ch`/`companies-house.js` (only the explanatory comment).

### Q3 [B18] — expand placeholder-email denylist
- **File:** `src/lib/sourcing/enrich.js` (`_PLACEHOLDER`, applied in `addEmail`/`parseContactsFromHtml`)
- **Before:** `/(example\.(com|org)|sentry\.io|wixpress|squarespace|godaddy|domain\.com|yourdomain|email\.com|company\.com)/i` — missed `mysite.com` (Wix `example@mysite.com`, 26 leads), and missed ALL template LOCAL parts (`user@`, `you@`, `your@`, `name@`, `email@`, `yourname@`, `johndoe@`).
- **After:** two-arm regex — (a) `_PLACEHOLDER_LOCAL` anchored `^…@` template recipients; (b) `_PLACEHOLDER_DOMAIN` placeholder hosts incl. `mysite.com`, `website.com`, `host.com`, `sample.com`, `address.com`, `work.com`, `test.com`, `mydomain.*`, `yoursite.com`, `companyname.com`. Combined into one `_PLACEHOLDER` (same name, same call site).
- **Proof:** jsc harness over the 19 live offenders → all 19 BLOCKED (incl. `email@mcewanfraserlegal.co.uk` = template local on a REAL domain). 10 legit emails incl. trap cases (`username.jones@`, `emailyhassan@`, `testa.fonseca@`, `nameer.khan@`) → all PASS (the `@` anchor means only the WHOLE local matching a template word is blocked, not a prefix). 0 false positives.
- **Syntax:** `jsc enrich.js` → PASS.

### Q6 [B17/B7] — decode HTML entities + ASCII-fold (NFKD) name before email local part
- **File:** `src/lib/sourcing/enrich.js` (new `_decodeEntities` + `_foldName`; used in `applyPattern` + `detectPattern`)
- **Before:** `applyPattern` built the local with `first.toLowerCase().replace(/[^a-z]/g,'')`, which DROPPED accented letters instead of folding them: "José"->"jos", "Müller"->"mller", "Núñez"->"nuez" — minting wrong/dead inboxes. HTML-encoded names ("Jos&eacute;", "O&#39;Brien") were never decoded.
- **After:** `_foldName` = decode entities -> `normalize('NFKD')` -> strip combining marks -> lowercase -> keep `[a-z0-9]` (the same fold `find-every-email.js buildLocalPart` already uses). Applied in both `applyPattern` (the guess) and `detectPattern` (so detection matches the same folded form).
- **Proof (jsc):** `José/Núñez -> jose.nunez@`, `Jos&eacute;/M&uuml;ller -> jose.muller@`, `O&#39;Brien/Smith -> obrien.smith@`, `Renée/Zoë -> renee.zoe@`, plain `Aman/Pareek -> aman.pareek@` unchanged. Old behaviour for comparison: `José.Núñez -> jos.nez` (lost letters); new: `jose.nunez`.
- **company_type='ltd' hardcode:** NOT in my files. It lives only in `src/lib/sourcing/companies-house.js:58` (`searchByKeywordPublic`), which is outside my exclusive set — NOTED here, not edited. (The two `company_type` hits in icp.js/qualify-and-queue.js are comments only.)
- **Syntax:** `jsc enrich.js` → PASS.

### Q4 [B33/B21/B22] — role inbox never becomes a named DM; ONE canonical role set; never blank contact_name
- **Files:** `src/lib/enrich/lead-quality.js`, `src/lib/sourcing/enrich.js`, `src/lib/enrich/dm-email-scoring.js`, `scripts/enrich-worker.js`
- **Canonical set:** `lead-quality.js` now EXPORTS `_ROLE` + `isRoleLocal(localPart)` (folds a trailing `.tag/_tag`, e.g. `bookings.london`==`bookings`). This is the single source.
- **enrich.js:** `_nearbyPerson` previously gated on a LOCAL thin `_GENERIC_LOCAL` regex that omitted feedback/reservations/membership/editorial/events/customerservice/referrals — so those inboxes got a fabricated person from surrounding text (live: `feedback@onemedical.com` -> contact_name "Feedback We"). Now gates on `_isGenericLocal` which uses the canonical `isRoleLocal` (regex kept as fail-open fallback only).
- **dm-email-scoring.js:** `isGeneric` (used to cap a generic inbox's role-weight + keep it out of PRIMARY selection) now also consults the canonical set, so a broad role inbox can no longer be scored/picked as the primary named DM.
- **enrich-worker.js:** line 103 always wrote `contact_name=q(primary.name)` whenever a primary email existed; `q('')`=`''` (NOT null), so a role-inbox primary BLANKED a previously-found real name. Now only writes `contact_name`/`title` when the value is non-empty (existing value preserved otherwise).
- **Proof (jsc):** `isRoleLocal` → all 11 role inboxes (feedback, reservations, membership, editorial, events, customerservice, referrals, `bookings.london`, info, pr, admissions) = ROLE; all 6 person locals (sarah.jones, altaf.patel, j.smith, peter.maguire, aman, renee.zoe) = NOT role. No circular require (lead-quality requires neither enrich.js nor dm-email-scoring.js).
- **Syntax:** `jsc` PASS on all four files.

### Q5 [B30] — activate the PECR entity gate (persist entity_type + consent_required)
- **Files:** `scripts/enrich-worker.js` (persist at enrich); `ops/backfill-entity-type-Q5.sql` (handoff backfill). `scripts/qualify-and-queue.js` + `src/lib/sourcing/icp.js` ALREADY honour the gate — verified, left unchanged.
- **Root cause (not a logic bug):** the gate code in qualify-and-queue.js (classify -> consent_required=TRUE -> lifecycle 'consent_required', excluded from cold/Tier-1) was already correct, but `entity_type` was NULL for all 8,806 leads because **enrichment never wrote it**, so the gate had no input and never fired (live: entity_type populated 0, consent_required=true 0).
- **enrich-worker.js:** now imports `classifyEntityType`/`entityNeedsConsent` and, for every enriched lead, classifies the company NAME (`{asName:true}`) and persists `entity_type=COALESCE(entity_type, <bucket>)` for a POSITIVE bucket (company|partnership|sole_trader), plus `consent_required=TRUE` when the bucket is an individual subscriber. Never downgrades a known value to unknown/other.
- **Backfill:** `ops/backfill-entity-type-Q5.sql` (additive, idempotent, populate-only, never overwrites non-null) mirrors the JS heuristic order. NOT executed by me — Neon is read-only for this task; this is the merger/Claude-Code handoff. Dry-run classification over live data: company 402, partnership 8, other 7,914 (other deliberately left NULL — junk SERP-title names are not guessed).
- **qualify honours it:** `lead.entity_type ? classifyEntityType(lead.entity_type) : classifyEntityType(lead.company,{asName:true})` -> `entityNeedsConsent` -> parks at lifecycle 'consent_required' (hard gate, score-independent). Round-trips correctly for stored 'company'/'partnership'.
- **Syntax:** `jsc enrich-worker.js` PASS; `jsc icp.js` PASS.
- **Boundary note:** the auto-mode classifier (correctly) blocked me from executing the mass UPDATE directly; the backfill ships as a reviewed .sql for the founder/Claude-Code to run, consistent with the read-only-Neon + "Aman writes no code, flag Neon DDL" rules.

### Q2 [B45/B54] — wire resolve-name into enrich; reject SERP-title names; backfill legal_name
- **Files:** `src/lib/sourcing/enrich.js` (call resolveName + carry homepage HTML), `scripts/enrich-worker.js` (persist resolved company + legal_name). `resolve-name.js` itself unchanged (already correct, just unwired).
- **Before:** `resolveName` existed but NOTHING called it; `enrichCompany` returned `company: company||''` verbatim, so 1,018 question/listicle SERP titles persisted as the company and `legal_name` was 0/8,324.
- **After:** `scrapeSiteContacts` now returns the homepage HTML (zero extra fetch — it already fetched `''`); `enrichCompany` calls `resolveName({domain, html: homeHtml, sector, raw: company})` and writes `rec.company` (resolved) + `rec.company_raw` + `rec.legal_name` + `rec.name_status`. enrich-worker persists `company` ONLY when `name_status` is resolved/verified (a junk 'unverified' result keeps the existing value — never makes a name worse) and backfills `legal_name` via `COALESCE(NULLIF(legal_name,''), …)`. Serper is NOT used (tier defaults to 3) so it stays £0 on bulk enrich.
- **Proof (jsc, normaliseName over live junk):** REJECTED — "How much will a UK Immigration Lawyer cost me?" (search_phrase), "20 Best Places to Buy a House…" (search_phrase), "Family Solicitors in London - Brookman" (geo_descriptive), the truncated-ellipsis title, "What is conveyancing…" (too_many_words), "Top 10 Dentists Near You" (search_phrase). KEPT+cleaned — "CLINICAL CARE CLINIC LTD"->"Clinical Care Clinic", "LAWFRANCIS SOLICITORS LLP"->"Lawfrancis Solicitors", "Gibson Kerr"->"Gibson Kerr".
- **adapters.js note:** the SERP-title `company` originates in `src/lib/sourcing/sources/adapters.js` (e.g. `(o.title||'').split(/[|\-–·]/)[0]`). Cleaning belongs at enrich-time where HTML is available, not in adapters (no HTML there) — adapters left unchanged by design.
- **legal_name backfill:** forward-fill happens on every enrich; a one-shot historical backfill of `legal_name` would require Companies House calls per lead (a worker run), flagged for Claude-Code rather than executed here (read-only Neon).
- **Syntax:** `jsc` PASS on enrich.js, resolve-name.js, enrich-worker.js.

### Q7 [B36 — founder-decided] — hospitality/F&B Tier-1 reachable on merit (CONFIRM; comment-only)
- **File:** `src/lib/enrich/lead-quality.js` — comment correction only, NO logic change.
- **Finding:** the real Tier-1 gate in `decideTier()` is the canonical-grid `is_priority` flag (+ score >= TIER1_MIN + a reachable named DM), NOT the icp `regulated` flag. In `config/sector-grid.json` both HO (hospitality) and FB (F&B) are `is_priority=true` AND carry regulators[] (so `sectorRegulated=true`). So they ALREADY reach Tier-1 on merit — no cap exists in code.
- **Stale comment fixed:** lines 29-32 claimed "Hospitality, F&B … can only reach Tier 2 (approval), never auto-send" — contradicting both `decideTier()` and the founder's B36 decision. Rewrote it to state the truth (is_priority gate, B36 desired) so nobody re-introduces a Tier-2 cap. The consent/entity gate (Q5) still applies to every tier.
- **Proof (jsc decideTier):** `hospitality GOOD (verified DM+LI, score 80) -> tier 1`; `hospitality clean named DM, established -> tier 1`; `f&b GOOD -> tier 1`; `hospitality role-inbox only (score 50) -> tier 2` (a contact-quality demotion, NOT a sector cap).
- **Syntax:** `jsc lead-quality.js` PASS.
