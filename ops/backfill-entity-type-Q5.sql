-- Q5 [B30] — PECR entity-gate backfill (ADDITIVE, idempotent, populate-only).
-- Run ONCE post-merge (psql "$NEON_URL" -f ops/backfill-entity-type-Q5.sql) by Claude Code / the merger.
-- I (FIX AGENT ENG-A) did NOT execute this — Neon is read-only for this task; this is the handoff artifact.
--
-- WHY: entity_type was NULL for all 8,806 leads and consent_required=false for all of them, so the qualifier's
-- PECR consent gate (qualify-and-queue.js, already correct) never fired. enrich-worker.js now PERSISTS entity_type
-- for every newly-enriched lead; this backfills the existing rows so the column is truthful immediately and
-- already-scored leads (which the qualifier skips) also carry it.
--
-- Mirrors src/lib/sourcing/icp.js classifyEntityType({asName:true}) order: LLP/LP = corporate (company);
-- ordinary "& Partners"/partnership = individual (partnership); other limited/corp suffix = company; else leave
-- NULL (an unreliable junk SERP-title name must NOT be guessed — the next enrich/qualify pass will classify it).
-- NEVER overwrites a non-null entity_type (a CH-typed source value wins). Dry-run before this gave: company 402,
-- partnership 8, other 7,914 (other is intentionally not persisted).

BEGIN;

UPDATE leads l SET entity_type = b.bucket
FROM (
  SELECT id,
    CASE
      WHEN lower(COALESCE(company,'')) ~ '(\mllp\M|limited liability partnership|limited partnership)' THEN 'company'
      WHEN lower(COALESCE(company,'')) ~ '((&|\mand\M)\s+partners\M|\mpartnership\M)'                    THEN 'partnership'
      WHEN lower(COALESCE(company,'')) ~ '(\mltd\M|\mlimited\M|\mplc\M|\minc\M|incorporated|\mcorp\M|corporation|\mllc\M|pllc|gmbh|\mag\M|\msrl\M|\mbv\M|\mpty\M|\mcompany\M|\mco\M$|\mgroup\M|holdings|chambers|solicitors|& co|\mand co\M)' THEN 'company'
      ELSE NULL
    END AS bucket
  FROM leads WHERE COALESCE(domain,'') <> ''
) b
WHERE l.id = b.id AND b.bucket IS NOT NULL AND l.entity_type IS NULL;

-- Individual subscribers (sole trader / ordinary partnership) need consent → flag them out of the cold path.
-- (Companies + LLPs stay consent_required=false; the qualifier already excludes the flagged ones.)
UPDATE leads SET consent_required = TRUE
WHERE entity_type IN ('partnership','sole_trader') AND consent_required IS DISTINCT FROM TRUE;

COMMIT;

-- Verify:
--   SELECT COALESCE(entity_type,'(null)') et, count(*), count(*) FILTER (WHERE consent_required) consent
--   FROM leads GROUP BY 1 ORDER BY 2 DESC;
