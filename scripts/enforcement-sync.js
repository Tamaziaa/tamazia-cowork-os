#!/usr/bin/env node
'use strict';
// WS-B3 — enforcement sync. Pulls RECENT enforcement actions/fines from an ALLOWLIST of OFFICIAL regulators /
// courts / government (+ named-reputable aggregators), classifies each with our FREE LLM (Groq/Gemini, temp 0,
// JSON-only, never-invent — NO Grok), dedupes by content_hash, matches to canonical law_ids, and upserts into
// compliance_enforcement. The per-breach panel (src/lib/compliance/enforcement.js) reads these rows so every fine a
// client sees is calibrated to REAL recent cases with an OFFICIAL source_url — or honestly says none was found.
//   node scripts/enforcement-sync.js            # DRY: fetch + classify + print plan, NO writes
//   node scripts/enforcement-sync.js --apply    # upsert into compliance_enforcement (idempotent)
//   node scripts/enforcement-sync.js --limit 5  # cap items per source (default 8)
const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > 0 ? parseInt(process.argv[i + 1], 10) || 8 : 8; })();
(() => { for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', 'COWORK-OS-EXECUTION', '.env')]) { try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} } })();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
const PSQL = path.join(ROOT, 'scripts', 'psql');

// ── SOURCE AUTHORITY ALLOWLIST — official regulators/courts/gov + named-reputable aggregators ONLY. ───────────────
// The source_reputability guard (gap-finder dimension): an item from ANY host not on this list is REJECTED, so an
// SEO blog or content farm can never become a client-facing "recent ruling".
const ALLOWLIST = [
  { feed: 'ICO_UK', jurisdiction: 'UK', url: 'https://ico.org.uk/action-weve-taken/enforcement/', host: 'ico.org.uk', kind: 'regulator' },
  { feed: 'FCA_UK', jurisdiction: 'UK', url: 'https://www.fca.org.uk/news/news-stories', host: 'fca.org.uk', kind: 'regulator' },
  { feed: 'ASA_UK', jurisdiction: 'UK', url: 'https://www.asa.org.uk/codes-and-rulings/rulings.html', host: 'asa.org.uk', kind: 'regulator' },
  { feed: 'CMA_UK', jurisdiction: 'UK', url: 'https://www.gov.uk/cma-cases', host: 'gov.uk', kind: 'regulator' },
  { feed: 'MHRA_UK', jurisdiction: 'UK', url: 'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency', host: 'gov.uk', kind: 'regulator' },
  { feed: 'CQC_UK', jurisdiction: 'UK', url: 'https://www.cqc.org.uk/news', host: 'cqc.org.uk', kind: 'regulator' },
  { feed: 'EDPB_EU', jurisdiction: 'EU', url: 'https://edpb.europa.eu/news/news_en', host: 'edpb.europa.eu', kind: 'regulator' },
  { feed: 'SEC_US', jurisdiction: 'USA', url: 'https://www.sec.gov/news/pressreleases', host: 'sec.gov', kind: 'regulator' },
  { feed: 'FTC_US', jurisdiction: 'USA', url: 'https://www.ftc.gov/news-events/news/press-releases', host: 'ftc.gov', kind: 'regulator' },
  { feed: 'COURTLISTENER', jurisdiction: 'USA', url: 'https://www.courtlistener.com/', host: 'courtlistener.com', kind: 'court' },
  { feed: 'GDPRHUB', jurisdiction: 'EU', url: 'https://gdprhub.eu/index.php?title=Category:Decisions', host: 'gdprhub.eu', kind: 'reputable_aggregator' },
];
const ALLOWED_HOSTS = new Set(ALLOWLIST.map((s) => s.host));
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_e) { return ''; } }
function isAllowed(u) { const h = hostOf(u); if (!h) return false; return [...ALLOWED_HOSTS].some((a) => h === a || h.endsWith('.' + a)); }

function contentHash(sourceUrl, title, date) { return crypto.createHash('sha256').update([sourceUrl, title, date].map((x) => String(x || '')).join('|')).digest('hex').slice(0, 64); }

// Free-LLM classify: extract a structured enforcement record from one item, NEVER inventing fields it cannot see.
async function classifyItem({ title, snippet, source_url, feed, jurisdiction }, laws) {
  let askLLM; try { ({ askLLM } = require('../src/lib/audit/llm.js')); } catch (_e) { return null; }
  const prompt = `You are a compliance-enforcement classifier. From the regulator item below, extract ONLY facts present in the text. Output STRICT JSON with keys: entity_named (string|null), breach_type (string|null), penalty (string|null, the fine/sanction exactly as written e.g. "£450,000"), ruling_date (YYYY-MM-DD|null), one_line_summary (string), is_enforcement (boolean — true only if it describes an actual fine/sanction/ruling, not general news). Never guess a number or date that is not in the text.\n\nSOURCE: ${feed} (${jurisdiction})\nTITLE: ${title}\nTEXT: ${String(snippet || '').slice(0, 1200)}`;
  let out; try { out = await askLLM(prompt, { temperature: 0, maxTokens: 300, json: true }); } catch (_e) { return null; }
  let rec; try { rec = typeof out === 'string' ? JSON.parse(out) : out; } catch (_e) { return null; }
  if (!rec || rec.is_enforcement === false) return null;
  return {
    content_hash: contentHash(source_url, title, rec.ruling_date), source_feed: feed, source_url, jurisdiction,
    breach_type: rec.breach_type || null, entity_named: rec.entity_named || null, penalty: rec.penalty || null,
    ruling_date: rec.ruling_date || null, one_line_summary: rec.one_line_summary || title, classifier: 'llm_free',
    matched_law_ids: matchLaws({ jurisdiction, breach_type: rec.breach_type, title }, laws), confidence: 0.7,
    sector_tags: [],
  };
}

