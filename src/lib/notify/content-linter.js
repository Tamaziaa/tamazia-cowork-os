// Content spam-linter · scores an outreach draft against common SpamAssassin / filter triggers
// BEFORE it is sent. Used as a pre-send gate in S065. Returns { score, pass, flags }.
// score is a penalty total; pass = score <= MAX_PENALTY (default 5, mirrors SpamAssassin's 5.0 spam line).

const MAX_PENALTY = 5;

// Spam-trigger phrases (weighted). Kept conservative for B2B legal/SEO outreach voice.
const TRIGGERS = [
  [/\bfree\b/gi, 0.4], [/\bguarantee(d)?\b/gi, 0.6], [/\bact now\b/gi, 1.0], [/\blimited time\b/gi, 0.8],
  [/\bclick here\b/gi, 0.8], [/\bbuy now\b/gi, 1.0], [/\b100%\b/g, 0.5], [/\brisk[- ]free\b/gi, 0.8],
  [/\bcash\b/gi, 0.5], [/\bcheap\b/gi, 0.5], [/\bdiscount\b/gi, 0.4], [/\bwinner\b/gi, 0.8],
  [/\bcongratulations\b/gi, 0.6], [/\burgent\b/gi, 0.5], [/\bdouble your\b/gi, 0.9], [/\bonce in a lifetime\b/gi, 1.0],
  [/\bno obligation\b/gi, 0.5], [/\bextra income\b/gi, 1.0], [/\bmake money\b/gi, 1.0], [/\b\$\$\$/g, 1.2],
  [/!!!+/g, 1.0], [/\bdear (friend|sir|madam)\b/gi, 0.8]
];

function lint({ subject = '', body = '' }) {
  const flags = [];
  let score = 0;
  const full = `${subject}\n${body}`;

  // 1. trigger phrases
  for (const [re, w] of TRIGGERS) {
    const n = (full.match(re) || []).length;
    if (n) { score += w * n; flags.push(`trigger ${re.source} x${n} (+${(w * n).toFixed(1)})`); }
  }
  // 2. ALL-CAPS words (3+ caps), excessive = spammy
  const caps = (full.match(/\b[A-Z]{3,}\b/g) || []).filter(w => !['SEO','FCA','SRA','CMA','MHRA','ASA','ICC','LCIA','SIAC','DIAC','GDPR','LLM','CEO','CTO','UK','USA','UAE','EU','VAT'].includes(w));
  if (caps.length > 2) { const p = Math.min(1.5, (caps.length - 2) * 0.3); score += p; flags.push(`${caps.length} ALL-CAPS words (+${p.toFixed(1)})`); }
  // 3. exclamation density
  const ex = (full.match(/!/g) || []).length;
  if (ex > 2) { const p = Math.min(1.5, (ex - 2) * 0.4); score += p; flags.push(`${ex} exclamation marks (+${p.toFixed(1)})`); }
  // 4. link count + ratio (too many links = spammy)
  const links = (body.match(/https?:\/\/\S+/gi) || []).length;
  if (links > 3) { const p = (links - 3) * 0.5; score += p; flags.push(`${links} links (+${p.toFixed(1)})`); }
  // 5. text length sanity (too short = low value, too long = wall)
  const words = body.trim().split(/\s+/).length;
  if (words < 25) { score += 1.0; flags.push(`body only ${words} words (+1.0)`); }
  if (words > 320) { score += 0.8; flags.push(`body ${words} words, long (+0.8)`); }
  // 6. subject sanity
  if (subject.length > 70) { score += 0.5; flags.push(`subject ${subject.length} chars, long (+0.5)`); }
  if (/^\s*re:/i.test(subject) === false && /\bfwd:/i.test(subject)) { score += 0.5; flags.push('fake Fwd: (+0.5)'); }
  // 6b. UNRESOLVED PLACEHOLDERS — never send a draft with [brackets], {{merge}}, or "Decision Maker"
  const ph = (full.match(/\[[^\]]+\]|\{\{[^}]+\}\}|\bDecision Maker Name\b|\bFirst Name\b|\bCompany Name\b/gi) || []);
  if (ph.length) { score += 10; flags.push(`UNRESOLVED PLACEHOLDER: ${ph.slice(0,3).join(', ')} (+10, hard block)`); }

  // 7. spammy unicode / emoji density
  const emoji = (full.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emoji > 1) { const p = (emoji - 1) * 0.5; score += p; flags.push(`${emoji} emoji (+${p.toFixed(1)})`); }

  score = Math.round(score * 10) / 10;
  return { score, pass: score <= MAX_PENALTY, max: MAX_PENALTY, flags };
}

module.exports = { lint, MAX_PENALTY };

if (require.main === module) {
  const tests = [
    { subject: 'Nuffield Health for the 2026 piece on Tamazia', body: 'Hi there, I noticed Nuffield expanded its digital health services. With the MHRA tightening health-claims advertising rules, your content team carries regulatory exposure. Tamazia reviews campaigns against 200+ laws before publication. Would 20 minutes next week be useful? https://tamazia.co.uk/book/' },
    { subject: 'ACT NOW!!! 100% FREE GUARANTEED CASH', body: 'CLICK HERE to BUY NOW and DOUBLE YOUR money risk-free!!! Limited time!!!' }
  ];
  for (const t of tests) { const r = lint(t); console.log(`score=${r.score} pass=${r.pass} · ${t.subject.slice(0,40)}`); if (r.flags.length) console.log('   flags:', r.flags.join('; ')); }
}
