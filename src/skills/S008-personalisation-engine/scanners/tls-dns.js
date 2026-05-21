// TLS + DNS scanner · Phase 6.5
// Uses Google DNS-over-HTTPS to resolve SPF, DMARC, DKIM hints, DNSSEC, AAAA (IPv6), CAA.
// Uses SSL Labs Assessment API for cert grade (polls; falls back to "skip" if too slow).
// Returns concrete email-deliverability + transport-security findings.

const { fetchWithRetry, getCached, writeCache } = require('../lib/http.js');
const SCANNER = 'tls_dns';
const DOH = 'https://dns.google/resolve';

async function scan({ domain, cache_max_age = 86400 }) {
  domain = String(domain || '').toLowerCase();
  const cached = getCached({ domain, scanner: SCANNER, max_age_seconds: cache_max_age });
  if (cached) return { ok: true, cached: true, ...cached.payload };

  const isPrivateHost = /^(127\.|10\.|192\.168\.|localhost)/.test(domain) || /^\d/.test(domain);
  if (isPrivateHost) {
    const payload = { domain, ok: true, reason: 'private_host_skipped', issues: [] };
    writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: 3600 });
    return payload;
  }

  const [spf, dmarc, dkim, mx, aaaa, dnssec, caa, ssl] = await Promise.all([
    doh(domain, 'TXT', t => /^\"?v=spf1/i.test(t)),
    doh(`_dmarc.${domain}`, 'TXT', t => /v=DMARC1/i.test(t)),
    doh(`google._domainkey.${domain}`, 'TXT', t => /v=DKIM1|k=rsa/i.test(t)),
    doh(domain, 'MX', () => true),
    doh(domain, 'AAAA', () => true),
    dnssecCheck(domain),
    doh(domain, 'CAA', () => true),
    sslLabs(domain)
  ]);

  const issues = [];
  // SPF
  if (!spf?.found || !spf.records.length) issues.push({ severity: 'P0', id: 'missing_spf', evidence_url: `https://dns.google/query?name=${domain}&type=TXT`, fact: `No SPF record for ${domain} (anti-spoofing baseline missing).`, recommendation: 'Publish a TXT SPF record like "v=spf1 include:_spf.zoho.eu -all" at the root.', citation_url: 'https://datatracker.ietf.org/doc/html/rfc7208' });
  else if (!/-all|~all/.test(spf.records.join(' '))) issues.push({ severity: 'P1', id: 'lax_spf', evidence_url: `https://dns.google/query?name=${domain}&type=TXT`, fact: `SPF record for ${domain} does not end with -all or ~all (accepts unauthorised mail).`, recommendation: 'Tighten SPF to end with -all once you have verified all senders are listed.', citation_url: 'https://datatracker.ietf.org/doc/html/rfc7208' });
  // DMARC
  if (!dmarc?.found) issues.push({ severity: 'P0', id: 'missing_dmarc', evidence_url: `https://dns.google/query?name=_dmarc.${domain}&type=TXT`, fact: `No DMARC record for ${domain} (no instructions to receivers on auth failure).`, recommendation: 'Publish "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain" then progress to p=quarantine then p=reject.', citation_url: 'https://datatracker.ietf.org/doc/html/rfc7489' });
  else if (/p=none/i.test(dmarc.records.join(' '))) issues.push({ severity: 'P1', id: 'dmarc_p_none', evidence_url: `https://dns.google/query?name=_dmarc.${domain}&type=TXT`, fact: `DMARC policy for ${domain} is still p=none (monitoring only).`, recommendation: 'Move DMARC policy to p=quarantine for 30 days then p=reject once you confirm no legitimate mail is failing.', citation_url: 'https://datatracker.ietf.org/doc/html/rfc7489' });
  // DKIM (best-effort — Google selector is most common but not universal)
  // We do NOT raise an issue for missing DKIM at google. selector because it may use a different selector
  // DNSSEC
  if (dnssec && dnssec.signed === false) issues.push({ severity: 'P1', id: 'dnssec_unsigned', evidence_url: `https://dns.google/query?name=${domain}&type=DNSKEY`, fact: `${domain} is not DNSSEC-signed — DNS responses can be spoofed in transit.`, recommendation: 'Enable DNSSEC at your registrar (one click for Cloudflare / Route53 / Nominet).', citation_url: 'https://www.icann.org/resources/pages/dnssec-what-is-it-why-important-2019-03-05-en' });
  // IPv6
  if (aaaa && (!aaaa.records || aaaa.records.length === 0)) issues.push({ severity: 'P2', id: 'no_ipv6', evidence_url: `https://dns.google/query?name=${domain}&type=AAAA`, fact: `${domain} has no AAAA (IPv6) record — about 45% of Google traffic uses IPv6.`, recommendation: 'Enable IPv6 at your edge provider (Cloudflare, Fastly, AWS CloudFront all support it by default).', citation_url: 'https://www.google.com/intl/en/ipv6/statistics.html' });
  // CAA
  if (caa && (!caa.records || caa.records.length === 0)) issues.push({ severity: 'P2', id: 'no_caa', evidence_url: `https://dns.google/query?name=${domain}&type=CAA`, fact: `${domain} has no CAA record — any CA could issue certificates for the domain.`, recommendation: 'Add a CAA record like "0 issue letsencrypt.org" or "0 issue digicert.com" to restrict issuance.', citation_url: 'https://datatracker.ietf.org/doc/html/rfc6844' });
  // SSL Labs grade
  if (ssl && ssl.ok && ssl.grade && /^[BCDEF]/.test(ssl.grade)) issues.push({ severity: 'P0', id: 'weak_tls_grade', evidence_url: `https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`, fact: `SSL Labs assesses ${domain} TLS as grade ${ssl.grade}.`, recommendation: `Move to TLS 1.2+ only, disable weak ciphers (RC4, 3DES), and confirm certificate chain at SSL Labs.`, citation_url: 'https://www.ssllabs.com/projects/best-practices/' });

  const payload = {
    domain, ok: true,
    spf: spf || null, dmarc: dmarc || null, dkim_google: dkim || null,
    mx_records: mx?.records || [], has_ipv6: !!(aaaa?.records?.length), aaaa_records: aaaa?.records || [],
    dnssec, caa_records: caa?.records || [], ssl_labs: ssl, issues
  };
  writeCache({ domain, scanner: SCANNER, payload, ttl_seconds: cache_max_age });
  return payload;
}

