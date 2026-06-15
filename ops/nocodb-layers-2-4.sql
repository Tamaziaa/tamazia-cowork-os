-- ops/nocodb-layers-2-4.sql  (P3-2)
-- NocoDB Layers 2-4 as portable, read-only SQL. Layer 1 (the live NocoDB grid + Pipeline-by-stage funnel)
-- is already deployed (ops/nocodb-connection.md). This file is the database side of Layers 2-3 (saved
-- query / view definitions) plus the Layer-4 Editor-role GRANT. The actual NocoDB UI clicks stay a
-- documented founder/coordinator step (ops/nocodb-layers-2-4-setup.md) — this is what backs them.
--
-- SAFE + ADDITIVE: every statement below is either a CREATE OR REPLACE VIEW (a read-only lens over existing
-- tables; creates/owns nothing else and copies no rows) or a column-scoped GRANT. Nothing here writes a data
-- row, drops, or alters a table. The OFF-LIMITS families (audit_* / compliance_* / framework_* / classifier_* /
-- pointer_* / scanner_*) are NEVER read or written here.
--
-- COORDINATOR RUNS THIS (the assistant is Neon SELECT-only):
--   psql "$NEON_URL" -f ops/nocodb-layers-2-4.sql        # creates the views (owner/engine role)
-- then the Editor-role section (bottom) once, after setting a real password.
--
-- Every SELECT below was validated read-only against live Neon 2026-06-15. Column truth + the two standing
-- caveats (sends.lead_id NULL -> send attribution 'unknown'; cal_bookings empty -> bookings read 0) are in
-- ops/PRECHECK-obs.md and Tamazia-Remix/ops/observability/dashboards.md. Views are written so they tighten
-- automatically once those upstream gaps close — no edit needed here.

-- All views are prefixed v_nocodb_ so they group together in the NocoDB table list and are obviously derived.


-- ===========================================================================
-- LAYER 2 — find the work
-- ===========================================================================

-- 2a. FIT / email-ready: the send-ready queue (status touch_%_queued WITH an email present).
--     Live count today = 32. Mirrors the funnel's "email-ready".
CREATE OR REPLACE VIEW v_nocodb_fit_email_ready AS
SELECT
  l.id,
  l.company,
  l.sector,
  l.icp_tier,
  COALESCE(NULLIF(l.email,''), l.contact_email, l.primary_email) AS email,
  l.audit_url,
  l.status,
  l.quality_score,
  l.lifecycle_stage,
  l.created_at
FROM leads l
WHERE l.status LIKE 'touch_%_queued'
  AND COALESCE(NULLIF(l.email,''), l.contact_email, l.primary_email) IS NOT NULL
ORDER BY l.quality_score DESC NULLS LAST, l.id DESC;

-- 2b. FIT per sector: one row per sector with the FIT count + tier-1 count (the per-sector book of
--     actionable leads). Sort sectors by FIT volume. Group/drill the matching leads in NocoDB by `sector`.
CREATE OR REPLACE VIEW v_nocodb_fit_by_sector AS
SELECT
  COALESCE(NULLIF(l.sector,''), '(none)')                       AS sector,
  count(*) FILTER (WHERE l.quality_fit IS TRUE)                 AS fit,
  count(*) FILTER (WHERE l.quality_fit IS TRUE AND l.icp_tier=1) AS fit_tier1,
  count(*) FILTER (
    WHERE l.status LIKE 'touch_%_queued'
      AND COALESCE(NULLIF(l.email,''), l.contact_email, l.primary_email) IS NOT NULL
  )                                                              AS email_ready,
  count(*)                                                      AS total_in_sector
FROM leads l
GROUP BY 1
ORDER BY fit DESC;

-- 2c. Bookings this week: calls landing on the calendar in the current ISO week.
--     Reads 0 until the cal.com webhook writes Neon (today cal_bookings is empty) — view is correct, data pipe is the gap.
CREATE OR REPLACE VIEW v_nocodb_bookings_this_week AS
SELECT
  b.id,
  b.attendee_name,
  b.attendee_company,
  b.attendee_email,
  b.start_at,
  b.status,
  b.lead_id,
  b.outcome,
  b.next_step,
  b.next_step_due
FROM cal_bookings b
WHERE b.start_at >= date_trunc('week', now())
  AND b.start_at <  date_trunc('week', now()) + interval '7 days'
ORDER BY b.start_at ASC;


-- ===========================================================================
-- LAYER 3 — measure the machine
-- ===========================================================================

-- 3a. Scraper scorecard (activity): per-source run counts + yield over the last 7 days, from sourcing_runs.
--     This is the operational "what ran and how much did it pull" card.
CREATE OR REPLACE VIEW v_nocodb_scraper_scorecard AS
SELECT
  sr.source,
  count(*)                                       AS runs_7d,
  COALESCE(sum(sr.records_found), 0)             AS records_found_7d,
  COALESCE(sum(sr.records_new), 0)               AS records_new_7d,
  COALESCE(sum(sr.records_updated), 0)           AS records_updated_7d,
  count(*) FILTER (WHERE sr.status = 'error')    AS error_runs_7d,
  max(sr.started_at)                             AS last_run
FROM sourcing_runs sr
WHERE sr.started_at >= now() - interval '7 days'
GROUP BY sr.source
ORDER BY records_new_7d DESC, runs_7d DESC;

