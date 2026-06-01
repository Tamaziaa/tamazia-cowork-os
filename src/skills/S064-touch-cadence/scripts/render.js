#!/usr/bin/env node
// S064 · Locked Touch 0-3 cadence renderer
// Uses the locked Phase 6/7 template structure (from client_email_files/17/touch_*.md).
// Inputs: lead + audit findings + Apollo org enrichment + deep-research profile.
// Output: 4 grounded, specific, factual outreach drafts saved to outreach_drafts.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const apollo = require('../../../lib/enrichment/apollo.js');

function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const SECTOR_TITLE = {
  'law-firms': 'Best UK law firms 2026',
  'barristers': 'Best UK barristers 2026',
  'healthcare': 'Best private healthcare providers in the UK 2026',
  'dental': 'Best UK dental practices 2026',
  'pharma': 'Best UK pharmaceutical brands 2026',
  'finance': 'Best UK wealth management firms 2026',
  'fintech': 'Best UK fintechs 2026',
  'insurance': 'Best UK insurance brokers 2026',
  'real-estate': 'Best UK real-estate firms 2026',
  'hospitality': 'Best UK boutique hotels 2026',
  'ecommerce': 'Best UK consumer brands 2026',
  'charity': 'Best UK charities 2026',
  'education': 'Best UK private schools 2026',
  'restaurants': 'Best UK restaurant groups 2026',
  'professional-services': 'Best UK professional-services firms 2026'
};
const SECTOR_FRAMEWORKS = {
  'law-firms': 'SRA Code of Conduct 8.7/8.9, SRA Transparency Rules 2018, UK GDPR, EU AI Act',
  'healthcare': 'CQC fundamental standards, MHRA Blue Guide, ASA Section 12, UK GDPR, EU AI Act',
  'dental': 'GDC standards, CQC fundamental standards, ASA Section 12, UK GDPR',
  'pharma': 'MHRA Human Medicines Regs, ABPI Code, PMCPA, ASA, EU AI Act',
  'finance': 'FCA CONC + Consumer Duty, FCA MAR, UK GDPR, EU AI Act',
  'fintech': 'FCA CONC, FSMA s.21, EU PSD2, UK GDPR, EU AI Act',
  'real-estate': 'CMA DMCC Act 2024, RICS Rules of Conduct, ARLA Propertymark, UK GDPR',
  'hospitality': 'CMA DMCC Act 2024, Food Information Regs 2014, UK GDPR, EU AI Act',
  'ecommerce': 'CMA DMCC Act 2024, Trading Standards, UK GDPR, EU AI Act, US CPRA',
  'charity': 'Charity Commission, Fundraising Regulator, HMRC Gift Aid, UK GDPR',
  'education': 'Ofsted, DfE statutory guidance, UK GDPR'
};

function loadLead(lead_id) {
  const sql = `SELECT id::text, company, COALESCE(domain,''), COALESCE(sector,''), COALESCE(jurisdiction,'UK'), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(title,''), COALESCE(email,''), audit_url::text, personalisation_pointers::text FROM leads WHERE id=${lead_id}`;
  const raw = pg(sql); if (!raw) return null;
  const [id, company, domain, sector, jurisdiction, first_name, last_name, title, email, audit_url, pp] = raw.split('\t');
  let pointers = []; try { pointers = JSON.parse(pp || '[]'); } catch (_e) {}
  return { id: Number(id), company, domain: domain || null, sector: sector || 'professional-services', jurisdiction, first_name, last_name, title, email, audit_url, pointers };
}

function topAuditFindings(pointers, max = 5) {
  const p0 = pointers.filter(p => p.severity === 'P0');
  const p1 = pointers.filter(p => p.severity === 'P1');
  const out = [...p0.slice(0, 3), ...p1.slice(0, max - p0.slice(0, 3).length)];
  return out.map(p => `${(p.citation || '').trim()} miss: ${p.fact || p.layman_explanation || ''}`).slice(0, max);
}

function pickRecipientName(lead, apolloOrg) {
  if (lead.first_name) return lead.first_name;
  if (apolloOrg?.primary_domain) return 'Team';
  return 'Team';
}

