#!/usr/bin/env node
// Phase D · buying-signal monitor (keyless, £0). Watches a rotating batch of FIT/qualified prospect homepages
// for MEANINGFUL changes (started hiring, added a pricing/plans page, homepage/title change = redesign/rebrand)
// and auto-bumps hot_score + logs a structured buying_signals row. Structured fingerprint (not a raw content hash)
// so trivial edits don't create noise. Fail-open per lead. Usage: node scripts/buying-signals.js [LIMIT]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (_e) { return ''; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
function djb2(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
async function getHtml(d) { try { const r = await fetch('https://' + d, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) }); return r.ok ? await r.text() : ''; } catch (_) { return ''; } }
function fingerprint(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').toLowerCase();
  const hiring = /\b(we[' ]?re hiring|now hiring|join our team|join the team|vacanc|job opening|we are hiring)\b/.test(text) || /href=["'][^"']*(careers|jobs|vacancies)[^"']*["']/i.test(html);
  const pricing = /href=["'][^"']*(pricing|plans|packages|our-fees|fees)[^"']*["']/i.test(html) || /\b(our pricing|pricing plans|view plans)\b/.test(text);
  const title = (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].replace(/\s+/g, ' ').trim().slice(0, 120);
  const h1 = (String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return { hiring, pricing, title_h: djb2(title), h1_h: djb2(h1), len_bucket: Math.round((html || '').length / 5000) };
}
function diffSignals(prev, cur) {
  const out = [];
  if (!prev) return out; // first capture is a baseline, never a signal
  if (cur.hiring && !prev.hiring) out.push(['hiring', 'started advertising roles / careers page appeared']);
  if (cur.pricing && !prev.pricing) out.push(['pricing_page', 'added a pricing / plans / fees page']);
  if (cur.title_h !== prev.title_h) out.push(['title_change', 'homepage <title> changed (possible rebrand / repositioning)']);
  if (cur.h1_h !== prev.h1_h) out.push(['homepage_change', 'homepage H1 changed (redesign / new message)']);
  return out;
}

(async () => {
  const limit = Number(process.argv[2]) || 10;
  pg(`CREATE TABLE IF NOT EXISTS buying_signals (id BIGSERIAL PRIMARY KEY, lead_id BIGINT, signal_type TEXT, detail TEXT, detected_at TIMESTAMPTZ DEFAULT NOW())`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS site_fingerprint JSONB`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS signal_checked_at TIMESTAMPTZ`);
  pg(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS buying_signal_at TIMESTAMPTZ`);

  const raw = pg(`SELECT id::text, COALESCE(domain,''), COALESCE(site_fingerprint::text,'')
    FROM leads
    WHERE COALESCE(domain,'') <> ''
      AND COALESCE(quality_fit, FALSE) = TRUE
      AND COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
    ORDER BY signal_checked_at NULLS FIRST, id DESC
    LIMIT ${limit}`).trim();
  const rows = raw ? raw.split('\n').filter(Boolean).map(r => r.split('\t')) : [];
  if (!rows.length) { console.log('[buying-signals] no FIT leads with a domain to check.'); return; }
  let checked = 0, fired = 0;
  for (const [id, domain, fpJson] of rows) {
    try {
      const html = await getHtml(domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
      if (!html) { pg(`UPDATE leads SET signal_checked_at=NOW() WHERE id=${id}`); continue; } // unreachable → just mark checked, no fabricated signal
      const cur = fingerprint(html);
      let prev = null; try { prev = fpJson ? JSON.parse(fpJson) : null; } catch (_) {}
      const signals = diffSignals(prev, cur);
      for (const [type, detail] of signals) { pg(`INSERT INTO buying_signals (lead_id, signal_type, detail) VALUES (${id}, ${esc(type)}, ${esc(detail)})`); fired++; }
      if (signals.length) pg(`UPDATE leads SET hot_score = LEAST(100, COALESCE(hot_score,0) + 10), buying_signal_at=NOW(), site_fingerprint=${esc(JSON.stringify(cur))}::jsonb, signal_checked_at=NOW(), updated_at=NOW() WHERE id=${id}`);
      else pg(`UPDATE leads SET site_fingerprint=${esc(JSON.stringify(cur))}::jsonb, signal_checked_at=NOW() WHERE id=${id}`);
      checked++;
    } catch (e) { console.error('[buying-signals] ' + domain + ': ' + e.message); }
  }
  console.log(`[buying-signals] checked ${checked}/${rows.length}, ${fired} new signal(s) fired`);
  try { await require(path.join(ROOT, 'src/lib/cost-ledger.js')).logUsage('buying-signals', checked, { fired }); } catch (_) {}
})().catch(e => { console.error('[buying-signals] fatal (fail-open):', e.message); process.exit(0); });
