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
