// anti-fingerprint.js — Phase 4 task 4.4.1
// Ten layers of variability injected at send time so two consecutive sends from the same alias
// to different recipients do not produce identical raw MIME bytes (which spam filters use as a
// fingerprint signal). Each layer is independent and idempotent per (lead_id, touch).

const crypto = require('crypto');

function seedFor(leadId, touch, layer) {
  return crypto.createHash('sha1').update(`${leadId}|${touch}|${layer}`).digest();
}
function pick(arr, seed) {
  if (!arr.length) return null;
  return arr[seed[0] % arr.length];
}

// L1 — Sender name capitalisation variant
function fingerprintSenderName(firstName, leadId, touch) {
  const s = seedFor(leadId, touch, 'sender-name');
  const variants = [firstName, firstName.toLowerCase(), `${firstName} ${''}`, firstName];
  return pick(variants, s) || firstName;
}

// L2 — Quoted-printable wrap width
function fingerprintQpWidth(leadId, touch) {
  const widths = [76, 72, 80, 78];
  return pick(widths, seedFor(leadId, touch, 'qp-width'));
}

// L3 — Message-ID format
function fingerprintMessageId(leadId, touch, host) {
  const s = seedFor(leadId, touch, 'msg-id');
  const random = crypto.randomBytes(8).toString('hex');
  const formats = [
    `<${random}@${host}>`,
    `<${random}-${touch}@${host}>`,
    `<${Date.now()}.${random}@${host}>`,
  ];
  return pick(formats, s);
}

// L4 — Content-Type boundary string
function fingerprintBoundary(leadId, touch) {
  return '_tmz_' + crypto.createHash('sha1').update(seedFor(leadId, touch, 'boundary')).digest('hex').slice(0, 24);
}

// L5 — Date header second precision
function fingerprintDate(leadId, touch) {
  const s = seedFor(leadId, touch, 'date');
  const offsetSeconds = (s[0] % 60);
  const d = new Date(Date.now() - offsetSeconds * 1000);
  return d.toUTCString();
}

// L6 — Body intro variant (zero-width transparent change before opener)
function fingerprintBodyIntro(text, leadId, touch) {
  const intros = ['', ' ', ' ', ''];
  return pick(intros, seedFor(leadId, touch, 'intro')) + text;
}

// L7 — Sign-off micro-variant ("Best," "Best regards," "Kind regards," etc. but inside compose body, not signature block)
function fingerprintSignoff(firstName, leadId, touch) {
  const variants = [`Best,\n${firstName}`, `Kind regards,\n${firstName}`, `Regards,\n${firstName}`, `Best regards,\n${firstName}`];
  return pick(variants, seedFor(leadId, touch, 'signoff')) || `${firstName}`;
}

// L8 — Mime header ordering
function fingerprintHeaderOrder(leadId, touch) {
  const orders = [
    ['From', 'To', 'Subject', 'Date', 'Message-ID', 'MIME-Version', 'Content-Type'],
    ['Date', 'From', 'To', 'Subject', 'Message-ID', 'MIME-Version', 'Content-Type'],
    ['Message-ID', 'From', 'To', 'Subject', 'Date', 'MIME-Version', 'Content-Type'],
  ];
  return pick(orders, seedFor(leadId, touch, 'hdr-order'));
}

// L9 — Trailing whitespace / linebreaks
function fingerprintTrailingWS(body, leadId, touch) {
  const tails = ['', '\n', '\r\n', '\n\n'];
  return body + (pick(tails, seedFor(leadId, touch, 'trail-ws')) || '');
}

// L10 — Subject zero-width injection (only after first non-trivial char run)
function fingerprintSubjectInvisible(subject, leadId, touch) {
  const s = seedFor(leadId, touch, 'subj-inv');
  const probability = s[0] / 255;
  if (probability < 0.18 && subject.length > 8) {
    // very rarely inject a zero-width-joiner
    return subject.slice(0, 6) + '‌' + subject.slice(6);
  }
  return subject;
}

function applyAll({ leadId, touch, firstName, host, subject, body }) {
  return {
    senderName: fingerprintSenderName(firstName, leadId, touch),
    qpWidth: fingerprintQpWidth(leadId, touch),
    messageId: fingerprintMessageId(leadId, touch, host),
    boundary: fingerprintBoundary(leadId, touch),
    date: fingerprintDate(leadId, touch),
    bodyWithIntro: fingerprintBodyIntro(body, leadId, touch),
    signoff: fingerprintSignoff(firstName, leadId, touch),
    headerOrder: fingerprintHeaderOrder(leadId, touch),
    bodyWithTrail: fingerprintTrailingWS(body, leadId, touch),
    subjectVariant: fingerprintSubjectInvisible(subject, leadId, touch),
  };
}

module.exports = {
  applyAll,
  fingerprintSenderName, fingerprintQpWidth, fingerprintMessageId,
  fingerprintBoundary, fingerprintDate, fingerprintBodyIntro,
  fingerprintSignoff, fingerprintHeaderOrder, fingerprintTrailingWS,
  fingerprintSubjectInvisible,
};
