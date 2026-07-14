'use strict';
const { htmlToText } = require('../../../lib/util/html-text.js');
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
const PER_PAGE_CAP = 80000;  // per-page budget: one huge page can't crowd later pages out of the index
const JOIN_CAP = 2000000;    // absolute memory ceiling (≈2MB) — 30 pages × 80KB fits, so EVERY page is indexed

// ── verbatim from scanners/compliance.js (kept in sync by test-corpus-index.js) ──────────────────────────────
function _stripText(html) { return htmlToText(html); }   // D-01 (kept in sync with compliance.js)
// ONE DOOR. These used to be duplicated from compliance.js under a "kept in sync" comment.
const { isProse: _isProse, splitSentences } = require('../../../lib/util/prose.js');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Sentence/line boundaries — identical set to _extractQuote in compliance.js (. ! ? • newline) plus the RS.


// Extract the visible TEXT of testimonial/review regions from RAW HTML (before stripping), so the index can mark which
// sentences are a CUSTOMER'S words. A prohibit/claims rule (e.g. "guaranteed", "Harvard-approved") must never quote a
// review as if the FIRM made the claim — that was the misattributed-quote bug. Conservative: only well-known
// review-container markup + schema.org Review. (testimonial-guard-20260629)
function _testimonialText(html) {
  const h = String(html || ''); const out = []; let m, guard = 0;
  const rx = /<(blockquote|figure|div|section|article|li|aside|span)[^>]*(?:class|id|itemprop|itemtype)\s*=\s*["'][^"']*(?:testimonial|reviews?|rating|feedback|client-?say|patient-?say|customer-?say|what-?(?:our-)?\w+-?say|trustpilot|google-?review|wp-block-quote|quote-author|review-?body|star-?rating)[^"']*["'][^>]*>([\s\S]{0,3000}?)<\/\1>/gi;
  while ((m = rx.exec(h)) && guard++ < 120) out.push(_stripText(m[2]));
  const rx2 = /"@type"\s*:\s*"Review"[\s\S]{0,1800}?"reviewBody"\s*:\s*"([^"]{0,900})"/gi;
  while ((m = rx2.exec(h)) && guard++ < 200) out.push(_stripText(m[1]));
  return out.join(' ␞ ').toLowerCase();
}

// Build the per-site word index ONCE (right after the corpus is gathered).
function buildCorpusIndex(corpus) {
  const segments = []; const parts = []; let gLen = 0; let capped = false;
  // Outer loop stops ONLY at the absolute memory ceiling — never on a single page — so EVERY page contributes lines
  // to the index (the every-page guarantee). A per-page budget bounds any one huge page from crowding the rest out.
  for (let p = 0; p < (corpus || []).length && gLen < JOIN_CAP; p++) {
    const url = corpus[p].url;
    const tText = _testimonialText(corpus[p].body || '');   // customer-review text on this page (lowercased)
    const lines = splitSentences(_stripText(corpus[p].body || ''));
    let pageLen = 0;
    for (let li = 0; li < lines.length; li++) {
      if (pageLen >= PER_PAGE_CAP) break;          // per-page budget (don't let one page dominate the index)
      const line = lines[li];
      const gStart = gLen;
      const piece = line + ' ';
      parts.push(piece); gLen += piece.length; pageLen += piece.length;
      // A sentence ≥20 chars that appears verbatim inside the page's testimonial regions is a customer's words.
      const testimonial = line.length >= 20 && tText.length > 0 && tText.includes(line.toLowerCase());
      segments.push({ pageIdx: p, url, lineIdx: li, gStart, gEnd: gLen, text: line, prose: _isProse(line), testimonial });
      if (gLen >= JOIN_CAP) { capped = true; break; } // absolute ceiling only
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
function scanRuleGlobal(re, index, { max = 500, proseOnly = false, skipTestimonial = false } = {}) {
  let rx;
  // force a clean GLOBAL flag set — drop any sticky('y') or duplicate 'g' so lastIndex stepping can't anchor/mis-scan
  try { rx = new RegExp(re.source, 'g' + String(re.flags || '').replace(/[gy]/g, '')); } catch (_e) { return []; }
  rx.lastIndex = 0; const out = []; let m; let guard = 0;
  while ((m = rx.exec(index.joined)) && guard++ < 200000) {
    if (m.index === rx.lastIndex) rx.lastIndex++; // zero-width-match guard
    const seg = locateSegment(index.segments, m.index);
    // skipTestimonial: never attribute a customer's review sentence to the firm (claims/prohibit rules).
    if (seg && (!proseOnly || seg.prose) && !(skipTestimonial && seg.testimonial)) out.push({ url: seg.url, line_index: seg.lineIdx, matched: String(m[0]).slice(0, 80), line: seg.text, prose: seg.prose });
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
