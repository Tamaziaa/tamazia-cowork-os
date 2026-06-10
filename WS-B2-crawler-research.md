I have everything I need. The ground truth materially changes the recommendation: this repo deliberately uses **Node built-ins only** (no `crawlee`, no `cheerio`, no npm deps beyond an AWS SDK), and already has a working `gatherCorpus` with retry/UA/challenge-detection, JS-reader fallback, Wayback fallback, sitemap+link discovery, and tiered prioritization. The honest plan reconciles the research with that reality rather than bolting on a heavy dependency. Here is the synthesized implementation plan.

---

# Implementation plan — free, full-site, every-word compliance crawler

## 0. The one correction that governs everything

The crawler-repos research recommends `npm i crawlee`. **Do not.** `package.json` states the hard constraint verbatim: *"Node scripts use built-ins only; deps kept minimal so npm install never fails the cycle."* The repo has no `cheerio` and no `crawlee` in `node_modules`, and `gatherCorpus` already does — with zero deps — what Crawlee's `CheerioCrawler` would do: `fetchWithRetry` (Node `fetch` + UA spoofing + challenge detection + retry/backoff in `http.js`), `_discoverLinks` (regex link extraction), `_discoverSitemap` (sitemap + child-sitemap walk), tiered prioritization (`_TIER1`/`_TIER2`), a `_renderViaReader` SPA fallback (r.jina.ai), and a Wayback fallback. Crawlee would be a regression here, not an upgrade.

So the deliverable is **not** "adopt a new crawler library." It is: **extract and harden the crawl logic that already lives inside `compliance.js` into a standalone `site-crawler.js` module, then add the word-level offset index on top.** Crawlee stays as a *documented Tier-2 escape hatch only* if a future SPA wave defeats the existing reader fallback.

---

## (1) #1 recommended free crawler

**Pick: the repo's own built-in `fetch`-based crawler (Node ≥18 global `fetch` + `AbortController`), extracted from the existing `gatherCorpus`.** Zero dependencies, already battle-tested against `pwc.co.uk`/`premierinn.com` WAFs (per the `http.js` comments). It returns exactly the `{url, fullText, html}` shape requested.

If a true dependency is ever unavoidable, the research's #1 (`crawlee` `CheerioCrawler`, Apache-2.0) is the correct fallback — but it violates the built-ins-only rule today.

**Install:** none. Uses Node built-ins. (Only if escalating to Tier-2 later: `npm i crawlee playwright && npx playwright install chromium`.)

**Minimal Node snippet returning `{url, fullText, html}` per page** (built-ins only, mirrors `_stripText` so text matches the matcher exactly):

```js
// minimal-crawler.js — zero deps, Node >=18
const RX_HREF = /href\s*=\s*["']([^"'#?]+)/gi;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function stripText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
async function getPage(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: ctl.signal });
    const html = await r.text();
    return { url: r.url || url, status: r.status, fullText: stripText(html), html };
  } catch { return null; } finally { clearTimeout(t); }
}
async function crawlSite(start, { maxPages = 25 } = {}) {
  const origin = new URL(start).origin, seen = new Set(), out = [], queue = [start];
  while (queue.length && out.length < maxPages) {
    const u = queue.shift().split('#')[0]; if (seen.has(u)) continue; seen.add(u);
    const page = await getPage(u); if (!page || page.status >= 400 || page.fullText.length < 50) continue;
    out.push({ url: page.url, fullText: page.fullText, html: page.html });   // {url, fullText, html}
    let m; while ((m = RX_HREF.exec(page.html)) && queue.length < 400) {
      try { const abs = new URL(m[1], origin).toString(); if (abs.startsWith(origin) && !seen.has(abs)) queue.push(abs); } catch {}
    }
  }
  return out;  // [{ url, fullText, html }, ...]
}
module.exports = { crawlSite, stripText };
```

The production module (section 5) is this plus the existing tiered priority, sitemap discovery, reader/Wayback fallbacks, and challenge handling already proven in `gatherCorpus`.

---

## (2) Bounded full-site crawl design (blogs + policy + key pages always included)

Reconciliation: **scan every word of every page you keep; bound which pages you keep.** Compliance signal is concentrated; a 5,000-page site carries it on ~30 pages. Caps below are derived from the throughput math (3,000/day = 1 every ~29s avg; 4–6 concurrent slots → ~90s/site budget).

