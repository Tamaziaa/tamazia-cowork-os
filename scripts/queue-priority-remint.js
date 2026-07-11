'use strict';
// E-217 (v22.5): PRIORITY-SECTOR REMINT QUEUE (founder-authorised GATE-REMINT, 11 Jul session).
// Queues live-but-unverified audits in the priority sectors for a fresh v22.5 mint, paced in batches so the
// crawl budget and free LLM tiers are never saturated. E-204 supersede keeps exactly one live row per domain
// when the fresh mint lands; until then the renderer's truth-filtered view covers the old page.
// Usage: node scripts/queue-priority-remint.js [--watchlist] [--batch=40] [--dry]
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) { console.error('no NEON_URL'); process.exit(1); }
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).toString().trim(); } catch (e) { console.error('pg error: ' + String(e).slice(0, 200)); return ''; }
}
const args = process.argv.slice(2);
const watchlist = args.includes('--watchlist');
const dry = args.includes('--dry');
const batch = Math.max(1, Number((args.find((a) => a.startsWith('--batch=')) || '').split('=')[1] || 40));

// The ten-domain watch list + eight-firm legal/healthcare matrix (AUDIT-ENGINE-CURRENT-STATE §7) = the canary set.
const WATCH = [
  'finsbury-associates.com', 'fichtelegal.com', 'abspartners.ae', 'masecoprivatewealth.com', 'connells.co.uk',
  'ahdubai.com', 'lvproperty.co.uk', 'maguirejackson.com', 'brookswm.co.uk', 'gtag.ae',
  'russell-cooke.co.uk', 'whitneymoore.ie', 'goulstonstorrs.com', 'bsalaw.com',
  'pallmallmedical.co.uk', 'beaconhospital.ie', 'carbonhealth.com', 'medcare.ae',
];
const PRIORITY_SECTORS = "('law-firms','barristers','legal','healthcare','dental','aesthetic','aesthetics','pharmacy','telemedicine','care-homes','hospitality','real-estate','finance','fintech','insurance','wealth','accounting')";
const PRIORITY_COUNTRIES = "('UK','US','AE','SA','QA','IE','FR','DE','ES','IT','NL','BE','EU')";

if (watchlist) {
  // minting_queue carries a UNIQUE(domain) constraint, so a previously-minted domain must be RE-ARMED in place
  // (ON CONFLICT), never re-inserted. A row currently pending/minting is left untouched.
  const sql = `INSERT INTO minting_queue (domain, source, status, priority)
    VALUES ${WATCH.map((d) => `('${d}','remint-v22.5-canary','pending',2)`).join(',')}
    ON CONFLICT (domain) DO UPDATE SET
      status='pending', source=EXCLUDED.source, priority=EXCLUDED.priority,
      retries=0, error=NULL, claimed_at=NULL, enqueued_at=now()
    WHERE minting_queue.status NOT IN ('pending','minting')
    RETURNING domain`;
  if (dry) { console.log('[dry] would queue watchlist: ' + WATCH.join(', ')); process.exit(0); }
  const out = pg(sql);
  console.log('[remint] canary watchlist queued/re-armed: ' + (out ? out.split('\n').filter(Boolean).length : 0) + ' domains\n' + out);
} else {
  const sel = `SELECT ap.domain FROM audit_pages ap
    WHERE ap.status='live' AND ap.verified IS NOT TRUE
      AND ap.sector IN ${PRIORITY_SECTORS} AND ap.country IN ${PRIORITY_COUNTRIES}
      AND NOT EXISTS (SELECT 1 FROM minting_queue q WHERE q.domain = ap.domain AND q.status IN ('pending','minting'))
      AND NOT EXISTS (SELECT 1 FROM audit_pages ap2 WHERE ap2.domain = ap.domain AND ap2.verified IS TRUE AND ap2.status='live')
    ORDER BY (ap.country='UK') DESC, ap.generated_at DESC LIMIT ${batch}`;
  if (dry) { console.log(pg(sel) || '(none)'); process.exit(0); }
  const sql = `INSERT INTO minting_queue (domain, sector, country, lead_id, source, status, priority)
    SELECT ap.domain, ap.sector, ap.country, ap.lead_id, 'remint-v22.5', 'pending', 1 FROM audit_pages ap
    WHERE ap.status='live' AND ap.verified IS NOT TRUE
      AND ap.sector IN ${PRIORITY_SECTORS} AND ap.country IN ${PRIORITY_COUNTRIES}
      AND NOT EXISTS (SELECT 1 FROM minting_queue q WHERE q.domain = ap.domain AND q.status IN ('pending','minting'))
      AND NOT EXISTS (SELECT 1 FROM audit_pages ap2 WHERE ap2.domain = ap.domain AND ap2.verified IS TRUE AND ap2.status='live')
    ORDER BY (ap.country='UK') DESC, ap.generated_at DESC LIMIT ${batch}
    ON CONFLICT (domain) DO UPDATE SET
      status='pending', source=EXCLUDED.source, priority=EXCLUDED.priority,
      sector=EXCLUDED.sector, country=EXCLUDED.country, lead_id=COALESCE(EXCLUDED.lead_id, minting_queue.lead_id),
      retries=0, error=NULL, claimed_at=NULL, enqueued_at=now()
    WHERE minting_queue.status NOT IN ('pending','minting')
    RETURNING domain`;
  const out = pg(sql);
  const n = out ? out.split('\n').filter(Boolean).length : 0;
  console.log('[remint] queued ' + n + ' priority-sector domains (batch=' + batch + ')');
  const left = pg(`SELECT count(*) FROM audit_pages ap WHERE ap.status='live' AND ap.verified IS NOT TRUE AND ap.sector IN ${PRIORITY_SECTORS} AND ap.country IN ${PRIORITY_COUNTRIES}`);
  console.log('[remint] remaining unverified live priority rows: ' + left);
}
