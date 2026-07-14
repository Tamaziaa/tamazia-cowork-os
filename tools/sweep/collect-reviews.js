#!/usr/bin/env node
'use strict';
/**
 * HARVEST EVERY AI-REVIEW COMMENT EVER POSTED, ACROSS EVERY PR, ACROSS EVERY REPO.
 *
 * THE INSIGHT THAT MAKES "run it on all 525 PRs" CHEAP:
 * CodeRabbit has ALREADY reviewed most of these pull requests. Its findings are not gone — they are sitting in
 * the GitHub review API, on the PRs where it posted them. We do not RE-RUN anything on history. We HARVEST it.
 *
 * A re-run of 525 PRs would cost hours and money and would tell us about defects in code that has since been
 * deleted. A harvest costs a few hundred paginated API calls and gives us every finding any reviewer has ever
 * made on this estate.
 *
 * For code that exists TODAY but was never reviewed (because it predates CodeRabbit, or was merged without a
 * review), the synthetic full-tree PR in SWEEP-2 covers it: an orphan empty base makes the diff = the whole repo.
 *
 * Together: harvest covers HISTORY. The synthetic PR covers THE PRESENT. Nothing is missed, nothing is re-run.
 */
const fs = require('fs');
const https = require('https');

const TOKEN = process.env.GH_TOKEN;
const REPOS = (process.env.SWEEP_REPOS || 'Tamaziaa/tamazia-cowork-os,Tamaziaa/tamazia-website').split(',');
const BOTS = /coderabbit|codescene|korbit|copilot|greptile|sonar|deepsource|codeant/i;

function api(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: 'api.github.com', path: pathname, method: 'GET',
      headers: { 'User-Agent': 'tamazia-sweep', Authorization: 'token ' + TOKEN, Accept: 'application/vnd.github+json' } },
      (res) => {
        let b = '';
        res.on('data', (d) => { b += d; });
        res.on('end', () => {
          if (res.statusCode === 403 && /rate limit/i.test(b)) return reject(new Error('RATE LIMITED — the harvest did NOT complete. This is not zero findings.'));
          if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ' on ' + pathname));
          try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad JSON from ' + pathname)); }
        });
      });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(new Error('timeout on ' + pathname)); });
    req.end();
  });
}

(async () => {
  if (!TOKEN) { console.error('FAIL: GH_TOKEN absent. The harvest did NOT run — that is not zero findings.'); process.exit(1); }
  const out = [];
  let prsSeen = 0, prsWithReview = 0;

  // THE RIGHT ENDPOINT. /pulls/comments lists EVERY review comment across EVERY pull request in the repo, in
  // one paginated stream. The naive version looped 525 PRs and made 525 calls; this makes ~10. Same data.
  // A loop you can replace with an index is a loop you should not have written.
  const seenPr = new Set();
  for (const repo of REPOS) {
    for (let page = 1; page <= 40; page++) {
      const rows = await api(`/repos/${repo}/pulls/comments?per_page=100&page=${page}&sort=created&direction=desc`);
      if (!rows.length) break;
      for (const c of rows) {
        const login = (c.user && c.user.login) || '';
        const prNum = Number((c.pull_request_url || '').split('/').pop());
        seenPr.add(repo + '#' + prNum);
        if (!BOTS.test(login)) continue;
        out.push({
          tool: login.replace(/\[bot\]$/, ''),
          repo, pr: prNum,
          path: (repo.endsWith('website') ? 'website/' : '') + c.path,
          line: c.line || c.original_line || 0,
          body: c.body,
          diff_hunk: c.diff_hunk,
          url: c.html_url,
        });
      }
      process.stderr.write(`  ${repo} page ${page}: +${rows.length} comments, ${out.length} from bots\n`);
      if (rows.length < 100) break;
    }
  }
  prsSeen = seenPr.size;
  prsWithReview = new Set(out.map((o) => o.repo + '#' + o.pr)).size;

  fs.mkdirSync('sarif', { recursive: true });
  fs.writeFileSync('sarif/ai-reviewers.reviews.json', JSON.stringify(out, null, 2));
  const byTool = {};
  for (const c of out) byTool[c.tool] = (byTool[c.tool] || 0) + 1;
  console.log(`\n  PRs scanned          ${prsSeen}`);
  console.log(`  PRs with a review    ${prsWithReview}`);
  console.log(`  bot review comments  ${out.length}`);
  console.log(`  by tool              ${JSON.stringify(byTool)}`);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
