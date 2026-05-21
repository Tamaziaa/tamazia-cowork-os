#!/usr/bin/env node
// Hourly intelligence pulse · examines the live pipeline at analyst depth with Gemini, posts a short
// summary + 3 concrete improvements to Slack + Telegram, and raises CRITICAL flags for urgent issues.
// Foundation for the unified-signals brain: external sources (Search Console, Analytics, website-form
// leads, CRM) plug into the `metrics` object below as their host-side API access is wired.
//
// Self-contained: posts directly via SLACK_BOT_TOKEN + TELEGRAM_BOT_TOKEN. LLM via GEMINI_API_KEY
// (Groq failover). Fail-soft: if the LLM is unavailable it still posts a deterministic metric summary.
// Usage: node scripts/intel-pulse.js

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ENV = {};
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
const NEON = ENV.NEON_URL;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function one(sql) { const r = pg(sql); return r == null || r === '' ? null : r.split('\n')[0]; }
function many(sql) { const r = pg(sql); return r ? r.split('\n').filter(Boolean) : []; }

function gather() {
  return {
    as_of: new Date().toISOString(),
    leads_total: one(`SELECT COUNT(*) FROM leads`),
    new_leads_24h: one(`SELECT COUNT(*) FROM leads WHERE created_at>NOW()-INTERVAL '24 hours'`),
    qualified: one(`SELECT COUNT(*) FROM leads WHERE lifecycle_stage='qualified'`),
    sent_total: one(`SELECT COUNT(*) FROM sends`),
    sent_24h: one(`SELECT COUNT(*) FROM sends WHERE sent_at>NOW()-INTERVAL '24 hours'`),
    replies_total: one(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL`),
    replies_24h: one(`SELECT COUNT(*) FROM inbound_emails WHERE received_at>NOW()-INTERVAL '24 hours'`) || one(`SELECT COUNT(*) FROM inbound_emails WHERE id>0`),
    reply_rate_pct: (() => { const s = Number(one(`SELECT COUNT(*) FROM sends`) || 0); const r = Number(one(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL`) || 0); return s ? +(r / s * 100).toFixed(1) : 0; })(),
    bounce_24h: one(`SELECT COUNT(*) FROM bounce_events WHERE received_at>NOW()-INTERVAL '24 hours'`),
    sendable_real_leads: one(`SELECT COUNT(*) FROM leads l WHERE l.status LIKE 'touch_%_queued' AND COALESCE(NULLIF(l.email,''),l.contact_email,'')<>'' AND COALESCE(acquisition_channel,'') NOT ILIKE '%test%' AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')`),
    li_pending: one(`SELECT COUNT(*) FROM channel_sends WHERE channel='linkedin' AND status='pending'`),
    organic_to_verify: one(`SELECT COUNT(*) FROM leads WHERE scrape_stream='organic_top100' AND COALESCE(verify_status,'pending')='pending'`),
    health_score: one(`SELECT metric FROM system_health WHERE check_key='_overall'`),
    health_fails: many(`SELECT check_key||' — '||COALESCE(detail,'') FROM system_health WHERE status='fail' AND check_key<>'_overall'`),
    health_warns: many(`SELECT check_key||' — '||COALESCE(detail,'') FROM system_health WHERE status='warn'`),
    funnel: many(`SELECT lifecycle_stage||':'||COUNT(*) FROM leads WHERE lifecycle_stage IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6`)
    // EXTERNAL SOURCES (wire as connected): gsc_clicks, gsc_top_queries, ga_sessions, form_leads_24h, crm_new_deals
  };
}

// LLM with failover: Gemini (primary) -> Groq (when Gemini quota is exhausted) -> null (deterministic).
async function llm(prompt) {
  const gkey = ENV.GEMINI_API_KEY;
  if (gkey) for (const model of ['gemini-2.0-flash', 'gemini-2.5-flash']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gkey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } })
      });
      if (r.ok) { const j = await r.json(); const t = j?.candidates?.[0]?.content?.parts?.[0]?.text; if (t) return t; }
    } catch (_e) {}
  }
  const qkey = ENV.GROQ_API_KEY;
  if (qkey) for (const model of ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + qkey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'user', content: prompt }] })
      });
      if (r.ok) { const j = await r.json(); const t = j?.choices?.[0]?.message?.content; if (t) return t; }
    } catch (_e) {}
  }
  return null;
}

function parseJson(t) { if (!t) return null; const m = t.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (_e) { return null; } }

async function postSlack(text) {
  const tok = ENV.SLACK_BOT_TOKEN; if (!tok) return;
  try { await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel: '#all-tamazia', text }) }); } catch (_e) {}
}
async function postTelegram(text) {
  const tok = ENV.TELEGRAM_BOT_TOKEN, chat = ENV.TELEGRAM_CHAT_ID; if (!tok || !chat) return;
  try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }) }); } catch (_e) {}
}

async function run() {
  const m = gather();
  const prompt = `You are a PhD-level B2B growth, deliverability and pipeline analyst for Tamazia, a compliance+SEO agency running an autonomous cold-outreach engine. Examine these LIVE metrics and produce a tight executive read. Metrics JSON:\n${JSON.stringify(m, null, 0)}\n\nReturn STRICT JSON only, no prose, shape: {"summary":"2-3 sentences, plain, what matters now","improvements":["3 specific, actionable moves ranked by impact"],"critical":["only genuinely urgent issues needing action now; [] if none"]}. Base every point on the numbers. If sendable_real_leads is 0, that is the dominant issue. Be concrete (cite the metric).`;
  const ai = parseJson(await llm(prompt));

  const summary = ai?.summary || `Pipeline: ${m.leads_total} leads, ${m.sent_total} sent (${m.sent_24h} in 24h), ${m.replies_total} replies (${m.reply_rate_pct}%). Health ${m.health_score || '?'}%. Sendable real leads: ${m.sendable_real_leads}.`;
  const imps = ai?.improvements || (Number(m.sendable_real_leads) === 0 ? ['Queue is starved of real prospects — run sourcing→enrich→qualify on genuine leads.'] : []);
  const crit = ai?.critical || (m.health_fails.length ? m.health_fails : []);

  const slack = `:bar_chart: *Tamazia hourly pulse* · health ${m.health_score || '?'}%\n${summary}\n\n*Improve:*\n${imps.map((x, i) => `${i + 1}. ${x}`).join('\n') || '—'}${crit.length ? `\n\n:rotating_light: *CRITICAL:*\n${crit.map(x => '• ' + x).join('\n')}` : ''}`;
  const tg = `📊 *Tamazia hourly pulse* · health ${m.health_score || '?'}%\n${summary}\n\nImprove:\n${imps.map((x, i) => `${i + 1}. ${x}`).join('\n') || '—'}${crit.length ? `\n\n🚨 CRITICAL:\n${crit.map(x => '• ' + x).join('\n')}` : ''}`;

  await postSlack(slack);
  await postTelegram(tg);
  console.log(`intel-pulse posted · health ${m.health_score}% · ${imps.length} improvements · ${crit.length} critical · LLM=${ai ? 'gemini' : 'fallback'}`);
  return { metrics: m, ai };
}

if (require.main === module) run();
module.exports = { run, gather };
