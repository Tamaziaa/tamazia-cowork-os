#!/usr/bin/env node
'use strict';
/**
 * One-shot additive DDL migration: adds enrichment columns to leads table.
 * Safe to re-run (IF NOT EXISTS). Never drops or modifies existing columns.
 *
 *   node scripts/migrate-enrichment-columns.js
 *
 * Columns added:
 *   leads.domain_rating       NUMERIC         — Ahrefs domain rating (0-100)
 *   leads.organic_traffic     INTEGER         — estimated monthly organic visits (Ahrefs)
 *   leads.ahrefs_checked_at   TIMESTAMPTZ     — last time Ahrefs was queried for this domain
 *   leads.apollo_enriched_at  TIMESTAMPTZ     — last time Apollo was queried for this domain
 *
 * These columns are also registered in schema/canonical-schema.json so ensure-schema.js
 * will provision them on its next run if this script hasn't already done so.
 */

const path = require('path');
const fs   = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Load .env
(() => {
  try {
    for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_) {}
})();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;

const MIGRATIONS = [
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS domain_rating      NUMERIC',
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS organic_traffic    INTEGER',
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS ahrefs_checked_at  TIMESTAMPTZ',
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_enriched_at TIMESTAMPTZ',
];

async function sql(query) {
  if (!NEON) return { ok: false, error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', {
      method: 'POST',
      headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, params: [] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).message || ''; } catch (_) {}
      return { ok: false, error: `http_${r.status}${m ? ':' + m : ''}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'exception' };
  }
}

async function main() {
  if (!NEON) {
    console.error('[migrate-enrichment-columns] NEON connection string not set — skipping (fail-open)');
    process.exit(0);
  }

  let ok = 0; let errs = 0;
  for (const ddl of MIGRATIONS) {
    const col = ddl.match(/ADD COLUMN IF NOT EXISTS (\S+)/)?.[1] || ddl;
    const r = await sql(ddl);
    if (r.ok) {
      console.log(`  OK  leads.${col}`);
      ok++;
    } else {
      console.warn(`  ERR leads.${col}: ${r.error}`);
      errs++;
    }
  }

  console.log(`[migrate-enrichment-columns] done — ${ok} applied, ${errs} error(s)`);
  // Fail-open: errors are logged but never block the pipeline
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate-enrichment-columns] fatal:', err.message);
  process.exit(0); // still fail-open
});
