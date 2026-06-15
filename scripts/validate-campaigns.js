#!/usr/bin/env node
// P2-5 · Campaign compliance validator. Statically checks every per-sector campaign in /campaigns/ against the
// Tamazia compliance rails so a non-compliant template can never reach the send path. Exit 1 on any failure
// (so it can gate CI). No network, no DB. Usage: node scripts/validate-campaigns.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'campaigns');
const META = JSON.parse(fs.readFileSync(path.join(DIR, '_meta.json'), 'utf8'));
const PRIORITY = META.priority_sectors;

// Forbidden: em dash, en dash, and hyphen-as-pause ( " - " ). Fake scarcity / urgency phrases (DMCCA 2024).
const FORBIDDEN_DASH = /[–—]| - /;
const FAKE_SCARCITY = /\b(only \d+ (left|remaining|spots?|seats?)|act now|limited time|hurry|last chance|ends (today|tonight|soon)|don't miss|expires (today|tonight|in \d+)|\d+ spots? left|while stocks last|countdown)\b/i;
const CREDENTIAL = /LLM in International Business Law, King's College London/;
const REG_LINE = /if you market online, you are regulated/i;
const UNSUB_VAR = '{{unsubscribe_url}}';

const errors = [];
const warnings = [];
function err(f, m) { errors.push(`${f}: ${m}`); }
function warn(f, m) { warnings.push(`${f}: ${m}`); }

// ---- shared assets ----
for (const need of ['_footer.txt', '_meta.json', 'README.md']) {
  if (!fs.existsSync(path.join(DIR, need))) err('campaigns/', 'missing ' + need);
}
const footer = fs.existsSync(path.join(DIR, '_footer.txt')) ? fs.readFileSync(path.join(DIR, '_footer.txt'), 'utf8') : '';
for (const v of ['{{company_number}}', '{{ico_number}}', '{{reg_address}}', UNSUB_VAR]) {
  if (!footer.includes(v)) err('_footer.txt', 'missing required variable ' + v);
}
if (!/how we found you/i.test(footer)) err('_footer.txt', 'missing provenance line ("How we found you...")');
// B-fix: the footer is appended to EVERY touch at send, so it must clear the same copy-rails as the bodies.
// Strip the trailing "--- Canonical render..." maintainer note (after the '---' separator) before linting so
// an instructional hyphen in the note is not mistaken for hyphen-as-pause in the shipped copy.
const footerCopy = footer.split(/^---\s*$/m)[0];
if (FORBIDDEN_DASH.test(footerCopy)) err('_footer.txt', 'contains an em/en dash or hyphen-as-pause (ships on every touch)');
if (FAKE_SCARCITY.test(footerCopy)) err('_footer.txt', 'contains fake-scarcity / urgency language (DMCCA 2024)');

// ---- per-sector campaigns ----
const files = fs.readdirSync(DIR).filter(f => /^[A-Z]{2}\.json$/.test(f));
const seen = new Set();
for (const file of files) {
  const code = file.replace('.json', '');
  seen.add(code);
  let c;
  try { c = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')); } catch (e) { err(file, 'invalid JSON: ' + e.message); continue; }
  if (c.sector_code !== code) err(file, `sector_code ${c.sector_code} != filename ${code}`);
  if (c.footer !== '_footer.txt') err(file, 'footer must reference _footer.txt');
  const sig = (c.signature || []).join(' ');
  if (!CREDENTIAL.test(sig)) err(file, 'signature missing the credential line');
  const touches = c.touches || [];
  if (touches.length < 5) err(file, `expected >=5 touches (0/1/2 + 2 nudges), got ${touches.length}`);
  let regSeen = false, audUrlTouch = false;
  for (const t of touches) {
    const tag = `${file} touch ${t.touch}`;
    const body = (t.body || []).join('\n');
    if (!t.subject) err(tag, 'no subject');
    if (!body.trim()) err(tag, 'empty body');
    // forbidden dashes / scarcity
    const full = (t.subject || '') + '\n' + body;
    if (FORBIDDEN_DASH.test(full)) err(tag, 'contains an em/en dash or hyphen-as-pause');
    if (FAKE_SCARCITY.test(full)) err(tag, 'contains fake-scarcity / urgency language (DMCCA 2024)');
    // two asks: a soft ask AND a meeting ask must exist across the cadence; each touch must carry at least one ask
    const asks = t.asks || {};
    if (!asks.soft && !asks.meeting) err(tag, 'no ask (need soft and/or meeting)');
    // right-person ask present in body
    if (!/who (on your team |)?(owns|handles|looks after|to speak to|is the right person)|right person|pointer to|forward this/i.test(body)) warn(tag, 'no obvious right-person ask');
    if (t.regulated_line || REG_LINE.test(body)) regSeen = true;
    if (t.requires_audit_url || body.includes('{{audit_url}}')) audUrlTouch = true;
    // touch 1+ should reference the audit url
    if (t.touch >= 1 && !body.includes('{{audit_url}}')) warn(tag, 'touch >=1 does not reference {{audit_url}}');
  }
  if (!regSeen) err(file, 'the "if you market online, you are regulated" line appears in no touch');
  if (!audUrlTouch) err(file, 'no touch carries the {{audit_url}}');
  // meeting ask must appear at least once across the cadence (the 1:1)
  if (!touches.some(t => t.asks && t.asks.meeting)) err(file, 'no touch carries the 1:1 meeting ask');
  // soft ask must appear at least once
  if (!touches.some(t => t.asks && t.asks.soft)) err(file, 'no touch carries a soft ask');
}
for (const code of PRIORITY) if (!seen.has(code)) err('campaigns/', `missing priority-sector campaign ${code}.json`);

// ---- report ----
console.log(`[validate-campaigns] ${files.length} sector files checked (${PRIORITY.length} priority sectors required).`);
for (const w of warnings) console.log('  WARN ' + w);
if (errors.length) { console.error(`[validate-campaigns] FAIL (${errors.length}):`); for (const e of errors) console.error('  ✗ ' + e); process.exit(1); }
console.log('[validate-campaigns] PASS — all campaigns compliant.');