// Match a record to canonical law_ids by jurisdiction + breach/regulator keyword overlap (conservative).
function matchLaws({ jurisdiction, breach_type, title }, laws = []) {
  const hay = `${breach_type || ''} ${title || ''}`.toLowerCase();
  const out = [];
  for (const l of laws) {
    if (!l.servable) continue;
    if (l.jurisdiction && jurisdiction && l.jurisdiction !== jurisdiction && !(l.jurisdiction === 'GLOBAL')) continue;
    const reg = String(l.regulator || '').toLowerCase().split(/[ (]/)[0];
    const nm = String(l.name || '').toLowerCase();
    if ((reg && reg.length > 3 && hay.includes(reg)) || (nm && hay.includes(nm.split(' ')[0]) && nm.length > 4)) out.push(l.id);
  }
  return [...new Set(out)].slice(0, 5);
}

// Very small, defensive listing fetch (titles + links). Free; per-source try/catch; never hangs the job.
async function fetchListing(src) {
  try {
    const r = await fetch(src.url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; TamaziaComplianceBot/1.0; +https://tamazia.co.uk)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const html = await r.text();
    const items = []; const seen = new Set();
    const re = /<a[^>]+href=["']([^"'#?]+)["'][^>]*>([\s\S]{4,160}?)<\/a>/gi; let m;
    while ((m = re.exec(html)) && items.length < LIMIT * 3) {
      let href = m[1]; const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 12) continue;
      let abs; try { abs = new URL(href, src.url).toString(); } catch (_e) { continue; }
      if (!isAllowed(abs)) continue;                 // reputability guard at the link level too
      if (seen.has(abs)) continue; seen.add(abs);
      if (!/fine|penalt|enforce|ruling|sanction|action|decision|breach|order|settle/i.test(text)) continue;
      items.push({ title: text, source_url: abs, snippet: text });
      if (items.length >= LIMIT) break;
    }
    return items;
  } catch (_e) { return []; }
}

function loadLaws() { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seeds', 'compliance-laws.json'), 'utf8')); } catch (_e) { return []; } }
function q(v) { return v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`; }
function jb(v) { return v == null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`; }

async function main() {
  const laws = loadLaws();
  console.log(`=== ENFORCEMENT SYNC (${APPLY ? 'APPLY' : 'DRY'}) — allowlist ${ALLOWLIST.length} official sources, limit ${LIMIT}/source ===`);
  const records = [];
  for (const src of ALLOWLIST) {
    const items = await fetchListing(src);
    let kept = 0;
    for (const it of items) {
      if (!isAllowed(it.source_url)) { console.log(`  REJECT (not allowlisted): ${it.source_url}`); continue; }
      const rec = await classifyItem({ ...it, feed: src.feed, jurisdiction: src.jurisdiction }, laws);
      if (rec) { records.push(rec); kept++; }
    }
    console.log(`  ${src.feed.padEnd(14)} fetched ${items.length} → ${kept} enforcement record(s)`);
  }
  // dedupe by content_hash in-memory
  const uniq = []; const seen = new Set();
  for (const r of records) { if (seen.has(r.content_hash)) continue; seen.add(r.content_hash); uniq.push(r); }
  console.log(`\nTotal classified enforcement records: ${uniq.length} (unique by content_hash)`);
  console.log('Sample:', JSON.stringify(uniq.slice(0, 3).map((r) => ({ feed: r.source_feed, entity: r.entity_named, penalty: r.penalty, date: r.ruling_date, laws: r.matched_law_ids })), null, 1));

  if (!APPLY) { console.log('\nDRY run — no DB writes. Re-run with --apply to upsert.'); return; }
  if (!NEON) { console.error('no NEON_URL'); process.exit(1); }
  const sql = uniq.map((r) => `INSERT INTO compliance_enforcement (content_hash,source_feed,source_url,matched_law_ids,jurisdiction,sector_tags,breach_type,entity_named,penalty,ruling_date,confidence,one_line_summary,classifier) VALUES (${q(r.content_hash)},${q(r.source_feed)},${q(r.source_url)},${jb(r.matched_law_ids)},${q(r.jurisdiction)},${jb(r.sector_tags)},${q(r.breach_type)},${q(r.entity_named)},${q(r.penalty)},${r.ruling_date ? q(r.ruling_date) : 'NULL'},${r.confidence},${q(r.one_line_summary)},${q(r.classifier)}) ON CONFLICT (content_hash) DO NOTHING;`);
  const file = path.join(ROOT, 'db', 'seeds', 'enforcement.upsert.sql');
  fs.writeFileSync(file, ['BEGIN;', ...sql, 'COMMIT;'].join('\n'));
  execFileSync(PSQL, [NEON, '-f', file], { stdio: 'inherit' });
  const n = execFileSync(PSQL, [NEON, '-tA', '-c', 'SELECT count(*) FROM compliance_enforcement;'], { encoding: 'utf8' }).trim();
  console.log('compliance_enforcement rows now:', n);
}
if (require.main === module) main().catch((e) => { console.error('enforcement-sync FATAL:', e.message); process.exit(1); });
module.exports = { isAllowed, contentHash, matchLaws, ALLOWLIST, ALLOWED_HOSTS };
