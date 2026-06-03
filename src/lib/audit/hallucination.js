'use strict';
// P3.9 hallucination + sentiment. Asks the free-LLM chain what it knows about the firm by name+domain. If it has
// no reliable info (the common case) the finding is that AI cannot vouch for or recommend you and may invent
// details when asked. If it knows the firm, we check sentiment and flag a negative/outdated description.
const { askLLM } = require('./llm.js');
async function hallucinationCheck({ company, domain, env = process.env } = {}) {
  if (!company) return { ok: false };
  const r = await askLLM('In 2 sentences, what is ' + company + ' (' + domain + ')? If you do not have reliable, specific information about this exact organisation, reply with exactly: NO RELIABLE INFO.', { temperature: 0, maxTokens: 170 }, env);
  const txt = (r.text || '').trim();
  if (!txt) return { ok: false, reason: 'no_llm' };
  const knows = !/NO RELIABLE INFO/i.test(txt) && txt.length > 45 && !/\b(I (do not|don't|couldn't|cannot|can't)|no (specific |reliable )?information|not (aware|familiar)|unable to find|I'm not sure|I could not)\b/i.test(txt);
  let sentiment = 'neutral';
  if (knows) { const s = await askLLM('Classify the tone of this description of a firm as one word: positive, neutral, or negative.\n\n"' + txt + '"', { temperature: 0, maxTokens: 6 }, env); sentiment = ((s.text || '').toLowerCase().match(/positive|negative|neutral/) || ['neutral'])[0]; }
  let finding = null;
  if (!knows) {
    finding = {
      bucket: 'ai_visibility', severity: 'P1', rule_type: 'observed', kind: 'observed',
      citation: 'AI knowledge of you', framework_short: 'GEO', citation_url: '',
      fact: 'Asked who you are by name, a leading AI model has no reliable information about your firm.',
      layman_explanation: 'When a buyer asks an AI assistant about you by name, it cannot describe you, so it will not vouch for or recommend you, and when pushed it may invent details (a hallucination) that you cannot control. Competitors the model does know get described and recommended. Becoming a model-known entity is what fixes this.',
      tamazia_fix_short: 'Tamazia builds the entity footprint (schema, Wikidata, authoritative mentions) that makes AI models actually know and describe you correctly.',
      evidence_quote: 'model reply: "' + txt.slice(0, 90) + '"', evidence: 'free-LLM knowledge probe (' + (r.provider || 'llm') + ')', fine_low_gbp: null, fine_high_gbp: null,
    };
  } else if (sentiment === 'negative') {
    finding = {
      bucket: 'ai_visibility', severity: 'P2', rule_type: 'observed', kind: 'observed',
      citation: 'AI sentiment about you', framework_short: 'GEO', citation_url: '',
      fact: 'A leading AI model describes your firm in negative terms.',
      layman_explanation: 'When buyers ask AI about you, the description leans negative. That shapes the first impression before they ever reach your site, and you have no control over it unless the authoritative sources AI reads are corrected.',
      tamazia_fix_short: 'Tamazia audits the sources feeding the negative description and builds the positive, accurate entity coverage AI should be reading.',
      evidence_quote: 'model reply: "' + txt.slice(0, 90) + '"', evidence: 'free-LLM knowledge + sentiment probe (' + (r.provider || 'llm') + ')', fine_low_gbp: null, fine_high_gbp: null,
    };
  }
  return { ok: true, ai_knows: knows, sentiment, ai_description: txt.slice(0, 300), provider: r.provider, finding };
}
module.exports = { hallucinationCheck };
