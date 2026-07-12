'use strict';
// E-260 — THE TRACKER ORACLE. Two open datasets, both commercially usable, refreshed weekly.
//
//   EasyPrivacy  (github.com/easylist/easylist) — dual GPL-3.0 / CC BY-SA 3.0. We take the CC BY-SA limb for the
//                DATA, which avoids the GPL question entirely. It is the tracker-domain oracle: what IS a tracker.
//   Open Cookie Database (jkwakman/Open-Cookie-Database) — APACHE-2.0. It is the PURPOSE oracle: what a given
//                cookie is FOR (essential / functional / analytics / advertising).
//
// DELIBERATELY NOT USED, and this is a real commercial trap that catches everyone:
//   * DuckDuckGo Tracker Radar  — data is CC BY-NC-SA. NONCOMMERCIAL. Tamazia charges money.
//   * Ghostery TrackerDB        — CC BY-NC-SA. Same problem.
//   * cookiedatabase.org        — CC BY-NC-ND. NonCommercial AND NoDerivatives.
// Using any of them in a paid audit would be a licence breach in a compliance product, which is not a mistake this
// company can afford to make.
const fs = require('fs');
const path = require('path');

const EASYPRIVACY = 'https://easylist.to/easylist/easyprivacy.txt';
const OPEN_COOKIE = 'https://raw.githubusercontent.com/jkwakman/Open-Cookie-Database/master/open-cookie-database.csv';

// Map Open Cookie DB categories onto the only distinction PECR actually cares about: is consent required.
// PECR reg.6(4): consent is NOT required only where the cookie is "strictly necessary" for a service the subscriber
// has explicitly requested. Analytics is NOT strictly necessary (ICO has said so repeatedly). Advertising certainly
// is not.
const CONSENT_REQUIRED = { Analytics: true, Marketing: true, Advertisement: true, Personalization: true, Functional: false, Necessary: false, Essential: false };

const splitCsv = (l) => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };

(async () => {
  const ua = { 'user-agent': 'TamaziaComplianceBot/1.0 (+https://tamazia.co.uk)' };

  // ---- tracker domains from EasyPrivacy ----
  const ep = await (await fetch(EASYPRIVACY, { headers: ua })).text();
  const domains = new Set();
  for (const line of ep.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('!') || l.startsWith('[')) continue;
    // ||tracker.example.com^  -> a third-party host rule. These are the unambiguous ones.
    const m = /^\|\|([a-z0-9.-]+\.[a-z]{2,})\^?/i.exec(l);
    if (m && !l.includes('$~third-party')) domains.add(m[1].toLowerCase());
  }

  // ---- cookie purposes from the Open Cookie Database ----
  const oc = (await (await fetch(OPEN_COOKIE, { headers: ua })).text()).split('\n');
  const head = splitCsv(oc[0]).map((h) => h.trim());
  const iName = head.findIndex((h) => /cookie.*key name|Cookie \/ Data Key name/i.test(h));
  const iCat = head.findIndex((h) => /^Category$/i.test(h));
  const iPlat = head.findIndex((h) => /^Platform$/i.test(h));
  const iDesc = head.findIndex((h) => /^Description$/i.test(h));
  const cookies = {};
  for (let i = 1; i < oc.length; i++) {
    const c = splitCsv(oc[i]); if (c.length < 3) continue;
    const nm = (c[iName] || '').trim(); if (!nm) continue;
    const cat = (c[iCat] || '').trim();
    cookies[nm.toLowerCase()] = {
      category: cat,
      consent_required: CONSENT_REQUIRED[cat] === true,
      platform: (c[iPlat] || '').trim().slice(0, 60),
      description: (c[iDesc] || '').trim().slice(0, 180),
    };
  }

  const out = {
    generated_at: new Date().toISOString(),
    sources: {
      tracker_domains: { name: 'EasyPrivacy', url: EASYPRIVACY, licence: 'CC BY-SA 3.0 (dual-licensed; we take the CC limb for the data)' },
      cookie_purposes: { name: 'Open Cookie Database', url: OPEN_COOKIE, licence: 'Apache-2.0' },
    },
    tracker_domains: [...domains].sort(),
    cookie_purposes: cookies,
  };
  const p = path.join(__dirname, '..', 'data', 'tracker-oracle.json');
  fs.writeFileSync(p, JSON.stringify(out));
  console.log('tracker domains : ' + domains.size.toLocaleString('en-GB'));
  console.log('cookie purposes : ' + Object.keys(cookies).length.toLocaleString('en-GB'));
  console.log('consent-required: ' + Object.values(cookies).filter((c) => c.consent_required).length.toLocaleString('en-GB'));
  console.log('written: ' + p + ' (' + (fs.statSync(p).size / 1e6).toFixed(2) + ' MB)');
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
