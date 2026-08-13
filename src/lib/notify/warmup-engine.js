// ============================================================================
// WARMUP ENGINE · £0 sequencer-free inbox warmup (peer-to-peer, our own fleet)
// ----------------------------------------------------------------------------
// WHY THIS EXISTS
//   MailDeck does NOT run ongoing warmup (its "Prewarm" is a domain marketplace),
//   its SMTP/credential export is "coming soon", and the connected PlusVibe account
//   has ZERO inboxes attached (verified 2026-05-23) so nothing is warming. PlusVibe's
//   API is also gated behind its business plan. Rather than pay for a sequencer, this
//   engine warms the 30 inboxes against EACH OTHER: a closed peer-to-peer network.
//   All 30 are Google Workspace, and Google-to-Google warmup is fine/slightly positive
//   (web-verified 2026). Cost: £0. Control: total. Dependency: none.
//
// HOW WARMUP ACTUALLY BUILDS REPUTATION (so this mirrors real tools)
//   1. SEND a steady, ramping volume of human-looking mail between our own inboxes.
//   2. The RECEIVING inbox engages: marks it read, rescues it from Spam to Inbox,
//      and REPLIES to ~30-35% (reply rate is the strongest deliverability signal).
//   3. Volume ramps slowly; never bursts; randomised gaps + subjects/bodies.
//   This produces the engagement signals Gmail scores, without any external network.
//
// RAMP (web-verified targets + PROJECT-MEMORY §14.6): warmup is HIGH while cold is 0,
//   then tapers to maintenance once cold sending takes over.
//     wk1 ~12-15/inbox/day, wk2-3 ~26-28 peak, wk4 ~20, wk5+ ~14 maintenance forever.
//
// ZERO DEPENDENCY: SMTP send reuses mailbox-pool.smtpDeliver (raw TLS). IMAP receiver
//   actions use a compact IMAP-over-TLS helper below (SEARCH/STORE/COPY/reply). No npm.
//
// STATE TABLES (migrations/2026-05-23-warmup-engine.sql):
//   warmup_daily_usage(address, day, sent)   per-inbox warmup sends today
//   warmup_log(id, from_addr, to_addr, token, subject, sent_at, replied, rescued)
//
// CANNOT RUN until the 30 inbox app-passwords are loaded into the pool (creds blocked
// at MailDeck as of 2026-05-23). The moment creds land, this runs with no other change.
// ============================================================================

const tls = require('tls');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const pool = require('./mailbox-pool.js');

function pg(sql) {
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url) return null;
  try { return execFileSync(path.join(ROOT, 'scripts', 'psql'), [url, '-tA', '-c', sql], { encoding: 'utf8' }).toString().trim(); }
  catch (_e) { return null; }
}
function esc(v) { if (v == null) return 'NULL'; return `'${String(v).replace(/'/g, "''")}'`; }

const REPLY_RATE = Number(process.env.WARMUP_REPLY_RATE || 0.33);   // 30-35% optimal (web-verified)
const GAP_MIN_MS = Number(process.env.WARMUP_GAP_MIN_MS || 20000);
const GAP_MAX_MS = Number(process.env.WARMUP_GAP_MAX_MS || 90000);

// ---- PURE: ramp + pairing (unit-testable, no DB/network) -------------------
const WARMUP_RAMP = [
  { fromDay: 0, perDay: 12 },   // wk1
  { fromDay: 7, perDay: 26 },   // wk2 peak (cold still 0-3)
  { fromDay: 14, perDay: 28 },  // wk3 peak
  { fromDay: 21, perDay: 20 },  // wk4 (cold ramping up)
  { fromDay: 28, perDay: 16 },  // wk5
  { fromDay: 35, perDay: 14 },  // wk6+ maintenance forever (never zero)
];
function warmupTargetForAge(days, ramp = WARMUP_RAMP) {
  let v = ramp[0].perDay;
  for (const s of ramp) { if (days >= s.fromDay) v = s.perDay; }
  return v;
}
/**
 * Build today's warmup send pairs across the fleet.
 * Each inbox should SEND ~target/day to OTHER inboxes (never itself), spread evenly.
 * Pure: caller passes [{address, age_days, sentToday}] -> returns [{from,to}] pairs.
 */