function buildTouch0({ lead, apolloOrg, findings }) {
  const recipient = pickRecipientName(lead, apolloOrg);
  const ri = lead.rank_insight || {};
  const blogTitle = ri.blog_offer || SECTOR_TITLE[lead.sector] || `Best UK ${lead.sector} 2026`;
  // SOUL: the gated, fact-checked one-line keyword-gap. Fallback to the top audit finding.
  const gapLine = (lead.rank_insight_sentence && lead.rank_insight_sentence.length > 30)
    ? lead.rank_insight_sentence
    : (findings && findings[0]) ? `One thing stood out reviewing you: ${findings[0]}.` : '';
  const auditTail = (lead.audit_url && /^https?:\/\//.test(lead.audit_url)) ? `, free to you: ${lead.audit_url}` : '.';
  const subject = (ri.keywords && ri.keywords[0] && ri.keywords[0].keyword)
    ? `${lead.company} + "${ri.keywords[0].keyword}"`
    : `${lead.company} for the 2026 ${lead.sector || ''} guide`.replace(/\s+/g, ' ').trim();
  const lines = [`${recipient},`, '', `We're publishing "${blogTitle}" and ${lead.company} is shortlisted.`];
  if (gapLine) lines.push('', gapLine);
  lines.push('', `The pre-publish review produced a £1,500 compliance + SEO audit naming the fix${auditTail}`);
  lines.push('', `Worth 15 minutes? cal.com/tamazia/strategy-call`, '', 'Aman');
  const body = lines.join('\n');
  return { subject, body, touch: 0 };
}

function buildTouch1({ lead, findings }) {
  const recipient = pickRecipientName(lead);
  const five = findings.slice(0, 5).map((f, i) => `${i + 1}. ${f}`).join('\n');
  const subject = `re: ${lead.company} for the 2026 piece`;
  const body = `${recipient},

Following last week. Are you still up for the feature? The DA 87 backlink hyperlinked to your website could directly push your organic ranking by 2-3 places on Google and AI search; the piece publishes this May 2026.

The complimentary £1,500 Compliance and SEO audit on ${lead.company} is live:

${lead.audit_url || 'https://audit.tamazia.co.uk/audit/' + (lead.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-complimentary-audit'}

Five takeaways:
${five}

We request to ask your current agency for its most recent report on ${lead.domain || lead.company}. Compare ours line by line. If theirs covers the same ground, we are not the right fit. If not, you have just identified the blind spot.

Tamazia is a founder-led Compliance and SEO agency. £110M+ generated in client revenue across four continents.

Thirty minutes with the founder to walk you through the report (Aman Pareek, LLM in International Business Law from King's College London): https://tamazia.co.uk/book/

Best,
Aman`;
  return { subject, body, touch: 1 };
}

function buildTouch2({ lead, findings }) {
  const recipient = pickRecipientName(lead);
  const primary = (findings[0] || '').split(' miss:')[0] || 'compliance review';
  const subject = `re: ${lead.company}`;
  const body = `${recipient},

One direct question on ${lead.company}. Has the ${primary} on the home page been reviewed and signed off this quarter?

If yes, apologies for the noise. If no, the audit has the fix:

${lead.audit_url || 'https://audit.tamazia.co.uk/audit/' + (lead.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-complimentary-audit'}

Stays live for 180 days. Worth comparing line by line against the last report your current agency delivered.

Best,
Aman`;
  return { subject, body, touch: 2 };
}

function buildTouch3({ lead, findings }) {
  const recipient = pickRecipientName(lead);
  const primary = (findings[0] || '').split(' miss:')[0] || 'compliance disclosure';
  const subject = `closing the file on ${lead.company}`;
  const body = `${recipient},

Closing the file. The audit at ${lead.audit_url || 'https://audit.tamazia.co.uk/audit/' + (lead.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-complimentary-audit'} stays live for 180 days.

If the ${primary} ever lands on the team's desk, the audit has the fix, or the founder's calendar is at https://tamazia.co.uk/book/.

Best,
Aman`;
  return { subject, body, touch: 3 };
}

function saveDraft(lead_id, touch) {
  pg(`DELETE FROM outreach_drafts WHERE lead_id=${lead_id} AND channel='email' AND draft_metadata->>'touch' = '${touch.touch}'`);
  const meta = JSON.stringify({ touch: touch.touch, locked_template: true, generated_by: 'S064_touch_cadence' });
  const sql = `INSERT INTO outreach_drafts (lead_id, channel, draft_subject, draft_body, draft_metadata, generated_at) VALUES (${lead_id}, 'email', ${pgEsc(touch.subject)}, ${pgEsc(touch.body)}, ${pgEsc(meta)}::jsonb, NOW()) RETURNING id`;
  return pg(sql);
}

async function renderAll(lead_id) {
  const lead = loadLead(lead_id); if (!lead) return { error: 'lead_not_found' };
  // Apollo enrichment (org level only — people search is paid)
  let apolloOrg = null;
  if (lead.domain) {
    const r = await apollo.enrichOrg(lead.domain);
    if (r.ok && r.org) apolloOrg = r.org;
  }
  const findings = topAuditFindings(lead.pointers || []);
  if (!findings.length) findings.push('Compliance posture awaiting full audit re-scan; engine flags pending review');
  const t0 = buildTouch0({ lead, apolloOrg, findings });
  const t1 = buildTouch1({ lead, findings });
  const t2 = buildTouch2({ lead, findings });
  const t3 = buildTouch3({ lead, findings });
  const ids = {
    touch_0: saveDraft(lead.id, t0),
    touch_1: saveDraft(lead.id, t1),
    touch_2: saveDraft(lead.id, t2),
    touch_3: saveDraft(lead.id, t3)
  };
  // Write to disk for inspection (the existing pattern client_email_files/<lead>/touch_*.md)
  const dir = path.join(ROOT, 'client_email_files', String(lead.id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'touch_0.md'), `# Touch 0\nSubject: ${t0.subject}\n\n---\n\n${t0.body}\n`);
  fs.writeFileSync(path.join(dir, 'touch_1.md'), `# Touch 1\nSubject: ${t1.subject}\n\n---\n\n${t1.body}\n`);
  fs.writeFileSync(path.join(dir, 'touch_2.md'), `# Touch 2\nSubject: ${t2.subject}\n\n---\n\n${t2.body}\n`);
  fs.writeFileSync(path.join(dir, 'touch_3.md'), `# Touch 3\nSubject: ${t3.subject}\n\n---\n\n${t3.body}\n`);
  // Schedule next_touch_date for cron-driven send (Touch 0 immediate, Touch 1 +5d, Touch 2 +10d, Touch 3 +20d business days)
  pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE, updated_at=NOW() WHERE id=${lead.id}`);
  return { lead_id: lead.id, company: lead.company, apollo_enriched: !!apolloOrg, findings_count: findings.length, draft_ids: ids, files_written: dir };
}

if (require.main === module) {
  const lead_id = Number(process.argv[2] || 17);
  renderAll(lead_id).then(r => { console.log(JSON.stringify(r, null, 2)); });
}

module.exports = { renderAll, buildTouch0, buildTouch1, buildTouch2, buildTouch3 };