| Cap | Value | Why |
|---|---|---|
| Max pages | **25** (current `gatherCorpus` default is `maxPages = 22` — keep ~25) | home + full policy set + blog sample, with margin |
| Max depth | **2** from seed | compliance text is never 4 clicks deep |
| Per-site wall-clock | **90s** hard abort-and-grade | one hostile site can't stall a slot |
| Per-request timeout | **8s** (current uses 8–10s) | one hung socket can't eat the budget |
| Max bytes/page | **2MB** (truncate, matches Googlebot) | bounds the "every word" step |
| Total bytes/site | **20MB** | backstop |
| Politeness | 1 in-flight/domain, ~150–300ms gap | avoids tripping WAFs into challenge walls |

**Always-included priority set** — this is what preserves accuracy under the cap. `gatherCorpus` already builds it via `_TIER1`/`_TIER2`/`POLICY_PATHS`; the bounded design just formalizes reserved slots so blogs/policy never get crowded out:

1. **Tier 0 — always:** `/` + top sitemap URLs (`_discoverSitemap`, already present).
2. **Tier 1 — policy/legal, reserved slots, always fetched if discovered:** the existing `_TIER1` regex (`privacy|cookie|terms|legal|gdpr|data-protection|accessibility|complaint|modern-slavery|disclaimer|imprint|disclosure|regulat|compliance`) plus `POLICY_PATHS` guesses as backstop.
3. **Tier 2 — content/blog sample:** `/blog`, `/news`, `/press`, `/insights` index + up to **5 most recent** articles (recency from sitemap `lastmod` or listing order). This is the "blogs included, any line flagged" promise — marketing/claims compliance lives here.
4. **Tier 3 — fill remaining slots:** BFS from home nav, deduped by normalized URL (the current `used` Set on `u.split('#')[0].replace(/\/$/,'').toLowerCase()`).

Discovery stays cheap: parse `sitemap.xml` once, score against tiers, fetch only the chosen ≤25 — a 5,000-URL sitemap costs *2 discovery fetches + 25 page fetches*, not 5,000. **One gap to close:** add a `lastmod`-aware blog-recency selector so Tier 2 deterministically picks the 5 newest articles (today the tiering is regex-only, not recency-ranked).

---

## (3) Every-word flagging with page + verbatim-line evidence (reusing the existing finding shape)

Three concrete defects in the current `ruleCheck` block true word-level locate-everywhere flagging, and all three are fixable while keeping the exact finding object `scan` emits:

**Defect A — first-hit short-circuit.** `prohibit` (L316–319) returns on the first matching page; `must_appear` (L326–330) returns on the first hit. A prohibited phrase in a page-14 blog post is never reported if the homepage also matched.

**Defect B — repeated `_stripText`.** `_extractQuote` (L262–263) calls `_stripText` on full HTML again for every matching rule×page. With ~400 rules × 22 pages that is up to ~8,800 strips/site — the matcher bottleneck.

**Defect C — no offset→line map.** Evidence is bounded around `m.index` within one page; there's no joined-corpus index to run one pass and map a global hit back to (URL + line).

**Fix — four new helpers next to `_extractQuote` (L262) and `_isProse` (L249), reusing both verbatim:**

- `buildCorpusIndex(corpus)` — **runs once per site, right after L354** (`const corpus = _cg.corpus || []`). For each page: `_stripText` **once**, split into sentences/lines using the *same* boundary set `_extractQuote` already uses (`[.!?\u2022\n]`), classify each line with `_isProse` **once**, and append to a single `joined` string separated by a record-separator char (`\u241E`) that is in the boundary set so no quote bleeds across pages. Produces `{ pages, segments, joined, pageOffsets }` where `segments` is a sorted array of `{pageIdx, lineIdx, gStart, gEnd, text, prose}`.
- `splitSentences(text)` — boundary set identical to `_extractQuote` so the legacy path and the index never drift.
- `locateSegment(segments, offset)` — **binary search** mapping a joined-offset hit back to its page+line (O(log n)).
- `scanRuleGlobal(re, index)` — one `/gi` `.exec` loop over `joined`; for each match, `locateSegment` → push `{ url, lineIdx, matched, line, prose }`. A 500-occurrence guard per rule caps pathological cases.

