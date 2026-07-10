// src/lib/llm/router.js · Phase 6 tasks 6.1.2–6.1.5
// Free-first LLM router with cost-tracking ledger.
// Order: Cloudflare Workers AI (free 10k/day) → Groq (free 30 RPM) → Gemini Flash → Haiku reserved.
// Every call writes a row to llm_cost_ledger.
//
// Cost reference (USD per 1M tokens, micro = millionths):
//   cloudflare/llama-3.1-8b   : in 0,    out 0       (free tier)
//   cloudflare/llama-3.3-70b  : in 0,    out 0       (free tier)
//   groq/llama-3.3-70b        : in 0,    out 0       (free)
//   gemini-2.0-flash          : in 0.10, out 0.40
//   claude-haiku-4-5          : in 0.80, out 4.00
//
// Each call: { provider, model, prompt, system?, json?, temperature?, max_tokens?, lead_id?, scan_id?, role? }
// Returns:    { ok, text, model, provider, prompt_tokens, completion_tokens, latency_ms, cost_usd_micro, error? }
//
// All providers default to instruction-following models. Hallucination guard runs OUTSIDE this layer.

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Process-global LLM concurrency gate. Free providers (Cloudflare Workers AI, Groq) 429 on simultaneous requests, so
// a burst of parallel mints each making several LLM calls saturates them. This semaphore caps in-flight LLM requests
// to a small width (default 2) so calls are serialised into separate time slices; combined with retry+backoff in run()
// it converts the concurrency-429 storm into near-100% success. Tunable via LLM_MAX_CONCURRENCY.
const _LLM_CONC = Math.max(1, parseInt(process.env.LLM_MAX_CONCURRENCY || '2', 10));
let _llmActive = 0;
const _llmQueue = [];
function _llmAcquire() {
  if (_llmActive < _LLM_CONC) { _llmActive++; return Promise.resolve(); }
  return new Promise((resolve) => _llmQueue.push(resolve));
}
function _llmRelease() {
  _llmActive--;
  const next = _llmQueue.shift();
  if (next) { _llmActive++; next(); }
}
// Per-provider network timeout. Without it, a stalled LLM socket hangs the whole chain (no fallover).
const LLM_TIMEOUT_MS = Math.max(1000, Number(process.env.LLM_TIMEOUT_MS || 30000));
function pgPath() { return path.resolve(ROOT, 'scripts', 'psql'); }
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(pgPath(), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function esc(v) { if (v === null || v === undefined) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const COST = {
  // micro-USD per token (× 1_000_000)
  'cloudflare/@cf/meta/llama-3.1-8b-instruct': { in: 0, out: 0 },
  'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast': { in: 0, out: 0 },
  'cloudflare/@cf/google/gemma-3-12b-it': { in: 0, out: 0 },
  'groq/llama-3.3-70b-versatile': { in: 0, out: 0 },
  'groq/llama-3.1-8b-instant':    { in: 0, out: 0 },
  'gemini/gemini-2.0-flash':      { in: 0.10, out: 0.40 },
  'gemini/gemini-2.5-flash':      { in: 0.30, out: 2.50 },
  'anthropic/claude-haiku-4-5':   { in: 0.80, out: 4.00 },
  'qwen/qwen-plus':               { in: 0.40, out: 1.20 },
  'qwen/qwen-turbo':              { in: 0.05, out: 0.20 },
  'qwen/qwen-max':                { in: 1.60, out: 6.40 }
};

function ledger({ provider, model, prompt_tokens, completion_tokens, latency_ms, ok, error, lead_id, scan_id, role }) {
  const tag = `${provider}/${model}`;
  const tier = COST[tag] || { in: 0, out: 0 };
  // micro-USD = tokens * micro_per_token / 1_000_000  ⇒ tokens * micro_per_token / 1e6
  const cost_usd_micro = Math.round(((prompt_tokens || 0) * tier.in + (completion_tokens || 0) * tier.out));
  // store role hint in error column when ok and role provided (cheap structured tag)
  const note = role ? (error ? `${error} | role=${role}` : `role=${role}`) : error;
  pg(`INSERT INTO llm_cost_ledger (workspace_id, lead_id, scan_id, provider, model, prompt_tokens, completion_tokens, latency_ms, cost_usd_micro, ok, error) VALUES (1, ${lead_id || 'NULL'}, ${scan_id || 'NULL'}, '${provider}', '${model.replace(/'/g, "''")}', ${prompt_tokens || 0}, ${completion_tokens || 0}, ${latency_ms || 0}, ${cost_usd_micro}, ${ok ? 'TRUE' : 'FALSE'}, ${esc(note)})`);
  return cost_usd_micro;
}

async function callCloudflare({ system, prompt, model, max_tokens, temperature, json }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
  const t0 = Date.now();
  const body = {
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ],
    max_tokens: max_tokens || 1024,
    temperature: typeof temperature === 'number' ? temperature : 0.2
  };
  if (json) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS) // hung-step guard: a stalled provider must fall over, not hang the chain
    });
  } catch (e) { return { ok: false, latency_ms: Date.now() - t0, error: `cf_fetch_${String(e && e.name || e).slice(0,40)}` }; }
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) return { ok: false, latency_ms: latency, error: `cf_http_${res.status}_${JSON.stringify(data?.errors||data).slice(0,200)}` };
  const text = data.result?.response || data.result?.choices?.[0]?.message?.content || '';
  const usage = data.result?.usage || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.prompt_tokens || 0, completion_tokens: usage.completion_tokens || 0 };
}

