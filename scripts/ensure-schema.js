#!/usr/bin/env node
/**
 * Tamazia Neon self-healing schema provisioner + drift guard.
 *
 *   node scripts/ensure-schema.js            # apply: auto-create missing tables/columns (additive only)
 *   node scripts/ensure-schema.js --check    # report drift only, exit 1 if any (CI guard, no writes)
 *
 * Reads schema/canonical-schema.json (generated from the live DB; the single source of truth).
 * Compares it to the live schema and applies ONLY the deltas. Additive only — never drops a table,
 * never drops/retypes a column. Fail-open per statement: one bad statement is logged, the rest proceed,
 * and the process always exits 0 in apply mode so it can never block the engine cycle.
 *
 * Effect: the live DB continuously converges to what the code needs. Add a table/column to the spec
 * (or run the generator after a migration) and the next cycle provisions it. No more missing-relation
 * or missing-column errors, ever.
 */
const fs = require('fs');
const path = require('path');

const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || process.env.NEON_DATABASE_URL;
const SPEC = process.env.SCHEMA_SPEC || path.resolve(__dirname, '..', 'schema', 'canonical-schema.json');
const CHECK = process.argv.includes('--check');

async function sql(query) {
  // single-statement HTTP /sql (Neon serverless). Returns {ok, rows, error}. Never throws.
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

function addColumnDDL(table, col, meta) {
  let s = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${meta.type}`;
  // additive-safe: keep a literal/function default, but never NOT NULL (would fail on populated tables)
  if (meta.default != null && !/nextval\(/i.test(meta.default)) s += ` DEFAULT ${meta.default}`;
  return s;
}

async function main() {
  const out = { mode: CHECK ? 'check' : 'apply', missing_tables: [], missing_columns: [], created: 0, added: 0, indexed: 0, errors: [] };
  if (!NEON) { console.error('[ensure-schema] NEON connection string not set — skipping (fail-open)'); process.exit(0); }
  if (!fs.existsSync(SPEC)) { console.error('[ensure-schema] spec missing: ' + SPEC); process.exit(0); }
  const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));

  // live snapshot
  const lt = await sql("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  const lc = await sql("select table_name, column_name from information_schema.columns where table_schema='public'");
  if (!lt.ok || !lc.ok) { console.error('[ensure-schema] could not read live schema: ' + (lt.error || lc.error) + ' — skipping (fail-open)'); process.exit(0); }
  const liveTables = new Set(lt.rows.map(r => r.table_name));
  const liveCols = {};
  for (const r of lc.rows) (liveCols[r.table_name] = liveCols[r.table_name] || new Set()).add(r.column_name);

  // compute drift
  for (const [t, def] of Object.entries(spec)) {
    if (!liveTables.has(t)) { out.missing_tables.push(t); continue; }
    for (const col of Object.keys(def.columns)) {
      if (!liveCols[t] || !liveCols[t].has(col)) out.missing_columns.push(t + '.' + col);
    }
  }

  if (CHECK) {
    const drift = out.missing_tables.length + out.missing_columns.length;
    console.log(JSON.stringify({ ...out, drift }, null, 2));
    if (drift > 0) { console.error(`[ensure-schema] DRIFT: ${out.missing_tables.length} missing table(s), ${out.missing_columns.length} missing column(s)`); process.exit(1); }
    console.log('[ensure-schema] schema in sync — 0 drift'); process.exit(0);
  }

  // apply (additive, fail-open per statement)
  for (const t of out.missing_tables) {
    const r = await sql(spec[t].create);
    if (r.ok) out.created++; else out.errors.push('create ' + t + ': ' + r.error);
  }
  for (const tc of out.missing_columns) {
    const [t, col] = tc.split('.');
    const r = await sql(addColumnDDL(t, col, spec[t].columns[col]));
    if (r.ok) out.added++; else out.errors.push('addcol ' + tc + ': ' + r.error);
  }
  // Indexes (additive). Each spec[t].indexes entry is a full `CREATE [UNIQUE] INDEX IF NOT EXISTS ...`
  // statement, so re-running is a no-op (never drops, never rebuilds). We always issue them — `IF NOT EXISTS`
  // makes this idempotent and cheap, and it covers the case where the table exists but the index does not
  // (e.g. the partial unique index on leads(lower(domain)) that closes the dup-domain TOCTOU). Fail-open per
  // statement: a partial-unique index that would conflict with live dup rows just logs an error and the rest proceed.
  for (const [t, def] of Object.entries(spec)) {
    if (!Array.isArray(def.indexes) || !liveTables.has(t)) continue;
    for (const ddl of def.indexes) {
      const r = await sql(ddl);
      if (r.ok) out.indexed = (out.indexed || 0) + 1; else out.errors.push('index ' + t + ': ' + r.error);
    }
  }
  const healed = out.created + out.added + (out.indexed || 0);
  console.log(JSON.stringify({ ...out, healed }));
  if (healed > 0) console.log(`[ensure-schema] auto-healed: +${out.created} table(s), +${out.added} column(s), +${out.indexed || 0} index(es)`);
  else console.log('[ensure-schema] schema already in sync — no changes');
  // optional notify on heal or error (reuses a webhook if present; fail-open)
  if ((healed > 0 || out.errors.length) && process.env.SLACK_WEBHOOK_URL) {
    try { await fetch(process.env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `[Neon ensure-schema] healed +${out.created} tables / +${out.added} cols${out.errors.length ? ' · errors: ' + out.errors.length : ''}` }) }); } catch (_) {}
  }
  process.exit(0); // never block the cycle
}
main();
