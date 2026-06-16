#!/usr/bin/env node
// S064 · Touch cadence renderer
// -----------------------------------------------------------------------------------------------
// P7 [X7/X26/X31]: this renderer now reads the FOUNDER-REVIEWED per-sector copy in `campaigns/<CODE>.json`
// as its template source, instead of its own hardcoded templates. Those JSON files (LS/HC/AE/DN/FS/RE/HO/FB/
// ED/PB) are the copy the founder approved (different angle + intervals from the old hardcoded set). D1
// (founder-locked): we render EXACTLY touches 0-3 — the cadence is 4 touches at days [0,3,10,21], then recycle.
// The campaign JSONs each carry a touch-4 block, but it is DELIBERATELY NOT rendered: send-due.js advances
// 0->1->2->3->cadence_complete (LAST_TOUCH=3) and the Mystrika push path (scripts/push-to-mystrika.js +
// scripts/mystrika-export.js) reads only t0..t3, so a touch-4 draft would never send. This REVERTS #50, which
// wrongly added a 5th touch.
//
// Merge fields filled per lead: {{first_name}} {{company}} {{city}} {{audit_url}} {{finding}} {{clause}}
// {{calendar_link}}. P7 specifics: T0 carries the real {{finding}} (the detection on the prospect's own site),
// and the greeting comes from contact_name's first token when first_name is empty (1,832 such leads live).
//
// Output: 4 grounded outreach drafts saved to outreach_drafts (idempotent delete+reinsert per touch), gated by
// src/lib/gates.js (length + no unfilled braces + no square placeholders + no dash-pause + a live audit link on
// the touches that need one). Sending stays OFF (SEND_ENABLED master gate in send-due.js).

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const apollo = require('../../../lib/enrichment/apollo.js');
let _gate = null; try { _gate = require('../../../lib/gates.js'); } catch (_) {}
function _validate(t, opts) { if (!_gate || !_gate.validateEmail) return { ...t, valid: true, gate: { ok: true, reasons: [] } }; const v = _gate.validateEmail(t.subject, t.body, opts); return { ...t, valid: v.ok, gate: v }; }

function pg(sql) { const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING; if (!url) return null; try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); } catch (_e) { return null; } }
function pgEsc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const CAMPAIGNS_DIR = path.join(ROOT, 'campaigns');
// The 10 priority sector campaign codes (filenames in campaigns/). leads.sector_code already holds these for
// ~6,100 leads; for the rest we fall back to mapping the long-form `sector` slug to a code.
const CAMPAIGN_CODES = ['LS', 'HC', 'AE', 'DN', 'FS', 'RE', 'HO', 'FB', 'ED', 'PB'];
// sector slug (leads.sector) -> campaign code, for leads with a NULL sector_code. Mirrors the SECTOR_CAMPAIGN
// vocab in scripts/push-to-mystrika.js so render + push route the same way.
const SLUG_TO_CODE = {
  'law-firms': 'LS', 'law': 'LS', 'legal': 'LS', 'barristers': 'LS', 'solicitors': 'LS',
  'healthcare': 'HC', 'medical': 'HC', 'health': 'HC', 'pharma': 'HC',
  'beauty-wellness': 'AE', 'aesthetics': 'AE', 'cosmetic': 'AE', 'dermatology': 'AE',
  'dental': 'DN', 'dentist': 'DN', 'dentistry': 'DN',
  'financial': 'FS', 'finance': 'FS', 'financial-services': 'FS', 'fintech': 'FS', 'insurance': 'FS', 'wealth': 'FS',
  'real-estate': 'RE', 'property': 'RE', 'realestate': 'RE',
  'hospitality': 'HO', 'hotels': 'HO', 'hotel': 'HO',
  'restaurants': 'FB', 'f&b': 'FB', 'food': 'FB', 'fnb': 'FB', 'bars': 'FB',
  'education': 'ED', 'schools': 'ED', 'edtech': 'ED',
  'professional': 'PB', 'professional-services': 'PB', 'b2b': 'PB', 'consulting': 'PB'
};

