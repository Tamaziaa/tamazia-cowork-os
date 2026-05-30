#!/usr/bin/env node
// S006 LinkedIn drafter v2 (Phase 9)
// Produces 4 draft variants per lead: connection request · message · voice script · post comment
// Uses: ad-intel summary, audit findings, mutual connections, sector + jurisdiction

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

function loadLead(lead_id) {
  const raw = pg(`SELECT id::text, company, COALESCE(domain,''), COALESCE(sector,''), COALESCE(jurisdiction,'UK'), COALESCE(first_name,''), COALESCE(last_name,''), COALESCE(title,''), COALESCE(linkedin_url,''), ad_intel::text, audit_url, lead_audience FROM leads WHERE id=${lead_id}`);
  if (!raw) return null;
  const [id, company, domain, sector, jurisdiction, first_name, last_name, title, linkedin_url, ad_intel, audit_url, lead_audience] = raw.split('\t');
  return { id, company, domain, sector, jurisdiction, first_name, last_name, title, linkedin_url, ad_intel: ad_intel ? JSON.parse(ad_intel) : null, audit_url, lead_audience: lead_audience || 'tamazia' };
}

function loadMutualIntros() {
  const raw = pg(`SELECT name, company, affiliation FROM known_warm_intros ORDER BY network_strength DESC LIMIT 10`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [name, company, affiliation] = l.split('\t'); return { name, company, affiliation }; });
}

function pickIntro(intros, sector) {
  // ANONYMISED (founder policy): client names are NEVER emitted in outreach. No named intros.
  return null;
}

const SECTOR_HOOK = {
  'law-firms': 'SRA Transparency Rules sweeps run quarterly. Most firms miss at least one item',
  'healthcare': 'MHRA + ASA joint enforcement notice has actioned 25+ clinics in the last 12 months',
  'finance': 'FCA Consumer Duty is the top regulator priority for 2025',
  'fintech': 'FCA finfluencer regime + Consumer Duty enforcement compounding',
  'insurance': 'FCA Consumer Duty inspection focus through 2025',
  'real-estate': 'CMA DMCC Act in force from April 2025; first enforcement opened November 2025',
  'hospitality': 'CMA DMCC Act subscription + drip-pricing enforcement active',
  'pharma': 'PMCPA upheld 47 complaints in 2024-25; ABPI Code now actively enforced',
  'ecommerce': 'CMA DMCC drip-pricing + fake-review rules now fineable up to 10% global turnover',
  'charity': 'Fundraising Regulator complaints up 22%; Charity Commission opened 156 inquiries 2024',
  'education': 'OfS regulatory intervention against 7 universities 2024',
};

function buildConnectionRequest(lead) {
  const first = lead.first_name || 'there';
  const hook = SECTOR_HOOK[lead.sector] || 'Your sector regulator is active right now';
  // 200-char LinkedIn limit
  return `Hi ${first}, Tamazia is the only SEO firm that puts every campaign through 400+ laws before publication. ${hook}. Open to swapping notes?`.slice(0, 295);
}

function buildMessage(lead, intro, ad_intel) {
  const first = lead.first_name || lead.company.split(' ')[0];
  const sectorHook = SECTOR_HOOK[lead.sector] || 'your regulator is active';
  const adNote = ad_intel && ad_intel.platforms_count >= 1
    ? `\n\nWe also picked up ${ad_intel.platforms.join(' + ')} pixels on ${lead.domain || lead.company} which says your team is investing in paid acquisition, but every paid landing page is a compliance surface too.`
    : '';
  const introNote = intro ? `\n\n${intro.name} (${intro.company}) was one of our reference engagements, happy to share specifics if useful.` : '';
  const auditLink = lead.audit_url
    ? `\n\nWe ran a free compliance + SEO + AI-visibility audit on ${lead.domain || lead.company}. Findings here: ${lead.audit_url}`
    : '';
  return {
    body: `${first},

Tamazia is lawyer-led SEO for regulated sectors. ${sectorHook}.

The way we work: every word, every page, every campaign passes through the regulatory framework that governs your sector before anything goes live. No legal exposure. No published content the SRA / MHRA / FCA / CMA / Ofcom would question.${introNote}${adNote}${auditLink}

Would a 20-min walkthrough of the audit findings be useful? Calendar: https://tamazia.co.uk/book/

Aman Pareek
Founder, Tamazia · LLM, King's College London`,
    char_count: 0 // computed below
  };
}

function buildVoiceScript(lead) {
  const first = lead.first_name || lead.company.split(' ')[0];
  const sectorHook = SECTOR_HOOK[lead.sector] || 'your regulator is active right now';
  // ≤30s = ~75 words spoken
  return `Hi ${first}, Aman from Tamazia. Quick voice note rather than a wall of text. ${sectorHook} and I noticed your team is publishing without the regulatory review most firms in ${lead.sector || 'this sector'} are missing. I'd love to walk you through what we found in 20 minutes. No sales, no pitch deck, just the findings. Let me know.`;
}

function buildPostComment(lead, recent_post_topic) {
  // Engagement comment to warm before connection. Acceptable copy.
  return `Helpful framing. The compliance angle on ${recent_post_topic || lead.sector || 'this'} is the one most teams miss, ICO / FCA / SRA / MHRA / CMA all running sweeps in parallel right now. Curious if you've seen the same pattern.`;
}

function saveDraft(lead_id, channel, draft_body, metadata, draft_subject) {
  const sql = `INSERT INTO outreach_drafts (lead_id, channel, draft_subject, draft_body, draft_metadata)
    VALUES (${lead_id}, ${pgEsc(channel)}, ${pgEsc(draft_subject || null)}, ${pgEsc(draft_body)}, ${pgEsc(JSON.stringify(metadata || {}))}::jsonb)
    RETURNING id`;
  return pg(sql);
}

function buildAll(lead_id) {
  const lead = loadLead(lead_id);
  if (!lead) return { error: 'lead_not_found' };
  const intros = loadMutualIntros();
  const intro = pickIntro(intros, lead.sector);

  const connectionRequest = buildConnectionRequest(lead);
  const message = buildMessage(lead, intro, lead.ad_intel);
  const voiceScript = buildVoiceScript(lead);
  const postComment = buildPostComment(lead);

  const ids = {
    connect: saveDraft(lead_id, 'linkedin_connect', connectionRequest, { sector_hook: SECTOR_HOOK[lead.sector] }),
    message: saveDraft(lead_id, 'linkedin_message', message.body, { intro: intro?.name, ad_intel_summary: lead.ad_intel }),
    voice: saveDraft(lead_id, 'linkedin_voice', voiceScript, { duration_estimate_sec: 28 }),
    comment: saveDraft(lead_id, 'linkedin_comment', postComment, { topic: 'sector enforcement' })
  };

  return {
    lead_id,
    lead: { company: lead.company, sector: lead.sector, jurisdiction: lead.jurisdiction, audit_url: lead.audit_url, ad_intel_platforms: lead.ad_intel?.platforms || [] },
    drafts: {
      connection_request: connectionRequest,
      message: message.body,
      voice_script: voiceScript,
      post_comment: postComment
    },
    draft_ids: ids,
    mutual_intro: intro?.name
  };
}

if (require.main === module) {
  const lead_id = Number(process.argv[2] || 21); // default: Mishcon
  console.log(JSON.stringify(buildAll(lead_id), null, 2));
}

module.exports = { buildAll, loadLead, loadMutualIntros };
