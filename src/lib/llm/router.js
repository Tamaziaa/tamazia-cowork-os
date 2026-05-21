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
  'anthropic/claude-haiku-4-5':   { in: 0.80, out: 4.00 }
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
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
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
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
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const latency = Date.now() - t0;
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, latency_ms: latency, error: `gemini_http_${res.status}_${JSON.stringify(data).slice(0,200)}` };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};
  return { ok: true, text, latency_ms: latency, prompt_tokens: usage.promptTokenCount || 0, completion_tokens: usage.candidatesTokenCount || 0 };
}

// Default chain: free first, paid last.
const DEFAULT_CHAIN = [
  { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  { provider: 'cloudflare', model: '@cf/meta/llama-3.1-8b-instruct' },
  { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
  { provider: 'groq',       model: 'llama-3.1-8b-instant' },
  { provider: 'gemini',     model: 'gemini-2.0-flash' }
];

// Smart routing by role
const ROUTE_BY_ROLE = {
  // Fast structured extraction: prefer Groq 70B (faster, JSON-stable) then Cloudflare
  extract: [
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
    { provider: 'cloudflare', model: '@cf/meta/llama-3.1-8b-instruct' },
    { provider: 'gemini',     model: 'gemini-2.0-flash' }
  ],
  // Pointer synthesis: bigger model first
  synthesise: [
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
    { provider: 'gemini',     model: 'gemini-2.0-flash' }
  ],
  // Cheap classification: free 8B first
  classify: [
    { provider: 'cloudflare', model: '@cf/meta/llama-3.1-8b-instruct' },
    { provider: 'groq',       model: 'llama-3.1-8b-instant' },
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' }
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

  let lastErr = null;
  for (const step of chain) {
    let r;
    if (step.provider === 'cloudflare') r = await callCloudflare({ system, prompt, model: step.model, max_tokens, temperature, json });
    else if (step.provider === 'groq')  r = await callGroq({ system, prompt, model: step.model, max_tokens, temperature, json });
    else if (step.provider === 'gemini') r = await callGemini({ system, prompt, model: step.model, max_tokens, temperature });
    else continue;

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
