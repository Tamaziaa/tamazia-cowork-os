// LLM-to-engine bridge: one interface that queries every part of the compliance engine, so an LLM (or the
// cockpit, or a test) can ask a structured question about a firm and get grounded answers assembled from the
// real engine — attachment (connect), statute retrieval (statute-rag), enforcement history, and the catalogue.
// No priors: every answer is built from live engine output + the DB.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const connectMod = require('./connect.js');
const rag = require('./statute-rag.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return '';
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).toString(); }
  catch (_e) { return ''; }
}
const esc = (s) => String(s == null ? '' : s).replace(/'/g, "''");
let _cat = null;
function catalogue() { if (!_cat) { try { _cat = connectMod.loadCatalogue(); } catch (_e) { _cat = { frameworks: [], rules: [] }; } } return _cat; }

// 1) whatApplies: which frameworks bind this firm, with obligations + statute grounding.
function whatApplies({ jurisdictions, sector, signals, text } = {}) {
  const r = connectMod.connect({ catalogue: catalogue(), jurisdictions: jurisdictions || [], sector: sector || '', signals: signals || {}, text: text || '' });
  const frameworks = (r.frameworks || []).map((f) => f.code || f);
  return {
    frameworks,
    binding: r.binding || {},
    review_candidates: r.review_candidates || [],
    obligations: frameworks.slice(0, 12).map((fw) => ({ framework: fw, statute: rag.retrieve(fw + ' ' + (sector || ''), { law_id: fw, k: 2 }) })),
    jurisdictions: r.jurisdictions || [],
  };
}

// 2) explainFramework: statutory basis (RAG) + recent enforcement for a framework.
function explainFramework(code) {
  const fw = String(code || '').trim(); if (!fw) return null;
  const chunks = rag.retrieve(fw, { law_id: fw, k: 5 });
  const enf = pg("SELECT coalesce(json_agg(row_to_json(t)),'[]') FROM (SELECT authority, action_type, summary, source_url, action_date FROM law_enforcement WHERE law_id='" + esc(fw) + "' LIMIT 5) t");
  let enforcement = []; try { enforcement = JSON.parse((enf || '[]').trim() || '[]'); } catch (_e) {}
  const meta = pg("SELECT coalesce(json_agg(row_to_json(t)),'[]') FROM (SELECT framework_short, jurisdiction, binding_status, coalesce(framework_name,'') AS name FROM framework_versions WHERE framework_short='" + esc(fw) + "' LIMIT 1) t");
  let m = []; try { m = JSON.parse((meta || '[]').trim() || '[]'); } catch (_e) {}
  return { framework: fw, meta: m[0] || null, statute: chunks, enforcement };
}

// 3) statute: free-text statute retrieval (grounding for any LLM prompt).
function statute(query, opts) { return rag.retrieve(query, opts || {}); }

// 4) answer: route a natural-language question to the right engine part (lightweight intent router).
function answer(question, firm = {}) {
  const q = String(question || '').toLowerCase();
  const fwMatch = (q.match(/\b([a-z]{2,}_[a-z0-9_]+)\b/i) || [])[1];
  if (fwMatch && /explain|what is|tell me about|obligation|enforce/.test(q)) return { intent: 'explainFramework', result: explainFramework(fwMatch.toUpperCase()) };
  if (/what (laws|frameworks|regulation).*(apply|bind)|which (laws|frameworks)/.test(q) || (firm && firm.sector)) return { intent: 'whatApplies', result: whatApplies(firm) };
  return { intent: 'statute', result: statute(question, { k: 6 }) };
}

module.exports = { whatApplies, explainFramework, statute, answer, catalogue };
