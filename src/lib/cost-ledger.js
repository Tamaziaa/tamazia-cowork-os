// Lightweight per-run cost/usage ledger. One Neon HTTP insert per call, never throws, self-provisions.
// Engines call logUsage('serper', n, {...}) once at the end of a run so spend/usage is auditable per cycle.
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
let _ensured = false;
async function sql(query) {
  if (!NEON) return { ok: false };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', { method: 'POST', headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, params: [] }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false };
    const d = await r.json(); return { ok: true, rows: d.rows || d.results || [] };
  } catch (_) { return { ok: false }; }
}
const esc = v => String(v == null ? '' : v).replace(/'/g, "''");
async function ensure() { if (_ensured) return; _ensured = true; await sql(`CREATE TABLE IF NOT EXISTS cost_ledger (id BIGSERIAL PRIMARY KEY, source TEXT, units NUMERIC DEFAULT 0, meta JSONB DEFAULT '{}'::jsonb, run_at TIMESTAMPTZ DEFAULT NOW())`); }
async function logUsage(source, units = 1, meta = {}) {
  try { await ensure(); const u = Number(units) || 0; await sql(`INSERT INTO cost_ledger (source, units, meta) VALUES ('${esc(source)}', ${u}, '${esc(JSON.stringify(meta || {}))}'::jsonb)`); } catch (_) {}
}
// Month-to-date sum of `units` for a source (e.g. USD spent on 'apify'). Powers the Apify cost governor.
async function monthSpend(source) {
  try { await ensure(); const r = await sql(`SELECT COALESCE(SUM(units),0) AS s FROM cost_ledger WHERE source='${esc(source)}' AND run_at >= date_trunc('month', NOW())`); return (r.ok && r.rows && r.rows[0]) ? Number(r.rows[0].s || 0) : 0; } catch (_) { return 0; }
}
module.exports = { logUsage, monthSpend };
