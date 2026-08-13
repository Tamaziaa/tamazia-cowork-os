#!/usr/bin/env node
// ============================================================================
// LOAD MAILDECK CREDS · one command to bring the 30-mailbox cold fleet online
// ----------------------------------------------------------------------------
// USAGE
//   node scripts/load-maildeck-creds.js [path-to-export.csv] [--write-env]
//   (default path: config/maildeck-mailboxes.csv)
//
// WHAT IT DOES
//   1. Ensures the schema exists (idempotent — runs migrations/2026-05-23-mailbox-pool.sql).
//   2. Parses + validates the MailDeck Exports CSV (tolerant of column naming).
//   3. Upserts each mailbox IDENTITY into mailbox_pool (NO passwords in the DB).
//   4. Sets warmup_started_at (the ramp clock) — keeps any existing value so the ramp
//      never resets if you reload.
//   5. Copies the validated creds (WITH passwords) to config/maildeck-mailboxes.json
//      (gitignored) for the pool to read locally, and prints the MAILDECK_MAILBOXES_B64
//      line for the autonomous host. With --write-env it appends that line to .env.
//   6. Prints a fleet readout: per-domain counts + today's ramp cap per inbox.
//
// SECURITY: passwords stay in config/* (gitignored) and .env (gitignored) only.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const pool = require(path.join(ROOT, 'src', 'lib', 'notify', 'mailbox-pool.js'));

// Load .env so NEON_URL is available when run directly
try {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
} catch (_e) {}

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) { console.error('NO DB URL — set NEON_URL'); return null; }
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (e) { console.error('pg err:', e.message); return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

function ensureSchema() {
  const sqlFile = path.join(ROOT, 'migrations', '2026-05-23-mailbox-pool.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  try { execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-c', sql], { encoding: 'utf8' }); console.log('✓ schema ensured (mailbox_pool, mailbox_daily_usage, cold_recipient_log, sends.mailbox_address)'); }
  catch (e) { console.error('schema apply failed:', e.message); process.exit(1); }
}

function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const writeEnv = process.argv.includes('--write-env');
  const csvPath = args[0] || path.join(ROOT, 'config', 'maildeck-mailboxes.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`No CSV at ${csvPath}.\nExport the 30 SMTP/IMAP creds from MailDeck → Exports, save as config/maildeck-mailboxes.csv, then re-run.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = pool.parseCsv(raw);
  const mailboxes = rows.map(pool.normaliseMailbox).filter(Boolean);
  const realDomainHits = mailboxes.filter(m => pool.isRealDomain(m.address));
  if (realDomainHits.length) {
    console.error(`REFUSED: ${realDomainHits.length} mailbox(es) are on a REAL brand domain (${realDomainHits.map(m => m.address).join(', ')}). Real domains are never the cold cannon. Fix the export and re-run.`);
    process.exit(1);
  }
  const missingPw = mailboxes.filter(m => !m.smtp_pass);
  if (!mailboxes.length) { console.error('No valid mailbox rows parsed. Check the CSV has an email/address + password column.'); process.exit(1); }

  ensureSchema();

  // Upsert identities (NO passwords). Keep existing warmup_started_at so the ramp never resets.
  let n = 0;
  for (const m of mailboxes) {
    const warm = m.added_at ? esc(m.added_at) : 'NOW()';
    pg(`INSERT INTO mailbox_pool (address, domain, persona_name, first_name, smtp_host, smtp_port, imap_host, imap_port, warmup_started_at, status, updated_at)
        VALUES (${esc(m.address)}, ${esc(m.domain)}, ${esc(m.persona_name || null)}, ${esc(m.first_name || null)}, ${esc(m.smtp_host)}, ${m.smtp_port || 'NULL'}, ${esc(m.imap_host)}, ${m.imap_port || 'NULL'}, COALESCE((SELECT warmup_started_at FROM mailbox_pool WHERE address=${esc(m.address)}), ${warm}), 'active', NOW())
        ON CONFLICT (address) DO UPDATE SET domain=EXCLUDED.domain, persona_name=COALESCE(EXCLUDED.persona_name, mailbox_pool.persona_name), smtp_host=EXCLUDED.smtp_host, smtp_port=EXCLUDED.smtp_port, imap_host=EXCLUDED.imap_host, imap_port=EXCLUDED.imap_port, updated_at=NOW()`);
    n++;
  }

  // Persist creds locally (gitignored) for the pool to read at send time.
  const jsonPath = path.join(ROOT, 'config', 'maildeck-mailboxes.json');
  fs.writeFileSync(jsonPath, JSON.stringify(mailboxes, null, 2), { mode: 0o600 });

  // Emit the host env line.
  const b64 = Buffer.from(JSON.stringify(mailboxes)).toString('base64');
  if (writeEnv) {
    let env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    env = env.replace(/^MAILDECK_MAILBOXES_B64=.*$/m, '').replace(/\n+$/,'\n') + `MAILDECK_MAILBOXES_B64=${b64}\n`;
    fs.writeFileSync(path.join(ROOT, '.env'), env);
    console.log('✓ MAILDECK_MAILBOXES_B64 written to .env (remember to re-push ENV_B64 to GitHub Actions)');
  }

  // Fleet readout
  const byDomain = {};
  for (const m of mailboxes) byDomain[m.domain] = (byDomain[m.domain] || 0) + 1;
  console.log(`\n✓ Loaded ${n} mailboxes across ${Object.keys(byDomain).length} domains:`);
  for (const [d, c] of Object.entries(byDomain)) console.log(`   ${d}: ${c}`);
  if (missingPw.length) console.log(`⚠ ${missingPw.length} mailbox(es) had no password column — they will be skipped at send time.`);
  console.log('\nToday\'s ramp caps (per inbox, by age):');
  const snap = pool.fleetSnapshot();
  for (const m of snap.slice(0, 40)) console.log(`   ${m.address.padEnd(34)} age ${String(m.age_days).padStart(3)}d → cold cap ${m.cap}/day (used ${m.used})`);
  const fleetCap = snap.reduce((s, m) => s + m.cap, 0);
  console.log(`\nFleet cold capacity today: ${fleetCap}/day total. (0 is correct if all inboxes are <7 days old — week 1 is pure warmup.)`);
  if (!writeEnv) console.log(`\nTo push creds to the autonomous host, add this to .env then re-encrypt ENV_B64:\n  MAILDECK_MAILBOXES_B64=${b64.slice(0, 24)}… (run with --write-env to write it automatically)`);
  console.log('\nNext: keep system_state.paused=true until the first real email is approved.');
}

main();
