#!/usr/bin/env node
// S063 · Deep per-lead research → personalised Touch 0
// Combines: (1) Gemini extraction of full company profile from website
//           (2) DDG search for recent news + press + leadership changes
//           (3) Regulator-watch intel relevant to their sector × jurisdiction
//           (4) Ad-pixel detection
//           (5) Gemini-composed personalised Touch 0 with REAL specifics

const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { fetchWithRetry } = require('../../../skills/S008-personalisation-engine/lib/http.js');
const { extractJson, generate } = require('../../../lib/llm/gemini.js');
const pixelDetector = require('../../../lib/ad-intel/pixel-detector.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; }
}
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const BROWSER = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-GB,en;q=0.9' };

async function fetchSite(domain, paths = ['/', '/about', '/about-us', '/services', '/team', '/leadership', '/news', '/press', '/contact', '/locations']) {
  let combined = '';
  const evidence_urls = [];
  for (const p of paths) {
    try {
      const r = await fetchWithRetry(`https://${domain}${p}`, { headers: BROWSER, timeout: 9000, retries: 0 });
      if (r.ok && r.body && r.body.length > 1000) {
        const clean = r.body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 8000);
        combined += `\n\n=== ${p} ===\n${clean}`;
        evidence_urls.push(`https://${domain}${p}`);
        if (combined.length > 40000) break;
      }
    } catch (_e) {}
  }
  return { combined: combined.slice(0, 40000), evidence_urls };
}

async function ddgRecentNews({ company }) {
  const q = `${company} news 2026`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const r = await fetchWithRetry(url, { headers: BROWSER, timeout: 12000, retries: 0 });
  if (!r.ok) return [];
  const items = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]{0,400}?<a[^>]+class="result__snippet"[^>]*>([\s\S]{0,300}?)<\/a>/g;
  let m;
  while ((m = re.exec(r.body)) !== null && items.length < 8) {
    let href = m[1];
    if (href.includes('uddg=')) { try { href = decodeURIComponent(href.match(/uddg=([^&]+)/)[1]); } catch (_e) {} }
    items.push({ url: href, title: m[2].trim(), snippet: m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() });
  }
  return items;
}

async function sectorIntel(sector, jurisdiction) {
  const sql = `SELECT source_org, headline, ts::text, impact_tag FROM intel_items WHERE jurisdiction = ${pgEsc(jurisdiction)} AND (sector = ${pgEsc(sector)} OR sector IS NULL) ORDER BY observed_at DESC LIMIT 5`;
  const raw = pg(sql);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => { const [source_org, headline, ts, impact_tag] = l.split('\t'); return { source_org, headline, ts, impact_tag }; });
}

async function researchLead(lead) {
  console.log(`\n=== ${lead.company} (${lead.domain}) ===`);
  const profile = { lead_id: lead.id, company: lead.company, domain: lead.domain };

  // 1. Website extraction via Gemini
  const site = await fetchSite(lead.domain);
  profile.evidence_urls = site.evidence_urls;
  if (site.combined) {
    const gemR = await extractJson({
      prompt: `Deep-research extraction for cold-outreach personalisation. Company: "${lead.company}". Read this website (multiple pages concatenated):

${site.combined}

Extract a JSON profile:
- one_line_pitch: their value proposition in one sentence (use THEIR words where possible)
- principal_contact: { first_name, last_name, title } — managing partner / founder / CEO if visible
- top_service_lines: array of 3-6 specific service/product offerings (their exact terms)
- target_clients: who they sell to (sector, scale, geography)
- jurisdictions_operated: array of country codes where they explicitly mention operations
- recent_milestones: array of strings (any 2024-26 wins, partnerships, expansions, regulatory wins, awards)
- regulatory_posture: { regulators_named, certifications_visible, last_compliance_action }
- editorial_angle: a single sharp angle Tamazia could use as Touch 0 hook (be specific, not generic — name something Tamazia would actually credibly say to them)
- public_emails: array of explicitly published email addresses
- linkedin_company_url: company LinkedIn URL if visible
- audit_priority_signal: "active marketing" | "stale site" | "high regulatory risk" | "well-resourced" | "lean" | "growth-stage"
- ad_pixels_detected: subset of [meta, google, linkedin, tiktok]
- evidence_quotes: array of 2-3 short verbatim quotes from the site that prove your extraction is grounded`,
      schema_hint: 'profile object as described'
    });
    if (gemR.ok) profile.site_extraction = gemR.data;
    else profile.site_error = gemR.error;
  }

  // 2. Recent news via DDG
  profile.recent_news = await ddgRecentNews({ company: lead.company });

  // 3. Sector intel from regulator-watch
  profile.sector_intel = await sectorIntel(lead.sector || 'unknown', lead.jurisdiction || 'UK');

  // 4. Ad-pixel detection
  try { profile.ad_pixels = await pixelDetector.detect(lead.domain); } catch (_e) {}

  return profile;
}

