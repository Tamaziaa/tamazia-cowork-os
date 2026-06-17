#!/usr/bin/env node
'use strict';
/**
 * Apollo contact enrichment — priority-sector Tier-2/qualified leads missing a named DM.
 *
 *   node scripts/apollo-enrich.js            # process up to 100 leads
 *   node scripts/apollo-enrich.js --max 50   # custom cap
 *
 * For each lead in priority sectors (legal, healthcare, real_estate, hospitality) where
 * contact_name IS NULL or starts with 'unverified', searches Apollo /mixed_people/search
 * by organisation domain + DM title list. On a hit, writes contact_name, contact_linkedin,
 * contact_email, apollo_enriched_at, qa_status='apollo_found', then re-runs decideTier so
 * the lead can be auto-promoted to Tier-1 if it now meets the gate.
 *
 * Fail-open: no Apollo result = log + skip. APOLLO_KEY absent = log + exit 0.
 * Rate: ~1 req/s (Apollo free plan). Per-run cap defaults to 100.
 */

const path = require('path');
const fs   = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Load .env if not already set
(() => {
  for (const p of [path.join(ROOT, '.env')]) {
    try {
      for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch (_) {}
  }
})();

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const APOLLO_KEY = process.env.APOLLO_KEY;
const PSQL = path.join(ROOT, 'scripts', 'psql');

// Parse --max from argv
const maxIdx = process.argv.indexOf('--max');
const MAX = maxIdx >= 0 && /^\d+$/.test(process.argv[maxIdx + 1] || '')
  ? parseInt(process.argv[maxIdx + 1], 10)
  : parseInt(process.env.APOLLO_MAX || '100', 10);

// Safe SQL escape
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

function pg(sql) {
  if (!NEON) throw new Error('NEON connection string not set');
  return execFileSync(PSQL, [NEON, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

// Sectors mapped to the canonical names used in the leads table
const PRIORITY_SECTORS = [
  'legal', 'law-firms', 'lawfirm', 'law firm',
  'healthcare', 'medical', 'dental', 'clinic', 'health',
  'real_estate', 'real-estate', 'realestate', 'property',
  'hospitality', 'hotels', 'restaurants',
];

const SECTOR_CLAUSE = PRIORITY_SECTORS.map((s) => `'${s}'`).join(',');

const DM_TITLES = [
  'CEO', 'Director', 'Owner', 'Managing Director', 'Founder',
  'Head of Compliance', 'Practice Manager', 'Partner',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apolloSearch(domain) {
  const url = 'https://api.apollo.io/api/v1/mixed_people/search';
  const body = {
    api_key: APOLLO_KEY,
    q_organization_domains: [domain],
    person_titles: DM_TITLES,
    per_page: 1,
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Apollo HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function rerateWithDecideTier(leadId) {
  // Import lead-quality and re-run decideTier via tierInputsFromPersisted
  try {
    const lq = require(path.join(ROOT, 'src', 'lib', 'enrich', 'lead-quality.js'));
    // fetch the freshly-updated row
    const out = pg(
      `SELECT id, sector, icp_tier, domain, company, primary_email, primary_email_confidence,
              contact_name, contact_linkedin, contact_email, email_verified,
              compliance_gaps, seo_gaps, ads_missing, is_priority, entity_type,
              consent_ok, consent_source
       FROM leads WHERE id = ${parseInt(leadId, 10)}`
    ).trim();
    if (!out) return null;
    const cols = out.split('\t');
    // Minimal lead shape for tierInputsFromPersisted
    const lead = {
      id: cols[0], sector: cols[1], icp_tier: cols[2], domain: cols[3],
      company: cols[4], primary_email: cols[5], primary_email_confidence: cols[6],
      contact_name: cols[7], contact_linkedin: cols[8], contact_email: cols[9],
      email_verified: cols[10], compliance_gaps: cols[11], seo_gaps: cols[12],
      ads_missing: cols[13], is_priority: cols[14], entity_type: cols[15],
      consent_ok: cols[16], consent_source: cols[17],
    };
    const inputs = await lq.tierInputsFromPersisted(lead);
    const verdict = lq.decideTier(inputs);
    if (verdict && verdict.tier) {
      pg(`UPDATE leads SET icp_tier = ${q(verdict.tier)}, tier_reason = ${q(verdict.tier_reason || '')} WHERE id = ${parseInt(leadId, 10)}`);
    }
    return verdict;
  } catch (err) {
    console.warn(`  [apollo-enrich] re-tier error lead ${leadId}: ${err.message}`);
    return null;
  }
}

async function main() {
  if (!APOLLO_KEY) {
    console.log('[apollo-enrich] APOLLO_KEY not set in ENV_B64 — skipping (exit 0)');
    process.exit(0);
  }
  if (!NEON) {
    console.log('[apollo-enrich] NEON connection string not set — skipping (exit 0)');
    process.exit(0);
  }

  console.log(`[apollo-enrich] starting — cap ${MAX} leads`);

  // Fetch candidate leads
  const rows = pg(`
    SELECT id, domain, company, sector FROM leads
    WHERE domain IS NOT NULL AND TRIM(domain) <> ''
      AND LOWER(sector) IN (${SECTOR_CLAUSE})
      AND (icp_tier IN ('Tier-2','qualified','tier-2','tier_2') OR tier IN ('Tier-2','qualified'))
      AND (contact_name IS NULL OR contact_name ILIKE 'unverified%')
      AND COALESCE(status,'') NOT IN ('duplicate','suppressed','dnc','bounced')
      AND (apollo_enriched_at IS NULL OR apollo_enriched_at < NOW() - INTERVAL '30 days')
    ORDER BY priority_score DESC NULLS LAST, id DESC
    LIMIT ${MAX}
  `).trim();

  if (!rows) {
    console.log('[apollo-enrich] no candidates found — nothing to do');
    process.exit(0);
  }

  const leads = rows.split('\n').map((l) => {
    const [id, domain, company, sector] = l.split('\t');
    return { id, domain, company, sector };
  }).filter((r) => r.id && r.domain);

  console.log(`[apollo-enrich] ${leads.length} candidate lead(s) to check`);

  const stats = { checked: 0, found: 0, skipped: 0, errors: 0, retiers: 0 };

  for (const lead of leads) {
    stats.checked++;
    console.log(`  [${stats.checked}/${leads.length}] ${lead.domain} (lead ${lead.id})`);

    try {
      const data = await apolloSearch(lead.domain);
      const people = (data && data.people) || [];

      if (!people.length) {
        console.log(`    no results`);
        stats.skipped++;
        // Still stamp enriched_at so we don't re-query this domain for 30d
        pg(`UPDATE leads SET apollo_enriched_at = NOW() WHERE id = ${parseInt(lead.id, 10)}`);
        await sleep(1100); // ~1 req/s rate limit
        continue;
      }

      const person = people[0];
      const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || null;
      const linkedin = person.linkedin_url || null;
      const email = person.email || null;

      console.log(`    found: ${name || '(no name)'} | linkedin: ${linkedin ? 'yes' : 'no'} | email: ${email ? 'yes' : 'no'}`);

      // Write back to leads — additive, never overwrites verified data
      pg(`UPDATE leads SET
            contact_name       = ${q(name)},
            contact_linkedin   = ${q(linkedin)},
            contact_email      = ${q(email)},
            qa_status          = 'apollo_found',
            apollo_enriched_at = NOW()
          WHERE id = ${parseInt(lead.id, 10)}`);

      stats.found++;

      // Re-run decideTier now that contact exists
      const verdict = await rerateWithDecideTier(lead.id);
      if (verdict) {
        stats.retiers++;
        console.log(`    re-tiered -> ${verdict.tier}`);
      }

    } catch (err) {
      console.warn(`    error: ${err.message}`);
      stats.errors++;
    }

    await sleep(1100); // ~1 req/s to stay within Apollo free plan
  }

  const summary = `[apollo-enrich] DONE — checked:${stats.checked} found:${stats.found} skipped:${stats.skipped} errors:${stats.errors} retiers:${stats.retiers}`;
  console.log(summary);

  // Telegram notification
  try {
    const tg = require(path.join(ROOT, 'src', 'lib', 'notify', 'telegram.js'));
    await tg.send(`<b>Apollo enrich</b> — ${stats.found}/${stats.checked} contacts found | ${stats.retiers} re-tiered | ${stats.errors} errors`);
  } catch (e) {
    console.warn('[apollo-enrich] telegram notify failed:', e.message);
  }
}

main().catch((err) => {
  console.error('[apollo-enrich] fatal:', err.message);
  process.exit(1);
});
