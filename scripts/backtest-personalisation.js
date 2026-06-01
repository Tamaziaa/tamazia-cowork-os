#!/usr/bin/env node
// BACKTEST (no sends). Runs the FULL personalisation + audit pipeline through OUR engine for a set of
// real clients across 10 sectors, exactly as production would, and writes a report. Per client:
//   homepage fetch -> detectMarkets (operating city) -> composeRankBlock (REAL SERP, gated + fact-checked)
//   -> scanSite findings -> render Touch-0 + Touch-1 -> MINT a real signed audit (S025 build) -> verify it
//   live (HTTP 200, fail-closed) -> run every send gate (length/placeholders/curated/audit-link/no-dash).
// Decision per client: SEND-READY (all gates pass + audit verified) or ABORTED (with the exact reason).
// Output: reports/backtest-<ts>.json + reports/backtest-<ts>.md . Usage: node scripts/backtest-personalisation.js
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const { composeRankBlock } = require(path.join(ROOT, 'src/lib/touch0/rank-insight.js'));
const { detectMarkets } = require(path.join(ROOT, 'src/lib/sourcing/markets.js'));
const render = require(path.join(ROOT, 'src/skills/S064-touch-cadence/scripts/render.js'));
const gates = require(path.join(ROOT, 'src/lib/gates.js'));
const auditBuilder = require(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'));
const { verifyAuditUrl } = require(path.join(ROOT, 'src/lib/audit/verify-audit-url.js'));

const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function html(d) { try { const r = await fetch('https://' + d, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(9000) }); return r.ok ? await r.text() : ''; } catch (_) { return ''; } }
const nd = gates.noDashes || (x => x);

// 10 sectors x a real client each (fresh, not from our DB). Mid/local-intent firms so local rank gaps surface.
const CLIENTS = [
  { sector: 'law-firms',   company: 'Irwin Mitchell',     domain: 'irwinmitchell.com' },
  { sector: 'healthcare',  company: 'Portman Dental Care', domain: 'portmandentalcare.com' },
  { sector: 'real-estate', company: 'Foxtons',            domain: 'foxtons.co.uk' },
  { sector: 'hospitality', company: 'Firmdale Hotels',    domain: 'firmdalehotels.com' },
  { sector: 'financial',   company: 'Azets',              domain: 'azets.co.uk' },
  { sector: 'ecommerce',   company: 'Gymshark',           domain: 'gymshark.com' },
  { sector: 'education',   company: 'Harrow School',      domain: 'harrowschool.org.uk' },
  { sector: 'automotive',  company: 'Arnold Clark',       domain: 'arnoldclark.com' },
  { sector: 'healthcare',  company: 'Nuffield Health',    domain: 'nuffieldhealth.com' },
  { sector: 'professional',company: 'Reed',               domain: 'reed.co.uk' },
];

function findingsFromPointers(pts) {
  const out = (pts || []).map(x => String(x.fact || x.layman_explanation || x.citation || '').replace(/\s+/g, ' ').replace(/\.*$/, '').trim()).filter(Boolean).slice(0, 5);
  return out.length ? out : ['Compliance posture awaiting full audit re-scan; engine flags pending review'];
}

