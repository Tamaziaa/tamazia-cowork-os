#!/usr/bin/env node
'use strict';
// REPLY MATCHING · attach each inbound_emails row to the lead it belongs to so per-lead / per-sector
// reply tracking works (gen-state's "replied" count reads inbound_emails WHERE matched_lead_id IS NOT NULL).
//
// Confidence waterfall — highest precision first, NEVER guess. A wrong attribution is worse than a NULL.
//   M1  in_reply_to / references header  -> a sends.message_id we sent          -> that send's lead_id  (best)
//        (also tries outreach_drafts.draft_metadata->>'rfc_message_id' / 'relay_email_id', the new touch flow)
//   M2  inbound.from_email (normalised)  === a sends.recipient we sent to        -> that send's lead_id
//   M3  inbound.from_email               === a leads.contact_email/email/primary_email / any all_emails[].email
//   M4  inbound from-domain              === leads.domain  (ONLY when it resolves to exactly ONE lead)
//
// Warmup-pool / DMARC / bounce traffic is skipped for lead attribution: those inbound rows are not prospect
// replies (we never sent a real cold touch to them), so attributing them to a lead would be a mis-attribution.
// They still get a match_method tag of 'skipped_warmup' so a re-run does not re-examine them.
//
// ADDITIVE only: adds inbound_emails.match_method (audit trail) IF NOT EXISTS; sets matched_lead_id /
// matched_send_id / matched_alias_id only on a confident match; leaves them NULL otherwise. Idempotent:
// rows that already have matched_lead_id (or a non-null match_method) are skipped.
//
//   node scripts/match-inbound-replies.js [LIMIT]    # LIMIT = max unmatched rows to examine (default: all)
//
// Reuses scripts/psql + NEON_URL (pg8000 shim), same .env loader + pg() pattern as reconcile.js / gen-state.js.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// .env loader (same as reconcile.js): fill process.env from ./.env without clobbering real env.
(() => {
  try {
    const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const l of t.split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_e) {}
})();
const NEON = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;