function buildWarmupPairs(fleet, opts = {}) {
  const ramp = opts.ramp || WARMUP_RAMP;
  const active = fleet.filter(m => !m.paused && !m.inBackoff);
  if (active.length < 2) return [];
  const pairs = [];
  // recipients pool = all active addresses; rotate to spread receive load
  let rr = 0;
  for (const s of active) {
    const target = warmupTargetForAge(s.age_days, ramp);
    const remaining = Math.max(0, target - (s.sentToday || 0));
    const perRun = Math.min(remaining, opts.perInboxPerRun || 3); // small batches per run, spread across day
    for (let i = 0; i < perRun; i++) {
      // pick a recipient that is not the sender, round-robin
      let to = null, tries = 0;
      do { to = active[rr % active.length].address; rr++; tries++; } while (to === s.address && tries < active.length + 1);
      if (to && to !== s.address) pairs.push({ from: s.address, to });
    }
  }
  // shuffle so we don't always send in address order (looks more human)
  for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  return pairs;
}

// Human-ish warmup content (varied so messages are never byte-identical).
const SUBJECTS = ['quick note', 'following up on this', 'thoughts?', 'the doc', 're: catch up', 'this week', 'small update', 'when you get a sec'];
const OPENERS = ['Hope your week is going well.', 'Saw your note earlier.', 'Thanks for the update yesterday.', 'Circling on the below.', 'Good chatting just now.'];
const BODIES = ['Let me know what you think when you have a moment.', 'No rush on this, just flagging.', 'Happy to jump on a quick call if easier.', 'I will send the rest over shortly.', 'All looks good on my side.'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const token = () => 'tzwu' + Math.random().toString(36).slice(2, 10);

function warmupMessage(fromName) {
  const t = token();
  const subject = `${pick(SUBJECTS)} [${t}]`;
  const body = `${pick(OPENERS)}\n\n${pick(BODIES)}\n\n${fromName || ''}`.trim();
  return { token: t, subject, body };
}

// ============================================================================
// COMPACT IMAP-over-TLS (receiver engagement: SEARCH unseen warmup, mark seen,
// rescue from Spam, and trigger replies). Minimal command set, zero deps.
// ============================================================================
function imapSession({ host, port = 993, user, pass, timeoutMs = 25000 }) {
  return new Promise((resolve) => {
    let sock, buf = '', tag = 0, done = false; const waiters = [];
    const fin = (ok, info) => { if (done) return; done = true; try { sock && sock.end(); } catch (_e) {} resolve({ ok, ...info }); };
    const timer = setTimeout(() => fin(false, { error: 'imap_timeout' }), timeoutMs);
    sock = tls.connect({ host, port, servername: host, rejectUnauthorized: true }, () => {});
    sock.on('error', e => { clearTimeout(timer); fin(false, { error: 'imap_conn:' + e.message }); });
    function send(cmd) { const t = 'a' + (++tag); sock.write(t + ' ' + cmd + '\r\n'); return t; }
    function waitFor(t) { return new Promise(res => waiters.push({ t, res })); }
    sock.on('data', d => {
      buf += d.toString('utf8');
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        const re = new RegExp('^' + w.t + ' (OK|NO|BAD)[^\r\n]*\r\n', 'm');
        const m = buf.match(re);
        if (m) { const chunk = buf; w.res({ status: m[1], data: chunk }); waiters.splice(i, 1); }
      }
    });
    // greeting then expose a tiny API
    setTimeout(async () => {
      try {
        const login = send(`LOGIN "${user}" "${pass}"`);
        const lr = await waitFor(login);
        if (lr.status !== 'OK') return fin(false, { error: 'imap_login_failed' });
        clearTimeout(timer);
        resolve({
          ok: true,
          // run a select+search+store sequence for one mailbox folder
          run: async (folder = 'INBOX') => {
            buf = '';
            await waitFor(send(`SELECT "${folder}"`));
            buf = '';
            const sr = await waitFor(send('UID SEARCH UNSEEN SUBJECT "tzwu"'));
            const ids = (sr.data.match(/\* SEARCH ([0-9 ]+)/) || [, ''])[1].trim().split(/\s+/).filter(Boolean);
            for (const id of ids) { buf = ''; await waitFor(send(`UID STORE ${id} +FLAGS (\\Seen)`)); }
            return { folder, marked: ids.length, ids };
          },
          rescueSpam: async () => {
            // move warmup mail out of Spam into INBOX (best-effort; Gmail folder = [Gmail]/Spam)
            buf = '';
            await waitFor(send('SELECT "[Gmail]/Spam"'));
            buf = '';
            const sr = await waitFor(send('UID SEARCH SUBJECT "tzwu"'));
            const ids = (sr.data.match(/\* SEARCH ([0-9 ]+)/) || [, ''])[1].trim().split(/\s+/).filter(Boolean);
            for (const id of ids) { buf = ''; await waitFor(send(`UID COPY ${id} "INBOX"`)); buf = ''; await waitFor(send(`UID STORE ${id} +FLAGS (\\Deleted)`)); }
            if (ids.length) { buf = ''; await waitFor(send('EXPUNGE')); }
            return { rescued: ids.length };
          },
          close: () => { try { send('LOGOUT'); } catch (_e) {} fin(true, {}); },
        });
      } catch (e) { fin(false, { error: 'imap_exc:' + (e && e.message) }); }
    }, 300);
  });
}

