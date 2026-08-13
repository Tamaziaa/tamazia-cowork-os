#!/usr/bin/env node
// S064 · 7-TOUCH cadence renderer (v2, research-optimized 2026-05-23)
// Rewrites the locked sequence using 250-source cold-email research (5-agent study):
//  - lowercase, <100-word, one-idea emails that read like a person, not marketing
//  - opener leads with a SPECIFIC finding about THEM (audit hook), not "hope this finds you well"
//  - soft INTEREST-based CTAs (convert ~3x hard "book a call"); no calendar link in early touches
//  - gratitude closers (+reply rate); King's credential used as quiet peer context, never a brag
//  - 7 distinct touches: 0 intro/permission · 1 audit value · 2 finding #2 / AI-search · 3 social proof
//    · 4 reframe to SRA/compliance risk · 5 risk-reversal · 6 breakup (loss-aversion)
//  - in-thread follow-ups (re:); spacing handled by send-due CADENCE_DAYS = [0,3,7,12,19,28,40]
// Inputs: lead + audit findings (personalisation_pointers) + Apollo org enrichment.
// Output: 7 grounded drafts in outreach_drafts (touch 0-6) + status='touch_0_queued'.
//
// SENDER IDENTITY: signs as Aman Pareek (LLM, King's College London) per the brand wish. If sending
// from the female MailDeck personas, set SENDER_NAME env or swap the signature at send time (the
// from-address is controlled by the mailbox pool / sequencer, independent of this body copy).

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const apollo = require('../../../lib/enrichment/apollo.js');

function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const SIGN = process.env.SENDER_SIGNATURE || 'Aman Pareek\nFounder, Tamazia · LLM, King’s College London';
const SIGN_SHORT = process.env.SENDER_SHORT || 'Aman';
// Branded compliance footer on EVERY touch (UK PECR / CAN-SPAM: identity + address + opt-out required).
// "Tamazia" wordmark = the text logo; an image logo is intentionally avoided on cold (image-heavy mail
// is a spam signal). Website is the trust anchor. TRACK_PIXEL_URL is OFF by default — on the PlusVibe
// $37 plan PlusVibe does native open/click tracking; a self-hosted pixel on plain-text cold both fails
// (text has no img) and hurts deliverability (Apple MPP inflates opens), so enable only for own-engine HTML sends.
const ADDRESS = process.env.TAMAZIA_ADDRESS || 'C1 Barking Wharf Square, London IG11 7ZQ, United Kingdom';
// Credential footer on every touch (per Aman). NOTE: stat-heavy footers raise spam-filter risk on cold;
// kept lower-case + single line to soften it. Override via env if you want a lighter version per segment.
const CREDS = process.env.TAMAZIA_CREDS || 'Founder: Aman Pareek, LLM in International Business Law, King’s College London\n£110M+ generated for clients · 840% organic traffic growth · 882% peak client revenue growth · 200+ laws reviewed per campaign';
const FOOTER = `\n\n—\nTamazia · tamazia.co.uk\n${CREDS}\n${ADDRESS}\nNot relevant? Reply “stop” and I’ll close the file.`;

// PERSONA SIGNATURE: each lead is sent from one of the 30 MailDeck female-persona inboxes, so the
// body must sign as THAT persona (signing "Aman" from reagan.caldwell@ looks fake). Deterministic by
// lead id so render + send + export all agree. Founder (Aman, King's) stays referenced in touch 4.
let _roster = null;
function loadRoster() {
  if (_roster) return _roster;
  try { _roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'maildeck-roster.json'), 'utf8')).mailboxes || []; } catch (_e) { _roster = []; }
  return _roster;
}
function pickPersona(leadId) {
  const r = loadRoster();
  if (r.length) { const p = r[Math.abs(Number(leadId) || 0) % r.length]; return { first: p.first_name, name: `${p.first_name} ${p.last_name}`, email: p.address }; }
  return { first: 'Reagan', name: 'Reagan Caldwell', email: null };
}

const SECTOR_TITLE = {
  'law-firms': 'Best UK law firms 2026', 'barristers': 'Best UK barristers 2026',
  'healthcare': 'Best private healthcare providers in the UK 2026', 'dental': 'Best UK dental practices 2026',
  'pharma': 'Best UK pharmaceutical brands 2026', 'finance': 'Best UK wealth management firms 2026',
  'fintech': 'Best UK fintechs 2026', 'insurance': 'Best UK insurance brokers 2026',
  'real-estate': 'Best UK real-estate firms 2026', 'hospitality': 'Best UK boutique hotels 2026',
  'ecommerce': 'Best UK consumer brands 2026', 'charity': 'Best UK charities 2026',
  'education': 'Best UK private schools 2026', 'restaurants': 'Best UK restaurant groups 2026',
  'professional-services': 'Best UK professional-services firms 2026'
};
const SECTOR_FRAMEWORKS = {
  'law-firms': 'SRA Transparency Rules + Code of Conduct 8.7/8.9', 'healthcare': 'CQC + MHRA + ASA',
  'dental': 'GDC + CQC + ASA', 'pharma': 'MHRA + ABPI + PMCPA', 'finance': 'FCA Consumer Duty + MAR',
  'fintech': 'FCA CONC + FSMA s.21', 'real-estate': 'CMA DMCC Act 2024 + RICS', 'hospitality': 'CMA DMCC Act 2024',
  'ecommerce': 'CMA DMCC Act 2024 + Trading Standards', 'charity': 'Charity Commission + Fundraising Regulator',
  'education': 'Ofsted + DfE'
};

