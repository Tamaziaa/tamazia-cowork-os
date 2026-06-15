#!/usr/bin/env node
'use strict';
// Direct push: FIT + audit-verified leads -> Mystrika campaign via the inbound API (bulk add, custom fields =
// verified audit link + gated per-touch bodies + personalisation). Replaces the CSV step. Idempotent, fail-soft.
// Usage: MYSTRIKA_API_KEY=... node scripts/push-to-mystrika.js --campaign <campaign_id> [--max 200] [--dry]
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const M = require(path.resolve(__dirname, '..', 'src', 'lib', 'mystrika', 'client.js'));
const ROOT = path.resolve(__dirname, '..');
const { conversionScore, SEND_TIERS } = require(path.resolve(__dirname, '..', 'src', 'lib', 'sourcing', 'conversion.js'));
const { isVerifiedStatus, deliverabilityOf } = require(path.resolve(__dirname, '..', 'src', 'lib', 'enrich', 'verify-status.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
// maxBuffer: the push SELECT base64-encodes up to 5 rendered email bodies (t0s/t0b/t1b/t2b/t3b) per lead ×
// LIMIT (default 200) — multi-MB of output that overflows Node's 1MB execFileSync default and throws ENOBUFS.
function pg(sql){ return execFileSync(path.join(__dirname,'psql'),[NEON,'-tA','-c',sql],{encoding:'utf8',maxBuffer:128*1024*1024}); }
const b64d = (s)=>{ try { return Buffer.from(String(s||''),'base64').toString('utf8'); } catch(_){ return ''; } };
// SQL string-literal: returns a single-quoted, escaped literal (used by the sends-attribution log writer).
const pgEsc = (v)=> `'${String(v==null?'':v).replace(/'/g,"''")}'`;
const arg = (n,d)=>{ const i=process.argv.indexOf('--'+n); return i>=0?process.argv[i+1]:d; };
const DRY = process.argv.includes('--dry');
// Each contact = its own prospect (Mystrika has no CC/BCC). Decision-maker = primary; the rest = secondary.
const PER_COMPANY = Math.max(1, parseInt(process.env.MYSTRIKA_MAX_PER_COMPANY||'4',10));
const firstOf = (n)=> String(n||'').trim().split(/\s+/)[0] || '';
// Swap ONLY the leading greeting name so a secondary recipient isn't addressed by the primary's name. The
// rendered bodies open with a greeting line — either "Hi Jane," / "Dear Jane," OR a bare "Jane Smith," —
// so match an optional salutation + the leading 1-3 capitalised name words before the first comma. Anchored
// at string start (no /m) so only the opening greeting is ever touched.
const greet = (body, first)=> !body ? body : body.replace(/^([ \t]*)((?:Hi|Hello|Dear|Hey)\s+)?([A-Z][\w'’\-]*(?:[ \t]+[A-Z][\w'’\-]*){0,2})([ \t]*,)(?=[ \t]*(?:\r?\n|$))/, (m,ws,sal,_n,c)=> ws + (sal||'') + (first || 'there') + c);
const okStatus = (s)=> /valid|risky|catchall|catch-all|role_valid|accept|deliverable|ok/i.test(String(s||''));

// B-1 FIX [LLM-RESCUE COMMIT 1]: CANONICAL Art-14 FOOTER for the LIVE Mystrika push path.
// push-to-mystrika.js is what mystrika.yml (action=push) runs, and it pushed the RAW outreach_drafts bodies that
// render.js:179 deliberately builds WITHOUT a footer ("injected at send"). The footer therefore only ever reached
// the OFF native relay (send-due.js) and the UNUSED CSV export (mystrika-export.js) — so cold mail sent through the
// brain would have shipped with NO provenance / NO unsubscribe / NO {{privacy_notice_url}} = non-compliant (UK PECR
// / Art-14). This ports the EXACT, proven Mystrika footer logic from mystrika-export.js (single source of truth =
// src/templates/email/footer.txt, == campaigns/_footer.txt): the block ABOVE the '----' doc separator, with the
// leading bare-name line replaced by Mystrika's {{ sender }} merge token (the warmed inbox display name), the
// privacy URL filled, {{unsubscribe_url}} -> Mystrika's own {{ unsubscribe }} one-click token (reply-fallback is
// already in the copy), and the EU rep line dropped (UK/UAE). Founder-blocked {{company_number}}/{{ico_number}}/
// {{reg_address}} stay as placeholders so nothing is fabricated. SEND is OFF (no live render) until the founder
// flips it; this only makes the body the push WOULD send compliant. Cached; fail-soft (missing file -> no footer,
// never blocks). _nd strips em-dashes/hyphen-pauses to match the house style the other paths use.
const PRIVACY_NOTICE_URL = 'https://tamazia.co.uk/legal/cold-outreach-privacy-notice/';
let _nd = (x)=>x; try { _nd = require(path.resolve(ROOT, 'src', 'lib', 'gates.js')).noDashes; } catch(_) {}
let _footerCache = null;
function complianceFooter() {
  if (_footerCache == null) {
    try {
      const raw = fs.readFileSync(path.join(ROOT, 'src', 'templates', 'email', 'footer.txt'), 'utf8');
      const live = raw.split(/^-{10,}\s*$/m)[0].replace(/\s+$/, '');   // content above the doc separator
      const lines = live.split('\n');
      let i = 0; while (i < lines.length && lines[i].trim() === '') i++;
      if (i < lines.length) lines[i] = '{{ sender }}';                 // leading bare-name line -> Mystrika sender token
      _footerCache = _nd(lines.join('\n').replace(/^\n+/, '')
        .replace(/\{\{\s*privacy_notice_url\s*\}\}/g, PRIVACY_NOTICE_URL)
        .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '{{ unsubscribe }}')
        .replace(/\{\{\s*eu_rep_line\s*\}\}\n?/g, ''));
    } catch (_e) { _footerCache = ''; }
  }
  return _footerCache;
}
// Append the canonical footer to a rendered touch body. Strips any trailing __SIGNATURE__ token first (the footer
// carries the {{ sender }} signature line itself, so a separate sender step would double the name). Empty body in
// -> empty out (the existing t0-body guard already skips those). Idempotent: never double-appends the footer.
function withFooter(body) {
  const core = _nd(String(body||'').replace(/\n*__SIGNATURE__\s*$/, '').trim());
  if (!core) return core;
  const f = complianceFooter();
  if (!f) return core;
  if (core.includes(PRIVACY_NOTICE_URL)) return core;   // already footered (defensive)
  return core + '\n\n' + f;
}
// T1-B03 FAIL-CLOSED FOOTER/PLACEHOLDER GUARD. The canonical Art-14 footer (complianceFooter) deliberately
// LEAVES the founder-blocked {{reg_address}}/{{company_number}}/{{ico_number}} tokens unfilled (the values were
// never provided), and a rendered touch body can in theory also carry an un-substituted {{...}} merge token. A
// live cold email must NEVER ship literal braces — that is a broken, non-compliant footer (and a visible quality
// failure). This returns the FIRST unfilled `{{ ... }}` token found in a string (after the footer is appended),
// or '' if the text is clean. The push uses it to BLOCK (skip + log) any prospect whose final wire body still
// contains a placeholder, so a missing value fails closed (the lead is held) instead of sending raw braces.
// Mystrika's own merge tokens ({{ sender }}, {{ unsubscribe }}) are filled by Mystrika at its send time and are
// EXPECTED on the wire we hand it, so they are explicitly allow-listed and never count as "unfilled".
const MYSTRIKA_MERGE_TOKENS = new Set(['sender', 'unsubscribe', 'first_name', 'firstname', 'company', 'unsubscribe_link']);
function unfilledPlaceholder(text) {
  const s = String(text || '');
  const re = /\{\{\s*([\w.\-]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const tok = String(m[1] || '').toLowerCase();
    if (MYSTRIKA_MERGE_TOKENS.has(tok)) continue;   // Mystrika fills these at its send time — expected, not unfilled
    return m[0];                                    // a genuinely unfilled {{...}} token — fail closed
  }
  return '';
}
module.exports = { greet, firstOf, okStatus, complianceFooter, withFooter, unfilledPlaceholder };
if (require.main === module) (async()=>{
  if (!M._hasKey()) { console.log('No MYSTRIKA_API_KEY.'); return; }
  if (!NEON) { console.log('No NEON_URL'); return; }
  // A4a resilience guards — idempotent, ADDITIVE-ONLY (mirrors verify-audits.js's audit_verified guard).
  for (const ddl of ['ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_tier text','ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_score numeric','ALTER TABLE leads ADD COLUMN IF NOT EXISTS hiring_signal text','ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed boolean DEFAULT false','ALTER TABLE leads ADD COLUMN IF NOT EXISTS mystrika_pushed_at timestamptz']) { try { pg(ddl); } catch(_){} }
  const forceCampaign = arg('campaign', process.env.MYSTRIKA_CAMPAIGN_ID || '');
  // Build sector -> campaign map from the live campaigns ("Tamazia | Law Firms" etc.) for auto-routing.
  let nameToId = {};
  try { const cl = await M.listCampaigns(); const arr = (cl.data && (cl.data.data || cl.data.campaigns)) || cl.data || []; for (const c of (Array.isArray(arr)?arr:[])) nameToId[String(c.name||'').toLowerCase()] = c.id || c.campaign_id; } catch(_){}
  // Keys MUST cover every value the lead SELECT's COALESCE(sector, sector_code, filter_key) can emit. Round-3
  // added that COALESCE, which now surfaces the canonical long-form slugs (e.g. 'financial-services',
  // 'professional-services', 'beauty-wellness') written by the V3 re-tier path — not just the short forms.
  // Those long-form slugs were absent here, so campaignFor() returned null and every such prospect was
  // silently dropped at the byCamp grouping (e.g. ~50 live 'financial-services' FIT leads routed nowhere).
  // Aliases mirror src/lib/enrich/lead-quality.js + src/lib/sourcing/icp.js so routing speaks the same vocab.
  const SECTOR_CAMPAIGN = { 'law-firms':'law firms','legal':'law firms','healthcare':'healthcare','dental':'healthcare','medical':'healthcare','beauty-wellness':'healthcare','aesthetics':'healthcare','real-estate':'real estate','property':'real estate','hospitality':'f&b','restaurants':'f&b','financial':'financial','finance':'financial','financial-services':'financial','insurance':'financial','education':'education','automotive':'automotive','professional':'professional','professional-services':'professional','ecommerce':'e-commerce','ecommerce-retail':'e-commerce' };
  const campaignFor = (sector) => {
    if (forceCampaign) return forceCampaign;
    const want = SECTOR_CAMPAIGN[String(sector||'').toLowerCase()] || '';
    for (const [nm,id] of Object.entries(nameToId)) { if (want && nm.includes(want)) return id; }
    return null;
  };
  const limit = parseInt(arg('max','200'),10);
  const raw = pg(`SELECT l.id::text, COALESCE(NULLIF(l.contact_email,''), l.email, ''), regexp_replace(COALESCE(NULLIF(trim(l.first_name||' '||COALESCE(l.last_name,'')),''), l.company,'there'),'[\\t\\r\\n]',' ','g'),
      regexp_replace(COALESCE(l.company,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.domain,''), regexp_replace(COALESCE(NULLIF(l.sector,''),NULLIF(l.sector_code,''),NULLIF(l.filter_key,''),''),'[\\t\\r\\n]',' ','g'), COALESCE(l.audit_url,''),
      regexp_replace(COALESCE(l.personalisation_pointers->>'top_finding',''),'[\\t\\r\\n]',' ','g'), regexp_replace(COALESCE(l.operating_city,''),'[\\t\\r\\n]',' ','g'),
      regexp_replace(COALESCE(l.rank_insight_sentence,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.hiring_signal,''), COALESCE(l.fit_score,0), COALESCE(l.hot_score,0), CASE WHEN COALESCE(l.contact_linkedin,'')<>'' THEN '1' ELSE '0' END, CASE WHEN COALESCE(jsonb_array_length(l.decision_makers),0)>0 OR COALESCE(l.contact_name,'')<>'' THEN '1' ELSE '0' END, COALESCE(l.verify_status,''), COALESCE(l.deliverability,''), COALESCE(l.email_verified::text,''),
      replace(encode(convert_to(COALESCE(d.t0s,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t0b,''),'UTF8'),'base64'),E'\\n',''),
      replace(encode(convert_to(COALESCE(d.t1b,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t2b,''),'UTF8'),'base64'),E'\\n',''), replace(encode(convert_to(COALESCE(d.t3b,''),'UTF8'),'base64'),E'\\n',''), COALESCE(l.primary_email,''), COALESCE(l.secondary_emails::text,'[]'), COALESCE(l.quality_score,0)
    FROM leads l LEFT JOIN LATERAL (
      SELECT MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_subject END) t0s, MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_body END) t0b,
             MAX(CASE WHEN draft_metadata->>'touch'='1' THEN draft_body END) t1b, MAX(CASE WHEN draft_metadata->>'touch'='2' THEN draft_body END) t2b, MAX(CASE WHEN draft_metadata->>'touch'='3' THEN draft_body END) t3b
      FROM outreach_drafts od WHERE od.lead_id=l.id AND od.channel='email') d ON TRUE
    WHERE l.quality_fit=TRUE AND COALESCE(l.lifecycle_stage,'')='qualified' AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.audit_verified,FALSE)=TRUE AND COALESCE(l.audit_url,'') <> '' AND COALESCE(l.contact_email,l.email,'') <> '' AND COALESCE(l.mystrika_pushed,FALSE)=FALSE
      -- P6 [X9] GOVERNOR GATE: only push leads the governor has RELEASED today (per-sector 10x10 round-robin,
      -- 100/day Tier-1, reset 00:00 UK). Until now the governor cap was decorative (push ignored it, so 0/0
      -- released leads were respected). governor-release.js now runs as an engine-cycle step (P5), so the chain
      -- is qualify -> governor-release -> push. NULL = not released yet = held (the intended throttle).
      AND l.governor_released_at IS NOT NULL
      -- verify_status overloaded -> deliverability split (verify_status branch): gate on the dedicated
      -- deliverability VERDICT, falling back to verify_status when deliverability is not yet populated
      -- (backfill-safe: old rows that only have verify_status are still guarded; rows with deliverability use it).
      -- This supersedes the old plain-verify_status guard (same exclusion list, now deliverability-aware).
      AND COALESCE(NULLIF(l.deliverability,''), l.verify_status, '') NOT IN ('bad','invalid','undeliverable','no_mx','nxdomain','disposable')
      -- send-safety (outreach branch): never re-contact a replier, and skip leads whose own status already marks
      -- them suppressed/dnc/bounced/duplicate.
      AND COALESCE(l.replied,FALSE)=FALSE AND COALESCE(l.status,'') NOT IN ('suppressed','dnc','bounced','duplicate')
      -- SUPPRESSION HARD-GATE (legal opt-out, UK PECR/GDPR): the suppression table is the canonical opt-out
      -- registry (written by imap-poll on STOP + recycle.js for repliers). The lead's own status columns can
      -- lag or never reflect it (e.g. a reply matched on domain-only, or a different lead sharing the email),
      -- so a suppressed address could otherwise be re-pushed here. Enforce the registry directly on EVERY
      -- candidate primary email, scoped to live (non-expired) entries.
      AND NOT EXISTS (SELECT 1 FROM suppression sup WHERE lower(sup.email) = lower(COALESCE(NULLIF(l.primary_email,''), NULLIF(l.contact_email,''), l.email)) AND (sup.expires_at IS NULL OR sup.expires_at > NOW()))
    ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  const rows = raw.split('\n').filter(Boolean).map(r=>r.split('\t'));
  if (!rows.length) { console.log('0 new FIT leads to push (need quality_fit + qualified + audit_verified + email + not already pushed).'); return; }
  const prospects = [];
  const seenGlobal = new Set();   // 1 prospect = 1 email, deduped across the whole run
  const coveredPrimaries = new Set(); // lead-primary emails whose DM was already sent via a colliding lead this run
  // SUPPRESSION SET (legal opt-out): the lead SELECT already gates the PRIMARY email, but SECONDARY contacts are
  // pulled from secondary_emails JSON and are NEVER seen by that SELECT — a suppressed colleague address could
  // otherwise be pushed. Load the live (non-expired) opt-out list once and filter EVERY recipient (primary +
  // secondary) against it. Fail-CLOSED is impossible here (no list = we cannot prove opt-out), but the table is
  // tiny so the read is reliable; on a read failure we keep the existing per-lead gate as the safety net.
  const suppressed = new Set();
  try {
    const supRaw = pg(`SELECT lower(email) FROM suppression WHERE email IS NOT NULL AND (expires_at IS NULL OR expires_at > NOW())`);
    for (const e of String(supRaw||'').split('\n')) { const x = e.trim(); if (x) suppressed.add(x); }
  } catch(_) {}
  if (suppressed.size) console.log('suppression: loaded '+suppressed.size+' opted-out addresses (filtering all recipients)');
  for (const r of rows) {
    const [leadId,email,name,company,domain,sector,audit,finding,city,ri,hiring,fitScore,hotScore,hasLi,hasDm,verifyStatus,deliverability,emailVerified,t0s,t0b,t1b,t2b,t3b,primaryEmail,secondaryJson,qualityScore]=r;
    if (!email && !primaryEmail) continue;
    if (!audit) continue;  // touch-1 guard: never push a lead without a minted audit_url
    const t0body=b64d(t0b); if (!t0body) continue;
    // gap-fix: read the lead's REAL verification instead of hardcoding has_verified_email:true (which defeated the
    // conversion verify gate and would push unverified/bad emails). verified-good -> Tier A/B; catch-all/risky ->
    // deliverable -> Tier B; empty/pending/bad -> Tier C -> skipped (SEND_TIERS excludes C). Sending stays OFF.
    // verify_status overloaded -> deliverability split: derive via the single source of truth deliverabilityOf(),
    // which PREFERS the dedicated deliverability column and FALLS BACK to verify_status (so this is correct for
    // both backfilled rows and old rows that only have verify_status). email_verified still upgrades to verified
    // unless the verdict is confirmed-bad (the helper already lets a hard-negative verdict win over the flag).
    const _verdict = deliverabilityOf({ deliverability, verify_status: verifyStatus, email_verified: emailVerified });
    const verified = _verdict === 'verified';
    const deliverable = _verdict === 'deliverable';
    // bug-fix: the V3 re-tier path (requalify-all-leads.js) writes quality_score/total_score and leaves the LEGACY
    // fit_score/hot_score columns at 0 for ~all icp_tier=1 leads (609/614 live). conversionScore weights fit_score*0.35,
    // so a genuine Tier-1 (quality_score ~82) scored fit_score=0 -> conv tier 'C' -> EXCLUDED from SEND_TIERS -> every
    // audit-verified send-ready lead was silently dropped at this gate (0/22 passed). Fall back to the populated V3
    // quality_score when the legacy fit_score is absent, so conversion likelihood reflects real lead quality. Safe: the
    // audit_verified + verify_status gates above are unchanged; this only stops dropping already-qualified send-ready leads.
    const fitForConv = Math.max(+fitScore||0, +qualityScore||0);
    const conv=conversionScore({fit:true,fit_score:fitForConv,hot_score:+hotScore||0,has_verified_email:verified,has_deliverable_email:deliverable,decision_maker:hasDm==='1',has_linkedin:hasLi==='1',audit_verified:true,hiring_signal:hiring});
    if (!SEND_TIERS.has(conv.tier)) continue;  // only email leads we are VERY sure about (Tier A/B)
    // Build the recipient set: the DECISION-MAKER (primary) first, then verified/risky secondary contacts.
    const pe = String(primaryEmail||email||'').toLowerCase();
    // If this lead's decision-maker email was already sent via an earlier lead this run, mark it covered so the
    // lead still gets flagged pushed (otherwise it would re-send its secondaries every run).
    if (pe && seenGlobal.has(pe)) coveredPrimaries.add(pe);
    const recips = [];
    if (pe && !suppressed.has(pe)) recips.push({ email: pe, name: name||'', isPrimary: true });
    let secs=[]; try { secs = JSON.parse(secondaryJson||'[]'); } catch(_){}
    for (const s of secs) {
      const se=String(s.email||'').toLowerCase();
      if (!se || !/@/.test(se)) continue;
      if (suppressed.has(se)) continue;                                     // opted-out colleague — never contact
      if (!(s.verified || okStatus(s.verify_status||s.status))) continue;   // only deliverable secondaries
      recips.push({ email: se, name: s.name||'', role: s.role||'', isPrimary: false });
      if (recips.length >= PER_COMPANY) break;
    }
    for (const rc of recips) {
      if (!rc.email || seenGlobal.has(rc.email)) continue; seenGlobal.add(rc.email);
      if (suppressed.has(rc.email)) continue;   // belt-and-suspenders: never push an opted-out address
      const first = firstOf(rc.name);
      // B-1 FIX: append the canonical Art-14 footer to EVERY rendered touch body so the LIVE Mystrika wire carries
      // provenance + the {{ unsubscribe }} one-click token + {{privacy_notice_url}}. The greeting swap (secondary
      // recipients) runs on the CORE body first; the footer is appended after so its {{ sender }} line is never
      // mangled by the name swap. Touch-0 keeps the same shape (primary = un-greet-swapped, secondary = swapped).
      prospects.push({ email: rc.email, name: rc.name||name||'there', company, domain, sector, audit_url: audit, top_finding: finding, city,
        rank_insight: ri, hiring_signal: hiring, conversion_tier: conv.tier, conversion_score: conv.score,
        touch0_subject: b64d(t0s), touch0_body: withFooter(rc.isPrimary ? t0body : greet(t0body, first)),
        touch1_body: withFooter(rc.isPrimary ? b64d(t1b) : greet(b64d(t1b), first)), touch2_body: withFooter(rc.isPrimary ? b64d(t2b) : greet(b64d(t2b), first)), touch3_body: withFooter(rc.isPrimary ? b64d(t3b) : greet(b64d(t3b), first)),
        is_primary: rc.isPrimary, lead_primary: pe, lead_id: Number(leadId) || null });
    }
  }
  // TOUCH-1 CORRECTNESS GUARD: assert each prospect's audit_url (slug,hash) maps to ITS OWN domain in audit_pages.
  // Guarantees an email can never carry another firm's audit (slug-collision / cross-bind guard). Skips + logs on mismatch.
  {
    const parsed = prospects.map(p => { const m = String(p.audit_url||'').match(/\/audit\/([^\/?#]+)\/([^\/?#]+)/); return m ? { slug:m[1], hash:m[2] } : null; });
    const pairs = [...new Set(parsed.filter(Boolean).map(x => `('${x.slug.replace(/'/g,"''")}','${x.hash.replace(/'/g,"''")}')`))];
    const pageDomain = {};
    if (pairs.length) {
      const out = pg(`SELECT slug, hash, domain FROM audit_pages WHERE (slug,hash) IN (${pairs.join(',')})`);
      for (const ln of out.split('\n').filter(Boolean)) { const [sl,h,dom] = ln.split('\t'); pageDomain[sl+'/'+h] = (dom||'').toLowerCase().trim(); }
    }
    const kept = [];
    for (let i = 0; i < prospects.length; i++) {
      const p = prospects[i], pr = parsed[i];
      if (!pr) { console.log('  SKIP (guard): unparseable audit_url for '+p.email+' ['+p.audit_url+']'); continue; }
      const dom = pageDomain[pr.slug+'/'+pr.hash];
      if (!dom) { console.log('  SKIP (guard): audit_pages row missing for '+p.email+' ('+pr.slug+'/'+pr.hash+')'); continue; }
      const leadDom = String(p.domain||'').toLowerCase().trim();
      if (dom !== leadDom) { console.log('  SKIP (guard): domain mismatch for '+p.email+' lead='+leadDom+' audit_page='+dom+' ('+pr.slug+'/'+pr.hash+')'); continue; }
      kept.push(p);
    }
    const dropped = prospects.length - kept.length;
    if (dropped) console.log('touch-1 guard: dropped '+dropped+'/'+prospects.length+' prospects; '+kept.length+' verified domain<->slug');
    else console.log('touch-1 guard: all '+prospects.length+' prospects passed domain<->slug assertion');
    prospects.length = 0; prospects.push(...kept);
  }
  // T1-B03 FAIL-CLOSED FOOTER GUARD: assert NO prospect's wire bodies (subject + every touch body, footer already
  // appended) still carry an unfilled {{...}} placeholder. The founder-blocked footer values
  // ({{reg_address}}/{{company_number}}/{{ico_number}}) are deliberately left unfilled, so without this a live send
  // would print literal braces = a broken, non-compliant Art-14 footer. Fail CLOSED: skip + log the offending lead
  // (its primary stays mystrika_pushed=FALSE so it is reconsidered once the value is provided) rather than ship
  // raw braces. Mystrika's own merge tokens ({{ sender }}/{{ unsubscribe }}) are allow-listed (filled by Mystrika).
  {
    const kept = [];
    for (const p of prospects) {
      const fields = [p.touch0_subject, p.touch0_body, p.touch1_body, p.touch2_body, p.touch3_body];
      let bad = '';
      for (const f of fields) { bad = unfilledPlaceholder(f); if (bad) break; }
      if (bad) { console.log('  SKIP (footer guard): footer placeholders unfilled, blocked — '+p.email+' ('+(p.company||p.domain||'?')+') token='+bad); continue; }
      kept.push(p);
    }
    const dropped = prospects.length - kept.length;
    if (dropped) console.log('footer guard: dropped '+dropped+'/'+prospects.length+' prospects with unfilled {{...}} placeholders (fail-closed); '+kept.length+' clean');
    else console.log('footer guard: all '+prospects.length+' prospects clean (no unfilled placeholders)');
    prospects.length = 0; prospects.push(...kept);
  }
  // group by sector campaign
  const byCamp = {};
  for (const p of prospects) { const cid = campaignFor(p.sector); if (!cid) { continue; } (byCamp[cid] = byCamp[cid] || []).push(p); }
  const totalRouted = Object.values(byCamp).reduce((a,x)=>a+x.length,0);
  prospects.sort((a,b)=>(b.conversion_score||0)-(a.conversion_score||0));  // SEND BEST FIRST
  const tierA=prospects.filter(p=>p.conversion_tier==='A').length;
  console.log('Routing '+totalRouted+'/'+prospects.length+' prospects ('+tierA+' Tier-A) across '+Object.keys(byCamp).length+' sector campaigns'+(DRY?' (DRY)':'')+' ...');
  if (DRY) { for (const [cid,ps] of Object.entries(byCamp)) console.log('  campaign '+cid+': '+ps.length+' prospects (e.g. '+(ps[0]||{}).company+')'); return; }
  let pushedProspects = [];
  for (const [cid, ps] of Object.entries(byCamp)) {
    const res = await M.addProspects(cid, ps, true);
    console.log('  -> '+cid+': ok='+res.ok+' added='+res.added+' batches='+res.ok_batches+'/'+res.batches);
    // Tag each prospect with the campaign it was actually accepted into so the sends-log row records it.
    if (res.ok) { for (const p of ps) p._campaign_id = cid; pushedProspects = pushedProspects.concat(ps); }
  }
  // SEND-ATTRIBUTION (canonical sends log): write ONE `sends` row per prospect Mystrika accepted, attributed to
  // its lead_id. Without this the Mystrika send brain was invisible in `sends` (per-source/per-sector dashboards
  // grouped every Mystrika send as "unknown" because lead_id was NULL) and reply-matching by Message-ID/recipient
  // had no row to hit. lead_id is REQUIRED (guard non-integer ids, skip rather than orphan the row). message_id is a
  // deterministic, namespaced id we control (Mystrika assigns its own at actual send; recipient-match M2 + lead-email
  // M3 in match-inbound-replies.js still resolve replies, and this id makes each row uniquely traceable). Per-recipient
  // (one prospect = one mailbox = one send), touch 0 (the push enqueues touch-0). Idempotent via ON CONFLICT-free
  // existence guard on (lead_id, recipient, touch) so a re-run never double-logs. Fail-soft per row; never blocks.
  let logged = 0, logSkipped = 0;
  for (const p of pushedProspects) {
    const leadIdNum = Number(p.lead_id);
    if (!Number.isInteger(leadIdNum) || leadIdNum <= 0) { logSkipped++; continue; } // never orphan reporting with a junk id
    const recip = String(p.email || '').toLowerCase();
    if (!recip) { logSkipped++; continue; }
    const msgId = `mystrika-${String(p._campaign_id || '')}-${leadIdNum}-t0@tamazia`.replace(/[^A-Za-z0-9@._-]/g, '');
    try {
      pg(`INSERT INTO sends (lead_id, recipient, subject, subject_used, message_id, relay_used, relay_name, sent_at, status, delivery_status, touch_number, kind, sector, jurisdiction)
          SELECT ${leadIdNum}, ${pgEsc(recip)}, ${pgEsc(p.touch0_subject||'')}, ${pgEsc(p.touch0_subject||'')}, ${pgEsc(msgId)}, 'mystrika', 'mystrika', NOW(), 'sent', 'queued', 0, 'cold', NULLIF(l.sector,''), NULLIF(l.jurisdiction,'')
          FROM leads l WHERE l.id=${leadIdNum}
          AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.lead_id=${leadIdNum} AND lower(s.recipient)=${pgEsc(recip)} AND COALESCE(s.touch_number,0)=0 AND s.relay_name='mystrika')`);
      logged++;
    } catch (_) { logSkipped++; }
  }
  console.log(`sends-log: wrote ${logged} attributed rows (lead_id set), skipped ${logSkipped}`);
  // Mark a LEAD pushed once ANY of its prospects (primary OR secondary) went out, OR its DM email was already
  // sent via a colliding lead this run. Prevents re-selecting + re-sending the same secondaries next run.
  const pushedPrimaries = [...new Set([...pushedProspects.map(p=>p.lead_primary).filter(Boolean), ...coveredPrimaries])];
  // P3 [X12]: stamp first_contacted_at when a lead is first handed to Mystrika (the push enqueues touch-0, so this
  // IS its first contact). COALESCE so a re-push / recycle never overwrites the original date. recycle.js parks
  // no-reply leads at first_contacted_at + NOREPLY_DAYS, so without this the park step is dead (live: 0 stamped).
  if (pushedPrimaries.length) { const emails = pushedPrimaries.map(e=>"'"+String(e).replace(/'/g,"''")+"'").join(','); pg(`UPDATE leads SET mystrika_pushed=TRUE, mystrika_pushed_at=NOW(), first_contacted_at=COALESCE(first_contacted_at, NOW()) WHERE lower(COALESCE(NULLIF(primary_email,''),NULLIF(contact_email,''),email)) IN (${emails})`); }
  console.log('pushed '+pushedProspects.length+' prospects ('+pushedProspects.filter(p=>p.is_primary).length+' primary + '+pushedProspects.filter(p=>!p.is_primary).length+' secondary); marked '+pushedPrimaries.length+' leads mystrika_pushed=TRUE');
})().catch(e=>{ console.error('push error (non-fatal):',e.message); process.exit(0); });
