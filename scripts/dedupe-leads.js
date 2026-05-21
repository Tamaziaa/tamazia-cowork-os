#!/usr/bin/env node
// Lead dedupe · idempotent, NON-destructive. Marks duplicate-domain leads as suppressed (never deletes
// — full history is kept). Primary per domain = most-progressed (replied > quality_score > has-email >
// oldest). Duplicates get lifecycle_stage='duplicate', status='duplicate', duplicate_of=<primary id>,
// which removes them from the send selection without losing the record. Skips leads already replied,
// won, client, or duplicate. Safe to run every cycle.
// Usage: node scripts/dedupe-leads.js

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let NEON = process.env.NEON_URL;
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*NEON_URL\s*=\s*(.+?)\s*$/); if (m) NEON = m[1].replace(/^['"]|['"]$/g, ''); } } catch (_e) {}
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (e) { console.error('pg err:', String(e).slice(0, 160)); return null; } }

function run() {
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS duplicate_of bigint`);
  const order = `COALESCE(replied,FALSE) DESC, quality_score DESC NULLS LAST, (COALESCE(contact_email,'')<>'') DESC, id ASC`;
  const before = Number(pg(`SELECT COUNT(*) FROM leads WHERE status='duplicate'`) || 0);
  pg(`WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY lower(domain) ORDER BY ${order}) rn,
               FIRST_VALUE(id) OVER (PARTITION BY lower(domain) ORDER BY ${order}) primary_id
        FROM leads WHERE COALESCE(domain,'')<>''
      )
      UPDATE leads SET lifecycle_stage='duplicate', status='duplicate', duplicate_of=r.primary_id, updated_at=NOW()
      FROM ranked r
      WHERE leads.id=r.id AND r.rn>1
        AND COALESCE(leads.replied,FALSE)=FALSE
        AND COALESCE(leads.status,'') NOT IN ('duplicate')
        AND COALESCE(leads.lifecycle_stage,'') NOT IN ('won','client','duplicate')`);
  const after = Number(pg(`SELECT COUNT(*) FROM leads WHERE status='duplicate'`) || 0);
  console.log(`Dedupe: marked ${after - before} new duplicate(s) · ${after} suppressed total`);
  return { newly_marked: after - before, total_suppressed: after };
}

if (require.main === module) run();
module.exports = { run };