**Rewire the three branches to consume occurrences, keeping the finding shape:**

- **`prohibit` (L315–321):** collect **all** prose occurrences, not the first. Keep `evidence_url`/`evidence_snippet`/`evidence_quote` exactly as today (first prose occurrence) so existing consumers are untouched; **add** `occurrence_count` + `occurrences[]` (`{url, line_index, quote, matched}`) so a prohibited word in a footer, a testimonial, and a 2019 blog post each appear as a distinct, verbatim, located occurrence. This is the core "any line anywhere is flagged" change.
- **`must_appear` (L322–331):** semantics are "satisfied somewhere," so first prose hit still wins for `status:'hit'` — but source the hit's `evidence_quote` from a real `splitSentences` line instead of the raw `m[0].slice(0,200)` it uses today (L329). Miss shape (`checked_urls`, `rule_pattern_summary`) unchanged.
- **`trigger_then_check` (L296–313):** run `scanRuleGlobal(triggerRe, index)` so `trigger_evidence` carries the verbatim triggering line + URL; then a cheap `index.joined.search(disclosureRe)` decides `hit_after_trigger` vs `miss`. Same finding shape.

**Evidence stays verbatim, never templated.** `o.line` is a literal slice of stripped page text between two boundary chars; `_isProse` still rejects nav/footer boilerplate; if no prose line qualifies, `evidence_quote` is `null` exactly as `_extractQuote` returns today (L280). No fabrication.

---

## (4) Async + cached throughput plan (2,000–3,000/day on a tiny free VM)

**Throughput math holds with ~10x headroom:** 5 crawl slots, ~10–20s avg audit (static path + cache), 90s worst-case ceiling. Steady-state ~15s avg → ~28,800/day headroom; even all-timeout → ~4,800/day, still above 3,000.

