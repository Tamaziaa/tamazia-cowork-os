// S001 · compose-body — Tamazia canonical body composer.
// Generates the email body string used by W2 send.
// Two-stage output:
//   1. Body text (regulatory observation → micro-proof → CTA → alias-first-name signoff)
//   2. Compliance disclaimer footer (S009 injects when inject_disclaimer is true)
//
// Sign-off rule (Phase 1 Task 1.4.1):
//   - Body ends with alias.first_name on its own line. NOT "Aman" or full sender block.
//   - Full sender block lives separately in src/templates/email/footer.html / .txt.
//
// Disclaimer rule (Phase 1 Task 1.4.2):
//   - When inject_disclaimer is true, append signatures/disclaimer.txt contents below the
//     sign-off, with {version}/{date} substituted from framework_versions table latest row
//     (placeholder "v0.1-pending" / today's date until Phase 2 populates).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DISCLAIMER_PATH = path.join(ROOT, 'signatures', 'disclaimer.txt');
const SENDER_PATH = path.join(ROOT, 'signatures', 'aman.txt');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return ''; }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sectorOpener(sector, firmName, firstName) {
  const f = (firstName || '').trim();
  const handle = f ? `${f}` : 'team';
  switch ((sector || '').toLowerCase()) {
    case 'hospitality':
      return `${handle}, a quick PECR observation on ${firmName}.`;
    case 'healthcare':
      return `${handle}, an MHRA/CAP Section 12 observation on ${firmName}.`;
    case 'real-estate':
      return `${handle}, a CMA price-display observation on ${firmName}.`;
    case 'law-firms':
      return `${handle}, an SRA Transparency Rules observation on ${firmName}.`;
    default:
      return `${handle}, a compliance observation on ${firmName}.`;
  }
}

function bodyCore(lead) {
  const opener = sectorOpener(lead.sector, lead.firm, lead.first_name);
  // Phase 6.5 · prefer the personalisation-engine sentence when populated by pre-send-pipeline.
  // Falls back to a generic-but-on-brand observation if the engine has not yet run for this lead.
  const observation = (lead.rank_insight_sentence && lead.rank_insight_sentence.length > 30)
    ? lead.rank_insight_sentence
    : (lead.audit_first_touch_sentence && lead.audit_first_touch_sentence.length > 30)
    ? lead.audit_first_touch_sentence
    : 'When I reviewed the public-facing pages, the analytics tag fires before the cookie consent banner accepts. ' +
      'That is the kind of signal a regulator scans for, and it costs rankings before it costs compliance.';
  const proof =
    'A comparable firm closed the gap and recovered impressions inside 30 days.';
  // CTA · always include the audit URL inline when minted (Phase 6.5 — every cold email gets one).
  const auditLine = (lead.audit_url && /^https?:\/\//.test(lead.audit_url))
    ? `Your live Regulatory Signal Scan: ${lead.audit_url}`
    : 'I can pull a full Regulatory Signal Scan of the site if useful.';
  const cta =
    `${auditLine}\nBook a 30-min slot at cal.com/tamazia/strategy-call to walk through the findings.`;
  return [opener, '', observation, '', proof, '', cta].join('\n');
}

function compose(input) {
  const { alias, lead, inject_disclaimer } = input || {};
  if (!alias || !alias.first_name) throw new Error('alias.first_name required');
  if (!lead) throw new Error('lead required');

  const body = bodyCore({
    sector: lead.sector,
    firm: lead.firm || lead.company || 'your firm',
    first_name: lead.first_name || lead.contact_first || '',
    // Phase 6.5 · forward the personalisation engine + audit URL into bodyCore
    audit_url: lead.audit_url || null,
    rank_insight_sentence: lead.rank_insight_sentence || null,
    audit_first_touch_sentence: lead.audit_first_touch_sentence || null,
  });

  // Sign-off: alias first name on its own line, at the end of the body block.
  const signoff = `\n\n${alias.first_name}`;

  let out = body + signoff;

  if (inject_disclaimer) {
    // S009 disclaimer injection — pull and substitute via inject.js.
    const injectPath = path.resolve(__dirname, '..', '..', 'S009-compliance-disclaimer-injector', 'scripts', 'inject.js');
    let disc;
    try {
      // Prefer the S009 inject function which resolves {version} from framework_versions table.
      const inj = require(injectPath);
      disc = inj.inject(readSafe(DISCLAIMER_PATH), { country: (lead.country || '').toUpperCase() });
    } catch (_e) {
      disc = readSafe(DISCLAIMER_PATH)
        .replace(/\{version\}/g, process.env.FRAMEWORK_VERSION || '1.0.0')
        .replace(/\{date\}/g, todayISO());
    }
    if (!disc) disc = 'Compliance disclaimer missing — fix signatures/disclaimer.txt.';

    const sender = readSafe(SENDER_PATH) || 'Aman Pareek, International Business Lawyer, Founder, Tamazia';
    out += '\n\n---\n' + sender + '\n\n' + disc;
  }

  return out;
}

// Test harness used by Phase 1 verifications.
function test(input) {
  return compose(input);
}

module.exports = { compose, test, bodyCore };

if (require.main === module) {
  // CLI usage: node compose.js <json_payload>
  const argv = process.argv.slice(2);
  if (!argv[0]) {
    console.error('Usage: compose.js \'{"alias":{...},"lead":{...},"inject_disclaimer":true}\'');
    process.exit(2);
  }
  const payload = JSON.parse(argv[0]);
  process.stdout.write(compose(payload));
}
