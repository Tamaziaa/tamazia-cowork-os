// Loader for the grounded 100-prompt library. Lets any LLM stage pull a prompt by id/stage and fill its
// {placeholders} from real engine grounding (engine-bridge output, statute-rag context, live page text).
'use strict';
const LIB = require('./prompt-library.json');
function byStage(stage) { return LIB.prompts.filter((p) => p.stage === stage); }
function get(id) { return LIB.prompts.find((p) => p.id === id) || null; }
function stages() { return LIB.stages.slice(); }
// fill('P041', { requirement, ctx, statute, ... }) -> a ready prompt string (unfilled placeholders left visible).
function fill(id, vars = {}) {
  const p = get(id); if (!p) return '';
  return String(p.template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}
module.exports = { LIB, byStage, get, stages, fill, count: LIB.prompts.length };
