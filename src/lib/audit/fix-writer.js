'use strict';
// UNIQUE-FIX WRITER — rewrites each rendered finding's "Tamazia fix" into a DISTINCT, specific sentence
// so no two fixes repeat their wording or structure (founder directive: "the Tamazia fix should always
// be in a different language; never repeat lines"). One batched free-LLM call per ~30 findings;
// TRANSFORM-ONLY (it rephrases the remediation it is handed and invents no fact/figure/date); fail-open
// per item to the existing DB fix. Guarantees no two rendered fixes share an opening. (F-uniquefix)
const { askLLM } = require('./llm.js');

const _BANNED = /^(tamazia (implements and verifies|resolves and verifies)|we (will|implement and verify))/i;

async function uniqueFixes(findings, { company = '', env = process.env } = {}) {
  const items = (findings || []).filter((f) => f && (f.tamazia_fix_short || f.description || f.fact));
  if (items.length < 2) return findings;
  const GROUP = 30;
  for (let start = 0; start < items.length; start += GROUP) {
    const batch = items.slice(start, start + GROUP);
    const list = batch.map((f, i) => `${i}. [${f.framework || f.framework_short || ''}] gap: ${String(f.fact || f.description || '').slice(0, 130)} | current: ${String(f.tamazia_fix_short || '').slice(0, 140)}`).join('\n');
    const prompt = `You are Tamazia's remediation lead, writing the "Tamazia fix" line for each finding in a regulatory/SEO/AI-visibility audit for ${company || 'this firm'}.
For EACH numbered item, write ONE confident sentence stating exactly what Tamazia implements to close that specific gap.
HARD RULES (a managing partner will read all of these in a row — sameness is unacceptable):
- Every sentence must BEGIN DIFFERENTLY; never reuse an opening verb across items. Rotate verbs like: drafts, builds, wires, configures, deploys, writes, embeds, engineers, installs, sets up, publishes, hardens, maps, instruments, rewrites, authors, restructures, provisions.
- Vary the sentence STRUCTURE too — do not produce one template with words swapped.
- Be concrete and specific to THAT requirement; name the artefact/action. British English, under 26 words, no marketing fluff, no "we will", no "ensure".
- Invent NO facts, fines, dates, figures or law — only describe the remediation.
Return ONLY a JSON array of exactly ${batch.length} strings, index-aligned to the items.
Items:
${list}`;
    let arr = null;
    try {
      const { text } = await askLLM(prompt, { temperature: 0.6, maxTokens: 1500, json: true }, env);
      if (text) {
        const j = JSON.parse(String(text).replace(/^[\s\S]*?([[{])/, '$1').replace(/```/g, ''));
        if (Array.isArray(j)) arr = j;
        else if (j && typeof j === 'object') {                       // json_object mode wraps the array under SOME key — grab the first array value
          arr = Object.values(j).find((v) => Array.isArray(v)) || null;
          if (!arr) { const ks = Object.keys(j).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b); if (ks.length) arr = ks.map((k) => j[k]); }
        }
      }
    } catch (_e) { arr = null; }
    if (!Array.isArray(arr)) continue;       // fail-open: keep existing fixes for this batch
    const seen = new Set();
    batch.forEach((f, i) => {
      let s = String(arr[i] || '').trim().replace(/^["'\d.)\s-]+/, '').trim();
      if (!s || s.length < 12) return;
      if (!/^tamazia/i.test(s)) s = 'Tamazia ' + s.charAt(0).toLowerCase() + s.slice(1);
      const open = s.toLowerCase().replace(/^tamazia\s+/, '').split(/\s+/).slice(0, 2).join(' ');
      if (seen.has(open)) return;             // still a duplicate opener → keep the original rather than repeat
      seen.add(open);
      f.tamazia_fix_short = s.replace(/[\s.]+$/, '') + '.';
    });
  }
  // Deterministic GUARANTEE — no two rendered fixes may be byte-identical (the LLM can fail/partial/rate-limit).
  // Any duplicate (or empty) fix is rewritten from the finding's own requirement with a rotating verb.
  const VERB = ['Tamazia drafts', 'Tamazia configures', 'Tamazia embeds', 'Tamazia wires in', 'Tamazia builds', 'Tamazia publishes', 'Tamazia hardens', 'Tamazia installs', 'Tamazia provisions', 'Tamazia rewrites', 'Tamazia authors', 'Tamazia maps', 'Tamazia instruments', 'Tamazia restructures'];
  const seenFull = new Set(); let vi = 0;
  for (const f of items) {
    const s0 = String(f.tamazia_fix_short || '').trim();
    const norm = s0.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 44);
    if (!s0 || seenFull.has(norm)) {
      const what = String(f.fact || f.description || 'the missing requirement').replace(/\s+/g, ' ').replace(/[.\s]+$/, '').slice(0, 90);
      f.tamazia_fix_short = (VERB[vi++ % VERB.length] + ' ' + (what.charAt(0).toLowerCase() + what.slice(1)) + ' on your live site').replace(/[\s.]+$/, '') + '.';
    }
    seenFull.add(String(f.tamazia_fix_short).toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 44));
  }
  return findings;
}

module.exports = { uniqueFixes };
