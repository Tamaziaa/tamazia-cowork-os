#!/usr/bin/env node
// S036 regulator watch · Phase 10
// Polls public RSS/HTML feeds from key UK + EU + US regulators.
// Writes new items to intel_items. No LLM. Deterministic. Free.

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { fetchWithRetry } = require('../../../skills/S008-personalisation-engine/lib/http.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const FEEDS = [
  { source: 'regulator_watch', source_org: 'ICO', jurisdiction: 'UK', sectors: ['*'], url: 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/feed/', type: 'rss' },
  { source: 'regulator_watch', source_org: 'FCA', jurisdiction: 'UK', sectors: ['finance','fintech','insurance'], url: 'https://www.fca.org.uk/news/rss.xml', type: 'rss' },
  { source: 'regulator_watch', source_org: 'CMA', jurisdiction: 'UK', sectors: ['ecommerce','retail','hospitality'], url: 'https://www.gov.uk/government/organisations/competition-and-markets-authority.atom', type: 'atom' },
  { source: 'regulator_watch', source_org: 'SRA', jurisdiction: 'UK', sectors: ['law-firms'], url: 'https://www.sra.org.uk/sra/news/news-listing/feed/', type: 'rss' },
  { source: 'regulator_watch', source_org: 'MHRA', jurisdiction: 'UK', sectors: ['healthcare','pharma'], url: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency.atom', type: 'atom' },
  { source: 'regulator_watch', source_org: 'CQC', jurisdiction: 'UK', sectors: ['healthcare'], url: 'https://www.cqc.org.uk/news/feed', type: 'rss' },
  { source: 'regulator_watch', source_org: 'Ofcom', jurisdiction: 'UK', sectors: ['media','marketing'], url: 'https://www.ofcom.org.uk/feeds/site-feed/news', type: 'rss' },
  { source: 'regulator_watch', source_org: 'ASA', jurisdiction: 'UK', sectors: ['marketing','media','ecommerce'], url: 'https://www.asa.org.uk/news.rss', type: 'rss' },
  { source: 'regulator_watch', source_org: 'CPPA', jurisdiction: 'US', sectors: ['ecommerce','tech','saas'], url: 'https://cppa.ca.gov/announcements/', type: 'html' },
  { source: 'regulator_watch', source_org: 'FTC', jurisdiction: 'US', sectors: ['ecommerce','retail','tech'], url: 'https://www.ftc.gov/news-events/press-releases.rss', type: 'rss' }
];

const IMPACT_KEYWORDS = {
  enforcement: ['fine','enforcement','penalty','sanction','prosecut','order','prohibit','warning notice'],
  guidance: ['guidance','code','consultation','best practice','recommend'],
  ruling: ['ruling','decision','judgment','tribunal'],
  consultation: ['consultation','call for evidence','draft']
};

function classifyImpact(text) {
  const lower = String(text || '').toLowerCase();
  for (const [tag, kws] of Object.entries(IMPACT_KEYWORDS)) {
    if (kws.some(k => lower.includes(k))) return tag;
  }
  return 'general';
}

function parseRss(body) {
  // Minimal RSS/Atom parser — extract <title>, <link>, <description>, <pubDate>
  const items = [];
  const itemRe = /<(item|entry)>([\s\S]*?)<\/(item|entry)>/g;
  let m;
  while ((m = itemRe.exec(body)) !== null) {
    const block = m[2];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
    const link = (block.match(/<link[^>]*(?:href="([^"]+)"|>([\s\S]*?)<\/link>)/) || [])[1] || (block.match(/<link>([\s\S]*?)<\/link>/) || [, ''])[1].trim();
    const desc = (block.match(/<(description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(description|summary|content)>/) || [, , ''])[2].replace(/<[^>]+>/g, '').trim().slice(0, 800);
    const date = (block.match(/<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/(pubDate|updated|published)>/) || [, , ''])[2].trim();
    if (title && (link || desc)) items.push({ title, link, desc, date });
  }
  return items;
}

async function ingestFeed(feed) {
  const r = await fetchWithRetry(feed.url, { timeout: 15000, retries: 1 });
  if (!r.ok) return { feed: feed.source_org, status: 'fetch_failed', items: 0 };
  let items = [];
  if (feed.type === 'rss' || feed.type === 'atom') {
    items = parseRss(r.body);
  } else {
    // HTML: extract titles + links via heuristic
    const titleRe = /<a[^>]+href="([^"]+)"[^>]*>([^<]{15,200})<\/a>/g;
    let m;
    while ((m = titleRe.exec(r.body)) !== null && items.length < 20) {
      items.push({ title: m[2].trim(), link: m[1], desc: '', date: new Date().toISOString() });
    }
  }
  let inserted = 0;
  for (const it of items.slice(0, 25)) {
    const fingerprint = crypto.createHash('sha256').update(`${feed.source_org}|${it.title}|${it.link}`).digest('hex').slice(0, 24);
    const impact = classifyImpact(it.title + ' ' + it.desc);
    const sectorList = feed.sectors[0] === '*' ? null : feed.sectors[0];
    const sql = `INSERT INTO intel_items (source, source_url, source_org, sector, jurisdiction, headline, body, ts, impact_tag, fingerprint_hash)
      VALUES (${pgEsc(feed.source)}, ${pgEsc(it.link)}, ${pgEsc(feed.source_org)}, ${pgEsc(sectorList)}, ${pgEsc(feed.jurisdiction)}, ${pgEsc(it.title.slice(0, 300))}, ${pgEsc(it.desc)}, ${pgEsc(it.date)}::timestamptz, ${pgEsc(impact)}, ${pgEsc(fingerprint)})
      ON CONFLICT (fingerprint_hash) DO NOTHING RETURNING id`;
    const r2 = pg(sql);
    if (r2 && r2.length) inserted++;
  }
  return { feed: feed.source_org, status: 'ok', items_found: items.length, items_new: inserted };
}

async function run() {
  console.log(`Regulator watch · ${FEEDS.length} feeds · ${new Date().toISOString()}`);
  const results = [];
  for (const f of FEEDS) {
    const r = await ingestFeed(f);
    results.push(r);
  }
  console.log(JSON.stringify({ totals: { found: results.reduce((a,r) => a + (r.items_found||0), 0), new: results.reduce((a,r) => a + (r.items_new||0), 0) }, results }, null, 2));
  return results;
}

if (require.main === module) run();
module.exports = { run, ingestFeed, FEEDS };
