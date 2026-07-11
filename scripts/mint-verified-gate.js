'use strict';
// E-215 (v22.5, audit-of-the-audits P-103/S-193): POST-MINT VERIFIED-RATE GATE.
// CI success was decoupled from output validity: the _nx outage minted 55/55 broken payloads under green runs.
// This script runs after every drain; if the run minted >= MINT_GATE_MIN audits and the verified rate is below
// MINT_GATE_RATE, it alerts Telegram AND exits 1 so the workflow itself goes red. Quiet when there is nothing
// to say. Reads the same .env the mint used.
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
async function tg(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try { await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(12000) }); } catch (_e) {}
}
(async () => {
  const windowH = Math.max(1, Number(process.env.MINT_GATE_WINDOW_H || 6));
  const minN = Math.max(1, Number(process.env.MINT_GATE_MIN || 5));
  const minRate = Math.min(1, Math.max(0, Number(process.env.MINT_GATE_RATE || 0.5)));
  const row = pg(`SELECT count(*) || '|' || count(*) FILTER (WHERE verified IS TRUE) FROM audit_pages WHERE generated_at > now() - interval '${windowH} hours'`);
  if (!row) { console.log('[mint-gate] no DB access, skipping (fail-open observability, the mint itself already ran)'); return; }
  const [totalS, okS] = String(row).split('|');
  const total = Number(totalS || 0), okN = Number(okS || 0);
  const rate = total ? okN / total : 1;
  const reasons = pg(`SELECT reason || ' x' || n FROM (SELECT jsonb_array_elements(verify_report->'reasons')->>'code' AS reason, count(*) n FROM audit_pages WHERE generated_at > now() - interval '${windowH} hours' AND verified IS NOT TRUE GROUP BY 1 ORDER BY 2 DESC LIMIT 5) t`) || '';
  const llmLive = ['GROQ_API_KEY', 'NIM_API_KEY', 'GEMINI_API_KEY', 'DASHSCOPE_API_KEY'].filter((k) => !!process.env[k]).join(',') || 'NONE';
  console.log(`[mint-gate] window=${windowH}h minted=${total} verified=${okN} rate=${(rate * 100).toFixed(0)}% llm_keys=${llmLive}`);
  if (reasons) console.log('[mint-gate] top quarantine reasons:\n' + reasons);
  if (llmLive === 'NONE') console.error('[mint-gate] WARNING: no LLM provider key present in env; grounding + cross-verify are dark (P-013 class)');
  if (total >= minN && rate < minRate) {
    const msg = `Tamazia mint gate RED: ${okN}/${total} verified (${(rate * 100).toFixed(0)}%) in the last ${windowH}h. Top reasons: ${reasons.replace(/\n/g, '; ').slice(0, 300)}`;
    await tg(msg);
    console.error('[mint-gate] ' + msg);
    process.exit(1);
  }
  if (total > 0 && process.env.MINT_GATE_NOTIFY === '1') await tg(`Tamazia mint: ${okN}/${total} verified (${(rate * 100).toFixed(0)}%) in ${windowH}h.`);
})();
