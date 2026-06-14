// find-every-email · pattern + SMTP probe (no key required)
// Cascades through 12 common email patterns, runs DNS MX lookup, opens SMTP RCPT TO probe.
// Replaces Hunter / Snov / Apollo paid lookups for ≥75% of cases.

const dns = require('dns').promises;
const net = require('net');

const COMMON_PATTERNS = [
  // Most common to least common (per Hunter pattern stats 2024)
  '{first}.{last}',                  // 25% prevalence
  '{first_initial}{last}',           // 18%
  '{first}',                          // 12%
  '{last}',                           // 10%
  '{first_initial}.{last}',          // 8%
  '{first}{last}',                    // 7%
  '{last}.{first}',                  // 5%
  '{last}{first_initial}',           // 4%
  '{first}_{last}',                  // 3%
  '{first_initial}_{last}',          // 2%
  '{first}-{last}',                  // 2%
  '{last}.{first_initial}'           // 1%
];

function buildLocalPart(pattern, first, last) {
  const f = String(first || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const l = String(last || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  if (!f && !l) return null;
  return pattern
    .replace(/\{first\}/g, f)
    .replace(/\{last\}/g, l)
    .replace(/\{first_initial\}/g, f.charAt(0) || '')
    .replace(/\{last_initial\}/g, l.charAt(0) || '');
}

function generateCandidates({ first, last, domain }) {
  const seen = new Set();
  const out = [];
  // gap-fix: a falsy / malformed domain produced candidates like "john.doe@undefined" (template-string of an
  // undefined `domain`). Those are syntactically junk, MX lookup is meaningless, and they leak into the email
  // pool as guessed addresses. Require a dotted host before generating anything.
  const dom = String(domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dom)) return out;
  for (let i = 0; i < COMMON_PATTERNS.length; i++) {
    const local = buildLocalPart(COMMON_PATTERNS[i], first, last);
    // gap-fix: a single-name/initial input left a dangling separator in two-part patterns ('{first}.{last}'
    // with an empty last -> 'a.', '{first}_{last}' -> 'a_', '{first}-{last}' -> 'a-'). length<2 passed those
    // through ('a.' is length 2), leaking syntactically-malformed / non-deliverable locals into the pool.
    // Require >=2 ALPHANUMERIC chars and a clean (non-leading/trailing/doubled-separator) local, matching the
    // stricter check enrich.js applyPattern already uses.
    if (!local) continue;
    if (local.replace(/[^a-z0-9]/g, '').length < 2) continue;
    if (/^[._\-]|[._\-]$|[._\-]{2,}/.test(local)) continue;
    const email = `${local}@${dom}`;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email, pattern: COMMON_PATTERNS[i], confidence_prior: (100 - i * 5) / 100 });
  }
  return out;
}

async function lookupMX(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
  } catch (_e) { return []; }
}

function smtpRcptProbe(mxHost, fromAddr, rcptAddr, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: mxHost, port: 25 });
    let stage = 0;
    let result = { code: null, ok: false, response: '' };
    let buf = '';
    const cleanup = (status) => { try { sock.end('QUIT\r\n'); } catch (_e) {} resolve({ ...result, status }); };
    const t = setTimeout(() => cleanup('timeout'), timeoutMs);
    sock.on('error', () => { clearTimeout(t); cleanup('error'); });
    sock.on('data', (data) => {
      buf += data.toString();
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      result.response = last;
      if (stage === 0 && last.startsWith('220')) {
        sock.write(`HELO tamazia.co.uk\r\n`); stage = 1;
      } else if (stage === 1 && last.startsWith('250')) {
        sock.write(`MAIL FROM:<${fromAddr}>\r\n`); stage = 2;
      } else if (stage === 2 && last.startsWith('250')) {
        sock.write(`RCPT TO:<${rcptAddr}>\r\n`); stage = 3;
      } else if (stage === 3) {
        result.code = last.slice(0, 3);
        // gap-fix: RCPT TO success is any 25x (250 OK, 251 will-forward, 252 cannot-VRFY-but-will-attempt). The old
        // `startsWith('250')` treated 251/252 — which several mail servers return for a deliverable address — as a
        // hard rejection, under-counting real inboxes. 4xx is greylist/transient (not a reject), so only 5xx is bad.
        result.ok = /^25[012]/.test(last);
        clearTimeout(t);
        cleanup(result.ok ? 'accepted' : (/^4/.test(last) ? 'greylisted' : 'rejected'));
      } else if (last.startsWith('5') || last.startsWith('4')) {
        result.code = last.slice(0, 3);
        clearTimeout(t);
        cleanup('rejected');
      }
    });
    sock.on('close', () => clearTimeout(t));
  });
}

async function find({ first, last, domain, probe = true, fromAddr = 'aman@tamazia.co.uk' }) {
  const candidates = generateCandidates({ first, last, domain });
  if (!candidates.length) return { found: false, candidates: [], domain, mx: [] };
  let mx = [];
  if (probe) mx = await lookupMX(domain);
  if (!mx.length || !probe) {
    // Pattern-only result (confidence stops at prior)
    return { found: candidates.length > 0, candidates, domain, mx, probe_skipped: !probe || !mx.length };
  }
  const primary = mx[0];
  // Probe up to 3 top candidates (pattern stats suggest 50% hit on first, 75% on top 3)
  const probed = [];
  for (let i = 0; i < Math.min(3, candidates.length); i++) {
    const c = candidates[i];
    const res = await smtpRcptProbe(primary, fromAddr, c.email);
    probed.push({ ...c, smtp_status: res.status, smtp_code: res.code, confidence: res.ok ? 0.95 : (res.status === 'timeout' ? c.confidence_prior * 0.7 : 0.2) });
    if (res.ok) break; // First accepted wins
  }
  // Sort by confidence, return all
  const merged = candidates.map((c, i) => probed[i] || c).sort((a, b) => (b.confidence || b.confidence_prior) - (a.confidence || a.confidence_prior));
  return { found: merged.some(c => c.confidence && c.confidence > 0.5), candidates: merged, domain, mx };
}

module.exports = { find, generateCandidates, lookupMX, smtpRcptProbe };

if (require.main === module) {
  (async () => {
    const r = await find({ first: 'aman', last: 'pareek', domain: 'tamazia.co.uk', probe: false });
    console.log('Patterns for aman.pareek@tamazia.co.uk:', r.candidates.slice(0, 5));
  })();
}
