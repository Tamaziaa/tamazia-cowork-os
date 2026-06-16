-- 2026-06-16 — capacity funnel view (ADDITIVE, read-only). One row: the live pipeline funnel from sourced ->
-- mystrika_pushed, plus the DB "ready pool" (claude_cleared + audit_verified + not pushed = the drain queue the
-- capacity-aware push pulls from). Lets the cockpit / NocoDB / Metabase read the funnel without running node. No
-- table is created or altered; this only adds a VIEW over `leads`. icp_tier is smallint (1 = Tier-1).
CREATE OR REPLACE VIEW v_capacity_funnel AS
SELECT
  count(*)                                                                                          AS total_sourced,
  count(*) FILTER (WHERE icp_tier = 1)                                                              AS tier1,
  count(*) FILTER (WHERE quality_fit)                                                               AS quality_fit,
  count(*) FILTER (WHERE lifecycle_stage = 'qualified')                                             AS qualified,
  count(*) FILTER (WHERE lifecycle_stage = 'pending_approval')                                      AS pending_approval,
  count(*) FILTER (WHERE governor_released_at IS NOT NULL)                                          AS governor_released,
  count(*) FILTER (WHERE COALESCE(audit_verified, FALSE))                                           AS audit_verified,
  count(*) FILTER (WHERE COALESCE(claude_cleared, FALSE))                                           AS claude_cleared,
  count(*) FILTER (WHERE COALESCE(mystrika_pushed, FALSE))                                          AS mystrika_pushed,
  count(*) FILTER (WHERE COALESCE(claude_cleared, FALSE)
                     AND COALESCE(audit_verified, FALSE)
                     AND NOT COALESCE(mystrika_pushed, FALSE))                                      AS db_ready_pool,
  now() AT TIME ZONE 'UTC'                                                                          AS as_of_utc
FROM leads;

-- Per-sector drain pool (which sector campaigns have cleared, audit-ready leads waiting to be loaded to Mystrika).
CREATE OR REPLACE VIEW v_ready_pool_by_sector AS
SELECT
  COALESCE(NULLIF(sector, ''), NULLIF(sector_code, ''), '(none)') AS sector,
  count(*)                                                        AS ready_count
FROM leads
WHERE COALESCE(claude_cleared, FALSE)
  AND COALESCE(audit_verified, FALSE)
  AND NOT COALESCE(mystrika_pushed, FALSE)
GROUP BY 1
ORDER BY 2 DESC;
