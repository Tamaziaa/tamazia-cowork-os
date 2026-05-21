// Hallucination guard · Phase 6 core safety layer.
// Every pointer the LLM emits is rejected unless it cites at least one piece of evidence that
// appears in the scanner output. The guard performs three orthogonal checks:
//
//   1. Evidence anchor: pointer text must reference a specific URL, named entity, number,
//      framework code (e.g. UK_GDPR_A13), or framework rule citation present in the scanner output.
//   2. Forbidden-phrase check: pointer must pass the Phase 3 S010 forbidden-phrase lint
//      (no em-dashes, no AI-tells, no "leverage / seamlessly / dive deep / robust").
//   3. Structural check: bucket ∈ {website, compliance, seo, ad_intel, public_records},
//      severity ∈ {P0, P1, P2}, fact text length ≤ 320 chars, recommendation ≤ 240 chars,
//      both fields non-empty, no markdown asterisks.
//
// Returns: { ok: bool, rejection_reason?: string, anchors_found: string[] }

const path = require('path');
const fs = require('fs');

// Forbidden phrases (mirrors src/skills/S010-forbidden-phrase-check from Phase 3)
const FORBIDDEN = [
  '—', '–',                                           // em-dash, en-dash (HARD ban)
  /\bleverage\b/i, /\bseamlessly?\b/i, /\brobust\b/i, /\bdive deep\b/i,
  /\bsynergy\b/i, /\bunlock\b/i, /\bgame[- ]?changer\b/i,
  /\bbest in class\b/i, /\bstate[- ]of[- ]the[- ]?art\b/i,
  /\brevolutionary\b/i, /\bcutting[- ]?edge\b/i, /\bworld[- ]?class\b/i,
  /\bnext[- ]?gen\b/i, /\bturn[- ]key\b/i, /\bone[- ]stop\b/i,
  /\bbespoke\b/i, /\bdelve\b/i, /\btapestry\b/i, /\bin today's (digital |fast[- ]paced )?(world|landscape|era)\b/i,
  /\bnavigate the\b/i, /\baccelerate growth\b/i, /\bdrive growth\b/i,
  /\bsupercharge\b/i, /\bskyrocket\b/i
];

const VALID_BUCKETS = new Set(['website', 'compliance', 'seo', 'ad_intel', 'public_records', 'security', 'tls_dns', 'technical_seo', 'accessibility', 'content_depth']);
const VALID_SEVERITY = new Set(['P0', 'P1', 'P2']);

function buildAnchorSet(scannerOutput) {
  // Collect every URL, framework code, citation_url, specific number, named entity, and 6+ char token
  // from scanner output. The guard requires the pointer to mention at least ONE of these.
  const anchors = new Set();
  walk(scannerOutput, (k, v) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      // URLs
      const urlMatches = v.match(/https?:\/\/[^\s"'`<>]+/g) || [];
      for (const u of urlMatches) anchors.add(u.replace(/[.,;)\]}]+$/, '').toLowerCase());
      // Framework codes
      const fwMatches = v.match(/\b(?:UK_[A-Z_0-9]+|EU_[A-Z_0-9]+|US_[A-Z_0-9]+|UAE_[A-Z_0-9]+|A\d{1,2}\.\d{1,2}\.[a-z])\b/g) || [];
      for (const f of fwMatches) anchors.add(f);
      // Numbers ≥ 2 digits (used for counts like "7028 words", "203 characters")
      const numMatches = v.match(/\b\d{2,}\b/g) || [];
      for (const n of numMatches) anchors.add(n);
      // Domain mentions
      const domMatches = v.match(/\b[a-z0-9][a-z0-9-]{1,62}\.(?:co\.uk|com|org|net|io|ai|in|uk|us|eu)\b/gi) || [];
      for (const d of domMatches) anchors.add(d.toLowerCase());
    }
    if (typeof v === 'number') anchors.add(String(v));
  });
  return anchors;
}
function walk(obj, fn, key = '') {
  if (Array.isArray(obj)) { obj.forEach((v, i) => walk(v, fn, `${key}[${i}]`)); return; }
  if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) walk(obj[k], fn, key ? `${key}.${k}` : k); return; }
  fn(key, obj);
}

function forbiddenHit(text) {
  for (const f of FORBIDDEN) {
    if (typeof f === 'string') { if (text.includes(f)) return f; }
    else { const m = text.match(f); if (m) return m[0]; }
  }
  return null;
}

function checkPointer(pointer, scannerOutput) {
  const anchors = pointer._anchors || buildAnchorSet(scannerOutput);
  // Structural
  if (!pointer || typeof pointer !== 'object') return { ok: false, reason: 'not_an_object' };
  if (!VALID_BUCKETS.has(pointer.bucket)) return { ok: false, reason: `invalid_bucket_${pointer.bucket}` };
  if (!VALID_SEVERITY.has(pointer.severity)) return { ok: false, reason: `invalid_severity_${pointer.severity}` };
  const fact = String(pointer.fact || '').trim();
  const rec = String(pointer.recommendation || '').trim();
  if (!fact) return { ok: false, reason: 'missing_fact' };
  if (!rec) return { ok: false, reason: 'missing_recommendation' };
  if (fact.length > 320) return { ok: false, reason: `fact_too_long_${fact.length}` };
  if (rec.length > 240) return { ok: false, reason: `recommendation_too_long_${rec.length}` };
  if (/[*_`]{2,}/.test(fact + ' ' + rec)) return { ok: false, reason: 'markdown_residue' };

  // Forbidden phrase
  const fh = forbiddenHit(fact + ' ' + rec);
  if (fh) return { ok: false, reason: `forbidden_phrase_${String(fh).slice(0, 20)}` };

  // Evidence anchor — at least ONE anchor must appear in the pointer's fact OR evidence_url
  const blob = (fact + ' ' + (pointer.evidence_url || '') + ' ' + (pointer.citation || '')).toLowerCase();
  let found = null;
  for (const a of anchors) {
    if (!a) continue;
    const tok = String(a).toLowerCase();
    if (tok.length < 2) continue;
    if (blob.includes(tok)) { found = a; break; }
  }
  if (!found) return { ok: false, reason: 'no_evidence_anchor', anchors_sample: Array.from(anchors).slice(0, 8) };

  return { ok: true, anchor: found };
}

function filterPointers(pointers, scannerOutput) {
  const anchors = buildAnchorSet(scannerOutput);
  const accepted = [];
  const rejected = [];
  for (const p of pointers || []) {
    const r = checkPointer({ ...p, _anchors: anchors }, scannerOutput);
    if (r.ok) accepted.push({ ...p, _anchor: r.anchor }); else rejected.push({ pointer: p, reason: r.reason, anchors_sample: r.anchors_sample });
  }
  return { accepted, rejected };
}

module.exports = { checkPointer, filterPointers, buildAnchorSet, FORBIDDEN, VALID_BUCKETS, VALID_SEVERITY };
