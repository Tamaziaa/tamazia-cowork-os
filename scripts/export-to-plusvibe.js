#!/usr/bin/env node
// EXPORT TO PLUSVIBE · the $37-plan (no-API) workaround. Our engine does ALL the intelligence
// (source → scrape 10 params → score → audit → render 7 personalised touches); PlusVibe only sends +
// warms + holds the reply inbox. Since the $37 Personal plan has NO API, we hand leads to PlusVibe as
// a CSV the user uploads to one campaign.
//
// HOW THE FULLY-PERSONALISED COPY SURVIVES (no templating loss): each lead's 7 rendered touches are
// written as CSV columns touch0_subject..touch6_body. In PlusVibe you build ONE 7-step sequence whose
// step N is literally subject={{touchN_subject}} / body={{touchN_body}}. PlusVibe merges the per-lead
// column, so every recipient gets the exact body our engine rendered (named contact, real audit hook).
//
// Output: exports/plusvibe-YYYYMMDDHHMM.csv  (download it, upload to a PlusVibe campaign).
// Only leads queued (status touch_0_queued), with an email, and all 7 touches are exported.
// Social-only leads (email hidden) go to a separate *-social.csv for LinkedIn/Instagram outreach.
//
// Robustness: draft subject/body contain newlines, so they're base64-encoded in SQL and decoded in JS
// (avoids row/field-separator corruption). Usage: node scripts/export-to-plusvibe.js [LIMIT]  (default 600)

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
function pg(sql) { try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString(); } catch (e) { return ''; } }
function csv(v) { const s = v == null ? '' : String(v); return '"' + s.replace(/"/g, '""') + '"'; }
const b64d = s => { try { return Buffer.from(s || '', 'base64').toString('utf8'); } catch { return ''; } }
// NB: Postgres encode(...,'base64') wraps at 76 chars with newlines — strip them so each field is one line.
const e64 = col => `replace(encode(convert_to(COALESCE(${col},''),'UTF8'),'base64'), E'\\n', '')`;

const TOUCHES = [0, 1, 2, 3, 4, 5, 6];
// Native-template merge variables (recommended PlusVibe method) + whole-body columns (fallback).
const HEADERS = ['email', 'first_name', 'last_name', 'company_name', 'domain', 'sector', 'quality_score', 'linkedin', 'instagram', 'all_emails', 'phone', 'audit_url', 'audit_finding', 'sender_email', 'sender_persona',
  ...TOUCHES.flatMap(t => [`touch${t}_subject`, `touch${t}_body`])];
// Persona assignment must match render.js (deterministic id % roster). sender_email pins the inbox in the sequencer.
let _roster = null;
function roster() { if (_roster) return _roster; try { _roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'maildeck-roster.json'), 'utf8')).mailboxes || []; } catch { _roster = []; } return _roster; }
function persona(id) { const r = roster(); if (!r.length) return { email: '', name: '' }; const p = r[Math.abs(Number(id) || 0) % r.length]; return { email: p.address, name: `${p.first_name} ${p.last_name}` }; }

(async () => {
  const limit = Number(process.argv[2] || 600);
  // base lead fields (all single-line, tab-safe)
  const raw = pg(`
    SELECT l.id::text, COALESCE(NULLIF(l.contact_email,''), l.email, ''), COALESCE(l.first_name,''), COALESCE(l.last_name,''),
           regexp_replace(COALESCE(l.company,''),'[\\t\\r\\n]',' ','g'), COALESCE(l.domain,''), COALESCE(l.sector,''), COALESCE(l.quality_score::text,''),
           COALESCE(l.linkedin_url,''), COALESCE(l.instagram_handle,''), regexp_replace(COALESCE(l.all_emails::text,'[]'),'[\\t\\r\\n]',' ','g'), COALESCE(l.phone,''), COALESCE(l.audit_url,''),
           regexp_replace(COALESCE(l.personalisation_pointers->0->>'fact',''),'[\\t\\r\\n]',' ','g')
    FROM leads l
    WHERE l.status='touch_0_queued'
      AND COALESCE(l.lead_type,'') NOT IN ('investor','institution','internal')
      AND (SELECT COUNT(*) FROM outreach_drafts od WHERE od.lead_id=l.id AND od.channel='email')>=7
    ORDER BY COALESCE(l.quality_score,0) DESC NULLS LAST, l.id DESC LIMIT ${limit}`);
  const baseRows = raw.split('\n').filter(Boolean).map(r => r.split('\t'));
  if (!baseRows.length) { console.log('export-to-plusvibe · 0 ready leads (need status=touch_0_queued + 7 touches).'); return; }
  const ids = baseRows.map(r => r[0]).filter(x => /^\d+$/.test(x));
  if (!ids.length) { console.log('export-to-plusvibe · no valid lead ids.'); return; }

  // drafts: subject/body base64-encoded (they contain newlines)
  const draftsRaw = pg(`SELECT lead_id::text, draft_metadata->>'touch', ${e64('draft_subject')}, ${e64('draft_body')} FROM outreach_drafts WHERE channel='email' AND lead_id IN (${ids.join(',')})`);
  const drafts = {};
  for (const line of draftsRaw.split('\n').filter(Boolean)) { const [lid, t, subj, body] = line.split('\t'); (drafts[lid] = drafts[lid] || {})[t] = { subj: b64d(subj), body: b64d(body) }; }

  const emailRows = [], socialRows = [];
  for (const r of baseRows) {
    const [id, email, first, last, company, domain, sector, score, li, ig, allEmails, phone, audit, finding] = r;
    if (!/^\d+$/.test(id)) continue;
    const pers = persona(id);
    const base = [email, first, last, company, domain, sector, score, li, ig, allEmails, phone, audit, finding, pers.email, pers.name];
    const touchCells = TOUCHES.flatMap(t => { const d = (drafts[id] || {})[String(t)] || {}; return [d.subj || '', d.body || '']; });
    const row = [...base, ...touchCells].map(csv).join(',');
    if (email) emailRows.push(row); else if (li || ig) socialRows.push(row);
  }

  const dir = path.join(ROOT, 'exports'); fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '');
  const header = HEADERS.map(csv).join(',');
  const emailFile = path.join(dir, `plusvibe-${stamp}.csv`);
  fs.writeFileSync(emailFile, header + '\n' + emailRows.join('\n') + '\n');
  let socialFile = null;
  if (socialRows.length) { socialFile = path.join(dir, `plusvibe-${stamp}-social.csv`); fs.writeFileSync(socialFile, header + '\n' + socialRows.join('\n') + '\n'); }

  console.log(`export-to-plusvibe · ${emailRows.length} email-ready leads → ${emailFile}`);
  if (socialFile) console.log(`export-to-plusvibe · ${socialRows.length} social-only leads → ${socialFile} (LinkedIn/Instagram outreach)`);
  console.log('Upload the email CSV to a PlusVibe campaign; build a 7-step sequence using {{touch0_subject}}/{{touch0_body}} ... {{touch6_subject}}/{{touch6_body}}.');
})().catch(e => { console.error('[export-to-plusvibe] FATAL', e.message); process.exit(1); });
