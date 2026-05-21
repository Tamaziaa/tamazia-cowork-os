#!/usr/bin/env node
// Phase 6.6 · Materialise per-client email files.
// For each lead with audit_url set, render touch 0/1/2/3 via template-resolver,
// save to client_email_files (DB) + client_email_files/<lead_id>/touch_N.md (disk),
// and update email_sequence_state.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function esc(v) { if (v === null || v === undefined) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const { resolve } = require('../src/lib/template-resolver.js');

const OUTPUT_DIR = path.resolve(ROOT, 'client_email_files');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Business-day calculator (skips Sat + Sun; gov.uk holidays optional via env list)
function addBusinessDays(date, days) {
  const result = new Date(date.getTime());
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

function materialiseLead(leadId) {
  const log = { lead_id: leadId, touches: [] };
  const dir = path.join(OUTPUT_DIR, String(leadId));
  fs.mkdirSync(dir, { recursive: true });

  for (const touch of [0, 1, 2, 3]) {
    try {
      const r = resolve({ lead_id: leadId, touch });
      const filename = `touch_${touch}.md`;
      const filepath = path.join(dir, filename);
      const fileContents = `# Touch ${touch}\nSubject: ${r.subject}\nLead: ${r.lead_id}\nTemplate: ${r.template_id}\nAudit URL: ${r.audit_url}\nRendered: ${new Date().toISOString()}\n\n---\n\n${r.body}\n`;
      fs.writeFileSync(filepath, fileContents);

      // Upsert into client_email_files
      pg(`
        INSERT INTO client_email_files (workspace_id, lead_id, touch_number, subject, body, variant_id, file_path, rendered_at)
        VALUES (1, ${leadId}, ${touch}, ${esc(r.subject)}, ${esc(r.body)}, ${r.template_id}, ${esc(filepath)}, NOW())
        ON CONFLICT (lead_id, touch_number) DO UPDATE SET
          subject = EXCLUDED.subject,
          body = EXCLUDED.body,
          variant_id = EXCLUDED.variant_id,
          file_path = EXCLUDED.file_path,
          rendered_at = NOW(),
          sent_at = NULL
      `);
      log.touches.push({ touch, ok: true, file: filepath });
    } catch (e) {
      log.touches.push({ touch, ok: false, error: e.message || String(e) });
    }
  }

  // Update / insert sequence tracker
  // Schedule: touch 0 = now (or already sent), touch 1 = +3 business days, touch 2 = +7 business days from touch 0, touch 3 = +14 calendar days
  const now = new Date();
  const t1Due = addBusinessDays(now, 3);
  pg(`
    INSERT INTO email_sequence_state (workspace_id, lead_id, current_touch, next_due_at, status)
    VALUES (1, ${leadId}, 0, ${esc(t1Due.toISOString())}, 'pending')
    ON CONFLICT (lead_id) DO UPDATE SET
      current_touch = EXCLUDED.current_touch,
      next_due_at = EXCLUDED.next_due_at,
      status = CASE WHEN email_sequence_state.status IN ('replied','unsubscribed','bounced','manually_handled') THEN email_sequence_state.status ELSE 'pending' END,
      updated_at = NOW()
  `);

  return log;
}

function parseArgs(argv) {
  const out = { lead_id: null, all_test: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lead-id') out.lead_id = Number(argv[++i]);
    else if (argv[i] === '--all-test') out.all_test = true;
    else if (argv[i] === '--leads') out.leads = argv[++i].split(',').map(Number);
  }
  return out;
}

function main(opts) {
  const leads = opts.leads || (opts.all_test ? (() => { const raw = pg(`SELECT id FROM leads WHERE source='phase_6_5_test' OR id IN (2,14) ORDER BY id`); return raw ? raw.split('\n').filter(Boolean).map(Number) : []; })() : (opts.lead_id ? [opts.lead_id] : []));
  if (!leads.length) { console.error('Usage: materialise-client-emails.js --lead-id N | --leads "1,2,3" | --all-test'); process.exit(2); }
  const out = leads.map(materialiseLead);
  console.log(JSON.stringify({ processed: out.length, leads: out }, null, 2));
}

if (require.main === module) main(parseArgs(process.argv.slice(2)));
module.exports = { materialiseLead };
