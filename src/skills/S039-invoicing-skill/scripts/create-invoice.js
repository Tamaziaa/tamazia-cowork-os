#!/usr/bin/env node
// S039 · Invoicing skill (FOUNDATION) · creates an invoice ROW in Neon from a deal/client.
// Phase 14.2.1/14.2.2. This is the DB-side foundation of the Zoho Invoice integration: it
// inserts a structured invoice (number, amount, due date, line items, status='draft') against
// a lead and (if present) a client_accounts row. The actual Zoho API call (createInvoice/
// sendInvoice/checkStatus) + payment webhook is layered on top later — this guarantees the
// invoices/payments tables are populated correctly and idempotently first.
//
// Idempotent: a given (client_id, invoice_kind, period) maps to a deterministic invoice_number;
// re-running returns the existing invoice instead of creating a duplicate.
//
// CLI:
//   node create-invoice.js --lead-id 123 --kind setup_fee --amount 2500
//   node create-invoice.js --lead-id 123 --kind monthly_retainer --amount 1500 --due 2026-06-01
//   node create-invoice.js                              # dry-run: prints what it WOULD do, writes nothing

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }
function pgNum(v) { if (v == null || v === '') return 'NULL'; const n = Number(v); return Number.isFinite(n) ? String(n) : 'NULL'; }

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  }
  return a;
}

// Deterministic invoice number → idempotency key. Same client + kind + period = same number.
function invoiceNumber({ client_id, kind, period }) {
  const k = (kind || 'inv').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  return `TZ-${k}-${client_id}-${period}`;
}

function currentPeriod(kind) {
  const d = new Date();
  if (kind === 'monthly_retainer') return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function createInvoice({ leadId, kind = 'setup_fee', amount, currency = 'GBP', dueDate, dryRun = false }) {
  if (!leadId) return { ok: false, error: 'missing_lead_id', dryRun: true, note: 'pass --lead-id to create a real invoice' };

  // Resolve client context (foundation: works whether or not a client_accounts row exists yet).
  const ctx = pg(`SELECT l.id::text, COALESCE(l.company,''), COALESCE(NULLIF(l.email,''), l.contact_email, ''), COALESCE(ca.id::text,''), COALESCE(ca.tier,''), COALESCE(ca.deal_value::text,''), COALESCE(ca.currency,'GBP') FROM leads l LEFT JOIN client_accounts ca ON ca.lead_id = l.id WHERE l.id = ${pgNum(leadId)} LIMIT 1`);
  if (ctx == null) return { ok: false, error: 'db_unavailable' };
  if (ctx === '') return { ok: false, error: 'lead_not_found', lead_id: Number(leadId) };
  const [id, company, email, accId, tier, dealValue, accCurrency] = ctx.split('\t');

  // Default amount: explicit > tier deal_value (setup ~ 1 month of ACV/12 for retainer) > 0.
  let amt = amount != null ? Number(amount) : null;
  if (amt == null && dealValue) amt = kind === 'monthly_retainer' ? Math.round((Number(dealValue) / 12) * 100) / 100 : Number(dealValue);
  if (amt == null) amt = 0;
  const cur = currency || accCurrency || 'GBP';

  const period = currentPeriod(kind);
  const number = invoiceNumber({ client_id: id, kind, period });
  const due = dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const lineItems = JSON.stringify([{ description: `Tamazia ${tier || ''} ${kind.replace(/_/g, ' ')}`.trim(), qty: 1, unit: amt, total: amt }]);

  const plan = { number, lead_id: Number(id), client_account_id: accId ? Number(accId) : null, company, email, kind, amount: amt, currency: cur, due_date: due, line_items: JSON.parse(lineItems) };
  if (dryRun) return { ok: true, dryRun: true, would_create: plan };

  // Idempotency: if this exact invoice_number already exists, return it (no duplicate).
  const existing = pg(`SELECT id::text, status, COALESCE(amount::text,'') FROM invoices WHERE invoice_number = ${pgEsc(number)} LIMIT 1`);
  if (existing) { const [eid, estatus, eamt] = existing.split('\t'); return { ok: true, idempotent: true, invoice_id: Number(eid), invoice_number: number, status: estatus, amount: Number(eamt), invoice_url: null }; }

  const sql = `INSERT INTO invoices (client_id, client_account_id, invoice_number, invoice_kind, amount, currency, due_date, status, line_items)
    VALUES (${pgNum(id)}, ${accId ? pgNum(accId) : 'NULL'}, ${pgEsc(number)}, ${pgEsc(kind)}, ${pgNum(amt)}, ${pgEsc(cur)}, ${pgEsc(due)}::date, 'draft', ${pgEsc(lineItems)}::jsonb)
    RETURNING id::text`;
  const newId = pg(sql);
  if (!newId) return { ok: false, error: 'insert_failed', plan };
  return { ok: true, invoice_id: Number(newId), invoice_number: number, status: 'draft', amount: amt, currency: cur, due_date: due, invoice_url: null, note: 'row created; Zoho API send is the next integration layer' };
}

function run(argv) {
  const a = parseArgs(argv || process.argv.slice(2));
  const dryRun = !a['lead-id'];
  const r = createInvoice({ leadId: a['lead-id'], kind: a.kind, amount: a.amount, currency: a.currency, dueDate: a.due, dryRun });
  console.log(JSON.stringify(r, null, 2));
  return r;
}

if (require.main === module) run();

module.exports = { createInvoice, invoiceNumber, run };
