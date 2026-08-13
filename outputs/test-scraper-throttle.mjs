// R22·2 verification: re-scrape the three previously-throttled sites with the
// sitemap-first + parallel + realistic-headers scraper. Compare timing and
// page-count vs the old sequential crawler.
import { performance } from 'perf_hooks';
// website-intel.js is CommonJS, so use require via createRequire.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { scrapeIntel: scrape } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/website-intel.js');

const targets = [
  { domain: 'smilecliniq.com', label: 'Smile Cliniq (UK · healthcare)' },
  { domain: 'fenwick.com', label: 'Fenwick & West (US · law)' },
  { domain: 'lamerebrazier.com', label: 'La Mère Brazier (FR · hospitality)' }
];

const summaries = [];
for (const t of targets) {
  const t0 = performance.now();
  let intel = null, err = null;
  try {
    intel = await scrape(t.domain);
  } catch (e) {
    err = e.message || String(e);
  }
  const ms = Math.round(performance.now() - t0);
  if (err) {
    summaries.push({ ...t, ok: false, ms, error: err });
    console.log(`FAIL ${t.label}: ${err} (${ms}ms)`);
    continue;
  }
  const pages = intel.pages_fetched || [];
  summaries.push({
    ...t, ok: pages.length > 0, ms,
    pages: pages.length,
    pointers: (intel.pointers || []).length,
    emails: (intel.emails || []).length,
    has_privacy: !!intel.compliance?.has_privacy,
    has_cookie: !!intel.compliance?.has_cookie_banner,
    has_companies_house: !!intel.compliance?.companies_house,
    linkedin: !!intel.linkedin
  });
  console.log(`${pages.length > 0 ? 'PASS' : 'FAIL'} ${t.label}: ${pages.length} pages, ${(intel.pointers || []).length} pointers, ${ms}ms`);
}

console.log('\n--- Summary ---');
for (const s of summaries) {
  console.log(JSON.stringify(s));
}
const allOk = summaries.every(s => s.ok && s.pages >= 1);
process.exit(allOk ? 0 : 1);