-- 3a'. Source yield (quality): how many FIT leads each source has ACTUALLY produced (all-time), the cross-table
--      angle NocoDB cannot express alone. Pair side-by-side with the scorecard: runs vs. the product of runs.
CREATE OR REPLACE VIEW v_nocodb_source_yield AS
SELECT
  COALESCE(NULLIF(l.source,''), '(none)')                  AS source,
  count(*)                                                 AS leads,
  count(*) FILTER (WHERE l.quality_fit IS TRUE)            AS fit,
  count(*) FILTER (WHERE l.icp_tier = 1)                   AS tier1,
  round(100.0 * count(*) FILTER (WHERE l.quality_fit IS TRUE) / nullif(count(*),0), 1) AS fit_pct
FROM leads l
GROUP BY 1
ORDER BY fit DESC, leads DESC;

-- 3b. All bookings (overview): the full booking log, newest first. Same KV caveat (reads 0 until the
--     cal webhook writes Neon). Pairs with 2c.
CREATE OR REPLACE VIEW v_nocodb_bookings_all AS
SELECT
  b.id,
  b.attendee_company,
  b.attendee_name,
  b.start_at,
  b.status,
  b.outcome,
  b.next_step,
  b.next_step_due,
  b.created_at
FROM cal_bookings b
ORDER BY b.created_at DESC;

-- After creating the views, make them readable by the read-only dashboard roles (the role that creates a view
-- owns it; the cloud tools connect as tamazia_ro / metabase_ro, so grant them SELECT explicitly). Harmless if
-- a role does not exist on this DB — comment out the line for any role you have not created.
GRANT SELECT ON
  v_nocodb_fit_email_ready,
  v_nocodb_fit_by_sector,
  v_nocodb_bookings_this_week,
  v_nocodb_scraper_scorecard,
  v_nocodb_source_yield,
  v_nocodb_bookings_all
TO tamazia_ro;
-- GRANT SELECT ON (... same list ...) TO metabase_ro;   -- uncomment if metabase_ro exists


-- ===========================================================================
-- LAYER 4 — write-back: the nocodb_editor role (mark contacted / suppress)
-- ===========================================================================
-- The Layer-1..3 connection is read-only (tamazia_ro) and CANNOT write any table — that is the safety property
-- the first rollout relies on. Write-back is a deliberate, separate, tightly-scoped step: a SECOND Neon role,
-- nocodb_editor, that can SELECT plus UPDATE EXACTLY TWO COLUMNS on leads and nothing else. NocoDB then gets a
-- SECOND data source using this role, and ONLY the two edit views are built on it. Everything else stays on the
-- read-only source.
--
-- THE TWO WRITE-BACK ACTIONS (and the exact columns they touch):
--   1. "Mark contacted" -> sets leads.status (e.g. to a 'contacted_manual' value). status is the lead's
--      lifecycle/queue column the engine already reads.
--   2. "Suppress"       -> sets leads.dnc_reason (a non-NULL reason = do-not-contact). This is the existing
--      suppression signal on leads (the engine's gates honour a populated dnc_reason).
--
-- WHY column-scoped and why these two: a blanket "GRANT UPDATE ON leads" would let a fat-fingered NocoDB edit
-- rewrite scoring, tiers, audit URLs, lawful_basis, etc. Column-scoped UPDATE means the role is physically
-- incapable of changing anything but those two cells. No write is granted on ANY other table, and never on the
-- OFF-LIMITS families.
--
-- COORDINATOR RUNS THIS ONCE (after setting a strong password; keep it out of git/shell history):
--   1. CREATE ROLE nocodb_editor LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';   -- openssl rand -base64 24
--   2. ALTER ROLE nocodb_editor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
--   3. GRANT CONNECT ON DATABASE neondb TO nocodb_editor;   -- confirm db name: SELECT current_database();
--   4. GRANT USAGE ON SCHEMA public TO nocodb_editor;
--   5. GRANT SELECT ON leads TO nocodb_editor;              -- needs to read rows to show + locate them
--   6. GRANT UPDATE (status, dnc_reason) ON leads TO nocodb_editor;   -- the ONLY write it has, two columns only
--
-- Uncomment to apply (replace the password first):
-- CREATE ROLE nocodb_editor LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
-- ALTER ROLE nocodb_editor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
-- GRANT CONNECT ON DATABASE neondb TO nocodb_editor;
-- GRANT USAGE ON SCHEMA public TO nocodb_editor;
-- GRANT SELECT ON leads TO nocodb_editor;
-- GRANT UPDATE (status, dnc_reason) ON leads TO nocodb_editor;
--
-- VERIFY (read-only; run as the role to prove the scope):
--   SET ROLE nocodb_editor;
--   SELECT count(*) FROM leads;                                    -- OK (SELECT granted)
--   UPDATE leads SET dnc_reason='test' WHERE id = <a_test_id>;     -- OK (granted column)
--   UPDATE leads SET quality_score = 0 WHERE id = <a_test_id>;     -- MUST ERROR: permission denied for column
--   INSERT INTO leads (company) VALUES ('x');                      -- MUST ERROR: no INSERT
--   RESET ROLE;
--
-- TO REVOKE LATER (retire write-back):
--   REVOKE UPDATE (status, dnc_reason) ON leads FROM nocodb_editor;
--   REVOKE SELECT ON leads FROM nocodb_editor;
--   REVOKE USAGE ON SCHEMA public FROM nocodb_editor;
--   REVOKE CONNECT ON DATABASE neondb FROM nocodb_editor;
--   DROP ROLE nocodb_editor;
