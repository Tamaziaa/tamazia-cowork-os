#!/usr/bin/env node
// S009 compliance-disclaimer-injector.
// Reads signatures/disclaimer.txt, substitutes {version}, {date}, {company_number},
// {ico_number}, {eu_rep_line}. Hot path called by S001 compose-body before send.
//
// Sources (resolved at runtime):
//   {version}, {date}        -> max(version), max(last_reviewed_at) from framework_versions
//   {company_number}         -> confirmations/tamazia-corporate.txt COMPANY_NUMBER
//   {ico_number}              -> confirmations/ico-receipt.txt ZA....
//   {eu_rep_line}             -> only when lead.country resolves to EU TLD list, otherwise empty
//
// Usage:
//   node inject.js --recipient_country UK     # substitutes and prints
//   echo "<template>" | node inject.js --recipient_country DE --inline

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DISCLAIMER_PATH = path.join(ROOT, 'signatures', 'disclaimer.txt');
const CORP_PATH = path.join(ROOT, 'confirmations', 'tamazia-corporate.txt');
const ICO_PATH = path.join(ROOT, 'confirmations', 'ico-receipt.txt');
const EU_REP_PATH = path.join(ROOT, 'confirmations', 'eu-rep-receipt.txt');

const EU_COUNTRIES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE',
  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
]);

function readSafe(p, fallback = '') { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return fallback; } }

function lookupCorp(field) {
  const text = readSafe(CORP_PATH);
  const m = text.match(new RegExp('^' + field + ':\\s*(.+)$', 'm'));
  return m ? m[1].trim() : null;
}

function lookupIco() {
  const text = readSafe(ICO_PATH);
  const m = text.match(/ZA\d{6,7}/);
  return m ? m[0] : null;
}

function lookupEuRep() {
  const text = readSafe(EU_REP_PATH);
  if (!text) return null;
  const addr = (text.match(/^REP_ADDRESS:\s*(.+)$/m) || [])[1];
  const contact = (text.match(/^REP_CONTACT:\s*(.+)$/m) || [])[1];
  if (!addr) return null;
  return `EU Representative: ${addr}${contact ? ' · ' + contact : ''}`;
}

function lookupFramework() {
  // Read NEON_URL and fetch max version + last_reviewed_at from framework_versions.
  // Falls back to '1.0.0' / today if the call fails.
  try {
    const psql = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'psql');
    const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
    if (!url || !fs.existsSync(psql)) throw new Error('no psql');
    const v = execSync(`${psql} "${url}" -tA -c "SELECT MAX(version) FROM framework_versions WHERE status='active'"`).toString().trim();
    const d = execSync(`${psql} "${url}" -tA -c "SELECT MAX(last_reviewed_at) FROM framework_versions WHERE status='active'"`).toString().trim().slice(0,10);
    return { version: v || '1.0.0', date: d || new Date().toISOString().slice(0,10) };
  } catch (_e) {
    return { version: process.env.FRAMEWORK_VERSION || '1.0.0', date: new Date().toISOString().slice(0,10) };
  }
}

function getRecipientCountry(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--recipient_country') return (argv[i + 1] || '').toUpperCase();
  }
  return '';
}

function inject(template, opts = {}) {
  const fw = lookupFramework();
  const ico = lookupIco() || '{ico_number_pending}';
  const corpNum = lookupCorp('COMPANY_NUMBER') || 'PENDING_COMPANIES_HOUSE_CONFIRMATION';
  const country = (opts.country || '').toUpperCase();
  const eu = EU_COUNTRIES.has(country) ? (lookupEuRep() || 'EU Representative: details published at tamazia.co.uk/privacy') : '';

  return template
    .replace(/\{version\}/g, fw.version)
    .replace(/\{date\}/g, fw.date)
    .replace(/\{company_number\}/g, corpNum)
    .replace(/\{ico_number\}/g, ico)
    .replace(/\{eu_rep_line\}/g, eu);
}

function main() {
  const argv = process.argv.slice(2);
  const country = getRecipientCountry(argv);
  const template = readSafe(DISCLAIMER_PATH);
  if (!template) { process.stderr.write('disclaimer template missing\n'); process.exit(1); }
  process.stdout.write(inject(template, { country }));
}

module.exports = { inject, EU_COUNTRIES };
if (require.main === module) main();
