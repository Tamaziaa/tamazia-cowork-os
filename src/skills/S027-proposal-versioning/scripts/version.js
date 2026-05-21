#!/usr/bin/env node
// S027 proposal-versioning · Phase 5 task 5.9.1
// Creates a new proposal_versions row per audit page. The PDF rendering itself is handled by
// src/lib/pdf-renderer.ts at deploy time; this skill creates the metadata row and bumps the
// version number, marking older versions as superseded.

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.resolve(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}

function nextVersion(audit_page_id) {
  const raw = pg(`SELECT COALESCE(MAX(version),0)+1 FROM proposal_versions WHERE audit_page_id=${audit_page_id}`);
  return raw ? Number(raw) : 1;
}

function create({ audit_page_id, lead_id, template_id, tier, total_value_gbp, body_text, pdf_url, notes }) {
  const v = nextVersion(audit_page_id);
  pg(`UPDATE proposal_versions SET superseded_at = NOW() WHERE audit_page_id = ${audit_page_id} AND superseded_at IS NULL`);
  const esc = x => x === null || x === undefined ? 'NULL' : `'${String(x).replace(/'/g, "''")}'`;
  pg(`INSERT INTO proposal_versions (workspace_id, audit_page_id, lead_id, version, template_id, tier_chosen, total_value_gbp, body_text, pdf_url, notes) VALUES (1, ${audit_page_id}, ${lead_id || 'NULL'}, ${v}, ${esc(template_id)}, ${esc(tier)}, ${total_value_gbp || 'NULL'}, ${esc(body_text)}, ${esc(pdf_url)}, ${esc(notes)})`);
  return { audit_page_id, version: v, template_id };
}

function list(audit_page_id) {
  const raw = pg(`SELECT id, version, template_id, tier_chosen, total_value_gbp, created_at, superseded_at FROM proposal_versions WHERE audit_page_id = ${audit_page_id} ORDER BY version DESC`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [id, version, template_id, tier_chosen, total_value_gbp, created_at, superseded_at] = line.split('\t');
    return { id: Number(id), version: Number(version), template_id, tier_chosen, total_value_gbp: total_value_gbp ? Number(total_value_gbp) : null, created_at, superseded: superseded_at !== '' && superseded_at !== 'NULL' };
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--audit-page-id') out.audit_page_id = Number(argv[++i]);
    else if (argv[i] === '--lead-id') out.lead_id = Number(argv[++i]);
    else if (argv[i] === '--template-id') out.template_id = argv[++i];
    else if (argv[i] === '--tier') out.tier = argv[++i];
    else if (argv[i] === '--total-value-gbp') out.total_value_gbp = Number(argv[++i]);
    else if (argv[i] === '--list') out.list = true;
    else if (argv[i] === '--create') out.create = true;
  }
  return out;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.audit_page_id) { console.error('--audit-page-id required'); process.exit(2); }
  if (opts.list) console.log(JSON.stringify(list(opts.audit_page_id), null, 2));
  else if (opts.create) console.log(JSON.stringify(create(opts), null, 2));
  else { console.error('Usage: version.js --audit-page-id N --create [--template-id X --tier Y --total-value-gbp Z]  |  --list'); process.exit(2); }
}

module.exports = { create, list, nextVersion };
