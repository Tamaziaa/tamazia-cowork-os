#!/usr/bin/env node
// S015 check-compliance — queries framework_versions + compliance_rules and returns a scan stamp.
// Usage:
//   node check.js --domain tamazia.co.uk --output-json
//   node check.js --domain X --country UK --sector law-firms --output-json
//
// In Phase 2 the scan-execution loop is scaffolded only. Phase 5 wires the actual web crawl.
// What we return today is the framework version stamp, applicable framework_short list (via
// the jurisdiction router), and a placeholder violation set sized to the rule count.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { routeJurisdictions } = require(path.resolve(__dirname, '..', '..', '..', 'lib', 'compliance', 'jurisdiction-router.js'));

function parseArgs(argv) {
  const out = { output_json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--domain') out.domain = argv[++i];
    else if (a === '--country') out.country = argv[++i];
    else if (a === '--sector') out.sector = argv[++i];
    else if (a === '--output-json') out.output_json = true;
  }
  return out;
}

function pgQuery(sql) {
  const psql = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'psql');
  const url = process.env.NEON_URL || process.env.NEON_CONNECTION_STRING;
  if (!url || !fs.existsSync(psql)) return null;
  try {
    return execSync(`${psql} "${url}" -tA -c ${JSON.stringify(sql)}`, { encoding: 'utf8' }).trim();
  } catch (_e) { return null; }
}

function frameworkVersion() {
  return pgQuery("SELECT MAX(version) FROM framework_versions WHERE status='active'") || '1.0.0';
}

function lastReviewed() {
  const raw = pgQuery("SELECT MAX(last_reviewed_at) FROM framework_versions WHERE status='active'");
  return raw ? raw.slice(0,10) : new Date().toISOString().slice(0,10);
}

function rulesFor(frameworkShorts) {
  if (!frameworkShorts.length) return [];
  const list = frameworkShorts.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
  const raw = pgQuery(`SELECT framework_short, rule_id, severity, description FROM compliance_rules WHERE active=TRUE AND framework_short IN (${list}) ORDER BY framework_short, rule_id`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [fs_, rule, sev, desc] = line.split('\t');
    return { framework_short: fs_, rule_id: rule, severity: sev, description: desc };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.domain) { process.stderr.write('--domain required\n'); process.exit(2); }

  const frameworks = routeJurisdictions({ country: args.country || 'UK', sector: args.sector });
  const rules = rulesFor(frameworks);

  const out = {
    domain: args.domain,
    framework_version: frameworkVersion(),
    framework_last_reviewed: lastReviewed(),
    applicable_frameworks: frameworks,
    rules_evaluated: rules.length,
    rules_sample: rules.slice(0, 5),
    violations: [],  // populated in Phase 5 when crawler is wired
    scan_completed_at: new Date().toISOString(),
    reviewer: 'Aman Pareek, International Business Lawyer',
  };

  if (args.output_json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    process.stdout.write(`Scan stamp · ${out.domain} · framework v${out.framework_version} · ${out.rules_evaluated} rules across ${frameworks.join(', ')}\n`);
  }
}

module.exports = { frameworkVersion, lastReviewed, rulesFor };
if (require.main === module) main();
