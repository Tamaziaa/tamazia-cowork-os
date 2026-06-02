'use strict';
// Mystrika inbound API client (live spec read from my.mystrika.com/settings/api 2026-06).
// Auth: Authorization: Bearer <MYSTRIKA_API_KEY>. Bases: api.mystrika.com (workspaces/campaigns/prospects),
// bulk.mystrika.com (prospects/add up to 500/call). Self-healing: retry w/ backoff, fail-soft, never throws.
const API = 'https://api.mystrika.com/api/v1';
const BULK = 'https://bulk.mystrika.com/api/v1';
function key() { return process.env.MYSTRIKA_API_KEY || ''; }
async function call(url, body, tries) {
  tries = tries == null ? 3 : tries;
  const k = key(); if (!k) return { ok: false, error: 'no_key', note: 'Set MYSTRIKA_API_KEY (your "tamazia-cowork-os" token value from my.mystrika.com/settings/api).' };
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k }, body: body ? JSON.stringify(body) : '{}', signal: ctl.signal });
      clearTimeout(t);
      const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (_) {}
      if (r.ok) return { ok: true, status: r.status, data: j != null ? j : txt };
      last = { ok: false, status: r.status, error: (txt || '').slice(0, 200) };
      if (r.status === 401 || r.status === 403) return last;
    } catch (e) { last = { ok: false, error: String(e.message || e) }; }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 600 * (i + 1)));
  }
  return last || { ok: false, error: 'unknown' };
}
async function get(url) {
  const k = key(); if (!k) return { ok: false, error: 'no_key' };
  try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k }, signal: ctl.signal }); clearTimeout(t);
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (_) {}
    return { ok: r.ok, status: r.status, data: j != null ? j : txt };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
const listWorkspaces = () => get(API + '/workspaces/list');
const listCampaigns = (workspace_id) => call(API + '/campaigns/list', workspace_id ? { workspace_id } : {});
const campaignSummary = (campaign_id, workspace_id) => call(API + '/campaigns/summary', { campaign_id, workspace_id });
const setCampaignStatus = (campaign_id, active, workspace_id) => call(API + '/campaigns/status', { campaign_id, active: !!active, workspace_id });
const listProspects = (campaign_id, workspace_id) => call(API + '/prospects/list', { campaign_id, workspace_id });
const searchProspect = (email, workspace_id) => call(API + '/prospects/search', { email, workspace_id });
const getProspect = (o) => call(API + '/prospects/detail', o);
const updateProspect = (o) => call(API + '/prospects/update', o);
async function addProspects(campaign_id, prospects, skip_duplicate) {
  const out = []; const arr = prospects || [];
  for (let i = 0; i < arr.length; i += 500) {
    const chunk = arr.slice(i, i + 500);
    out.push(await call(BULK + '/prospects/add', { campaign_id, skip_duplicate: skip_duplicate !== false, prospects: chunk }));
  }
  const okCount = out.filter(r => r.ok).length;
  return { ok: okCount === out.length && out.length > 0, batches: out.length, ok_batches: okCount, added: arr.length, results: out };
}
const STATUSES = ['replied', 'contacted', 'out_of_office', 'interested', 'not_interested', 'meeting_booked', 'meeting_missed', 'closed', 'wrong_person', 'unsubscribed'];
module.exports = { listWorkspaces, listCampaigns, campaignSummary, setCampaignStatus, listProspects, searchProspect, getProspect, updateProspect, addProspects, STATUSES, _hasKey: () => !!key() };
