'use strict';
// WS-B3 — live enforcement + per-breach panel. For each PROVEN breach a client sees, assemble the 5-part panel the
// founder asked for: [A] where on their site, [B] the EXACT penalty CALIBRATED to recent real fines (not the raw
// statutory maximum — that £17.5M headline for a missing line is a fake metric), [C] the most-recent similar ruling,
// [D] recent enforcement news, [E] the impact — every element traced to an OFFICIAL source_url, or an honest "no
// recent enforcement found in our monitored sources" rather than a fabricated case. Pure + deterministic + free; it
// consumes compliance_enforcement rows (populated by scripts/enforcement-sync.js) + the factual statutory MAP.
const { enforcementFor } = require('../audit/enforcement-map.js');

// Parse a penalty string like "£450,000" / "EUR 1.2M" / "USD 100,000" → a number in its own currency (best-effort).
function _amount(str) {
  const s = String(str || '').replace(/,/g, '');
  const m = s.match(/(?:£|EUR|USD|\$|€|GBP|AED|SAR|QAR)?\s*([\d.]+)\s*(m|million|k|thousand|bn|billion)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]); if (!Number.isFinite(n)) return null;
  const u = (m[2] || '').toLowerCase();
  if (u.startsWith('m')) n *= 1e6; else if (u.startsWith('k') || u === 'thousand') n *= 1e3; else if (u.startsWith('b')) n *= 1e9;
  return n;
}
function _fmt(n) {
  if (n == null) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(Math.round(n));
}
function _median(arr) { const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const i = Math.floor(a.length / 2); return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2; }

// Records relevant to a law: same jurisdiction AND (matched_law_ids includes the law OR same regulator family).
function recordsForLaw(law, records = []) {
  if (!law || !Array.isArray(records)) return [];
  const lid = law.id; const reg = String(law.regulator || '').toLowerCase().split(/[ (]/)[0];
  return records.filter((r) => {
    const ids = Array.isArray(r.matched_law_ids) ? r.matched_law_ids : [];
    if (ids.includes(lid)) return true;
    if (law.jurisdiction && r.jurisdiction && law.jurisdiction !== r.jurisdiction) return false;
    return reg && String(r.entity_named || r.one_line_summary || r.breach_type || '').toLowerCase().includes(reg);
  });
}

// [B] CALIBRATED penalty — recent real fines for this regulator/sector, NOT the statutory max.
function calibratePenalty({ law, records = [] }) {
  const rel = recordsForLaw(law, records).filter((r) => r.penalty);
  const statutory = (law && (law.neon_framework_short || '').split(',')[0] && enforcementFor((law.neon_framework_short || '').split(',')[0])) || (law && law.max_penalty) || null;
  if (rel.length) {
    const amts = rel.map((r) => _amount(r.penalty)).filter(Boolean);
    const med = _median(amts); const recent = rel.slice().sort((a, b) => String(b.ruling_date || '').localeCompare(String(a.ruling_date || '')))[0];
    return {
      basis: 'calibrated_recent_fines',
      headline: med != null ? `Recent ${law.regulator || 'regulator'} penalties have centred around ${_fmt(med)} (median of ${amts.length} published cases)` : (statutory || 'See statutory regime'),
      most_recent: recent ? { penalty: recent.penalty, entity: recent.entity_named || null, date: recent.ruling_date || null, source_url: recent.source_url || null } : null,
      statutory_max: statutory,
      calibrated_from: amts.length,
    };
  }
  // No recent fines collected → show the FACTUAL statutory regime, clearly labelled as the maximum, never as "your fine".
  return { basis: 'statutory_only', headline: statutory ? `Statutory maximum: ${statutory}` : 'Enforced by the regulator per the statute (see citation).', most_recent: null, statutory_max: statutory, calibrated_from: 0 };
}

// The whole per-breach panel for one finding. Honest everywhere — empty sources say so, never invent.
function buildBreachPanel({ law, finding = {}, records = [] }) {
  const rel = recordsForLaw(law, records);
  const byDate = rel.slice().sort((a, b) => String(b.ruling_date || '').localeCompare(String(a.ruling_date || '')));
  const rulings = byDate.filter((r) => (r.classifier || r.breach_type) && r.source_url);
  const news = byDate.filter((r) => /news|press|announce/i.test(String(r.source_feed || r.classifier || '')) && r.source_url);
  const where = finding.evidence_url
    ? { page: finding.evidence_url, quote: finding.evidence_quote || null, occurrence_count: finding.occurrence_count || (finding.occurrences ? finding.occurrences.length : 1) }
    : { page: null, quote: null, note: 'Disclosure absent across all crawled pages.' };
  return {
    law_id: law && law.id, framework: finding.framework || (law && (law.neon_framework_short || '').split(',')[0]), regulator: law && law.regulator,
    where,                                                          // [A]
    penalty: calibratePenalty({ law, records }),                   // [B]
    recent_ruling: rulings[0]                                      // [C]
      ? { summary: rulings[0].one_line_summary || rulings[0].breach_type, entity: rulings[0].entity_named || null, date: rulings[0].ruling_date || null, source_url: rulings[0].source_url }
      : { summary: 'No recent published ruling found for this regulator in our monitored official sources.', source_url: null },
    recent_news: news[0]                                           // [D]
      ? { summary: news[0].one_line_summary || news[0].breach_type, date: news[0].ruling_date || null, source_url: news[0].source_url }
      : { summary: 'No recent enforcement news found in our monitored official sources.', source_url: null },
    impact: _impact(law, finding),                                // [E]
    evidence_basis: rel.length ? 'official_records' : 'statutory_regime_only',
  };
}

// [E] Factual impact statement from severity + the obligation — no speculation, no fabricated numbers.
function _impact(law, finding) {
  const sev = (law && law.severity) || finding.severity || 'Medium';
  const ob = (law && law.website_obligation) || finding.description || 'this obligation';
  const lead = /Critical|P0/i.test(String(sev)) ? 'A breach here is a primary enforcement trigger'
    : /High|P1/i.test(String(sev)) ? 'A breach here materially raises regulatory and reputational exposure'
      : 'A breach here is a documented compliance gap';
  return `${lead}: ${String(ob).replace(/\.$/, '')}. It is also read by AI assistants and search engines assessing the firm's trustworthiness.`;
}

module.exports = { buildBreachPanel, calibratePenalty, recordsForLaw, _amount, _fmt };
