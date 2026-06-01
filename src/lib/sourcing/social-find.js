// Phase C social discovery — extracts the company's OWN declared social profiles from its HTML
// (footer/header links). Reliable by design: only profiles the firm itself links to, no guessing,
// no false positives. Feeds the Instagram + LinkedIn touches. Node-native, fail-open.
'use strict';
const UA = 'Mozilla/5.0 (compatible; TamaziaBot/1.0; +https://tamazia.co.uk)';
async function getText(url, ms) { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 12000); try { const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: c.signal }); return r.ok ? await r.text() : ''; } finally { clearTimeout(t); } } catch (_) { return ''; } }

const NETS = [
  { net: 'instagram', rx: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,40})\/?/i, bad: /\/(p|reel|explore|accounts|stories)\b/i },
  { net: 'facebook',  rx: /https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9.\-]{3,60})\/?/i, bad: /\/(sharer|plugins|dialog|tr\?|events|photo)\b/i },
  { net: 'twitter',   rx: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{2,15})\/?/i, bad: /\/(intent|share|home|hashtag|search|status)\b/i },
  { net: 'linkedin',  rx: /https?:\/\/(?:www\.)?linkedin\.com\/(company\/[A-Za-z0-9\-_%]{2,80}|in\/[A-Za-z0-9\-_%]{2,80})\/?/i, bad: /\/(sharing|shareArticle|cws|feed)\b/i },
  { net: 'youtube',   rx: /https?:\/\/(?:www\.)?youtube\.com\/(@[A-Za-z0-9._\-]{2,40}|channel\/[A-Za-z0-9_\-]{6,40}|c\/[A-Za-z0-9._\-]{2,40}|user\/[A-Za-z0-9._\-]{2,40})\/?/i, bad: /\/(watch|embed|results|shorts)\b/i },
  { net: 'tiktok',    rx: /https?:\/\/(?:www\.)?tiktok\.com\/(@[A-Za-z0-9._]{2,40})\/?/i, bad: /\/(video|tag|discover)\b/i },
  { net: 'pinterest', rx: /https?:\/\/(?:www\.)?pinterest\.[a-z.]{2,6}\/([A-Za-z0-9._\-]{2,40})\/?/i, bad: /\/(pin|search)\b/i },
];

function extractSocials(html) {
  const found = {}; const b = html || '';
  for (const { net, rx, bad } of NETS) {
    const g = new RegExp(rx.source, 'gi'); let m;
    while ((m = g.exec(b)) !== null) {
      const url = m[0].replace(/["'<> ].*$/, '');
      if (bad && bad.test(url)) continue;
      const handle = (m[1] || '').replace(/\/$/, '');
      if (!found[net]) { found[net] = { url, handle }; break; }
    }
  }
  return found;
}

async function findSocials({ domain, html }) {
  domain = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  let b = html;
  if (!b) { b = await getText('https://' + domain, 12000); const c = await getText('https://' + domain + '/contact', 9000); b = (b || '') + ' ' + (c || ''); }
  const socials = extractSocials(b);
  return { socials, count: Object.keys(socials).length, networks: Object.keys(socials) };
}
module.exports = { findSocials, extractSocials };
