#!/usr/bin/env node
// Self-diagnostic health engine · runs the pipeline's adverse scenarios as LIVE probes every cycle.
// Writes one row per check to system_health (upsert). The cockpit "Health" tab reads this table so the
// founder sees, at a glance, what is broken now and what is about to break. Each check is isolated:
// a failing probe records status='fail' and never crashes the run.
//
// status: ok | warn | fail   (warn = needs attention soon, fail = broken now / action needed)
// Usage: node scripts/health-check.js

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ENV = {};
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
const NEON = ENV.NEON_URL || process.env.NEON_URL;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { return null; } }
function num(sql) { const r = pg(sql); return r == null || r === '' ? null : Number(r.split('\n')[0]); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const has = k => !!(ENV[k] && ENV[k].length > 3);

const results = [];
function rec(key, cat, status, detail, metric) { results.push({ key, cat, status, detail, metric: (metric == null ? null : Number(metric)) }); }
// helper: threshold check on a numeric metric (lower is better unless invert)
function band(key, cat, val, warnAt, failAt, fmt, invert) {
  if (val == null) return rec(key, cat, 'fail', 'could not read (query/table error)', null);
  const bad = invert ? val <= failAt : val >= failAt;
  const warn = invert ? val <= warnAt : val >= warnAt;
  rec(key, cat, bad ? 'fail' : warn ? 'warn' : 'ok', fmt(val), val);
}

function run() {
  // ---- INFRA ----
  const dbUp = pg('SELECT 1') === '1';
  rec('db_reachable', 'infra', dbUp ? 'ok' : 'fail', dbUp ? 'Neon Postgres responding' : 'Neon UNREACHABLE — whole engine is down', dbUp ? 1 : 0);
  if (!dbUp) { return persist(); } // nothing else works without DB

  // ---- KEYS / CREDENTIALS ----
  rec('key_neon', 'keys', has('NEON_URL') ? 'ok' : 'fail', 'Neon connection string', null);
  rec('key_serper', 'keys', has('SERPER_KEY') ? 'ok' : 'fail', has('SERPER_KEY') ? 'SERP sourcing live' : 'no SERPER_KEY — scraping is dead', null);
  rec('key_hunter', 'keys', has('HUNTER_KEY') ? 'ok' : 'warn', has('HUNTER_KEY') ? 'email finder + verifier live' : 'no Hunter — enrichment + verify degraded', null);
  const relays = ['SMTP2GO_KEY', 'BREVO_KEY', 'MAILJET_KEY', 'SENDGRID_KEY', 'RESEND_KEY'].filter(has).length;
  rec('relays_live', 'keys', relays >= 2 ? 'ok' : relays === 1 ? 'warn' : 'fail', relays + ' send relays configured', relays);
  rec('key_gmail_imap', 'keys', has('GMAIL_IMAP_APP_PASSWORD') ? 'ok' : 'warn', has('GMAIL_IMAP_APP_PASSWORD') ? 'reply intake live' : 'no Gmail app password — reply automation off', null);
  rec('key_gh_token', 'keys', has('GH_TOKEN') ? 'ok' : 'warn', has('GH_TOKEN') ? '24/7 host token present' : 'no GH_TOKEN — host not deployable', null);
  rec('key_neverbounce', 'keys', has('NEVERBOUNCE_KEY') ? 'ok' : 'warn', 'verify backstop (free verifier is primary)', null);

  // ---- FRESHNESS: is the engine actually running? ----
  band('send_freshness_h', 'liveness', num(`SELECT EXTRACT(EPOCH FROM (NOW()-MAX(sent_at)))/3600 FROM sends`), 48, 168, v => `last send ${v.toFixed(0)}h ago`);
  band('scrape_freshness_h', 'liveness', num(`SELECT EXTRACT(EPOCH FROM (NOW()-MAX(COALESCE(finished_at,started_at))))/3600 FROM scrape_runs`), 36, 96, v => `last scrape ${v.toFixed(0)}h ago`);
  band('reply_poll_freshness_h', 'liveness', num(`SELECT EXTRACT(EPOCH FROM (NOW()-MAX(last_polled_at)))/3600 FROM imap_poll_state`), 6, 48, v => `last reply poll ${v.toFixed(0)}h ago`);

  // ---- SOURCING / PIPELINE STATE ----
  band('new_leads_24h', 'sourcing', num(`SELECT COUNT(*) FROM leads WHERE created_at > NOW()-INTERVAL '24 hours'`), 1, 0, v => `${v} new leads in 24h`, true);
  band('unscored_eligible', 'quality', num(`SELECT COUNT(*) FROM leads WHERE quality_score IS NULL AND (scrape_stream='sponsored' OR (scrape_stream='organic_top100' AND verify_status='approved') OR aggressive_selected=TRUE)`), 25, 100, v => `${v} eligible leads not yet quality-scored`);
  band('organic_verify_backlog', 'sourcing', num(`SELECT COUNT(*) FROM leads WHERE scrape_stream='organic_top100' AND COALESCE(verify_status,'pending')='pending'`), 50, 200, v => `${v} organic leads awaiting manual verify`);

  // ---- SEND QUEUE / CAPACITY ----
  band('send_queue_backlog', 'send', num(`SELECT COUNT(*) FROM leads WHERE status LIKE 'touch_%_queued' AND (next_touch_date IS NULL OR next_touch_date<=CURRENT_DATE) AND COALESCE(replied,FALSE)=FALSE AND email IS NOT NULL AND email<>''`), 60, 200, v => `${v} touches due to send`);
  band('blocked_drafts', 'send', num(`SELECT COUNT(*) FROM outreach_drafts WHERE send_status LIKE 'blocked%'`), 5, 30, v => `${v} drafts blocked (spam-lint / audit-missing)`);
  band('quarantined_drafts', 'send', num(`SELECT COUNT(*) FROM outreach_drafts WHERE send_status LIKE 'QUARANTINED%'`), 10, 50, v => `${v} drafts quarantined (wrong-track/internal)`);
  band('placeholder_drafts', 'send', num(`SELECT COUNT(*) FROM outreach_drafts WHERE send_status='pending' AND (draft_body ILIKE '%[%name%]%' OR draft_body ILIKE '%{{%' OR draft_body ILIKE '%decision maker%')`), 1, 10, v => `${v} pending drafts still contain a placeholder`);

  // ---- ALIAS / SENDER HEALTH ----
  band('alias_healthy', 'alias', num(`SELECT COUNT(*) FROM aliases WHERE COALESCE(status,'')IN('healthy','warmup_only','active')`), 5, 1, v => `${v} sendable aliases`, true);
  band('alias_demoted', 'alias', num(`SELECT COUNT(*) FROM aliases WHERE COALESCE(status,'')IN('demoted','paused','blocked')`), 3, 10, v => `${v} aliases demoted/blocked on bounce/complaint`);

  // ---- DELIVERABILITY ----
  const sent = num(`SELECT COUNT(*) FROM sends`) || 0;
  const bounced = num(`SELECT COUNT(*) FROM bounce_events`) || 0;
  const br = sent > 0 ? (bounced / sent * 100) : 0;
  band('bounce_rate_pct', 'deliverability', sent > 0 ? br : null, 3, 8, v => `${v.toFixed(1)}% bounce rate (${bounced}/${sent})`);
  const sent30 = num(`SELECT COUNT(*) FROM sends WHERE sent_at > NOW()-INTERVAL '30 days'`) || 0;
  band('relay_unknown_pct', 'deliverability', sent30 > 0 ? (num(`SELECT COUNT(*) FROM sends WHERE sent_at > NOW()-INTERVAL '30 days' AND COALESCE(NULLIF(relay_used,''),NULLIF(relay_name,''),'')=''`) / sent30 * 100) : null, 50, 96, v => `${v.toFixed(0)}% of 30d sends lack relay attribution (legacy send-log gap; new router records it)`);

  // ---- REPLIES / MATCHING ----
  band('replies_unmatched', 'reply', num(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NULL`), 5, 25, v => `${v} replies could not be matched to a lead`);
  band('replies_unactioned', 'reply', num(`SELECT COUNT(*) FROM inbound_emails WHERE COALESCE(reviewed,FALSE)=FALSE AND COALESCE(classification,'') NOT IN ('BOUNCE','OOO','OPT_OUT')`), 5, 20, v => `${v} replies need you to action them`);
  band('optouts_honored', 'reply', num(`SELECT COUNT(*) FROM leads l WHERE EXISTS(SELECT 1 FROM inbound_emails ie WHERE ie.matched_lead_id=l.id AND ie.classification='OPT_OUT') AND l.status LIKE 'touch_%_queued'`), 1, 5, v => `${v} opted-out leads STILL queued to send (compliance risk)`);

  // ---- DATA QUALITY / GAPS ----
  band('audit_coverage_gap', 'data', num(`SELECT COUNT(*) FROM leads WHERE status='touch_1_queued' AND COALESCE(audit_url,'')=''`), 1, 15, v => `${v} leads at Touch 1 with no audit URL (will hard-block)`);
  band('no_contact_channel', 'data', num(`SELECT COUNT(*) FROM leads WHERE COALESCE(contact_email,'')='' AND COALESCE(all_socials::text,'{}')IN('{}','','null') AND lifecycle_stage='qualified'`), 5, 30, v => `${v} qualified leads have no reachable channel`);
  band('duplicate_domains', 'data', num(`SELECT COALESCE(SUM(c-1),0) FROM (SELECT LOWER(domain) d, COUNT(*) c FROM leads WHERE COALESCE(domain,'')<>'' AND COALESCE(status,'')<>'duplicate' GROUP BY 1 HAVING COUNT(*)>1) x`), 10, 50, v => `${v} duplicate-domain leads pending dedupe`);
  band('data_stuck_leads', 'data', num(`SELECT COUNT(*) FROM leads WHERE status LIKE 'touch_%_queued' AND next_touch_date < CURRENT_DATE - INTERVAL '5 days'`), 5, 30, v => `${v} leads stuck overdue >5 days (cadence stalled)`);
  band('test_in_send_queue', 'data', num(`SELECT COUNT(*) FROM leads WHERE status LIKE 'touch_%_queued' AND (acquisition_channel ILIKE '%test%' OR acquisition_channel ILIKE '%seed%' OR lead_type IN ('investor','institution','internal'))`), 1, 1, v => `${v} test/seed/investor leads in the send queue (must be 0 — never cold-mail test data or investors)`);
  band('sendable_real_leads', 'send', num(`SELECT COUNT(*) FROM leads l WHERE l.status LIKE 'touch_%_queued' AND COALESCE(NULLIF(l.email,''),l.contact_email,'')<>'' AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%' AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal') AND EXISTS (SELECT 1 FROM outreach_drafts od WHERE od.lead_id=l.id AND od.send_status='pending' AND od.channel='email')`), 1, 0, v => `${v} real leads ready to send (queue starved if 0)`, true);
  band('null_quality_pct', 'quality', (() => { const t = num(`SELECT COUNT(*) FROM leads WHERE COALESCE(contact_email,'')<>''`) || 1; const u = num(`SELECT COUNT(*) FROM leads WHERE COALESCE(contact_email,'')<>'' AND quality_score IS NULL`) || 0; return u / t * 100; })(), 60, 90, v => `${v.toFixed(0)}% of emailable leads unscored`);

  // ---- STAGE-LATENCY SLA (Z17-15) · the detector the 6-day stuck mint lacked ----
  // COALESCE(...,0): an EMPTY stage (no rows) yields MIN=NULL -> 0h -> healthy (NOT a false 'fail').
  band('mint_oldest_minting_h', 'sla',
    num(`SELECT COALESCE(EXTRACT(EPOCH FROM (NOW()-MIN(COALESCE(claimed_at,enqueued_at))))/3600,0) FROM minting_queue WHERE status='minting'`),
    4, 12, v => `oldest row stuck minting ${v.toFixed(1)}h (Z7-06 zombie guard)`);
  band('mint_oldest_pending_h', 'sla',
    num(`SELECT COALESCE(EXTRACT(EPOCH FROM (NOW()-MIN(enqueued_at)))/3600,0) FROM minting_queue WHERE status='pending'`),
    12, 36, v => `oldest pending mint waiting ${v.toFixed(1)}h (drain stalled)`);
  band('qual_no_audit_oldest_h', 'sla',
    num(`SELECT COALESCE(EXTRACT(EPOCH FROM (NOW()-MIN(created_at)))/3600,0) FROM leads WHERE lifecycle_stage='qualified' AND COALESCE(quality_fit,FALSE)=TRUE AND COALESCE(audit_verified,FALSE)=FALSE`),
    48, 120, v => `oldest FIT+qualified lead un-audit-verified ${v.toFixed(1)}h (mint/verify tail wedged)`);
  // enrich_claimed_at arrives with Z4-08; guard so a missing column never false-fails.
  try {
    if (pg(`SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='enrich_claimed_at'`) === '1') {
      band('enrich_oldest_claimed_h', 'sla',
        num(`SELECT COALESCE(EXTRACT(EPOCH FROM (NOW()-MIN(enrich_claimed_at)))/3600,0) FROM leads WHERE enrich_claimed_at IS NOT NULL AND enriched_at IS NULL`),
        2, 8, v => `oldest enrich claim un-completed ${v.toFixed(1)}h (crashed claim — Z4-08)`);
    }
  } catch (_e) {}

  // GAP-LEDGER #88: governor-released Tier-1 leads with no verified audit_url.
  // These are leads the governor already released (cleared to send) but mint hasn't caught up yet.
  // At >20 the mint tail is falling behind the release rate; at >50 audits are blocking sends.
  band('tier1_released_unminted', 'sla',
    num(`SELECT COUNT(*) FROM leads WHERE icp_tier=1 AND governor_released_at IS NOT NULL AND (audit_url IS NULL OR COALESCE(audit_verified,FALSE)=FALSE)`),
    20, 50, v => `${v} Tier-1 released leads without a verified audit_url (mint tail behind release rate)`);

  return persist();
}

function persist() {
  // ensure table
  pg(`CREATE TABLE IF NOT EXISTS system_health (check_key text PRIMARY KEY, category text, status text, detail text, metric numeric, checked_at timestamptz DEFAULT now())`);
  for (const r of results) {
    pg(`INSERT INTO system_health (check_key,category,status,detail,metric,checked_at) VALUES (${esc(r.key)},${esc(r.cat)},${esc(r.status)},${esc(r.detail)},${r.metric == null ? 'NULL' : r.metric},NOW())
        ON CONFLICT (check_key) DO UPDATE SET category=EXCLUDED.category,status=EXCLUDED.status,detail=EXCLUDED.detail,metric=EXCLUDED.metric,checked_at=NOW()`);
  }
  const fails = results.filter(r => r.status === 'fail').length;
  const warns = results.filter(r => r.status === 'warn').length;
  const score = results.length ? Math.round((results.filter(r => r.status === 'ok').length / results.length) * 100) : 0;
  pg(`INSERT INTO system_health (check_key,category,status,detail,metric,checked_at) VALUES ('_overall','meta',${esc(fails ? 'fail' : warns ? 'warn' : 'ok')},${esc(score + '% healthy · ' + fails + ' fail · ' + warns + ' warn')},${score},NOW()) ON CONFLICT (check_key) DO UPDATE SET status=EXCLUDED.status,detail=EXCLUDED.detail,metric=EXCLUDED.metric,checked_at=NOW()`);
  console.log(`Health: ${score}% · ${fails} fail · ${warns} warn · ${results.length} checks`);
  for (const r of results.filter(r => r.status !== 'ok')) console.log(`  [${r.status.toUpperCase()}] ${r.key}: ${r.detail}`);
  // Z17-15: actually ALERT on fail (the nightly-workers comment claimed this but the code only console.logged).
  // Fire once, fail-open, via the shared notify-event 'stuck' channel; surface SLA breaches specifically.
  try {
    const slaFails = results.filter(r => r.status === 'fail' && r.cat === 'sla');
    if (fails > 0) {
      const head = slaFails.length
        ? `STAGE-LATENCY SLA breach: ${slaFails.map(r => r.key + ' (' + r.detail + ')').join('; ')}`
        : `health-check: ${fails} fail / ${warns} warn (${score}% healthy)`;
      execFileSync('node', [path.join(ROOT, 'scripts', 'notify-event.js'), 'stuck', head], { encoding: 'utf8' });
    }
  } catch (_e) {}
  return { score, fails, warns, results };
}

if (require.main === module) run();
module.exports = { run };
