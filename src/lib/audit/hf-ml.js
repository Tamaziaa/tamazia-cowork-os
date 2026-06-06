'use strict';
// HuggingFace free serverless Inference — the ML scalpel for the £0 data engine.
// Three pipeline tasks over router.huggingface.co/hf-inference: zero-shot classification (sector/intent/E-E-A-T),
// NER (firm-identity / location), and sentence-embeddings (relevance). EVERY function fail-opens to null when:
//   - no HF_TOKEN / HUGGINGFACE_TOKEN is set  (engine runs at £0 with the LLM/regex fallback carrying the load)
//   - the free $0.10/mo credit is exhausted (402) or rate-limited (429) or the model is cold (503)
//   - any network/parse error or timeout
// Results are cached in-process per (model,input) so the same audit never pays twice. ADDITIVE: callers treat
// null as "no HF signal" and degrade silently — never throws.
const https = require('https');

function _token(env) { env = env || process.env; return env.HF_TOKEN || env.HUGGINGFACE_TOKEN || env.HUGGINGFACE || env.HF_API_KEY || env.HUGGINGFACEHUB_API_TOKEN || ''; }

const MODELS = {
  zeroShot: 'MoritzLaurer/deberta-v3-base-zeroshot-v2.0',
  ner: 'dslim/bert-base-NER',
  embed: 'sentence-transformers/all-MiniLM-L6-v2',
};

const _cache = new Map();           // key -> parsed JSON (or null)
let _disabled = false;              // hard kill-switch once we see 402 (out of credit) — stop hammering for the rest of the build

function _post(model, payload, token, timeoutMs) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      method: 'POST', host: 'router.huggingface.co', path: '/hf-inference/models/' + model,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs || 12000,
    }, (res) => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => {
        if (res.statusCode === 402) { _disabled = true; return resolve(null); }   // out of free credit → stop trying
        if (res.statusCode !== 200) return resolve(null);                          // 429/503/cold/etc → fail-open
        try { resolve(JSON.parse(b)); } catch (_e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

async function _call(model, payload, env, cacheKey) {
  if (_disabled) return null;
  const token = _token(env); if (!token) return null;
  const ck = model + '|' + (cacheKey != null ? cacheKey : JSON.stringify(payload));
  if (_cache.has(ck)) return _cache.get(ck);
  const out = await _post(model, payload, token, env && env._HF_TIMEOUT_MS);
  _cache.set(ck, out);
  return out;
}

// Zero-shot: returns { labels:[...sorted desc by score], scores:[...] } or null.
async function zeroShot(text, labels, opts = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!t || !Array.isArray(labels) || !labels.length) return null;
  const env = (opts && opts.env) || process.env;
  const r = await _call(MODELS.zeroShot, { inputs: t, parameters: { candidate_labels: labels, multi_label: !!opts.multi_label } }, env, t + '::' + labels.join(','));
  if (r && Array.isArray(r.labels) && Array.isArray(r.scores)) return { labels: r.labels, scores: r.scores };
  return null;
}

// NER: returns [{ entity_group, word, score }] or null.
async function ner(text, opts = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!t) return null;
  const env = (opts && opts.env) || process.env;
  const r = await _call(MODELS.ner, { inputs: t }, env, t);
  if (Array.isArray(r)) return r.filter(x => x && x.entity_group);
  return null;
}

// Embeddings: returns number[][] (one vector per input) or null.
async function embed(texts, opts = {}) {
  const arr = (Array.isArray(texts) ? texts : [texts]).map(x => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 512)).filter(Boolean);
  if (!arr.length) return null;
  const env = (opts && opts.env) || process.env;
  const r = await _call(MODELS.embed, { inputs: arr, options: { wait_for_model: false } }, env, arr.join('||'));
  if (Array.isArray(r) && r.length && Array.isArray(r[0]) && typeof r[0][0] === 'number') return r;
  // a single-string input can come back as a flat vector
  if (Array.isArray(r) && typeof r[0] === 'number' && arr.length === 1) return [r];
  return null;
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function enabled(env) { return !!_token(env) && !_disabled; }

module.exports = { zeroShot, ner, embed, cosine, enabled, MODELS };
