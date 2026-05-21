#!/usr/bin/env node
// Run S063 deep-research on the highest-priority leads that don't yet have an S063 Touch 0 draft.
// Usage:  node scripts/run-deep-research-batch.js [LIMIT]    default 6

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const { runForLead } = require(path.join(ROOT, 'src', 'skills', 'S063-deep-research', 'scripts', 'research.js'));

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
}

function loadDotenv() {
  const fs = require('fs');
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_e) {}
}

(async () => {
  loadDotenv();
  const limit = Number(process.argv[2] || 6);
  // CRITICAL: S063 runs Tamazia (SEO + compliance) outreach.
  // It must NEVER target LexQuity investor leads, arbitration institutions, or anyone who
  // is part of LexQuity's distribution channel. Those go through S059 lexquity-investor-track.
  const raw = pg(`
    SELECT id::text, company, domain, COALESCE(sector,'') AS sector, COALESCE(jurisdiction,'UK') AS jurisdiction
    FROM leads
    WHERE domain IS NOT NULL AND domain != '' AND length(domain) > 3
      AND COALESCE(sector,'') NOT IN ('lexquity-investor', 'arbitration-institution', 'arbitration-practitioner', 'professional-services', 'internal')
      AND COALESCE(lead_audience,'') NOT IN ('lexquity-investor','arbitration-institution','internal')
      AND COALESCE(company,'') NOT ILIKE '%arbitration%'
      AND COALESCE(company,'') NOT ILIKE '%(ICC)%'
      AND COALESCE(company,'') NOT ILIKE 'Test %'
      AND COALESCE(company,'') NOT ILIKE '%(internal%'
      AND COALESCE(company,'') NOT ILIKE 'Tamazia%'
      AND id NOT IN (
        SELECT DISTINCT lead_id FROM outreach_drafts
        WHERE channel='email' AND draft_metadata->>'touch'='0'
          AND draft_metadata->>'generated_by'='S063_deep_research'
      )
    ORDER BY priority_score DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `);
  const leads = raw.split('\n').filter(Boolean).map(l => {
    const [id, company, domain, sector, jurisdiction] = l.split('\t');
    return { id: Number(id), company, domain, sector, jurisdiction };
  });
  console.log(`Picked ${leads.length} leads for S063 deep-research · parallel mode`);
  const results = await Promise.all(leads.map(async (lead) => {
    try {
      const r = await runForLead(lead);
      console.log(`  · ${lead.company.padEnd(40)} draft_id=${r.draft_id ?? '-'} subject="${(r.touch0?.subject || '(error)').slice(0, 60)}"`);
      return { id: lead.id, company: lead.company, draft_id: r.draft_id, subject: r.touch0?.subject || null, has_body: !!r.touch0?.body };
    } catch (e) {
      console.log(`  · ${lead.company.padEnd(40)} ERROR: ${e.message}`);
      return { id: lead.id, company: lead.company, error: e.message };
    }
  }));
  const ok = results.filter(r => r.draft_id).length;
  console.log(`\nSummary: ${ok}/${leads.length} S063 drafts written`);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
