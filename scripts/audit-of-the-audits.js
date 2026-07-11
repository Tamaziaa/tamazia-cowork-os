'use strict';
// E-216 (v22.5, S-194): WEEKLY AUDIT OF THE AUDITS — the 11 Jul defect-catalogue aggregates as a standing job.
// Pure SQL over Neon (no payload pulls). Writes reports/audit-of-audits/<date>.md and posts a Telegram summary.
// Diff against the previous run is the human's job; the numbers land in one place, every week, unasked (P-094 fix).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return '';
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; }
}
async function tg(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try { await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(12000) }); } catch (_e) {}
}
(async () => {
  const d = new Date().toISOString().slice(0, 10);
  const L = [];
  const add = (title, sql) => { const r = pg(sql); L.push('## ' + title + '\n\n```\n' + (r || '(no rows / no db)') + '\n```\n'); return r; };
  L.push('# Audit of the audits — ' + d + ' (automated weekly, S-194)\n');
  const mix = add('Verified mix (all rows)', "SELECT 'total=' || count(*) || ' live=' || count(*) FILTER (WHERE status='live') || ' verified_true=' || count(*) FILTER (WHERE verified IS TRUE) || ' live_verified=' || count(*) FILTER (WHERE status='live' AND verified IS TRUE) FROM audit_pages");
  add('Mints + verified rate by day (14d)', "SELECT to_char(generated_at,'MM-DD') || '  minted=' || count(*) || '  verified=' || count(*) FILTER (WHERE verified IS TRUE) FROM audit_pages WHERE generated_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1");
  add('Quarantine reasons (7d)', "SELECT reason || '  x' || n FROM (SELECT jsonb_array_elements(verify_report->'reasons')->>'code' reason, count(*) n FROM audit_pages WHERE generated_at > now() - interval '7 days' AND verified IS NOT TRUE GROUP BY 1 ORDER BY 2 DESC LIMIT 12) t");
  add('Live rows by sector', "SELECT sector || '  x' || count(*) FROM audit_pages WHERE status='live' GROUP BY 1 ORDER BY 2 DESC LIMIT 15");
  add('Live rows by country (canonical check: no USA/UAE/GB variants should appear)', "SELECT country || '  x' || count(*) FROM audit_pages WHERE status='live' GROUP BY 1 ORDER BY 2 DESC LIMIT 12");
  add('Duplicate LIVE domains (must be 0 after E-204)', "SELECT COALESCE(string_agg(domain || ' x' || n, ', '), '0 duplicates') FROM (SELECT domain, count(*) n FROM audit_pages WHERE status='live' GROUP BY 1 HAVING count(*) > 1 LIMIT 8) t");
  add('Engine version mix (7d mints)', "SELECT COALESCE(payload_json->>'engine_version','(unstamped)') || '  x' || count(*) FROM audit_pages WHERE generated_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC");
  add('LLM verify status mix (7d)', "SELECT COALESCE(payload_json->'llm_verify'->>'status','(none)') || '  x' || count(*) FROM audit_pages WHERE generated_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC");
  add('Sub-sector coverage (7d mints)', "SELECT COALESCE(payload_json->>'sub_sector','(none)') || '  x' || count(*) FROM audit_pages WHERE generated_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 12");
  add('Opens recorded (P-010 watch: should rise once the beacon writes)', "SELECT 'rows_with_opens=' || count(*) FILTER (WHERE open_count > 0) || ' total_opens=' || COALESCE(sum(open_count),0) FROM audit_pages");
  // E-222/E-223 (v22.6): the self-learning loop's weekly read-out — gate health + the law candidates the LLM
  // keeps rediscovering. High seen_count candidates are the seed-pipeline queue (human-gated, never auto-attached).
  add('LLM gate scores (7d): classify pass rate + attempts', "SELECT 'classify avg_score=' || round(avg((payload_json->'llm_gate'->'classify'->>'score')::numeric),1) || ' avg_attempts=' || round(avg((payload_json->'llm_gate'->'classify'->>'attempts')::numeric),1) || ' gated_mints=' || count(*) FROM audit_pages WHERE generated_at > now() - interval '7 days' AND payload_json->'llm_gate'->'classify'->>'score' IS NOT NULL");
  add('Law-discovery cells reviewed (30d) + drop rate', "SELECT 'cells=' || count(*) || ' dropped=' || count(*) FILTER (WHERE provider='gate_dropped') || ' avg_score=' || COALESCE(round(avg(score),1),0) FROM cell_law_reviews WHERE checked_at > now() - interval '30 days'");
  // E-229: review queue = candidates that RESOLVED to an official URL AND recurred (seen_count>=2, frequency as
  // distant supervision) AND are not yet reviewed. Each line shows the official source so a reviewer verifies in one click.
  add('REVIEW-ELIGIBLE law candidates (official-URL-verified, recurred >=2x, unreviewed)', "SELECT name || ' [' || jurisdiction || '/' || sector || COALESCE('/'||NULLIF(sub_sector,''),'') || '] x' || seen_count || '  ' || COALESCE(official_url,'(no url)') FROM framework_candidates WHERE status='candidate' AND reviewed_at IS NULL AND seen_count >= 2 AND official_url IS NOT NULL ORDER BY seen_count DESC, last_seen DESC LIMIT 15");
  add('Candidate funnel health', "SELECT 'total=' || count(*) || ' with_url=' || count(*) FILTER (WHERE official_url IS NOT NULL) || ' review_eligible=' || count(*) FILTER (WHERE seen_count>=2 AND official_url IS NOT NULL AND reviewed_at IS NULL) FROM framework_candidates");
  // E-230: crawl coverage — a mint can pass with a thin crawl that missed policy pages; this makes it visible.
  add('Crawl policy-page coverage (7d)', "SELECT 'avg_coverage=' || round(avg((payload_json->'crawl_telemetry'->>'policy_coverage')::numeric),2) || ' via_direct=' || count(*) FILTER (WHERE payload_json->'crawl_telemetry'->>'via'='direct') || ' via_rendered=' || count(*) FILTER (WHERE payload_json->'crawl_telemetry'->>'via'='rendered') || ' via_archive=' || count(*) FILTER (WHERE payload_json->'crawl_telemetry'->>'via'='archive') || ' challenged=' || count(*) FILTER (WHERE (payload_json->'crawl_telemetry'->>'challenge_detected')::boolean) FROM audit_pages WHERE generated_at > now() - interval '7 days' AND payload_json->'crawl_telemetry' IS NOT NULL");
  const dir = path.join(ROOT, 'reports', 'audit-of-audits');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, d + '.md');
  fs.writeFileSync(file, L.join('\n'));
  console.log('[audit-of-audits] wrote ' + file);
  await tg('Tamazia weekly audit-of-the-audits: ' + (mix || 'no db') + ' — full report in repo reports/audit-of-audits/' + d + '.md');
})();
