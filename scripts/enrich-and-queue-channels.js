#!/usr/bin/env node
// Enrichment waterfall runner. For a batch of leads:
//   1. Enrich via free waterfall (website, emails, linkedin, instagram, best_channel)
//   2. Persist to leads (website, contact_email, linkedin_url, instagram_handle, best_channel)
//   3. If best_channel is linkedin/instagram → queue a Touch-0 manual-send message in channel_sends
//      (surfaces in the admin dashboard's Pending LinkedIn / Pending Instagram tabs).
//   4. Email-channel leads flow into the normal S063/S065 email pipeline (unchanged).
//
// Usage: node scripts/enrich-and-queue-channels.js [LIMIT]   default 10

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
(() => { try { const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch (_e) {} })();
const { enrichLead } = require(path.join(ROOT, 'src', 'lib', 'enrich', 'waterfall.js'));

function pg(sql, params) {
  // params inlined safely for the shim
  return execFileSync(path.join(ROOT, 'scripts', 'psql'), [process.env.NEON_URL, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim();
}
const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

// Per-channel Touch-0 templates. Short, human, no automation tells. Touch 1-3 generated on send.
function linkedinTouch0({ company, first }) {
  return `Hi${first ? ' ' + first : ''} — I lead Tamazia, a lawyer-led SEO + compliance firm for regulated brands. I was looking at ${company} and had one specific observation about how your campaigns sit against current UK advertising rules. Worth a quick connect?`;
}
function instagramTouch0({ company }) {
  return `Hi — really like what ${company} is doing. I run Tamazia (lawyer-led SEO + compliance for regulated brands). Spotted one quick thing on your marketing worth flagging — ok if I send it over?`;
}

(async () => {
  const limit = Number(process.argv[2] || 10);
  // Pick leads that lack contact data and aren't internal/test/lexquity
  const raw = pg(`
    SELECT id::text, company, COALESCE(domain,''), COALESCE(first_name,'')
    FROM leads
    WHERE COALESCE(lead_type,'') NOT IN ('investor','institution','internal')
      AND COALESCE(sector,'') NOT IN ('lexquity-investor','arbitration-institution','arbitration-practitioner','professional-services','internal')
      AND COALESCE(company,'') NOT ILIKE 'Test %' AND COALESCE(company,'') NOT ILIKE 'Tamazia%'
      AND COALESCE(company,'') NOT ILIKE '%arbitration%' AND COALESCE(company,'') NOT ILIKE '%(ICC)%'
      AND COALESCE(best_channel,'') = ''
      AND COALESCE(contact_email,'') = ''
    ORDER BY priority_score DESC NULLS LAST, id DESC
    LIMIT ${limit}`);
  const leads = raw.split('\n').filter(Boolean).map(l => { const [id, company, domain, first] = l.split('\t'); return { id: Number(id), company, domain, first }; });
  console.log(`Enriching ${leads.length} leads via free waterfall...`);

  let emailCh = 0, liCh = 0, igCh = 0, none = 0;
  for (const lead of leads) {
    let r;
    try { r = await enrichLead({ company: lead.company, domain: lead.domain }); }
    catch (e) { console.log(`  ${lead.company}: ERROR ${e.message}`); continue; }

    // Pick the best contact: highest-confidence personal (named) email, else first generic
    const contacts = r.contacts || [];
    const named = contacts.filter(c => c.type === 'personal' && c.first_name).sort((a, b) => b.confidence - a.confidence);
    const best = named[0] || contacts[0] || null;
    const email = best ? best.email : '';
    const fn = best ? best.first_name : '';
    const ln = best ? best.last_name : '';
    const title = best ? best.position : '';
    // bug-fix(round-5): the scorer's contact-quality signal reads contact_name (lead-quality.js dmName =
    // decision_maker_name||contact_name||dm_name||full_name) and NEVER first_name/last_name. This live enrich path
    // wrote fn/ln but left contact_name NULL, so a named DM found by the waterfall was INVISIBLE to qualify —
    // depressing contact_quality_score and the named-DM count (64 leads sit with first/last set but contact_name
    // empty, 55 of them Tier-1/2). Compose contact_name from a real first+last so the found person actually counts.
    const cn = (fn && ln) ? `${fn} ${ln}`.replace(/\s+/g, ' ').trim() : '';
    const igHandle = r.instagram ? r.instagram.replace(/.*instagram\.com\//, '').replace(/\/$/, '') : '';
    // Persist EVERYTHING found: all emails (named, scored) + all socials
    const allEmails = JSON.stringify(contacts);
    const allSocials = JSON.stringify({ linkedin: r.linkedin || '', instagram: r.instagram || '' });
    pg(`UPDATE leads SET all_emails=${esc(allEmails)}::jsonb, all_socials=${esc(allSocials)}::jsonb WHERE id=${lead.id}`);
    pg(`UPDATE leads SET website=${esc(r.website)},
        contact_email=CASE WHEN ${esc(email)}='' THEN contact_email ELSE ${esc(email)} END,
        first_name=CASE WHEN ${esc(fn)}='' THEN first_name ELSE ${esc(fn)} END,
        last_name=CASE WHEN ${esc(ln)}='' THEN last_name ELSE ${esc(ln)} END,
        contact_name=CASE WHEN ${esc(cn)}='' THEN contact_name ELSE ${esc(cn)} END,
        title=CASE WHEN ${esc(title)}='' THEN title ELSE ${esc(title)} END,
        linkedin_url=${esc(r.linkedin)}, instagram_handle=${esc(igHandle)}, best_channel=${esc(r.best_channel)},
        lifecycle_stage=CASE WHEN lifecycle_stage IN ('sourced','enriched') THEN 'enriched' ELSE lifecycle_stage END, updated_at=NOW()
        WHERE id=${lead.id}`);

    if (r.best_channel === 'linkedin') {
      const msg = linkedinTouch0({ company: lead.company, first: lead.first });
      pg(`INSERT INTO channel_sends (lead_id, channel, touch, message_text, status) VALUES (${lead.id}, 'linkedin', 0, ${esc(msg)}, 'pending') ON CONFLICT (lead_id, channel, touch) DO NOTHING`);
      liCh++;
    } else if (r.best_channel === 'instagram') {
      const msg = instagramTouch0({ company: lead.company });
      pg(`INSERT INTO channel_sends (lead_id, channel, touch, message_text, status) VALUES (${lead.id}, 'instagram', 0, ${esc(msg)}, 'pending') ON CONFLICT (lead_id, channel, touch) DO NOTHING`);
      igCh++;
    } else if (r.best_channel === 'email') { emailCh++; }
    else { none++; }
    console.log(`  ${lead.company.padEnd(34)} → ${r.best_channel}  ${r.website ? '· ' + r.website : ''}${email ? ' · ' + email : ''}`);
    await new Promise(z => setTimeout(z, 800));
  }
  console.log(`\nDone. email-channel: ${emailCh} (→ email pipeline) · linkedin queued: ${liCh} · instagram queued: ${igCh} · no-contact: ${none}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
