#!/usr/bin/env node
// Phase D · audit-link guarantee for the EXPORT/send path. For each FIT+qualified lead, make sure the
// audit URL is a real, minted, signed, LIVE (HTTP 200) audit. Self-healing: if it is missing/relative/
// broken, mint a fresh one via S025 build() (writes audit_pages + signed URL), then re-verify. Caches
// the result (audit_verified + audit_verified_at, 24h TTL) so the export just filters on the flag and
// stays fast. Anything still unverified after a mint attempt is HELD (audit_verified=FALSE) and flagged
// to the founder, so Mystrika/our relay never receive a lead with a broken audit link.
// Fail-open per lead. Usage: node scripts/verify-audits.js [MINT_CAP]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (_e) { return ''; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const { verifyAuditUrl } = require(path.join(ROOT, 'src/lib/audit/verify-audit-url.js'));
const auditBuilder = require(path.join(ROOT, 'src/skills/S025-audit-page-builder/scripts/build.js'));
let _tg = null; try { _tg = require(path.join(ROOT, 'src/lib/notify/telegram.js')); } catch (_) {}

async function main() {
  const mintCap = Number(process.argv[2]) || 6;
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS audit_verified BOOLEAN DEFAULT FALSE`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS audit_verified_at TIMESTAMPTZ`);

  const raw = pg(`SELECT id::text, COALESCE(company,''), COALESCE(domain,''), COALESCE(sector,'professional-services'), COALESCE(country,'UK'), COALESCE(audit_url,'')
    FROM leads
    WHERE COALESCE(quality_fit, FALSE) = TRUE
      AND COALESCE(lifecycle_stage,'') = 'qualified'
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND (audit_verified_at IS NULL OR audit_verified_at < NOW() - INTERVAL '24 hours' OR COALESCE(audit_verified,FALSE) = FALSE)
    ORDER BY audit_verified_at NULLS FIRST, id DESC
    LIMIT 200`).trim();
  const rows = raw ? raw.split('\n').filter(Boolean).map(r => r.split('\t')) : [];
  if (!rows.length) { console.log('[verify-audits] nothing to (re)verify.'); return; }

  let verified = 0, minted = 0, held = 0, mintsUsed = 0; const heldList = [];
  for (const [id, company, domain, sector, country, auditUrl] of rows) {
    try {
      let url = auditUrl;
      let v = await verifyAuditUrl(url);
      // Self-heal: mint a fresh signed audit if the current one is not a verified live audit (budget-capped).
      if (!v.ok && domain && mintsUsed < mintCap) {
        mintsUsed++;
        try {
          // 45-second timeout per build so one unresponsive site cannot block the whole batch
          const BUILD_TIMEOUT_MS = 45000;
          const buildPromise = auditBuilder.build({ lead_id: Number(id), domain, sector, country, company, env: process.env });
          const b = await Promise.race([buildPromise, new Promise((_, rej) => setTimeout(() => rej(new Error('build timeout')), BUILD_TIMEOUT_MS))]);
          if (b && b.signed_url) {
            url = b.signed_url;
            pg(`UPDATE leads SET audit_url=${esc(url)}, audit_slug=${esc(b.slug)}, audit_hash=${esc(b.hash)} WHERE id=${id}`);
            minted++;
            v = await verifyAuditUrl(url);
          }
        } catch (e) { /* mint failed, fall through to held */ }
      }
      if (v.ok) {
        pg(`UPDATE leads SET audit_verified=TRUE, audit_verified_at=NOW() WHERE id=${id}`);
        verified++;
      } else {
        pg(`UPDATE leads SET audit_verified=FALSE, audit_verified_at=NOW() WHERE id=${id}`);
        held++; heldList.push(`${company || domain} [${id}] ${v.reason}`);
      }
    } catch (e) { console.error('[verify-audits] ' + id + ': ' + e.message); }
  }
  console.log(`[verify-audits] verified ${verified}, minted ${minted}, held ${held} (mint budget used ${mintsUsed}/${mintCap}) of ${rows.length}`);
  if (heldList.length) {
    try { if (_tg) await _tg.send(`Audit guardrail HELD ${heldList.length} FIT lead(s) (no email will send for these until their audit is live):\n- ` + heldList.slice(0, 15).join('\n- '), { parse_mode: '' }); } catch (_) {}
  }
  try { await require(path.join(ROOT, 'src/lib/cost-ledger.js')).logUsage('verify-audits', mintsUsed, { verified, minted, held }); } catch (_) {}
}
if (require.main === module) main().catch(e => { console.error('[verify-audits] fatal (fail-open):', e.message); process.exit(0); });
module.exports = { main };