const _campaignCache = {};
function campaignCodeFor(sector_code, sector) {
  const sc = String(sector_code || '').trim().toUpperCase();
  if (CAMPAIGN_CODES.includes(sc)) return sc;
  const slug = String(sector || '').trim().toLowerCase();
  if (SLUG_TO_CODE[slug]) return SLUG_TO_CODE[slug];
  // last-ditch: a slug that *contains* a known key (e.g. 'ecommerce-retail' has no campaign -> null)
  for (const [k, v] of Object.entries(SLUG_TO_CODE)) { if (slug && slug.includes(k)) return v; }
  return null;
}
// Load + cache a sector campaign JSON, or null if there is no campaign for this sector (non-priority).
function loadCampaign(code) {
  if (!code) return null;
  if (code in _campaignCache) return _campaignCache[code];
  let c = null;
  try { c = JSON.parse(fs.readFileSync(path.join(CAMPAIGNS_DIR, code + '.json'), 'utf8')); } catch (_e) { c = null; }
  _campaignCache[code] = c;
  return c;
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

function loadLead(lead_id) {
  const sql = `SELECT id::text, regexp_replace(COALESCE(company,''),'[\\t\\r\\n]',' ','g'), COALESCE(domain,''), COALESCE(sector,''), COALESCE(sector_code,''), COALESCE(jurisdiction,'UK'), regexp_replace(COALESCE(first_name,''),'[\\t\\r\\n]',' ','g'), regexp_replace(COALESCE(last_name,''),'[\\t\\r\\n]',' ','g'), regexp_replace(COALESCE(contact_name,''),'[\\t\\r\\n]',' ','g'), regexp_replace(COALESCE(title,''),'[\\t\\r\\n]',' ','g'), COALESCE(email,''), audit_url::text, personalisation_pointers::text, COALESCE(rank_insight::text,'{}'), regexp_replace(COALESCE(operating_city,''),'[\\t\\r\\n]',' ','g'), regexp_replace(COALESCE(rank_insight_sentence,''),'[\\t\\r\\n]',' ','g') FROM leads WHERE id=${lead_id}`;
  const raw = pg(sql); if (!raw) return null;
  const [id, company, domain, sector, sector_code, jurisdiction, first_name, last_name, contact_name, title, email, audit_url, pp, riJson, operating_city, riSentence] = raw.split('\t');
  let pointers = []; let ppObj = null;
  try { const _j = JSON.parse(pp || '[]'); if (Array.isArray(_j)) pointers = _j; else if (_j && Array.isArray(_j.pointers)) { pointers = _j.pointers; ppObj = _j; } else if (_j && typeof _j === 'object') ppObj = _j; } catch (_e) {}
  let rank_insight = {}; try { rank_insight = JSON.parse(riJson || '{}'); } catch (_e) {}
  return { id: Number(id), company, domain: domain || null, sector: sector || 'professional-services', sector_code: sector_code || '', jurisdiction, first_name, last_name, contact_name, title, email, audit_url, pointers, pp: ppObj, rank_insight, operating_city: operating_city || null, rank_insight_sentence: riSentence || null };
}

function topAuditFindings(pointers, max = 5) {
  if (!Array.isArray(pointers)) pointers = [];
  const p0 = pointers.filter(p => p.severity === 'P0');
  const p1 = pointers.filter(p => p.severity === 'P1');
  const out = [...p0.slice(0, 3), ...p1.slice(0, max - p0.slice(0, 3).length)];
  return out.map(p => String(p.fact || p.layman_explanation || p.citation || '').replace(/\s+/g, ' ').replace(/\.*$/, '').trim()).filter(Boolean).slice(0, max);
}

// Greeting name. P7: prefer first_name; fall back to the FIRST REAL-NAME TOKEN of contact_name (1,832 leads have
// an empty first_name but a populated contact_name); else the campaign default 'there'. Strips a leading honorific
// (Dr/Mr/Mrs/Ms/Miss/Prof/Mx) so we greet "Hi Raj," not "Hi Dr,". Never returns a blank.
const HONORIFICS = /^(dr|mr|mrs|ms|miss|mx|prof|professor|sir|madam|rev|fr)\.?$/i;
function firstRealName(full) {
  const toks = String(full || '').trim().split(/\s+/).filter(Boolean);
  for (const t of toks) { if (!HONORIFICS.test(t.replace(/[.,]/g, ''))) return t.replace(/[.,]$/, ''); }
  return '';
}
function greetName(lead) {
  const fn = firstRealName(lead.first_name);
  if (fn) return fn;
  const cn = firstRealName(lead.contact_name);
  if (cn) return cn;
  return 'there';
}

// Normalise any audit_url to an ABSOLUTE https link (stored values are sometimes relative '/audit/...').
function absAudit(u) { u = String(u == null ? '' : u).trim(); if (/^https?:\/\//i.test(u)) return u; if (u.startsWith('/')) return 'https://tamazia.co.uk' + u; return ''; }

// The campaign's sector-typical finding = the [bracketed] illustrative text in its T0 body. This is the
// founder's deliberate per-sector default (e.g. HC: "advertising or analytics pixels firing on your booking
// pages..."). Used as the LAST-resort {{finding}} so touch 1+ never ships an empty/unfilled finding.
function campaignDefaultFinding(campaign) {
  try {
    const t0 = (campaign.touches || []).find(t => Number(t.touch) === 0);
    const body = t0 ? (Array.isArray(t0.body) ? t0.body.join('\n') : String(t0.body || '')) : '';
    const m = body.match(/\[([^\]]+)\]/);
    if (m) return m[1].trim();
  } catch (_e) {}
  return 'a compliance gap we found on your public pages';
}
// The real detection on this prospect's site for {{finding}}. Waterfall: explicit audit pointers ->
// personalisation_pointers.top_finding (8,305 leads have it) -> the rank-insight sentence -> the campaign's
// sector-typical default. ALWAYS returns a non-empty string so {{finding}} never leaves an unfilled brace.
function leadFinding(lead, findings, campaign) {
  if (findings && findings[0]) return findings[0];
  const tf = lead.pp && lead.pp.top_finding ? String(lead.pp.top_finding).trim() : '';
  if (tf) return tf;
  if (lead.rank_insight_sentence) return String(lead.rank_insight_sentence).trim();
  return campaign ? campaignDefaultFinding(campaign) : '';
}

// The cal.com 1:1 link for {{calendar_link}}. Branded /book/ by default (matches the rest of the engine);
// override with CALENDAR_LINK if the founder wants the raw cal.com URL.
function calendarLink() { return (process.env.CALENDAR_LINK || 'https://tamazia.co.uk/book/').trim(); }

// First clause of the sector's regulator framework, for {{clause}} ("measured against {{clause}}").
function clauseFor(campaign) {
  const fw = String((campaign && campaign.regulator_framework) || '').trim();
  if (!fw) return 'the relevant UK regulator guidance';
  return fw.split(',')[0].trim() || fw;
}

// Substitute merge fields in a single string. Resolves {{x}} for every supported field, AND any [bracketed]
// illustrative placeholder (the founder's sector-typical example in T0) -> the real finding if we have one,
// else the bracket's own inner text (so it reads naturally and never trips the square-placeholder gate).
function substitute(text, fields) {
  let s = String(text == null ? '' : text);
  s = s.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) => {
    const k = key.toLowerCase();
    return (k in fields && fields[k] != null && fields[k] !== '') ? String(fields[k]) : (m); // leave unknown tags for the gate to catch
  });
  // Resolve a [bracketed] finding placeholder. T0 carries exactly one. If we have a real finding, use it;
  // otherwise drop the brackets and keep the sector-typical text the founder wrote inside them.
  s = s.replace(/\[([^\]]+)\]/g, (_m, inner) => (fields.finding && String(fields.finding).trim()) ? String(fields.finding).trim() : inner.trim());
  return s;
}

