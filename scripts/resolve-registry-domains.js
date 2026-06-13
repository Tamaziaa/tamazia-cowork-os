#!/usr/bin/env node
// Backfill: resolve official websites for EXISTING registry-sourced leads that are stuck with no domain.
// Registry sources (Companies House / SEC-EDGAR / OpenCorporates / GLEIF) return legal-entity records with no
// website, so those leads were inserted with domain=NULL and can never be enriched/audited/emailed (~250 live).
// This finds them, resolves the site via the same free-first SERP + accuracy guard as the forward S028 path
// (reuses resolveWebsite from the orchestrator), and either fills the domain (so they re-enter qualification) or
// marks status='needs_domain' so they are a visible queue, never silently dead.
//
//   node scripts/resolve-registry-domains.js [LIMIT]      default 100, stalest-first
//
// SAFE + ADDITIVE: only ever ADDS a domain to a NULL-domain lead or sets status='needs_domain'. Never overwrites an
// existing domain, never touches a terminal/suppressed lead, never touches the audit-engine tables. Idempotent:
// a still-unresolved lead is retried on the next run (it still has no domain).
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const { resolveWebsite } = require(path.join(ROOT, 'src', 'skills', 'S028-sourcing-orchestrator', 'scripts', 'run.js'));

const TERMINAL = "('suppressed','dnc','bounced','opted_out','won','lost','duplicate')";

(async () => {
  const limit = Number(process.argv[2] || 100);
  const rows = pg(`
    SELECT id || '\t' || COALESCE(company,'') || '\t' || COALESCE(jurisdiction,'') FROM leads
    WHERE COALESCE(domain,'') = ''
      AND source IN ('companies_house_uk','sec_edgar','opencorporates','gleif')
      AND COALESCE(company,'') <> ''
      AND COALESCE(status,'') NOT IN ${TERMINAL}
    ORDER BY created_at ASC NULLS LAST LIMIT ${limit}`);
  if (!rows) { console.log('[resolve-registry] nothing to resolve (or no NEON_URL).'); return; }
  const leads = rows.split('\n').filter(Boolean).map(r => { const [id, company, jurisdiction] = r.split('\t'); return { id: Number(id), company, jurisdiction }; });
  console.log(`[resolve-registry] ${leads.length} no-domain registry leads to resolve`);

  let resolved = 0, needs = 0;
  for (const l of leads) {
    let dom = null;
    try { dom = await resolveWebsite(l.company, l.jurisdiction); } catch (_e) { dom = null; }
    if (dom) {
      // only fill if STILL null (idempotent / race-safe) and the domain isn't already taken by another lead
      const taken = pg(`SELECT 1 FROM leads WHERE domain=${esc(dom)} LIMIT 1`);
      if (taken === '1') { console.log(`  ${String(l.company).slice(0, 40).padEnd(40)} -> ${dom} (already held by another lead; marking needs_domain)`); pg(`UPDATE leads SET status='needs_domain', updated_at=NOW() WHERE id=${l.id} AND COALESCE(domain,'')=''`); needs++; continue; }
      pg(`UPDATE leads SET domain=${esc(dom)}, status=CASE WHEN status IN ('needs_domain','new') THEN 'sourced' ELSE status END, updated_at=NOW() WHERE id=${l.id} AND COALESCE(domain,'')=''`);
      console.log(`  ${String(l.company).slice(0, 40).padEnd(40)} -> ${dom}`);
      resolved++;
    } else {
      pg(`UPDATE leads SET status='needs_domain', updated_at=NOW() WHERE id=${l.id} AND COALESCE(domain,'')=''`);
      needs++;
    }
    await new Promise(r => setTimeout(r, 400)); // gentle on the free SERP
  }
  console.log(`[resolve-registry] done · ${resolved} resolved · ${needs} still needs_domain (of ${leads.length})`);
})().catch(e => { console.error('[resolve-registry] FATAL', e.message); process.exit(1); });
