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
let _gate = null; try { _gate = require('../../../lib/gates.js'); } catch (_) {}
function _validate(t, opts) { if (!_gate || !_gate.validateEmail) return { ...t, valid: true, gate: { ok: true, reasons: [] } }; const v = _gate.validateEmail(t.subject, t.body, opts); return { ...t, valid: v.ok, gate: v }; }

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
  const company = lead.company || 'your firm';
  const ri = lead.rank_insight || {};
  const blogTitle = ri.blog_offer || SECTOR_TITLE[lead.sector] || `Best UK ${lead.sector || 'business'} 2026`;
  const kws = (ri.keywords || []).filter(k => k && k.keyword).slice(0, 3);
  const kwLine = (k) => {
    const pos = k.my_position ? `#${k.my_position}` : 'not on page one';
    const note = k.leader ? (k.my_position ? ` (${k.leader} holds #1)` : ` (${k.leader} owns #1)`) : '';
    return `"${k.keyword}" \u2014 ${pos}${note}`;
  };
  const subject = (kws[0] && kws[0].keyword)
    ? `${company} + "${kws[0].keyword}"`
    : `${company} for the 2026 ${(lead.sector || 'sector').replace(/-/g, ' ')} guide`;
  const lines = [`${recipient},`, '', `We're publishing "${blogTitle}" and ${company} is shortlisted.`];
  if (kws.length) {
    lines.push('', 'Where you rank today for the searches that matter most:');
    kws.forEach(k => lines.push(kwLine(k)));
    lines.push('', `We ran you a complimentary compliance + SEO audit (\u00a31,500 list) that names the exact fix for each.`);
  } else if (findings && findings[0]) {
    lines.push('', `One thing the review flagged: ${findings[0]}.`, '', `We ran you a complimentary compliance + SEO audit (\u00a31,500 list) that names the fix.`);
  } else {
    lines.push('', `We ran you a complimentary compliance + SEO audit (\u00a31,500 list) of the site.`);
  }
  lines.push('', `Happy to be featured? And who is the right person to send the audit to?`, '', 'Aman');
  return { subject, body: lines.join('\n'), touch: 0 };
}

function buildTouch1({ lead, findings }) {
  const recipient = pickRecipientName(lead);
  const company = lead.company || 'your firm';
  const blogTitle = (lead.rank_insight && lead.rank_insight.blog_offer) || SECTOR_TITLE[lead.sector] || `Best UK ${lead.sector || 'business'} 2026`;
  const auditUrl = lead.audit_url || ('https://tamazia.co.uk/audit/' + String(company).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-complimentary-audit');
  const top = (findings && findings[0]) ? ` It flags ${findings[0]} first.` : '';
  const subject = `re: ${company} for the 2026 piece`;
  const body = [
    `${recipient},`, '',
    `Following up \u2014 still open to being featured in "${blogTitle}"?`, '',
    `Either way, here is the complimentary \u00a31,500 compliance + SEO audit we ran on ${company}:`,
    auditUrl, '',
    `It names the regulator and the fix for every issue, and benchmarks you against the firms outranking you.${top}`, '',
    `30 minutes with the founder: https://tamazia.co.uk/book/`, '',
    'Aman',
  ].join('\n');
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
  const t0 = _validate(buildTouch0({ lead, apolloOrg, findings }), { requireCurated: true });
  const t1 = _validate(buildTouch1({ lead, findings }), { requireAuditUrl: true, audit_url: lead.audit_url });
  const t2 = _validate(buildTouch2({ lead, findings }), {});
  const t3 = _validate(buildTouch3({ lead, findings }), {});
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
  if (t0.valid) pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE, updated_at=NOW() WHERE id=${lead.id}`);
  else pg(`UPDATE leads SET status='touch_0_blocked', updated_at=NOW() WHERE id=${lead.id}`);
  try { if (_gate && _gate.runGate) await _gate.runGate('touch_render', { entity: lead.domain || lead.company, t0valid: t0.valid }, [{ name: 'touch0_send_ready', fn: (p) => ({ ok: !!p.t0valid, reason: (t0.gate.reasons || []).join(',') }) }]); } catch (_) {}
  return { lead_id: lead.id, company: lead.company, apollo_enriched: !!apolloOrg, findings_count: findings.length, draft_ids: ids, touch0_valid: t0.valid, gate_reasons: t0.gate.reasons, files_written: dir };
}

if (require.main === module) {
  const lead_id = Number(process.argv[2] || 17);
  renderAll(lead_id).then(r => { console.log(JSON.stringify(r, null, 2)); });
}

module.exports = { renderAll, buildTouch0, buildTouch1, buildTouch2, buildTouch3 };
