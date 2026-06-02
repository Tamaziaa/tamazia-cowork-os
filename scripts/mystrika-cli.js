#!/usr/bin/env node
'use strict';
// Mystrika ops CLI. Usage: node scripts/mystrika-cli.js <workspaces|campaigns|summary <id>|status <id> <true|false>|test>
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'src', 'lib', 'mystrika', 'client.js'));
(async () => {
  if (!M._hasKey()) { console.log('No MYSTRIKA_API_KEY set (paste your tamazia-cowork-os token value).'); return; }
  const cmd = process.argv[2] || 'test';
  const a = process.argv.slice(3);
  let r;
  if (cmd === 'workspaces' || cmd === 'test') r = await M.listWorkspaces();
  else if (cmd === 'campaigns') r = await M.listCampaigns(a[0]);
  else if (cmd === 'summary') r = await M.campaignSummary(a[0]);
  else if (cmd === 'status') r = await M.setCampaignStatus(a[0], a[1] === 'true');
  else { console.log('unknown cmd'); return; }
  console.log(JSON.stringify(r, null, 2).slice(0, 1500));
})().catch(e => { console.error('cli error:', e.message); process.exit(0); });
