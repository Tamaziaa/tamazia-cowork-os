#!/usr/bin/env node
'use strict';
/**
 * CODE-SCANNING ALERTS -> SARIF.
 *
 * CodeQL has already analysed this estate on every push, and GitHub STORES every alert it has ever raised —
 * open, fixed and dismissed. Re-running the CodeQL CLI would take ~20 minutes per repo to recompute something
 * GitHub is already holding. So: harvest.
 *
 * We take OPEN alerts (the defects that still exist) and also count FIXED/DISMISSED, because the ratio is itself
 * a finding: a high dismissed count means someone has been waving alerts through.
 */
const fs = require('fs');
const https = require('https');
const TOKEN = process.env.GH_TOKEN;
const REPOS = (process.env.SWEEP_REPOS || 'Tamaziaa/tamazia-cowork-os,Tamaziaa/tamazia-website').split(',');

const api = (p) => new Promise((res, rej) => {
  const r = https.request({ host: 'api.github.com', path: p, headers: { 'User-Agent': 'sweep', Authorization: 'token ' + TOKEN, Accept: 'application/vnd.github+json' } }, (x) => {
    let b = ''; x.on('data', (d) => { b += d; });
    x.on('end', () => {
      if (x.statusCode === 404) return res([]);                       // code scanning not enabled on this repo
      if (x.statusCode >= 400) return rej(new Error('HTTP ' + x.statusCode + ' ' + p + ' :: ' + b.slice(0, 120)));
      try { res(JSON.parse(b)); } catch (e) { rej(e); }
    });
  });
  r.on('error', rej); r.setTimeout(25000, () => r.destroy(new Error('timeout'))); r.end();
});

(async () => {
  if (!TOKEN) { console.error('FAIL: GH_TOKEN absent. This is NOT zero alerts.'); process.exit(1); }
  const results = [];
  const stats = {};
  for (const repo of REPOS) {
    for (const state of ['open', 'fixed', 'dismissed']) {
      let n = 0;
      for (let page = 1; page <= 10; page++) {
        const rows = await api(`/repos/${repo}/code-scanning/alerts?state=${state}&per_page=100&page=${page}`);
        if (!rows.length || rows.message) break;
        n += rows.length;
        if (state === 'open') {
          for (const a of rows) {
            const loc = (a.most_recent_instance || {}).location || {};
            results.push({
              ruleId: (a.rule || {}).id || 'unknown',
              level: ({ error: 'error', warning: 'warning', note: 'note' })[(a.rule || {}).severity] || 'warning',
              message: { text: ((a.rule || {}).description || (a.rule || {}).name || '') },
              locations: [{ physicalLocation: {
                artifactLocation: { uri: (repo.endsWith('website') ? 'website/' : '') + (loc.path || '') },
                region: { startLine: loc.start_line || 0, endLine: loc.end_line || 0,
                  snippet: { text: ((a.most_recent_instance || {}).message || {}).text || '' } },
              } }],
              _tool: ((a.tool || {}).name) || 'CodeQL',
            });
          }
        }
        if (rows.length < 100) break;
      }
      stats[repo + ':' + state] = n;
    }
  }
  // group by the tool that produced them (CodeQL vs uploaded Semgrep)
  const byTool = {};
  for (const r of results) { const t = r._tool; (byTool[t] = byTool[t] || []).push(r); delete r._tool; }
  fs.mkdirSync('sarif', { recursive: true });
  for (const [tool, res] of Object.entries(byTool)) {
    fs.writeFileSync('sarif/' + tool.toLowerCase().replace(/\W+/g, '-') + '-alerts.sarif', JSON.stringify({
      version: '2.1.0', runs: [{ tool: { driver: { name: tool, rules: [] } }, results: res }],
    }, null, 2));
  }
  console.log('  alert counts: ' + JSON.stringify(stats));
  console.log('  OPEN alerts by tool: ' + JSON.stringify(Object.fromEntries(Object.entries(byTool).map(([k, v]) => [k, v.length]))));
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
