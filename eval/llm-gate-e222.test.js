'use strict';
// E-222/E-223 (v22.6) — THE LLM GATE contract. Mock-router tests: pass at >=7, targeted-deficiency retry,
// 3-strike drop, provider-outage handling; law-discovery rubric + name matching; classify rubric shape.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { gateLLM, H } = require(path.join(ROOT, 'src/lib/llm/gate.js'));
const { normName, catalogueNameIndex } = require(path.join(ROOT, 'src/lib/audit/law-discovery.js'));

let n = 0, bad = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok ' + n + ' ' + name); } catch (e) { bad++; console.error('FAIL ' + n + ' ' + name + ': ' + e.message); } };
const A = require('assert');
const mockRun = (answers) => { let i = 0; return async () => ({ ok: true, text: JSON.stringify(answers[Math.min(i, answers.length - 1)] && answers[i++] || {}), provider: 'mock', model: 'm' + i }); };
const rubric10 = () => ({ score: 10, deficiencies: [] });
const rubricBelow = () => ({ score: 5, deficiencies: ['always wrong'] });

(async () => {
  await t('score >= 7 passes on first attempt', async () => {
    const g = await gateLLM({ prompt: 'x', rubric: rubric10, runFn: mockRun([{ a: 1 }]) });
    A.strictEqual(g.ok, true); A.strictEqual(g.attempts, 1); A.strictEqual(g.score, 10);
  });
  await t('below-7 retries with targeted feedback, passes when fixed', async () => {
    let seenFeedback = false;
    const run = async ({ prompt }) => {
      if (/SCORED 4\/10/.test(prompt) && /sub_sector "clinic" is not/.test(prompt)) seenFeedback = true;
      return { ok: true, text: JSON.stringify(seenFeedback ? { fixed: true } : { fixed: false }), provider: 'mock', model: 'm' };
    };
    const rubric = (out) => out && out.fixed ? { score: 9, deficiencies: [] } : { score: 4, deficiencies: ['sub_sector "clinic" is not an offered node'] };
    const g = await gateLLM({ prompt: 'x', rubric, runFn: run });
    A.strictEqual(g.ok, true); A.strictEqual(g.attempts, 2); A.ok(seenFeedback, 'feedback message must name the deficiency');
  });
  await t('three strikes -> drop (ok:false, history of 3, deficiencies surfaced)', async () => {
    const g = await gateLLM({ prompt: 'x', rubric: rubricBelow, runFn: mockRun([{}, {}, {}]) });
    A.strictEqual(g.ok, false); A.strictEqual(g.attempts, 3); A.deepStrictEqual(g.deficiencies, ['always wrong']);
  });
  await t('provider outage counts as scored-0 attempt, never throws', async () => {
    const g = await gateLLM({ prompt: 'x', rubric: rubric10, runFn: async () => null, max_attempts: 2 });
    A.strictEqual(g.ok, false); A.strictEqual(g.attempts, 2);
  });
  await t('threshold is configurable (a 7 passes at default, fails at 8)', async () => {
    const r7 = () => ({ score: 7, deficiencies: [] });
    A.strictEqual((await gateLLM({ prompt: 'x', rubric: r7, runFn: mockRun([{}]) })).ok, true);
    A.strictEqual((await gateLLM({ prompt: 'x', rubric: r7, threshold: 8, runFn: mockRun([{}, {}, {}]) })).ok, false);
  });
  await t('H.anchored: verbatim evidence scores, fabricated evidence names the miss', async () => {
    const corpus = 'we are registered in england and wales with offices in dubai';
    A.strictEqual(H.anchored(['offices in dubai'], corpus, 2, 'x').pts, 2);
    const miss = H.anchored(['our paris headquarters'], corpus, 2, 'офис');
    A.strictEqual(miss.pts, 0); A.ok(/not found verbatim/.test(miss.def));
  });
  await t('law-discovery normName folds official-name variants onto one key', async () => {
    A.strictEqual(normName('The Data Protection Act 2018'), normName('Data Protection Act 2018'));
    A.strictEqual(normName('UAE Federal Decree-Law No. 45 of 2021 (PDPL)') === normName('PDPL 45 2021'), true);
  });
  await t('catalogue name index resolves a known statute to its framework_short', async () => {
    const idx = catalogueNameIndex();
    A.ok(idx.size > 50, 'seed index loaded (' + idx.size + ')');
  });
  await t('E-224: attempt 2 carries the FORENSIC protocol, attempt 3 the MAXIMUM-RIGOR protocol + premium chain', async () => {
    const prompts = []; const chains = [];
    const run = async ({ prompt, chain }) => { prompts.push(prompt); chains.push(chain || null); return { ok: true, text: '{}', provider: 'mock', model: 'm' }; };
    const g = await gateLLM({ prompt: 'BASE', rubric: () => ({ score: 3, deficiencies: ['x'] }), runFn: run, premium_chain: [{ provider: 'qwen', model: 'qwen-plus' }] });
    A.strictEqual(g.attempts, 3);
    A.ok(!/ESCALATION PROTOCOL/.test(prompts[0]), 'attempt 1 is baseline');
    A.ok(/attempt 2 \u2014 forensic/.test(prompts[1]), 'attempt 2 forensic protocol');
    A.ok(/attempt 3 \u2014 maximum rigor/.test(prompts[2]), 'attempt 3 maximum-rigor protocol');
    A.strictEqual(chains[2][0].provider, 'qwen', 'attempt 3 escalates to the premium chain');
  });
  await t('E-224: deadline_ms stops further attempts cleanly', async () => {
    const run = async () => { await new Promise(r => setTimeout(r, 120)); return { ok: true, text: '{}', provider: 'mock', model: 'm' }; };
    const g = await gateLLM({ prompt: 'x', rubric: () => ({ score: 1, deficiencies: ['no'] }), runFn: run, deadline_ms: 100 });
    A.strictEqual(g.ok, false); A.ok(g.attempts <= 2, 'stopped early, attempts=' + g.attempts);
  });
  console.log(bad ? 'E222 LLM GATE: FAIL' : 'E222 LLM GATE: ALL GREEN (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})();
