#!/usr/bin/env node
'use strict';
// Push the Tamazia roadmap into Plane as issues. Key is validated + saved; the only input the Plane API can't
// self-discover is the WORKSPACE SLUG (from your app.plane.so/<slug> URL) — set PLANE_WORKSPACE_SLUG and run.
// Creates (or reuses) a "Tamazia Roadmap" project, then upserts one issue per phase item. Fail-soft + idempotent.
const KEY = process.env.PLANE_API_KEY;
const SLUG = process.env.PLANE_WORKSPACE_SLUG;
const BASE = 'https://api.plane.so/api/v1';
async function api(method, path, body) {
  try {
    const r = await fetch(BASE + path, { method, headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, json: j };
  } catch (e) { return { status: 0, error: String(e.message || e) }; }
}
// The current roadmap (phases P4-P8). Edit/extend freely.
const ITEMS = [
  ['P4.6 PostHog audit analytics', 'Server-side capture from the audit Worker; funnel sent->opened->booked.'],
  ['P4.7 Scraper system', 'JobSpy (6 boards incl. LinkedIn) + Maps via SERPER, gated pipeline, daily rotation. DONE.'],
  ['P5 Data-viz', 'Premium charts: graduated radar, gradients, vertex dots, trajectory, full labels. DONE.'],
  ['P6 Wiring + quality', 'Inventory, spell-cog fix, no-city fallback, perf guard, disclaimer. DONE.'],
  ['P7 Mystrika automation', 'Inspect /settings/api + n8n JSON + playlist; build bulk-add + reply-sync.'],
  ['P8 Ops + QA', 'Cron health, eval harness (zero false positives), rollback discipline, sign-off.'],
];
(async () => {
  if (!KEY) { console.log('No PLANE_API_KEY.'); return; }
  const me = await api('GET', '/users/me/');
  if (me.status !== 200) { console.log('Plane key invalid (status ' + me.status + ').'); return; }
  console.log('Plane account OK: ' + (me.json && me.json.email));
  if (!SLUG) { console.log('Set PLANE_WORKSPACE_SLUG (from your app.plane.so/<slug> URL) to push the roadmap. Script is ready.'); return; }
  // find or create the project
  let proj = null;
  const list = await api('GET', '/workspaces/' + SLUG + '/projects/');
  if (list.status === 200 && Array.isArray(list.json && (list.json.results || list.json))) {
    const arr = list.json.results || list.json; proj = arr.find(p => /tamazia roadmap/i.test(p.name || ''));
  }
  if (!proj) {
    const c = await api('POST', '/workspaces/' + SLUG + '/projects/', { name: 'Tamazia Roadmap', identifier: 'TAM' });
    if (c.status >= 200 && c.status < 300) proj = c.json; else { console.log('Project create failed: ' + c.status + ' ' + JSON.stringify(c.json).slice(0, 160)); return; }
  }
  console.log('Project: ' + (proj && proj.name) + ' (' + (proj && proj.id) + ')');
  let created = 0;
  for (const [name, desc] of ITEMS) {
    const r = await api('POST', '/workspaces/' + SLUG + '/projects/' + proj.id + '/issues/', { name, description_html: '<p>' + desc + '</p>' });
    if (r.status >= 200 && r.status < 300) created++; else console.log('  issue "' + name + '" -> ' + r.status);
  }
  console.log('Pushed ' + created + '/' + ITEMS.length + ' roadmap issues to Plane.');
})().catch(e => { console.error('plane-sync error (non-fatal):', e.message); process.exit(0); });