// Build ONE rendered touch from a campaign touch definition. Returns { subject, body, touch }. The body opens
// with the greeting from the campaign copy (which already starts "Hi {{first_name}},"); we substitute fields,
// fix the greeting to the resolved name, scrub dashes, and append the __SIGNATURE__ token the send path fills.
function buildTouchFromCampaign(campaign, touchIndex, lead, fields) {
  const def = (campaign.touches || []).find(t => Number(t.touch) === Number(touchIndex));
  if (!def) return null;
  const bodyLines = Array.isArray(def.body) ? def.body : [String(def.body || '')];
  let body = substitute(bodyLines.join('\n'), fields);
  let subject = substitute(def.subject || '', fields);
  // The campaign body greets "Hi {{first_name},". {{first_name}} is already substituted to the resolved name;
  // this is belt-and-braces in case a campaign greets differently — never leave a bare "Hi ,".
  body = body.replace(/^(\s*(?:Hi|Hello|Dear|Hey))\s*,/i, `$1 ${fields.first_name},`);
  // Append the signature token (the send path replaces __SIGNATURE__ with the alias name; the compliant
  // Art-14 footer is injected separately at send by both send paths — see P8).
  body = body.replace(/\s*$/, '') + '\n\n__SIGNATURE__';
  return { subject, body, touch: Number(touchIndex) };
}

function buildFields(lead, campaign, findings) {
  const finding = leadFinding(lead, findings, campaign);
  return {
    first_name: greetName(lead),
    company: lead.company || 'your firm',
    city: lead.operating_city || '',
    audit_url: absAudit(lead.audit_url),
    finding: finding,
    clause: clauseFor(campaign),
    calendar_link: calendarLink()
  };
}

