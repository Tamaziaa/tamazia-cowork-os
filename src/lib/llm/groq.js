// Groq · ultra-fast LLM backup for Gemini (free tier: 30 req/min, 14,400 req/day)
// Models: llama-3.3-70b-versatile (quality), llama-3.1-8b-instant (speed), openai/gpt-oss-120b (heavy lift)
// Near-unlimited combined with Gemini failover.
const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
function key() { return process.env.GROQ_API_KEY || ''; }
async function generate({ prompt, model = 'llama-3.3-70b-versatile', max_tokens = 2200, temperature = 0.3, system }) {
  if (!key()) return { ok: false, error: 'no_groq_key' };
  const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }], temperature, max_tokens };
  const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout: 25000, retries: 1 });
  if (!r.ok) return { ok: false, status: r.status, error: (r.body || '').slice(0, 300) };
  try {
    const json = JSON.parse(r.body);
    const text = json.choices?.[0]?.message?.content || '';
    return { ok: true, text, model, raw: json };
  } catch (e) { return { ok: false, error: e.message }; }
}
module.exports = { generate };
if (require.main === module) generate({ prompt: 'Reply OK' }).then(r => console.log('Groq ok:', r.ok, '· model:', r.model, '· text:', r.text));
