// Hunter.io · domain search + email finder + email verifier
// Replaces pattern + SMTP probe with real Hunter API (25 search + 50 verifications free/mo)

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');
const API = 'https://api.hunter.io/v2';

function key() { return process.env.HUNTER_KEY || ''; }

async function domainSearch(domain, opts = {}) {
  if (!key()) return { ok: false, error: 'no_hunter_key' };
  const url = `${API}/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key()}&limit=${opts.limit || 25}`;
  const r = await fetchWithRetry(url, { timeout: 15000, retries: 1 });
  if (!r.ok) return { ok: false, status: r.status, error: r.body?.slice(0, 200) };
  try {
    const json = JSON.parse(r.body);
    const data = json.data || {};
    return {
      ok: true,
      domain: data.domain,
      organization: data.organization,
      country: data.country,
      industry: data.industry,
      pattern: data.pattern, // e.g. {first}.{last}
      emails: (data.emails || []).map(e => ({
        email: e.value,
        type: e.type, // 'personal' | 'generic'
        confidence: e.confidence,
        first_name: e.first_name,
        last_name: e.last_name,
        position: e.position,
        seniority: e.seniority,
        department: e.department,
        linkedin: e.linkedin,
        twitter: e.twitter,
        sources: e.sources?.length || 0
      })),
      total_emails: data.emails?.length || 0,
      remaining_requests: json.meta?.params?.requests_left || null
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function emailFinder({ first_name, last_name, domain }) {
  if (!key()) return { ok: false, error: 'no_hunter_key' };
  const url = `${API}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(first_name)}&last_name=${encodeURIComponent(last_name)}&api_key=${key()}`;
  const r = await fetchWithRetry(url, { timeout: 15000, retries: 1 });
  if (!r.ok) return { ok: false, status: r.status };
  try {
    const json = JSON.parse(r.body);
    const data = json.data || {};
    return {
      ok: true,
      email: data.email,
      confidence: data.score, // 0-100
      sources: data.sources?.length || 0,
      position: data.position,
      verification: data.verification?.status
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function emailVerify(email) {
  if (!key()) return { ok: false, error: 'no_hunter_key' };
  const url = `${API}/email-verifier?email=${encodeURIComponent(email)}&api_key=${key()}`;
  const r = await fetchWithRetry(url, { timeout: 15000, retries: 1 });
  if (!r.ok) return { ok: false, status: r.status };
  try {
    const json = JSON.parse(r.body);
    const data = json.data || {};
    return {
      ok: true,
      email,
      result: data.status, // 'deliverable' | 'undeliverable' | 'risky' | 'unknown'
      score: data.score,
      regexp: data.regexp,
      gibberish: data.gibberish,
      disposable: data.disposable,
      webmail: data.webmail,
      mx_records: data.mx_records,
      smtp_server: data.smtp_server,
      smtp_check: data.smtp_check,
      accept_all: data.accept_all,
      block: data.block,
      sources_count: data.sources?.length || 0
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function checkAccount() {
  if (!key()) return { ok: false, error: 'no_hunter_key' };
  const r = await fetchWithRetry(`${API}/account?api_key=${key()}`, { timeout: 10000 });
  if (!r.ok) return { ok: false };
  try {
    const json = JSON.parse(r.body);
    return { ok: true, ...json.data };
  } catch (_e) { return { ok: false }; }
}

module.exports = { domainSearch, emailFinder, emailVerify, checkAccount };

if (require.main === module) {
  (async () => {
    console.log('=== Hunter account ===');
    console.log(JSON.stringify(await checkAccount(), null, 2));
    console.log('=== Domain search mishcon.com ===');
    const r = await domainSearch('mishcon.com');
    console.log('Total emails:', r.total_emails, 'Pattern:', r.pattern);
    console.log('Top 3 contacts:', JSON.stringify(r.emails?.slice(0, 3), null, 2));
  })();
}
