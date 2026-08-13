// ai-act-classifier · Phase 3.
// Classifies a site's AI use into the EU AI Act risk tiers (prohibited, high
// risk, limited risk, minimal risk). Only emits a finding when:
//   - the site uses AI features in a way that requires transparency, AND
//   - the site does NOT carry a visible AI-use / AI-governance notice.
//
// Source: EU AI Act 2024/1689 (in force 1 August 2024; phased application).
//   Art. 5 . Prohibited practices.
//   Art. 6 + Annex III . High-risk AI systems.
//   Art. 50 . Transparency for limited-risk systems (chatbots, deepfakes,
//             emotion recognition, biometric categorisation, synthetic content).
//
// Conservative posture: we mark a site "limited_risk" when a chatbot widget
// or generative-content claim is present. We mark "high_risk_candidate" only
// when both a sector-sensitive context (recruitment, credit scoring, biometric)
// and an AI vendor are present.

const HIGH_RISK_CONTEXT = [
  /\b(?:resume|cv|applicant|recruitment|hiring|talent\s*screening)\b/i,    // Annex III §4 employment
  /\b(?:credit\s*scoring|credit\s*decision|loan\s*decision|underwriting\s*decision)\b/i, // Annex III §5(b)
  /\b(?:biometric\s*(?:categorisation|verification|identification)|face\s*recognition)\b/i, // Annex III §1
  /\b(?:law\s*enforcement|criminal\s*risk|recidivism)\b/i,                  // Annex III §6
  /\b(?:essential\s*public\s*service|access\s*to\s*benefits)\b/i,          // Annex III §5(a)
  /\b(?:medical\s*device|diagnostic\s*decision|clinical\s*decision\s*support)\b/i // Annex III §1(b)
];

const LIMITED_RISK_TRIGGERS = [
  /\b(?:chat\s*with\s*us|live\s*chat|chat\s*bot|chatbot|AI\s*assistant)\b/i,
  /\b(?:powered\s*by\s*AI|AI[-\s]?powered|generated\s+by\s+AI)\b/i,
  /\b(?:synthetic\s*media|deepfake|AI-?generated\s*(?:image|video|audio))\b/i,
  /\b(?:emotion\s*recognition|sentiment\s*detection)\b/i
];

const AI_VENDOR_SCRIPTS = [
  /openai\.com|api\.openai\.com|chat\.openai\.com|chatgpt|\bOpenAI\b/i,
  /anthropic\.com|claude(?:-\d)?\b|\bAnthropic\b/i,
  /huggingface\.co|\bHugging\s*Face\b/i,
  /perplexity\.ai|\bPerplexity\b/i,
  /(?:intercom|drift|tawk\.to|crisp\.chat|tidio|liveperson|botpress|hubspot.*\/conversations)/i,
  /aws\.amazon\.com\/bedrock|azure\.com.*\/cognitive|cohere\.ai|mistral\.ai|\bGemini\s+API\b|\bGoogle\s+AI\b/i
];

const NOTICE_PATTERNS = [
  /AI\s+(?:disclosure|notice|policy|transparency|use|governance)/i,
  /how\s+we\s+use\s+(?:AI|artificial intelligence)/i,
  /this\s+(?:assistant|chatbot|response)\s+(?:is|was)\s+(?:powered\s+by|generated\s+by|AI)/i,
  /you\s+are\s+(?:chatting|interacting)\s+with\s+(?:an?\s+)?AI/i,
  /R[èe]glement\s+(?:UE\s+)?(?:sur|relatif\s+à)\s+l[' ]intelligence\s+artificielle/i,
  /KI[\s-]?Verordnung|EU[\s-]?KI[\s-]?Gesetz/i
];

function findFirst(patterns, text) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function findAll(patterns, text) {
  const out = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) out.push(m[0]);
  }
  return out;
}

/**
 * Classify a site's AI use according to the EU AI Act tiers.
 * Returns:
 *   { uses_ai, risk_tier, signals[], has_notice, requires_finding }
 *   risk_tier ∈ { 'none' | 'minimal' | 'limited' | 'high_risk_candidate' }
 *   requires_finding = true only when uses_ai && !has_notice && risk_tier !== 'minimal'
 */
function classifyAiUse(text) {
  const t = String(text || '');
  const vendorHits = findAll(AI_VENDOR_SCRIPTS, t);
  const limitedHits = findAll(LIMITED_RISK_TRIGGERS, t);
  const highCtx = findFirst(HIGH_RISK_CONTEXT, t);
  const notice = findFirst(NOTICE_PATTERNS, t);

  const uses_ai = vendorHits.length > 0 || limitedHits.length > 0;
  let risk_tier = 'none';
  if (uses_ai) {
    if (highCtx) risk_tier = 'high_risk_candidate';
    else if (limitedHits.length > 0) risk_tier = 'limited';
    else risk_tier = 'minimal';
  }

  const signals = {
    vendors: vendorHits,
    limited_triggers: limitedHits,
    high_risk_context: highCtx,
    notice
  };

  // The transparency requirement under Art. 50 applies to limited + high risk.
  // Minimal (chatbots without consumer disclosure trigger) get no finding.
  const requires_finding = uses_ai && !notice && (risk_tier === 'limited' || risk_tier === 'high_risk_candidate');

  return { uses_ai, risk_tier, signals, has_notice: !!notice, requires_finding };
}

module.exports = { classifyAiUse, HIGH_RISK_CONTEXT, LIMITED_RISK_TRIGGERS, AI_VENDOR_SCRIPTS, NOTICE_PATTERNS };
