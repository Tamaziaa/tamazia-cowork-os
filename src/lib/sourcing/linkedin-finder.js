// LinkedIn profile finder · no key, no LinkedIn login required.
// Uses DuckDuckGo HTML site-search (Google rate-limits but DDG is permissive).
// Returns ranked candidate URLs by name + company + jurisdiction match.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function ddgSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 15000, retries: 1 });
  if (!r.ok) return [];
  const results = [];
  // DDG result anchor: <a class="result__a" href="https://duckduckgo.com/l/?uddg=ENCODED_URL"
  // OR direct: <a class="result__a" href="https://linkedin.com/in/...">
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]{0,400}?<a[^>]+class="result__snippet"[^>]*>([\s\S]{0,300}?)<\/a>/g;
  let m;
  while ((m = re.exec(r.body)) !== null && results.length < 15) {
    let href = m[1];
    if (href.startsWith('//')) href = 'https:' + href;
    if (href.includes('duckduckgo.com/l/?uddg=')) {
      try {
        const encoded = href.match(/uddg=([^&]+)/);
        if (encoded) href = decodeURIComponent(encoded[1]);
      } catch (_e) {}
    }
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    const snippet = m[3].replace(/<[^>]+>/g, '').trim();
    results.push({ url: href, title, snippet });
  }
  return results;
}

// gap-fix: WORD-BOUNDARY token match (was raw `t.includes(name)`). A short first/last name ('Al','Jo','Ed','Bo')
// substring-matched inside unrelated words in the title/snippet ('Also','Job','Editor','Board'), inflating the
// score and producing false-positive LinkedIn matches — which then feed channel_linkedin_ready and the Tier-1
// contact gate (LinkedIn is a Tier-1 requirement). A name must appear as a whole word to count.
function hasWord(haystack, needle) {
  const n = String(needle || '').toLowerCase().trim();
  if (!n) return false;
  return new RegExp('(?:^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z0-9]|$)', 'i').test(haystack);
}
function scoreCandidate({ first, last, company, jurisdiction }, candidate) {
  let score = 0;
  const t = (candidate.title + ' ' + candidate.snippet).toLowerCase();
  if (first && hasWord(t, first)) score += 25;
  if (last && hasWord(t, last)) score += 35;
  if (company && hasWord(t, company)) score += 25;
  // URL pattern match for linkedin.com/in/
  if (candidate.url && /linkedin\.com\/in\//i.test(candidate.url)) score += 10;
  if (jurisdiction) {
    const jurMap = { UK: ['united kingdom', 'london', 'manchester', 'edinburgh', 'birmingham'], US: ['united states', 'new york', 'san francisco', 'los angeles', 'chicago'], FR: ['france', 'paris'], DE: ['germany', 'berlin', 'munich'], UAE: ['uae', 'dubai', 'abu dhabi'] };
    const tokens = jurMap[jurisdiction] || [];
    if (tokens.some(tk => t.includes(tk))) score += 5;
  }
  return score;
}

async function findProfile({ first, last, company, jurisdiction }) {
  if (!first && !last) return { found: false, candidates: [] };
  const q = `site:linkedin.com/in/ "${first || ''} ${last || ''}"${company ? ' "' + company + '"' : ''}`;
  const results = await ddgSearch(q);
  const candidates = results
    .filter(r => r.url && r.url.includes('linkedin.com/in/'))
    .map(r => ({ ...r, score: scoreCandidate({ first, last, company, jurisdiction }, r) }))
    .sort((a, b) => b.score - a.score);
  // Best candidate is high-confidence if score >= 70
  const best = candidates[0];
  return {
    found: candidates.length > 0 && best && best.score >= 50,
    confidence: best ? Math.min(0.95, best.score / 100) : 0,
    linkedin_url: best ? best.url : null,
    candidates: candidates.slice(0, 5)
  };
}

module.exports = { findProfile, ddgSearch, hasWord };

if (require.main === module) {
  (async () => {
    const r = await findProfile({ first: 'Aman', last: 'Pareek', company: 'Tamazia', jurisdiction: 'UK' });
    console.log('LinkedIn finder for Aman Pareek (Tamazia, UK):');
    console.log(JSON.stringify(r, null, 2));
  })();
}