// pg(): run SQL through the psql shim (-tA = tuples-only, unaligned). Returns trimmed stdout or '' on error.
function pg(sql) {
  if (!NEON) return '';
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [NEON, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (_e) { return ''; }
}
// SQL string-literal escaper. Mirrors the esc() in imap-poll-worker.js but always quotes (never NULL here).
const q = (s) => `'${String(s == null ? '' : s).replace(/'/g, "''")}'`;
const rows = (out) => (out ? out.split('\n').filter(Boolean).map(r => r.split('\t')) : []);
const norm = (e) => String(e || '').trim().toLowerCase();
const stripBrackets = (s) => String(s || '').replace(/[<>]/g, '').trim();
// extract every <id> token from an In-Reply-To / References header (References can hold many)
function headerIds(raw) {
  if (!raw) return [];
  const out = new Set();
  const m = String(raw).match(/<[^>]+>/g);
  if (m) m.forEach(x => out.add(stripBrackets(x)));
  const bare = stripBrackets(raw);          // header may be a single bare token (Mystrika style)
  if (bare && !/\s/.test(bare)) out.add(bare);
  return [...out].filter(Boolean);
}
// from_email values that are NOT prospect replies and must never be attributed to a lead.
function isNonProspect(fromEmail) {
  const e = norm(fromEmail);
  if (!e || e.indexOf('@') < 0) return true;
  const dom = e.split('@').pop();
  if (dom && dom.indexOf('tamazia') >= 0) return true;                       // our own warmup-pool alias
  if (/(^|[._-])(mailer-daemon|postmaster|no-?reply|noreply|dmarc|abuse)(@|[._-])/.test(e)) return true;
  if (e.indexOf('mailer-daemon') >= 0 || e.indexOf('dmarc') >= 0) return true;
  return false;
}

function ensureSchema() {
  // additive: audit-trail column so we can see HOW each row matched + make re-runs idempotent.
  pg(`ALTER TABLE inbound_emails ADD COLUMN IF NOT EXISTS match_method VARCHAR(32)`);
}

// commit a match (or a skip tag) for one inbound row. Only writes columns we have a value for.
function setMatch(id, { lead, send, alias, method }) {
  const sets = [`match_method=${q(method)}`];
  if (lead != null)  sets.push(`matched_lead_id=${Number(lead)}`);
  if (send != null)  sets.push(`matched_send_id=${Number(send)}`);
  if (alias != null) sets.push(`matched_alias_id=${Number(alias)}`);
  pg(`UPDATE inbound_emails SET ${sets.join(', ')} WHERE id=${Number(id)} AND matched_lead_id IS NULL`);
}

// ---- the per-row waterfall -------------------------------------------------
// returns { method, lead, send, alias } — method is one of m1_in_reply_to / m2_send_recipient /
// m3_lead_email / m4_lead_domain / skipped_warmup / unmatched.
function matchOne(row) {
  const [id, fromEmail, , inReplyTo /* , subject */] = row;
  const from = norm(fromEmail);

  // M1 — thread headers (In-Reply-To / References) -> our send's Message-ID -> lead_id. Highest precision.
  for (const tok of headerIds(inReplyTo)) {
    // 1a) sends table (Message-ID we stored at send time). Match raw and angle-stripped both ways.
    let r = rows(pg(
      `SELECT lead_id, id, alias_id FROM sends ` +
      `WHERE lead_id IS NOT NULL AND (message_id=${q(tok)} OR replace(replace(message_id,'<',''),'>','')=${q(tok)}) ` +
      `ORDER BY id DESC LIMIT 1`))[0];
    if (r && r[0]) return { method: 'm1_in_reply_to', lead: r[0], send: r[1] || null, alias: r[2] || null };
    // 1b) new touch flow: the RFC Message-ID / relay id we stashed on the draft at send time.
    r = rows(pg(
      `SELECT lead_id, COALESCE(draft_metadata->>'from_alias_id','') FROM outreach_drafts ` +
      `WHERE lead_id IS NOT NULL AND (draft_metadata->>'rfc_message_id'=${q(tok)} OR draft_metadata->>'relay_email_id'=${q(tok)}) ` +
      `ORDER BY id DESC LIMIT 1`))[0];
    if (r && r[0]) return { method: 'm1_in_reply_to', lead: r[0], send: null, alias: r[1] ? Number(r[1]) : null };
  }

  // Everything below keys off the sender address. If it is our own warmup pool / a daemon / DMARC report,
  // it is not a prospect reply — tag and skip rather than risk a coincidental lead-email collision.
  if (isNonProspect(from)) return { method: 'skipped_warmup', lead: null, send: null, alias: null };

  // M2 — from_email === a sends.recipient we actually sent to -> that send's lead_id.
  let r = rows(pg(
    `SELECT lead_id, id, alias_id FROM sends ` +
    `WHERE lead_id IS NOT NULL AND lower(recipient)=${q(from)} ORDER BY id DESC LIMIT 1`))[0];
  if (r && r[0]) return { method: 'm2_send_recipient', lead: r[0], send: r[1] || null, alias: r[2] || null };

  // M3 — from_email === a lead's contact_email / email / primary_email, or any all_emails[].email.
  r = rows(pg(
    `SELECT id FROM leads ` +
    `WHERE lower(contact_email)=${q(from)} OR lower(email)=${q(from)} OR lower(primary_email)=${q(from)} ` +
    `OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(all_emails)='array' THEN all_emails ELSE '[]'::jsonb END) e ` +
    `          WHERE lower(e->>'email')=${q(from)}) ` +
    `ORDER BY id ASC LIMIT 2`));
  if (r.length === 1 && r[0][0]) return { method: 'm3_lead_email', lead: r[0][0], send: null, alias: null };
  // (>1 lead share this exact email -> ambiguous; fall through to leave it for human review)
  if (r.length > 1) return { method: 'unmatched', lead: null, send: null, alias: null, ambiguous: 'm3_email' };

  // M4 — from-domain === leads.domain, ONLY when it resolves to exactly ONE lead (else mis-attribution risk).
  const dom = from.split('@').pop();
  if (dom) {
    const ld = rows(pg(`SELECT id FROM leads WHERE lower(domain)=${q(dom)} ORDER BY id ASC LIMIT 2`));
    if (ld.length === 1 && ld[0][0]) return { method: 'm4_lead_domain', lead: ld[0][0], send: null, alias: null };
    if (ld.length > 1) return { method: 'unmatched', lead: null, send: null, alias: null, ambiguous: 'm4_domain' };
  }

  return { method: 'unmatched', lead: null, send: null, alias: null };
}

function main() {
  if (!NEON) { console.error('[match-inbound] no NEON_URL — abort'); process.exit(1); }
  ensureSchema();

  const limit = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : null;
  // idempotent: only rows with no lead match yet AND not previously tagged (NULL match_method).
  const sel = `SELECT id, from_email, to_email, in_reply_to, subject FROM inbound_emails ` +
    `WHERE matched_lead_id IS NULL AND match_method IS NULL ORDER BY id ASC` + (limit ? ` LIMIT ${limit}` : '');
  const pending = rows(pg(sel));

  const tally = { m1_in_reply_to: 0, m2_send_recipient: 0, m3_lead_email: 0, m4_lead_domain: 0, skipped_warmup: 0, unmatched: 0, ambiguous: 0 };
  let matched = 0;
  for (const row of pending) {
    const res = matchOne(row);
    if (res.lead != null) {
      setMatch(row[0], res);
      matched++;
      tally[res.method] = (tally[res.method] || 0) + 1;
      console.log(`  inbound ${row[0]} -> lead ${res.lead} via ${res.method}${res.send ? ` (send ${res.send})` : ''}`);
    } else if (res.method === 'skipped_warmup') {
      setMatch(row[0], { method: 'skipped_warmup' });
      tally.skipped_warmup++;
    } else {
      // record ambiguity as a tag too, so a re-run does not re-probe; humans can review by match_method.
      setMatch(row[0], { method: res.ambiguous ? `ambiguous_${res.ambiguous}` : 'unmatched' });
      tally.unmatched++;
      if (res.ambiguous) { tally.ambiguous++; console.log(`  inbound ${row[0]} AMBIGUOUS (${res.ambiguous}) -> left unmatched`); }
    }
  }

  const totalIn = pg(`SELECT COUNT(*) FROM inbound_emails`) || '?';
  const nowMatched = pg(`SELECT COUNT(*) FROM inbound_emails WHERE matched_lead_id IS NOT NULL`) || '?';
  console.log(
    `[match-inbound] examined ${pending.length} | newly matched ${matched} ` +
    `(m1=${tally.m1_in_reply_to} m2=${tally.m2_send_recipient} m3=${tally.m3_lead_email} m4=${tally.m4_lead_domain}) ` +
    `| skipped_warmup ${tally.skipped_warmup} | ambiguous ${tally.ambiguous} | unmatched ${tally.unmatched} ` +
    `|| inbound_emails total ${totalIn}, matched_lead_id now ${nowMatched}`);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('[match-inbound] error (non-fatal):', e.message); process.exit(0); }
}

module.exports = { matchOne, headerIds, isNonProspect, norm };
