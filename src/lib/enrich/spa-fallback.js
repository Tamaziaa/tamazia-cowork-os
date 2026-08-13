// spa-fallback · Phase 2, R23-8.
// Detect JS-only Single Page Applications where the initial fetch returns an
// empty <body><div id="root"></div></body> shell, then attempt a headless
// render. The free fallback path uses three tactics in order:
//   1. A second fetch with the JS-rendered URL via r.jina.ai (free reader),
//      which executes most JS server-side and returns plain text + main image.
//   2. The Wayback Machine availability API — if a recent snapshot exists, use
//      its rendered HTML instead of the bare shell.
//   3. Mark the site as `spa_unrendered: true` so the audit clearly labels
//      coverage as limited rather than emitting false "no privacy notice" etc.
//
// Zero cost. No API key. No headless Chrome needed.

const SHELL_THRESHOLDS = {
  // If we got HTML but it has fewer than X words AND no <h1> AND no
  // <main>/<article> elements AND no schema.org JSON-LD, it's almost
  // certainly a JS-rendered SPA shell.
  word_count: 80,
  must_have_text_in_main: true
};

function looksLikeSpaShell(html, parsed) {
  if (!html) return false;
  if (parsed && (parsed.word_count || 0) > SHELL_THRESHOLDS.word_count) return false;
  if (parsed && (parsed.h1 || []).length > 0) return false;
  if (parsed && parsed.has_schema) return false;
  // Look for known SPA framework markers
  return /<div\s+id=["'](?:root|app|__nuxt|__next|svelte-app)["'][^>]*>\s*<\/div>/i.test(html)
      || /window\.__NEXT_DATA__|__NUXT__|window\.__REDUX_STATE__/.test(html);
}

async function fetchViaJinaReader(domain, timeoutMs = 8000) {
  // Jina reader: free, no auth, returns clean markdown + main image with JS rendered.
  // URL format: https://r.jina.ai/https://example.com/
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const url = `https://r.jina.ai/https://${domain}/`;
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; Tamazia-SPA-Fallback/1.0)'
      }
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    return text.slice(0, 200000);
  } catch (_e) {
    return null;
  }
}

async function fetchViaWayback(domain, timeoutMs = 6000) {
  // Wayback Machine availability API. Free, public, no auth.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const probe = await fetch(`https://archive.org/wayback/available?url=https://${domain}/`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tamazia-SPA-Fallback/1.0)' }
    });
    clearTimeout(t);
    if (!probe.ok) return null;
    const j = await probe.json();
    const snap = j && j.archived_snapshots && j.archived_snapshots.closest;
    if (!snap || !snap.url) return null;
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), timeoutMs);
    const archived = await fetch(snap.url, {
      signal: ctrl2.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tamazia-SPA-Fallback/1.0)' }
    });
    clearTimeout(t2);
    if (!archived.ok) return null;
    const html = await archived.text();
    return html.slice(0, 800000);
  } catch (_e) {
    return null;
  }
}

async function renderSpaContent(domain) {
  // Try Jina reader first (faster, gives clean text). Fall back to Wayback.
  const jina = await fetchViaJinaReader(domain);
  if (jina && jina.length > 200) return { source: 'jina', text: jina };
  const wayback = await fetchViaWayback(domain);
  if (wayback) return { source: 'wayback', html: wayback };
  return null;
}

module.exports = { looksLikeSpaShell, renderSpaContent, SHELL_THRESHOLDS };