async function runClient(c, i) {
  const rec = { n: i + 1, sector: c.sector, company: c.company, domain: c.domain, steps: {} };
  try {
    const h = await html(c.domain);
    rec.steps.reachable = !!h; rec.steps.html_len = h.length;
    const mk = detectMarkets({ html: h, domain: c.domain });
    rec.city = mk.primary_city || ''; rec.regions = mk.regions;
    // rank insight (real SERP, gated + fact-checked)
    const rb = await composeRankBlock({ domain: c.domain, company: c.company, sector: c.sector, country: 'UK', html: h }, {});
    rec.rank_ok = rb.ok; rec.rank_reason = rb.reason || null;
    rec.keywords = rb.ok ? rb.keywords : [];
    // mint a real signed audit (one scan) -> pointers double as Touch findings; then verify live
    let audit = { ok: false, reason: 'not_minted' }, auditUrl = '', findings = ['Compliance posture awaiting full audit re-scan; engine flags pending review'];
    try { const b = await auditBuilder.build({ lead_id: null, domain: c.domain, sector: c.sector, country: 'UK', company: c.company, env: process.env }); auditUrl = (b && b.signed_url) || ''; rec.scan_reachable = !!(b && b.reachable); rec.findings_count = (b && b.pointers || []).length; findings = findingsFromPointers(b && b.pointers); audit = await verifyAuditUrl(auditUrl); } catch (e) { audit = { ok: false, reason: 'mint_error:' + e.message }; }
    rec.audit_url = auditUrl; rec.audit_check = audit;
    // build the lead object and render touches exactly as the cadence does
    const lead = { id: 0, company: c.company, domain: c.domain, sector: c.sector, first_name: '', audit_url: auditUrl, rank_insight: rb.ok ? { keywords: rb.keywords, blog_offer: rb.blog_offer, city: rec.city } : null, pointers: [] };
    const t0 = render.buildTouch0({ lead, apolloOrg: null, findings });
    const t1 = render.buildTouch1({ lead, findings });
    // scrub + fill a sample alias signature to simulate the real send/Mystrika ({{ sender }})
    const fill = b => nd(String(b).replace(/__SIGNATURE__/g, 'Eloise'));
    rec.touch0 = { subject: nd(t0.subject), body: fill(t0.body) };
    rec.touch1 = { subject: nd(t1.subject), body: fill(t1.body) };
    // gates
    const g0 = gates.validateEmail(nd(t0.subject), fill(t0.body), { requireCurated: true });
    const g1 = gates.validateEmail(nd(t1.subject), fill(t1.body), { requireAuditUrl: true, audit_url: auditUrl });
    const dash = /[—–]| - /.test(rec.touch0.body + rec.touch1.body + rec.touch0.subject + rec.touch1.subject);
    const broken = /\{\{|\}\}|__SIGNATURE__|undefined|\bnull\b|\[city\]/.test(rec.touch0.body + rec.touch1.body);
    rec.gate_touch0 = { ok: g0.ok, reasons: g0.reasons };
    rec.gate_touch1 = { ok: g1.ok, reasons: g1.reasons };
    rec.no_dashes = !dash; rec.no_broken_tags = !broken;
    rec.decision = (g0.ok && g1.ok && audit.ok && !dash && !broken) ? 'SEND-READY' : 'ABORTED';
    rec.abort_reasons = rec.decision === 'ABORTED' ? [
      ...(audit.ok ? [] : ['audit:' + audit.reason]),
      ...(g0.ok ? [] : ['touch0:' + (g0.reasons || []).join(',')]),
      ...(g1.ok ? [] : ['touch1:' + (g1.reasons || []).join(',')]),
      ...(dash ? ['contains_dash'] : []), ...(broken ? ['broken_tags'] : []),
    ] : [];
  } catch (e) { rec.error = e.message; rec.decision = 'ERROR'; }
  return rec;
}

