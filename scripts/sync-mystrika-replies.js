#!/usr/bin/env node
'use strict';
// Reply-sync (poll): pull prospect statuses from active Mystrika campaigns and reflect them in Neon — mark
// replied/interested/meeting_booked, pause further touches (send-guards already stop on replied=TRUE).
// Self-healing, idempotent. Usage: node scripts/sync-mystrika-replies.js  (uses MYSTRIKA_API_KEY).
const { execFileSync } = require('child_process');
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'src', 'lib', 'mystrika', 'client.js'));
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
function pg(sql){ try { return execFileSync(path.join(__dirname,'psql'),[NEON,'-tA','-c',sql],{encoding:'utf8'}); } catch(_){ return ''; } }
const q = (s)=>String(s==null?'':s).replace(/'/g,"''");
const REPLIED = new Set(['replied','interested','meeting_booked','closed','out_of_office','not_interested','wrong_person']);
// Hard opt-out statuses: stop the cadence AND write the address to the canonical suppression registry so the
// person is never contacted again from ANY campaign/relay (legal opt-out line, UK PECR/GDPR). 'unsubscribed'
// was previously absent from REPLIED, so a Mystrika unsubscribe only updated mystrika_status — it did NOT halt
// the cadence or suppress, leaving the lead 'qualified' and re-pushable. 'wrong_person' suppresses the wrong
// address too (we must not keep mailing someone who told us they are not the contact).
const SUPPRESS = new Set(['unsubscribed','wrong_person']);
(async()=>{
  if (!M._hasKey()) { console.log('No MYSTRIKA_API_KEY.'); return; }
  if (!NEON) { console.log('No NEON_URL.'); return; }
  const cl = await M.listCampaigns();
  if (!cl.ok) { console.log('campaigns/list failed: '+(cl.error||cl.status)); return; }
  const camps = Array.isArray(cl.data) ? cl.data : (cl.data && (cl.data.campaigns || cl.data.data)) || [];
  let synced = 0, replied = 0, suppressedN = 0;
  for (const c of camps) {
    const cid = c.campaign_id || c.id || c._id; if (!cid) continue;
    if (c.active === false && !c.has_replies) { /* still poll; replies can arrive after pause */ }
    const pl = await M.listProspects(cid);
    if (!pl.ok) continue;
    const ps = Array.isArray(pl.data) ? pl.data : (pl.data && (pl.data.prospects || pl.data.data)) || [];
    for (const p of ps) {
      const email = (p.email||'').toLowerCase(); const st = (p.status||'').toLowerCase(); if (!email || !st) continue;
      synced++;
      if (SUPPRESS.has(st)) { suppressedN++; replied++;
        // Hard opt-out: halt cadence (replied=TRUE + lifecycle replied) AND record in the suppression registry
        // (idempotent via the UNIQUE(email) constraint) so no future campaign or relay can ever re-contact them.
        pg(`UPDATE leads SET replied=TRUE, last_reply_received_at=COALESCE(last_reply_received_at,NOW()), lifecycle_stage='replied', status='suppressed', mystrika_status='${q(st)}', updated_at=NOW() WHERE lower(COALESCE(contact_email,email))='${q(email)}'`);
        pg(`INSERT INTO suppression (email, domain, reason, scope, notes, suppressed_at) VALUES ('${q(email)}', '${q(email.split('@').pop())}', 'mystrika_${q(st)}', 'all', 'mystrika reply-sync auto-suppress', NOW()) ON CONFLICT (email) DO NOTHING`);
      } else if (REPLIED.has(st)) { replied++;
        pg(`UPDATE leads SET replied=TRUE, last_reply_received_at=COALESCE(last_reply_received_at,NOW()), lifecycle_stage='replied', mystrika_status='${q(st)}', updated_at=NOW() WHERE lower(COALESCE(contact_email,email))='${q(email)}'`);
      } else {
        pg(`UPDATE leads SET mystrika_status='${q(st)}', updated_at=NOW() WHERE lower(COALESCE(contact_email,email))='${q(email)}'`);
      }
    }
  }
  console.log('mystrika reply-sync: campaigns='+camps.length+' prospects_synced='+synced+' replied/engaged='+replied+' suppressed='+suppressedN);
})().catch(e=>{ console.error('sync error (non-fatal):',e.message); process.exit(0); });
