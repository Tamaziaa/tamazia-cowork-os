// Zoho IMAP client · pure Node, no external dependencies (npm install blocked by disk quota).
// Implements minimal RFC 3501 IMAP4rev1 over TLS:
//   LOGIN <user> <app-password>
//   SELECT INBOX
//   UID SEARCH UID lastUID+1:*
//   UID FETCH <uid> BODY.PEEK[]
//   LOGOUT
//
// Parses RFC 822 headers + body (text/plain preferred, falls back to text/html stripped).
// Handles base64, quoted-printable encodings + multipart/alternative + multipart/mixed.
//
// Required env:
//   ZOHO_IMAP_HOST=imap.zoho.eu
//   ZOHO_IMAP_PORT=993
//   ZOHO_IMAP_USER=founder@tamazia.co.uk
//   ZOHO_IMAP_APP_PASSWORD=<app password from Zoho Mail → My Account → Security → App Passwords>
//
// Usage:
//   const { pollMailbox } = require('./zoho-imap-client.js');
//   const result = await pollMailbox({ mailbox: 'INBOX', sinceUid: 0 });
//   // result.messages = [{ uid, from, to, subject, in_reply_to, message_id, body_plain, body_html, ... }]
//
// Auto-renewing: any IMAP/TLS error is caught and surfaced — the poll script retries with backoff.

const tls = require('tls');

// Prefer Gmail IMAP (cold-reply intake inbox) when set; fall back to Zoho.
const HOST = process.env.GMAIL_IMAP_HOST || process.env.ZOHO_IMAP_HOST || 'imap.zoho.eu';
const PORT = Number(process.env.GMAIL_IMAP_PORT || process.env.ZOHO_IMAP_PORT || 993);
const USER = process.env.GMAIL_IMAP_USER || process.env.ZOHO_IMAP_USER || '';
const PASS = process.env.GMAIL_IMAP_APP_PASSWORD || process.env.ZOHO_IMAP_APP_PASSWORD || '';

