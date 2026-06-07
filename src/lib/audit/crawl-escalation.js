'use strict';
// Apify crawl ESCALATION (self-contained so build.js needs only a one-line hook → zero merge-conflict surface
// with the in-flight engine work). If the DIY site fetch was bot-blocked / returned no usable corpus, backfill
// the scan's corpus from the FREE website-content-crawler (Creator $500 credit). Default-OFF (APIFY_ENABLE).
// Fail-soft: returns the (possibly enriched) scan unchanged on any error; never throws.
async function maybeEscalateCrawl(scan, { domain, env = process.env } = {}) {
  try {
    scan = scan || { signals: {} };
    const corpusLen = ((scan.signals && scan.signals.corpus) || '').length;
    // Only escalate when DIY produced little/nothing AND Apify is explicitly enabled.
    if ((scan.reachable && corpusLen >= 400) || !/^(1|true|yes|on)$/i.test(env.APIFY_ENABLE || '')) return scan;
    const pages = await require('../apify/client.js').crawlSite({ url: domain, env });
    const md = (pages || []).map(p => p.markdown || p.html || '').join('\n\n').trim();
    if (md.length > corpusLen) {
      scan.signals = scan.signals || {};
      scan.signals.corpus = md;
      if (!scan.signals.title && pages[0] && pages[0].title) scan.signals.title = pages[0].title;
      scan.reachable = true;
      scan.render_class = scan.render_class || 'apify_crawl';
    }
  } catch (_e) { /* fail-open: audit still mints on the DIY corpus */ }
  return scan;
}
module.exports = { maybeEscalateCrawl };
