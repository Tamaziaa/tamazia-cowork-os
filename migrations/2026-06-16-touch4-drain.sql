-- 2026-06-16 — touch-4 drain (D1 cadence revert). ADDITIVE / non-destructive. DO NOT auto-run.
-- =====================================================================================================
-- WHY: D1 reverts the founder-locked cadence to EXACTLY 4 touches at days [0,3,10,21], then recycle.
-- A prior PR (#50) wrongly added a 5th touch ([0,3,7,12,19], touch 4 = the +19d "breakup"). Under #50,
-- after touch 3 sent, send-due.js advanced a lead to status='touch_4_queued' and S064 render.js minted a
-- 5th draft (outreach_drafts.draft_metadata->>'touch' = '4').
--
-- After the revert (send-due.js LAST_TOUCH=3, render.js renders only touches 0-3):
--   * A lead left at status='touch_4_queued' still matches pickDueDrafts' `status LIKE 'touch_%_queued'`
--     filter, but getDraftForTouch(lead, 4) finds no pending touch-4 draft, so the lead STALLS — it is
--     never sent (correct: SEND is OFF and there is no touch 4) but also never marked cadence_complete,
--     so recycle.js never parks/re-enters it. This migration drains those rows to 'cadence_complete' so
--     they flow into the recycle path exactly as a completed 4-touch cadence would.
--   * Any pending touch-4 draft minted by #50 is now orphaned (nothing will ever send it). We mark it
--     'superseded_cadence_revert' so it leaves the pending queue and can never be picked up.
--
-- SAFETY:
--   * SEND stays OFF (SEND_ENABLED master gate) regardless of this migration. This only fixes lead STATE.
--   * Touches ONLY the SHARED `leads` table (status/next_touch_date/updated_at columns — no rename/drop,
--     no new columns) and `outreach_drafts` (send_status only). It does NOT touch any DO-NOT-TOUCH table
--     (audit_*/compliance_*/framework_*/classifier_*/pointer_*/scanner_cache).
--   * Idempotent: re-running changes nothing once no 'touch_4_queued' lead / pending touch-4 draft remains.
--   * Wrapped in a transaction; the trailing SELECTs report the affected counts (0/0 on a clean DB).
--
-- COORDINATOR: apply manually (psql <NEON_URL> -f migrations/2026-06-16-touch4-drain.sql) AFTER the D1
-- code (branch v6-d1-cadence) is merged/deployed, so no run can re-create a touch_4_queued row. Until then
-- this is a no-op on most DBs (live data may have 0 such rows because SEND has never been on).
-- =====================================================================================================

BEGIN;

-- 1) Drain leads stranded at the (now non-existent) 5th touch into the completed-cadence state so the
--    recycle path treats them like any finished 4-touch lead. Do NOT move next_touch_date for any other
--    touch — only the touch_4_queued rows. last_reply_received_at is left untouched.
UPDATE leads
   SET status = 'cadence_complete',
       next_touch_date = NULL,
       updated_at = NOW()
 WHERE status = 'touch_4_queued';

-- 2) Retire any orphaned touch-4 drafts (#50 rendered these) so they leave the pending queue. Use a
--    distinct terminal send_status so they are auditable and never re-selected. (outreach_drafts has no
--    updated_at column — do not reference one.)
UPDATE outreach_drafts
   SET send_status = 'superseded_cadence_revert'
 WHERE channel = 'email'
   AND draft_metadata->>'touch' = '4'
   AND send_status IN ('pending', 'sending');

-- 3) Report (counts the rows now in the drained/retired terminal states; both 0 on a clean DB).
SELECT 'leads_drained_to_cadence_complete' AS metric,
       COUNT(*) FILTER (WHERE status = 'cadence_complete') AS value
  FROM leads
 WHERE status = 'cadence_complete';

SELECT 'touch4_drafts_superseded' AS metric,
       COUNT(*) AS value
  FROM outreach_drafts
 WHERE channel = 'email'
   AND send_status = 'superseded_cadence_revert';

-- Safety net: confirm NO lead remains queued for a 5th touch after this migration (expected 0).
SELECT 'leads_still_touch_4_queued' AS metric,
       COUNT(*) AS value
  FROM leads
 WHERE status = 'touch_4_queued';

COMMIT;
