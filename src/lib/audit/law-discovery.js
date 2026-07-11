'use strict';
// E-223 (v22.6) — LLM LAW DISCOVERY + SELF-LEARNING CANDIDATE MINING.
// For each (sector, sub_sector, jurisdiction-set) CELL, ask the gated LLM which statutes govern the firm's
// DIGITAL exposure, diff the answer against our own catalogue, and:
//   - matches   -> confirmation signal, logged (raises confidence in the cell, costs nothing downstream);
//   - unmatched -> framework_candidates rows (deduped, frequency-counted) for the human-gated seed pipeline.
// HARD RULES: discovery output NEVER touches connect(), the payload's binding map, or any client-facing
// surface. New law enters the catalogue only through the existing seed path (inactive -> validated -> active).
// TOKEN DISCIPLINE: the answer is a property of the CELL, not the domain — results cache in cell_law_reviews
// keyed (cell, catalogue_version) with a 30-day TTL, so steady-state cost is ~one call per cell per month
// (~a few hundred cells), not per mint. Kill switch: LAW_DISCOVERY=0.
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { gateLLM } = require('../llm/gate.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
const esc = (v) => String(v == null ? '' : v).replace(/'/g, "''");
// Parenthetical acronyms are KEPT (an official name's "(PDPL)" is the strongest match token); brackets and
// legal-boilerplate stopwords are stripped; remaining tokens are SORTED so word order never splits a match
// ("PDPL 45 2021" == "Federal Decree-Law No. 45 of 2021 (PDPL)"). Collisions are scoped by jurisdiction+cell.
const normName = (s) => String(s || '').toLowerCase().replace(/[()]/g, ' ')
  .replace(/\b(the|act|regulation(s)?|law|of|no\.?|federal|decree|directive|eu|uk|us|uae)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).sort().join('-').slice(0, 80);

// Catalogue name index for the diff: framework_short + display names from the committed seed (no DB dependency
// for matching beyond the per-cell code list the caller already has).
let _NAMES = null;
function catalogueNameIndex() {
  if (_NAMES) return _NAMES;
  _NAMES = new Map();
  try {
    const laws = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8'));
    const arr = Array.isArray(laws) ? laws : (laws.laws || []);
    for (const l of arr) {
      const short = l.framework_short || l.short || l.id;
      for (const nm of [l.name, l.title, l.official_name, short]) if (nm) _NAMES.set(normName(nm), short);
    }
  } catch (_e) {}
  return _NAMES;
}

function _rubricFor(jurs, cellCodes) {
  const jset = new Set(jurs.map((j) => String(j).toUpperCase()));
  return (parsed) => {
    const defs = []; let score = 0;
    const laws = parsed && Array.isArray(parsed.laws) ? parsed.laws : null;
    if (laws) score += 3; else defs.push('return strict JSON {"laws":[{"name","jurisdiction","scope_note"}]} and nothing else');
    if (laws) {
      const badJur = laws.filter((l) => !jset.has(String((l && l.jurisdiction) || '').toUpperCase()));
      if (!badJur.length) score += 3; else defs.push('every law\'s "jurisdiction" must be one of [' + [...jset].join(',') + ']; wrong: ' + badJur.map((l) => (l.name || '?') + ':' + l.jurisdiction).join(', ').slice(0, 160));
      if (laws.length >= 3 && laws.length <= 15) score += 2; else defs.push('return between 3 and 15 laws (got ' + laws.length + '); digital exposure of a public website only');
      // Plausibility: the model must REDISCOVER a share of what we already know binds this cell. A model that
      // cannot name our known laws is guessing, and its novel suggestions are untrustworthy.
      const idx = catalogueNameIndex();
      const hit = laws.filter((l) => { const c = idx.get(normName(l && l.name)); return c && cellCodes.has(c); }).length;
      const need = Math.min(2, Math.max(1, Math.floor(cellCodes.size / 6)));
      if (hit >= need || cellCodes.size === 0) score += 2; else defs.push('at least ' + need + ' of the returned laws must be the well-known statutes for this exact cell (you matched ' + hit + '); re-check the core data-protection, consumer and sector-regulator laws');
    }
    return { score, deficiencies: defs };
  };
}

// Main entry. `binding` = the payload's attached framework codes (the cell's known laws).
async function discoverLaws({ sector, sub_sector, jurisdictions, binding, catalogue_version, scan_id }) {
  if (process.env.LAW_DISCOVERY === '0') return null;
  const jurs = [...new Set((jurisdictions || []).map((j) => String(j).toUpperCase()).filter((j) => /^[A-Z]{2,3}$/.test(j)))].slice(0, 3);
  if (!sector || !jurs.length) return null;
  const cellKey = [String(sector), String(sub_sector || ''), jurs.join('+'), String(catalogue_version || '')].join('|').toLowerCase().slice(0, 200);
  try {
    const c = pg(`SELECT matched::text || '~|~' || unmatched::text FROM cell_law_reviews WHERE cell_key='${esc(cellKey)}' AND checked_at > now() - interval '30 days' LIMIT 1`);
    if (c && c.includes('~|~')) { const [m, u] = c.split('~|~'); return { cached: true, matched: JSON.parse(m || '[]'), unmatched: JSON.parse(u || '[]') }; }
  } catch (_e) {}
  const cellCodes = new Set(Object.keys(binding || {}));
  const prompt = [
    'A ' + String(sector).replace(/-/g, ' ') + (sub_sector ? ' (' + String(sub_sector).replace(/-/g, ' ') + ')' : '') +
    ' firm is established in: ' + jurs.join(', ') + '.',
    'List the statutes, regulations and mandatory regulator rules that govern its DIGITAL EXPOSURE ONLY: the public website, online marketing and advertising, e-commerce/booking flows, personal-data collection, cookies, accessibility, and mandatory online disclosures.',
    'EXCLUDE: case law, proposed bills, tax/employment/premises law, and anything not enforceable against the website or online conduct.',
    'Return STRICT JSON only: {"laws":[{"name":"<official short name>","jurisdiction":"<one of ' + jurs.join('|') + '>","scope_note":"<max 10 words>"}]} with 3 to 15 laws, most important first.',
  ].join('\n');
  const g = await gateLLM({
    role: 'extract', system: 'You are a regulatory-scope analyst. Precise official law names only. Strict JSON. No prose.',
    prompt, rubric: _rubricFor(jurs, cellCodes), threshold: 7, max_attempts: 3, max_tokens: 600, scan_id: (scan_id || cellKey) + ':lawdisc',
  });
  if (!g.ok) {
    try { pg(`INSERT INTO cell_law_reviews (cell_key, sector, sub_sector, jurisdictions, catalogue_version, matched, unmatched, score, provider, checked_at) VALUES ('${esc(cellKey)}','${esc(sector)}','${esc(sub_sector || '')}','${esc(jurs.join('+'))}','${esc(catalogue_version || '')}','[]'::jsonb,'[]'::jsonb,${g.score || 0},'gate_dropped',now()) ON CONFLICT (cell_key) DO UPDATE SET score=${g.score || 0}, provider='gate_dropped', checked_at=now()`); } catch (_e) {}
    return { dropped: true, score: g.score, attempts: g.attempts };
  }
  const idx = catalogueNameIndex();
  const matched = [], unmatched = [];
  for (const l of (g.out.laws || []).slice(0, 15)) {
    const short = idx.get(normName(l && l.name));
    if (short) matched.push({ name: l.name, code: short });
    else unmatched.push({ name: String(l.name || '').slice(0, 140), jurisdiction: String(l.jurisdiction || '').toUpperCase().slice(0, 12), scope_note: String(l.scope_note || '').slice(0, 80) });
  }
  try {
    pg(`INSERT INTO cell_law_reviews (cell_key, sector, sub_sector, jurisdictions, catalogue_version, matched, unmatched, score, provider, checked_at)
        VALUES ('${esc(cellKey)}','${esc(sector)}','${esc(sub_sector || '')}','${esc(jurs.join('+'))}','${esc(catalogue_version || '')}','${esc(JSON.stringify(matched))}'::jsonb,'${esc(JSON.stringify(unmatched))}'::jsonb,${g.score},'${esc(g.provider || '')}',now())
        ON CONFLICT (cell_key) DO UPDATE SET matched=EXCLUDED.matched, unmatched=EXCLUDED.unmatched, score=EXCLUDED.score, provider=EXCLUDED.provider, checked_at=now()`);
    for (const u of unmatched) {
      pg(`INSERT INTO framework_candidates (name, name_norm, jurisdiction, sector, sub_sector, scope_note)
          VALUES ('${esc(u.name)}','${esc(normName(u.name))}','${esc(u.jurisdiction)}','${esc(sector)}','${esc(sub_sector || '')}','${esc(u.scope_note)}')
          ON CONFLICT (name_norm, jurisdiction, sector, sub_sector) DO UPDATE SET seen_count = framework_candidates.seen_count + 1, last_seen = now()`);
    }
  } catch (_e) {}
  return { matched, unmatched, score: g.score, attempts: g.attempts, provider: g.provider };
}

module.exports = { discoverLaws, normName, catalogueNameIndex };