(async () => {
  const dir = path.join(ROOT, 'reports'); fs.mkdirSync(dir, { recursive: true });
  const progressPath = path.join(dir, 'backtest-progress.json');
  let results = []; try { results = JSON.parse(fs.readFileSync(progressPath, 'utf8')); } catch (_) { results = []; }
  const doneDomains = new Set(results.map(r => r.domain));
  for (let i = 0; i < CLIENTS.length; i++) {
    if (doneDomains.has(CLIENTS[i].domain)) continue;
    const r = await runClient(CLIENTS[i], i); results.push(r);
    fs.writeFileSync(progressPath, JSON.stringify(results, null, 2)); // persist after EACH client (resumable across 45s call limits)
    console.error(`[backtest] ${r.company} -> ${r.decision} (${results.length}/${CLIENTS.length})`);
  }
  if (results.length < CLIENTS.length) { console.log(JSON.stringify({ partial: true, done: results.length, total: CLIENTS.length })); return; }
  results.sort((a, b) => a.n - b.n);
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
  fs.writeFileSync(path.join(dir, `backtest-${ts}.json`), JSON.stringify(results, null, 2));
  // Markdown report
  const sendReady = results.filter(r => r.decision === 'SEND-READY').length;
  let md = `# Tamazia personalisation backtest\n\nGenerated by the engine (scripts/backtest-personalisation.js) on ${new Date().toISOString()}. No emails were sent.\n\n`;
  md += `**${sendReady}/${results.length} SEND-READY** (all gates passed + audit link verified live). The rest are correctly ABORTED with the reason shown, exactly as the live guardrails would hold them.\n\n`;
  md += `| # | Sector | Client | City | Rank insight | Audit (HTTP) | T0 gate | T1 gate | Decision |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const rank = r.rank_ok ? `${r.keywords.length} kw` : (r.rank_reason || 'none');
    const au = r.audit_check ? (r.audit_check.ok ? '200 OK' : (r.audit_check.status || r.audit_check.reason)) : 'n/a';
    md += `| ${r.n} | ${r.sector} | ${r.company} | ${r.city || '-'} | ${rank} | ${au} | ${r.gate_touch0 && r.gate_touch0.ok ? 'pass' : 'FAIL'} | ${r.gate_touch1 && r.gate_touch1.ok ? 'pass' : 'FAIL'} | ${r.decision} |\n`;
  }
  md += `\n---\n\n`;
  for (const r of results) {
    md += `## ${r.n}. ${r.company} (${r.sector}) — ${r.decision}\n\n`;
    md += `- Domain: ${r.domain}  ·  Operating city: ${r.city || '(none detected)'}  ·  Markets: ${(r.regions || []).join(', ') || '-'}\n`;
    md += `- Audit URL: ${r.audit_url || '(none)'}\n`;
    md += `- Audit verification: **${r.audit_check && r.audit_check.ok ? 'VERIFIED LIVE (HTTP 200)' : 'NOT VERIFIED — ' + (r.audit_check ? (r.audit_check.reason + (r.audit_check.status ? ' (' + r.audit_check.status + ')' : '')) : 'n/a')}**\n`;
    if (r.rank_ok) { md += `- Rank insight keywords:\n`; for (const k of r.keywords) md += `  - "${k.keyword}": you ${k.my_position ? '#' + k.my_position : 'absent'}; leader ${k.leader || '(none)'}${k.leader_pos ? ' #' + k.leader_pos : ''}\n`; }
    else md += `- Rank insight: none (${r.rank_reason}) — Touch-0 uses the finding-based fallback\n`;
    if (r.abort_reasons && r.abort_reasons.length) md += `- ABORT reasons: ${r.abort_reasons.join(' | ')}\n`;
    if (r.touch0) md += `\n**Touch 0 — subject:** ${r.touch0.subject}\n\n\`\`\`\n${r.touch0.body}\n\`\`\`\n`;
    if (r.touch1) md += `\n**Touch 1 — subject:** ${r.touch1.subject}\n\n\`\`\`\n${r.touch1.body}\n\`\`\`\n`;
    md += `\n---\n\n`;
  }
  fs.writeFileSync(path.join(dir, `backtest-${ts}.md`), md);
  console.error(`[backtest] DONE. ${sendReady}/${results.length} send-ready. Report: reports/backtest-${ts}.md`);
  console.log(JSON.stringify({ ts, send_ready: sendReady, total: results.length, report_md: `reports/backtest-${ts}.md`, report_json: `reports/backtest-${ts}.json` }));
})().catch(e => { console.error('[backtest] fatal:', e.message); process.exit(1); });
