#!/usr/bin/env node
// Batch-render the locked 4-touch email cadence (S064 renderAll) for FIT+qualified leads.
// Runs AFTER build-rank-insights (so Touch-0 carries the gated keyword rankings) and BEFORE
// mystrika-export (so every exported lead has fresh, gated Touch 0-3 in outreach_drafts).
// Idempotent (renderAll deletes+reinserts per touch). Fail-open per lead. Usage: node scripts/render-touches.js [LIMIT]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return ''; } }
const { renderAll } = require(path.join(ROOT, 'src/skills/S064-touch-cadence/scripts/render.js'));

async function main() {
  // T1-B04: default batch raised 15 -> 30 (matches the cycle's RENDER_BATCH default) so a direct invocation isn't
  // artificially small and drafts keep pace with the pushable set.
  const limit = Number(process.argv[2]) || 30;
  // T1-B04 ORDER BY PUSH-READINESS: render previously ordered by quality_score only, so it spent its slots on
  // high-score leads that may never push while audit-verified, governor-RELEASED leads sat WITHOUT a Touch-0 draft
  // (the push drops a released+verified lead that has no draft). Prioritise the leads that are actually about to
  // ship: governor-released first, then audit-verified, then a present audit_url, THEN the old rank-insight /
  // quality_score / id keys. So a lead the push is about to send always has a fresh draft. Still writes only
  // outreach_drafts (no re-tier columns), so it stays unguarded in the cycle.
  const raw = pg(`SELECT id::text FROM leads
    WHERE quality_fit = TRUE
      AND COALESCE(lifecycle_stage,'') = 'qualified'
      AND COALESCE(NULLIF(contact_email,''), email, '') <> ''
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
    ORDER BY (governor_released_at IS NOT NULL) DESC,
             COALESCE(audit_verified,FALSE) DESC,
             (COALESCE(audit_url,'') <> '') DESC,
             (rank_insight_sentence IS NOT NULL AND rank_insight_sentence <> '') DESC,
             COALESCE(quality_score,0) DESC NULLS LAST, id DESC
    LIMIT ${limit}`);
  const ids = raw.split('\n').filter(Boolean).map(Number);
  if (!ids.length) { console.log('[render-touches] no FIT+qualified leads with an email to render.'); return; }
  let ok = 0, blocked = 0, err = 0;
  for (const id of ids) {
    try { const r = await renderAll(id); if (r && r.touch0_valid) ok++; else blocked++; }
    catch (e) { err++; console.error('[render-touches] ' + id + ': ' + e.message); }
  }
  console.log(`[render-touches] rendered ${ok} valid, ${blocked} blocked, ${err} errored of ${ids.length}`);
}
if (require.main === module) main().catch(e => { console.error('[render-touches] fatal (fail-open):', e.message); process.exit(0); });
module.exports = { main };
