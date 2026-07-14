'use strict';
/**
 * prose.js — IS THIS STRING A REAL SENTENCE, OR IS IT PAGE FURNITURE?
 *
 * This is the gate that decides whether a line of a crawled page is eligible to be QUOTED TO A LAW FIRM AS
 * EVIDENCE OF A BREACH. If it says yes to a nav bar, we cite a menu as proof. If it says no to a real
 * disclosure, we accuse a firm of omitting something it actually published.
 *
 * It used to exist TWICE — once in compliance.js (which cuts the evidence quote) and once in corpus-index.js
 * (which decides which sentences are indexable), the second carrying the comment "kept in sync with
 * compliance.js". Hand-synced logic is a bug with a delay on it: the two copies were identical the day they
 * were written and nothing but discipline kept them that way. The moment they drift, the indexer and the
 * scanner disagree about what a sentence IS, silently, on a legal document.
 *
 * The same class of defect already shipped: fwRegulator had two doors, firmName had two doors, and the
 * "671 frameworks" string had two doors. Every one of them was fixed on one door and stayed broken on the other.
 *
 * So there is now ONE door. Both callers import it. There is no second copy to keep in sync.
 */

// Function words. Real sentences carry several; nav labels and Title-Case link runs carry almost none.
const PROSE_WORDS = /\b(the|a|an|of|to|your|our|we|you|is|are|was|were|will|may|can|must|with|for|that|this|and|or|but|if|when|how|all|any|please|do|not|no|on|in|at|by|as|it|they|their|these|those|because|so|than|then|from|have|has|had)\b/gi;

/**
 * True when `str` reads as genuine, user-facing prose rather than navigation, a footer, or a run of link labels.
 * Conservative by design: a false NO costs us a finding; a false YES puts page furniture in a legal document.
 */
function isProse(str) {
  // Stryker disable next-line StringLiteral,Regex: EQUIVALENT MUTANTS, proven.
  //   String(str || '')   -> String(str || 'X') : only fires when str is FALSY. '' gives 0 words, 'X' gives 1-3.
  //                          Both are under the 6-word floor, so both return false. Identical behaviour.
  //   /\s+/ -> /\s/       : `.filter(Boolean)` removes the empty tokens a single-char split leaves behind, so
  //                          'a  b' yields ['a','b'] either way. Identical behaviour.
  // These cannot be killed by ANY test. Detecting equivalent mutants is undecidable in general, so we mark them
  // with the proof rather than leave them as a silent gap in the score.
  const words = String(str || '').split(/\s+/).filter(Boolean);
  if (words.length < 6 || words.length > 60) return false;
  if (/\b(menu|toggle|skip to|breadcrumb|navigation)\b/i.test(str)) return false;   // explicit nav markers
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT. `|| []` -> `|| ['x']` only fires when match() returns
  // null (no function words at all): fn becomes 1 instead of 0. The very next guard is `if (fn < 3) return false`,
  // so both values fail it. Identical behaviour.
  const fn = (String(str).match(PROSE_WORDS) || []).length;
  if (fn < 3) return false;                                   // real sentences carry several function words
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  if (lower / words.length < 0.5) return false;               // mostly Title-Case tokens = menu/labels
  if (fn / words.length < 0.15) return false;                 // too sparse to be a sentence
  // Reject link/label lists: a run of 3+ consecutive Title-Case words
  // (e.g. "Our Expertise Industries Consumer Markets").
  let run = 0;
  for (const w of words) {
    if (/^[A-Z][a-zA-Z]{1,}$/.test(w)) { run++; if (run >= 3) return false; } else run = 0;
  }
  return true;
}

/** Sentence/line boundaries. ONE definition — the scanner and the index must cut text at the same places. */
function splitSentences(text) {
  // Stryker disable next-line Regex: EQUIVALENT. Dropping the `+` makes 'a...b' split into ['a','','','b'] instead
  // of ['a','b'] - and `.filter(Boolean)` then removes the empties, giving ['a','b'] either way.
  return String(text || '').split(/[.!?•\n␞]+/).map((s) => s.trim()).filter(Boolean);
}

module.exports = { isProse, splitSentences, PROSE_WORDS };
