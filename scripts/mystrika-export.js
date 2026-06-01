#!/usr/bin/env node
// EXPORT TO MYSTRIKA · Phase 2->3 bridge. The engine sources, scores, FIT-gates, builds the audit page,
// renders the gated 4-touch cadence, and hands Mystrika a CSV. Mystrika sends from the 30 inboxes and holds replies.
//
// Two ways to personalise in Mystrika (both shipped in the CSV):
//   A) FOOLPROOF (recommended): use the fully-rendered, gated bodies. Per campaign step set:
//        Subject: {{ touch0_subject }}   Body: {{ touch0_body }}  then a new line  {{ sender }}
//      Step 2 -> touch1_*, Step 3 -> touch2_*, Step 4 -> touch3_* (leave the follow-up Subjects blank to thread).
//      The body is already curated, ranking-aware, gated and dash-free; the only Mystrika token is {{ sender }}
//      (the sending alias's name), kept OUTSIDE the body so a single-pass merge can never leave a nested tag.
//   B) DATA columns: build your own Mystrika prose with {{ rank_insight }}, {{ keyword_1 }}:{{ position_1 }},
//      {{ competitor_1 }}, {{ audit_url }}, {{ city }}, {{ company }}, {{ first_name }}, {{ sender }}.
// Mystrika maps every CSV column header to a {{ header }} variable; {{ recipient }} {{ fname }} {{ lname }}
// {{ fullname }} {{ sender }} are Mystrika's built-ins.
//
// Output:
//   exports/mystrika-YYYYMMDDHHMM.csv         email-ready FIT leads  -> upload to a Mystrika campaign
//   exports/mystrika-YYYYMMDDHHMM-social.csv  LinkedIn/Instagram-only FIT leads -> manual outreach
// Only FIT-qualified leads are exported. FIT = (regulated OR compliance-gap) AND seo-gap AND ad-runner.
// Usage: node scripts/mystrika-export.js [LIMIT]   (default 1000)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (e) { return ''; } }
function csv(v) { const s = v == null ? '' : String(v); return '"' + s.replace(/"/g, '""') + '"'; }
let _nd = (x) => x; try { _nd = require(path.resolve(__dirname, '..', 'src', 'lib', 'gates.js')).noDashes; } catch (_) {}
function _pos(k) { return k && k.my_position ? '#' + k.my_position : 'outside the top 100'; }
function dec(b) { try { return Buffer.from(b || '', 'base64').toString('utf8'); } catch (_) { return ''; } }
// strip the signature token (+ any preceding blank lines); the Mystrika template appends {{ sender }} as its own line
function body(b) { return _nd(dec(b).replace(/\n*__SIGNATURE__\s*$/,'').trim()); }
function subj(b) { return _nd(dec(b).replace(/[\t\r\n]+/g,' ').trim()); }

const HEADERS = ['email','first_name','last_name','company','website','sector','audit_url','finding','linkedin','instagram','rank_insight','keyword_1','position_1','competitor_1','keyword_2','position_2','keyword_3','position_3','blog_title','city','touch0_subject','touch0_body','touch1_subject','touch1_body','touch2_subject','touch2_body','touch3_subject','touch3_body'];

(async () => {
  const limit = Number(process.argv[2] || 1000);
  const raw = pg(`
    SELECT COALESCE(NULLIF(l.contact_email,''), l.email, ''),
           COALESCE(l.first_name,''), COALESCE(l.last_name,''),
           regexp_replace(COALESCE(l.company,''),'[\\t\\r\\n]',' ','g'),
           COALESCE(l.domain,''), COALESCE(l.sector,''), COALESCE(l.audit_url,''),
           regexp_replace(COALESCE(l.personalisation_pointers->>'top_finding',''),'[\\t\\r\\n]',' ','g'),
           COALESCE(l.linkedin_url,''), COALESCE(l.instagram_handle,''),
           regexp_replace(COALESCE(l.rank_insight_sentence,''),'[\\t\\r\\n]',' ','g'),
           COALESCE(l.rank_insight::text,'{}'), COALESCE(l.operating_city,''),
           replace(encode(convert_to(COALESCE(d.t0s,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t0b,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t1s,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t1b,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t2s,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t2b,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t3s,''),'UTF8'),'base64'), E'\\n',''),
           replace(encode(convert_to(COALESCE(d.t3b,''),'UTF8'),'base64'), E'\\n','')
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_subject END) t0s,
             MAX(CASE WHEN draft_metadata->>'touch'='0' THEN draft_body    END) t0b,
             MAX(CASE WHEN draft_metadata->>'touch'='1' THEN draft_subject END) t1s,
             MAX(CASE WHEN draft_metadata->>'touch'='1' THEN draft_body    END) t1b,
             MAX(CASE WHEN draft_metadata->>'touch'='2' THEN draft_subject END) t2s,
             MAX(CASE WHEN draft_metadata->>'touch'='2' THEN draft_body    END) t2b,
             MAX(CASE WHEN draft_metadata->>'touch'='3' THEN draft_subject END) t3s,
             MAX(CASE WHEN draft_metadata->>'touch'='3' THEN draft_body    END) t3b
      FROM outreach_drafts od WHERE od.lead_id = l.id AND od.channel='email'
    ) d ON TRUE
    WHERE l.quality_fit = TRUE
      AND COALESCE(l.lifecycle_stage,'') = 'qualified'
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(l.audit_verified, FALSE) = TRUE  -- AUDIT GUARANTEE: only export leads whose audit link is verified live (verify-audits.js)
    ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  const rows = raw.split('\n').filter(Boolean).map(r => r.split('\t'));
  if (!rows.length) { console.log('mystrika-export · 0 FIT leads ready (need quality_fit=TRUE, lifecycle=qualified).'); return; }
  const emailRows = [], socialRows = [];
  for (const r of rows) {
    const [email, first, last, company, domain, sector, audit, finding, li, ig, riSentence, riJson, city,
           t0s, t0b, t1s, t1b, t2s, t2b, t3s, t3b] = r;
    let ri = {}; try { ri = JSON.parse(riJson || '{}'); } catch (_) {}
    const kw = ri.keywords || [];
    const bT0 = body(t0b);
    const cols = [
      email, first, last, company, domain, sector, audit, _nd(finding), li, ig,
      _nd(riSentence),
      kw[0] ? kw[0].keyword : '', kw[0] ? _pos(kw[0]) : '', kw[0] ? (kw[0].leader || '') : '',
      kw[1] ? kw[1].keyword : '', kw[1] ? _pos(kw[1]) : '',
      kw[2] ? kw[2].keyword : '', kw[2] ? _pos(kw[2]) : '',
      _nd(ri.blog_offer || ''), city,
      subj(t0s), bT0, subj(t1s), body(t1b), subj(t2s), body(t2b), subj(t3s), body(t3b),
    ];
    const line = cols.map(csv).join(',');
    // FOOLPROOF: only email-export a lead that has a real rendered Touch-0 body (never ship an empty email).
    if (email && bT0) emailRows.push(line); else if (li || ig) socialRows.push(line);
  }
  const dir = path.join(ROOT, 'exports'); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T-]/g,'');
  const header = HEADERS.map(csv).join(',');
  if (emailRows.length) fs.writeFileSync(path.join(dir, `mystrika-${stamp}.csv`), header + '\n' + emailRows.join('\n') + '\n');
  if (socialRows.length) fs.writeFileSync(path.join(dir, `mystrika-${stamp}-social.csv`), header + '\n' + socialRows.join('\n') + '\n');
  console.log(`mystrika-export · ${emailRows.length} email-ready FIT leads, ${socialRows.length} social-only → exports/mystrika-${stamp}*.csv`);
})().catch(e => { console.error('[mystrika-export] FATAL', e.message); process.exit(1); });