// ---- DB state --------------------------------------------------------------
function warmupSentToday(address) { const r = pg(`SELECT COALESCE(sent,0) FROM warmup_daily_usage WHERE address=${esc(address)} AND day=CURRENT_DATE`); return r ? Number(r) : 0; }
function bumpWarmup(address) { pg(`INSERT INTO warmup_daily_usage (address,day,sent) VALUES (${esc(address)},CURRENT_DATE,1) ON CONFLICT (address,day) DO UPDATE SET sent=warmup_daily_usage.sent+1`); }
function logWarmup(from, to, tok, subject) { pg(`INSERT INTO warmup_log (from_addr,to_addr,token,subject,sent_at) VALUES (${esc(from)},${esc(to)},${esc(tok)},${esc(subject)},NOW())`); }

// ---- ORCHESTRATION (runs each cycle) --------------------------------------
async function runWarmupSendPass() {
  const creds = pool.loadCredsRaw();
  if (!creds.length) { console.log('warmup: no mailboxes loaded yet (creds pending at MailDeck) — nothing to warm.'); return { halted: 'no_creds' }; }
  const credByAddr = Object.fromEntries(creds.map(c => [c.address, c]));
  // fleet snapshot with warmup-sent-today
  const snap = pool.fleetSnapshot().map(m => ({ ...m, sentToday: warmupSentToday(m.address) }));
  const pairs = buildWarmupPairs(snap, { perInboxPerRun: Number(process.env.WARMUP_PER_INBOX_PER_RUN || 3) });
  console.log(`warmup: ${pairs.length} peer-to-peer messages this pass across ${snap.length} inboxes`);
  let sent = 0;
  for (let i = 0; i < pairs.length; i++) {
    const { from, to } = pairs[i];
    const mb = credByAddr[from]; if (!mb || !mb.smtp_pass) continue;
    const fromName = mb.persona_name || `${mb.first_name || ''}`.trim();
    const msg = warmupMessage(fromName);
    const mime = pool.buildMime({ from: mb.address, fromName, to, subject: msg.subject, text: msg.body, html: null, messageId: `<${msg.token}@${mb.domain}>` });
    const res = await pool.smtpDeliver({ host: mb.smtp_host, port: mb.smtp_port, user: mb.smtp_user, pass: mb.smtp_pass, mailFrom: mb.address, rcptTo: to, message: mime, ehloName: mb.domain });
    if (res.ok) { bumpWarmup(from); logWarmup(from, to, msg.token, msg.subject); sent++; }
    if (i < pairs.length - 1) await new Promise(r => setTimeout(r, GAP_MIN_MS + Math.random() * (GAP_MAX_MS - GAP_MIN_MS)));
  }
  console.log(`warmup: sent ${sent}/${pairs.length}`);
  return { sent, attempted: pairs.length };
}