async function doh(name, type, matchFn) {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`);
    if (!r.ok) return { found: false, status: r.status };
    const d = await r.json();
    const answers = (d.Answer || []).map(a => a.data);
    const found = matchFn ? answers.some(matchFn) : answers.length > 0;
    return { found, status: d.Status, records: answers };
  } catch (e) { return { found: false, error: String(e.message || e) }; }
}

async function dnssecCheck(name) {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=DNSKEY`);
    if (!r.ok) return { signed: null, status: r.status };
    const d = await r.json();
    const adFlag = d.AD === true;
    const hasDnskey = (d.Answer || []).some(a => a.type === 48);
    return { signed: adFlag && hasDnskey, ad: adFlag, dnskey: hasDnskey };
  } catch (e) { return { signed: null, error: String(e.message || e) }; }
}

async function sslLabs(domain) {
  try {
    // Use cached assessment if available; do not start a fresh one (too slow).
    const r = await fetch(`https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(domain)}&fromCache=on&maxAge=24&all=done`);
    if (!r.ok) return { ok: false, status: r.status };
    const d = await r.json();
    if (d.status === 'READY') {
      const ep = (d.endpoints || [])[0];
      return { ok: true, grade: ep?.grade || null, hasWarnings: ep?.hasWarnings || false, ipAddress: ep?.ipAddress, host: d.host, port: d.port, protocol: d.protocol, isPublic: d.isPublic };
    }
    return { ok: false, state: d.status };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

if (require.main === module) {
  const dom = process.argv[2] || 'tamazia.co.uk';
  scan({ domain: dom }).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scan };
