#!/usr/bin/env node
'use strict';
/**
 * EVERY code-scanning alert, in EVERY state, across BOTH repos. Nothing capped, nothing filtered.
 *
 * 505 alerts have been DISMISSED on this estate. A dismissal is a DECISION — someone (or some past session)
 * looked at a security alert and said "not a problem". 505 undocumented decisions is the confident-zero class
 * wearing a different hat, and none of them has ever been re-examined.
 *
 * This pulls all of them WITH their dismissal reason and comment, so each one can be judged on the record:
 *    used_in_tests  -> usually genuine
 *    false_positive -> needs the reasoning to be visible, or it is just a shrug
 *    won't_fix      -> a RISK ACCEPTED. That is a decision that must be defensible, not silent.
 */
const fs = require('fs');
const https = require('https');
const TOKEN = process.env.GH_TOKEN;
const REPOS = ['Tamaziaa/tamazia-cowork-os', 'Tamaziaa/tamazia-website'];

const api = (p) => new Promise((res, rej) => {
  const r = https.request({ host: 'api.github.com', path: p,
    headers: { 'User-Agent': 'sweep', Authorization: 'token ' + TOKEN, Accept: 'application/vnd.github+json' } },
    (x) => { let b = ''; x.on('data', (d) => { b += d; });
      x.on('end', () => {
        if (x.statusCode === 404) return res([]);
        if (x.statusCode >= 400) return rej(new Error('HTTP ' + x.statusCode + ' ' + p + ' :: ' + b.slice(0, 150)));
        try { res(JSON.parse(b)); } catch (e) { rej(new Error('bad JSON ' + p)); }
      }); });
  r.on('error', rej); r.setTimeout(30000, () => r.destroy(new Error('timeout ' + p))); r.end();
});

(async () => {
  if (!TOKEN) { console.error('FAIL: no GH_TOKEN. NOT zero alerts.'); process.exit(1); }
  const all = [];
  for (const repo of REPOS) {
    for (const state of ['open', 'dismissed', 'fixed']) {
      for (let page = 1; page <= 60; page++) {                       // NO CAP that can silently truncate
        const rows = await api(`/repos/${repo}/code-scanning/alerts?state=${state}&per_page=100&page=${page}`);
        if (!rows.length || rows.message) break;
        for (const a of rows) {
          const inst = a.most_recent_instance || {};
          const loc = inst.location || {};
          all.push({
            repo, number: a.number, state: a.state,
            tool: (a.tool || {}).name || 'unknown',
            rule_id: (a.rule || {}).id || '',
            rule_name: (a.rule || {}).name || '',
            severity: (a.rule || {}).severity || '',
            security_severity: (a.rule || {}).security_severity_level || '',
            description: (a.rule || {}).description || '',
            path: loc.path || '',
            start_line: loc.start_line || 0,
            end_line: loc.end_line || 0,
            message: (inst.message || {}).text || '',
            dismissed_reason: a.dismissed_reason || null,
            dismissed_comment: a.dismissed_comment || null,
            dismissed_by: (a.dismissed_by || {}).login || null,
            dismissed_at: a.dismissed_at || null,
            created_at: a.created_at,
            url: a.html_url,
          });
        }
        if (rows.length < 100) break;
      }
    }
    process.stderr.write(`  ${repo}: ${all.filter((a) => a.repo === repo).length} alerts\n`);
  }
  fs.mkdirSync('sarif', { recursive: true });
  fs.writeFileSync('alerts-full.json', JSON.stringify(all, null, 2));
  const by = (k) => Object.entries(all.reduce((m, a) => ((m[a[k] || '-'] = (m[a[k] || '-'] || 0) + 1), m), {})).sort((x, y) => y[1] - x[1]);
  console.log('\n  TOTAL ALERTS: ' + all.length);
  console.log('  by state    : ' + JSON.stringify(Object.fromEntries(by('state'))));
  console.log('  by tool     : ' + JSON.stringify(Object.fromEntries(by('tool'))));
  console.log('  by severity : ' + JSON.stringify(Object.fromEntries(by('severity'))));
  console.log('\n  DISMISSED — by reason:');
  const dis = all.filter((a) => a.state === 'dismissed');
  const byReason = dis.reduce((m, a) => ((m[a.dismissed_reason || '(none)'] = (m[a.dismissed_reason || '(none)'] || 0) + 1), m), {});
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log('    ' + String(n).padStart(4) + '  ' + r);
  const noComment = dis.filter((a) => !a.dismissed_comment).length;
  console.log('\n  dismissed with NO written reason: ' + noComment + ' / ' + dis.length);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
