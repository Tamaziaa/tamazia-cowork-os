#!/usr/bin/env node
// S062 · Auto-trigger chain · Phase 8 v2
// New lead → Gemini enrich (domain + contact + sector) → personalisation scan → Touch 0 email queued
// Connects: bulk-sourcer → S060 Gemini enricher → S008 personalisation engine → S001 Touch 0 compose

const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { enrichLead } = require('../../../skills/S060-gemini-lead-enricher/scripts/enrich.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

function fetchPendingLeads(limit = 5) {
  // Leads sourced but not yet enriched + not yet scanned + not yet queued for Touch 0
  const sql = `SELECT id::text, company, COALESCE(domain, ''), COALESCE(sector, '') FROM leads WHERE status='new' AND company IS NOT NULL AND company NOT LIKE 'Test %' ORDER BY priority_score DESC NULLS LAST, id DESC LIMIT ${limit}`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [id, company, domain, sector] = l.split('\t'); return { id: Number(id), company, domain: domain || null, sector: sector || null }; });
}

function runPersonalisationScan(lead) {
  // Call the existing S008 personalisation engine in --skip-llm mode (fast, deterministic)
  if (!lead.domain || !lead.sector) return { skipped: 'missing_domain_or_sector' };
  const args = ['src/skills/S008-personalisation-engine/scripts/run.js', '--domain', lead.domain, '--sector', lead.sector, '--country', 'UK', '--company', lead.company, '--lead-id', String(lead.id), '--skip-llm'];
  try {
    const r = spawnSync('node', args, { cwd: ROOT, env: process.env, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) return { error: r.stderr?.toString().slice(0, 300) };
    return { ok: true };
  } catch (e) { return { error: e.message }; }
}

function queueTouch0(lead) {
  // Insert a Touch 0 record in outreach_drafts table — pre-built template ready for human send
  // (LinkedIn/email · drafts not auto-sent, queued for Aman to review)
  const subject = `Permission to feature ${lead.company} in our 2026 piece`;
  const body = `Hi ${lead.first_name || lead.company.split(' ')[0]},

I'm writing a 2026 piece on ${lead.sector || 'this sector'} and the regulatory shift unfolding right now. ${lead.company} came up as a candidate to feature.

If you're interested, would you have 20 minutes for a short conversation? I'd send the angle first so you can decide before any commitment.

Aman Pareek
Founder, Tamazia · LLM, King's College London`;
  const sql = `INSERT INTO outreach_drafts (lead_id, channel, draft_subject, draft_body, draft_metadata, generated_at) VALUES (${lead.id}, 'email', ${pgEsc(subject)}, ${pgEsc(body)}, ${pgEsc(JSON.stringify({touch: 0, ready_for_send: true, lead_audience: 'tamazia'}))}::jsonb, NOW()) RETURNING id`;
  const id = pg(sql);
  // Also bump lead status
  if (id) pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=NOW(), updated_at=NOW() WHERE id=${lead.id}`);
  return id ? { ok: true, draft_id: Number(id) } : { error: 'insert_failed' };
}

async function processLead(lead) {
  const trail = { lead_id: lead.id, company: lead.company };
  // Step 1: Gemini enrichment (if missing domain/contact)
  if (!lead.domain || !lead.sector) {
    trail.enrichment = await enrichLead(lead);
    // Re-fetch updated row
    const updated = pg(`SELECT id::text, company, COALESCE(domain, ''), COALESCE(sector, '') FROM leads WHERE id=${lead.id}`);
    if (updated) { const [id, company, domain, sector] = updated.split('\t'); lead = { ...lead, domain: domain || null, sector: sector || null }; }
  }
  // Step 2: Personalisation scan (audit Worker pointers)
  if (lead.domain && lead.sector) trail.scan = runPersonalisationScan(lead);
  // Step 3: Queue Touch 0 email
  trail.touch_0 = queueTouch0(lead);
  return trail;
}

async function run({ limit = 5 } = {}) {
  const leads = fetchPendingLeads(limit);
  console.log(`Auto-trigger chain · ${leads.length} pending leads · ${new Date().toISOString()}`);
  const results = [];
  for (const lead of leads) {
    const r = await processLead(lead);
    results.push(r);
    process.stdout.write(`[${lead.id}] ${lead.company.slice(0,30)}... `);
    if (r.enrichment) process.stdout.write('→ enriched ');
    if (r.scan?.ok) process.stdout.write('→ scanned ');
    if (r.touch_0?.ok) process.stdout.write('→ touch_0_queued');
    process.stdout.write('\n');
    await new Promise(r => setTimeout(r, 4500)); // Gemini rate limit
  }
  return results;
}

if (require.main === module) {
  const limit = Number(process.argv[2] || 3);
  run({ limit }).then(r => console.log(JSON.stringify(r, null, 2).slice(0, 1500))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run, processLead, fetchPendingLeads };
