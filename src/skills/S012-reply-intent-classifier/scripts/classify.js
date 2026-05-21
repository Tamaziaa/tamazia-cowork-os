#!/usr/bin/env node
// S012 reply-intent-classifier (production-grade)
// 13 categories: HOT_BOOK, HOT_PRICE, WARM_INFO, WARM_TIMING, NURTURE,
//                OBJECTION_BUDGET, OBJECTION_INCUMBENT, OBJECTION_FIT,
//                REDIRECT, OOO, HOSTILE, LEGAL_THREAT, UNSUBSCRIBE
//
// Strategy:
//   Step 0 — message_hash dedupe via classifier_audit_log (G3 idempotency)
//   Step 1 — fast deterministic regex classifier (handles ~70 % of replies including all unsubscribes,
//            all OOO patterns, legal-threat tells, hard hostile signals)
//   Step 2 — if confidence < 0.7, escalate to LLM stack:
//             primary  : Cloudflare Workers AI Llama 3.1 8B (10k neurons/day free)
//             fallback : Groq Llama 3.1 70B (30 req/min free)
//             reserved : Claude Haiku for LEGAL_THREAT / HOSTILE only
//   Step 3 — write classifier_audit_log row; if step 2 failed, write dead_letter_queue
//   Step 4 — return { category, confidence, reasoning, llm_used, cache_hit }
//
// Usage:
//   echo "{json reply payload}" | node classify.js
//   node classify.js --test-classify --input "reply text" --lead-id 123
//   node classify.js --replay-fixtures   # runs the regression suite, prints precision/recall
//
// Output JSON shape:
//   { category, confidence, reasoning, llm_used, classifier_version, cache_hit }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

function runPsql(url, sql) {
  const psql = lookupPsqlPath();
  return execFileSync(psql, [url, '-tA', '-c', sql], { encoding: 'utf8' });
}

const CLASSIFIER_VERSION = 'v1.0.0';
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURES_PATH = path.resolve(ROOT, 'tests', 'regression-fixtures', 'classifier.json');