async function composeTouch0(profile, lead) {
  // Use Gemini to compose the personalised Touch 0 grounded in the deep research
  const prompt = `You are writing a single COLD-OUTREACH EMAIL (Touch 0) from Aman Pareek (Founder, Tamazia · LLM, King's College London) to a senior decision-maker at ${profile.company}.

Tamazia is a lawyer-led international SEO + regulatory-compliance firm for regulated enterprises. We review every campaign against 200+ laws (SRA, FCA, CMA, MHRA, ASA, HIPAA, RERA, CCPA etc.) before publication. Track record: Kamat Hotels (NSE-listed), CG Oncology (Nasdaq IPO), Meraas (Dubai Holding).

Use the DEEP RESEARCH below to make this email PERSONALISED — name 2-3 specific things from their site or recent news. The email must NOT feel templated. Reference one of the their actual service lines or recent milestones.

WRITING RULES:
- 130-170 words total (4-6 short paragraphs)
- Subject line that creates curiosity, references something specific, max 8 words
- Opening that proves you've actually researched them (1 specific verifiable fact)
- One sentence on why their sector matters right now (use real regulator news from sector_intel)
- One sentence on what Tamazia could do for them (use their service-line vocabulary)
- One clear ask: "Would 20 minutes next week be useful?" with calendar https://tamazia.co.uk/book/
- Sign off: Aman Pareek, Founder, Tamazia · LLM, King's College London
- NO fake stats, NO emojis, NO marketing-speak

DEEP RESEARCH:
${JSON.stringify(profile, null, 2).slice(0, 8000)}

GREETING: The recipient's first name is "${(lead.contact_first || lead.first_name || '').trim()}". If that is non-empty, open with "Hi <firstname>,". If it is empty, open with "Hi there,". NEVER write a bracketed or templated placeholder such as [Decision Maker Name], {name}, {firm} or similar — write the real word or a clean generic greeting.

Return the email in EXACTLY this plain-text format and NOTHING else (no JSON, no code fences):
SUBJECT: <subject line, max 8 words>
===BODY===
<the full email body, plain text, real line breaks>`;

  // Generate, then parse by delimiter. Plain-text + delimiter is robust to the newlines, quotes and
  // truncation that made JSON-from-LLM parsing fail; no fragile JSON.parse.
  const gen = await generate({ prompt, max_tokens: 2200, temperature: 0.4 });
  if (!gen.ok) return { error: gen.error };
  let txt = (gen.text || '').trim();
  if (txt.startsWith('```')) txt = txt.replace(/^```(?:json|text)?\s*/, '').replace(/\s*```$/, '').trim();
  const sm = txt.match(/SUBJECT:\s*(.+)/i);
  const bi = txt.indexOf('===BODY===');
  const subject = sm ? sm[1].trim().replace(/^["']|["']$/g, '') : '';
  let body = bi !== -1 ? txt.slice(bi + '===BODY==='.length).trim() : '';
  // Fallback if the model omitted the delimiter: first non-empty line = subject, remainder = body.
  if (subject && !body) {
    const lines = txt.split('\n').filter(l => l.trim());
    if (lines.length > 1) body = lines.slice(1).join('\n').trim();
  }
  // Guard: refuse drafts that still contain an unfilled bracket/curly placeholder.
  if (subject && body && !/\[[A-Za-z][A-Za-z ]+\]|\{[a-zA-Z_]+\}/.test(subject + ' ' + body)) {
    return { subject, body };
  }
  return { error: 'compose_parse_or_placeholder_failed', raw: txt.slice(0, 500) };
}

async function runForLead(lead) {
  const profile = await researchLead(lead);
  const touch0 = await composeTouch0(profile, lead);
  // Save to outreach_drafts (replace any prior templated Touch 0)
  if (touch0 && touch0.subject) {
    pg(`DELETE FROM outreach_drafts WHERE lead_id = ${lead.id} AND channel = 'email' AND draft_metadata->>'touch' = '0'`);
    const meta = JSON.stringify({ touch: 0, personalised: true, generated_by: 'S063_deep_research', evidence_urls: profile.evidence_urls, recent_news_count: profile.recent_news?.length || 0, sector_intel_count: profile.sector_intel?.length || 0 });
    const sql = `INSERT INTO outreach_drafts (lead_id, channel, draft_subject, draft_body, draft_metadata, generated_at) VALUES (${lead.id}, 'email', ${pgEsc(touch0.subject)}, ${pgEsc(touch0.body)}, ${pgEsc(meta)}::jsonb, NOW()) RETURNING id`;
    const id = pg(sql);
    return { lead_id: lead.id, company: lead.company, draft_id: id ? Number(id) : null, profile, touch0 };
  }
  return { lead_id: lead.id, company: lead.company, error: 'compose_failed', profile, touch0 };
}

if (require.main === module) {
  (async () => {
    // Pick 3 high-value leads
    const raw = pg(`SELECT id::text, company, domain, COALESCE(sector,'') AS sector, COALESCE(jurisdiction,'UK') AS jurisdiction FROM leads WHERE id IN (21, 17, 18) ORDER BY id`);
    const leads = raw.split('\n').filter(Boolean).map(l => { const [id, company, domain, sector, jurisdiction] = l.split('\t'); return { id: Number(id), company, domain, sector, jurisdiction }; });
    for (const lead of leads) {
      const r = await runForLead(lead);
      console.log(`\n--- ${lead.company} ---`);
      if (r.touch0?.subject) {
        console.log('SUBJECT:', r.touch0.subject);
        console.log('BODY:\n' + r.touch0.body);
      } else {
        console.log('ERROR:', r.error || r.touch0?.error);
      }
      console.log(`Draft saved: id=${r.draft_id}`);
      await new Promise(r => setTimeout(r, 4500));
    }
  })();
}

module.exports = { researchLead, composeTouch0, runForLead };
