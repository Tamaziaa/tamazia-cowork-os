#!/usr/bin/env node
/**
 * CC-2 · Neon additive provision (idempotent, additive-only, fail-open per statement).
 *
 *   node scripts/cc2-provision.js          # apply
 *   node scripts/cc2-provision.js --check  # report what would change, no writes
 *
 * Does three things, in order — every statement is IF NOT EXISTS / CREATE OR REPLACE /
 * ON CONFLICT DO NOTHING, so re-running is always safe and nothing is ever dropped:
 *   1. leads: ADD COLUMN IF NOT EXISTS priority_source / recycle_after / manual_rank / icp_guess
 *      (also in schema/canonical-schema.json, so ensure-schema.js self-heals them too)
 *   2. icp_catalog: CREATE TABLE IF NOT EXISTS + seed the 20-sector catalogue
 *      (priority 1-10 enabled, 11-20 enabled=false per MASTER-PLAN Part D; founder flips)
 *   3. v_admin_leads: CREATE OR REPLACE VIEW — the cockpit's clean projection of leads
 *      (read-only; no base-table change; never the raw 124 columns)
 *
 * NEVER touches audit-engine tables (audit_*, compliance_*, framework_*, classifier_*,
 * pointer_*, scanner_*). Pure additions beside them.
 */
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const CHECK = process.argv.includes('--check');

async function sql(query) {
  if (!NEON) return { ok: false, rows: [], error: 'neon_unconfigured' };
  try {
    const host = NEON.replace(/.*@([^/]+)\/.*/, '$1');
    const r = await fetch('https://' + host + '/sql', {
      method: 'POST',
      headers: { 'Neon-Connection-String': NEON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, params: [] }),
      signal: AbortSignal.timeout(20000), // hung-step guard: never block the cycle on a stalled Neon HTTP socket
    });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (_) {} return { ok: false, rows: [], error: 'http_' + r.status + (m ? ':' + m : '') }; }
    const d = await r.json();
    return { ok: true, rows: d.rows || d.results || [], error: null };
  } catch (e) { return { ok: false, rows: [], error: (e && e.message) || 'exception' }; }
}

// ---- 1. leads additive columns -------------------------------------------------------------
const LEAD_COLS = [
  ['priority_source', 'text'],                       // 'manual' | adapter name — who ranked this lead up
  ['recycle_after', 'timestamptz'],                  // CC-4 recycle worker: re-enter campaign after this
  ['manual_rank', 'timestamptz'],                    // CC-5 manual VIP: injection timestamp = queue rank
  ['icp_guess', 'text'],                             // source-time icp_catalog.sector guess
];

// ---- 2. the 20-sector ICP catalogue (MASTER-PLAN vF Part D; regulators per engine taxonomy) --
// tier_hint: 1 = strongly regulated, cold-eligible by default · 2 = needs the marketing-active
// signal to clear (CC-3 reads this as a hint, never as the gate itself).
const CATALOG = [
  // priority 1-10 — enabled now
  { r: 1,  s: 'law-firms',    n: 'Law firms & solicitors',            reg: 'SRA',                       t: 1 },
  { r: 2,  s: 'healthcare',   n: 'Private clinics & healthcare',      reg: 'CQC/GMC',                   t: 1 },
  { r: 3,  s: 'dental',       n: 'Dental practices',                  reg: 'GDC/CQC',                   t: 1 },
  { r: 4,  s: 'aesthetics',   n: 'Aesthetic & cosmetic clinics',      reg: 'JCCP/ASA/CQC',              t: 1 },
  { r: 5,  s: 'finance',      n: 'Wealth, advisers & accountants',    reg: 'FCA/ICAEW',                 t: 1 },
  { r: 6,  s: 'real-estate',  n: 'Estate agents & property',         reg: 'RICS/NTSELAT/Ombudsman',    t: 1 },
  { r: 7,  s: 'hospitality',  n: 'Hotels, resorts & venues',          reg: 'FSA/licensing/ABTA',        t: 2 },
  { r: 8,  s: 'food',         n: 'Restaurants & F&B brands',          reg: 'FSA/EHO',                   t: 2 },
  { r: 9,  s: 'pharmacy',     n: 'Pharmacies & online pharmacy',      reg: 'GPhC/MHRA',                 t: 1 },
  { r: 10, s: 'education',    n: 'Schools, colleges & training',      reg: 'Ofsted/ISI/DfE',            t: 1 },
  // priority 11-20 — provisioned but enabled=false until the founder flips them
  { r: 11, s: 'fintech',      n: 'Fintech & payments',                reg: 'FCA',                       t: 1 },
  { r: 12, s: 'automotive',   n: 'Dealerships & vehicle finance',     reg: 'FCA (motor finance)',       t: 2 },
  { r: 13, s: 'wellness',     n: 'Gyms, spas & wellness',             reg: 'CMA/HSE',                   t: 2 },
  { r: 14, s: 'veterinary',   n: 'Veterinary clinics',                reg: 'RCVS',                      t: 1 },
  { r: 15, s: 'travel',       n: 'Tour operators & travel',           reg: 'ABTA/ATOL/CAA',             t: 1 },
  { r: 16, s: 'ecommerce',    n: 'E-commerce & D2C retail',           reg: 'CMA/Trading Standards',     t: 2 },
  { r: 17, s: 'energy',       n: 'Energy & renewables installers',    reg: 'Ofgem/MCS',                 t: 2 },
  { r: 18, s: 'recruitment',  n: 'Recruitment & staffing',            reg: 'EAS/GLAA',                  t: 2 },
  { r: 19, s: 'b2b',          n: 'Professional services & B2B',       reg: 'sector body',               t: 2 },
  { r: 20, s: 'charity',      n: 'Charities & foundations',           reg: 'Charity Commission',        t: 2 },
];
const QT = (s, n) => JSON.stringify([
  `${n} {city}`, `best ${n} {city}`, `${n} near me`, `${s} ads site:facebook.com/ads/library`,
]);

