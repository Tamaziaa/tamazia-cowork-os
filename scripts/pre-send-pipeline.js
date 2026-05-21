#!/usr/bin/env node
// Pre-send pipeline · Phase 6.5 closing loop.
// For every lead in 'ready_for_send' that does not yet have a fresh audit URL:
//   1. Run S008 personalisation engine (or skip if pointers < 14 days old AND quality ≥ 0.70)
//   2. Run S025 audit-page-builder to mint a signed /audit/{slug}/{hash} URL with 180-day TTL
//   3. Compute the first-touch personalised sentence via personalisation-injector
//   4. Write back to leads.{audit_url, audit_url_minted_at, audit_first_touch_sentence}
//
// W2 send step then reads these three fields straight from the lead row — no live engine call
// at send time, so it stays fast and idempotent.
//
// CLI:
//   node scripts/pre-send-pipeline.js [--limit 50] [--dry-run] [--lead-id N] [--force]

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function esc(v) { if (v === null || v === undefined) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const { runEngine } = require('../src/skills/S008-personalisation-engine/scripts/run.js');
const { injectorFor } = require('../src/lib/personalisation-injector.js');
const auditBuilder = require('../src/skills/S025-audit-page-builder/scripts/build.js');

const QUALITY_FLOOR = Number(process.env.PERSONALISATION_QUALITY_FLOOR || '0.70');
const FRESH_DAYS = Number(process.env.PERSONALISATION_FRESH_DAYS || '14');

async function processLead(lead, { force } = {}) {
  const t0 = Date.now();
  const log = { lead_id: lead.id, domain: lead.domain, steps: [] };

  // Step 1 · personalisation (skip if fresh)
  let needPersonalisation = force
    || !lead.personalisation_quality_score
    || lead.personalisation_quality_score < QUALITY_FLOOR
    || !lead.personalisation_generated_at;
  if (!needPersonalisation && lead.personalisation_generated_at) {
    const ageMs = Date.now() - new Date(lead.personalisation_generated_at).getTime();
    if (ageMs > FRESH_DAYS * 86400000) needPersonalisation = true;
  }
  if (needPersonalisation) {
    const s = await runEngine({ domain: lead.domain, sector: lead.sector || 'law-firms', country: lead.country || 'UK', company: lead.company, lead_id: lead.id, skip_llm: true });
    log.steps.push({ step: 'personalise', pointers: s.pointer_count, p0: s.pointer_count_p0, score: s.specificity_score });
  } else {
    log.steps.push({ step: 'personalise', skipped: 'fresh' });
  }

  // Step 2 · audit page (reuse existing if not expired; otherwise mint new)
  const existing = pg(`SELECT id, slug, hash, EXTRACT(EPOCH FROM expires_at)::bigint FROM audit_pages WHERE lead_id=${lead.id} AND (expires_at IS NULL OR expires_at > NOW() + INTERVAL '14 days') ORDER BY id DESC LIMIT 1`);
  let slug, hash, expSeconds;
  if (existing && !force) {
    const [id, s, h, exp] = existing.split('\t');
    slug = s; hash = h; expSeconds = Number(exp) || Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
    log.steps.push({ step: 'audit_page', reused: true, audit_id: Number(id), slug, hash });
  } else {
    const built = auditBuilder.build({ lead_id: lead.id, domain: lead.domain, company: lead.company || lead.domain, sector: lead.sector || 'law-firms', country: lead.country || 'UK' });
    slug = built.slug; hash = built.hash; expSeconds = built.signed_exp;
    log.steps.push({ step: 'audit_page', reused: false, slug, hash });
  }
  // Compute signed URL (S025 doesn't persist it — re-signs deterministically from the secret)
  const signed = auditBuilder.signUrl({ slug, hash, lead_id: lead.id, expSeconds });
  const auditUrl = signed.url;

  // Step 3 · personalised first-touch sentence
  const freshLeadRaw = pg(`SELECT id, domain, sector, jurisdiction, company, personalisation_pointers::text, personalisation_quality_score FROM leads WHERE id=${lead.id}`);
  let sentence = '';
  if (freshLeadRaw) {
    const [id, domain, sector, jurisdiction, company, pointersJson, score] = freshLeadRaw.split('\t');
    const fresh = { id: Number(id), domain, sector, country: jurisdiction || 'UK', company, personalisation_pointers: pointersJson, personalisation_quality_score: score ? Number(score) : null, audit_url: auditUrl };
    const inj = injectorFor({ lead: fresh, touchNumber: 1 });
    if (inj.ok) sentence = inj.sentence;
    log.steps.push({ step: 'injector', ok: inj.ok, fallback: inj.fallback, citation: inj.pointer_used?.citation });
  }

  // Step 4 · write back to lead
  pg(`UPDATE leads SET audit_url=${esc(auditUrl)}, audit_url_minted_at=NOW(), audit_first_touch_sentence=${esc(sentence)} WHERE id=${lead.id}`);
  log.audit_url = auditUrl;
  log.first_touch_sentence = sentence;
  log.elapsed_ms = Date.now() - t0;
  return log;
}

async function main({ limit = 50, dryRun = false, leadId = null, force = false } = {}) {
  let where;
  if (leadId) where = `id=${leadId}`;
  else if (force) where = `status IN ('ready_for_send','queued','enriched')`;
  else where = `status IN ('ready_for_send','queued','enriched') AND COALESCE(replied,FALSE)=FALSE AND (audit_url IS NULL OR audit_url_minted_at < NOW() - INTERVAL '90 days')`;

  const raw = pg(`SELECT id, domain, sector, jurisdiction, company, personalisation_quality_score, personalisation_generated_at FROM leads WHERE ${where} AND domain IS NOT NULL AND domain != '' ORDER BY id LIMIT ${Math.max(1, Math.min(200, limit))}`);
  if (!raw) { console.log(JSON.stringify({ ok: true, processed: 0 })); return; }
  const leads = raw.split('\n').filter(Boolean).map(line => {
    const [id, domain, sector, jurisdiction, company, score, gen] = line.split('\t');
    return { id: Number(id), domain, sector, country: jurisdiction || 'UK', company, personalisation_quality_score: score ? Number(score) : null, personalisation_generated_at: gen };
  });

  if (dryRun) { console.log(JSON.stringify({ ok: true, dry_run: true, count: leads.length, leads: leads.slice(0, 10) }, null, 2)); return; }

  const results = [];
  for (const l of leads) {
    try { results.push(await processLead(l, { force })); }
    catch (e) { results.push({ lead_id: l.id, error: e.message || String(e) }); }
  }
  console.log(JSON.stringify({ ok: true, processed: results.length, sample: results.slice(0, 5) }, null, 2));
}

function parseArgs(argv) {
  const out = { limit: 50, dryRun: false, leadId: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]);
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--lead-id') out.leadId = Number(argv[++i]);
    else if (argv[i] === '--force') out.force = true;
  }
  return out;
}

if (require.main === module) {
  main(parseArgs(process.argv.slice(2))).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { processLead, main };
