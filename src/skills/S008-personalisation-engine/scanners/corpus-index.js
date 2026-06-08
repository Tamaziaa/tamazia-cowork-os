'use strict';
// WS-B2 — corpus word-index. Scans EVERY word/line of EVERY crawled page (homepage, policy pages, AND blog posts,
// FAQs, testimonials, footers) so a single offending line ANYWHERE on the site is flagged with its exact page URL +
// the verbatim sentence. Two problems it solves vs the legacy first-hit matcher:
//   • Defect A — a prohibited phrase in a page-14 blog post was never reported if the homepage already matched.
//   • Defect B — _stripText ran per rule×page (~400×25 ≈ 10k strips/site). Here each page is stripped ONCE.
// Builds a single `joined` string (pages separated by a record-separator that is also a sentence boundary, so a
// quote never bleeds across pages) + a sorted `segments` array, then maps any regex hit back to (URL, line) via
// binary search. Pure, deterministic, free, zero-dependency. _stripText/_isProse are kept VERBATIM-IN-SYNC with
// scanners/compliance.js (test-corpus-index.js asserts identical output, so the index and the legacy quote path
// can never silently drift).

const RS = '␞'; // record separator between pages — included in the sentence-boundary set below
const JOIN_CAP = 600000; // same ceiling scan() uses for corpusText, so the index never blows memory at 2-3k/day

// ── verbatim from scanners/compliance.js (kept in sync by test-corpus-index.js) ──────────────────────────────
function _stripText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
const _PROSE_WORDS = /\b(the|a|an|of|to|your|our|we|you|is|are|was|were|will|may|can|must|with|for|that|this|and|or|but|if|when|how|all|any|please|do|not|no|on|in|at|by|as|it|they|their|these|those|because|so|than|then|from|have|has|had)\b/gi;
function _isProse(str) {
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length < 6 || words.length > 60) return false;
  if (/\b(menu|toggle|skip to|breadcrumb|navigation)\b/i.test(str)) return false;
  const fn = (str.match(_PROSE_WORDS) || []).length;
  if (fn < 3) return false;
  const lower = words.filter(w => /^[a-z]/.test(w)).length;
  if (lower / words.length < 0.5) return false;
  if (fn / words.length < 0.15) return false;
  let run = 0; for (const w of words) { if (/^[A-Z][a-zA-Z]{1,}$/.test(w)) { run++; if (run >= 3) return false; } else run = 0; }
  return true;
}
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Sentence/line boundaries — identical set to _extractQuote in compliance.js (. ! ? • newline) plus the RS.
function splitSentences(text) {
  return String(text || '').split(/[.!?•\n␞]+/).map(s => s.trim()).filter(Boolean);
}

// Build the per-site word index ONCE (right after the corpus is gathered).
function buildCorpusIndex(corpus) {
  const segments = []; const parts = []; let gLen = 0; let capped = false;
  for (let p = 0; p < (corpus || []).length && !capped; p++) {
    const url = corpus[p].url;
    const lines = splitSentences(_stripText(corpus[p].body || ''));
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const gStart = gLen;
      const piece = line + ' ';
      parts.push(piece); gLen += piece.length;
      segments.push({ pageIdx: p, url, lineIdx: li, gStart, gEnd: gLen, text: line, prose: _isProse(line) });
      if (gLen >= JOIN_CAP) { capped = true; break; }
    }
    parts.push(RS); gLen += RS.length; // page boundary so no quote crosses pages
  }
  return { segments, joined: parts.join(''), capped };
}

// Map a global joined-offset back to its {url, lineIdx, text, prose} segment — O(log n).
function locateSegment(segments, offset) {
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1; const s = segments[mid];
    if (offset < s.gStart) hi = mid - 1;
    else if (offset >= s.gEnd) lo = mid + 1;
    else return s;
  }
  return null;
}

// Run a rule's regex across the WHOLE site in one pass; return every located occurrence (capped for safety).
// `proseOnly` keeps only genuine sentences (drops nav/footer boilerplate) for client-facing evidence.
function scanRuleGlobal(re, index, { max = 500, proseOnly = false } = {}) {
  let rx;
  try { rx = new RegExp(re.source, re.flags && re.flags.includes('g') ? re.flags : (re.flags || '') + 'g'); } catch (_e) { return []; }
  rx.lastIndex = 0; const out = []; let m; let guard = 0;
  while ((m = rx.exec(index.joined)) && guard++ < 200000) {
    if (m.index === rx.lastIndex) rx.lastIndex++; // zero-width-match guard
    const seg = locateSegment(index.segments, m.index);
    if (seg && (!proseOnly || seg.prose)) out.push({ url: seg.url, line_index: seg.lineIdx, matched: String(m[0]).slice(0, 80), line: seg.text, prose: seg.prose });
    if (out.length >= max) break;
  }
  return out;
}

// Cheap literal pre-filter: longest [a-z]{4,} token in a pattern; if it isn't in the joined text the regex can't
// match, so most of ~400 rules short-circuit per site (the biggest throughput win). Returns true if it MIGHT match.
function mightMatch(pattern, joinedLower) {
  const lits = String(pattern || '').toLowerCase().match(/[a-z]{4,}/g);
  if (!lits || !lits.length) return true; // no usable literal (char classes etc.) → don't pre-filter
  let longest = ''; for (const l of lits) if (l.length > longest.length) longest = l;
  return joinedLower.includes(longest);
}

module.exports = { buildCorpusIndex, locateSegment, scanRuleGlobal, splitSentences, mightMatch, _stripText, _isProse, RS };
