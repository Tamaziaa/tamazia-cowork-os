// sourcing-attribution.js — Phase 3 task 3.6.1
// Records the source channel for every lead at first touch and updates milestones (reply, booked, signed).

const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VALID_CHANNELS = new Set([
  'cold-email', 'linkedin', 'instagram', 'inbound-form', 'warm-intro',
  'conference', 'referral', 'tally-instrument', 'manual-upload',
]);

function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

function recordFirstTouch({ lead_id, channel, subchannel, campaign_tag, workspace_id }) {
  if (!VALID_CHANNELS.has(channel)) throw new Error(`unknown channel: ${channel}`);
  const ws = workspace_id || 1;
  const sub = (subchannel || '').replace(/'/g, "''");
  const camp = (campaign_tag || '').replace(/'/g, "''");
  const sql = `INSERT INTO sourcing_attribution (workspace_id, lead_id, source_channel, source_subchannel, campaign_tag) VALUES (${ws}, ${lead_id}, '${channel}', '${sub}', '${camp}') ON CONFLICT DO NOTHING`;
  pg(sql);
}

function recordMilestone({ lead_id, milestone }) {
  const col = milestone === 'reply'   ? 'first_reply_at'
            : milestone === 'booked'  ? 'first_booked_at'
            : milestone === 'signed'  ? 'first_signed_at'
            : null;
  if (!col) throw new Error(`unknown milestone: ${milestone}`);
  const sql = `UPDATE sourcing_attribution SET ${col} = NOW() WHERE lead_id = ${lead_id} AND ${col} IS NULL`;
  pg(sql);
}

module.exports = { recordFirstTouch, recordMilestone, VALID_CHANNELS };
