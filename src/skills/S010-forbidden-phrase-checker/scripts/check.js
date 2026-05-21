#!/usr/bin/env node
// S010 forbidden-phrase-checker.
// Usage:
//   node check.js --input "text to check"           # scan one string
//   node check.js --subject "subject text"          # scan a subject specifically
//   echo "text" | node check.js                     # stdin mode
// Exit 0 if clean. Exit 1 with JSON violations on stderr if not.

const fs = require('fs');
const path = require('path');

const cfgPath = path.join(__dirname, 'forbidden_phrases.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

function getInput(argv) {
  const args = argv.slice(2);
  let mode = 'body';
  let text = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') { text = args[i + 1]; i++; }
    else if (args[i] === '--subject') { text = args[i + 1]; mode = 'subject'; i++; }
  }
  if (text === null) {
    try { text = fs.readFileSync(0, 'utf8'); } catch (e) { text = ''; }
  }
  return { mode, text: text || '' };
}

function violations(input) {
  const { mode, text } = input;
  const lower = text.toLowerCase();
  const out = [];

  // em-dash check applies everywhere
  for (const ch of cfg.em_dashes) {
    if (text.includes(ch)) out.push({ type: 'em_dash', matched: ch });
  }

  // body phrases
  for (const p of cfg.body_phrases) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) out.push({ type: 'body_phrase', matched: p });
  }

  // openers — only the first 80 characters
  if (mode === 'body') {
    const head = lower.slice(0, 80);
    for (const opener of cfg.openers_must_not_start_with) {
      if (head.startsWith(opener)) out.push({ type: 'opener', matched: opener });
    }
  }

  // subject blockers
  if (mode === 'subject') {
    for (const blk of cfg.subject_blockers) {
      if (lower.includes(blk.toLowerCase())) out.push({ type: 'subject_blocker', matched: blk });
    }
  }

  // url shorteners
  for (const sh of cfg.url_shorteners) {
    if (lower.includes(sh)) out.push({ type: 'url_shortener', matched: sh });
  }

  // gated clients
  for (const gc of cfg.gated_clients) {
    if (lower.includes(gc)) out.push({ type: 'gated_client', matched: gc });
  }

  return out;
}

function main() {
  const input = getInput(process.argv);
  const v = violations(input);
  const result = { pass: v.length === 0, violations: v, mode: input.mode };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(v.length === 0 ? 0 : 1);
}

main();
