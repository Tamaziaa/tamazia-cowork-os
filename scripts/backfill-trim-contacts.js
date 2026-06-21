#!/usr/bin/env node
'use strict';
// GAP-LEDGER #41: 670 leads exceed the 4-contact cap (all_emails JSONB length > 4).
// The "cap 4/co" data minimisation rule was enforced at intake but never backfilled on legacy rows.
// This trims all_emails to the first 4 entries (preserves order so best emails survive), idempotent.
// Runs up to 200/night so a rare Neon DDL lock on a large JSONB update doesn't stall the bundle.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim(); } catch (e) { return ''; } }

if (!NEON) { console.log('[backfill-trim-contacts] no NEON_URL — skip'); process.exit(0); }

const before = pg(`SELECT COUNT(*)::int FROM leads WHERE jsonb_array_length(all_emails) > 4`);

const trimmed = pg(`UPDATE leads
  SET all_emails = (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(all_emails) WITH ORDINALITY AS t(elem, ord) WHERE ord <= 4) sub),
      updated_at = NOW()
  WHERE id IN (
    SELECT id FROM leads
    WHERE all_emails IS NOT NULL
      AND jsonb_typeof(all_emails) = 'array'
      AND jsonb_array_length(all_emails) > 4
      AND COALESCE(status,'') NOT IN ('suppressed','dnc','bounced')
    LIMIT 200
  )
  RETURNING 1`);

const count = (trimmed.match(/\n/g)||[]).length + (trimmed ? 1 : 0);
const remaining = pg(`SELECT COUNT(*)::int FROM leads WHERE jsonb_array_length(all_emails) > 4`);
console.log(`[backfill-trim-contacts] trimmed ${count} / ${before} over-cap contact lists to ≤4 · remaining ${remaining}`);
