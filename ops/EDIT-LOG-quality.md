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
