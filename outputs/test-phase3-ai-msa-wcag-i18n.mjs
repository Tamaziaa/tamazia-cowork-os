// Phase 3 · AI Act classifier + Modern Slavery + WCAG AA + localized regulator names.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { classifyAiUse } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/ai-act-classifier');
const { detect: detectMS } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/modern-slavery-detector');
const { parseColor, contrastRatio, gradeHtml } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/enrich/wcag-contrast-grader');
const { localizedName } = require('/sessions/great-hopeful-heisenberg/mnt/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/src/lib/compliance/regulator-names-localized');

let pass = 0, fail = 0;
const failures = [];
function chk(c, n) { if (c) { pass++; } else { fail++; failures.push(n); console.log('  FAIL ' + n); } }

// ============================================================================
// L1 · AI Act classifier
// ============================================================================
console.log('\n=== L1 · EU AI Act classifier ===');

const limited = classifyAiUse('Our AI-powered platform uses ChatGPT. Powered by OpenAI.');
chk(limited.uses_ai, 'limited: uses_ai true');
chk(limited.risk_tier === 'limited', `limited: risk_tier=limited (got ${limited.risk_tier})`);
chk(limited.requires_finding, 'limited: requires_finding true');
chk(!limited.has_notice, 'limited: no notice');

const highRisk = classifyAiUse('Our AI screens resumes for hiring decisions. Powered by OpenAI.');
chk(highRisk.risk_tier === 'high_risk_candidate', `high-risk: tier=high_risk_candidate (got ${highRisk.risk_tier})`);
chk(highRisk.requires_finding, 'high-risk: requires_finding true');

const minimal = classifyAiUse('We integrate with HubSpot for CRM.');  // hubspot conversations script not present
chk(!minimal.uses_ai, 'minimal: no AI signal');
chk(!minimal.requires_finding, 'minimal: no finding');

const withNotice = classifyAiUse('We use AI for live chat. You are chatting with an AI. See our AI disclosure.');
chk(withNotice.has_notice, 'notice present');
chk(!withNotice.requires_finding, 'notice: no finding required');

console.log(`  L1: ${pass} pass / ${fail} fail`);

// ============================================================================
// L2 · Modern Slavery Act
// ============================================================================
console.log('\n=== L2 · Modern Slavery Act ===');

const inScopeRev = detectMS('Our annual revenue of £150 million reflects another year of growth.', []);
chk(inScopeRev.in_scope, 'revenue £150M → in_scope');
chk(inScopeRev.requires_finding, 'revenue with no statement → requires_finding');

const inScopeScale = detectMS('Listed on the FTSE 250 with global headcount of 4,500 employees.', []);
chk(inScopeScale.in_scope, 'FTSE 250 → in_scope');

const hasStatement = detectMS('Our annual revenue of £150 million.', ['/modern-slavery-statement']);
chk(hasStatement.has_statement, 'statement path → has_statement');
chk(!hasStatement.requires_finding, 'in-scope with statement → no finding');

const small = detectMS('We are a small boutique firm with £8 million revenue.', []);
chk(!small.in_scope, '£8M revenue → not in_scope');
chk(!small.requires_finding, 'small firm → no finding');

console.log(`  L2: ${pass} pass / ${fail} fail`);

// ============================================================================
// L3 · WCAG contrast grader
// ============================================================================
console.log('\n=== L3 · WCAG 2.1 AA contrast ===');

chk(Math.round(contrastRatio('#000000', '#ffffff') * 10) / 10 === 21, 'black on white = 21:1');
chk(Math.round(contrastRatio('#777', '#ffffff') * 10) / 10 === 4.5 || contrastRatio('#777', '#ffffff') > 4.4, '#777 on white ~ 4.5:1');
chk(contrastRatio('#cccccc', '#ffffff') < 2, '#ccc on white below threshold');

const goodHtml = '<div style="color:#000; background:#fff">Hi</div><span style="color:#222; background-color:#eee">Yo</span>';
const goodGrade = gradeHtml(goodHtml);
chk(goodGrade.failing_pairs === 0, `good html: 0 failing (got ${goodGrade.failing_pairs})`);
chk(goodGrade.grade === 'AA', `good html: grade AA (got ${goodGrade.grade})`);

const badHtml = '<p style="color:#ddd; background:#fff">Light grey on white</p><div style="color:#aaa; background-color:#fff">Pale grey</div>';
const badGrade = gradeHtml(badHtml);
chk(badGrade.failing_pairs >= 2, `bad html: 2+ failing (got ${badGrade.failing_pairs})`);
chk(badGrade.grade !== 'AA', `bad html: not AA (got ${badGrade.grade})`);

console.log(`  L3: ${pass} pass / ${fail} fail`);

// ============================================================================
// L4 · Localized regulator names
// ============================================================================
console.log('\n=== L4 · Localized regulator names ===');

chk(localizedName('EU_GDPR', 'FR') === "Commission Nationale de l'Informatique et des Libertes (CNIL)", 'FR → CNIL');
chk(localizedName('EU_GDPR', 'DE').includes('BfDI'), 'DE → BfDI');
chk(localizedName('UAE_PDPL', 'AE').includes('هيئة'), 'UAE → Arabic name');
chk(localizedName('SA_SAMA', 'SA').includes('السعودي'), 'SA → Arabic SAMA');
chk(localizedName('HK_PDPO', 'HK').includes('私隱'), 'HK → Chinese PCPD');
chk(localizedName('SG_PDPA', 'SG').includes('個人資料'), 'SG → Chinese PDPC');
chk(localizedName('IN_RBI', 'IN').includes('रिज़र्व'), 'IN → Hindi RBI');
chk(localizedName('UK_SRA_COC', 'UK') === null, 'UK → no localized name (returns null, falls back to en in worker)');

console.log(`  L4: ${pass} pass / ${fail} fail`);

console.log(`\n=========== PHASE 3 RESULT: ${pass} pass / ${fail} fail ===========\n`);
if (fail > 0) for (const f of failures) console.log('  · ' + f);
process.exit(fail === 0 ? 0 : 1);