async function callGroq({ system, prompt, model, max_tokens, temperature, json }) {
  const t0 = Date.now();
  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ],
    max_tokens: max_tokens || 1024,
    temperature: typeof temperature === 'number' ? temperature : 0.2
  };
  if (json) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS) // hung-step guard: a stalled provider must fall over, not hang the chain
    });
  } catch (e) { return { ok: false, latency_ms: Date.now() - t0, error: `groq_fetch_${String(e && e.name || e).slice(0,40)}` }; }
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, latency_ms: latency, error: `groq_http_${res.status}_${JSON.stringify(data).slice(0,200)}` };
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.prompt_tokens || 0, completion_tokens: usage.completion_tokens || 0 };
}

async function callGemini({ system, prompt, model, max_tokens, temperature }) {
  const t0 = Date.now();
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: max_tokens || 1024, temperature: typeof temperature === 'number' ? temperature : 0.2 }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS) // hung-step guard: a stalled provider must fall over, not hang the chain
    });
  } catch (e) { return { ok: false, latency_ms: Date.now() - t0, error: `gemini_fetch_${String(e && e.name || e).slice(0,40)}` }; }
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, latency_ms: latency, error: `gemini_http_${res.status}_${JSON.stringify(data).slice(0,200)}` };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.promptTokenCount || 0, completion_tokens: usage.candidatesTokenCount || 0 };
}

// NVIDIA NIM — free, OpenAI-compatible, Llama-3.3-70B, on a SEPARATE quota from Cloudflare/Groq. Dormant capacity:
// NIM_API_KEY is set but the router never used it (only the legacy askLLM did). Adding it multiplies free headroom
// so a Cloudflare/Groq concurrency-429 falls over to a provider that is NOT also saturated by the same burst.
async function callNIM({ system, prompt, model, max_tokens, temperature, json }) {
  const t0 = Date.now();
  const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }], max_tokens: max_tokens || 1024, temperature: typeof temperature === 'number' ? temperature : 0.2 };
  if (json) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NIM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
    });
  } catch (e) { return { ok: false, latency_ms: Date.now() - t0, error: `nim_fetch_${String(e && e.name || e).slice(0,40)}` }; }
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, latency_ms: latency, error: `nim_http_${res.status}_${JSON.stringify(data).slice(0,200)}` };
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.prompt_tokens || 0, completion_tokens: usage.completion_tokens || 0 };
}

// Anthropic (Claude Haiku) — PAID fallover. Only reached when EVERY free tier (Cloudflare/Groq/NIM/Gemini) has 429'd
// or errored, which is exactly what happens under batch-mint load (free daily allocations exhausted). Without a paid
// fallover the whole LLM chain returns empty and the engine collapses to brittle regex heuristics -> wrong sector,
// wrong jurisdiction, fabricated breaches. Metered (~$0.8/$4 per 1M in/out tokens); fires only on free-tier failure.
async function callAnthropic({ system, prompt, model, max_tokens, temperature }) {
  const t0 = Date.now();
  const _apiModel = ({ 'claude-haiku-4-5': 'claude-haiku-4-5-20251001' })[model] || model;
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: _apiModel, max_tokens: max_tokens || 1024, temperature: typeof temperature === 'number' ? temperature : 0.2, ...(system ? { system } : {}), messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
    });
  } catch (e) { return { ok: false, latency_ms: Date.now() - t0, error: `anthropic_fetch_${String(e && e.name || e).slice(0,40)}` }; }
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, latency_ms: latency, error: `anthropic_http_${res.status}_${JSON.stringify(data).slice(0,200)}` };
  const text = Array.isArray(data && data.content) ? data.content.map((b) => b && b.text || '').join('') : '';
  const usage = (data && data.usage) || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0 };
}

