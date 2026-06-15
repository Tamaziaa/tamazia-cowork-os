-- ops/nocodb-lead-review.sql  (LLM-RESCUE · review surface)
-- The "Lead Review" grid that backs the human Accept / Reject / Add-info loop (LLM-QA-DESIGN.md flow step 3).
-- OUTPUT-ONLY: this file is the DDL for the FOUNDER / COORDINATOR to apply — the build agent does NOT execute it
-- (no DDL run by the agent; any new Neon object is delivered as SQL, per the standing rules). Apply with the
-- engine/owner role:
--   psql "$NEON_URL" -f ops/nocodb-lead-review.sql
--
-- SAFE + ADDITIVE: one CREATE OR REPLACE VIEW (a read-only lens over `leads` — creates/owns nothing else, copies
-- no rows) plus a column-scoped GRANT block left COMMENTED for the coordinator to apply after setting a password.
-- It touches NONE of the OFF-LIMITS families (audit_*/compliance_*/framework_*/classifier_*/pointer_*/scanner_cache)
-- and writes no data row. Mirrors the established pattern in ops/nocodb-layers-2-4.sql.

-- ===========================================================================
-- THE REVIEW VIEW (read-only lens) — what the founder filters + sorts + reads.
-- ===========================================================================
-- Filtered to the leads the LLM pass actually touched (rescued / flagged / explained / anything with a verdict to
-- act on), so the grid is the WORK QUEUE, not the whole 8.8k table. Ordered by qa_confidence (highest-confidence
-- rescues first = quickest founder wins), then tier and score. lead_ref (TZ-000001) is the stable human key that
-- makes manual progress + Excel round-trips resumable.
--
-- Columns are EXACTLY the spec set: lead_ref, company, sector, tier, quality_score, qa_reason, qa_suggested_tier,
-- qa_found, review_status, review_note  (+ a few read-only context columns the founder needs to judge: domain,
-- the named contact / email / linkedin the rescue is about, qa_confidence, qa_status, qa_model, qa_checked_at).
CREATE OR REPLACE VIEW v_lead_review AS
SELECT
  l.lead_ref,                                                  -- TZ-000001 human key (stable, resumable)
  l.company,
  COALESCE(NULLIF(l.sector,''), NULLIF(l.sector_code,''))      AS sector,
  l.icp_tier                                                   AS tier,
  l.quality_score,
  l.qa_reason,                                                 -- one-line: what was found / what is still missing
  l.qa_suggested_tier,                                         -- the tier the LLM argues for (with found data)
  l.qa_found,                                                  -- jsonb {company,dm_name,dm_role,email,linkedin_url,evidence}
  l.review_status,                                             -- EDITABLE: unreviewed/accepted/rejected/needs_info
  l.review_note,                                               -- EDITABLE: founder note (re-enrich hint on needs_info)
  -- read-only context to help the founder decide (not edited here):
  l.domain,
  l.contact_name,
  COALESCE(NULLIF(l.contact_email,''), l.primary_email)        AS dm_email,
  l.contact_linkedin,
  l.qa_confidence,
  l.qa_status,
  l.qa_model,
  l.qa_checked_at,
  l.id                                                         AS lead_id   -- numeric key NocoDB uses to locate the row to UPDATE
FROM leads l
WHERE
  -- the LLM pass touched this lead (rescued / flagged / explained), OR there is a pending verdict to act on, OR a
  -- founder already started reviewing it. Excludes the untouched backlog so the grid is the live work queue.
  COALESCE(l.qa_status,'') IN ('rescued','flagged','explained','confirmed','pending')
  OR COALESCE(l.review_status,'') <> ''
ORDER BY
  -- highest-confidence rescues first (quick wins), then suggested-tier, then current tier + score.
  COALESCE(l.qa_confidence,0) DESC,
  COALESCE(l.qa_suggested_tier, 9) ASC,
  COALESCE(l.icp_tier, 9) ASC,
  COALESCE(l.quality_score,0) DESC;

-- Make the view readable by the read-only dashboard role (the role that creates the view owns it; the cloud tools
-- connect as tamazia_ro). Harmless to skip if the role does not exist on this DB.
GRANT SELECT ON v_lead_review TO tamazia_ro;
-- GRANT SELECT ON v_lead_review TO metabase_ro;   -- uncomment if metabase_ro exists


