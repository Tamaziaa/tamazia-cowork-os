'use strict';
// Shared free-LLM helper with an ALWAYS-ON fallback chain so no GEO module ever dies on one provider's rate limit.
// Order = best free first: Groq (fastest, Llama-3.3-70B) -> NVIDIA NIM (same model, the standing fallback) ->
// Gemini 2.0 Flash (plain). Each falls through on 429/error/empty. askGeminiGrounded() adds REAL Google-grounded
// citations when Gemini's free grounding quota is available (graceful: returns null when exhausted).
const https = require('https');

// Global token-bucket: cap LLM calls across ALL concurrent mints so worker concurrency never trips
// Groq's free ~100 req/min ceiling. Configurable via LLM_MAX_PER_MIN (0/blank = unlimited).
const _RL = { max: parseInt(process.env.LLM_MAX_PER_MIN || '90', 10), hits: [] };
function _rlWait() {
  if (!_RL.max || _RL.max <= 0) return Promise.resolve();
  return new Promise((res) => {
    const tick = () => {
      const now = Date.now();
      _RL.hits = _RL.hits.filter((t) => now - t < 60000);
      if (_RL.hits.length < _RL.max) { _RL.hits.push(now); res(); } else { setTimeout(tick, 200); }
    };
    tick();
  });
}

async function _post(url, key, payload, timeout = 9000) {
  await _rlWait();
  return new Promise((resolve) => {
    const body = JSON.stringify(payload); const u = new URL(url);
    const req = https.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, timeout }, (r) => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => resolve({ status: r.statusCode, body: b }));
    });
    req.on('error', () => resolve({ status: 0, body: '' })); req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.write(body); req.end();
  });
}

function _providers(env) {
  const p = [];
  if (env.GROQ_API_KEY) p.push({ name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY, model: 'llama-3.3-70b-versatile' });
  if (env.NIM_API_KEY) p.push({ name: 'nvidia-nim', url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: env.NIM_API_KEY, model: 'meta/llama-3.3-70b-instruct' });
  if (env.DEEPSEEK_API_KEY) p.push({ name: 'deepseek', url: 'https://api.deepseek.com/chat/completions', key: env.DEEPSEEK_API_KEY, model: 'deepseek-chat' });
  if (env.PERPLEXITY_API_KEY) p.push({ name: 'perplexity', url: 'https://api.perplexity.ai/chat/completions', key: env.PERPLEXITY_API_KEY, model: 'sonar' });
  if (env.OPENAI_API_KEY) p.push({ name: 'openai', url: 'https://api.openai.com/v1/chat/completions', key: env.OPENAI_API_KEY, model: 'gpt-4o-mini' });
  // Zero-cost mode: keep only the free provider (Groq); Gemini free is added separately in askLLM.
  if (/^(1|true|yes|on)$/i.test(env.LLM_FREE_ONLY || '')) return p.filter((x) => x.name === 'groq');
  return p;
}

async function _geminiPlain(prompt, key, temperature, maxTokens, timeout = 9000) {
  const r = await new Promise((resolve) => {
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: maxTokens } });
    const req = https.request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout }, (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', () => resolve({ status: 0, body: '' })); req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.write(body); req.end();
  });
  if (r.status !== 200) return '';
  try { const j = JSON.parse(r.body); return (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || ''; } catch (_e) { return ''; }
}

// Primary text helper with full fallback chain. Returns { text, provider }.
async function askLLM(prompt, { temperature = 0.4, maxTokens = 400, json = false } = {}, env = process.env) {
  for (const p of _providers(env)) {
    const payload = { model: p.model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens };
    if (json && p.name !== 'perplexity') payload.response_format = { type: 'json_object' };
    const r = await _post(p.url, p.key, payload);
    if (r.status === 200) { try { const t = JSON.parse(r.body).choices[0].message.content; if (t && t.trim()) return { text: t, provider: p.name }; } catch (_e) {} }
    // on 429/5xx/empty: fall through to next provider
  }
  if (env.GEMINI_API_KEY) { const t = await _geminiPlain(prompt, env.GEMINI_API_KEY, temperature, maxTokens); if (t) return { text: t, provider: 'gemini' }; }
  return { text: '', provider: null };
}

// P3.2b: REAL Google-grounded answer + the sources Google's AI actually cites. Graceful: null when quota exhausted.
async function askGeminiGrounded(prompt, env = process.env, timeout = 12000) {
  const key = env.GEMINI_API_KEY; if (!key) return null;
  const r = await new Promise((resolve) => {
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] });
    const req = https.request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout }, (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', () => resolve({ status: 0, body: '' })); req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.write(body); req.end();
  });
  if (r.status !== 200) return null; // 429 quota / error -> graceful null, caller falls back to askLLM
  try {
    const j = JSON.parse(r.body); const c = (j.candidates || [])[0] || {}; const gm = c.groundingMetadata || {};
    const text = (c.content && c.content.parts || []).map(p => p.text || '').join(' ');
    const sources = (gm.groundingChunks || []).map(x => x.web && ({ uri: x.web.uri, title: x.web.title })).filter(Boolean);
    return { text, sources, queries: gm.webSearchQueries || [] };
  } catch (_e) { return null; }
}
module.exports = { askLLM, askGeminiGrounded };