function loadLead(lead_id) {
  const sql = `SELECT id::text, company, COALESCE(domain,''), COALESCE(sector,''), COALESCE(jurisdiction,'UK'), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(title,''), COALESCE(email,''), COALESCE(city,''), audit_url::text, personalisation_pointers::text FROM leads WHERE id=${lead_id}`;
  const raw = pg(sql); if (!raw) return null;
  const [id, company, domain, sector, jurisdiction, first_name, last_name, title, email, city, audit_url, pp] = raw.split('\t');
  let pointers = []; try { pointers = JSON.parse(pp || '[]'); } catch (_e) {}
  return { id: Number(id), company, domain: domain || null, sector: sector || 'professional-services', jurisdiction, first_name, last_name, title, email, city, audit_url, pointers };
}

function topAuditFindings(pointers, max = 5) {
  const p0 = pointers.filter(p => p.severity === 'P0');
  const p1 = pointers.filter(p => p.severity === 'P1');
  const out = [...p0.slice(0, 3), ...p1.slice(0, max - p0.slice(0, 3).length)];
  return out.map(p => `${(p.citation || '').trim()} miss: ${p.fact || p.layman_explanation || ''}`).slice(0, max);
}
function recipient(lead) { return lead.first_name ? lead.first_name : 'there'; }
function auditLink(lead) { return lead.audit_url || ('https://audit.tamazia.co.uk/audit/' + (lead.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-complimentary-audit'); }
function firstFindingShort(findings) { return (findings[0] || '').split(' miss:')[0].trim() || 'a visibility and compliance gap'; }
function findingHook(lead, findings) {
  if (findings[0]) { const f = findings[0]; const parts = f.split(' miss:'); return parts.length > 1 ? `${parts[0].trim()} is not covered: ${parts[1].trim()}` : f; }
  return `your ${(lead.sector || 'practice').replace('-', ' ')} pages are not ranking where they should for the terms clients actually search`;
}
const sectorWord = s => (s || 'professional services').replace(/-/g, ' ');

// ---- 7 touches ----
function buildTouch0({ lead, findings }) {
  const title = SECTOR_TITLE[lead.sector] || `Best UK ${sectorWord(lead.sector)} 2026`;
  const subject = `${(lead.company || '').toLowerCase()} in our 2026 ${sectorWord(lead.sector)} list`;
  const body = `hi ${recipient(lead)},

i was pulling together our “${title}” piece on Tamazia (tamazia.co.uk) and ${lead.company} kept coming up, so i wanted to include you.

while researching i took a quick look at ${lead.domain || lead.company} and noticed ${findingHook(lead, findings)}. nothing urgent, just the kind of thing that quietly loses enquiries.

the feature comes with a complimentary compliance and SEO audit (normally £1,500) and a backlink from the piece. worth me sending it over, or not a priority right now?

${SIGN_SHORT}`;
  return { subject, body, touch: 0 };
}
function buildTouch1({ lead, findings }) {
  const five = findings.slice(0, 3).map(f => `• ${f.replace(' miss:', ':')}`).join('\n') || '• full compliance + SEO breakdown inside';
  const subject = `re: ${(lead.company || '').toLowerCase()} in our 2026 list`;
  const body = `${recipient(lead)},

the audit on ${lead.company} is ready: ${auditLink(lead)}

a few of the headline items:
${five}

each one names the regulator or the ranking gap behind it, with a 12-week fix. it is yours to keep whether or not we ever speak.

happy to walk you through any of it.

thanks,
${SIGN_SHORT}`;
  return { subject, body, touch: 1 };
}
function buildTouch2({ lead, findings }) {
  const second = findings[1] ? findings[1].replace(' miss:', ': ') : `competitors are being surfaced ahead of ${lead.company} in AI answers (ChatGPT, Google’s AI overviews) for your core ${sectorWord(lead.sector)} terms`;
  const subject = `re: ${(lead.company || '').toLowerCase()} in our 2026 list`;
  const body = `${recipient(lead)},

one more thing the audit flags: ${second}.

roughly 60% of searches in your space now end without a click, so where you sit inside those AI answers matters more than the blue links did. it is fixable.

the full breakdown is still here: ${auditLink(lead)}

thanks,
${SIGN_SHORT}`;
  return { subject, body, touch: 2 };
}
function buildTouch3({ lead }) {
  const title = SECTOR_TITLE[lead.sector] || `Best UK ${sectorWord(lead.sector)} 2026`;
  const subject = `re: ${(lead.company || '').toLowerCase()} in our 2026 list`;
  const body = `${recipient(lead)},

quick context on why the feature is worth a look: the “${title}” piece sits on a DA-87 domain and tends to get cited by Google, ChatGPT and Perplexity within about 90 days. the backlink alone usually outperforms a paid placement.

${lead.company} is still on the shortlist and i am happy to hold the spot.

thanks,
${SIGN_SHORT}`;
  return { subject, body, touch: 3 };
}
function buildTouch4({ lead, findings }) {
  const fw = SECTOR_FRAMEWORKS[lead.sector] || 'your regulator’s rules';
  const subject = `re: ${(lead.company || '').toLowerCase()} in our 2026 list`;
  const body = `${recipient(lead)},

shifting angle, because this is the part most agencies miss: ${firstFindingShort(findings)} sits in ${fw} territory, not just SEO.

our founder, Aman Pareek, read law at King’s College London before moving into search, so we write to that standard rather than bolting compliance on afterwards. the audit shows exactly where ${lead.company} stands against it: ${auditLink(lead)}

thanks,
${SIGN_SHORT}`;
  return { subject, body, touch: 4 };
}
function buildTouch5({ lead }) {
  const subject = `re: ${(lead.company || '').toLowerCase()} in our 2026 list`;
  const body = `${recipient(lead)},

to make this easy: no cost and no commitment. i will send the full audit and hold the feature spot; you decide what, if anything, to do next.

just reply “send it” and it is with you the same day.

thanks,
${SIGN_SHORT}`;
  return { subject, body, touch: 5 };
}
function buildTouch6({ lead }) {
  const subject = `re: ${(lead.company || '').toLowerCase()} in our 2026 list`;
  const body = `${recipient(lead)},

i will assume the timing is not right and i will stop here, no more follow-ups.

the audit on ${lead.company} stays live for you either way: ${auditLink(lead)}

if visibility or the compliance side ever moves up the list, just reply to this thread.

thanks,
${SIGN}`;
  return { subject, body, touch: 6 };
}

function saveDraft(lead_id, t) {
  pg(`DELETE FROM outreach_drafts WHERE lead_id=${lead_id} AND channel='email' AND draft_metadata->>'touch' = '${t.touch}'`);
  const meta = JSON.stringify({ touch: t.touch, locked_template: true, generated_by: 'S064_v2_7touch' });
  return pg(`INSERT INTO outreach_drafts (lead_id, channel, draft_subject, draft_body, draft_metadata, generated_at) VALUES (${lead_id}, 'email', ${pgEsc(t.subject)}, ${pgEsc(t.body)}, ${pgEsc(meta)}::jsonb, NOW()) RETURNING id`);
}

async function renderAll(lead_id) {
  const lead = loadLead(lead_id); if (!lead) return { error: 'lead_not_found' };
  let apolloOrg = null;
  if (lead.domain) { try { const r = await apollo.enrichOrg(lead.domain); if (r.ok && r.org) apolloOrg = r.org; } catch (_e) {} }
  const findings = topAuditFindings(lead.pointers || []);
  if (!findings.length) findings.push('Compliance and visibility audit pending full re-scan');
  const touches = [
    buildTouch0({ lead, apolloOrg, findings }), buildTouch1({ lead, findings }), buildTouch2({ lead, findings }),
    buildTouch3({ lead }), buildTouch4({ lead, findings }), buildTouch5({ lead }), buildTouch6({ lead })
  ];
  // PERSONA SIGN-OFF: replace the default Aman sign-off with the lead's assigned persona (from inbox),
  // then append the branded compliance footer. Founder credential stays in the touch-4 body.
  const persona = pickPersona(lead.id);
  for (const t of touches) {
    t.body = t.body.replace(SIGN, `${persona.first}\nTamazia`);              // touch 6 full block
    t.body = t.body.replace(/\n\nAman$/, `\n\n${persona.first}`);            // touches 0-5 short sign-off
    t.body += FOOTER;
  }
  const draft_ids = {};
  for (const t of touches) draft_ids['touch_' + t.touch] = saveDraft(lead.id, t);
  const dir = path.join(ROOT, 'client_email_files', String(lead.id));
  try { fs.mkdirSync(dir, { recursive: true }); for (const t of touches) fs.writeFileSync(path.join(dir, `touch_${t.touch}.md`), `# Touch ${t.touch}\nSubject: ${t.subject}\n\n---\n\n${t.body}\n`); } catch (_e) {}
  pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE, updated_at=NOW() WHERE id=${lead.id}`);
  return { lead_id: lead.id, company: lead.company, apollo_enriched: !!apolloOrg, touches: touches.length, findings_count: findings.length, draft_ids };
}

if (require.main === module) {
  const lead_id = Number(process.argv[2] || 17);
  renderAll(lead_id).then(r => console.log(JSON.stringify(r, null, 2)));
}
module.exports = { renderAll, buildTouch0, buildTouch1, buildTouch2, buildTouch3, buildTouch4, buildTouch5, buildTouch6 };
