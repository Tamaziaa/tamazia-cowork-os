// Content depth scanner · Phase 6.5
// Analyses content quality dimensions search engines actually reward:
//   - readability (Flesch grade), word-count, sentence length
//   - schema.org coverage depth (rich-result eligibility heuristic)
//   - FAQ blocks, HowTo blocks, Product blocks
//   - freshness signals (date elements, copyright year, blog cadence)
//   - keyword presence in title/h1/first 100 words
//   - E-E-A-T markers (author bylines, credentials, citations)

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const E = require('../lib/extract.js');
const SCANNER = 'content_depth';

async function scan({ domain, websiteFacts, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  const home = `https://${domain}/`;
  const r = await fetchWithRetry(home, { timeout: 10000 });
  if (!r.ok) {
    const payload = { domain, ok: false, error: `home_${r.status}` };
    writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: 3600 });
    return payload;
  }
  const html = r.body;
  const text = E.stripTags(html);
  const sentences = text.split(/[.!?]+\s+/).filter(s => s.length > 4);
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
  const flesch = words.length && sentences.length ? (206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length)) : 0;
  const grade = words.length && sentences.length ? (0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59) : 0;

  // Schema coverage
  const schema = E.extractJsonLd(html);
  const types = schema.map(s => pickType(s)).filter(Boolean);
  const flatTypes = Array.from(new Set(types.concat(types.filter(t => Array.isArray(t)).flat()))).filter(Boolean);

  // FAQPage / HowTo / Product / Article / Person / Organization / LocalBusiness / Review
  const richEligible = {
    FAQ: flatTypes.includes('FAQPage'),
    HowTo: flatTypes.includes('HowTo'),
    Product: flatTypes.includes('Product'),
    Article: flatTypes.some(t => /Article|NewsArticle|BlogPosting/.test(String(t))),
    Organization: flatTypes.some(t => /Organization|Corporation|LocalBusiness|LegalService|MedicalBusiness|FinancialService/.test(String(t))),
    Person: flatTypes.includes('Person'),
    Review: flatTypes.some(t => /Review|AggregateRating/.test(String(t))),
    BreadcrumbList: flatTypes.includes('BreadcrumbList'),
    Event: flatTypes.includes('Event')
  };

  // E-E-A-T heuristics
  const authorBylines = (html.match(/by\s+<[^>]+>([\s\S]{2,80}?)<\/[^>]+>|written by ([\w\s\.\-]{3,40})|author:\s*([\w\s\.\-]{3,40})/gi) || []).length;
  const credentialMarkers = (html.match(/\b(llb|llm|aca|fcca|aat|mrics|frsa|chartered|registered|qualified|admitted|barrister|solicitor|partner|fellow)\b/gi) || []).length;
  const citations = (html.match(/<a\b[^>]+href\s*=\s*["'](https?:\/\/[^"']+(?:\.gov\.uk|\.gov|\.ac\.uk|\.edu|\.eu|\.org|wikipedia\.org)\/[^"']*)["']/gi) || []).length;
  const datePublished = !!(html.match(/datepublished|datemodified|<time\b[^>]*\bdatetime/i));
  const copyrightYear = (html.match(/©\s*((?:19|20)\d{2})/) || html.match(/copyright\s+((?:19|20)\d{2})/i) || [])[1] || null;
  const currentYear = new Date().getFullYear();
  const stale = copyrightYear && (currentYear - Number(copyrightYear) >= 2);

  // FAQ block detection (Q&A semantic patterns)
  const faqHints = (html.match(/<(?:h[2-6]|summary|dt)\b[^>]*>\s*(?:Q[:\.]?\s)?[^<>]{8,160}\?\s*<\//gi) || []).length;

  // Sample link analysis (anchor-text quality)
  const allAnchors = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const genericAnchorCount = allAnchors.filter(a => /\b(click here|read more|learn more|here|this|link|more)\b/i.test(E.stripTags(a))).length;

  const issues = [];
  if (words.length < 600) issues.push({ severity: 'P1', id: 'thin_home_content', evidence_url: home, fact: `Home page has ${words.length} words of crawlable text; competitive ranking pages average 1,200+.`, recommendation: `Expand the home page by ~${Math.max(0, 1200 - words.length)} substantive words covering top sector queries.`, citation_url: 'https://backlinko.com/search-engine-ranking' });
  if (grade > 14) issues.push({ severity: 'P2', id: 'reading_grade_too_high', evidence_url: home, fact: `Home-page reading grade is ${grade.toFixed(1)} (post-graduate level).`, recommendation: 'Simplify to grade 10-12 for general audiences; keep technical depth on sub-pages.', citation_url: 'https://readable.com/blog/the-flesch-reading-ease-and-flesch-kincaid-grade-level/' });
  if (!richEligible.Organization) issues.push({ severity: 'P0', id: 'no_org_schema', evidence_url: home, fact: 'No Organization / LocalBusiness / LegalService / MedicalBusiness schema on the home page.', recommendation: 'Add JSON-LD Organization schema with name, address, sameAs (LinkedIn, Companies House URL), areaServed.', citation_url: 'https://developers.google.com/search/docs/appearance/structured-data/local-business' });
  if (!richEligible.FAQ && faqHints >= 3) issues.push({ severity: 'P1', id: 'faq_content_without_schema', evidence_url: home, fact: `Page has ${faqHints} Q&A-shaped headings but no FAQPage schema — Google will not surface them as rich results.`, recommendation: 'Wrap the FAQ section in FAQPage JSON-LD so Google shows it in the SERP.', citation_url: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage' });
  if (authorBylines === 0 && credentialMarkers === 0) issues.push({ severity: 'P1', id: 'no_eeat_markers', evidence_url: home, fact: 'No author bylines or credential markers detected on the home page (E-E-A-T weakness).', recommendation: 'Add author boxes with qualifications and credential links; cite regulatory bodies where relevant.', citation_url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
  if (citations < 2) issues.push({ severity: 'P2', id: 'few_authoritative_citations', evidence_url: home, fact: `Only ${citations} link to authoritative sources (.gov, .ac, peer-reviewed).`, recommendation: 'Cite regulator, statute, and primary-source URLs (gov.uk, sra.org.uk, ico.org.uk) to lift topical authority.', citation_url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
  if (stale) issues.push({ severity: 'P1', id: 'stale_copyright', evidence_url: home, fact: `Copyright footer shows ${copyrightYear}; current year is ${currentYear}.`, recommendation: 'Auto-render the year in the footer template (<script>document.write(new Date().getFullYear())</script>).', citation_url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' });
  if (genericAnchorCount > 6) issues.push({ severity: 'P2', id: 'generic_anchor_text', evidence_url: home, fact: `${genericAnchorCount} anchors use generic text ("click here", "read more").`, recommendation: 'Rewrite anchor text to describe the link target (helps both SEO and accessibility).', wcag: '2.4.4' });
  if (allAnchors.length > 0 && (allAnchors.length - genericAnchorCount) / allAnchors.length < 0.6) {
    // already covered above; skip duplicate
  }

  const payload = {
    domain, ok: true,
    words: words.length, sentences: sentences.length, avg_sentence_words: sentences.length ? Number((words.length / sentences.length).toFixed(1)) : 0,
    flesch_reading_ease: Number(flesch.toFixed(1)), flesch_kincaid_grade: Number(grade.toFixed(1)),
    schema_types: flatTypes, rich_result_eligibility: richEligible,
    eeat: { author_bylines: authorBylines, credential_markers: credentialMarkers, authoritative_citations: citations, has_date_published: datePublished, copyright_year: copyrightYear, stale },
    faq_pattern_count: faqHints,
    anchor_quality: { total: allAnchors.length, generic_count: genericAnchorCount },
    issues
  };
  writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}

function pickType(obj) {
  if (!obj) return null;
  if (obj['@type']) return obj['@type'];
  if (obj['@graph'] && Array.isArray(obj['@graph'])) return obj['@graph'].map(x => x['@type']).filter(Boolean);
  return null;
}

function countSyllables(word) {
  if (!word) return 0; word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return Math.max(1, (m || []).length);
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  scan({ domain: dom }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scan };