- **Static-first, headless-rare.** Cheerio-equivalent (`fetch`+`stripText`) is the default at ~5–15MB/worker. The existing `_renderViaReader` (r.jina.ai) already serves as the **free, zero-infra SPA fallback** — no local Chromium needed at all, which is ideal for a tiny VM (Playwright's 150–300MB/browser is the thing to avoid). Keep reader-fallback gated to <5–10% of sites (empty-shell heuristic already in `gatherCorpus` L175). Wayback fallback (L189) guarantees every site grades.
- **Cost model flips** from `O(rules × pages × strip)` to `O(pages × strip) + O(rules × |joined|)`: 22 strips/site instead of up to 8,800. Throughput levers: (a) **compile each rule's `RegExp` once** per worker (cache `rule._re`/`rule._triggerRe` — today `new RegExp` runs per site at L293/L300); (b) **`includes` pre-filter** — extract the longest `[a-z]{4,}` literal from each pattern and `index.joined.includes(literal)` before running the regex; most of ~400 rules short-circuit per site (biggest single win); (c) cap `joined` at the same **600KB** `scan` already uses for `corpusText` (L355).
- **Per-domain corpus cache (already present, extend it).** `getCached`/`writeCache` in `http.js` keyed on `domain|sector|country`, 24h TTL (L348, L492). Extend with: store the discovered tier-map separately, send conditional `If-None-Match`/`If-Modified-Since` for 304 reuse, longer TTL (24h) for the sitemap/URL map, and a **negative cache** (~1h) for DNS-fail/403/refused so dead domains aren't retried each audit. LRU disk cap (2–5GB) so the small VM disk doesn't fill.
- **Concurrency:** 4–6 concurrent audits on 1GB (8–10 on 2GB) via a bounded worker pool / `p-queue`-style semaphore — *not* unbounded `Promise.all`. Within a site, 4–6 parallel fetches but ≤1–2 in-flight per domain. The current `gatherCorpus` `Promise.all(fetchList.map(...))` (L163) should gain a small concurrency cap to respect per-domain politeness.
- **Two-queue async pipeline so crawl never blocks mint.** Crawl/scan workers (concurrency 4–6, each wrapped in a 90s `AbortController`) write finished `{auditId, findings, grade}` to a results store; a **separate** mint queue/worker consumes only finished results. A site hanging 90s ties up one crawl slot, never the mint path. Idempotent with bounded retry + negative cache; a permanent failure still produces a gradeable "could not fetch — graded on available signal" result (the existing `blocked`/`reason` path at L358–365 already does this), so mint is never left waiting.

---

## (5) Exact new module path + how `gatherCorpus` uses it

**New module:** `/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-compliance/src/lib/compliance/site-crawler.js`
(sits alongside the existing `connect.js`, `jurisdiction-router.js`, `tracker-detect.js`, `resolver.js` in `src/lib/compliance/`.)

**Companion module (word-index, keep it next to the matcher that consumes it):**
`/Users/amanigga/Desktop/TAMAZIA-REBUILD/cowork-os-compliance/src/skills/S008-personalisation-engine/scanners/corpus-index.js` — exports `buildCorpusIndex`, `splitSentences`, `locateSegment`, `scanRuleGlobal`. (It must reuse `_stripText`/`_isProse`; export those from `compliance.js` or move them into a tiny shared `text-utils.js` both `require`. Sharing the functions, not copying, is what prevents drift between the index path and the legacy `_extractQuote` path.)

**What `site-crawler.js` exports** (it is the extracted, hardened `gatherCorpus` internals — built-ins only, importing `fetchWithRetry` from the existing `../../skills/S008-personalisation-engine/lib/http.js`):

```js
module.exports = { crawlSite };
// crawlSite({ domain, maxPages = 25, depth = 2, budgetMs = 90000, signal })
//   -> { corpus: [{ url, fullText, html, status, fetch_ms, bytes, rendered?, archived?, archive_date? }],
//        blocked, reason, challenge, home_status, pages_tried, via_archive, archive_date }
```

It contains the logic currently inline in `gatherCorpus` (L138–211): `_discoverLinks`, `_discoverSitemap`, `_TIER1`/`_TIER2`/`POLICY_PATHS` prioritization, the `_renderViaReader` SPA fallback, the `_archiveSnapshot` Wayback fallback, full-body dedup, and the honest `reason` classifier — **plus** the new bounds: 90s `AbortController` budget, depth cap, 2MB/page truncation, per-domain concurrency limit, and the recency-ranked blog selector. It adds `fullText` (pre-stripped via shared `_stripText`) to each corpus entry so the index never re-strips.

**How `compliance.js` uses it — minimal, surgical:**

1. **Replace the inline `gatherCorpus` body** with a thin wrapper (or delete the local function and import): at the top, `const { crawlSite } = require('../../../lib/compliance/site-crawler.js');`. Then `gatherCorpus({ domain })` (called at **L353**) delegates to `crawlSite({ domain, maxPages: 25 })`. The returned shape is byte-identical to today's, so L354–365 (the credibility/blocked guards), the privacy-anchor logic, jurisdiction detection, and caching all keep working unchanged.
2. **Build the word index right after L354:** `const index = buildCorpusIndex(corpus);` using the new `corpus-index.js`.
3. **Thread the index into the matcher:** change the loop at **L446** from `ruleCheck(r, corpus, normSector)` to `ruleCheck(r, corpus, index, normSector)`, and rewrite the three branches (L298–331) to call `scanRuleGlobal`/`locateSegment` per section (3). The `out` object keeps every existing field and only *gains* `occurrence_count` + `occurrences[]` on prohibit/multi-hit findings.
4. **Everything downstream is untouched:** `findings`, `sevRank` sort (L478), `writeCache` (L492), jurisdiction routing, the privacy-suppression guard (L450), and the cookie-diff finding (L470) all consume the same finding shape. Richer consumers can iterate `occurrences[]` to render "flagged on N pages."

**Net effect:** every word of every kept page (blog, FAQ, testimonial, footer) is scanned by all ~400 rules over the `joined` corpus; any single non-compliant line anywhere is flagged with exact `url` + `line_index` + verbatim `quote` via the `segments` offset map (all such lines for `prohibit`, not just the first); evidence is always a real prose line from the existing `_stripText`→split→`_isProse` path, never templated; and the cost flip (one strip/page + `includes` pre-filter + binary-search locate) keeps the matcher at single-digit-ms CPU/site, leaving fetch latency — not matching — as the only thing between you and 2,000–3,000 audits/day on a free VM. **Free-only throughout: zero new npm dependencies; the sole "render" fallback is the public r.jina.ai reader plus public Wayback, both already wired.**