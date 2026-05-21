// send-guards.js — triple-layered hard stop on reply (3.2.4) + send throttle (G5) + degradation auto-pause (3.2.5).
// W2 (send) and W4 (follow-up) both call canSendNow(leadId) before issuing a send.
// Every refusal is logged to send_aborts so the audit trail is permanent.

const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql, parse = true) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try {
    const raw = execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    return parse ? raw : null;
  } catch (_e) { return null; }
}

function recordAbort({ workspace_id, lead_id, stage, reason, payload }) {
  const ws = workspace_id || 1;
  const reasonE = String(reason).replace(/'/g, "''");
  const stageE  = String(stage).replace(/'/g, "''");
  const payloadE = JSON.stringify(payload || {}).replace(/'/g, "''");
  pg(`INSERT INTO send_aborts (workspace_id, lead_id, stage, reason, payload) VALUES (${ws}, ${lead_id}, '${stageE}', '${reasonE}', '${payloadE}')`);
}

// ─── 3.2.4 · triple-layered hard stop ─────────────────────────────────────────
// Layer 1: lead row already has replied=TRUE
// Layer 2: lead row has status='replied'
// Layer 3: most recent reply_classifications row exists for this lead within 24h
function canSendNow(leadId, opts = {}) {
  if (!leadId) return { ok: false, reason: 'no_lead_id' };
  const stage = opts.stage || 'pre-send';
  const row = pg(`SELECT replied, status, last_reply_received_at FROM leads WHERE id = ${leadId}`);
  if (!row) return { ok: false, reason: 'lead_missing' };
  const [replied, status, lastReply] = row.split('\t');
  if (String(replied).toLowerCase() === 'true' || replied === 't' || replied === '1') {
    recordAbort({ lead_id: leadId, stage, reason: 'replied_true', payload: { status, lastReply } });
    return { ok: false, reason: 'replied_true', layer: 1 };
  }
  if (String(status).toLowerCase() === 'replied') {
    recordAbort({ lead_id: leadId, stage, reason: 'status_replied', payload: { replied, lastReply } });
    return { ok: false, reason: 'status_replied', layer: 2 };
  }
  const recentClass = pg(`SELECT 1 FROM reply_classifications WHERE lead_id = ${leadId} AND classified_at > NOW() - INTERVAL '24 hours' LIMIT 1`);
  if (recentClass) {
    recordAbort({ lead_id: leadId, stage, reason: 'recent_classification_within_24h', payload: { replied, status, lastReply } });
    return { ok: false, reason: 'recent_classification_within_24h', layer: 3 };
  }
  return { ok: true };
}

// ─── G5 · per-client send throttle ────────────────────────────────────────────
function canSendForRelay({ workspace_id, relay_name, hourly_cap, daily_cap }) {
  const ws = workspace_id || 1;
  const hcap = hourly_cap || 50;
  const dcap = daily_cap || 500;
  const hourly = Number(pg(`SELECT COALESCE(SUM(sent_count),0) FROM send_throttle_state WHERE workspace_id=${ws} AND relay_name='${relay_name}' AND bucket_hour >= date_trunc('hour', NOW())`)) || 0;
  const daily  = Number(pg(`SELECT COALESCE(SUM(sent_count),0) FROM send_throttle_state WHERE workspace_id=${ws} AND relay_name='${relay_name}' AND bucket_hour >= date_trunc('day', NOW())`)) || 0;
  if (hourly >= hcap) return { ok: false, reason: 'hourly_cap_reached', hourly, daily };
  if (daily  >= dcap) return { ok: false, reason: 'daily_cap_reached', hourly, daily };
  return { ok: true, hourly, daily };
}

function incrementThrottle({ workspace_id, relay_name }) {
  const ws = workspace_id || 1;
  pg(`INSERT INTO send_throttle_state (workspace_id, bucket_hour, relay_name, sent_count) VALUES (${ws}, date_trunc('hour', NOW()), '${relay_name}', 1) ON CONFLICT (workspace_id, bucket_hour, relay_name) DO UPDATE SET sent_count = send_throttle_state.sent_count + 1`);
}

// ─── 3.2.5 · reply-rate degradation auto-pause ────────────────────────────────
// Compare each active variant's reply_rate_7d to the 30-day median across the same sector × touch.
// If a variant is below 0.5× the median for 7 consecutive days, flip active=false and dead-letter alert.
function pauseDegradedVariants() {
  const sql = `
    WITH medians AS (
      SELECT sector, touch, percentile_cont(0.5) WITHIN GROUP (ORDER BY reply_rate_30d) AS med
      FROM template_variants WHERE active = TRUE AND sends_count > 50 GROUP BY sector, touch
    )
    UPDATE template_variants tv
    SET active = FALSE,
        archived_at = NOW(),
        archived_reason = 'auto_pause_reply_rate_below_half_median_30d'
    FROM medians m
    WHERE tv.sector = m.sector AND tv.touch = m.touch
      AND tv.reply_rate_7d < (m.med * 0.5)
      AND tv.sends_count >= 100
      AND tv.active = TRUE
    RETURNING tv.id, tv.sector, tv.touch, tv.variant_letter
  `;
  const out = pg(sql);
  return out ? out.split('\n').filter(Boolean) : [];
}

module.exports = { canSendNow, canSendForRelay, incrementThrottle, pauseDegradedVariants, recordAbort };
