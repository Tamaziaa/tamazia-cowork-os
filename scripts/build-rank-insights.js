#!/usr/bin/env node
// Populate the gated Touch-0 rank-insight for leads that need a first touch. Fetches the homepage,
// builds the below-top-5 keyword comparison, runs the fact-check gate, and only stores a sentence that
// passed. Fail-open per lead. Usage: node scripts/build-rank-insights.js [LIMIT]
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_) { return ''; } }
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const { composeRankBlock } = require(path.join(ROOT, 'src/lib/touch0/rank-insight.js'));
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function html(d) { try { const r = await fetch('https://' + d, { redirect: 'follow', headers: { 'user-agent': UA } }); return r.ok ? await r.text() : ''; } catch (_) { return ''; } }

async function main() {
  const limit = Number(process.argv[2]) || 15;
  const raw = pg(`SELECT id::text, COALESCE(domain,''), COALESCE(sector,''), COALESCE(company,''), COALESCE(country,'UK') FROM leads WHERE COALESCE(domain,'')<>'' AND COALESCE(rank_insight_sentence,'')='' AND lifecycle_stage IN ('sourced','qualified') ORDER BY hot_score DESC NULLS LAST, id DESC LIMIT ${limit}`);
  if (!raw) { console.log('[rank-insights] none to build.'); return; }
  const leads = raw.split('\n').filter(Boolean).map(l => { const [id, domain, sector, company, country] = l.split('\t'); return { id: Number(id), domain, sector, company, country }; });
  let built = 0, gated_out = 0;
  for (const lead of leads) {
    try {
      const h = await html(lead.domain);
      const block = await composeRankBlock({ domain: lead.domain, company: lead.company, sector: lead.sector, country: lead.country, html: h }, { log: true });
      if (!block.ok) { gated_out++; continue; } // gate failed or no below-top-5 keyword → store nothing
      const _city = (block.insight && block.insight.city) || '';
      pg(`UPDATE leads SET rank_insight_sentence=${esc(block.sentence)}, rank_insight=${esc(JSON.stringify({ keywords: block.keywords, blog_offer: block.blog_offer, city: _city }))}::jsonb, operating_city=COALESCE(NULLIF(operating_city,''), ${esc(_city)}) WHERE id=${lead.id}`);
      built++;
    } catch (e) { console.error('[rank-insights] ' + lead.domain + ': ' + e.message); }
  }
  console.log(`[rank-insights] built ${built}, gated-out ${gated_out} of ${leads.length}`);
}
main().catch(e => { console.error('[rank-insights] fatal (fail-open):', e.message); process.exit(0); });
