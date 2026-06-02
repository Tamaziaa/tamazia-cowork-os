#!/usr/bin/env node
'use strict';
// Re-mint existing audit_pages rows onto the CURRENT engine payload (word-level quotes, AI-citation table,
// data-viz inputs, archive fallback for challenge-walled sites). Resumable (skips rows already minted after the
// cutoff) and per-row fail-soft. Usage: node scripts/remint-audits.js [limit] [--since=ISO]
const { execFileSync } = require('child_process');
const path = require('path');
const { buildPayload } = require(path.join(__dirname, '..', 'src', 'skills', 'S025-audit-page-builder', 'scripts', 'build.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const fs = require('fs'); const os = require('os');
function pg(sql) { return execFileSync(path.join(__dirname, 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }); }
function pgFile(sql) { const f = path.join(__dirname, '..', '.remint-' + process.pid + '_' + Date.now() + '.sql'); fs.writeFileSync(f, sql); try { return execFileSync(path.join(__dirname, 'psql'), [NEON, '-f', f], { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 }); } finally { try { fs.unlinkSync(f); } catch (_) {} } }
function q(s) { return String(s == null ? '' : s).replace(/'/g, "''"); }
(async () => {
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  const limit = parseInt(process.argv[2] || '0', 10);
  const sinceArg = (process.argv.find(a => a.startsWith('--since=')) || '').split('=')[1];
  const cutoff = sinceArg || new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // rows minted before this are stale
  const lim = limit ? (' LIMIT ' + limit) : '';
  const raw = pg("SELECT id, domain, sector, country FROM audit_pages WHERE payload_json IS NOT NULL AND (generated_at IS NULL OR generated_at < '" + cutoff + "') ORDER BY id" + lim).trim();
  if (!raw) { console.log('nothing to re-mint (all current as of ' + cutoff + ')'); return; }
  const rows = raw.split('\n').map(l => { const [id, domain, sector, country] = l.split('\t'); return { id, domain, sector, country }; });
  console.log('re-minting ' + rows.length + ' rows (cutoff ' + cutoff + ')');
  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      const payload = await buildPayload({ domain: r.domain, sector: r.sector, country: r.country || 'UK', env: process.env });
      const e = JSON.stringify(payload).replace(/'/g, "''");
      pgFile("UPDATE audit_pages SET payload_json='" + e + "'::jsonb, framework_version='" + q(payload.framework_version) + "', generated_at=now() WHERE id=" + r.id + ";");
      const comp = (payload.pointers || []).filter(p => p.bucket === 'compliance').length;
      const km = payload.keyword_map ? (payload.keyword_map.keywords || []).length : 0;
      ok++; console.log('  OK ' + r.id + ' ' + r.domain + ' comp:' + comp + ' kw:' + km + (payload.via_archive ? ' [archive]' : '') + (payload.ai_citation ? ' [ai-cite]' : ''));
    } catch (e) { fail++; console.log('  FAIL ' + r.id + ' ' + r.domain + ' ' + String(e.message || e).slice(0, 80)); }
  }
  console.log('done. ok=' + ok + ' fail=' + fail);
})().catch(e => { console.error('remint error (non-fatal):', e.message); process.exit(0); });