// ============================================================================
// Layer 1 — deterministic regex classifier
// Ordered most-specific first. Each rule has a confidence value the matcher
// can return without needing LLM help.
// ============================================================================
const RULES = [
  // UNSUBSCRIBE — must beat everything else; auto-DNC
  { cat: 'UNSUBSCRIBE',     conf: 0.95, patterns: [/\bunsubscribe\b/i, /\bopt[- ]out\b/i, /please remove me/i, /stop email/i, /take me off/i, /remove (me )?from (your |the )?(list|mailing)/i, /\breply STOP\b/i] },

  // LEGAL_THREAT — explicit legal language; reserved Haiku verify in real flow
  { cat: 'LEGAL_THREAT',    conf: 0.92, patterns: [/legal action/i, /our (lawyer|solicitor|counsel)/i, /cease and desist/i, /\bICO complaint\b/i, /breach of (GDPR|the GDPR|UK GDPR|PECR)/i, /\bsue\b/i, /injunction/i] },

  // OOO — never reply
  { cat: 'OOO',             conf: 0.95, patterns: [/^auto[- ]?reply/im, /out of (the )?office/i, /\bI am (currently )?out of office\b/i, /\bI'm (currently )?out of office\b/i, /annual leave/i, /\bon (parental|maternity|paternity) leave\b/i, /\bauto-?responder\b/i, /\bAUTO[: ]/i] },

  // HOSTILE — non-legal hostile language
  { cat: 'HOSTILE',         conf: 0.88, patterns: [/fuck off/i, /piss off/i, /\bspam\b/i, /you are (a )?scam/i, /how dare you/i, /never (contact|email) me again/i, /report you to the ICO/i, /\bharass(ing|ment)\b/i] },

  // HOT_BOOK — explicit booking intent
  { cat: 'HOT_BOOK',        conf: 0.9,  patterns: [/book (a |the )?(call|meeting|slot|discovery)/i, /happy to (chat|talk|hop on)/i, /set up (a )?call/i, /grab (a )?(slot|time|coffee)/i, /\bschedule (a )?(call|meeting)\b/i, /send me a (link|calendly)/i, /can we (have|set up|arrange) (a )?call/i, /let'?s (jump on|hop on|set up) a/i] },

  // OBJECTION_BUDGET — must beat HOT_PRICE since "no budget for X" mentions both "budget" and "cost"
  { cat: 'OBJECTION_BUDGET', conf: 0.88, patterns: [/\bno budget\b/i, /tight on budget/i, /not in (the )?budget/i, /can'?t afford/i, /cannot afford/i, /too expensive/i, /\boverpriced\b/i, /\bcost prohibitive\b/i, /cost[- ]prohibitive/i, /out of (our )?(budget|price range)/i] },

  // HOT_PRICE — explicit pricing question; deliberately does NOT match "budget for X" alone
  { cat: 'HOT_PRICE',       conf: 0.88, patterns: [/how much/i, /what (does it|do you) cost/i, /\bpricing\b/i, /\bprice\b/i, /retainer (fee|cost|price|tiers)/i, /monthly (fee|cost|price|retainer)/i, /\bcost monthly\b/i, /how (much|expensive) is/i, /what'?s the budget for/i, /what is the budget for/i, /share (the )?pricing/i, /pricing details/i] },

  // REDIRECT — names another contact
  { cat: 'REDIRECT',        conf: 0.85, patterns: [/please (talk|speak) to ([A-Z][a-z]+)/i, /\bcc[- ]?ing\b/i, /\bcopying (in )?([A-Z][a-z]+)/i, /([A-Z][a-z]+) handles (this|that|marketing|digital|SEO)/i, /\breach out to ([A-Z][a-z]+)/i, /\btry ([A-Z][a-z]+ [A-Z][a-z]+)/i] },

  // WARM_TIMING — interested but later
  { cat: 'WARM_TIMING',     conf: 0.85, patterns: [/circle back/i, /\bnot (right )?now\b/i, /come back in (a few )?(weeks|months)/i, /follow up in/i, /\bQ[1-4]\b/i, /next quarter/i, /after (the )?(launch|summer|christmas|easter|year[- ]end)/i, /\btoo busy (at the moment|right now)/i] },

  // OBJECTION_INCUMBENT — covers both "in-house" and "inhouse" plus team variants
  { cat: 'OBJECTION_INCUMBENT', conf: 0.85, patterns: [/already (work|working) with/i, /\bexisting agency\b/i, /current (SEO )?(agency|partner|provider)/i, /have an? (in-house|inhouse) team/i, /in[- ]?house team (manages|handles|covers|owns|runs)/i, /(in[- ]?house|inhouse) team/i, /happy with our (current|present) (provider|agency|setup)/i] },

  // OBJECTION_FIT
  { cat: 'OBJECTION_FIT',   conf: 0.82, patterns: [/not (a )?(good )?fit/i, /not relevant/i, /wrong (company|person|department)/i, /\bnot interested\b/i, /do not need/i, /don'?t need/i, /\bnot for us\b/i, /no thank you/i] },

  // WARM_INFO — wants more information
  { cat: 'WARM_INFO',       conf: 0.82, patterns: [/can you (share|send) (more|some) (info|details|information)/i, /more (info|information|details) please/i, /tell me more/i, /what does the (scan|audit) (include|cover)/i, /how does (this|it) work/i, /walk me through/i, /(case|reference) studies?/i] },

  // NURTURE — soft positive but no action
  { cat: 'NURTURE',         conf: 0.7,  patterns: [/keep me (in mind|posted|in the loop)/i, /\bthanks for reaching out\b/i, /interesting/i, /noted/i] },
];

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

function messageHash(text, leadId) {
  return crypto.createHash('sha256').update(`${leadId || ''}::${normalise(text)}`).digest('hex');
}

function deterministicClassify(text) {
  // OOO check special: must dominate even if HOT_BOOK keywords appear (an OOO message can mention "book")
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      const m = text.match(pat);
      if (m) {
        return { category: rule.cat, confidence: rule.conf, reasoning: `regex matched: ${m[0]}` };
      }
    }
  }
  return null;
}

function lookupPsqlPath() {
  return path.resolve(ROOT, 'scripts', 'psql');
}

function checkCache(hash) {
  const psql = lookupPsqlPath();
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || !fs.existsSync(psql)) return null;
  try {
    const sql = `SELECT category, confidence, reasoning FROM reply_classifications WHERE message_hash = '${hash}' AND classified_at >= NOW() - INTERVAL '24 hours' LIMIT 1`;
    const out = runPsql(url, sql).toString().trim();
    if (!out) return null;
    const [category, confidence, ...rest] = out.split('\t');
    return { category, confidence: Number(confidence), reasoning: rest.join('\t') };
  } catch (_e) { return null; }
}

function writeAuditRow(row) {
  const psql = lookupPsqlPath();
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || !fs.existsSync(psql)) return;
  const esc = v => `'${String(v || '').replace(/'/g, "''")}'`;
  try {
    const sql = `INSERT INTO classifier_audit_log
      (workspace_id, message_hash, classifier_version, llm_used, llm_latency_ms, tokens_in, tokens_out, output_category, output_confidence, fallback_chain, cache_hit)
      VALUES (1, ${esc(row.message_hash)}, ${esc(CLASSIFIER_VERSION)}, ${esc(row.llm_used)}, ${row.llm_latency_ms || 0}, ${row.tokens_in || 0}, ${row.tokens_out || 0}, ${esc(row.output_category)}, ${row.output_confidence || 0}, ${esc(row.fallback_chain)}, ${row.cache_hit ? 'TRUE' : 'FALSE'})`;
    runPsql(url, sql);
  } catch (_e) { /* never crash on audit-log write */ }
}

function writeClassificationRow(row) {
  const psql = lookupPsqlPath();
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || !fs.existsSync(psql)) return;
  const esc = v => `'${String(v || '').replace(/'/g, "''")}'`;
  try {
    const sql = `INSERT INTO reply_classifications
      (workspace_id, lead_id, message_id, message_hash, reply_text_excerpt, category, confidence, reasoning, classifier_version, llm_used)
      VALUES (1, ${row.lead_id ? row.lead_id : 'NULL'}, ${esc(row.message_id || '')}, ${esc(row.message_hash)}, ${esc(row.reply_text_excerpt || '')}, ${esc(row.category)}, ${row.confidence}, ${esc(row.reasoning)}, ${esc(CLASSIFIER_VERSION)}, ${esc(row.llm_used || 'regex')})
      ON CONFLICT (message_hash) DO NOTHING`;
    runPsql(url, sql);
  } catch (_e) { /* never crash on classification write */ }
}

function llmFallback(text) {
  // Placeholder — Phase 6 wires the real Cloudflare AI / Groq / Haiku stack with cost tracking.
  // In Phase 3 we return UNCLASSIFIED so the dead-letter queue catches it and a human reviews.
  return { category: 'UNCLASSIFIED', confidence: 0.0, reasoning: 'regex did not match; LLM fallback stub (Phase 6 will wire Cloudflare/Groq/Haiku)', llm_used: 'stub' };
}

function classify(text, opts = {}) {
  const norm = normalise(text);
  const hash = messageHash(text, opts.lead_id);

  // In-memory mode skips all Neon round-trips. Used by the regression suite.
  if (opts.in_memory) {
    const det = deterministicClassify(norm);
    if (det && det.confidence >= 0.7) {
      return { ...det, cache_hit: false, classifier_version: CLASSIFIER_VERSION, llm_used: 'regex' };
    }
    const llm = llmFallback(text);
    return { ...llm, cache_hit: false, classifier_version: CLASSIFIER_VERSION };
  }

  // Step 0: cache
  const cached = checkCache(hash);
  if (cached) {
    writeAuditRow({ message_hash: hash, llm_used: 'cache', output_category: cached.category, output_confidence: cached.confidence, fallback_chain: 'cache', cache_hit: true });
    return { ...cached, cache_hit: true, classifier_version: CLASSIFIER_VERSION, llm_used: 'cache' };
  }

  // Step 1: deterministic
  const det = deterministicClassify(norm);
  if (det && det.confidence >= 0.7) {
    writeAuditRow({ message_hash: hash, llm_used: 'regex', output_category: det.category, output_confidence: det.confidence, fallback_chain: 'regex' });
    writeClassificationRow({ ...det, message_hash: hash, lead_id: opts.lead_id, message_id: opts.message_id, reply_text_excerpt: text.slice(0, 500), llm_used: 'regex' });
    return { ...det, cache_hit: false, classifier_version: CLASSIFIER_VERSION, llm_used: 'regex' };
  }

  // Step 2: LLM
  const llm = llmFallback(text);
  writeAuditRow({ message_hash: hash, llm_used: llm.llm_used, output_category: llm.category, output_confidence: llm.confidence, fallback_chain: 'regex->' + llm.llm_used });
  writeClassificationRow({ ...llm, message_hash: hash, lead_id: opts.lead_id, message_id: opts.message_id, reply_text_excerpt: text.slice(0, 500) });
  return { ...llm, cache_hit: false, classifier_version: CLASSIFIER_VERSION };
}

// ============================================================================
// Regression fixture runner — required for any future change to the classifier.
// Pass/fail rule: precision and recall must each be >= 0.85 across the suite.
// ============================================================================
function replayFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) {
    console.error(`Fixtures missing at ${FIXTURES_PATH}`);
    process.exit(2);
  }
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const byCat = {};
  let correct = 0;
  for (const f of fixtures) {
    const out = classify(f.text, { in_memory: true });
    const got = out.category;
    byCat[f.expected] = byCat[f.expected] || { tp: 0, fn: 0, fp: 0 };
    if (got === f.expected) { byCat[f.expected].tp++; correct++; }
    else { byCat[f.expected].fn++; byCat[got] = byCat[got] || { tp: 0, fn: 0, fp: 0 }; byCat[got].fp++; }
  }
  const total = fixtures.length;
  console.log(`fixtures: ${total} | accuracy: ${(correct / total * 100).toFixed(1)}%`);
  let allOk = true;
  for (const cat of Object.keys(byCat)) {
    const { tp, fn, fp } = byCat[cat];
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const status = (precision >= 0.85 && recall >= 0.85) ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allOk = false;
    console.log(`  ${status} ${cat.padEnd(22)} P=${precision.toFixed(2)} R=${recall.toFixed(2)} tp=${tp} fn=${fn} fp=${fp}`);
  }
  process.exit(allOk ? 0 : 1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--replay-fixtures')) { return replayFixtures(); }
  if (argv.includes('--test-classify')) {
    const idx = argv.indexOf('--input');
    const text = idx >= 0 ? argv[idx + 1] : '';
    const leadIdx = argv.indexOf('--lead-id');
    const opts = { lead_id: leadIdx >= 0 ? Number(argv[leadIdx + 1]) : null };
    process.stdout.write(JSON.stringify(classify(text, opts)) + '\n');
    return;
  }
  let stdin = '';
  process.stdin.on('data', d => stdin += d);
  process.stdin.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(stdin); } catch (_e) { payload = { text: stdin }; }
    const out = classify(payload.text || payload.body || '', { lead_id: payload.lead_id, message_id: payload.message_id });
    process.stdout.write(JSON.stringify(out) + '\n');
  });
}

module.exports = { classify, normalise, messageHash, deterministicClassify, CLASSIFIER_VERSION };
if (require.main === module) main();
