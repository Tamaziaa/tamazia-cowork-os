// reply-notifier.js — Slack + Telegram notification stack for inbound replies.
// Phase 3 tasks 3.5.1, 3.5.2, 3.5.3.
//
// 3.5.1 Slack: full reply context (lead snapshot, original send, reply text,
//       classifier output, draft reply, approval action description).
// 3.5.2 Telegram parallel: same payload trimmed for mobile.
// 3.5.3 120-second recall countdown: only categories in AUTO_SEND_ELIGIBLE auto-send if
//       Aman fails to act within the window. All other categories require explicit approval.
//
// G6 notification batching: collects up to 5 events within a 5-second window
// and emits one combined Slack message to avoid rate limits at 50-client scale.

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const NOTIFY_SLACK = path.resolve(ROOT, 'scripts', 'notify-slack.sh');
const NOTIFY_TG    = path.resolve(ROOT, 'scripts', 'notify-telegram.sh');

const RECALL_SECONDS = 120;

function buildSlackPayload({ lead, original_send, reply_text, classification, draft }) {
  const lines = [];
  lines.push(`*Reply received from ${lead.contact_first || ''} ${lead.contact_last || ''} at ${lead.company}*`);
  lines.push(`Category: \`${classification.category}\`  ·  Confidence: ${classification.confidence.toFixed(2)}  ·  LLM: ${classification.llm_used || 'regex'}`);
  if (lead.sector || lead.country) lines.push(`Sector: ${lead.sector || '-'}  ·  Country: ${lead.country || '-'}`);
  lines.push('');
  lines.push('*Reply text*');
  lines.push('```' + String(reply_text || '').slice(0, 800) + '```');
  if (original_send) { lines.push('*Original send*'); lines.push('```' + String(original_send).slice(0, 600) + '```'); }
  lines.push('*Suggested draft*');
  if (draft && draft.draft_body) {
    lines.push('```' + draft.draft_body.slice(0, 1200) + '```');
    lines.push(`Auto-send eligible: ${draft.auto_send_eligible ? 'yes (' + RECALL_SECONDS + 's countdown)' : 'no — explicit approval required'}`);
  } else {
    lines.push('`HUMAN-ONLY: ' + (draft && draft.note ? draft.note : 'route to Aman') + '`');
  }
  return lines.join('\n');
}

function buildTelegramPayload({ lead, classification, draft }) {
  const cat = classification.category;
  const auto = draft && draft.auto_send_eligible;
  const head = `*Reply* from ${lead.contact_first || ''} at ${lead.company} (${lead.sector || '-'})`;
  const mid = `Category: \`${cat}\`  conf: ${classification.confidence.toFixed(2)}`;
  const tail = auto ? `Auto-send in ${RECALL_SECONDS}s. Reply STOP to recall.` : 'Explicit approval required. View in Slack.';
  return [head, mid, tail].join('\n');
}

function notifyReply({ channel, lead, original_send, reply_text, classification, draft }) {
  const slackText = buildSlackPayload({ lead, original_send, reply_text, classification, draft });
  const tgText    = buildTelegramPayload({ lead, classification, draft });
  const out = { slack: false, telegram: false };
  try { execFileSync('bash', [NOTIFY_SLACK, channel || 'all-tamazia', slackText], { stdio: 'pipe' }); out.slack = true; } catch (_e) { /* dead-letter handled upstream */ }
  try { execFileSync('bash', [NOTIFY_TG, tgText], { stdio: 'pipe' }); out.telegram = true; } catch (_e) { /* placeholder chat_id until first Aman ping */ }
  return out;
}

// Recall countdown state — Phase 3 ships the API. Phase 6 wires the real scheduler.
function startRecallCountdown({ draft_id, seconds }) {
  return { draft_id, fires_at: new Date(Date.now() + (seconds || RECALL_SECONDS) * 1000).toISOString(), state: 'armed' };
}

// G6 notification batcher (in-memory accumulator; n8n W6 calls .flush every 5s).
class NotificationBatcher {
  constructor() { this.bucket = []; this.lastFlush = Date.now(); }
  push(payload) { this.bucket.push(payload); if (this.bucket.length >= 5 || Date.now() - this.lastFlush > 5000) return this.flush(); return null; }
  flush() {
    if (!this.bucket.length) return null;
    const text = this.bucket.map((p, i) => `${i + 1}. ${p.headline}`).join('\n');
    this.bucket = []; this.lastFlush = Date.now();
    try { execFileSync('bash', [NOTIFY_SLACK, 'all-tamazia', text], { stdio: 'pipe' }); } catch (_e) { /* */ }
    return text;
  }
}

module.exports = {
  notifyReply,
  buildSlackPayload,
  buildTelegramPayload,
  startRecallCountdown,
  NotificationBatcher,
  RECALL_SECONDS,
};
