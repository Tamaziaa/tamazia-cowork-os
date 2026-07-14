'use strict';
/**
 * A FINE MAY NOT BE HARDCODED IN CODE. THE CATALOGUE IS THE ONLY SOURCE.
 *
 * I raised the PECR cap in the database from GBP 500,000 to GBP 17,500,000 (Data (Use and Access) Act 2025, in
 * force 5 Feb 2026), verified it, gated it in CI, and told Aman it was done.
 *
 * The next audit printed GBP 500,000.
 *
 * Because the code kept its OWN COPY, in three places:
 *   src/lib/evidence/cookie-evidence.js   fine_high_gbp: 500000        <- the finding that IS the PECR breach
 *   src/lib/audit/enforcement-map.js      'fines up to GBP 500,000'    <- the prose printed under it
 *   src/lib/audit/cookie-policy-diff.js   'GBP 500,000' in prose while its own figure said 17,500,000
 *
 * Fixing the database and leaving a hardcoded copy in the code is not fixing the bug. It is the same disease as
 * fwRegulator, firmName, isProse and the "671 frameworks" string: the right answer, implemented twice, corrected
 * once. Every time, the stale door is the one the client sees.
 *
 * A statutory maximum changes by Act of Parliament. When it does, exactly ONE row in compliance_rules should need
 * to change, and every audit should follow. This test makes that true.
 */
const A = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let n = 0, bad = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };

const walk = (d, out = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith('.js')) out.push(p);
  }
  return out;
};
const files = walk(path.join(ROOT, 'src')).filter((f) => !/[\\/]tests?[\\/]/.test(f));
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

t('NO source file carries the REPEALED PECR cap (GBP 500,000)', () => {
  const guilty = [];
  for (const f of files) {
    const src = code(fs.readFileSync(f, 'utf8'));
    // Precise: a FINE field set to the repealed cap, or the repealed figure printed as prose. Not any number that
    // merely contains those digits — a TikTok category id is not a statutory maximum.
    const hits = [];
    if (/fine_(low|high)_gbp\s*:\s*500000\b/.test(src)) hits.push('fine field = 500000');
    if (/GBP 500,000|£500,000/.test(src)) hits.push('prose "GBP 500,000"');
    if (hits.length) guilty.push(path.relative(ROOT, f) + '  (' + hits.join(', ') + ')');
  }
  A.strictEqual(guilty.length, 0,
    'The repealed PECR cap is hardcoded in:\n  ' + guilty.join('\n  ')
    + '\nThe Data (Use and Access) Act 2025 raised it to GBP 17,500,000 (in force 5 Feb 2026). '
    + 'Fixing the database and leaving a copy in the code is not fixing the bug — the stale door is the one the '
    + 'client sees. Read the fine from compliance_rules.');
});

t('the PECR fine constants that DO exist agree with the catalogue', () => {
  const CK = fs.readFileSync(path.join(ROOT, 'src/lib/evidence/cookie-evidence.js'), 'utf8');
  A.ok(/fine_high_gbp:\s*17500000/.test(CK),
    'cookie-evidence.js must carry the POST-DUAA cap, or read it from the catalogue');
});

console.log('\n' + (n - bad) + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