-- ===========================================================================
-- EDITABLE WRITE-BACK — the nocodb_editor role, column-scoped to the TWO review cells.
-- ===========================================================================
-- WHY edit the base table, not the view: NocoDB writes through to a base table reliably; an editable VIEW is not
-- universally updatable. So the editable grid in NocoDB is built on the `leads` TABLE via a SECOND data source
-- (the nocodb_editor role below), with the table's column visibility trimmed to the review columns and FILTERED to
-- the same set as v_lead_review (filter: qa_status IN (...) OR review_status <> ''). The read-only v_lead_review
-- above backs the reporting/funnel lenses. Both key on lead_ref so the founder can jump between them and resume.
--
-- The role can SELECT leads (to show + locate rows) and UPDATE EXACTLY TWO COLUMNS — review_status and review_note
-- — and nothing else. It is physically incapable of changing tiers, scores, audit URLs, lawful_basis, send state,
-- or any OFF-LIMITS table. apply-review.js (the engine job) then reads review_status and does the actual promotion
-- under the deterministic + consent gate (the editor role never writes icp_tier itself).
--
-- review_status values the founder sets (apply-review.js acts on the first four):
--   'accepted'   -> promote to qa_suggested_tier (still consent-gated)
--   'rejected'   -> park out of the cold path
--   'needs_info' -> re-enrich using review_note as a hint, then re-qualify + re-rescue
--   'unreviewed' -> (default for flagged/medium-confidence) leave for later
--   (the LLM may also set 'auto_promote' for high-confidence gate-passing rescues; apply-review re-checks the gate.)
--
-- COORDINATOR RUNS THIS ONCE (set a strong password first; keep it out of git/shell history):
--   1. CREATE ROLE nocodb_editor LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';   -- openssl rand -base64 24
--   2. ALTER ROLE nocodb_editor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
--   3. GRANT CONNECT ON DATABASE neondb TO nocodb_editor;       -- confirm db name: SELECT current_database();
--   4. GRANT USAGE ON SCHEMA public TO nocodb_editor;
--   5. GRANT SELECT ON leads TO nocodb_editor;                  -- read rows to show + locate them
--   6. GRANT SELECT ON v_lead_review TO nocodb_editor;          -- so the editor source can also read the lens
--   7. GRANT UPDATE (review_status, review_note) ON leads TO nocodb_editor;   -- the ONLY write it has, two cells
--
-- If nocodb_editor ALREADY EXISTS (it was created for ops/nocodb-layers-2-4.sql with status/dnc_reason), you only
-- need to EXTEND its column grant — it is additive:
--   GRANT UPDATE (review_status, review_note) ON leads TO nocodb_editor;
--
-- Uncomment to apply (replace the password first; skip steps 1-2 if the role already exists):
-- CREATE ROLE nocodb_editor LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
-- ALTER ROLE nocodb_editor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
-- GRANT CONNECT ON DATABASE neondb TO nocodb_editor;
-- GRANT USAGE ON SCHEMA public TO nocodb_editor;
-- GRANT SELECT ON leads TO nocodb_editor;
-- GRANT SELECT ON v_lead_review TO nocodb_editor;
-- GRANT UPDATE (review_status, review_note) ON leads TO nocodb_editor;
--
-- VERIFY (prove the scope; run as the role):
--   SET ROLE nocodb_editor;
--   SELECT count(*) FROM v_lead_review;                                  -- OK (SELECT granted)
--   UPDATE leads SET review_status='accepted' WHERE id = <a_test_id>;    -- OK (granted column)
--   UPDATE leads SET review_note='looks good' WHERE id = <a_test_id>;    -- OK (granted column)
--   UPDATE leads SET icp_tier = 1 WHERE id = <a_test_id>;                -- MUST ERROR: permission denied for column
--   INSERT INTO leads (company) VALUES ('x');                           -- MUST ERROR: no INSERT
--   RESET ROLE;
--
-- TO REVOKE LATER (retire review write-back; leaves status/dnc_reason grant intact):
--   REVOKE UPDATE (review_status, review_note) ON leads FROM nocodb_editor;


-- ===========================================================================
-- EXCEL EXPORT / IMPORT (NocoDB native) — resumable by lead_ref.
-- ===========================================================================
-- EXPORT: in NocoDB, the v_lead_review grid (or the editable leads view filtered to the review set) -> "Download"
--   -> CSV/XLSX. The founder reviews offline in Excel, filling the review_status + review_note columns.
-- IMPORT (write-back of the offline edits): NocoDB "Upload" / "Import" into the EDITABLE leads view, mapping on
--   lead_ref (the stable key) as the match column so existing rows UPDATE (not duplicate). Only review_status and
--   review_note are writable by nocodb_editor, so an import can only ever change those two cells — the same safety
--   property as inline edits. Because lead_ref is unique and zero-padded, a partial review is fully resumable: the
--   founder can stop, export the remaining 'unreviewed' rows, finish in Excel, and re-import by lead_ref.
-- The engine then picks up the new review_status values on the next apply-review.js run (cycle step, default OFF
-- until LLM_QA_ENABLED). lead_ref also lets "till which lead I have reviewed" be answered: ORDER BY lead_ref and
-- look for the last non-'unreviewed' row.
