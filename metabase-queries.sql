-- Tamazia agency tracking — Metabase question SQL (Neon read-only role). Paste each block as a new
-- Native SQL question, then add to a dashboard. "Record of everything" in one place.
-- Pipeline order: scrape-all → enrich-worker → qualify (tier) → Tier-1 auto-mint+send / Tier-2 approve → push.

-- =====================================================================================================
-- 1. FUNNEL BY TIER (the headline). Counts at every stage + the two tiers.
-- =====================================================================================================
SELECT
  count(*)                                                                AS sourced,
  count(*) FILTER (WHERE enriched_at IS NOT NULL)                         AS enriched,
  count(*) FILTER (WHERE primary_email IS NOT NULL AND primary_email <> '') AS has_decision_maker_email,
  count(*) FILTER (WHERE email_verified)                                  AS verified_email,
  count(*) FILTER (WHERE icp_tier = 1)                                    AS tier1_core,
  count(*) FILTER (WHERE icp_tier = 2)                                    AS tier2_stretch,
  count(*) FILTER (WHERE icp_tier = 3)                                    AS tier3_reject,
  count(*) FILTER (WHERE lifecycle_stage = 'pending_approval')            AS awaiting_approval,
  count(*) FILTER (WHERE approved_at IS NOT NULL)                         AS approved,
  count(*) FILTER (WHERE audit_url IS NOT NULL AND audit_url <> '')       AS minted,
  count(*) FILTER (WHERE mystrika_pushed)                                 AS pushed_to_outreach,
  count(*) FILTER (WHERE replied)                                         AS replied
FROM leads
WHERE COALESCE(lead_type,'') NOT IN ('investor','institution','internal');

-- =====================================================================================================
-- 2. TIER-2 PENDING-APPROVAL QUEUE (the founder's daily action list). Mirror of approve-leads.js.
-- =====================================================================================================
SELECT id, COALESCE(company, domain) AS firm, sector, quality_score,
       COALESCE(primary_email, contact_email) AS decision_maker_email,
       decision_maker_confidence AS dm_conf,
       COALESCE(personalisation_pointers->>'top_finding', top_finding) AS top_finding,
       sourced_at
FROM leads
WHERE icp_tier = 2 AND COALESCE(lifecycle_stage,'') = 'pending_approval'
ORDER BY quality_score DESC NULLS LAST, id DESC;

-- =====================================================================================================
-- 3. PER-SOURCE YIELD & COST — which scraper produces fit leads, and what it costs (incl. Apify $).
-- =====================================================================================================
SELECT COALESCE(NULLIF(platform,''), source, 'unknown') AS lead_source,
       count(*)                                  AS leads,
       count(*) FILTER (WHERE icp_tier = 1)      AS tier1,
       count(*) FILTER (WHERE icp_tier = 2)      AS tier2,
       round(100.0 * count(*) FILTER (WHERE icp_tier = 1) / NULLIF(count(*),0), 1) AS tier1_pct
FROM leads
WHERE sourced_at > now() - interval '30 days'
GROUP BY 1 ORDER BY leads DESC;

-- 3b. Spend month-to-date by source (Apify enrichment, Apify creator crawl, any keyed APIs).
SELECT source, round(sum(units)::numeric, 2) AS spend_or_units, count(*) AS calls
FROM cost_ledger
WHERE run_at >= date_trunc('month', now())
GROUP BY source ORDER BY spend_or_units DESC;

-- =====================================================================================================
-- 4. EMAIL COVERAGE — verified decision-maker rate + WHERE the winning email came from (source mix).
-- =====================================================================================================
SELECT COALESCE(NULLIF(primary_email_source,''), 'none') AS dm_email_source,
       count(*)                              AS leads,
       count(*) FILTER (WHERE email_verified) AS verified,
       round(100.0 * count(*) FILTER (WHERE email_verified) / NULLIF(count(*),0), 1) AS verified_pct,
       round(avg(decision_maker_confidence), 0) AS avg_conf
FROM leads
WHERE enriched_at IS NOT NULL
GROUP BY 1 ORDER BY leads DESC;

-- =====================================================================================================
-- 5. AUDITS / DAY + queue depth (throughput toward 2,000–3,000/day).
-- =====================================================================================================
SELECT date_trunc('day', minted_at) AS day, count(*) AS audits_minted
FROM minting_queue WHERE status = 'done' AND minted_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
-- 5b. Live queue health
SELECT status, count(*) FROM minting_queue GROUP BY status ORDER BY 2 DESC;

-- =====================================================================================================
-- 6. OUTREACH OUTCOMES — primary vs the whole prospect set, replies, bookings (per sector).
-- =====================================================================================================
SELECT COALESCE(sector,'?') AS sector,
       count(*) FILTER (WHERE mystrika_pushed)                 AS pushed,
       count(*) FILTER (WHERE replied)                         AS replied,
       count(*) FILTER (WHERE lifecycle_stage = 'won')         AS won,
       round(100.0 * count(*) FILTER (WHERE replied) / NULLIF(count(*) FILTER (WHERE mystrika_pushed),0), 1) AS reply_pct
FROM leads GROUP BY 1 ORDER BY pushed DESC;