// --- Minimal IMAP client class ---------------------------------------------------
class ImapClient {
  constructor({ host = HOST, port = PORT, user = USER, pass = PASS, timeout = 30000 } = {}) {
    this.host = host; this.port = port; this.user = user; this.pass = pass; this.timeout = timeout;
    this.tagId = 0;
    this.socket = null;
    this.buffer = '';
    this.responses = []; // { tag, lines, status, statusText }
    this.waiters = [];   // { tag, resolve, reject }
    this.greeting = null;
    this.connected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`IMAP connect timeout (${this.host}:${this.port})`)), this.timeout);
      this.socket = tls.connect({ host: this.host, port: this.port, servername: this.host }, () => {
        clearTimeout(timer);
        this.connected = true;
        resolve();
      });
      this.socket.setEncoding('utf8');
      this.socket.setTimeout(this.timeout);
      this.socket.on('timeout', () => { try { this.socket.destroy(new Error('IMAP socket idle timeout')); } catch (_e) {} });
      this.socket.on('data', (chunk) => this._onData(chunk));
      this.socket.on('error', (err) => { clearTimeout(timer); this.connected = false; for (const w of this.waiters) try { w.reject(err); } catch (_e) {} this.waiters = []; reject(err); });
      this.socket.on('close', () => { this.connected = false; });
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf('\r\n')) !== -1) {
      const line = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 2);
      this._processLine(line);
    }
  }

  _processLine(line) {
    if (!this.greeting && line.startsWith('* OK')) { this.greeting = line; return; }
    // Tag-prefixed status line ends a command
    const m = line.match(/^(A\d+)\s+(OK|NO|BAD)\s+(.*)$/);
    if (m) {
      const tag = m[1]; const status = m[2]; const text = m[3];
      const idx = this.waiters.findIndex(w => w.tag === tag);
      if (idx !== -1) {
        const w = this.waiters[idx];
        this.waiters.splice(idx, 1);
        w.resolve({ status, text, lines: w.lines });
      }
      return;
    }
    // Untagged continuation — push into pending command's collector
    if (this.waiters.length) {
      const w = this.waiters[this.waiters.length - 1];
      w.lines.push(line);
    }
  }

  async send(cmd) {
    this.tagId += 1;
    const tag = `A${this.tagId}`;
    const full = `${tag} ${cmd}\r\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`IMAP cmd timeout: ${cmd.slice(0, 60)}`)), this.timeout);
      this.waiters.push({ tag, resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); }, lines: [] });
      try { this.socket.write(full); }
      catch (e) { clearTimeout(timer); reject(e); }
    });
  }

  async login() {
    const r = await this.send(`LOGIN "${this.user.replace(/"/g, '\\"')}" "${this.pass.replace(/"/g, '\\"')}"`);
    if (r.status !== 'OK') throw new Error(`IMAP LOGIN failed: ${r.status} ${r.text}`);
    return r;
  }

  async select(mailbox = 'INBOX') {
    const r = await this.send(`SELECT "${mailbox}"`);
    if (r.status !== 'OK') throw new Error(`IMAP SELECT ${mailbox} failed: ${r.status} ${r.text}`);
    let exists = null, uidnext = null, uidvalidity = null;
    for (const l of r.lines) {
      let m;
      if ((m = l.match(/^\* (\d+) EXISTS/))) exists = Number(m[1]);
      if ((m = l.match(/UIDNEXT\s+(\d+)/i))) uidnext = Number(m[1]);
      if ((m = l.match(/UIDVALIDITY\s+(\d+)/i))) uidvalidity = Number(m[1]);
    }
    return { exists, uidnext, uidvalidity };
  }

  async uidSearch(criteria) {
    const r = await this.send(`UID SEARCH ${criteria}`);
    if (r.status !== 'OK') throw new Error(`IMAP UID SEARCH failed: ${r.status} ${r.text}`);
    const uids = [];
    for (const l of r.lines) {
      const m = l.match(/^\* SEARCH\s+(.*)$/i);
      if (m) for (const tok of m[1].split(/\s+/)) { const n = Number(tok); if (n) uids.push(n); }
    }
    return uids;
  }

  // Fetches the raw RFC822 source for a single UID. Returns the literal bytes.
  async uidFetchRaw(uid) {
    // Use BODY.PEEK[] to not set the \Seen flag
    return new Promise((resolve, reject) => {
      this.tagId += 1;
      const tag = `A${this.tagId}`;
      const cmd = `${tag} UID FETCH ${uid} (UID BODY.PEEK[])\r\n`;
      let raw = '';
      let collecting = false;
      let needed = 0;
      const timer = setTimeout(() => reject(new Error(`IMAP UID FETCH ${uid} timeout`)), this.timeout);
      const onData = (chunk) => {
        if (!collecting) {
          this.buffer += chunk;
          // Look for literal-length marker like  {12345}
          const lm = this.buffer.match(/\{(\d+)\}\r\n/);
          if (lm) {
            needed = Number(lm[1]);
            const idx = this.buffer.indexOf(lm[0]) + lm[0].length;
            const have = this.buffer.slice(idx);
            this.buffer = '';
            collecting = true;
            if (have.length >= needed) {
              raw = have.slice(0, needed);
              this.buffer = have.slice(needed);
              collecting = false;
              finishOnTag();
              return;
            }
            raw = have;
            return;
          }
          // Check tagged completion (e.g., empty FETCH due to deleted UID)
          finishOnTag();
        } else {
          raw += chunk;
          if (raw.length >= needed) {
            const overflow = raw.slice(needed);
            raw = raw.slice(0, needed);
            this.buffer = overflow;
            collecting = false;
            finishOnTag();
          }
        }
      };
      const finishOnTag = () => {
        const tagRe = new RegExp(`^${tag} (OK|NO|BAD) (.*)$`, 'm');
        const matched = this.buffer.match(tagRe);
        if (matched) {
          clearTimeout(timer);
          this.socket.removeListener('data', onData);
          // Restore default data handler
          this.socket.on('data', (c) => this._onData(c));
          if (matched[1] === 'OK') resolve(raw);
          else reject(new Error(`IMAP UID FETCH ${uid} ${matched[1]} ${matched[2]}`));
        }
      };
      // Pause default handler, install our raw collector
      this.socket.removeAllListeners('data');
      this.socket.setEncoding('binary'); // bytes
      this.socket.on('data', onData);
      this.socket.write(cmd);
    });
  }

  async logout() {
    try { await this.send('LOGOUT'); } catch (_e) {}
    try { this.socket.end(); } catch (_e) {}
    try { this.socket.destroy(); } catch (_e) {}
    this.connected = false;
  }
}

// --- Minimal RFC 822 parser -------------------------------------------------------
function decodeQP(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function decodeBase64(s) {
  try { return Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch (_e) { return s; }
}
function decodeHeaderWord(s) {
  // RFC 2047:  =?charset?Q?text?=  or  =?charset?B?base64?=
  return String(s || '').replace(/=\?([^?]+)\?([QqBb])\?([^?]+)\?=/g, (_, charset, enc, txt) => {
    try {
      if (enc.toUpperCase() === 'Q') return Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_2, h) => String.fromCharCode(parseInt(h, 16))), 'binary').toString('utf8');
      else return Buffer.from(txt, 'base64').toString('utf8');
    } catch (_e) { return txt; }
  });
}

