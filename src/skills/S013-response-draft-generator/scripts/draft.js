#!/usr/bin/env node
// S013 response-draft-generator (production-grade)
// Reads the upstream classifier output, picks the matching response_templates row
// (category × sector), substitutes lead variables, runs S010 forbidden-phrase lint,
// writes a row to response_drafts and returns the draft.
//
// Auto-send eligibility rule (G5 + 3.5.3):
//   category in (HOT_BOOK, WARM_INFO, WARM_TIMING, NURTURE, OBJECTION_FIT, UNSUBSCRIBE) → eligible
//   category in (HOT_PRICE, OBJECTION_BUDGET, OBJECTION_INCUMBENT, REDIRECT)          → requires approval
//   category in (HOSTILE, LEGAL_THREAT)                                               → human-only, never auto-send
//   category = OOO                                                                    → no response generated
//
// Usage:
//   node draft.js --category HOT_BOOK --sector hospitality --lead-first-name John --firm "Apex Hotels"
//   echo '{"category":"WARM_INFO","sector":"healthcare","lead_first_name":"John","firm":"Spire"}' | node draft.js

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const AUTO_SEND_ELIGIBLE = new Set(['HOT_BOOK','WARM_INFO','WARM_TIMING','NURTURE','OBJECTION_FIT','UNSUBSCRIBE']);
const HUMAN_ONLY        = new Set(['HOSTILE','LEGAL_THREAT','OOO']);

function lookupPsqlPath() {
  return path.resolve(ROOT, 'scripts', 'psql');
}
function pgPath() { return lookupPsqlPath(); }

function loadTemplate(category, sector) {
  const psql = lookupPsqlPath();
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || !fs.existsSync(psql)) return null;
  const sql = `SELECT template_id, body_template, subject_template, notes FROM response_templates WHERE active=TRUE AND category='${category}' AND sector='${sector}' LIMIT 1`;
  try {
    const raw = execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    if (!raw) return null;
    const [template_id, body_template, subject_template, notes] = raw.split('\t');
    return { template_id, body_template, subject_template, notes };
  } catch (_e) { return null; }
}

function substitute(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_m, k) => vars[k] != null ? vars[k] : `{${k}}`);
}

function lintForbidden(text) {
  // S010 returns exit 0 if clean, non-zero with violations on stderr.
  const checkJs = path.resolve(ROOT, 'src', 'skills', 'S010-forbidden-phrase-checker', 'scripts', 'check.js');
  try {
    execFileSync('node', [checkJs, '--input', text], { stdio: 'pipe' });
    return { pass: true, violations: [] };
  } catch (e) {
    let parsed = null;
    try { parsed = JSON.parse((e.stdout || '').toString()); } catch (_e) { /* */ }
    return { pass: false, violations: parsed ? parsed.violations : [{ type: 'unknown', matched: '?' }] };
  }
}

function writeDraftRow(row) {
  const psql = lookupPsqlPath();
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || !fs.existsSync(psql)) return null;
  const esc = v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  const sql = `INSERT INTO response_drafts (workspace_id, reply_classification_id, lead_id, template_id, draft_body, draft_subject, word_count, forbidden_pass, status, auto_send_eligible)
    VALUES (1, ${row.reply_classification_id ? row.reply_classification_id : 'NULL'}, ${row.lead_id ? row.lead_id : 'NULL'}, ${esc(row.template_id)}, ${esc(row.draft_body)}, ${esc(row.draft_subject)}, ${row.word_count}, ${row.forbidden_pass ? 'TRUE' : 'FALSE'}, ${esc(row.status)}, ${row.auto_send_eligible ? 'TRUE' : 'FALSE'}) RETURNING id`;
  try {
    const raw = execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
    return raw ? Number(raw) : null;
  } catch (_e) { return null; }
}

function generate(opts = {}) {
  const { category, sector, lead_first_name, firm, lead_id, classification_id, in_memory } = opts;
  if (!category || !sector) throw new Error('category and sector required');

  // HOSTILE / LEGAL_THREAT / OOO → no draft, escalate
  if (HUMAN_ONLY.has(category)) {
    return {
      category, sector,
      auto_send_eligible: false,
      requires_aman: category !== 'OOO',
      requires_danish: category === 'LEGAL_THREAT',
      draft_body: null, draft_subject: null,
      template_id: `${category}_${sector}`,
      status: 'human_only',
      forbidden_pass: true,
      word_count: 0,
      note: category === 'OOO' ? 'OOO detected; lead.replied stays FALSE; sequence continues' : 'route to Aman' + (category === 'LEGAL_THREAT' ? ' + Danish (CLO)' : ''),
    };
  }

  const tpl = in_memory ? null : loadTemplate(category, sector);
  if (!tpl) {
    // in-memory fallback so the verification can run without Neon round-trip
    return {
      category, sector,
      template_id: `${category}_${sector}`,
      draft_body: `(${category} template for ${sector} missing from response_templates)`,
      draft_subject: `Re: ${firm || '{firm}'}`,
      word_count: 0,
      forbidden_pass: false,
      auto_send_eligible: AUTO_SEND_ELIGIBLE.has(category),
      status: 'template_missing',
    };
  }

  const draft_body = substitute(tpl.body_template, { lead_first_name, firm, sector });
  const draft_subject = substitute(tpl.subject_template, { lead_first_name, firm, sector });
  const wc = draft_body.split(/\s+/).filter(Boolean).length;
  const lint = lintForbidden(draft_body);

  const result = {
    category, sector,
    template_id: tpl.template_id,
    draft_body, draft_subject,
    word_count: wc,
    forbidden_pass: lint.pass,
    forbidden_violations: lint.violations,
    auto_send_eligible: AUTO_SEND_ELIGIBLE.has(category) && lint.pass,
    status: 'drafted',
  };
  if (!in_memory) {
    const draftId = writeDraftRow({
      reply_classification_id: classification_id,
      lead_id,
      template_id: tpl.template_id,
      draft_body, draft_subject, word_count: wc,
      forbidden_pass: lint.pass,
      status: 'drafted',
      auto_send_eligible: result.auto_send_eligible,
    });
    result.draft_id = draftId;
  }
  return result;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--category')         out.category = argv[++i];
    else if (argv[i] === '--sector')      out.sector = argv[++i];
    else if (argv[i] === '--lead-first-name') out.lead_first_name = argv[++i];
    else if (argv[i] === '--firm')        out.firm = argv[++i];
    else if (argv[i] === '--lead-id')     out.lead_id = Number(argv[++i]);
    else if (argv[i] === '--classification-id') out.classification_id = Number(argv[++i]);
    else if (argv[i] === '--in-memory')   out.in_memory = true;
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  let opts = parseArgs(argv);
  if (!opts.category) {
    // stdin JSON mode
    let stdin = '';
    process.stdin.on('data', d => stdin += d);
    process.stdin.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(stdin); } catch (_e) { payload = {}; }
      const out = generate(payload);
      process.stdout.write(JSON.stringify(out) + '\n');
    });
    return;
  }
  const out = generate(opts);
  process.stdout.write(JSON.stringify(out) + '\n');
}

module.exports = { generate, AUTO_SEND_ELIGIBLE, HUMAN_ONLY };
if (require.main === module) main();
