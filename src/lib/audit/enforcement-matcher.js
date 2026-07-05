'use strict';
// Phase 3.4.2 — enforcement-to-gap matcher (the conversion lever). Given a firm's DETECTED gap (framework + sector),
// find the most relevant REAL fined case in compliance_enforcement so the audit can say "a firm in your sector was
// fined <penalty> for exactly this (source)". Ranking: framework match is required; +sector overlap; +recency.
// Additive + downstream of connect (never changes attachment; shadow-identity trivially holds). Fail-open w/o DB.
const { execFileSync } = require('child_process'); const path = require('path');
let _cache = null;
function _load() {
  if (_cache) return _cache;
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return (_cache = []);
  try {
    const out = execFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'psql'),
      [url, '-tA', '-c', "SELECT matched_law_ids::text, sector_tags::text, COALESCE(breach_type,''), COALESCE(penalty,''), COALESCE(ruling_date::text,''), COALESCE(one_line_summary,''), COALESCE(source_url,'') FROM compliance_enforcement"],
      { encoding: 'utf8' }).toString().trim();
    const _arr = v => { try { const j = JSON.parse(v); return Array.isArray(j) ? j.map(String) : []; } catch (_) { return []; } };
    _cache = out ? out.split('\n').filter(Boolean).map(l => { const [laws, sectors, breach_type, penalty, ruling_date, summary, source_url] = l.split('\t'); return { laws: _arr(laws), sectors: _arr(sectors).map(x => x.toLowerCase()), breach_type, penalty, ruling_date, summary, source_url }; }) : [];
  } catch (_e) { _cache = []; }
  return _cache;
}
function _score(row, framework, sector) {
  if (!row.laws.includes(framework)) return -1;               // framework match REQUIRED (never mismatch the law)
  let s = 100;
  if (sector && row.sectors.includes(String(sector).toLowerCase())) s += 50; // same-sector precedent is far stronger
  if (row.penalty && /[£$€\d]/.test(row.penalty)) s += 20;     // a real monetary penalty is more persuasive
  const t = Date.parse(row.ruling_date || ''); if (!isNaN(t)) s += Math.max(0, 20 - (Date.now() - t) / (365 * 864e5) * 4); // recency decay
  return s;
}
// Best real enforcement precedent for a detected gap, or null. rows injectable for tests.
function matchEnforcement(framework, sector, rows = null) {
  const data = rows || _load(); let best = null, bestScore = -1;
  for (const r of data) { const sc = _score(r, framework, sector); if (sc > bestScore) { bestScore = sc; best = r; } }
  if (!best || bestScore < 0) return null;
  return { framework, penalty: best.penalty || null, breach_type: best.breach_type || null, ruling_date: best.ruling_date || null,
           summary: best.summary || null, source_url: best.source_url || null, same_sector: !!(sector && best.sectors.includes(String(sector).toLowerCase())) };
}
module.exports = { matchEnforcement, _load, _score };
