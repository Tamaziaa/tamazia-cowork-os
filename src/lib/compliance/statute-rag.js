// Statute RAG (retrieval over statute_chunks). Uses native Postgres full-text search (websearch_to_tsquery +
// ts_rank) so it needs no external embeddings key and works offline against Neon. Given a natural-language
// query it returns the most relevant statutory-obligation chunks, optionally scoped to a law/framework.
// This grounds LLM stages (fix-writer, exec summary, the #21 engine bridge) in real statute text, not priors.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return '';
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-F', '', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
  catch (_e) { return ''; }
}
const esc = (s) => String(s == null ? '' : s).replace(/'/g, "''");
// Build an OR tsquery from the query terms so retrieval ranks chunks matching ANY term (RAG semantics),
// not only chunks where EVERY term co-occurs (which websearch/plainto require). Stopwords dropped.
const STOP = new Set(('a an the of to and or for in on at by is are be with your you our we they it this that '
  + 'as from can may must not no do does have has must should shall which who what when where how').split(' '));
function orQuery(q) {
  const terms = String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP.has(w));
  const uniq = [...new Set(terms)];
  return uniq.length ? uniq.map((w) => esc(w) + ':*').join(' | ') : '';
}

// retrieve(query, { law_id, jurisdiction, k }) -> [{ law_id, section, chunk_text, score }]
function retrieve(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const k = Math.max(1, Math.min(50, opts.k || 6));
  const where = ["tsv @@ websearch_to_tsquery('english', '" + esc(q) + "')"];
  if (opts.law_id) where.push("law_id = '" + esc(opts.law_id) + "'");
  if (opts.law_ids && Array.isArray(opts.law_ids) && opts.law_ids.length) {
    where.push('law_id IN (' + opts.law_ids.map((x) => "'" + esc(x) + "'").join(',') + ')');
  }
  const parse = (raw) => { try { return JSON.parse((raw || '').trim() || '[]'); } catch (_e) { return []; } };
  const orq = orQuery(q);
  const tsq = orq ? "to_tsquery('english','" + orq + "')" : "plainto_tsquery('english','" + esc(q) + "')";
  const whereFull = ["tsv @@ " + tsq].concat(where.slice(1));
  const sel = "SELECT coalesce(json_agg(row_to_json(t)),'[]') FROM (SELECT law_id, section, left(chunk_text,600) AS chunk_text, round(ts_rank(tsv, " + tsq + ")::numeric,5) AS score FROM statute_chunks WHERE " + whereFull.join(' AND ') + " ORDER BY score DESC, length(chunk_text) ASC LIMIT " + k + ") t";
  let rows = parse(pg(sel));
  return rows.map((r) => ({ law_id: r.law_id, section: r.section, chunk_text: r.chunk_text, score: Number(r.score) || 0 }));
}

// context(query, opts) -> a single grounding string for an LLM prompt (top-k chunks with citations).
function context(query, opts = {}) {
  const rows = retrieve(query, opts);
  if (!rows.length) return '';
  return rows.map((r, i) => `[${i + 1}] (${r.law_id} · ${r.section}) ${r.chunk_text}`).join('\n');
}

module.exports = { retrieve, context };
