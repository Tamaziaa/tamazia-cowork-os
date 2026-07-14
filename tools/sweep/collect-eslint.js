#!/usr/bin/env node
'use strict';
// ESLint -> the one entry point. no-undef and no-use-before-define have each caught a MINT-KILLING bug that
// 77 green evals missed. This is not a style checker here; it is the gate that proves the code can run at all.
const { execSync } = require('child_process');
const fs = require('fs');
let out = [];
try {
  const j = execSync('npx eslint src/ scripts/ eval/ tools/ -f json 2>/dev/null', { encoding: 'utf8', maxBuffer: 128e6 });
  for (const f of JSON.parse(j)) {
    for (const m of f.messages) {
      out.push({ tool: 'eslint', ruleId: m.ruleId || 'parse-error', file: f.filePath.replace(process.cwd() + '/', ''),
        startLine: m.line, endLine: m.endLine || m.line, level: m.severity === 2 ? 'error' : 'warning',
        message: m.message, snippet: (m.source || m.message || '').slice(0, 120) });
    }
  }
} catch (e) {
  const s = (e.stdout || '').toString();
  try { for (const f of JSON.parse(s)) for (const m of f.messages) out.push({ tool: 'eslint', ruleId: m.ruleId || 'parse-error',
    file: f.filePath.replace(process.cwd() + '/', ''), startLine: m.line, endLine: m.endLine || m.line,
    level: m.severity === 2 ? 'error' : 'warning', message: m.message, snippet: '' }); } catch (_e) { /* eslint produced nothing parseable */ }
}
fs.mkdirSync('sarif', { recursive: true });
fs.writeFileSync('sarif/eslint.local.json', JSON.stringify(out, null, 2));
console.log('  eslint findings: ' + out.length + ' (' + out.filter((x) => x.level === 'error').length + ' errors)');
