// Instagram handle finder · no key, no Instagram login.
// DuckDuckGo HTML site:instagram.com search. Ranked by name + company match in title/snippet.

const { ddgSearch, hasWord } = require('./linkedin-finder.js');

// gap-fix: WORD-BOUNDARY token match (was raw `t.includes(name)`), same false-positive class as linkedin-finder —
// a short first/last/company token substring-matched inside unrelated words and inflated the handle score.
function scoreCandidate({ first, last, company }, candidate) {
  let score = 0;
  const t = (candidate.title + ' ' + candidate.snippet).toLowerCase();
  if (first && hasWord(t, first)) score += 25;
  if (last && hasWord(t, last)) score += 25;
  if (company && hasWord(t, company)) score += 35;
  if (candidate.url && /instagram\.com\/[A-Za-z0-9_.]+/i.test(candidate.url) && !candidate.url.includes('/p/') && !candidate.url.includes('/reel/')) score += 15;
  return score;
}

function extractHandle(url) {
  if (!url) return null;
  const m = url.match(/instagram\.com\/([A-Za-z0-9_.]+)\/?/);
  if (!m) return null;
  const h = m[1];
  if (['p', 'reel', 'explore', 'stories', 'tv'].includes(h.toLowerCase())) return null;
  return '@' + h;
}

async function findHandle({ first, last, company }) {
  if (!first && !last && !company) return { found: false, candidates: [] };
  const q = `site:instagram.com "${company || (first + ' ' + last)}"`;
  const results = await ddgSearch(q);
  const candidates = results
    .filter(r => r.url && r.url.includes('instagram.com/'))
    .map(r => ({ ...r, handle: extractHandle(r.url), score: scoreCandidate({ first, last, company }, r) }))
    .filter(r => r.handle)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    found: candidates.length > 0 && best && best.score >= 40,
    confidence: best ? Math.min(0.9, best.score / 100) : 0,
    instagram_handle: best ? best.handle : null,
    candidates: candidates.slice(0, 5)
  };
}

module.exports = { findHandle };

if (require.main === module) {
  (async () => {
    const r = await findHandle({ first: 'Aman', last: 'Pareek', company: 'tamaziauk' });
    console.log('Instagram handle finder:', JSON.stringify(r, null, 2));
  })();
}
