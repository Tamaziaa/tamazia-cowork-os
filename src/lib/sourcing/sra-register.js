'use strict';
// SRA / Law Society decision-maker lookup (law-firms sector).
// FACTS (validated 2026-06): the SRA Data Sharing Platform DOES exist as an official API, but it is
// FIRM-ONLY — it exposes no individual solicitors and no COLP/COFA role-holders, so it cannot serve this
// ICP (we need the named compliance principals). Individuals are only visible on the Law Society's
// "Find a Solicitor" site (solicitors.lawsociety.org.uk), which is JS-RENDERED: a plain HTML fetch (or a
// cheerio-type crawl, per apify/client.js crawlSite) returns a shell with no person markup, so the old
// class="...person..." regex scrape can never match. DECISION (ship): SRA individual-scrape is OUT OF
// SCOPE for this release — the module keeps its SRA_REGISTER=1 opt-in gate and returns [] gracefully.
// TODO(post-ship): wire a JS-capable Apify actor (Playwright/Puppeteer-rendering) and emit
// [{ name: normalizePersonName(...), role: 'Solicitor / COLP/COFA', source: 'sra_register' }].
const { normalizePersonName } = require('./fca-register.js'); // shared name normalization for when scrape lands

async function sraOfficers({ company, env = process.env } = {}) {
  if (!/^(1|true|yes|on)$/i.test(env.SRA_REGISTER || '') || !company) return []; // opt-in; scraping is fragile
  // JS-rendered target + no JS-rendering actor available in this stack => no individuals retrievable today.
  return [];
}
module.exports = { sraOfficers, normalizePersonName };
