'use strict';
// E-259 — download the ICO Register of Data Controllers and mirror it into Neon.
// The download URL carries a ROTATING HASH, so it is scraped from the page every run. Never hardcode it.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PAGE = 'https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/download-the-register/';
const UA = 'TamaziaComplianceBot/1.0 (+https://tamazia.co.uk)';

function sh(cmd, args) { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); }
function pg(sql) {
  return execFileSync(path.join(__dirname, 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 28 });
}
const norm = (s) => String(s || '').toLowerCase().replace(/\b(limited|ltd|llp|plc|the|and)\b/g, ' ').replace(/[^a-z0-9]/g, '').slice(0, 200);
const dt = (v) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); if (m) return m[3] + '-' + m[2] + '-' + m[1]; return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : null; };
const q = (s) => (s === null || s === undefined || s === '') ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";

(async () => {
  const page = await (await fetch(PAGE, { headers: { 'user-agent': UA } })).text();
  const href = (page.match(/href="([^"]*register-of-data-controllers[^"]*\.zip)"/i) || [])[1];
  if (!href) throw new Error('could not find the register ZIP link on the ICO page (the rotating hash changed shape?)');
  const url = href.startsWith('http') ? href : ('https://ico.org.uk' + href);
  console.log('register: ' + url);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ico-'));
  const zip = path.join(tmp, 'r.zip');
  const buf = Buffer.from(await (await fetch(url, { headers: { 'user-agent': UA } })).arrayBuffer());
  fs.writeFileSync(zip, buf);
  console.log('downloaded ' + (buf.length / 1e6).toFixed(1) + ' MB');
  sh('unzip', ['-qo', zip, '-d', tmp]);
  const csv = fs.readdirSync(tmp).filter((f) => f.endsWith('.csv'))[0];
  if (!csv) throw new Error('no CSV in the register ZIP');

  pg(`CREATE TABLE IF NOT EXISTS ico_register (
        registration_number text PRIMARY KEY, organisation_name text NOT NULL, name_norm text NOT NULL,
        postcode text, payment_tier text, start_date date, end_date date, loaded_at timestamptz DEFAULT now())`);
  pg('CREATE INDEX IF NOT EXISTS ix_ico_name_norm ON ico_register (name_norm)');

  // Load into a STAGING table and swap atomically, so a failed run can never leave us with an EMPTY register —
  // which would make every firm we audit look unregistered and produce a catastrophic false accusation on every
  // report we ship. The evidence module also refuses to assert absence below 500k rows, as a second belt.
  pg('DROP TABLE IF EXISTS ico_register_stage');
  pg('CREATE TABLE ico_register_stage (LIKE ico_register INCLUDING ALL)');

  const lines = fs.readFileSync(path.join(tmp, csv), 'utf8').split('\n');
  const head = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const iReg = head.indexOf('Registration_number'), iName = head.indexOf('Organisation_name');
  const iPc = head.indexOf('Organisation_postcode'), iTier = head.indexOf('Payment_tier');
  const iStart = head.indexOf('Start_date_of_registration'), iEnd = head.indexOf('End_date_of_registration');

  const split = (l) => { const out = []; let cur = '', inQ = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') { if (inQ && l[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (c === ',' && !inQ) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };

  let batch = [], total = 0;
  const flush = () => {
    if (!batch.length) return;
    pg('INSERT INTO ico_register_stage (registration_number,organisation_name,name_norm,postcode,payment_tier,start_date,end_date) VALUES '
      + batch.map((r) => '(' + r.map(q).join(',') + ')').join(',') + ' ON CONFLICT (registration_number) DO NOTHING');
    total += batch.length; batch = [];
    if (total % 100000 === 0) console.log('  ' + total.toLocaleString('en-GB'));
  };
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) continue;
    const c = split(l);
    const reg = (c[iReg] || '').trim(), nm = (c[iName] || '').trim();
    if (!reg || !nm) continue;
    batch.push([reg.slice(0, 40), nm.slice(0, 300), norm(nm), (c[iPc] || '').trim().slice(0, 12), (c[iTier] || '').trim().slice(0, 40), dt(c[iStart]), dt(c[iEnd])]);
    if (batch.length >= 2000) flush();
  }
  flush();
  console.log('staged ' + total.toLocaleString('en-GB') + ' controllers');

  if (total < 500000) throw new Error('the register only produced ' + total + ' rows — refusing to swap. An empty or partial register would make EVERY firm look unregistered.');
  pg('BEGIN; DROP TABLE IF EXISTS ico_register_old; ALTER TABLE ico_register RENAME TO ico_register_old; ALTER TABLE ico_register_stage RENAME TO ico_register; DROP TABLE ico_register_old; COMMIT;');
  pg('CREATE INDEX IF NOT EXISTS ix_ico_name_norm ON ico_register (name_norm)');
  console.log('SWAPPED. ico_register now holds ' + total.toLocaleString('en-GB') + ' controllers.');
})().catch((e) => { console.error('FAILED: ' + (e && e.message)); process.exit(1); });
