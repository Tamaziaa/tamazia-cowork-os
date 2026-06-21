#!/usr/bin/env node
'use strict';
// GAP-LEDGER #91: 164 legacy leads have audit_url but NULL audit_slug/audit_hash.
// reconcile.js orphan-audit cleaner is gated on audit_slug IS NOT NULL, so a dead audit_pages row
// never clears the URL and the lead sits unmintable forever. Extract slug/hash from the URL path
// (https://tamazia.co.uk/audit/<slug>/<hash>) via Postgres regexp. Additive + idempotent.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); } catch (e) { return ''; } }

if (!NEON) { console.log('[backfill-audit-slug] no NEON_URL — skip'); process.exit(0); }

const before = pg(`SELECT COUNT(*)::int FROM leads WHERE audit_url IS NOT NULL AND audit_url LIKE '%/audit/%' AND (audit_slug IS NULL OR audit_slug='')`);

const patched = pg(`UPDATE leads SET
    audit_slug = regexp_replace(audit_url, '^.*/audit/([^/?]+)/[^/?]+$', '\\1'),
    audit_hash = regexp_replace(audit_url, '^.*/audit/[^/?]+/([^/?]+)$', '\\1'),
    updated_at  = NOW()
  WHERE audit_url IS NOT NULL
    AND audit_url LIKE '%/audit/%'
    AND audit_url ~ '^.*/audit/[^/]+/[^/]+$'
    AND (audit_slug IS NULL OR audit_slug = '')
  RETURNING 1`);

const count = (patched.match(/\n/g) || []).length + (patched ? 1 : 0);
console.log(`[backfill-audit-slug] backfilled ${count} / ${before} legacy rows with slug+hash from audit_url`);
