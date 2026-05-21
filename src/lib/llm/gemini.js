// Gemini Flash · primary LLM (free tier · 15 req/min · 1500 req/day)
// Used for lead enrichment, draft personalisation, intel classification.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

function key() { return process.env.GEMINI_API_KEY || ''; }

async function tryGroqFallback({ prompt, system, max_tokens, temperature }) {
  try {
    const { generate: groqGen } = require('./groq.js');
    const r = await groqGen({ prompt, system, max_tokens: Math.min(max_tokens || 2200, 8000), temperature });
    if (r.ok) return { ok: true, text: r.text, model: r.model, via: 'groq_fallback' };
    return { ok: false, error: r.error || 'groq_failed' };
  } catch (e) { return { ok: false, error: `groq_unavailable: ${e.message}` }; }
}

async function generate({ prompt, system, model, max_tokens = 1024, temperature = 0.3 }) {
  if (!key()) {
    // No Gemini key — try Groq immediately
    return tryGroqFallback({ prompt, system, max_tokens, temperature });
  }
  // Auto-failover across Gemini models on 503/429
  const models = model ? [model] : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
  let lastErr = null;
  for (const m of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key()}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: max_tokens },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {})
    };
    const r = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout: 25000, retries: 1 });
    if (!r.ok) { lastErr = { status: r.status, error: (r.body || '').slice(0, 300) }; continue; }
    try {
      const json = JSON.parse(r.body);
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) return { ok: true, text, raw: json, model: m };
      lastErr = { error: 'empty_text', raw: json };
    } catch (e) { lastErr = { error: e.message }; }
  }
  // All Gemini models failed → fall over to Groq llama-3.3-70b
  const groq = await tryGroqFallback({ prompt, system, max_tokens, temperature });
  if (groq.ok) return { ...groq, gemini_failed: true, gemini_last_err: lastErr };
  return { ok: false, ...lastErr, groq_error: groq.error };
}

async function extractJson({ prompt, system, schema_hint }) {
  const fullPrompt = `${prompt}\n\nReturn ONLY a JSON object${schema_hint ? ' matching: ' + schema_hint : ''}. No markdown, no preamble.`;
  const r = await generate({ prompt: fullPrompt, system, temperature: 0.1 });
  if (!r.ok) return r;
  // Strip markdown code fences if present
  let txt = r.text.trim();
  if (txt.startsWith('```')) txt = txt.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '');
  // If response contains text before/after JSON, extract the JSON object
  if (!txt.startsWith('{') && !txt.startsWith('[')) {
    const first = txt.indexOf('{');
    const last = txt.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) txt = txt.slice(first, last + 1);
  }
  try { return { ok: true, data: JSON.parse(txt), raw_text: r.text }; }
  catch (e) { return { ok: false, error: 'json_parse_failed', raw_text: r.text.slice(0, 600) }; }
}

module.exports = { generate, extractJson };

if (require.main === module) {
  (async () => {
    const r = await generate({ prompt: 'Reply with the single word OK' });
    console.log('Gemini ok:', r.ok, '· text:', r.text);
  })();
}
