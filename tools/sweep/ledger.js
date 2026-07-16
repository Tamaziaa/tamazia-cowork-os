#!/usr/bin/env node
'use strict';
// THE ONE EXIT POINT. sweep-findings.json -> AUDIT-ENGINE-FINDINGS-LEDGER.md. Generated, never hand-edited.
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('sweep-findings.json', 'utf8'));
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const L = [];

L.push('# Audit Engine — Full-Estate Findings Ledger');
L.push('### Every tool. Every repo. Every finding. One number each.');
L.push('### Generated ' + d.generated_at + ' — do not hand-edit; regenerate with `node tools/sweep/ledger.js`');
L.push('');
L.push('---');
L.push('');
L.push('## THE GATE');
L.push('');
L.push('> **`ACT`** — **two or more independent tools agree.** That is a fact. Fix it.');
L.push('> **`REVIEW`** — **one tool only.** That is a lead, not a fact. It is triaged, never auto-fixed.');
L.push('');
L.push('Greptile found **2** issues where CodeRabbit found **51** on the same diff. A lone finding from a weak tool');
L.push('is noise — and a lone finding from a strong tool is still only a lead. Corroboration is the whole point.');
L.push('');
L.push('## THE NUMBERS');
L.push('');
L.push('| | |');
L.push('|---|---|');
L.push('| raw findings ingested | **' + d.raw_findings + '** |');
L.push('| after fingerprint dedupe | **' + d.after_dedupe + '** |');
L.push('| distinct defects (clustered) | **' + d.clusters + '** |');
L.push('| **ACT** (≥2 tools) | **' + d.act + '** |');
L.push('| REVIEW (1 tool) | ' + d.review + ' |');
L.push('');
L.push('### By tool');
L.push('');
L.push('| Tool | Findings |');
L.push('|---|---|');
for (const [t, n] of Object.entries(d.by_tool).sort((a, b) => b[1] - a[1])) L.push('| ' + t + ' | ' + n + ' |');
L.push('');
L.push('### By severity (clustered)');
L.push('');
L.push('| Sev | Count |');
L.push('|---|---|');
for (const [s, n] of Object.entries(d.by_severity)) L.push('| ' + s + ' | ' + n + ' |');
L.push('');
L.push('---');
L.push('');
L.push('## ACT — CORROBORATED BY TWO OR MORE TOOLS');
L.push('');
L.push('| # | Sev | Corrob | Tools | Location | Finding | Fix | Status |');
L.push('|---|---|---|---|---|---|---|---|');
for (const f of d.findings.filter((x) => x.status === 'ACT')) {
  L.push('| **' + f.id + '** | ' + f.severity + ' | **×' + f.corroboration + '** | ' + f.tools.join(', ') +
    ' | `' + f.path + ':' + f.start_line + '` | ' + esc(f.message).slice(0, 160) + ' | _TBD_ | OPEN |');
}
L.push('');
L.push('### ACT — full detail, every tool\'s own words');
L.push('');
for (const f of d.findings.filter((x) => x.status === 'ACT')) {
  L.push('#### ' + f.id + ' · ' + f.severity + ' · ×' + f.corroboration + ' — `' + f.path + ':' + f.start_line + '`');
  L.push('');
  L.push('**Category:** `' + f.category + '` · **Fingerprint:** `' + f.fingerprint.slice(0, 16) + '`');
  L.push('');
  for (const m of f.members) L.push('- **' + m.tool + '** (`' + m.rule_id + '`): ' + esc(m.message).slice(0, 300));
  L.push('');
  L.push('**Fix:** _TBD_ · **Status:** OPEN');
  L.push('');
}
L.push('---');
L.push('');
L.push('## REVIEW — SINGLE TOOL. A LEAD, NOT A FACT.');
L.push('');
L.push('| # | Sev | Tool | Location | Finding |');
L.push('|---|---|---|---|---|');
for (const f of d.findings.filter((x) => x.status === 'REVIEW')) {
  L.push('| ' + f.id + ' | ' + f.severity + ' | ' + f.tools[0] + ' | `' + f.path + ':' + f.start_line + '` | ' +
    esc(f.message).slice(0, 130) + ' |');
}
L.push('');
fs.writeFileSync('AUDIT-ENGINE-FINDINGS-LEDGER.md', L.join('\n'));
console.log('  ledger written: ' + L.length + ' lines, ' + d.clusters + ' numbered findings');
