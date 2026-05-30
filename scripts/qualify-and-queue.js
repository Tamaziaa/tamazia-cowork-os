#!/usr/bin/env node
// Quality gate → auto-send queue. For scraped/enriched leads not yet scored:
//   1. Run the 10-layer quality scorer.
//   2. Persist quality_score / quality_fit / quality_layers.
//   3. If PASS (score>=60, genuine, deliverable contact) AND a Touch-0 draft exists →
//      set status='touch_0_queued' + next_touch_date=today so send-due.js auto-sends Touch 0,
//      then the locked +5d/+10d/+20d follow-up runs automatically.
//   Sponsored ad-runners + dashboard-approved organic leads are eligible. Fails are parked.
//
// Usage: node scripts/qualify-and-queue.js [LIMIT]   default 12

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { scoreLead, PASS } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));
function pg(sql) { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

(async () => {
  const limit = Number(process.argv[2] || 12);
  // Eligible: scraped (sponsored auto, or organic approved) OR aggressive_selected, not yet quality-scored,
  // not wrong-track, has a domain.
  const raw = pg(`
    SELECT id::text, COALESCE(domain,''), COALESCE(sector,''), COALESCE(contact_email,''), COALESCE(contact_confidence::text,'0'),
           COALESCE(scrape_stream,''), COALESCE(ad_intel::text,'{}'), COALESCE(all_socials::text,'{}'), COALESCE(all_emails::text,'[]')
    FROM leads
    WHERE quality_score IS NULL AND COALESCE(domain,'') <> ''
      AND ( scrape_stream='sponsored' OR (scrape_stream='organic_top100' AND verify_status='approved') OR aggressive_selected=TRUE )
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
    ORDER BY priority_score DESC NULLS LAST, id DESC LIMIT ${limit}`);
  if (!raw) { console.log('[qualify] no eligible leads to score.'); return; }
  const leads = raw.split('\n').filter(Boolean).map(l => { const [id, domain, sector, contact_email, cc, scrape_stream, ad_intel, all_socials, all_emails] = l.split('\t'); return { id: Number(id), domain, sector, contact_email, contact_confidence: Number(cc), scrape_stream, ad_intel, all_socials, all_emails }; });

  let passed = 0, failed = 0, queued = 0;
  for (const lead of leads) {
    let q;
    try { q = await scoreLead(lead); } catch (e) { console.log(`  ${lead.domain} score err: ${e.message}`); continue; }
    pg(`UPDATE leads SET quality_score=${q.score}, quality_fit=${q.fit ? 'TRUE' : 'FALSE'}, quality_layers=${esc(JSON.stringify(q.layers))}::jsonb, quality_scored_at=NOW(),
        personalisation_pointers = COALESCE(personalisation_pointers,'{}'::jsonb) || ${esc(JSON.stringify({ top_finding: (q.compliance_gaps && q.compliance_gaps[0]) || (q.seo_gaps && q.seo_gaps[0]) || '', fit: q.fit }))}::jsonb,
        lifecycle_stage=${q.pass ? "'qualified'" : "'low_quality'"} WHERE id=${lead.id}`);
    if (q.pass) {
      passed++;
      // If a Touch-0 draft exists, enter the auto-send cadence
      // B6 gate: never queue a draft that still contains an unfilled token ({firm}, [Decision Maker Name], etc.)
      // V2 Phase-2 gate: ONLY auto-cold-contact firms that genuinely NEED us (FIT) or an exceptional score.
      // Non-FIT passes remain 'qualified' for manual review, never auto-cold-mailed.
      const contactWorthy = q.fit || q.score >= 70;
      const hasDraft = contactWorthy && pg(`SELECT 1 FROM outreach_drafts WHERE lead_id=${lead.id} AND draft_metadata->>'touch'='0' AND send_status='pending' AND draft_body !~ '\\{[a-zA-Z_]+\\}' AND draft_body !~ '\\[[A-Za-z ]+\\]' LIMIT 1`);
      if (hasDraft) { pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE WHERE id=${lead.id}`); queued++; }
    } else { failed++; }
    console.log(`  ${lead.domain.padEnd(30)} score=${q.score} ${q.pass ? 'PASS' : 'fail'}${q.fit ? ' [FIT]' : ''}`);
  }
  console.log(`[qualify] scored ${leads.length} · passed ${passed} · queued-for-send ${queued} · failed ${failed}`);
})().catch(e => { console.error('[qualify] FATAL', e.message); process.exit(1); });
