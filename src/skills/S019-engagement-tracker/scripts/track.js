#!/usr/bin/env node
// S019 engagement-tracker · Phase 5 tasks 5.5.1 + 5.5.2 + 5.8.1
// Ingests audit-page client-side events (open / scroll_depth / section_dwell / pdf_download /
// cta_click / cal_iframe_open) and writes one row per event into audit_events.
// On high-intent triggers (calendar open OR ≥3 events with cumulative dwell > 90s OR pdf_download)
// fires a Slack alert via S056-style notify-slack (already on the system).
//
// Also runs the re-engagement scan: any audit_page with no event in 7 days and not yet expired
// drops a row into a queue that W12 (re-engagement workflow) picks up.

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function notifySlack(channel, text) {
  try { execFileSync(path.resolve(ROOT, 'scripts', 'notify-slack.sh'), [channel, text], { stdio: 'pipe' }); return true; } catch (_e) { return false; }
}
function notifyTelegram(text) {
  try { execFileSync(path.resolve(ROOT, 'scripts', 'notify-telegram.sh'), [text], { stdio: 'pipe' }); return true; } catch (_e) { return false; }
}

const HIGH_INTENT_EVENTS = new Set(['cal_iframe_open', 'pdf_download', 'tier_dominator_click', 'tier_authority_click']);

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function ingest(event) {
  const { hash, event_type, section_id, dwell_ms, scroll_pct, user_agent, ip, referer } = event;
  if (!hash || !event_type) return { ok: false, reason: 'hash and event_type required' };
  const apRow = pg(`SELECT id, lead_id, workspace_id, slug, domain FROM audit_pages WHERE hash='${String(hash).replace(/'/g, "''")}' LIMIT 1`);
  if (!apRow) return { ok: false, reason: 'audit_page_missing' };
  const [audit_page_id, lead_id, workspace_id, slug, domain] = apRow.split('\t');

  const ipH = hashIp(ip);
  const esc = v => v === undefined || v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  pg(`INSERT INTO audit_events (workspace_id, audit_page_id, hash, event_type, section_id, dwell_ms, scroll_pct, user_agent, ip_hash, referer) VALUES (${workspace_id}, ${audit_page_id}, '${hash.replace(/'/g, "''")}', '${event_type.replace(/'/g, "''")}', ${esc(section_id)}, ${dwell_ms || 'NULL'}, ${scroll_pct || 'NULL'}, ${esc(user_agent && String(user_agent).slice(0, 400))}, ${esc(ipH)}, ${esc(referer && String(referer).slice(0, 400))})`);

  // Open count + last_opened_at update on 'open' events
  if (event_type === 'open') {
    pg(`UPDATE audit_pages SET open_count = open_count + 1, last_opened_at = NOW() WHERE id = ${audit_page_id}`);
  }

  // High-intent trigger
  let highIntentFired = false;
  if (HIGH_INTENT_EVENTS.has(event_type)) {
    highIntentFired = true;
    pg(`UPDATE audit_pages SET high_intent_at = NOW() WHERE id = ${audit_page_id} AND high_intent_at IS NULL`);
    notifySlack('all-tamazia', `:fire: *High-intent on audit* · /audit/${slug}/${hash} · event=\`${event_type}\` · lead_id=${lead_id} · domain=${domain}`);
    notifyTelegram(`High intent · /audit/${slug}/${hash} · event=${event_type} · lead_id=${lead_id} · ${domain}`);
  } else if (event_type === 'section_dwell' || event_type === 'scroll_depth') {
    // 3+ events with cumulative dwell > 90s also triggers
    const aggregate = pg(`SELECT COUNT(*), COALESCE(SUM(dwell_ms),0) FROM audit_events WHERE audit_page_id = ${audit_page_id}`);
    if (aggregate) {
      const [cnt, dwell] = aggregate.split('\t').map(Number);
      if (cnt >= 3 && dwell >= 90000) {
        const hi = pg(`SELECT high_intent_at FROM audit_pages WHERE id = ${audit_page_id}`);
        if (!hi || hi === 'NULL' || hi.startsWith('19') || hi === '') {
          highIntentFired = true;
          pg(`UPDATE audit_pages SET high_intent_at = NOW() WHERE id = ${audit_page_id} AND high_intent_at IS NULL`);
          notifySlack('all-tamazia', `:eyes: *High-intent on audit (cumulative dwell)* · /audit/${slug}/${hash} · events=${cnt} · dwell=${Math.round(dwell / 1000)}s · lead_id=${lead_id}`);
        }
      }
    }
  }
  return { ok: true, audit_page_id: Number(audit_page_id), high_intent_fired: highIntentFired };
}

// Re-engagement: pull audit pages with no event in 7 days, not expired, lead not replied.
function scanReengagement() {
  const raw = pg(`
    SELECT ap.id, ap.slug, ap.hash, ap.lead_id, ap.domain
    FROM audit_pages ap
    WHERE ap.status = 'live'
      AND ap.expires_at > NOW()
      AND (ap.last_opened_at IS NULL OR ap.last_opened_at < NOW() - INTERVAL '7 days')
      AND (ap.lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = ap.lead_id AND l.replied = TRUE))
    ORDER BY ap.generated_at DESC
    LIMIT 50
  `);
  return raw ? raw.split('\n').filter(Boolean).map(l => { const [id, slug, hash, lead, dom] = l.split('\t'); return { audit_page_id: Number(id), slug, hash, lead_id: lead === '' ? null : Number(lead), domain: dom }; }) : [];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ingest') out.ingest = true;
    else if (argv[i] === '--scan-reengagement') out.scan = true;
    else if (argv[i] === '--hash') out.hash = argv[++i];
    else if (argv[i] === '--event-type') out.event_type = argv[++i];
    else if (argv[i] === '--section-id') out.section_id = argv[++i];
    else if (argv[i] === '--dwell-ms') out.dwell_ms = Number(argv[++i]);
    else if (argv[i] === '--scroll-pct') out.scroll_pct = Number(argv[++i]);
  }
  return out;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.scan) { console.log(JSON.stringify(scanReengagement(), null, 2)); }
  else if (opts.ingest) { console.log(JSON.stringify(ingest(opts))); }
  else { console.error('Usage: track.js --ingest --hash X --event-type open  |  --scan-reengagement'); process.exit(2); }
}

module.exports = { ingest, scanReengagement, HIGH_INTENT_EVENTS };