async function runWarmupReceivePass() {
  const creds = pool.loadCredsRaw();
  if (!creds.length) return { halted: 'no_creds' };
  let engaged = 0, rescued = 0, replied = 0;
  for (const mb of creds) {
    if (!mb.imap_pass && !mb.smtp_pass) continue;
    const s = await imapSession({ host: mb.imap_host || 'imap.gmail.com', port: mb.imap_port || 993, user: mb.imap_user || mb.address, pass: mb.imap_pass || mb.smtp_pass });
    if (!s.ok) continue;
    try {
      const inbox = await s.run('INBOX'); engaged += inbox.marked;
      const sp = await s.rescueSpam(); rescued += sp.rescued;
      // reply to ~REPLY_RATE of newly-seen warmup mail (strongest signal). Replies are sent via SMTP
      // from this inbox back to the senders. We approximate by replying to a fraction of marked items.
      const toReply = Math.round(inbox.marked * REPLY_RATE);
      // (sender addresses are recovered from warmup_log by token in a fuller build; here we reply to
      //  recent senders that targeted this inbox)
      const recent = pg(`SELECT from_addr,token,subject FROM warmup_log WHERE to_addr=${esc(mb.address)} AND sent_at>NOW()-INTERVAL '2 days' AND NOT replied ORDER BY sent_at DESC LIMIT ${toReply}`);
      if (recent) for (const line of recent.split('\n').filter(Boolean)) {
        const [fromAddr, tok, subj] = line.split('\t');
        const mime = pool.buildMime({ from: mb.address, fromName: mb.persona_name || mb.first_name, to: fromAddr, subject: 'Re: ' + (subj || `[${tok}]`), text: pick(['Thanks, got it.', 'Sounds good.', 'Appreciate it, will take a look.', 'Perfect, thank you.']), html: null, messageId: `<${tok}r@${mb.domain}>` });
        const r = await pool.smtpDeliver({ host: mb.smtp_host, port: mb.smtp_port, user: mb.smtp_user, pass: mb.smtp_pass, mailFrom: mb.address, rcptTo: fromAddr, message: mime, ehloName: mb.domain });
        if (r.ok) { replied++; pg(`UPDATE warmup_log SET replied=TRUE WHERE token=${esc(tok)}`); }
      }
    } catch (_e) {} finally { s.close(); }
  }
  console.log(`warmup receive: engaged ${engaged} · rescued-from-spam ${rescued} · replied ${replied}`);
  return { engaged, rescued, replied };
}

module.exports = {
  warmupTargetForAge, buildWarmupPairs, warmupMessage,        // pure
  runWarmupSendPass, runWarmupReceivePass, imapSession,        // live
  WARMUP_RAMP, REPLY_RATE,
};

if (require.main === module) {
  const cmd = process.argv[2];
  (async () => {
    if (cmd === '--send') console.log(JSON.stringify(await runWarmupSendPass()));
    else if (cmd === '--receive') console.log(JSON.stringify(await runWarmupReceivePass()));
    else if (cmd === '--plan') {
      const snap = pool.fleetSnapshot().map(m => ({ ...m, sentToday: 0 }));
      console.log(`fleet ${snap.length} inboxes · today's warmup pairs:`, buildWarmupPairs(snap, { perInboxPerRun: 3 }).length);
    } else console.log('Usage: warmup-engine.js --send | --receive | --plan');
  })();
}
