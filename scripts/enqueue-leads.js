#!/usr/bin/env node
'use strict';
// Enqueue qualified, not-yet-minted leads into minting_queue (deduped by domain). The mint-worker
// drains the queue. Idempotent: skips domains already queued or already minted (lead has audit_url).
//   node scripts/enqueue-leads.js [limit]      # default 500
const { execFileSync } = require('child_process');
const path = require('path');
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
function pg(sql) { return execFileSync(path.join(__dirname, 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }); }

(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  const limit = Math.max(1, parseInt(process.argv[2] || '500', 10));
  // Pick fit leads with a real domain, not yet minted (no audit_url) and not already queued.
  // country hint = best-effort from jurisdiction text; the engine still auto-detects from the live site.
  const sql = `INSERT INTO minting_queue (domain, company, sector, country, lead_id, status, priority)
    SELECT DISTINCT ON (lower(l.domain))
      l.domain, l.company,
      -- DATA-CONTRACT FIX: the V3 re-tier path (requalify-all-leads.js, run by v3-rerun/backlog-burst)
      -- writes sector_code and leaves the legacy sector column blank. ~6.2k leads currently have a real
      -- sector_code but an empty sector, so reading sector alone mints them all as general. Fall back to
      -- sector_code (then filter_key) so the minted audit speaks the lead real sector.
      COALESCE(NULLIF(l.sector,''), NULLIF(l.sector_code,''), NULLIF(l.filter_key,''), 'general'),
      CASE
        WHEN l.jurisdiction ILIKE '%emirat%' OR l.jurisdiction ILIKE '%uae%' OR l.jurisdiction ILIKE '%dubai%' THEN 'UAE'
        WHEN l.jurisdiction ILIKE '%united states%' OR l.jurisdiction ILIKE '%usa%' OR l.jurisdiction ILIKE '% us %' THEN 'USA'
        ELSE 'UK' END,
      l.id, 'pending',
      CASE WHEN l.icp_tier = 1 THEN 1 ELSE 2 END
    FROM leads l
    WHERE l.domain IS NOT NULL AND l.domain <> ''
      AND COALESCE(l.quality_fit, false) = true
      AND (l.audit_url IS NULL OR l.audit_url = '')
      AND COALESCE(l.status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
      AND COALESCE(l.dormant,false) = false
      AND NOT EXISTS (SELECT 1 FROM minting_queue q WHERE lower(q.domain) = lower(l.domain))
    ORDER BY lower(l.domain), l.priority_score DESC NULLS LAST, l.id
    LIMIT ${limit}
    ON CONFLICT (domain) DO NOTHING;`;
  pg(sql);
  const pending = (pg(`SELECT count(*) FROM minting_queue WHERE status='pending';`) || '').trim();
  const total = (pg(`SELECT count(*) FROM minting_queue;`) || '').trim();
  console.log(`enqueue-leads: queue total=${total} pending=${pending}`);
})().catch(e => { console.error('enqueue error (non-fatal):', e.message); process.exit(0); });
