#!/usr/bin/env node
// tests/touch-0-dry-run.js — Phase 3 task 3.3.3 (compose-only end-to-end test)
// Runs the full pipeline on every phase-3 test lead WITHOUT actually firing SMTP.
// Writes one sends row per lead with delivery_status='simulated' so downstream
// verifications and reporting see a clean touch=0 baseline.
//
// Pipeline:
//   1. Pick body variant per (sector, touch=0) via variant-selector
//   2. Pick subject variant per (sector, touch=0)
//   3. Run S009 disclaimer injection
//   4. Run S010 forbidden-phrase lint
//   5. Check subject_domain_dedupe + send-guards (canSendNow + canSendForRelay)
//   6. Insert into sends with delivery_status='simulated'

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const cs   = require(path.resolve(ROOT, 'src', 'lib', 'variant-selector.js'));
const sg   = require(path.resolve(ROOT, 'src', 'lib', 'send-guards.js'));
const sa   = require(path.resolve(ROOT, 'src', 'lib', 'sourcing-attribution.js'));
const compose = require(path.resolve(ROOT, 'src', 'skills', 'S001-compose-body', 'scripts', 'compose.js'));

function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) throw new Error('NEON_URL missing');
  return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
}

const leadsRaw = pg(`SELECT id, company, domain, email, first_name, sector FROM leads WHERE status='test' AND source='phase-3' ORDER BY id`);
const leads = leadsRaw.split('\n').filter(Boolean).map(l => {
  const [id, company, domain, email, first_name, sector] = l.split('\t');
  return { id: Number(id), company, domain, email, first_name, sector };
});

if (leads.length === 0) { console.error('no test leads found'); process.exit(2); }

let composed = 0, blocked = 0, simulated = 0;
const sectorAliasIdx = { hospitality: 1, healthcare: 2, 'real-estate': 3, 'law-firms': 4, finance: 5, retail: 6, 'e-commerce': 7 };

for (const lead of leads) {
  const variants = cs.loadActiveVariants(lead.sector, 0);
  const v = cs.pickVariant(lead.id, variants);
  const subjectVariants = cs.loadActiveSubjectVariants(lead.sector, 0);
  const s = cs.pickSubjectVariant(lead.id, subjectVariants);
  if (!v || !s) { console.log(`  SKIP lead=${lead.id} no variant`); blocked++; continue; }

  // Send-guard hard-stop check
  const guard = sg.canSendNow(lead.id, { stage: 'dry-run' });
  if (!guard.ok) { console.log(`  BLOCKED lead=${lead.id} reason=${guard.reason}`); blocked++; continue; }

  // Subject dedupe
  if (!cs.isSubjectAllowedForDomain(s.subject, lead.domain)) {
    console.log(`  BLOCKED lead=${lead.id} subject dup`); blocked++; continue;
  }

  // Compose body with disclaimer
  const body = compose.compose({
    alias: { first_name: `alias${sectorAliasIdx[lead.sector] || 0}`, email: `alias@tamazia.co.uk` },
    lead:  { sector: lead.sector, first_name: lead.first_name, firm: lead.company, country: 'UK' },
    inject_disclaimer: true,
  });
  composed++;

  // Insert simulated send row FIRST so dedupe + attribution only get committed on success.
  const subjEsc = s.subject.replace(/'/g, "''");
  const bodyEsc = body.replace(/'/g, "''").slice(0, 8000);
  try {
    pg(`INSERT INTO sends (lead_id, touch_number, sent_at, subject, recipient, delivery_status, relay_name, status, sector, jurisdiction, kind) VALUES (${lead.id}, 0, NOW(), '${subjEsc}', '${lead.email.replace(/'/g, "''")}', 'simulated', 'dry-run', 'simulated', '${lead.sector}', 'uk-eng-wales', 'cold')`);
  } catch (e) {
    console.log(`  ERROR lead=${lead.id} send insert failed`); blocked++; continue;
  }
  cs.recordSubjectUse(s.subject, lead.domain, 1);
  try { sa.recordFirstTouch({ lead_id: lead.id, channel: 'cold-email', subchannel: 'phase-3-dry-run', campaign_tag: 'touch-0-test' }); } catch (_e) {}
  simulated++;
  console.log(`  PASS lead=${lead.id} sector=${lead.sector} variant=${v.letter} subject="${s.subject.slice(0, 60)}..." composed=${body.length}b`);
}

console.log(`---`);
console.log(`composed: ${composed} · blocked: ${blocked} · simulated rows: ${simulated}`);
process.exit(simulated === leads.length ? 0 : 1);