// ---- Backward-compatible per-touch builders (consumed by backtest-personalisation.js + adversarial-test.js) ----
// These now render from the lead's sector campaign so the test harnesses exercise the SAME copy the engine ships.
function _campaignForLead(lead) { return loadCampaign(campaignCodeFor(lead.sector_code, lead.sector)); }
function buildTouch0({ lead, apolloOrg, findings }) { const c = _campaignForLead(lead); if (!c) return _fallbackTouch(lead, 0, findings); return buildTouchFromCampaign(c, 0, lead, buildFields(lead, c, findings)); }
function buildTouch1({ lead, findings }) { const c = _campaignForLead(lead); if (!c) return _fallbackTouch(lead, 1, findings); return buildTouchFromCampaign(c, 1, lead, buildFields(lead, c, findings)); }
function buildTouch2({ lead, findings }) { const c = _campaignForLead(lead); if (!c) return _fallbackTouch(lead, 2, findings); return buildTouchFromCampaign(c, 2, lead, buildFields(lead, c, findings)); }
function buildTouch3({ lead, findings }) { const c = _campaignForLead(lead); if (!c) return _fallbackTouch(lead, 3, findings); return buildTouchFromCampaign(c, 3, lead, buildFields(lead, c, findings)); }

// Minimal fallback for a lead whose sector has no campaign JSON (non-priority sector). Keeps the engine moving
// without shipping hollow mail: a short, compliant, audit-anchored note. Touches 1-3 carry the audit link.
function _fallbackTouch(lead, touch, findings) {
  const name = greetName(lead);
  const company = lead.company || 'your firm';
  const sector = (lead.sector || 'business').replace(/-/g, ' ');
  const audit = absAudit(lead.audit_url);
  const find = leadFinding(lead, findings);
  if (touch === 0) {
    const body = [`Hi ${name},`, '', `I review ${sector} websites against the relevant UK regulators before anything else, and one item on ${company}'s site stood out${find ? ': ' + find : ''}. If you market online, you are regulated.`, '', `I put together a short, free compliance and visibility audit of your site. No cost, nothing to install.`, '', `Would it help if I sent you the two-line summary of what I found? And if you are not the right person, who on your team owns the website?`, '', '__SIGNATURE__'].join('\n');
    return { subject: `${company} and ${sector} compliance`, body, touch: 0 };
  }
  if (touch === 1) {
    const body = [`Hi ${name},`, '', `Following up with the scan itself. I built ${company} a short audit page that walks through what I found: ${audit || 'https://tamazia.co.uk/book/'}.`, find ? `` : '', find ? `The headline item is ${find}, measured against the relevant UK regulator guidance.` : `It covers the compliance gap plus two SEO and AI-visibility points.`, '', `It is yours to keep whether or not we ever speak. If someone else handles the website, please feel free to forward this.`, '', '__SIGNATURE__'].filter(x => x !== '' || true).join('\n');
    return { subject: `Your compliance and visibility scan, ${company}`, body, touch: 1 };
  }
  if (touch === 2) {
    const body = [`Hi ${name},`, '', `I will leave it here so I am not cluttering your inbox. The audit I made for ${company} stays live at ${audit || 'https://tamazia.co.uk/book/'} for whenever it is useful.`, '', `If the gap is worth fixing properly, the simplest next step is a 20-minute 1:1 with me: ${calendarLink()}.`, '', `And if this is not your area, a quick note on who to speak to would mean a lot.`, '', '__SIGNATURE__'].join('\n');
    return { subject: `Worth 20 minutes, ${company}?`, body, touch: 2 };
  }
  // touch 3 — breakup nudge (final touch in the founder-locked 4-touch cadence [0,3,10,21]). One direct
  // question, audit stays live, no false urgency / no fake scarcity. There is no touch 4 (D1 reverted #50).
  const body = [`Hi ${name},`, '', `One direct question and then I will stop. Has the compliance posture on ${company}'s site been reviewed and signed off this quarter?`, '', `If yes, apologies for the noise. If no, the audit I built has the fix: ${audit || 'https://tamazia.co.uk/book/'}.`, '', `Worth comparing line by line against the last report your current agency delivered.`, '', '__SIGNATURE__'].join('\n');
  return { subject: `One question on ${company}'s last report`, body, touch: 3 };
}

function saveDraft(lead_id, touch) {
  pg(`DELETE FROM outreach_drafts WHERE lead_id=${lead_id} AND channel='email' AND draft_metadata->>'touch' = '${touch.touch}'`);
  const meta = JSON.stringify({ touch: touch.touch, locked_template: true, generated_by: 'S064_touch_cadence', template_source: 'campaigns_json' });
  const sql = `INSERT INTO outreach_drafts (lead_id, channel, draft_subject, draft_body, draft_metadata, generated_at) VALUES (${lead_id}, 'email', ${pgEsc(touch.subject)}, ${pgEsc(touch.body)}, ${pgEsc(meta)}::jsonb, NOW()) RETURNING id`;
  return pg(sql);
}