// Alibaba Model Studio (Qwen / DashScope) — OpenAI-compatible. RELIABLE paid primary once the account has a model
// enabled (the China endpoint authenticates; intl rejects the key). Reads DASHSCOPE_API_KEY + optional QWEN_MODEL.
// Placed FIRST in the chains (gated on the key) so, when present, grounding no longer depends on rate-limited free
// tiers. If the key is absent or the model is not yet activated (AccessDenied.Unpurchased) it fails fast and the
// chain falls over to the free providers, so wiring it is safe even before activation.
const _QWEN_BASE = process.env.DASHSCOPE_BASE_URL || 'https://ws-68b311bmgelxd5vz.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
async function callQwen({ system, prompt, model, max_tokens, temperature, json }) {
  const t0 = Date.now();
  const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }], max_tokens: max_tokens || 1024, temperature: typeof temperature === 'number' ? temperature : 0.2 };
  if (json) body.response_format = { type: 'json_object' };
  let res;
  try {
    res = await fetch(`${_QWEN_BASE}/chat/completions`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
    });
  } catch (e) { return { ok: false, latency_ms: Date.now() - t0, error: `qwen_fetch_${String(e && e.name || e).slice(0,40)}` }; }
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, latency_ms: latency, error: `qwen_http_${res.status}_${JSON.stringify(data).slice(0,160)}` };
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.prompt_tokens || 0, completion_tokens: usage.completion_tokens || 0 };
}
const _QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const _QWEN_STEP = process.env.DASHSCOPE_API_KEY ? [{ provider: 'qwen', model: _QWEN_MODEL }] : [];

