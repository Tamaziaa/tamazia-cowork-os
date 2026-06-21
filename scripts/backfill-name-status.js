#!/usr/bin/env node
// backfill-name-status.js — GAP-LEDGER #36: Phase-2 name resolution for leads stuck at
// name_status='unverified'. Phase-1 (normalise-names.js pure string rules) couldn't resolve
// them; this pass calls resolveName() (async homepage fetch + Companies House + LinkedIn SERP)
// and writes back the clean trading name + updated name_status when it succeeds.
//
// Additive, idempotent, fail-open. Never touches off-limits tables. Bounded via --max (default 150)
// so a nightly run drains ~150 leads without overrunning.
//
//   node scripts/backfill-name-status.js           # up to 150
//   node scripts/backfill-name-status.js --max 50  # cap at 50
//   node scripts/backfill-name-status.js --dry     # print, no writes
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');
function pg(sql) { return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).toString().trim(); }
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

const DRY = process.argv.includes('--dry');
const MAX = (() => { const i = process.argv.indexOf('--max'); return (i >= 0 && /^\d+$/.test(process.argv[i + 1] || '')) ? parseInt(process.argv[i + 1], 10) : 150; })();

const { resolveName } = require(path.join(ROOT, 'src', 'lib', 'sourcing', 'resolve-name.js'));

(async () => {
  if (!NEON) { console.error('[backfill-name-status] no NEON_URL'); process.exit(1); }

  const pending = pg(`SELECT id, domain, company, sector FROM leads
    WHERE name_status = 'unverified'
      AND COALESCE(domain,'') <> ''
      AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
      AND COALESCE(lifecycle_stage,'') NOT IN ('sent','booked','won','lost')
    ORDER BY priority_score DESC NULLS LAST, id DESC
    LIMIT ${MAX}`);

  if (!pending) { console.log('[backfill-name-status] nothing to process'); return; }

  const rows = pending.split('\n').map(l => { const [id, domain, company, sector] = l.split('\t'); return { id, domain, company: company || '', sector: sector || '' }; }).filter(r => r.id && r.domain);
  console.log(`[backfill-name-status] processing ${rows.length} unverified leads (max ${MAX})`);

  let resolved = 0, unchanged = 0, errors = 0;
  for (const row of rows) {
    try {
      const result = await resolveName({ domain: row.domain, raw: row.company, sector: row.sector, tier: 2 });
      if (!result || (result.name_status !== 'resolved' && result.name_status !== 'verified')) {
        unchanged++;
        continue;
      }
      if (DRY) {
        console.log(`  DRY  id=${row.id} "${row.company}" -> "${result.company}" (${result.name_status})`);
        resolved++;
        continue;
      }
      // Update company name only when it actually changed and the resolved name is non-empty.
      const nameChanged = result.company && result.company !== row.company;
      if (nameChanged) {
        pg(`UPDATE leads SET company=${q(result.company)}, name_status=${q(result.name_status)}, name_source=${q(result.name_source || 'resolve')}, name_normalised_at=NOW(), updated_at=NOW() WHERE id=${row.id}`);
      } else {
        // Mark as resolved even without a name change so we don't reprocess it next night.
        pg(`UPDATE leads SET name_status=${q(result.name_status)}, name_normalised_at=NOW(), updated_at=NOW() WHERE id=${row.id}`);
      }
      resolved++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.error(`  ERR  id=${row.id} domain=${row.domain}:`, String(e.message || e).slice(0, 80));
    }
  }
  console.log(`[backfill-name-status] resolved=${resolved} unchanged=${unchanged} errors=${errors} (of ${rows.length})`);
})().catch(e => { console.error('[backfill-name-status] FATAL', e.message); process.exit(0); });
