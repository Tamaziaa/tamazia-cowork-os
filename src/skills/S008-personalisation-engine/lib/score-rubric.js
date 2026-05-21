// Per-pointer quality scoring rubric · Phase 6 task 6.2.2
// Each pointer is scored on a 0-1 scale across SIX dimensions, then averaged.
// The bucket-level score is the arithmetic mean of accepted pointers in that bucket.
// The scan-level "specificity_score" is the weighted average across all five buckets.
//
// Dimensions:
//   1. specificity  — does it cite a concrete number, URL, or framework code?
//   2. action_clarity — does the recommendation say WHAT to do, not just WHY?
//   3. severity_fit — P0/P1/P2 matches the underlying scanner finding
//   4. brevity     — fact ≤ 200 chars, recommendation ≤ 180 chars
//   5. provenance  — evidence_url is present and on the target domain (not a synthetic URL)
//   6. uniqueness  — pointer fact does not duplicate another pointer in the same scan
//
// Output per pointer: { score, breakdown, deductions }
// Output per scan:    { specificity_score, buckets: { website:{score,n}, ... } }

// 10-bucket weighting · compliance and SEO weighted heaviest because they drive deal close
const BUCKET_WEIGHTS = {
  compliance:     0.22,
  seo:            0.16,
  technical_seo:  0.12,
  content_depth:  0.10,
  security:       0.10,
  accessibility:  0.08,
  tls_dns:        0.07,
  website:        0.06,
  public_records: 0.05,
  ad_intel:       0.04
};

function scorePointer(p, opts = {}) {
  const breakdown = {};
  let deductions = [];

  // 1. Specificity: must contain at least one of (URL with path, ≥2-digit number, framework code, named entity ≥ 6 chars)
  const fact = p.fact || '';
  const hasUrl = /https?:\/\/\S+\/\S+/.test(fact + ' ' + (p.evidence_url || ''));
  const hasNum = /\b\d{2,}\b/.test(fact);
  const hasFwk = /\b(UK_[A-Z_0-9]+|EU_[A-Z_0-9]+|US_[A-Z_0-9]+|A\d{1,2}\.\d{1,2}\.[a-z])\b/.test(fact + ' ' + (p.citation || ''));
  let specificity = 0;
  if (hasUrl) specificity += 0.4;
  if (hasNum) specificity += 0.3;
  if (hasFwk) specificity += 0.3;
  specificity = Math.min(1, specificity);
  if (!hasUrl && !hasNum && !hasFwk) deductions.push('no_specific_evidence');
  breakdown.specificity = Number(specificity.toFixed(2));

  // 2. Action clarity: recommendation must include a verb in the first 10 words AND a measurable change
  const rec = p.recommendation || '';
  const recHead = rec.split(/\s+/).slice(0, 10).join(' ').toLowerCase();
  const startsWithVerb = /\b(add|remove|replace|fix|update|publish|install|migrate|reduce|increase|trim|extend|set|generate|submit|disclose|cite|optimise|optimize|move|consolidate|enable|disable|configure|register|verify|compress|defer|preload|rewrite|implement)\b/.test(recHead);
  const hasMeasurable = /\b(\d+|less than|under|above|over|by|to)\b/.test(rec);
  let action = 0; if (startsWithVerb) action += 0.6; if (hasMeasurable) action += 0.4;
  if (!startsWithVerb) deductions.push('no_action_verb');
  breakdown.action_clarity = Number(action.toFixed(2));

  // 3. Severity fit: scanner_status must match
  // If scanner returned severity, pointer.severity should equal it; else accept any
  let sevFit = 1;
  if (p._source_severity && p._source_severity !== p.severity) { sevFit = 0.5; deductions.push(`severity_mismatch_${p._source_severity}_to_${p.severity}`); }
  breakdown.severity_fit = sevFit;

  // 4. Brevity
  let brev = 0;
  if (fact.length <= 200) brev += 0.5; else deductions.push(`fact_long_${fact.length}`);
  if (rec.length <= 180)  brev += 0.5; else deductions.push(`rec_long_${rec.length}`);
  breakdown.brevity = brev;

  // 5. Provenance: evidence_url present + on target domain
  let prov = 0;
  if (p.evidence_url) prov += 0.5;
  if (p.evidence_url && opts.domain && p.evidence_url.toLowerCase().includes(opts.domain.toLowerCase())) prov += 0.5;
  if (!p.evidence_url) deductions.push('no_evidence_url');
  breakdown.provenance = Number(prov.toFixed(2));

  // 6. Uniqueness handled at bucket level (we need siblings)
  breakdown.uniqueness = 1; // default, downgraded later if duplicate fact appears

  const score = Math.round(((specificity + action + sevFit + brev + prov + 1) / 6) * 1000) / 1000;
  return { score, breakdown, deductions };
}

function scoreScan(pointersByBucket, opts = {}) {
  // De-dupe within bucket on fact prefix
  const buckets = {};
  for (const bucket of Object.keys(pointersByBucket || {})) {
    const list = pointersByBucket[bucket] || [];
    const seenPrefix = new Set();
    const scored = [];
    for (const p of list) {
      const s = scorePointer(p, opts);
      const pfx = String(p.fact || '').slice(0, 40).toLowerCase();
      if (seenPrefix.has(pfx)) { s.breakdown.uniqueness = 0; s.score = Math.round((s.score * 5 + 0) / 6 * 1000) / 1000; s.deductions.push('duplicate_in_bucket'); }
      else seenPrefix.add(pfx);
      scored.push({ ...p, _quality: s });
    }
    const mean = scored.length ? scored.reduce((a, b) => a + b._quality.score, 0) / scored.length : 0;
    buckets[bucket] = { n: scored.length, mean_score: Number(mean.toFixed(3)), pointers: scored };
  }
  // Weighted overall
  let total = 0, weightUsed = 0;
  for (const b of Object.keys(BUCKET_WEIGHTS)) {
    if (buckets[b] && buckets[b].n > 0) { total += BUCKET_WEIGHTS[b] * buckets[b].mean_score; weightUsed += BUCKET_WEIGHTS[b]; }
  }
  const specificity_score = weightUsed ? Number((total / weightUsed).toFixed(3)) : 0;
  return { specificity_score, buckets };
}

module.exports = { scorePointer, scoreScan, BUCKET_WEIGHTS };
