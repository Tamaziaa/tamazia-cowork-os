#!/usr/bin/env node
// P2-1b · Daily governor sweep. Releases the day's Tier-1 email-ready batch (100 total, 10x10 per-sector
// round-robin, reset 00:00 UK). The qualifier also releases inline as fresh Tier-1 leads land, but this
// sweep guarantees any qualified-but-held backlog is dealt out fairly once capacity exists (e.g. early in
// the UK day). Read-mostly; the only write is governor_released_at on the chosen leads. SEND stays OFF —
// this gates the QUALIFIED output, not the send. Fail-open.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const governor = require(path.join(ROOT, 'src', 'lib', 'governor.js'));

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const before = governor.snapshot();
  console.log(`[governor] UK day ${before.uk_day} · released ${before.released_today}/${before.daily_total} · remaining ${before.remaining}`);
  console.log(`[governor] available by sector: ${JSON.stringify(before.available)}`);
  const r = governor.releaseToday({ dryRun });
  console.log(`[governor] ${dryRun ? 'DRY-RUN plan' : 'released'} ${r.released} (by sector ${JSON.stringify(r.by_sector || {})})${r.reason ? ' · ' + r.reason : ''}`);
})().catch(e => { console.error('[governor] fatal (fail-open):', e.message); process.exit(0); });