// ---- 3. the cockpit view --------------------------------------------------------------------
const VIEW_SQL = `CREATE OR REPLACE VIEW v_admin_leads AS
  SELECT id, company, domain, sector, icp_guess, jurisdiction, lifecycle_stage,
         conversion_tier, icp_tier, quality_fit, quality_score, status, verify_status,
         COALESCE(primary_email, contact_email) AS best_email, replied,
         first_contacted_at, last_reply_received_at, next_touch_date,
         audit_url, acquisition_channel, priority_source, manual_rank, recycle_after,
         priority_score, created_at, updated_at
  FROM leads`;

(async () => {
  if (!NEON) { console.error('[cc2] NEON connection string not set'); process.exit(1); }
  const plan = [];
  for (const [c, t] of LEAD_COLS) plan.push(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${c} ${t}`);
  plan.push(`CREATE TABLE IF NOT EXISTS icp_catalog (sector text PRIMARY KEY, icp_name text NOT NULL,
    regulator text, jurisdiction text DEFAULT 'UK', tier_hint smallint DEFAULT 1, priority_rank smallint,
    enabled boolean DEFAULT true, query_templates jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  for (const c of CATALOG) {
    plan.push(`INSERT INTO icp_catalog (sector, icp_name, regulator, jurisdiction, tier_hint, priority_rank, enabled, query_templates)
      VALUES ('${c.s}', '${c.n.replace(/'/g, "''")}', '${c.reg.replace(/'/g, "''")}', 'UK', ${c.t}, ${c.r}, ${c.r <= 10}, '${QT(c.s, c.n.toLowerCase()).replace(/'/g, "''")}'::jsonb)
      ON CONFLICT (sector) DO NOTHING`);
  }
  // manual-mint tagging on the AGENCY queue only ('auto' engine vs 'manual' cockpit box).
  // audit_pages is an audit-engine table (do-not-touch) — the cockpit History tab derives
  // a mint's source by joining audit_pages.slug -> minting_queue.slug, no audit-table change.
  plan.push(`ALTER TABLE minting_queue ADD COLUMN IF NOT EXISTS source text DEFAULT 'auto'`);
  // CC-5 manual VIP injection: PECR/GDPR lawful-basis tag + who added it (additive on shared leads).
  plan.push(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lawful_basis text`);
  plan.push(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS manual_added_by text`);
  // CC-4 reconcile gate columns (verify-audits writes these at runtime; make them first-class).
  plan.push(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS audit_verified boolean DEFAULT false`);
  plan.push(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS audit_verified_at timestamptz`);
  plan.push(VIEW_SQL);

  if (CHECK) { console.log(`[cc2 --check] would run ${plan.length} idempotent statements:`); plan.forEach((q) => console.log('  ·', q.split('\n')[0].slice(0, 110))); process.exit(0); }

  let ok = 0; const errors = [];
  for (const q of plan) {
    const r = await sql(q);
    if (r.ok) ok++; else errors.push(q.split('\n')[0].slice(0, 80) + ' -> ' + r.error);
  }
  console.log(`[cc2] ${ok}/${plan.length} statements ok${errors.length ? ' · ERRORS: ' + JSON.stringify(errors, null, 2) : ''}`);
  // verify
  const v1 = await sql(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='leads' AND column_name IN ('priority_source','recycle_after','manual_rank','icp_guess')`);
  const v2 = await sql(`SELECT count(*)::int AS n FROM icp_catalog`);
  const v3 = await sql(`SELECT count(*)::int AS n FROM v_admin_leads`);
  console.log(`[cc2 verify] leads new cols: ${v1.rows[0] && v1.rows[0].n}/4 · icp_catalog rows: ${v2.rows[0] && v2.rows[0].n} · v_admin_leads selectable rows: ${v3.rows[0] && v3.rows[0].n}`);
  process.exit(errors.length ? 1 : 0);
})();