function parseRfc822(raw) {
  if (!raw) return { headers: {}, body: '' };
  const headerEnd = raw.indexOf('\r\n\r\n');
  let headerBlock = '';
  let body = '';
  if (headerEnd !== -1) {
    headerBlock = raw.slice(0, headerEnd);
    body = raw.slice(headerEnd + 4);
  } else {
    headerBlock = raw;
  }
  // Unfold multi-line headers
  const headerText = headerBlock.replace(/\r\n[ \t]+/g, ' ');
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = decodeHeaderWord(line.slice(i + 1).trim());
    if (headers[k]) headers[k] += '; ' + v;
    else headers[k] = v;
  }
  const ct = headers['content-type'] || 'text/plain';
  const transferEnc = (headers['content-transfer-encoding'] || '').toLowerCase().trim();

  // Multipart?
  const boundaryMatch = ct.match(/boundary\s*=\s*"?([^";]+)"?/i);
  if (boundaryMatch && /^multipart\//i.test(ct)) {
    const boundary = boundaryMatch[1];
    const parts = body.split(`--${boundary}`);
    const out = { body_plain: '', body_html: '' };
    for (const partRaw of parts) {
      if (!partRaw || /^--/.test(partRaw.trim()) || partRaw.trim() === '') continue;
      const partTrim = partRaw.replace(/^\r?\n/, '');
      const parsed = parseRfc822(partTrim);
      const pct = (parsed.headers['content-type'] || '').toLowerCase();
      if (/text\/plain/.test(pct) && !out.body_plain) out.body_plain = parsed.body;
      if (/text\/html/.test(pct) && !out.body_html) out.body_html = parsed.body;
      if (/multipart\//.test(pct)) {
        // Nested multipart — recurse using parsed.body alone
        const nested = parseRfc822(`Content-Type: ${parsed.headers['content-type']}\r\n\r\n${parsed.body}`);
        if (!out.body_plain && nested.body_plain) out.body_plain = nested.body_plain;
        if (!out.body_html && nested.body_html) out.body_html = nested.body_html;
      }
    }
    return { headers, body, body_plain: out.body_plain, body_html: out.body_html };
  }

  // Single part
  let decoded = body;
  if (transferEnc === 'quoted-printable') decoded = decodeQP(body);
  else if (transferEnc === 'base64') decoded = decodeBase64(body);

  const isHtml = /text\/html/i.test(ct);
  return { headers, body: decoded, body_plain: isHtml ? '' : decoded, body_html: isHtml ? decoded : '' };
}

function parseAddr(s) {
  if (!s) return '';
  const m = String(s).match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return String(s).trim().toLowerCase();
}

// --- High-level poll function -----------------------------------------------------
async function pollMailbox({ mailbox = 'INBOX', sinceUid = 0, maxFetch = 200 } = {}) {
  if (!USER || !PASS) {
    return { ok: false, error: 'IMAP user/app-password not set (GMAIL_IMAP_* or ZOHO_IMAP_*)', mailbox, messages: [] };
  }
  const cli = new ImapClient();
  await cli.connect();
  try {
    await cli.login();
    const mb = await cli.select(mailbox);
    // UID SEARCH UID sinceUid+1:*
    const fromUid = (sinceUid || 0) + 1;
    let uids = [];
    try { uids = await cli.uidSearch(`UID ${fromUid}:*`); } catch (e) { /* empty mailbox returns NO */ }
    uids = uids.filter(u => u >= fromUid).sort((a, b) => a - b).slice(0, maxFetch);
    const messages = [];
    for (const uid of uids) {
      try {
        const raw = await cli.uidFetchRaw(uid);
        const parsed = parseRfc822(raw);
        messages.push({
          uid,
          mailbox,
          from_email: parseAddr(parsed.headers['from']),
          from_raw: parsed.headers['from'] || '',
          to_email: parseAddr(parsed.headers['to']),
          subject: parsed.headers['subject'] || '',
          in_reply_to: (parsed.headers['in-reply-to'] || '').replace(/[<>]/g, ''),
          message_id: (parsed.headers['message-id'] || '').replace(/[<>]/g, ''),
          date: parsed.headers['date'] || '',
          body_plain: (parsed.body_plain || '').slice(0, 64000),
          body_html: (parsed.body_html || '').slice(0, 64000),
          raw_size: raw.length
        });
      } catch (e) {
        messages.push({ uid, mailbox, error: e.message });
      }
    }
    return { ok: true, mailbox, fetched: messages.length, mailbox_stats: mb, since_uid: sinceUid, messages };
  } finally {
    await cli.logout();
  }
}

module.exports = { pollMailbox, ImapClient, parseRfc822, parseAddr };

// CLI entry: node zoho-imap-client.js [sinceUid]
if (require.main === module) {
  (async () => {
    const sinceUid = Number(process.argv[2] || 0);
    try {
      const r = await pollMailbox({ sinceUid });
      console.log(JSON.stringify({ ok: r.ok, error: r.error || null, fetched: r.fetched || 0, mailbox_stats: r.mailbox_stats || null, since_uid: sinceUid, sample: (r.messages || []).slice(0, 3).map(m => ({ uid: m.uid, from: m.from_email, subject: (m.subject || '').slice(0, 80), body_preview: (m.body_plain || '').slice(0, 160) })) }, null, 2));
    } catch (e) {
      console.log(JSON.stringify({ ok: false, error: e.message }));
    }
  })();
}
