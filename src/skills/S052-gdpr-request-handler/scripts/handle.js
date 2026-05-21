#!/usr/bin/env node
// S052 GDPR request handler.
// Usage:
//   node handle.js --test-classify --input "<reply text>"   # returns JSON classification
//   node handle.js --classify --lead-id 123 --input "..."   # full handler (logs + escalation paths)
//
// Output JSON shape:
//   { request_type: "Article 17" | "Article 15" | ..., confidence: 0-1, reasoning, suggested_template_id }

// Order matters: more-specific patterns (Article 20 machine-readable/portable) must come before
// the broader Article 15 "copy of data" patterns, otherwise a portability request that also says
// "copy of my data" will be misclassified as access.
const CATEGORIES = [
  { type: 'Article 17', patterns: [/right to be forgotten/i, /erasure/i, /erase my data/i, /delete (all )?my (personal )?data/i, /forget (about )?me/i, /remove my (personal )?information/i] },
  { type: 'Article 20', patterns: [/data portability/i, /(machine[- ]readable|structured) (format|copy)/i, /export my (personal )?data/i, /port (my|the) (personal )?data/i] },
  { type: 'Article 15', patterns: [/right of access/i, /copy of (my|the) (personal )?data/i, /data subject access request/i, /DSAR/i, /what (personal )?data do you hold/i, /access to my (personal )?information/i] },
  { type: 'Article 16', patterns: [/rectif(y|ication)/i, /correct (my|the) (personal )?data/i, /update my (personal )?(data|details|information)/i] },
  { type: 'Article 18', patterns: [/restrict(ion)? (of )?processing/i, /freeze (my )?(personal )?(data|processing|account)/i, /stop processing/i, /pause processing/i, /suspend processing/i] },
  { type: 'Article 21', patterns: [/object to (the )?processing/i, /object to direct marketing/i, /opt[- ]out of marketing/i, /unsubscribe/i, /stop sending/i] },
];

function classify(input) {
  const text = String(input || '');
  let best = { type: 'UNCLASSIFIED', score: 0, hits: [] };
  for (const cat of CATEGORIES) {
    let hits = [];
    for (const re of cat.patterns) {
      const m = text.match(re);
      if (m) hits.push(m[0]);
    }
    const score = hits.length > 0 ? Math.min(0.6 + 0.15 * hits.length, 0.95) : 0;
    if (score > best.score) best = { type: cat.type, score, hits };
  }
  return {
    request_type: best.type,
    confidence: best.score,
    reasoning: best.hits.length ? `matched phrases: ${best.hits.join(', ')}` : 'no GDPR rights phrase detected',
    suggested_template_id: best.type === 'UNCLASSIFIED' ? 'manual-review' : `gdpr-ack-${best.type.replace(/\s+/g,'').toLowerCase()}`,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--test-classify') out.test_classify = true;
    else if (a === '--classify') out.classify = true;
    else if (a === '--lead-id') out.lead_id = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = args.input || '';
  const result = classify(text);
  if (args.test_classify) {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  }
  if (args.classify) {
    // Phase 2 scaffolds this. Phase 11 wires real Slack + Telegram + Neon writes.
    process.stdout.write(JSON.stringify({ ...result, lead_id: args.lead_id || null, action: 'logged' }) + '\n');
    process.exit(0);
  }
  process.stderr.write('Usage: handle.js --test-classify --input "text"  OR  --classify --lead-id N --input "text"\n');
  process.exit(2);
}

module.exports = { classify };
if (require.main === module) main();