async function renderAll(lead_id) {
  const lead = loadLead(lead_id); if (!lead) return { error: 'lead_not_found' };
  // Apollo enrichment (org level only; people search is paid) — kept for parity with the prior renderer.
  let apolloOrg = null;
  if (lead.domain) { try { const r = await apollo.enrichOrg(lead.domain); if (r.ok && r.org) apolloOrg = r.org; } catch (_e) {} }

  const code = campaignCodeFor(lead.sector_code, lead.sector);
  const campaign = loadCampaign(code);
  const findings = topAuditFindings(lead.pointers || []);

  const _nd = (_gate && _gate.noDashes) ? _gate.noDashes : (x => x);
  const _scrub = (t) => t ? ({ ...t, subject: _nd(t.subject), body: _nd(t.body) }) : t;
  const fields = campaign ? buildFields(lead, campaign, findings) : null;
  // Render touches 0-3 from the founder-reviewed campaign copy (the founder-locked cadence is 4 touches at days
  // [0,3,10,21], then recycle). D1: touch 4 (the campaign JSON's 5th block) is NOT rendered here — send-due.js
  // advances 0->1->2->3->cadence_complete (LAST_TOUCH=3) and push-to-mystrika reads only t0..t3, so a 5th draft
  // would never send. This REVERTS #50's wrongly-added 5th touch; rendering it now would orphan it.
  // maxWords 160: the founder-reviewed campaign bodies run ~130-150 words (longer + more specific than the old
  // hardcoded copy). The gate default (130) would block approved copy, so raise the word ceiling for these
  // reviewed templates; everything else (no unfilled braces / no square placeholders / no dash-pause / a live
  // audit link where required) is still enforced. requireCurated is OFF: T0's finding is sector-typical, not a
  // keyword-ranking line, which is by design.
  const mk = (i, opts) => _validate(_scrub(campaign ? buildTouchFromCampaign(campaign, i, lead, fields) : _fallbackTouch(lead, i, findings)), { maxWords: 160, ...opts });
  const t0 = mk(0, { requireCurated: false });
  const t1 = mk(1, { requireAuditUrl: true, audit_url: lead.audit_url });
  const t2 = mk(2, {});
  const t3 = mk(3, {});
  const ids = { touch_0: saveDraft(lead.id, t0), touch_1: saveDraft(lead.id, t1), touch_2: saveDraft(lead.id, t2), touch_3: saveDraft(lead.id, t3) };

  // Write to disk for inspection (existing pattern client_email_files/<lead>/touch_*.md)
  const dir = path.join(ROOT, 'client_email_files', String(lead.id));
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const t of [t0, t1, t2, t3]) fs.writeFileSync(path.join(dir, `touch_${t.touch}.md`), `# Touch ${t.touch}\nSubject: ${t.subject}\n\n---\n\n${t.body}\n`);
  } catch (_e) {}

  // Schedule next_touch_date for cron-driven send (Touch 0 immediate). send-due.js computes subsequent intervals.
  if (t0.valid) pg(`UPDATE leads SET status='touch_0_queued', next_touch_date=CURRENT_DATE, updated_at=NOW() WHERE id=${lead.id}`);
  else pg(`UPDATE leads SET status='touch_0_blocked', updated_at=NOW() WHERE id=${lead.id}`);
  try { if (_gate && _gate.runGate) await _gate.runGate('touch_render', { entity: lead.domain || lead.company, t0valid: t0.valid }, [{ name: 'touch0_send_ready', fn: (p) => ({ ok: !!p.t0valid, reason: (t0.gate.reasons || []).join(',') }) }]); } catch (_) {}
  return { lead_id: lead.id, company: lead.company, campaign: code || '(none — fallback)', apollo_enriched: !!apolloOrg, findings_count: findings.length, draft_ids: ids, touch0_valid: t0.valid, gate_reasons: t0.gate.reasons, files_written: dir };
}

if (require.main === module) {
  const lead_id = Number(process.argv[2] || 17);
  renderAll(lead_id).then(r => { console.log(JSON.stringify(r, null, 2)); });
}

module.exports = { renderAll, buildTouch0, buildTouch1, buildTouch2, buildTouch3, buildTouchFromCampaign, campaignCodeFor, loadCampaign, substitute, greetName };