// Default chain: free first, paid last. NIM inserted as an extra free, separate-quota tier before Gemini.
const _NIM_MODEL = process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct';
const DEFAULT_CHAIN = [
  { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
  { provider: 'groq',       model: 'llama-3.1-8b-instant' },
  ...(process.env.NIM_API_KEY ? [{ provider: 'nim', model: _NIM_MODEL }] : []),
  { provider: 'gemini',     model: 'gemini-2.0-flash' },
  ..._QWEN_STEP
];

// Smart routing by role. HIERARCHY (per founder): groq -> NVIDIA NIM -> gemini -> Alibaba Qwen (paid fallover, last).
const ROUTE_BY_ROLE = {
  extract: [
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    ...(process.env.NIM_API_KEY ? [{ provider: 'nim', model: _NIM_MODEL }] : []),
    { provider: 'gemini',     model: 'gemini-2.0-flash' },
    ..._QWEN_STEP
  ],
  synthesise: [
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    ...(process.env.NIM_API_KEY ? [{ provider: 'nim', model: _NIM_MODEL }] : []),
    { provider: 'gemini',     model: 'gemini-2.0-flash' },
    ..._QWEN_STEP
  ],
  classify: [
    { provider: 'groq',       model: 'llama-3.1-8b-instant' },
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    ...(process.env.NIM_API_KEY ? [{ provider: 'nim', model: _NIM_MODEL }] : []),
    { provider: 'gemini',     model: 'gemini-2.0-flash' },
    ..._QWEN_STEP
  ]
};

async function run(args) {
  const { system, prompt, max_tokens, temperature, json, lead_id, scan_id, role } = args;
  const chain = args.chain || ROUTE_BY_ROLE[role] || DEFAULT_CHAIN;

  // Budget check: have we blown the daily cap?
  const remaining = checkBudgetRemaining();
  if (remaining !== null && remaining <= 0) {
    return { ok: false, error: 'budget_exhausted_for_today', text: '' };
  }

  // Free providers (Cloudflare Workers AI, Groq) rate-limit hard on CONCURRENCY — a burst of simultaneous mints all
  // get HTTP 429 even though the daily VOLUME quota is nowhere near exhausted, and a 429 clears in ~1s. Without retry
  // a single 429 falls straight through the whole chain to empty -> source:fallback (measured ~50% under load). So we
  // retry each provider a few times with JITTERED exponential backoff; the jitter de-synchronises the burst so the
  // retries land in different time slices and most succeed. Paid/quota providers (gemini) get a single attempt.
  const _retryable = (e) => /_429_|_5\d\d_|timeout|fetch_|AbortError|capacity|overloaded/i.test(String(e || ''));
  const _sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const _callRaw = async (step) => {
    if (step.provider === 'cloudflare') return callCloudflare({ system, prompt, model: step.model, max_tokens, temperature, json });
    if (step.provider === 'groq') return callGroq({ system, prompt, model: step.model, max_tokens, temperature, json });
    if (step.provider === 'nim') return callNIM({ system, prompt, model: step.model, max_tokens, temperature, json });
    if (step.provider === 'gemini') return callGemini({ system, prompt, model: step.model, max_tokens, temperature });
    if (step.provider === 'anthropic') return callAnthropic({ system, prompt, model: step.model, max_tokens, temperature });
    if (step.provider === 'qwen') return callQwen({ system, prompt, model: step.model, max_tokens, temperature, json });
    return null;
  };
  // CONCURRENCY GATE: the free providers 429 on simultaneous requests (burst of CONC mints x several LLM calls each),
  // and retrying without limiting concurrency just re-collides. A process-global semaphore serialises LLM calls to a
  // small width so each request lands in its own slice and the daily-volume quota (not concurrency) is the only limit.
  const _callStep = async (step) => { await _llmAcquire(); try { return await _callRaw(step); } finally { _llmRelease(); } };
  let lastErr = null;
  for (const step of chain) {
    let r = null;
    const maxAttempts = step.provider === 'gemini' ? 1 : 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      r = await _callStep(step);
      if (!r) break;
      if ((r.ok && r.text && String(r.text).trim()) || !_retryable(r.error) || attempt === maxAttempts - 1) break;
      await _sleep(400 + attempt * 700 + Math.floor(Math.random() * 800)); // jittered backoff: ~0.4-1.2s, 1.1-1.9s
    }
    if (!r) continue;

    const cost = ledger({
      provider: step.provider, model: step.model,
      prompt_tokens: r.prompt_tokens || 0, completion_tokens: r.completion_tokens || 0,
      latency_ms: r.latency_ms || 0, ok: r.ok, error: r.error,
      lead_id, scan_id, role
    });

    if (r.ok && r.text && String(r.text).trim()) {
      // Bump scanner_budget_state.spent_usd_micro
      bumpBudget(cost);
      return {
        ok: true, text: r.text, provider: step.provider, model: step.model,
        prompt_tokens: r.prompt_tokens || 0, completion_tokens: r.completion_tokens || 0,
        latency_ms: r.latency_ms || 0, cost_usd_micro: cost
      };
    }
    lastErr = r.error || 'no_text';
  }
  return { ok: false, error: lastErr || 'all_providers_failed', text: '' };
}

function checkBudgetRemaining() {
  const raw = pg(`SELECT (daily_cap_usd_micro - spent_usd_micro) FROM scanner_budget_state WHERE workspace_id=1 AND bucket_day=CURRENT_DATE`);
  if (!raw) {
    pg(`INSERT INTO scanner_budget_state (workspace_id, bucket_day) VALUES (1, CURRENT_DATE) ON CONFLICT DO NOTHING`);
    return null;
  }
  return Number(raw);
}
function bumpBudget(cost) {
  if (!cost || cost <= 0) return;
  pg(`UPDATE scanner_budget_state SET spent_usd_micro = spent_usd_micro + ${cost} WHERE workspace_id=1 AND bucket_day=CURRENT_DATE`);
  // Insert row if first call today
  const exists = pg(`SELECT 1 FROM scanner_budget_state WHERE workspace_id=1 AND bucket_day=CURRENT_DATE`);
  if (!exists) pg(`INSERT INTO scanner_budget_state (workspace_id, bucket_day, spent_usd_micro) VALUES (1, CURRENT_DATE, ${cost}) ON CONFLICT DO NOTHING`);
}

// CLI smoke test
if (require.main === module) {
  (async () => {
    const r = await run({
      role: 'extract',
      system: 'You return only the requested JSON. No prose.',
      prompt: 'Return JSON {"ok":true,"engine":"phase6"}.',
      max_tokens: 64, temperature: 0, json: true
    });
    console.log(JSON.stringify(r, null, 2));
  })().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run, ledger, ROUTE_BY_ROLE };
